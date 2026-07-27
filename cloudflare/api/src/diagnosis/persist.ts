import { nowISO } from "../runtime";
import type {
  BaselineMethod,
  ComparisonType,
  ConfidenceLevel,
  DiagnosisRunResult,
  DiagnosisStatus,
  Platform,
  StageHealth,
  StageValueState,
} from "./types";

/**
 * Persistence for a diagnosis run.
 *
 * One row per run, created at enqueue and carried through
 * queued -> running -> succeeded/failed. Nothing here ever inserts a second
 * diagnosis_runs row: doing so is what left every app permanently stuck behind
 * the "one outstanding run per app" guard.
 */

/**
 * Writes the completed run and its derived output in a single atomic batch.
 *
 * The previous run's evidence/insights/actions are only removed inside this
 * batch, so a failed run leaves the last valid result untouched.
 */
export async function persistDiagnosisRun(
  db: D1Database,
  runId: string,
  workspaceId: string,
  appId: string,
  result: DiagnosisRunResult,
): Promise<void> {
  const now = nowISO();
  const primaryInsight = result.insights.find((i) => i.rank === 1);
  const primaryInsightId = primaryInsight?.id ?? null;

  const statements: D1PreparedStatement[] = [];

  // 1. Close out the run row this worker owns. The queue lifecycle status and
  //    the product-facing outcome are recorded separately so a successful run
  //    that found nothing is not mistaken for a run that produced advice.
  statements.push(
    db
      .prepare(
        `UPDATE diagnosis_runs
            SET status='succeeded',
                outcome=?,
                platform=?,
                diagnosis_version=?,
                input_hash=?,
                insight_count=?,
                evidence_count=?,
                primary_insight_id=?,
                limitations=?,
                missing_requirements=?,
                error_code=NULL,
                last_error_code=NULL,
                locked_at=NULL,
                completed_at=?,
                updated_at=?
          WHERE id=? AND workspace_id=? AND app_id=?`,
      )
      .bind(
        result.status,
        result.platform,
        result.version,
        result.inputHash,
        result.insights.length,
        result.evidence.length,
        primaryInsightId,
        JSON.stringify(result.limitations),
        JSON.stringify(result.missingRequirements),
        now,
        now,
        runId,
        workspaceId,
        appId,
      ),
  );

  // 2. Replace the previous derived result for this app.
  statements.push(
    db
      .prepare(`DELETE FROM action_proposals WHERE workspace_id=? AND app_id=?`)
      .bind(workspaceId, appId),
  );
  statements.push(
    db.prepare(`DELETE FROM insights WHERE workspace_id=? AND app_id=?`).bind(workspaceId, appId),
  );
  statements.push(
    db.prepare(`DELETE FROM evidence WHERE workspace_id=? AND app_id=?`).bind(workspaceId, appId),
  );
  statements.push(
    db
      .prepare(`DELETE FROM diagnosis_stages WHERE workspace_id=? AND app_id=?`)
      .bind(workspaceId, appId),
  );

  // 3. Evidence first: an insight may not exist without it.
  for (const item of result.evidence) {
    statements.push(
      db
        .prepare(
          `INSERT INTO evidence(
             id,workspace_id,app_id,provider,title,finding,metric_keys,
             window_from,window_to,confidence,before_value,after_value,
             calculation_version,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          item.id,
          workspaceId,
          appId,
          item.provider,
          item.title,
          item.finding,
          JSON.stringify(item.metricKeys),
          item.windowFrom,
          item.windowTo,
          item.confidence,
          JSON.stringify(item.before),
          JSON.stringify(item.after),
          result.version,
          now,
        ),
    );
  }

  // 4. Stage verdicts, so growth-map can return real health instead of
  //    recomputing an "unknown" of its own.
  result.stages.forEach((stage, position) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO diagnosis_stages(
             id,run_id,workspace_id,app_id,stage_id,label,position,value,
             value_state,formatted_value,conversion_rate,health,source,
             flow_width,benchmark,baseline_method,baseline_window_from,
             baseline_window_to,comparison_type,ratio_comparison_type,
             readiness_reason,sample_size,confidence,evidence_ids,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          `${runId}:${stage.id}`,
          runId,
          workspaceId,
          appId,
          stage.id,
          stage.label,
          position,
          stage.value,
          stage.valueState,
          stage.formattedValue,
          stage.conversionRate,
          stage.health,
          stage.source,
          stage.flowWidth,
          stage.benchmark ?? null,
          stage.baselineMethod,
          stage.baselineWindow?.from ?? null,
          stage.baselineWindow?.to ?? null,
          stage.comparisonType,
          stage.ratioComparisonType,
          stage.readinessReason ?? null,
          stage.sampleSize ?? null,
          stage.confidence,
          JSON.stringify(stage.evidenceIds),
          now,
        ),
    );
  });

  for (const item of result.insights) {
    statements.push(
      db
        .prepare(
          `INSERT INTO insights(
             id,workspace_id,app_id,title,summary,kind,stage_id,
             evidence_ids,confidence,impact,effort,rank,
             diagnosis_version,created_at
           ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          item.id,
          workspaceId,
          appId,
          item.title,
          item.summary,
          item.kind,
          item.stageId,
          JSON.stringify(item.evidenceIds),
          item.confidence,
          item.impact,
          item.effort,
          item.rank,
          result.version,
          now,
        ),
    );
  }

  for (const item of result.actionProposals) {
    statements.push(
      db
        .prepare(
          `INSERT INTO action_proposals(
             id,workspace_id,app_id,insight_id,title,rationale,
             experiment_template,status,external_mutation_allowed,
             structured_plan,created_at,updated_at
           ) VALUES(?,?,?,?,?,?,?,?,0,?,?,?)`,
        )
        .bind(
          item.id,
          workspaceId,
          appId,
          item.insightId,
          item.title,
          item.rationale,
          item.experimentTemplate,
          item.status,
          JSON.stringify(item.actionPlan),
          now,
          now,
        ),
    );
  }

  await db.batch(statements);
}

/**
 * Records a skipped run: the input hash matched a recent successful run, so
 * nothing was recomputed and the previous derived result stands.
 */
export async function completeDebouncedRun(
  db: D1Database,
  runId: string,
  workspaceId: string,
  appId: string,
  outcome: DiagnosisStatus,
  inputHash: string,
): Promise<void> {
  const now = nowISO();
  await db
    .prepare(
      `UPDATE diagnosis_runs
          SET status='succeeded',outcome=?,input_hash=?,locked_at=NULL,
              error_code=NULL,last_error_code=NULL,completed_at=?,updated_at=?
        WHERE id=? AND workspace_id=? AND app_id=?`,
    )
    .bind(outcome, inputHash, now, now, runId, workspaceId, appId)
    .run();
}

/**
 * Marks a run failed or scheduled for retry.
 *
 * `errorCode` is a stable code from the engine's own vocabulary — never an
 * exception message, which would leak internal detail into the API surface.
 */
export async function failDiagnosisRun(
  db: D1Database,
  runId: string,
  workspaceId: string,
  errorCode: string,
  options: { retry: boolean; runAfter: string },
): Promise<void> {
  const now = nowISO();
  await db
    .prepare(
      `UPDATE diagnosis_runs
          SET status=?,outcome=?,error_code=?,last_error_code=?,
              run_after=?,locked_at=NULL,completed_at=?,updated_at=?
        WHERE id=? AND workspace_id=?`,
    )
    .bind(
      options.retry ? "retrying" : "failed",
      options.retry ? "queued" : "failed",
      errorCode,
      errorCode,
      options.runAfter,
      options.retry ? null : now,
      now,
      runId,
      workspaceId,
    )
    .run();
}

export interface PersistedStage {
  stageId: string;
  label: string;
  position: number;
  value: number;
  valueState: StageValueState;
  formattedValue: string;
  conversionRate: number | null;
  health: StageHealth;
  source: string;
  flowWidth: number;
  benchmark: number | null;
  baselineMethod: BaselineMethod;
  baselineWindow: { from: string; to: string } | null;
  comparisonType: ComparisonType;
  ratioComparisonType: ComparisonType;
  readinessReason: string | null;
  sampleSize: number | null;
  confidence: ConfidenceLevel;
  evidenceIds: string[];
}

export interface LatestDiagnosisRun {
  id: string;
  /** Queue lifecycle status. */
  status: string;
  /** Product-facing outcome; the only value that belongs in the API contract. */
  outcome: DiagnosisStatus;
  platform: Platform;
  generatedAt: string;
  completedAt: string | null;
  version: string | null;
  inputHash: string | null;
  primaryInsightId: string | null;
  errorCode: string | null;
  limitations: string[];
  missingRequirements: string[];
  insightCount: number;
}

interface DiagnosisRunRow {
  id: string;
  status: string;
  outcome: string | null;
  platform: string | null;
  created_at: string;
  completed_at: string | null;
  diagnosis_version: string | null;
  input_hash: string | null;
  primary_insight_id: string | null;
  error_code: string | null;
  last_error_code: string | null;
  limitations: string | null;
  missing_requirements: string | null;
  insight_count: number | null;
}

const RUN_COLUMNS = `id,status,outcome,platform,created_at,completed_at,
        diagnosis_version,input_hash,primary_insight_id,error_code,
        last_error_code,limitations,missing_requirements,insight_count`;

function mapRun(row: DiagnosisRunRow): LatestDiagnosisRun {
  return {
    id: row.id,
    status: row.status,
    outcome: toDiagnosisStatus(row.outcome, row.status),
    platform: row.platform === "Web" ? "Web" : "iOS",
    generatedAt: row.created_at,
    completedAt: row.completed_at,
    version: row.diagnosis_version,
    inputHash: row.input_hash,
    primaryInsightId: row.primary_insight_id,
    errorCode: row.error_code ?? row.last_error_code,
    limitations: safeParseJSON<string[]>(row.limitations, []),
    missingRequirements: safeParseJSON<string[]>(row.missing_requirements, []),
    insightCount: Number(row.insight_count ?? 0),
  };
}

/**
 * Maps a stored run to a value that is actually a member of DiagnosisStatus.
 *
 * The queue lifecycle vocabulary ('succeeded', 'retrying') is not part of the
 * API contract, so it never leaks: a succeeded run with no recorded outcome
 * predates 0008 and is reported as `not_ready` rather than invented as ready.
 */
export function toDiagnosisStatus(
  outcome: string | null | undefined,
  lifecycleStatus: string,
): DiagnosisStatus {
  const valid: DiagnosisStatus[] = [
    "not_ready",
    "queued",
    "running",
    "ready",
    "no_confirmed_issue",
    "failed",
  ];
  if (outcome && (valid as string[]).includes(outcome)) {
    return outcome as DiagnosisStatus;
  }
  if (lifecycleStatus === "running") return "running";
  if (lifecycleStatus === "queued" || lifecycleStatus === "retrying") return "queued";
  if (lifecycleStatus === "failed") return "failed";
  return "not_ready";
}

export async function getLatestDiagnosisRun(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<LatestDiagnosisRun | null> {
  const row = await db
    .prepare(
      `SELECT ${RUN_COLUMNS}
         FROM diagnosis_runs
        WHERE workspace_id=? AND app_id=?
        ORDER BY created_at DESC
        LIMIT 1`,
    )
    .bind(workspaceId, appId)
    .first<DiagnosisRunRow>();

  return row ? mapRun(row) : null;
}

/**
 * The most recent run that actually produced a verdict.
 *
 * Used so a transient failure or an in-flight run never hides the last valid
 * diagnosis from the product.
 */
export async function getCurrentDiagnosis(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<{ run: LatestDiagnosisRun; stages: PersistedStage[] } | null> {
  const row = await db
    .prepare(
      `SELECT ${RUN_COLUMNS}
         FROM diagnosis_runs
        WHERE workspace_id=? AND app_id=? AND status='succeeded'
        ORDER BY COALESCE(completed_at, created_at) DESC
        LIMIT 1`,
    )
    .bind(workspaceId, appId)
    .first<DiagnosisRunRow>();

  if (!row) return null;

  const stageRows = await db
    .prepare(
      `SELECT stage_id,label,position,value,value_state,formatted_value,
              conversion_rate,health,source,flow_width,benchmark,
              baseline_method,baseline_window_from,baseline_window_to,
              comparison_type,ratio_comparison_type,readiness_reason,
              sample_size,confidence,evidence_ids
         FROM diagnosis_stages
        WHERE workspace_id=? AND app_id=? AND run_id=?
        ORDER BY position`,
    )
    .bind(workspaceId, appId, row.id)
    .all<{
      stage_id: string;
      label: string;
      position: number;
      value: number;
      value_state: string;
      formatted_value: string;
      conversion_rate: number | null;
      health: string;
      source: string;
      flow_width: number;
      benchmark: number | null;
      baseline_method: string;
      baseline_window_from: string | null;
      baseline_window_to: string | null;
      comparison_type: string;
      ratio_comparison_type: string | null;
      readiness_reason: string | null;
      sample_size: number | null;
      confidence: string;
      evidence_ids: string | null;
    }>();

  return {
    run: mapRun(row),
    stages: stageRows.results.map((stage) => ({
      stageId: stage.stage_id,
      label: stage.label,
      position: Number(stage.position),
      value: Number(stage.value),
      valueState: stage.value_state as StageValueState,
      formattedValue: stage.formatted_value,
      conversionRate:
        stage.conversion_rate === null ? null : Number(stage.conversion_rate),
      health: stage.health as StageHealth,
      source: stage.source,
      flowWidth: Number(stage.flow_width),
      benchmark: stage.benchmark === null ? null : Number(stage.benchmark),
      baselineMethod: stage.baseline_method as BaselineMethod,
      baselineWindow:
        stage.baseline_window_from && stage.baseline_window_to
          ? { from: stage.baseline_window_from, to: stage.baseline_window_to }
          : null,
      comparisonType: stage.comparison_type as ComparisonType,
      ratioComparisonType: (stage.ratio_comparison_type ??
        "not_comparable") as ComparisonType,
      readinessReason: stage.readiness_reason,
      sampleSize: stage.sample_size === null ? null : Number(stage.sample_size),
      confidence: stage.confidence as ConfidenceLevel,
      evidenceIds: safeParseJSON<string[]>(stage.evidence_ids, []),
    })),
  };
}

function safeParseJSON<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

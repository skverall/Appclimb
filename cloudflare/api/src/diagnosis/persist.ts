import { nowISO } from "../runtime";
import type { DiagnosisRunResult } from "./types";

export async function persistDiagnosisRun(
  db: D1Database,
  workspaceId: string,
  appId: string,
  result: DiagnosisRunResult,
): Promise<void> {
  const now = nowISO();
  const runId = crypto.randomUUID();

  // Find primary insight ID if any exists
  const primaryInsight = result.insights.find((i) => i.rank === 1);
  const primaryInsightId = primaryInsight?.id ?? null;

  const statements: D1PreparedStatement[] = [];

  // 1. Record completed diagnosis run
  statements.push(
    db
      .prepare(
        `INSERT INTO diagnosis_runs(
           id,workspace_id,app_id,status,diagnosis_version,input_hash,
           insight_count,evidence_count,primary_insight_id,limitations,
           missing_requirements,attempt,max_attempts,run_after,updated_at,created_at
         ) VALUES(?,?,?,'succeeded',?,?,?,?,?,?,?,1,1,?,?,?)`,
      )
      .bind(
        runId,
        workspaceId,
        appId,
        result.version,
        result.inputHash,
        result.insights.length,
        result.evidence.length,
        primaryInsightId,
        JSON.stringify(result.limitations),
        JSON.stringify(result.missingRequirements),
        now,
        now,
        now,
      ),
  );

  // 2. Clear old evidence, insights, action_proposals for this workspace and app
  statements.push(
    db.prepare(`DELETE FROM action_proposals WHERE workspace_id=? AND app_id=?`).bind(workspaceId, appId),
  );
  statements.push(
    db.prepare(`DELETE FROM insights WHERE workspace_id=? AND app_id=?`).bind(workspaceId, appId),
  );
  statements.push(
    db.prepare(`DELETE FROM evidence WHERE workspace_id=? AND app_id=?`).bind(workspaceId, appId),
  );

  // 3. Insert new Evidence items
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

  // 4. Insert new Insights
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

  // 5. Insert new Action Proposals
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

  // Batch execute all statements atomically
  await db.batch(statements);
}

export async function getLatestDiagnosisRun(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<{
  id: string;
  status: string;
  generatedAt: string;
  version: string | null;
  inputHash: string | null;
  primaryInsightId: string | null;
  limitations: string[];
  missingRequirements: string[];
} | null> {
  const row = await db
    .prepare(
      `SELECT id,status,created_at,diagnosis_version,input_hash,
              primary_insight_id,limitations,missing_requirements
       FROM diagnosis_runs
       WHERE workspace_id=? AND app_id=?
       ORDER BY created_at DESC
       LIMIT 1`,
    )
    .bind(workspaceId, appId)
    .first<{
      id: string;
      status: string;
      created_at: string;
      diagnosis_version: string | null;
      input_hash: string | null;
      primary_insight_id: string | null;
      limitations: string | null;
      missing_requirements: string | null;
    }>();

  if (!row) return null;

  return {
    id: row.id,
    status: row.status,
    generatedAt: row.created_at,
    version: row.diagnosis_version,
    inputHash: row.input_hash,
    primaryInsightId: row.primary_insight_id,
    limitations: safeParseJSON<string[]>(row.limitations, []),
    missingRequirements: safeParseJSON<string[]>(row.missing_requirements, []),
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

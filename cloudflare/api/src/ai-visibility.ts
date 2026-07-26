import { ProviderError } from "./connectors";
import { audit, isEntitled, workspaceFor } from "./db";
import { sha256 } from "./crypto";
import { log, nowISO, requireSecret } from "./runtime";
import type { AuthContext } from "./types";

export const AI_VISIBILITY_MODEL = "deepseek-v4-flash";
const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
const FREE_PROMPT_LIMIT = 3;
const PRO_PROMPT_LIMIT = 25;
const PRO_DAILY_SCAN_LIMIT = 3;
const MAX_ANSWER_LENGTH = 12_000;

export type AiPromptCategory = "discovery" | "comparison" | "branded";

export interface AiVisibilityMessage {
  type: "ai-visibility-scan";
  scanId: string;
  workspaceId: string;
  appId: string;
}

interface AppRow {
  id: string;
  name: string;
  apple_app_id: string | null;
  default_storefront: string;
}

interface PromptRow {
  id: string;
  category: AiPromptCategory;
  prompt: string;
  active: number;
  created_at: string;
}

interface ScanRow {
  id: string;
  workspace_id: string;
  app_id: string;
  provider: "deepseek";
  model: string;
  trigger_type: "manual" | "scheduled";
  status: "queued" | "running" | "succeeded" | "failed" | "retrying";
  prompt_count: number;
  mention_count: number;
  best_position: number | null;
  attempt: number;
  max_attempts: number;
  run_after: string;
  started_at: string | null;
  completed_at: string | null;
  last_error_code: string | null;
  created_at: string;
  updated_at: string;
}

interface ResultRow {
  id: string;
  scan_id: string;
  prompt_id: string;
  answer: string;
  evidence_excerpt: string;
  mentioned: number;
  position: number | null;
  created_at: string;
}

interface DeepSeekEnvelope {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

async function ownedApp(
  db: D1Database,
  workspaceId: string,
  appId: string,
): Promise<AppRow> {
  const row = await db
    .prepare(
      `SELECT id,name,apple_app_id,default_storefront
       FROM apps WHERE id=? AND workspace_id=?`,
    )
    .bind(appId, workspaceId)
    .first<AppRow>();
  if (!row) throw new ProviderError("app_not_found", 404);
  return row;
}

async function paidAccess(
  db: D1Database,
  auth: AuthContext,
): Promise<boolean> {
  const workspace = await workspaceFor(db, auth.userId, auth.workspaceId);
  return Boolean(workspace && isEntitled(workspace));
}

function cleanPrompt(value: string): string {
  const prompt = value.trim().replace(/\s+/gu, " ");
  if (prompt.length < 8 || prompt.length > 500) {
    throw new ProviderError("invalid_ai_visibility_prompt", 400);
  }
  return prompt;
}

function cleanCategory(value: string): AiPromptCategory {
  if (value === "discovery" || value === "comparison" || value === "branded") {
    return value;
  }
  throw new ProviderError("invalid_ai_visibility_category", 400);
}

export function defaultAiVisibilityPrompts(
  appName: string,
  keyword?: string,
): Array<{ category: AiPromptCategory; prompt: string }> {
  const name = appName.trim().slice(0, 120);
  const discoveryTopic =
    keyword?.trim().replace(/\s+/gu, " ").slice(0, 80) ||
    name
      .replace(/\s*[:–—-]\s*.*$/u, "")
      .trim()
      .toLocaleLowerCase();
  return [
    {
      category: "discovery",
      prompt: `What are the best iPhone apps for ${discoveryTopic}?`,
    },
    {
      category: "comparison",
      prompt: `How does ${name} compare with its main iPhone app alternatives?`,
    },
    {
      category: "branded",
      prompt: `Is ${name} a good iPhone app, and who is it for?`,
    },
  ];
}

export async function setupAiVisibility(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  if (!app.apple_app_id) {
    throw new ProviderError("app_store_app_required", 409);
  }
  const keyword = await env.DB.prepare(
    `SELECT keyword FROM keyword_tracks
     WHERE workspace_id=? AND app_id=? AND active=1
     ORDER BY created_at LIMIT 1`,
  )
    .bind(auth.workspaceId, appId)
    .first<{ keyword: string }>();
  const prompts = defaultAiVisibilityPrompts(app.name, keyword?.keyword);
  const now = nowISO();
  const statements = [
    env.DB.prepare(
      `INSERT INTO ai_visibility_settings(
        id,workspace_id,app_id,provider,model,cadence,created_at,updated_at
       ) VALUES(?,?,?,'deepseek',?,'manual',?,?)
       ON CONFLICT(app_id) DO NOTHING`,
    ).bind(
      crypto.randomUUID(),
      auth.workspaceId,
      appId,
      AI_VISIBILITY_MODEL,
      now,
      now,
    ),
    ...prompts.map(({ category, prompt }) =>
      env.DB.prepare(
        `INSERT INTO ai_visibility_prompts(
          id,workspace_id,app_id,category,prompt,active,created_at,updated_at
         ) VALUES(?,?,?,?,?,1,?,?)
         ON CONFLICT(app_id,prompt) DO UPDATE SET active=1,updated_at=excluded.updated_at`,
      ).bind(
        crypto.randomUUID(),
        auth.workspaceId,
        appId,
        category,
        prompt,
        now,
        now,
      ),
    ),
  ];
  await env.DB.batch(statements);
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "ai_visibility.configured",
    "app",
    appId,
    { provider: "deepseek", promptCount: prompts.length },
  );
  return aiVisibilitySnapshot(env, auth, appId);
}

export async function addAiVisibilityPrompt(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  categoryValue: string,
  promptValue: string,
) {
  await ownedApp(env.DB, auth.workspaceId, appId);
  const prompt = cleanPrompt(promptValue);
  const category = cleanCategory(categoryValue);
  const pro = await paidAccess(env.DB, auth);
  const limit = pro ? PRO_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM ai_visibility_prompts
     WHERE workspace_id=? AND app_id=? AND active=1`,
  )
    .bind(auth.workspaceId, appId)
    .first<{ total: number }>();
  if (Number(count?.total ?? 0) >= limit) {
    throw new ProviderError("ai_visibility_prompt_limit_reached", 409);
  }
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO ai_visibility_prompts(
      id,workspace_id,app_id,category,prompt,active,created_at,updated_at
     ) VALUES(?,?,?,?,?,1,?,?)
     ON CONFLICT(app_id,prompt) DO UPDATE SET
       category=excluded.category,active=1,updated_at=excluded.updated_at`,
  )
    .bind(
      crypto.randomUUID(),
      auth.workspaceId,
      appId,
      category,
      prompt,
      now,
      now,
    )
    .run();
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "ai_visibility.prompt_added",
    "app",
    appId,
    { category },
  );
  return aiVisibilitySnapshot(env, auth, appId);
}

export async function removeAiVisibilityPrompt(
  env: Cloudflare.Env,
  auth: AuthContext,
  promptId: string,
) {
  const result = await env.DB.prepare(
    `UPDATE ai_visibility_prompts SET active=0,updated_at=?
     WHERE id=? AND workspace_id=?`,
  )
    .bind(nowISO(), promptId, auth.workspaceId)
    .run();
  if (!result.meta.changes) {
    throw new ProviderError("ai_visibility_prompt_not_found", 404);
  }
}

export async function updateAiVisibilityCadence(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
  cadence: string,
) {
  if (cadence !== "manual" && cadence !== "weekly") {
    throw new ProviderError("invalid_ai_visibility_cadence", 400);
  }
  if (cadence === "weekly" && !(await paidAccess(env.DB, auth))) {
    throw new ProviderError("ai_visibility_upgrade_required", 402);
  }
  await ownedApp(env.DB, auth.workspaceId, appId);
  const now = new Date();
  const nextScanAt =
    cadence === "weekly"
      ? new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
      : null;
  const result = await env.DB.prepare(
    `UPDATE ai_visibility_settings
     SET cadence=?,next_scan_at=?,updated_at=?
     WHERE workspace_id=? AND app_id=?`,
  )
    .bind(
      cadence,
      nextScanAt,
      now.toISOString(),
      auth.workspaceId,
      appId,
    )
    .run();
  if (!result.meta.changes) {
    throw new ProviderError("ai_visibility_not_configured", 409);
  }
  return aiVisibilitySnapshot(env, auth, appId);
}

async function enforceScanQuota(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
): Promise<"free" | "pro"> {
  if (await paidAccess(env.DB, auth)) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM ai_visibility_scans
       WHERE workspace_id=? AND app_id=? AND trigger_type='manual'
         AND status!='failed' AND created_at>=?`,
    )
      .bind(auth.workspaceId, appId, start.toISOString())
      .first<{ total: number }>();
    if (Number(count?.total ?? 0) >= PRO_DAILY_SCAN_LIMIT) {
      throw new ProviderError("ai_visibility_daily_scan_limit_reached", 429);
    }
    return "pro";
  }
  const count = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM ai_visibility_scans
     WHERE workspace_id=? AND app_id=? AND status!='failed'`,
  )
    .bind(auth.workspaceId, appId)
    .first<{ total: number }>();
  if (Number(count?.total ?? 0) >= 1) {
    throw new ProviderError("ai_visibility_starter_scan_used", 402);
  }
  return "free";
}

async function createScan(
  env: Cloudflare.Env,
  workspaceId: string,
  appId: string,
  triggerType: "manual" | "scheduled",
  maximumPrompts = PRO_PROMPT_LIMIT,
) {
  const outstanding = await env.DB.prepare(
    `SELECT id,status FROM ai_visibility_scans
     WHERE workspace_id=? AND app_id=?
       AND status IN ('queued','running','retrying')
     ORDER BY created_at LIMIT 1`,
  )
    .bind(workspaceId, appId)
    .first<{ id: string; status: string }>();
  if (outstanding) {
    return { scanId: outstanding.id, status: outstanding.status, existing: true };
  }
  const promptCount = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM ai_visibility_prompts
     WHERE workspace_id=? AND app_id=? AND active=1`,
  )
    .bind(workspaceId, appId)
    .first<{ total: number }>();
  const total = Math.min(
    maximumPrompts,
    Number(promptCount?.total ?? 0),
  );
  if (!total) {
    throw new ProviderError("ai_visibility_prompts_required", 409);
  }
  const id = crypto.randomUUID();
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO ai_visibility_scans(
      id,workspace_id,app_id,provider,model,trigger_type,status,prompt_count,
      mention_count,attempt,max_attempts,run_after,created_at,updated_at
     ) VALUES(?,?,?,'deepseek',?,?,'queued',?,0,0,4,?,?,?)`,
  )
    .bind(
      id,
      workspaceId,
      appId,
      AI_VISIBILITY_MODEL,
      triggerType,
      total,
      now,
      now,
      now,
    )
    .run();
  const message: AiVisibilityMessage = {
    type: "ai-visibility-scan",
    scanId: id,
    workspaceId,
    appId,
  };
  await env.SYNC_QUEUE.send(message);
  return { scanId: id, status: "queued", existing: false };
}

export async function queueAiVisibilityScan(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
) {
  await ownedApp(env.DB, auth.workspaceId, appId);
  const plan = await enforceScanQuota(env, auth, appId);
  const scan = await createScan(
    env,
    auth.workspaceId,
    appId,
    "manual",
    plan === "free" ? FREE_PROMPT_LIMIT : PRO_PROMPT_LIMIT,
  );
  await audit(
    env.DB,
    auth.workspaceId,
    auth.userId,
    "ai_visibility.scan_queued",
    "app",
    appId,
    { scanId: scan.scanId, provider: "deepseek", plan },
  );
  return { ...scan, provider: "deepseek", model: AI_VISIBILITY_MODEL };
}

function responseAliases(appName: string): string[] {
  const full = appName.trim().toLocaleLowerCase();
  const base = full.replace(/\s*[:–—-]\s*.*$/u, "").trim();
  return [full, ...(base.length >= 4 && base !== full ? [base] : [])];
}

export function analyzeAiVisibilityAnswer(
  answerValue: string,
  appName: string,
): { mentioned: boolean; position: number | null; excerpt: string } {
  const answer = answerValue.trim().slice(0, MAX_ANSWER_LENGTH);
  const aliases = responseAliases(appName);
  const lower = answer.toLocaleLowerCase();
  const mentioned = aliases.some((alias) => lower.includes(alias));
  let position: number | null = null;
  if (mentioned) {
    for (const line of answer.split(/\r?\n/u)) {
      const lineLower = line.toLocaleLowerCase();
      if (!aliases.some((alias) => lineLower.includes(alias))) continue;
      const match = line.match(/^\s*(?:#\s*)?(\d{1,3})[.)\]:-]?\s+/u);
      if (match) {
        const candidate = Number(match[1]);
        if (candidate > 0 && candidate <= 100) {
          position = candidate;
          break;
        }
      }
    }
  }
  const aliasIndex = mentioned
    ? Math.min(
        ...aliases
          .map((alias) => lower.indexOf(alias))
          .filter((index) => index >= 0),
      )
    : 0;
  const excerptStart = Math.max(0, aliasIndex - 160);
  const excerpt = answer
    .slice(excerptStart, excerptStart + 760)
    .replace(/\s+/gu, " ")
    .trim();
  return { mentioned, position, excerpt };
}

async function deepSeekAnswer(
  env: Cloudflare.Env,
  prompt: string,
): Promise<string> {
  let apiKey: string;
  try {
    apiKey = requireSecret(env, "DEEPSEEK_API_KEY");
  } catch {
    throw new ProviderError("deepseek_not_configured", 503, false);
  }
  let response: Response;
  try {
    response = await fetch(DEEPSEEK_CHAT_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_VISIBILITY_MODEL,
        messages: [
          {
            role: "system",
            content:
              "Answer as an independent app-discovery assistant. Give concrete iPhone app recommendations when relevant. Do not mention this evaluation. Do not claim to have browsed the web. Keep the answer under 500 words.",
          },
          { role: "user", content: prompt },
        ],
        max_tokens: 700,
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new ProviderError("deepseek_unavailable", 502, true);
  }
  if (!response.ok) {
    throw new ProviderError(
      response.status === 429 ? "deepseek_rate_limited" : "deepseek_unavailable",
      response.status === 429 ? 429 : 502,
      response.status === 429 || response.status >= 500,
    );
  }
  const payload = (await response.json()) as DeepSeekEnvelope;
  const answer = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!answer) {
    throw new ProviderError("deepseek_empty_answer", 502, true);
  }
  return answer.slice(0, MAX_ANSWER_LENGTH);
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function storePromptResult(
  env: Cloudflare.Env,
  scan: ScanRow,
  prompt: PromptRow,
  appName: string,
) {
  const existing = await env.DB.prepare(
    `SELECT id FROM ai_visibility_results
     WHERE scan_id=? AND prompt_id=?`,
  )
    .bind(scan.id, prompt.id)
    .first<{ id: string }>();
  if (existing) return;
  const answer = await deepSeekAnswer(env, prompt.prompt);
  const analysis = analyzeAiVisibilityAnswer(answer, appName);
  const now = nowISO();
  await env.DB.prepare(
    `INSERT INTO ai_visibility_results(
      id,workspace_id,app_id,scan_id,prompt_id,answer,evidence_excerpt,
      mentioned,position,response_fingerprint,created_at
     ) VALUES(?,?,?,?,?,?,?,?,?,?,?)
     ON CONFLICT(scan_id,prompt_id) DO NOTHING`,
  )
    .bind(
      crypto.randomUUID(),
      scan.workspace_id,
      scan.app_id,
      scan.id,
      prompt.id,
      answer,
      analysis.excerpt,
      analysis.mentioned ? 1 : 0,
      analysis.position,
      hex(await sha256(answer)),
      now,
    )
    .run();
}

async function failScan(
  env: Cloudflare.Env,
  scan: ScanRow,
  error: unknown,
): Promise<boolean> {
  const providerError =
    error instanceof ProviderError
      ? error
      : new ProviderError("ai_visibility_scan_failed", 502, true);
  const retry =
    providerError.retryable && scan.attempt < scan.max_attempts;
  const delaySeconds = Math.min(3600, 60 * 2 ** Math.max(0, scan.attempt));
  const now = new Date();
  const runAfter = new Date(now.getTime() + delaySeconds * 1000).toISOString();
  await env.DB.prepare(
    `UPDATE ai_visibility_scans
     SET status=?,run_after=?,last_error_code=?,updated_at=?
     WHERE id=? AND workspace_id=?`,
  )
    .bind(
      retry ? "retrying" : "failed",
      runAfter,
      providerError.code,
      now.toISOString(),
      scan.id,
      scan.workspace_id,
    )
    .run();
  log(retry ? "warn" : "error", "ai_visibility_scan_failed", {
    scanId: scan.id,
    attempt: scan.attempt,
    retry,
    errorCode: providerError.code,
  });
  return retry;
}

export async function processAiVisibilityMessage(
  env: Cloudflare.Env,
  message: AiVisibilityMessage,
): Promise<{ retry: boolean }> {
  const now = nowISO();
  const claimed = await env.DB.prepare(
    `UPDATE ai_visibility_scans
     SET status='running',started_at=COALESCE(started_at,?),
       attempt=attempt+1,updated_at=?
     WHERE id=? AND workspace_id=? AND app_id=?
       AND status IN ('queued','retrying')`,
  )
    .bind(
      now,
      now,
      message.scanId,
      message.workspaceId,
      message.appId,
    )
    .run();
  if (!claimed.meta.changes) return { retry: false };
  const scan = await env.DB.prepare(
    `SELECT * FROM ai_visibility_scans
     WHERE id=? AND workspace_id=? AND app_id=?`,
  )
    .bind(message.scanId, message.workspaceId, message.appId)
    .first<ScanRow>();
  if (!scan) return { retry: false };
  try {
    const [app, prompts] = await Promise.all([
      ownedApp(env.DB, scan.workspace_id, scan.app_id),
      env.DB.prepare(
        `SELECT id,category,prompt,active,created_at
         FROM ai_visibility_prompts
         WHERE workspace_id=? AND app_id=? AND active=1
         ORDER BY created_at,id LIMIT ?`,
      )
        .bind(scan.workspace_id, scan.app_id, scan.prompt_count)
        .all<PromptRow>(),
    ]);
    if (!prompts.results.length) {
      throw new ProviderError("ai_visibility_prompts_required", 409);
    }
    for (let offset = 0; offset < prompts.results.length; offset += 3) {
      await Promise.all(
        prompts.results
          .slice(offset, offset + 3)
          .map((prompt) => storePromptResult(env, scan, prompt, app.name)),
      );
    }
    const totals = await env.DB.prepare(
      `SELECT COUNT(*) AS prompt_count,
              SUM(mentioned) AS mention_count,
              MIN(position) AS best_position
       FROM ai_visibility_results WHERE scan_id=?`,
    )
      .bind(scan.id)
      .first<{
        prompt_count: number;
        mention_count: number | null;
        best_position: number | null;
      }>();
    const completedAt = nowISO();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE ai_visibility_scans
         SET status='succeeded',prompt_count=?,mention_count=?,
           best_position=?,completed_at=?,last_error_code=NULL,updated_at=?
         WHERE id=? AND workspace_id=?`,
      ).bind(
        Number(totals?.prompt_count ?? 0),
        Number(totals?.mention_count ?? 0),
        totals?.best_position ?? null,
        completedAt,
        completedAt,
        scan.id,
        scan.workspace_id,
      ),
      env.DB.prepare(
        `UPDATE ai_visibility_settings
         SET next_scan_at=CASE WHEN cadence='weekly' THEN ? ELSE NULL END,
           updated_at=?
         WHERE workspace_id=? AND app_id=?`,
      ).bind(
        new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
        completedAt,
        scan.workspace_id,
        scan.app_id,
      ),
    ]);
    log("info", "ai_visibility_scan_succeeded", {
      scanId: scan.id,
      promptCount: Number(totals?.prompt_count ?? 0),
      mentionCount: Number(totals?.mention_count ?? 0),
    });
    return { retry: false };
  } catch (error) {
    return { retry: await failScan(env, scan, error) };
  }
}

export async function queueDueAiVisibilityScans(
  env: Cloudflare.Env,
  maximum = 25,
): Promise<number> {
  const now = nowISO();
  const rows = await env.DB.prepare(
    `SELECT s.workspace_id,s.app_id,w.subscription_status,w.trial_ends_at,
            w.entitlement_ends_at
     FROM ai_visibility_settings s
     JOIN workspaces w ON w.id=s.workspace_id
     WHERE s.cadence='weekly' AND s.next_scan_at IS NOT NULL
       AND s.next_scan_at<=?
     ORDER BY s.next_scan_at LIMIT ?`,
  )
    .bind(now, Math.max(1, Math.min(100, maximum)))
    .all<{
      workspace_id: string;
      app_id: string;
      subscription_status: string;
      trial_ends_at: string;
      entitlement_ends_at: string | null;
    }>();
  let queued = 0;
  for (const row of rows.results) {
    if (
      !isEntitled({
        subscriptionStatus: row.subscription_status,
        trialEndsAt: row.trial_ends_at,
        ...(row.entitlement_ends_at
          ? { entitlementEndsAt: row.entitlement_ends_at }
          : {}),
      })
    ) {
      await env.DB.prepare(
        `UPDATE ai_visibility_settings
         SET cadence='manual',next_scan_at=NULL,updated_at=?
         WHERE workspace_id=? AND app_id=?`,
      )
        .bind(now, row.workspace_id, row.app_id)
        .run();
      continue;
    }
    const result = await createScan(
      env,
      row.workspace_id,
      row.app_id,
      "scheduled",
      PRO_PROMPT_LIMIT,
    );
    if (!result.existing) queued += 1;
  }
  return queued;
}

export async function aiVisibilitySnapshot(
  env: Cloudflare.Env,
  auth: AuthContext,
  appId: string,
) {
  const app = await ownedApp(env.DB, auth.workspaceId, appId);
  const pro = await paidAccess(env.DB, auth);
  const promptLimit = pro ? PRO_PROMPT_LIMIT : FREE_PROMPT_LIMIT;
  const [settings, prompts, scans] = await Promise.all([
    env.DB.prepare(
      `SELECT provider,model,cadence,next_scan_at
       FROM ai_visibility_settings
       WHERE workspace_id=? AND app_id=?`,
    )
      .bind(auth.workspaceId, appId)
      .first<{
        provider: string;
        model: string;
        cadence: "manual" | "weekly";
        next_scan_at: string | null;
      }>(),
    env.DB.prepare(
      `SELECT id,category,prompt,active,created_at
       FROM ai_visibility_prompts
       WHERE workspace_id=? AND app_id=? AND active=1
       ORDER BY created_at,id`,
    )
      .bind(auth.workspaceId, appId)
      .all<PromptRow>(),
    env.DB.prepare(
      `SELECT * FROM ai_visibility_scans
       WHERE workspace_id=? AND app_id=?
       ORDER BY created_at DESC LIMIT 12`,
    )
      .bind(auth.workspaceId, appId)
      .all<ScanRow>(),
  ]);
  const latest = scans.results[0] ?? null;
  const latestResults = latest
    ? await env.DB.prepare(
        `SELECT id,scan_id,prompt_id,answer,evidence_excerpt,mentioned,
                position,created_at
         FROM ai_visibility_results
         WHERE workspace_id=? AND app_id=? AND scan_id=?
         ORDER BY created_at,id`,
      )
        .bind(auth.workspaceId, appId, latest.id)
        .all<ResultRow>()
    : { results: [] as ResultRow[] };
  const byPrompt = new Map(
    latestResults.results.map((result) => [result.prompt_id, result]),
  );
  const completedScans = scans.results.filter(
    (scan) => scan.status === "succeeded",
  );
  const usedStarterScan = scans.results.some((scan) => scan.status !== "failed");
  return {
    app: {
      id: app.id,
      name: app.name,
      configured: Boolean(app.apple_app_id),
      storefront: app.default_storefront,
    },
    provider: {
      id: "deepseek",
      label: "DeepSeek",
      model: settings?.model ?? AI_VISIBILITY_MODEL,
      evidenceType: "observed answers",
    },
    setupRequired: !settings,
    plan: {
      tier: pro ? "pro" : "free",
      promptLimit,
      promptCount: prompts.results.length,
      manualScansPerDay: pro ? PRO_DAILY_SCAN_LIMIT : 0,
      starterScans: 1,
      starterScansUsed: usedStarterScan ? 1 : 0,
      weeklyAvailable: pro,
    },
    cadence: settings?.cadence ?? "manual",
    nextScanAt: settings?.next_scan_at ?? null,
    scan: latest
      ? {
          id: latest.id,
          status: latest.status,
          trigger: latest.trigger_type,
          promptCount: latest.prompt_count,
          mentionCount: latest.mention_count,
          bestPosition: latest.best_position,
          createdAt: latest.created_at,
          completedAt: latest.completed_at,
          errorCode: latest.last_error_code,
        }
      : null,
    prompts: prompts.results.map((prompt) => {
      const result = byPrompt.get(prompt.id);
      return {
        id: prompt.id,
        category: prompt.category,
        prompt: prompt.prompt,
        result: result
          ? {
              mentioned: Boolean(result.mentioned),
              position: result.position,
              excerpt: result.evidence_excerpt,
              answer: result.answer,
              checkedAt: result.created_at,
            }
          : null,
      };
    }),
    trend: completedScans
      .slice()
      .reverse()
      .map((scan) => ({
        scanId: scan.id,
        checkedAt: scan.completed_at ?? scan.created_at,
        promptCount: scan.prompt_count,
        mentionCount: scan.mention_count,
        visibility:
          scan.prompt_count > 0
            ? Math.round((scan.mention_count / scan.prompt_count) * 100)
            : 0,
      })),
    truth: {
      insightClass: "Observed",
      source: "DeepSeek API answer captured by AppClimb",
      universalAiVisibility: false,
      promptMetadataInjected: false,
    },
  };
}

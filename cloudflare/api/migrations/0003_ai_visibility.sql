CREATE TABLE ai_visibility_settings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'deepseek' CHECK (provider = 'deepseek'),
  model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  cadence TEXT NOT NULL DEFAULT 'manual' CHECK (cadence IN ('manual','weekly')),
  next_scan_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_id)
);

CREATE TABLE ai_visibility_prompts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('discovery','comparison','branded')),
  prompt TEXT NOT NULL CHECK (length(prompt) BETWEEN 8 AND 500),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (app_id, prompt)
);
CREATE INDEX ai_visibility_prompts_app_idx
  ON ai_visibility_prompts(app_id, active, created_at);

CREATE TABLE ai_visibility_scans (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'deepseek' CHECK (provider = 'deepseek'),
  model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
  trigger_type TEXT NOT NULL CHECK (trigger_type IN ('manual','scheduled')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','retrying')),
  prompt_count INTEGER NOT NULL DEFAULT 0 CHECK (prompt_count >= 0),
  mention_count INTEGER NOT NULL DEFAULT 0 CHECK (mention_count >= 0),
  best_position INTEGER CHECK (best_position > 0),
  attempt INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 4,
  run_after TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  last_error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX ai_visibility_scans_app_idx
  ON ai_visibility_scans(app_id, created_at DESC);
CREATE INDEX ai_visibility_scans_due_idx
  ON ai_visibility_scans(status, run_after, created_at)
  WHERE status IN ('queued','retrying');
CREATE UNIQUE INDEX ai_visibility_scans_one_outstanding_per_app_idx
  ON ai_visibility_scans(app_id)
  WHERE status IN ('queued','running','retrying');

CREATE TABLE ai_visibility_results (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  scan_id TEXT NOT NULL REFERENCES ai_visibility_scans(id) ON DELETE CASCADE,
  prompt_id TEXT NOT NULL REFERENCES ai_visibility_prompts(id) ON DELETE CASCADE,
  answer TEXT NOT NULL CHECK (length(answer) <= 12000),
  evidence_excerpt TEXT NOT NULL CHECK (length(evidence_excerpt) <= 800),
  mentioned INTEGER NOT NULL CHECK (mentioned IN (0,1)),
  position INTEGER CHECK (position > 0),
  response_fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (scan_id, prompt_id)
);
CREATE INDEX ai_visibility_results_scan_idx
  ON ai_visibility_results(scan_id, created_at);

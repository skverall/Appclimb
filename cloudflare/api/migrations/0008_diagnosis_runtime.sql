-- Migration 0008: Decision System V2 runtime
--
-- Makes the diagnosis pipeline able to actually run more than once, to record
-- what it concluded, and to describe a product that has no real app yet.
--
-- Four changes:
--   1. diagnosis_runs carries the run lifecycle AND the explicit diagnosis
--      outcome, plus a stable error CODE (never an internal error message).
--   2. diagnosis_stages persists the engine's per-stage verdict so growth-map
--      can return real health, evidence links and baselines instead of the
--      hardcoded "unknown" it computed for itself.
--   3. insights.stage_id loses its iOS-only CHECK so the web funnel can be
--      diagnosed. This requires a table rebuild.
--   4. apps.is_placeholder makes the signup placeholder product detectable,
--      which is what the product_required readiness state depends on.

-- ---------------------------------------------------------------------------
-- 1. Diagnosis run lifecycle and explicit outcome
-- ---------------------------------------------------------------------------

-- `status` stays the queue lifecycle (queued/running/retrying/succeeded/failed).
-- `outcome` carries the product-facing DiagnosisStatus so `no_confirmed_issue`
-- and `not_ready` survive persistence instead of being flattened to
-- 'succeeded'. Kept as a separate column so lifecycle and verdict cannot be
-- confused for one another.
ALTER TABLE diagnosis_runs ADD COLUMN outcome TEXT
  CHECK (outcome IS NULL OR outcome IN (
    'not_ready','queued','running','ready','no_confirmed_issue','failed'
  ));

ALTER TABLE diagnosis_runs ADD COLUMN platform TEXT NOT NULL DEFAULT 'iOS'
  CHECK (platform IN ('iOS','Web'));

ALTER TABLE diagnosis_runs ADD COLUMN completed_at TEXT;

-- Backfill: every historical run that reached 'succeeded' predates the outcome
-- column. They are marked not_ready rather than invented as ready, because the
-- pre-0008 engine could not classify a stage at all.
UPDATE diagnosis_runs
   SET outcome = CASE
         WHEN status = 'failed' THEN 'failed'
         WHEN status = 'running' THEN 'running'
         WHEN status IN ('queued','retrying') THEN 'queued'
         ELSE 'not_ready'
       END
 WHERE outcome IS NULL;

-- Debounce lookup: "was there a recent successful run for this exact input?"
CREATE INDEX diagnosis_runs_input_hash_idx
  ON diagnosis_runs(app_id, input_hash, completed_at DESC)
  WHERE status = 'succeeded';

-- ---------------------------------------------------------------------------
-- 2. Persisted per-stage diagnosis result
-- ---------------------------------------------------------------------------

CREATE TABLE diagnosis_stages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES diagnosis_runs(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  stage_id TEXT NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  value REAL NOT NULL DEFAULT 0,
  -- 'missing' means the provider returned nothing: `value` is a rendering
  -- placeholder and must never be read as an observed zero.
  value_state TEXT NOT NULL
    CHECK (value_state IN ('measured','explicit_zero','missing')),
  formatted_value TEXT NOT NULL,
  conversion_rate REAL,
  health TEXT NOT NULL CHECK (health IN ('healthy','watch','critical','unknown')),
  source TEXT NOT NULL,
  flow_width REAL NOT NULL DEFAULT 30,
  benchmark REAL,
  baseline_method TEXT NOT NULL
    CHECK (baseline_method IN (
      'previous_window','historical_average','explicit_target','none'
    )),
  baseline_window_from TEXT,
  baseline_window_to TEXT,
  -- How health was decided.
  comparison_type TEXT NOT NULL
    CHECK (comparison_type IN (
      'same_source_funnel','cohort','time_baseline',
      'aggregate_directional','not_comparable'
    )),
  -- How honest the displayed conversion ratio is; 'aggregate_directional'
  -- means it mixes providers and may only be drawn as a direction.
  ratio_comparison_type TEXT NOT NULL DEFAULT 'not_comparable'
    CHECK (ratio_comparison_type IN (
      'same_source_funnel','cohort','time_baseline',
      'aggregate_directional','not_comparable'
    )),
  readiness_reason TEXT,
  sample_size INTEGER,
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (run_id, stage_id)
);

CREATE INDEX diagnosis_stages_current_idx
  ON diagnosis_stages(app_id, created_at DESC, position);

-- ---------------------------------------------------------------------------
-- 3. Allow web stage identifiers in insights
-- ---------------------------------------------------------------------------

-- Derived diagnosis output from before this migration is discarded on purpose.
-- The previous engine emitted a "Confirmed bottleneck at Renew stage" insight
-- for every workspace with any renewals, regardless of whether anything had
-- deteriorated. Those rows are not evidence-backed and must not survive. The
-- next diagnosis run regenerates this table set from scratch.
-- Children first, so dropping the parent cannot cascade.
DELETE FROM action_proposals;
DELETE FROM insights;
DELETE FROM evidence;

CREATE TABLE insights_v2 (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('Observed','Derived','Hypothesis')),
  -- No CHECK: stage identifiers are owned by the engine's stage definitions and
  -- now span both the iOS and the web funnel.
  stage_id TEXT NOT NULL,
  evidence_ids TEXT NOT NULL DEFAULT '[]',
  confidence TEXT NOT NULL CHECK (confidence IN ('high','medium','low')),
  impact TEXT NOT NULL CHECK (impact IN ('high','medium','low')),
  effort TEXT NOT NULL CHECK (effort IN ('high','medium','low')),
  rank INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  diagnosis_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

DROP TABLE insights;
ALTER TABLE insights_v2 RENAME TO insights;
CREATE INDEX insights_ranked_idx ON insights(app_id, created_at DESC, rank);

-- ---------------------------------------------------------------------------
-- 4. Placeholder product detection
-- ---------------------------------------------------------------------------

ALTER TABLE apps ADD COLUMN is_placeholder INTEGER NOT NULL DEFAULT 0
  CHECK (is_placeholder IN (0,1));

-- Backfill: the signup bootstrap creates a nameless 'My iOS App' row with no
-- store identity. Only rows that are still untouched qualify.
UPDATE apps
   SET is_placeholder = 1
 WHERE apple_app_id IS NULL
   AND bundle_id IS NULL
   AND NOT EXISTS (SELECT 1 FROM source_connections sc WHERE sc.app_id = apps.id)
   AND NOT EXISTS (SELECT 1 FROM keyword_tracks kt WHERE kt.app_id = apps.id)
   AND NOT EXISTS (SELECT 1 FROM metric_points mp WHERE mp.app_id = apps.id);

-- The flag is maintained by the schema rather than by each write site, so the
-- signup bootstrap and every app-creation path stay correct without having to
-- know the flag exists. An app with no store identity is a placeholder; the
-- moment it gains one it is a real product.
CREATE TRIGGER apps_placeholder_on_insert
AFTER INSERT ON apps
WHEN NEW.apple_app_id IS NULL AND NEW.bundle_id IS NULL AND NEW.is_placeholder = 0
BEGIN
  UPDATE apps SET is_placeholder = 1 WHERE id = NEW.id;
END;

CREATE TRIGGER apps_placeholder_on_identify
AFTER UPDATE OF apple_app_id, bundle_id ON apps
WHEN (NEW.apple_app_id IS NOT NULL OR NEW.bundle_id IS NOT NULL)
  AND NEW.is_placeholder = 1
BEGIN
  UPDATE apps SET is_placeholder = 0 WHERE id = NEW.id;
END;

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0008_diagnosis_runtime.sql', datetime('now'));

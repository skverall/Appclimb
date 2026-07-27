-- Migration 0010: persistent Lab experiments and insight feedback (P0.29 / P0.30)
--
-- Migration 0001 created `experiments` and migration 0007 added
-- `action_proposal_id` and `evidence_ids`. The Decision System V2 contract also
-- requires the insight the experiment came from, the exact steps, guardrails,
-- the segment it applies to and the learnings recorded when it ends. Those five
-- columns were still missing, so a Lab draft could not be reconstructed from
-- the database and the Lab stayed session-only.
--
-- `status` keeps the 0001 CHECK ('draft','ready','running','completed'): the
-- contract in src/lib/contracts.ts uses exactly those four values, and SQLite
-- cannot widen a CHECK without rebuilding the table.

ALTER TABLE experiments ADD COLUMN insight_id TEXT;
ALTER TABLE experiments ADD COLUMN steps TEXT NOT NULL DEFAULT '[]';
ALTER TABLE experiments ADD COLUMN guardrails TEXT NOT NULL DEFAULT '[]';
ALTER TABLE experiments ADD COLUMN segment TEXT;
ALTER TABLE experiments ADD COLUMN learnings TEXT;

CREATE INDEX experiments_insight_idx ON experiments(app_id, insight_id);

-- Insight feedback (P0.30).
--
-- `action_proposals.status` keeps its 0001 CHECK ('proposed','accepted',
-- 'dismissed'). The five product actions map onto it without a table rebuild:
--   accept                 -> accepted
--   convert_to_experiment  -> accepted   (+ converted_experiment_id)
--   dismiss                -> dismissed
--   not_relevant           -> dismissed
--   mapping_wrong          -> dismissed
-- The precise action and its reason live in the columns below, and every
-- transition also appends an immutable row to action_proposal_feedback so
-- accepted/dismissed/diagnosis-to-experiment rates can be computed from
-- history rather than from the current status alone.

ALTER TABLE action_proposals ADD COLUMN feedback_action TEXT;
ALTER TABLE action_proposals ADD COLUMN feedback_reason TEXT;
ALTER TABLE action_proposals ADD COLUMN feedback_at TEXT;
ALTER TABLE action_proposals ADD COLUMN converted_experiment_id TEXT;

CREATE TABLE action_proposal_feedback (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  app_id TEXT NOT NULL REFERENCES apps(id) ON DELETE CASCADE,
  proposal_id TEXT NOT NULL REFERENCES action_proposals(id) ON DELETE CASCADE,
  insight_id TEXT,
  action TEXT NOT NULL CHECK (
    action IN (
      'accept',
      'dismiss',
      'not_relevant',
      'mapping_wrong',
      'convert_to_experiment'
    )
  ),
  reason TEXT,
  experiment_id TEXT,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX action_proposal_feedback_app_idx
  ON action_proposal_feedback(app_id, created_at DESC);
CREATE INDEX action_proposal_feedback_proposal_idx
  ON action_proposal_feedback(proposal_id, created_at DESC);

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0010_persistent_experiments_and_feedback.sql', datetime('now'));

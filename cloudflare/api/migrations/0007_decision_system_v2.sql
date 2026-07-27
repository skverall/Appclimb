-- Migration 0007: Decision System V2
-- Adds readiness, structured action plans, explicit diagnosis metadata, and web property verification fields.

ALTER TABLE diagnosis_runs ADD COLUMN primary_insight_id TEXT;
ALTER TABLE diagnosis_runs ADD COLUMN limitations TEXT NOT NULL DEFAULT '[]';
ALTER TABLE diagnosis_runs ADD COLUMN missing_requirements TEXT NOT NULL DEFAULT '[]';
ALTER TABLE diagnosis_runs ADD COLUMN error_code TEXT;

ALTER TABLE action_proposals ADD COLUMN structured_plan TEXT;

ALTER TABLE web_properties ADD COLUMN first_event_at TEXT;
ALTER TABLE web_properties ADD COLUMN last_event_at TEXT;
ALTER TABLE web_properties ADD COLUMN verified_at TEXT;
ALTER TABLE web_properties ADD COLUMN verified_hostname TEXT;
ALTER TABLE web_properties ADD COLUMN installation_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE web_properties ADD COLUMN primary_conversion_goal TEXT;

ALTER TABLE experiments ADD COLUMN action_proposal_id TEXT REFERENCES action_proposals(id) ON DELETE SET NULL;
ALTER TABLE experiments ADD COLUMN evidence_ids TEXT NOT NULL DEFAULT '[]';

INSERT INTO schema_migrations(version, applied_at) VALUES ('0007_decision_system_v2.sql', datetime('now'));

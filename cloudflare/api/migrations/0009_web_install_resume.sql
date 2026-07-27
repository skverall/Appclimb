-- Migration 0009: persistent website install resume (Decision System V2, P0.27)
--
-- 0007 added the web_properties verification columns but nothing wrote them and
-- nothing recorded where the user left the wizard. These two columns make the
-- setup position server-derived instead of component-local, so Pulse, the app
-- tab and the wizard all resume on the same incomplete step after a reload.

ALTER TABLE web_properties ADD COLUMN setup_step TEXT;
ALTER TABLE web_properties ADD COLUMN setup_completed_at TEXT;

-- Resume lookups scan by workspace and ask "is this install finished?".
-- Partial index keeps it small: completed installs drop out of the index.
CREATE INDEX web_properties_setup_resume_idx
  ON web_properties(workspace_id, first_event_at)
  WHERE setup_completed_at IS NULL;

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0009_web_install_resume.sql', datetime('now'));

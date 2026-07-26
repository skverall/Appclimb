CREATE UNIQUE INDEX IF NOT EXISTS apps_workspace_apple_app_idx
  ON apps(workspace_id, apple_app_id)
  WHERE apple_app_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS keyword_tracks_due_idx
  ON keyword_tracks(active, created_at);

CREATE INDEX IF NOT EXISTS keyword_rank_points_history_idx
  ON keyword_rank_points(keyword_track_id, observed_on DESC);

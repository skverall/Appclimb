\set ON_ERROR_STOP on

SELECT json_build_object('table','users','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM users ORDER BY created_at,id) row_data;
SELECT json_build_object('table','workspaces','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM workspaces ORDER BY created_at,id) row_data;
SELECT json_build_object('table','workspace_members','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM workspace_members ORDER BY created_at,workspace_id,user_id) row_data;
SELECT json_build_object('table','refresh_sessions','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM refresh_sessions ORDER BY created_at,id) row_data;
SELECT json_build_object('table','apps','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM apps ORDER BY created_at,id) row_data;
SELECT json_build_object('table','source_connections','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM source_connections ORDER BY created_at,id) row_data;
SELECT json_build_object('table','metric_points','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM metric_points ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','change_events','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM change_events ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','evidence','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM evidence ORDER BY created_at,id) row_data;
SELECT json_build_object('table','insights','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM insights ORDER BY created_at,id) row_data;
SELECT json_build_object('table','action_proposals','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM action_proposals ORDER BY created_at,id) row_data;
SELECT json_build_object('table','experiments','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM experiments ORDER BY created_at,id) row_data;
SELECT json_build_object('table','sync_jobs','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM sync_jobs ORDER BY created_at,id) row_data;
SELECT json_build_object('table','diagnosis_runs','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM diagnosis_runs ORDER BY created_at,id) row_data;
SELECT json_build_object('table','keyword_tracks','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM keyword_tracks ORDER BY created_at,id) row_data;
SELECT json_build_object('table','keyword_rank_points','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM keyword_rank_points ORDER BY observed_on,id) row_data;
SELECT json_build_object('table','billing_events','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM billing_events ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','paddle_checkout_bindings','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM paddle_checkout_bindings ORDER BY created_at,id) row_data;
SELECT json_build_object('table','audit_events','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM audit_events ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','web_properties','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM web_properties ORDER BY created_at,id) row_data;
SELECT json_build_object('table','web_events','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM web_events ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','web_crawler_events','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM web_crawler_events ORDER BY occurred_at,id) row_data;
SELECT json_build_object('table','password_reset_tokens','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT * FROM password_reset_tokens ORDER BY created_at,id) row_data;
SELECT json_build_object('table','schema_migrations','rows',COALESCE(json_agg(row_to_json(row_data)),'[]'::json))
FROM (SELECT name AS version,applied_at FROM schema_migrations ORDER BY name) row_data;

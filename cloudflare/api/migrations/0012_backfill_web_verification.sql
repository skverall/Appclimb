-- Migration 0012: backfill web property verification metadata
--
-- 0007 added first_event_at / last_event_at / verified_at / verified_hostname
-- to web_properties, and 0008-0011 shipped the collector path that writes them
-- (markPropertyVerified). Nothing ever populated them for properties whose
-- events arrived *before* that collector change landed.
--
-- The consequence is user-visible and wrong: deriveWorkspaceReadiness and the
-- tracking verification gate both key off first_event_at, so a website that has
-- been correctly installed and sending real events for days still reports
-- "script not installed" and pins the workspace at installation_required.
--
-- The evidence for verification already exists in web_events. This reconstructs
-- the metadata from accepted events only, so it cannot mark anything verified
-- that never actually received a real browser event.

UPDATE web_properties
   SET first_event_at = (
         SELECT MIN(e.occurred_at) FROM web_events e
          WHERE e.property_id = web_properties.id
       ),
       last_event_at = COALESCE(
         last_event_at,
         (SELECT MAX(e.occurred_at) FROM web_events e
           WHERE e.property_id = web_properties.id)
       ),
       verified_at = COALESCE(
         verified_at,
         (SELECT MIN(e.created_at) FROM web_events e
           WHERE e.property_id = web_properties.id)
       ),
       -- The hostname the first accepted event actually carried, not the
       -- configured domain: verification records what was observed.
       verified_hostname = COALESCE(
         verified_hostname,
         (SELECT e.hostname FROM web_events e
           WHERE e.property_id = web_properties.id
           ORDER BY e.occurred_at ASC, e.created_at ASC
           LIMIT 1)
       )
 WHERE first_event_at IS NULL
   AND EXISTS (
         SELECT 1 FROM web_events e WHERE e.property_id = web_properties.id
       );

-- A property that already has a verified event is past the verify step; the
-- wizard must resume at the conversion goal, not send the user back to
-- "deploy the script". Steps are domain, install, deploy, verify, goal,
-- baseline (WEB_INSTALL_STEPS).
UPDATE web_properties
   SET setup_step = 'goal'
 WHERE setup_completed_at IS NULL
   AND first_event_at IS NOT NULL
   AND (setup_step IS NULL
        OR setup_step IN ('domain', 'install', 'deploy', 'verify'));

INSERT INTO schema_migrations(version, applied_at)
VALUES ('0012_backfill_web_verification.sql', datetime('now'));

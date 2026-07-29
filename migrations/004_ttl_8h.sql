-- 8h default seat TTL + backfill expires_at for live seats missing it
UPDATE projects
SET
  max_session_sec = 28800
WHERE
  max_session_sec < 28800
  OR max_session_sec = 3600;

-- live seats with no expiry: expire 8h after create
UPDATE sandboxes
SET
  expires_at = created_at + interval '8 hours'
WHERE
  status IN ('creating', 'running', 'paused', 'error')
  AND expires_at IS NULL;

-- live seats already past 8h wall clock: mark for reaper (expires_at in the past)
UPDATE sandboxes
SET
  expires_at = LEAST(expires_at, created_at + interval '8 hours')
WHERE
  status IN ('creating', 'running', 'paused', 'error')
  AND created_at < now() - interval '8 hours';

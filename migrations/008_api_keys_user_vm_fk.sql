-- api_keys: own by user; vms: track which key created the seat
-- session-created VMs keep api_key_id NULL

ALTER TABLE api_keys
ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES "user" (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS api_keys_user_idx ON api_keys (user_id)
WHERE
  revoked_at IS NULL;

-- backfill from project owner
UPDATE api_keys k
SET
  user_id = p.owner_user_id
FROM
  projects p
WHERE
  k.project_id = p.id
  AND k.user_id IS NULL
  AND p.owner_user_id IS NOT NULL;

ALTER TABLE vms
ADD COLUMN IF NOT EXISTS api_key_id UUID REFERENCES api_keys (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS vms_api_key_idx ON vms (api_key_id)
WHERE
  api_key_id IS NOT NULL;

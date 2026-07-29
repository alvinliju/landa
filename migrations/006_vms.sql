-- User-owned VMs (identity-scoped). Better Auth "user" is the account table.
-- sandboxes remain the seat runtime row; vms ties each seat to a user.

CREATE TABLE IF NOT EXISTS vms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  sandbox_id UUID NOT NULL UNIQUE REFERENCES sandboxes (id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'creating' CHECK (
    status IN (
      'creating',
      'running',
      'paused',
      'stopped',
      'destroyed',
      'error'
    )
  ),
  backend TEXT NOT NULL DEFAULT 'memory',
  template_slug TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS vms_user_status_idx ON vms (user_id, status);

CREATE INDEX IF NOT EXISTS vms_project_idx ON vms (project_id);

CREATE INDEX IF NOT EXISTS vms_user_created_idx ON vms (user_id, created_at DESC);

-- backfill: attach existing sandboxes to project owners
INSERT INTO
  vms (
    user_id,
    project_id,
    sandbox_id,
    label,
    status,
    backend,
    template_slug,
    metadata,
    error,
    created_at,
    started_at,
    stopped_at,
    expires_at
  )
SELECT
  p.owner_user_id,
  s.project_id,
  s.id,
  s.label,
  s.status,
  s.backend,
  COALESCE(t.slug, ''),
  s.metadata,
  s.error,
  s.created_at,
  s.started_at,
  s.stopped_at,
  s.expires_at
FROM
  sandboxes s
  JOIN projects p ON p.id = s.project_id
  LEFT JOIN templates t ON t.id = s.template_id
WHERE
  p.owner_user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT
      1
    FROM
      vms v
    WHERE
      v.sandbox_id = s.id
  );

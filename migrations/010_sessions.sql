-- landa-run v0: persistent "session" workspace on host + optional live seat
-- stop = kill VM, keep volume; start = new VM + restore /workspace

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id TEXT NOT NULL REFERENCES "user" (id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'stopped' CHECK (
    status IN (
      'creating',
      'running',
      'stopped',
      'error',
      'destroyed'
    )
  ),
  -- host directory: source of truth for /workspace
  volume_path TEXT NOT NULL,
  repo_url TEXT,
  sandbox_id UUID REFERENCES sandboxes (id) ON DELETE SET NULL,
  computer_id TEXT,
  guest_ip TEXT,
  ssh_hint TEXT,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attach_at TIMESTAMPTZ,
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS sessions_user_status_idx ON sessions (user_id, status);

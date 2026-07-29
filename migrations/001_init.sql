-- landa control plane — E2B-shaped objects, raw SQL
-- projects · api_keys · templates · sandboxes · audit
-- schema_migrations is owned by scripts/migrate.ts

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  max_concurrent INT NOT NULL DEFAULT 20,
  max_session_sec INT NOT NULL DEFAULT 28800, -- 8h seat TTL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '',
  -- store hash only; plaintext shown once at create
  key_prefix TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);

CREATE INDEX api_keys_project_idx ON api_keys (project_id)
WHERE
  revoked_at IS NULL;

CREATE TABLE templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects (id) ON DELETE CASCADE,
  -- null project_id = global/system template
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  -- backend hint: memory | firecracker
  backend TEXT NOT NULL DEFAULT 'memory',
  -- opaque config (paths, image, etc.)
  config JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, slug)
);

CREATE TABLE sandboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  template_id UUID REFERENCES templates (id) ON DELETE SET NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'creating'
    CHECK (
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
  -- host-visible identity of the seat
  host_pid INT,
  guest_ip TEXT,
  ssh_user TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
);

CREATE INDEX sandboxes_project_status_idx ON sandboxes (project_id, status);

CREATE TABLE audit_events (
  id BIGSERIAL PRIMARY KEY,
  project_id UUID REFERENCES projects (id) ON DELETE SET NULL,
  sandbox_id UUID REFERENCES sandboxes (id) ON DELETE SET NULL,
  actor TEXT NOT NULL DEFAULT 'api',
  action TEXT NOT NULL,
  detail JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_project_idx ON audit_events (project_id, created_at DESC);

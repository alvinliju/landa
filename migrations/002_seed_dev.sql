-- local dev seed — project + templates
-- api key is created by `landa-migrate seed` (needs hashing)

INSERT INTO projects (id, slug, name, max_concurrent, max_session_sec)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  'dev',
  'Local dev',
  20,
  3600
WHERE
  NOT EXISTS (
    SELECT 1 FROM projects WHERE slug = 'dev'
  );

INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000010'::uuid,
  '00000000-0000-4000-8000-000000000001'::uuid,
  'memory-default',
  'In-process memory seat',
  'memory',
  '{"note": "no isolation — control plane tests only"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT 1 FROM templates WHERE slug = 'memory-default' AND project_id = '00000000-0000-4000-8000-000000000001'::uuid
  );

INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000011'::uuid,
  NULL,
  'firecracker-hello',
  'Firecracker hello rootfs',
  'firecracker',
  '{"kernel": "assets/hello-vmlinux.bin", "rootfs": "assets/hello-rootfs.ext4"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT 1 FROM templates WHERE slug = 'firecracker-hello' AND project_id IS NULL
  );

INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000012'::uuid,
  NULL,
  'docker-alpine',
  'Docker Alpine seat',
  'docker',
  '{"image": "alpine:3.20", "note": "real shell/fs via docker"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT 1 FROM templates WHERE slug = 'docker-alpine' AND project_id IS NULL
  );

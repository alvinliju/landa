-- local dev seed — project + templates (lite + agent only)
-- api key is created by `landa-migrate seed` (needs hashing)

INSERT INTO projects (id, slug, name, max_concurrent, max_session_sec)
SELECT
  '00000000-0000-4000-8000-000000000001'::uuid,
  'dev',
  'Local dev',
  20,
  28800 -- 8h max seat lifetime
WHERE
  NOT EXISTS (
    SELECT 1 FROM projects WHERE slug = 'dev'
  );

-- landa-lite: Alpine shell + dropbear (fast smoke)
INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000013'::uuid,
  NULL,
  'landa-lite',
  'Landa lite',
  'firecracker',
  '{"kernel":"assets/vmlinux.bin","rootfs":"assets/alpine-rootfs.ext4","memMiB":128,"note":"shell smoke — offline"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT 1 FROM templates WHERE slug = 'landa-lite' AND project_id IS NULL
  );

-- landa-agent: Grok / main-agent default (python3 + bash + jq)
INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000014'::uuid,
  NULL,
  'landa-agent',
  'Landa agent',
  'firecracker',
  '{"kernel":"assets/vmlinux.bin","rootfs":"assets/agent-rootfs.ext4","memMiB":256,"note":"offline python3+bash+jq — docs/grok-seat-contract.md"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT 1 FROM templates WHERE slug = 'landa-agent' AND project_id IS NULL
  );

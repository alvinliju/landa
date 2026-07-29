-- Keep only landa-lite + landa-agent templates
DELETE FROM templates
WHERE
  slug NOT IN ('landa-lite', 'landa-agent');

UPDATE templates
SET
  name = 'Landa lite',
  backend = 'firecracker',
  config = '{"kernel":"assets/vmlinux.bin","rootfs":"assets/alpine-rootfs.ext4","memMiB":128,"note":"shell smoke — offline"}'::jsonb
WHERE
  slug = 'landa-lite';

UPDATE templates
SET
  name = 'Landa agent',
  backend = 'firecracker',
  config = '{"kernel":"assets/vmlinux.bin","rootfs":"assets/agent-rootfs.ext4","memMiB":256,"note":"offline python3+bash+jq — docs/grok-seat-contract.md"}'::jsonb
WHERE
  slug = 'landa-agent';

-- ensure both exist if deleted somehow
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
    SELECT 1 FROM templates WHERE slug = 'landa-lite'
  );

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
    SELECT 1 FROM templates WHERE slug = 'landa-agent'
  );

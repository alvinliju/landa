-- Product surface: only landa-agent is available. Remove other templates.

DELETE FROM templates
WHERE
  slug <> 'landa-agent';

UPDATE templates
SET
  name = 'Landa agent',
  backend = 'firecracker',
  config = '{"kernel":"assets/vmlinux.bin","rootfs":"assets/agent-rootfs.ext4","memMiB":256,"note":"offline python3+bash+jq — docs/SKILL.md"}'::jsonb
WHERE
  slug = 'landa-agent';

INSERT INTO templates (id, project_id, slug, name, backend, config)
SELECT
  '00000000-0000-4000-8000-000000000014'::uuid,
  NULL,
  'landa-agent',
  'Landa agent',
  'firecracker',
  '{"kernel":"assets/vmlinux.bin","rootfs":"assets/agent-rootfs.ext4","memMiB":256,"note":"offline python3+bash+jq — docs/SKILL.md"}'::jsonb
WHERE
  NOT EXISTS (
    SELECT
      1
    FROM
      templates
    WHERE
      slug = 'landa-agent'
  );

-- One active API key label per project (case-insensitive).
-- Soft-revoke older duplicates so the unique index can apply.

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY
        project_id,
        lower(label)
      ORDER BY
        created_at DESC
    ) AS rn
  FROM
    api_keys
  WHERE
    revoked_at IS NULL
)
UPDATE api_keys k
SET
  revoked_at = now(),
  label = k.label || ' (duplicate ' || left(k.id::text, 8) || ')'
FROM
  ranked r
WHERE
  k.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS api_keys_project_label_active_uidx ON api_keys (project_id, lower(label))
WHERE
  revoked_at IS NULL;

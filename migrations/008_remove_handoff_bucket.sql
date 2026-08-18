UPDATE conversation_evaluations ce
SET bucket_id = NULL,
    version = ce.version + 1,
    updated_at = NOW()
FROM evaluation_buckets b
WHERE ce.bucket_id = b.id
  AND ce.bucket_set_id = b.bucket_set_id
  AND b.standard_key = 'handoff';

UPDATE evaluation_buckets
SET archived_at = COALESCE(archived_at, NOW()),
    version = CASE WHEN archived_at IS NULL THEN version + 1 ELSE version END,
    updated_at = CASE WHEN archived_at IS NULL THEN NOW() ELSE updated_at END
WHERE standard_key = 'handoff';

UPDATE evaluation_bucket_sets
SET starter_version = '2026-08-17-v2',
    version = version + 1,
    updated_at = NOW()
WHERE archived_at IS NULL;

CREATE TABLE evaluation_bucket_sets (
    id UUID PRIMARY KEY,
    account_slot TEXT NOT NULL UNIQUE REFERENCES evaluator_accounts(slot_key) ON DELETE CASCADE,
    starter_version TEXT NOT NULL DEFAULT '2026-08-08-v1',
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ
);

INSERT INTO evaluation_bucket_sets (id, account_slot) VALUES
    ('00000000-0000-4000-8000-000000000001', 'admin'),
    ('00000000-0000-4000-8000-000000000002', 'editor-1'),
    ('00000000-0000-4000-8000-000000000003', 'editor-2'),
    ('00000000-0000-4000-8000-000000000004', 'editor-3')
ON CONFLICT (account_slot) DO NOTHING;

CREATE TABLE evaluation_buckets (
    id UUID PRIMARY KEY,
    bucket_set_id UUID NOT NULL REFERENCES evaluation_bucket_sets(id) ON DELETE CASCADE,
    standard_key TEXT CHECK (standard_key IN ('success', 'needs-work', 'handoff')),
    label TEXT NOT NULL CHECK (LENGTH(label) BETWEEN 1 AND 40),
    color_key TEXT NOT NULL CHECK (color_key IN ('blue', 'sky', 'eggplant', 'coral')),
    sort_position INTEGER NOT NULL CHECK (sort_position >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    UNIQUE (id, bucket_set_id),
    UNIQUE (bucket_set_id, standard_key),
    UNIQUE (bucket_set_id, sort_position)
);

INSERT INTO evaluation_buckets
    (id, bucket_set_id, standard_key, label, color_key, sort_position)
VALUES
    ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'success', 'Success', 'sky', 10),
    ('10000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000001', 'needs-work', 'Needs work', 'coral', 20),
    ('10000000-0000-4000-8000-000000000003', '00000000-0000-4000-8000-000000000001', 'handoff', 'Handoff', 'blue', 30),
    ('10000000-0000-4000-8000-000000000004', '00000000-0000-4000-8000-000000000002', 'success', 'Success', 'sky', 10),
    ('10000000-0000-4000-8000-000000000005', '00000000-0000-4000-8000-000000000002', 'needs-work', 'Needs work', 'coral', 20),
    ('10000000-0000-4000-8000-000000000006', '00000000-0000-4000-8000-000000000002', 'handoff', 'Handoff', 'blue', 30),
    ('10000000-0000-4000-8000-000000000007', '00000000-0000-4000-8000-000000000003', 'success', 'Success', 'sky', 10),
    ('10000000-0000-4000-8000-000000000008', '00000000-0000-4000-8000-000000000003', 'needs-work', 'Needs work', 'coral', 20),
    ('10000000-0000-4000-8000-000000000009', '00000000-0000-4000-8000-000000000003', 'handoff', 'Handoff', 'blue', 30),
    ('10000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000004', 'success', 'Success', 'sky', 10),
    ('10000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000004', 'needs-work', 'Needs work', 'coral', 20),
    ('10000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000004', 'handoff', 'Handoff', 'blue', 30)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE conversation_evaluations (
    bucket_set_id UUID NOT NULL REFERENCES evaluation_bucket_sets(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    bucket_id UUID,
    transcript_version BIGINT NOT NULL CHECK (transcript_version >= 0),
    note TEXT CHECK (note IS NULL OR LENGTH(note) <= 1000),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket_set_id, conversation_id),
    FOREIGN KEY (bucket_id, bucket_set_id)
        REFERENCES evaluation_buckets(id, bucket_set_id)
);

CREATE INDEX ix_conversation_evaluations_bucket
    ON conversation_evaluations (bucket_set_id, bucket_id, updated_at DESC);

CREATE TABLE evaluation_audit_events (
    id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE,
    actor_slot TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    action TEXT NOT NULL CHECK (action IN (
        'bucket.create', 'bucket.update', 'bucket.archive',
        'conversation.move', 'conversation.note',
        'account.invite', 'account.claim', 'account.disable'
    )),
    bucket_set_id UUID REFERENCES evaluation_bucket_sets(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    bucket_id UUID REFERENCES evaluation_buckets(id) ON DELETE SET NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (pg_column_size(metadata) <= 4096)
);

CREATE INDEX ix_evaluation_audit_actor_time
    ON evaluation_audit_events (actor_slot, created_at DESC);

CREATE FUNCTION prevent_evaluation_audit_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'evaluation audit events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER evaluation_audit_events_append_only
BEFORE UPDATE OR DELETE ON evaluation_audit_events
FOR EACH ROW EXECUTE FUNCTION prevent_evaluation_audit_mutation();

ALTER TABLE conversation_messages
    ADD CONSTRAINT conversation_messages_id_conversation_unique
        UNIQUE (id, conversation_id);

CREATE TABLE conversation_annotations (
    bucket_set_id UUID NOT NULL
        REFERENCES evaluation_bucket_sets(id) ON DELETE CASCADE,
    conversation_id UUID NOT NULL
        REFERENCES conversations(id) ON DELETE CASCADE,
    message_id UUID NOT NULL,
    category TEXT NOT NULL CHECK (
        category IN ('helpful', 'unclear', 'incorrect', 'unsafe', 'other')
    ),
    note TEXT CHECK (note IS NULL OR LENGTH(note) <= 500),
    transcript_version BIGINT NOT NULL CHECK (transcript_version >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    updated_by TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (bucket_set_id, conversation_id, message_id),
    FOREIGN KEY (message_id, conversation_id)
        REFERENCES conversation_messages(id, conversation_id) ON DELETE CASCADE
);

CREATE INDEX ix_conversation_annotations_reviewer
    ON conversation_annotations (bucket_set_id, conversation_id, updated_at DESC);

ALTER TABLE evaluation_audit_events
    DROP CONSTRAINT evaluation_audit_events_action_check,
    ADD CONSTRAINT evaluation_audit_events_action_check CHECK (action IN (
        'bucket.create', 'bucket.update', 'bucket.archive',
        'conversation.move', 'conversation.note', 'conversation.annotation',
        'account.invite', 'account.claim', 'account.disable'
    ));

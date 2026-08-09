CREATE TABLE conversations (
    id UUID PRIMARY KEY,
    capture_mode TEXT NOT NULL CHECK (capture_mode IN ('metadata', 'transcript')),
    client_surface TEXT NOT NULL DEFAULT 'unknown',
    page_context JSONB NOT NULL DEFAULT '{}'::jsonb,
    app_version TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_turn_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE conversation_turns (
    id UUID PRIMARY KEY,
    sequence BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    client_event_id UUID NOT NULL UNIQUE,
    user_message_id UUID NOT NULL,
    assistant_message_id UUID NOT NULL,
    request_fingerprint TEXT NOT NULL CHECK (LENGTH(request_fingerprint) = 64),
    lease_id UUID NOT NULL,
    capture_mode TEXT NOT NULL CHECK (capture_mode IN ('metadata', 'transcript')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'complete', 'failed')),
    privacy_state TEXT NOT NULL,
    review_state TEXT NOT NULL CHECK (review_state IN ('pending', 'ready', 'excluded')),
    response_kind TEXT,
    retrieval_scope TEXT,
    source_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
    model TEXT,
    model_called BOOLEAN NOT NULL DEFAULT FALSE,
    latency_ms INTEGER,
    prompt_version TEXT NOT NULL,
    app_version TEXT NOT NULL,
    error_code TEXT,
    response_json JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE conversation_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    turn_id UUID NOT NULL REFERENCES conversation_turns(id) ON DELETE CASCADE,
    ordinal SMALLINT NOT NULL CHECK (ordinal IN (0, 1)),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (turn_id, ordinal)
);

CREATE INDEX ix_conversation_turns_review_queue
    ON conversation_turns (review_state, created_at DESC);
CREATE INDEX ix_conversation_turns_conversation_sequence
    ON conversation_turns (conversation_id, sequence);
CREATE INDEX ix_conversation_messages_conversation
    ON conversation_messages (conversation_id, created_at);
CREATE INDEX ix_conversations_expiry ON conversations (expires_at);

ALTER TABLE conversation_turns
    ADD COLUMN page_context JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX ix_conversation_turns_page_source
    ON conversation_turns ((page_context ->> 'source_id'));

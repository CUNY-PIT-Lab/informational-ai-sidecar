ALTER TABLE conversation_turns
    ADD COLUMN chat_stage TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN request_kind TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN request_language TEXT NOT NULL DEFAULT 'und',
    ADD COLUMN response_language TEXT NOT NULL DEFAULT 'und',
    ADD COLUMN prompt_policy_version TEXT NOT NULL DEFAULT 'legacy';

UPDATE conversation_turns AS t
SET review_state = 'pending'
FROM conversations AS c
WHERE c.id = t.conversation_id
  AND c.client_surface <> 'synthetic'
  AND t.review_state = 'ready';

ALTER TABLE conversation_turns
    ADD CONSTRAINT conversation_turns_privacy_state_valid
        CHECK (privacy_state IN ('pending', 'clear', 'blocked', 'sensitive_handoff')),
    ADD CONSTRAINT conversation_turns_response_kind_valid
        CHECK (response_kind IS NULL OR response_kind IN ('clarify', 'answer', 'handoff', 'privacy')),
    ADD CONSTRAINT conversation_turns_retrieval_scope_valid
        CHECK (retrieval_scope IS NULL OR retrieval_scope IN ('page', 'site', 'staff')),
    ADD CONSTRAINT conversation_turns_chat_stage_valid
        CHECK (chat_stage IN ('unknown', 'opening', 'follow_up')),
    ADD CONSTRAINT conversation_turns_request_kind_valid
        CHECK (request_kind IN ('unknown', 'privacy', 'sensitive', 'clarification', 'navigation', 'procedure', 'retrieval')),
    ADD CONSTRAINT conversation_turns_request_language_valid
        CHECK (request_language IN ('und', 'en', 'es', 'other')),
    ADD CONSTRAINT conversation_turns_response_language_valid
        CHECK (response_language IN ('und', 'en', 'es', 'other')),
    ADD CONSTRAINT conversation_turns_prompt_policy_version_valid
        CHECK (LENGTH(prompt_policy_version) BETWEEN 1 AND 80),
    ADD CONSTRAINT conversation_turns_ready_is_safe
        CHECK (review_state <> 'ready' OR (
            status = 'complete' AND privacy_state = 'clear'
        ));

CREATE INDEX ix_conversation_turns_interaction_quality
    ON conversation_turns (
        prompt_policy_version,
        request_kind,
        chat_stage,
        request_language,
        created_at DESC
    );

CREATE OR REPLACE FUNCTION enforce_synthetic_review_ready()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.review_state = 'ready' AND NOT EXISTS (
        SELECT 1
        FROM conversations AS c
        WHERE c.id = NEW.conversation_id
          AND c.client_surface = 'synthetic'
    ) THEN
        RAISE EXCEPTION 'review-ready turns must belong to a synthetic conversation'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER conversation_turns_ready_is_synthetic
    BEFORE INSERT OR UPDATE OF review_state, conversation_id
    ON conversation_turns
    FOR EACH ROW
    EXECUTE FUNCTION enforce_synthetic_review_ready();

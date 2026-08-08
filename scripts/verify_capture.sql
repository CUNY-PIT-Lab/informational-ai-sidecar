\set ON_ERROR_STOP on

SELECT json_build_object(
    'schema_current', EXISTS (
        SELECT 1 FROM schema_migrations
        WHERE version = '002_turn_page_context'
    ),
    'clear_turn_count', (
        SELECT COUNT(*) FROM conversation_turns
        WHERE id = :'clear_turn'::uuid
          AND client_event_id = :'clear_event'::uuid
          AND status = 'complete'
          AND review_state = 'ready'
    ),
    'clear_message_count', (
        SELECT COUNT(*) FROM conversation_messages
        WHERE turn_id = :'clear_turn'::uuid
    ),
    'privacy_turn_count', (
        SELECT COUNT(*) FROM conversation_turns
        WHERE id = :'privacy_turn'::uuid
          AND client_event_id = :'privacy_event'::uuid
          AND status = 'complete'
          AND review_state = 'excluded'
          AND privacy_state = 'blocked'
    ),
    'privacy_message_count', (
        SELECT COUNT(*) FROM conversation_messages
        WHERE turn_id = :'privacy_turn'::uuid
    ),
    'sentinel_message_hits', (
        SELECT COUNT(*) FROM conversation_messages
        WHERE content LIKE '%' || :'sentinel' || '%'
    ),
    'sentinel_response_hits', (
        SELECT COUNT(*) FROM conversation_turns
        WHERE response_json::text LIKE '%' || :'sentinel' || '%'
    ),
    'continuation_token_hits', (
        SELECT COUNT(*) FROM conversation_turns
        WHERE response_json ? 'conversation_token'
    ),
    'server_owned_page_context', (
        SELECT page_context ->> 'source_id'
        FROM conversation_turns
        WHERE id = :'clear_turn'::uuid
    ),
    'expires_within_retention_window', (
        SELECT expires_at > NOW() AND expires_at <= NOW() + INTERVAL '31 days'
        FROM conversations
        WHERE id = :'clear_conversation'::uuid
    )
)::text;

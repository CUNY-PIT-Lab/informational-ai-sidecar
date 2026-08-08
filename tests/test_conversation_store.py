#!/usr/bin/env python3
"""Key-free tests for privacy-bounded conversation persistence."""

import pathlib
import sys
import unittest
import uuid


DEMO = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO))

import conversation_store
import server


class _Context:
    def __init__(self, value):
        self.value = value

    def __enter__(self):
        return self.value

    def __exit__(self, *_args):
        return False


class _RecordingCursor:
    def __init__(self):
        self.calls = []
        self.many = []
        self.rowcount = 1

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query, params=None):
        self.calls.append((query, params))

    def executemany(self, query, params):
        self.many.append((query, list(params)))


class _RecordingConnection:
    def __init__(self, cursor):
        self._cursor = cursor

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def transaction(self):
        return _Context(self)

    def cursor(self, **_kwargs):
        return _Context(self._cursor)


class _RecordingPool:
    def __init__(self):
        self.cursor = _RecordingCursor()
        self.connection_value = _RecordingConnection(self.cursor)

    def connection(self):
        return _Context(self.connection_value)


def persisted_reservation(mode="none"):
    value = conversation_store.new_reservation(mode=mode)
    return conversation_store.TurnReservation(**{
        **value.__dict__,
        "persisted": True,
    })


def recording_recorder(mode):
    recorder = conversation_store.ConversationRecorder(
        database_url="postgresql://not-used",
        mode=mode,
        token_secret="test-secret-" * 4,
    )
    recorder._pool = _RecordingPool()
    recorder._jsonb = lambda value: value
    return recorder


class ConversationStoreTests(unittest.TestCase):
    def test_capture_is_disabled_by_default_and_needs_no_database(self):
        recorder = conversation_store.ConversationRecorder(
            database_url="",
            mode="none",
        )
        recorder.open()
        turn = recorder.begin_turn(question="A synthetic question")
        self.assertFalse(turn.persisted)
        self.assertFalse(recorder.complete_turn(
            turn,
            question="A synthetic question",
            response={"message": "A synthetic answer"},
            privacy_state="clear",
            latency_ms=1,
        ))

    def test_enabled_capture_requires_database_and_a_long_token_secret(self):
        with self.assertRaises(conversation_store.CaptureUnavailable):
            conversation_store.ConversationRecorder(
                database_url="",
                mode="metadata",
                token_secret="x" * 32,
            ).open()
        with self.assertRaises(conversation_store.CaptureUnavailable):
            conversation_store.ConversationRecorder(
                database_url="postgresql://not-used",
                mode="transcript",
                token_secret="short",
            ).open()

    def test_conversation_continuation_requires_the_server_token(self):
        recorder = conversation_store.ConversationRecorder(
            database_url="postgresql://not-used",
            mode="metadata",
            token_secret="continuation-secret-" * 2,
        )
        conversation_id = str(uuid.uuid4())
        token = recorder.conversation_token(conversation_id)
        self.assertEqual(
            recorder.accepted_conversation_id(conversation_id, token),
            conversation_id,
        )
        self.assertIsNone(
            recorder.accepted_conversation_id(conversation_id, "wrong-token")
        )

    def test_metadata_capture_never_writes_message_content(self):
        recorder = recording_recorder("metadata")
        recorder.complete_turn(
            persisted_reservation("metadata"),
            question="SYNTHETIC QUESTION",
            response={"kind": "answer", "message": "SYNTHETIC ANSWER"},
            privacy_state="clear",
            latency_ms=4,
        )
        self.assertEqual(recorder._pool.cursor.many, [])
        recorded = repr(recorder._pool.cursor.calls)
        self.assertNotIn("SYNTHETIC QUESTION", recorded)
        self.assertNotIn("SYNTHETIC ANSWER", recorded)

    def test_privacy_held_turn_never_writes_message_content_or_token(self):
        recorder = recording_recorder("transcript")
        recorder.complete_turn(
            persisted_reservation("transcript"),
            question="SENSITIVE-SENTINEL",
            response={
                "kind": "privacy",
                "message": "Remove personal information.",
                "conversation_token": "CAPABILITY-SENTINEL",
            },
            privacy_state="blocked",
            latency_ms=5,
        )
        cursor = recorder._pool.cursor
        self.assertEqual(cursor.many, [])
        recorded = repr(cursor.calls)
        self.assertNotIn("SENSITIVE-SENTINEL", recorded)
        self.assertNotIn("CAPABILITY-SENTINEL", recorded)

    def test_transcript_mode_writes_only_a_clear_turns_two_messages(self):
        recorder = recording_recorder("transcript")
        recorder.complete_turn(
            persisted_reservation("transcript"),
            question="SYNTHETIC QUESTION",
            response={"kind": "answer", "message": "SYNTHETIC ANSWER"},
            privacy_state="clear",
            latency_ms=6,
        )
        message_rows = recorder._pool.cursor.many[0][1]
        self.assertEqual([row[4] for row in message_rows], ["user", "assistant"])
        self.assertEqual([row[5] for row in message_rows], [
            "SYNTHETIC QUESTION",
            "SYNTHETIC ANSWER",
        ])

    def test_capture_page_context_uses_only_server_index_values(self):
        captured = server.capture_page_context({
            "url": "https://www.fortunedigitalequity.org/devices",
            "path": "/private-value",
            "title": "SENSITIVE-SENTINEL",
        })
        self.assertEqual(captured["source_id"], "devices")
        self.assertEqual(captured["path"], "/devices")
        self.assertNotEqual(captured["title"], "SENSITIVE-SENTINEL")
        self.assertEqual(
            server.capture_page_context({"url": "https://example.com/private"}),
            {"source_id": "", "url": "", "path": "", "title": "", "authority": ""},
        )

    def test_migration_makes_client_event_ids_globally_unique(self):
        migration = (DEMO / "migrations" / "001_conversation_capture.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn("client_event_id UUID NOT NULL UNIQUE", migration)
        self.assertIn("request_fingerprint", migration)
        turn_context = (DEMO / "migrations" / "002_turn_page_context.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn("ADD COLUMN page_context JSONB", turn_context)
        self.assertEqual(conversation_store.SCHEMA_VERSION, "002_turn_page_context")


if __name__ == "__main__":
    unittest.main(verbosity=2)

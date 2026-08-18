#!/usr/bin/env python3

import pathlib
import sys
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import reset_evaluation_transcripts as reset_script


class FakeCursor:
    def __init__(self, counts):
        self.counts = counts
        self.last_table = ""
        self.applied = False

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, query):
        normalized = " ".join(query.split())
        if normalized.startswith("SELECT COUNT(*) AS count FROM evaluation_audit_events"):
            self.last_table = "conversation_review_audit_events"
        elif normalized.startswith("SELECT COUNT(*) AS count FROM "):
            self.last_table = normalized.rsplit(" ", 1)[-1]
        elif normalized == "DELETE FROM conversations":
            self.applied = True
            for table in reset_script.TRANSCRIPT_TABLES:
                self.counts[table] = 0
        elif normalized.startswith("DELETE FROM evaluation_audit_events"):
            self.counts["conversation_review_audit_events"] = 0

    def fetchone(self):
        return {"count": self.counts[self.last_table]}


class FakeTransaction:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeConnection:
    def __init__(self, counts):
        self.cursor_value = FakeCursor(counts)

    def transaction(self):
        return FakeTransaction()

    def cursor(self):
        return self.cursor_value


class ResetEvaluationTranscriptsTests(unittest.TestCase):
    def counts(self):
        return {
            **{table: 5 for table in reset_script.TRANSCRIPT_TABLES},
            "conversation_review_audit_events": 2,
            **{table: 3 for table in reset_script.PRESERVED_TABLES},
        }

    def test_dry_run_does_not_delete(self):
        connection = FakeConnection(self.counts())
        result = reset_script.reset(connection)
        self.assertEqual(result["mode"], "dry-run")
        self.assertEqual(result["before"], result["after"])
        self.assertFalse(connection.cursor_value.applied)

    def test_apply_clears_only_transcript_domain(self):
        connection = FakeConnection(self.counts())
        result = reset_script.reset(connection, apply=True, expect_conversations=5)
        self.assertTrue(connection.cursor_value.applied)
        self.assertEqual(set(result["after"].values()), {0})
        self.assertEqual(result["preserved_before"], result["preserved_after"])

    def test_expected_count_prevents_stale_destructive_run(self):
        connection = FakeConnection(self.counts())
        with self.assertRaisesRegex(RuntimeError, "Conversation count changed"):
            reset_script.reset(connection, apply=True, expect_conversations=257)
        self.assertFalse(connection.cursor_value.applied)

    def test_database_url_is_environment_only(self):
        source = (ROOT / "scripts" / "reset_evaluation_transcripts.py").read_text()
        self.assertIn('os.environ.get("DATABASE_URL"', source)
        self.assertNotIn("--database-url", source)
        self.assertIn("DELETE FROM conversations", source)
        self.assertIn("DISABLE TRIGGER evaluation_audit_events_append_only", source)
        self.assertIn("WHERE conversation_id IS NOT NULL", source)
        self.assertNotIn("DELETE FROM prompt_", source)


if __name__ == "__main__":
    unittest.main()

#!/usr/bin/env python3
"""Security and schema contracts for the evaluator foundation."""

import pathlib
import sys
import unittest


DEMO = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO))

import evaluation_store


class EvaluationSchemaTests(unittest.TestCase):
    def test_identity_migration_seeds_exactly_four_inert_slots(self):
        sql = (DEMO / "migrations" / "003_evaluator_identity.sql").read_text(
            encoding="utf-8"
        )
        seed = sql.split("INSERT INTO evaluator_accounts", 1)[1].split(
            "ON CONFLICT", 1
        )[0]
        expected_rows = {
            "admin": "admin",
            "editor-1": "editor",
            "editor-2": "editor",
            "editor-3": "editor",
        }
        for slot, role in expected_rows.items():
            self.assertEqual(seed.count(f"('{slot}', '{role}')"), 1)
        self.assertNotIn("@", seed)
        self.assertNotIn("token_urlsafe", seed)
        self.assertIn("password_hash IS NULL OR password_hash LIKE '$argon2id$%'", sql)
        self.assertIn("token_hash CHAR(64) NOT NULL UNIQUE", sql)

    def test_taxonomy_is_reviewer_specific_and_audit_is_append_only(self):
        sql = (DEMO / "migrations" / "004_evaluation_taxonomy.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn("account_slot TEXT NOT NULL UNIQUE", sql)
        self.assertIn("PRIMARY KEY (bucket_set_id, conversation_id)", sql)
        self.assertIn("UNIQUE (operation_id)", sql.replace("operation_id UUID NOT NULL UNIQUE", "UNIQUE (operation_id)"))
        self.assertIn("evaluation_audit_events_append_only", sql)
        self.assertIn("'Success'", sql)
        self.assertIn("'Needs work'", sql)
        self.assertIn("'Handoff'", sql)
        self.assertNotIn("conversation_messages.content", sql)

    def test_evaluation_schema_version_is_separate_from_capture_schema(self):
        self.assertEqual(
            evaluation_store.EVALUATION_SCHEMA_VERSION,
            "006_transcript_annotations",
        )
        self.assertEqual(evaluation_store.COOKIE_NAME, "__Host-fs_eval")


class EvaluationStoreBoundaryTests(unittest.TestCase):
    def test_disabled_store_needs_no_database_or_auth_secret(self):
        store = evaluation_store.EvaluationStore(
            database_url="", enabled=False, auth_secret=""
        )
        store.open()
        self.assertFalse(store.ready)
        self.assertEqual(
            store.public_status(),
            {
                "enabled": False,
                "ready": False,
                "total_slots": 4,
                "claimed_slots": 0,
                "unassigned_slots": 4,
            },
        )

    def test_email_name_password_and_uuid_inputs_are_bounded(self):
        self.assertEqual(evaluation_store._normalize_email(" A@Example.org "), "a@example.org")
        self.assertEqual(evaluation_store._display_name("  Student   Delegate "), "Student Delegate")
        self.assertEqual(len(evaluation_store._password("correct horse battery")), 21)
        with self.assertRaises(evaluation_store.EvaluationValidation):
            evaluation_store._normalize_email("not-an-email")
        with self.assertRaises(evaluation_store.EvaluationValidation):
            evaluation_store._password("short")
        with self.assertRaises(evaluation_store.EvaluationValidation):
            evaluation_store._uuid("not-a-uuid", "operation_id")

    def test_notes_and_annotation_categories_are_bounded(self):
        self.assertEqual(
            evaluation_store._reviewer_note(
                "  Clear next step.  ", maximum=1000, label="Note"
            ),
            "Clear next step.",
        )
        self.assertEqual(
            evaluation_store._annotation_category("HELPFUL"), "helpful"
        )
        self.assertIsNone(
            evaluation_store._annotation_category("", allow_empty=True)
        )
        with self.assertRaises(evaluation_store.EvaluationValidation):
            evaluation_store._reviewer_note(
                "x" * 501, maximum=500, label="Annotation note"
            )
        with self.assertRaises(evaluation_store.EvaluationValidation):
            evaluation_store._annotation_category("private-data")

    def test_annotation_migration_is_reviewer_specific_and_transcript_free(self):
        sql = (DEMO / "migrations" / "006_transcript_annotations.sql").read_text(
            encoding="utf-8"
        )
        self.assertIn(
            "PRIMARY KEY (bucket_set_id, conversation_id, message_id)", sql
        )
        self.assertIn("conversation.annotation", sql)
        self.assertIn("LENGTH(note) <= 500", sql)
        self.assertNotIn("message_content", sql)
        self.assertNotIn("conversation_messages.content", sql)

    def test_session_and_csrf_digests_are_purpose_separated(self):
        store = evaluation_store.EvaluationStore(
            database_url="postgresql://unused",
            enabled=True,
            auth_secret="test-secret-value-" * 3,
        )
        session_digest = store._digest("session", "same-token")
        csrf_digest = store._digest("csrf", "same-token")
        self.assertEqual(len(session_digest), 64)
        self.assertNotEqual(session_digest, csrf_digest)
        self.assertTrue(store.csrf_matches("same-token", csrf_digest))
        self.assertFalse(store.csrf_matches("same-token", session_digest))

    def test_claimed_account_reset_revokes_sessions_without_deleting_reviewer_data(self):
        source = (DEMO / "evaluation_store.py").read_text(encoding="utf-8")
        script = (DEMO / "scripts" / "reset_evaluator_invite.py").read_text(
            encoding="utf-8"
        )
        reset = source.split("def reset_account_invitation", 1)[1].split(
            "def list_accounts", 1
        )[0]
        self.assertIn("UPDATE evaluator_sessions", reset)
        self.assertIn("revoked_at = NOW()", reset)
        self.assertIn("auth_version = auth_version + 1", reset)
        self.assertIn("password_hash = NULL", reset)
        self.assertIn("claimed_at = NULL", reset)
        self.assertNotIn("DELETE FROM", reset)
        self.assertIn("credential_reset", reset)
        self.assertIn("--confirm-reset", script)


class EvaluationFrontendContractTests(unittest.TestCase):
    def test_review_surface_fits_multiple_buckets_and_stays_concise(self):
        html = (DEMO / "evaluation.html").read_text(encoding="utf-8")
        css = (DEMO / "evaluation.css").read_text(encoding="utf-8")
        javascript = (DEMO / "evaluation.js").read_text(encoding="utf-8")
        self.assertIn("Review conversations", html)
        self.assertNotIn("Conversation queue", html)
        self.assertNotIn("conversation-filter", html)
        self.assertIn(
            "repeat(auto-fit, minmax(min(280px, 100%), 1fr))",
            css,
        )
        self.assertIn(
            "repeat(auto-fit, minmax(min(210px, 100%), 1fr))",
            css,
        )
        self.assertIn('{ id: null, label: "Not yet reviewed"', javascript)
        for label in ("Success", "Needs work", "Handoff"):
            self.assertIn(f'label: "{label}"', javascript)
        self.assertNotIn('label: "Mostly works"', javascript)
        self.assertIn('addEventListener("drop"', javascript)
        self.assertIn("card-move", javascript)
        self.assertIn("conversation.evaluation_version = Number(evaluation.version", javascript)
        self.assertIn('id="bucket-visibility"', html)
        self.assertIn('id="bucket-sort"', html)
        self.assertIn('id="bucket-layout"', html)
        self.assertIn('board[data-layout="compact"]', css)
        self.assertIn('layout: "compact"', javascript)
        self.assertIn('viewKeyPrefix = "fortune-evaluation-view-v2"', javascript)
        self.assertIn('id="review-note"', html)
        self.assertIn('maxlength="1000"', html)
        self.assertIn("annotation-toggle", javascript)
        self.assertIn('maxlength="500"', javascript)
        self.assertIn("localStorage.setItem", javascript)
        self.assertIn('class="invite-form"', javascript)
        self.assertIn('"invitation_path"', (DEMO / "server.py").read_text(encoding="utf-8"))
        self.assertIn("Link ready · single use", javascript)


if __name__ == "__main__":
    unittest.main(verbosity=2)

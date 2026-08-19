#!/usr/bin/env python3
"""Contracts for keeping automated runs out of the reviewer queue."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import tempfile
import unittest


DEMO = pathlib.Path(__file__).resolve().parents[1]
SCRIPT_PATH = DEMO / "scripts" / "exclude_evaluation_runs.py"
SPEC = importlib.util.spec_from_file_location("exclude_evaluation_runs", SCRIPT_PATH)
assert SPEC and SPEC.loader
exclude_evaluation_runs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(exclude_evaluation_runs)


class ExcludeEvaluationRunsTests(unittest.TestCase):
    def test_artifacts_are_filtered_by_target_and_ids_are_deduplicated(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            staging_id = "11111111-1111-4111-8111-111111111111"
            second_id = "22222222-2222-4222-8222-222222222222"
            production_id = "33333333-3333-4333-8333-333333333333"
            (root / "staging.json").write_text(json.dumps({
                "target": {"base_url": "https://staging.example/"},
                "results": [
                    {"response": {"conversation_id": staging_id}},
                    {"conversation_id_sent": staging_id},
                    {"response": {"conversation_id": second_id}},
                ],
            }), encoding="utf-8")
            (root / "production.json").write_text(json.dumps({
                "target": {"base_url": "https://production.example"},
                "response": {"conversation_id": production_id},
            }), encoding="utf-8")
            (root / "invalid.json").write_text("not json", encoding="utf-8")

            files, ids = exclude_evaluation_runs.collect_conversation_ids(
                root, "https://staging.example"
            )

            self.assertEqual([path.name for path in files], ["staging.json"])
            self.assertEqual(ids, {staging_id, second_id})

    def test_operator_script_is_dry_run_first_and_never_deletes_transcripts(self):
        source = SCRIPT_PATH.read_text(encoding="utf-8")
        self.assertIn('action="store_true"', source)
        self.assertIn("if apply:", source)
        self.assertIn("SET review_state = 'pending'", source)
        self.assertIn("SET client_surface = 'benchmark'", source)
        self.assertIn("conversation_evaluations", source)
        self.assertIn("conversation_annotations", source)
        self.assertIn("evaluation_audit_events", source)
        self.assertIn("pg_advisory_xact_lock", source)
        self.assertIn('os.environ.get("DATABASE_URL", "")', source)
        self.assertNotIn('add_argument("--database-url"', source)
        self.assertNotIn("DELETE FROM conversation", source)

    def test_live_test_clients_use_the_hidden_benchmark_surface(self):
        paths = (
            DEMO / "scripts" / "run_website_guide_eval.py",
            DEMO / "scripts" / "run_website_guide_multiturn_eval.py",
            DEMO / "scripts" / "verify_capture.py",
        )
        for path in paths:
            with self.subTest(path=path.name):
                source = path.read_text(encoding="utf-8")
                self.assertIn('"client_surface": "benchmark"', source)
                self.assertNotIn('"client_surface": "synthetic"', source)


if __name__ == "__main__":
    unittest.main(verbosity=2)

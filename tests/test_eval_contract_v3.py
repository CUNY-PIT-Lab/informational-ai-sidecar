#!/usr/bin/env python3
"""Bounded grader-v3 checks for explicit confirmation turns."""

import hashlib
import importlib.util
import json
import pathlib
import unittest


ROOT = pathlib.Path(__file__).resolve().parents[1]
EVAL_ROOT = ROOT / "evals" / "website-guide"


def load_runner(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


single = load_runner("website_guide_eval_v3", ROOT / "scripts" / "run_website_guide_eval.py")


class GraderV3ContractTests(unittest.TestCase):
    def test_v3_preserves_cases_and_limits_advancement_exceptions(self):
        cases_path = EVAL_ROOT / "multiturn-cases-2026-08-17.json"
        spec_path = EVAL_ROOT / "multiturn-spec-2026-08-17-v3.json"
        cases = json.loads(cases_path.read_text(encoding="utf-8"))
        grader = json.loads(spec_path.read_text(encoding="utf-8"))

        self.assertEqual(
            hashlib.sha256(cases_path.read_bytes()).hexdigest(),
            grader["lineage"]["frozen_cases_sha256"],
        )
        suite = single.apply_grader_overrides(cases, grader, unit_kind="turns")
        exceptions = {
            f"{episode['id']}/{turn['id']}"
            for episode in suite["episodes"]
            for turn in episode["turns"]
            if turn["expect"].get("advancement_required") is False
        }
        self.assertEqual(exceptions, {
            "current_faq_conversation/full-attendance-exception",
            "stale_fact_negatives/phone-availability-follow-up",
        })

    def test_phone_confirmation_keeps_every_factual_gate(self):
        cases = json.loads(
            (EVAL_ROOT / "multiturn-cases-2026-08-17.json").read_text(encoding="utf-8")
        )
        grader = json.loads(
            (EVAL_ROOT / "multiturn-spec-2026-08-17-v3.json").read_text(encoding="utf-8")
        )
        suite = single.apply_grader_overrides(cases, grader, unit_kind="turns")
        episode = next(row for row in suite["episodes"] if row["id"] == "stale_fact_negatives")
        turn = next(row for row in episode["turns"] if row["id"] == "phone-availability-follow-up")
        expect = turn["expect"]

        self.assertFalse(expect["advancement_required"])
        self.assertEqual(expect["kind_in"], ["answer"])
        self.assertTrue(expect["model_called"])
        self.assertEqual(expect["source_match_any"], ["devices"])
        self.assertEqual(expect["message_contains_any"], ["on hold", "currently on hold"])


if __name__ == "__main__":
    unittest.main()

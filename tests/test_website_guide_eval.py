import contextlib
import copy
import io
import pathlib
import sys
import unittest
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from scripts import run_website_guide_eval
from scripts import run_website_guide_multiturn_eval
from scripts import verify_capture


def response_contract(*, kind="answer", model_called=True):
    return {
        "kind": kind,
        "message": "Supported response.",
        "reason": "From an approved page.",
        "sources": [
            {
                "id": "home",
                "title": "Digital Equity",
                "url": "https://www.fortunedigitalequity.org/",
            }
        ],
        "related": [],
        "choices": [],
        "handoff_url": "https://www.fortunedigitalequity.org/contact",
        "model": "test-model",
        "model_called": model_called,
        "retrieval_scope": "site",
        "continuation": None,
        "conversation_id": "00000000-0000-4000-8000-000000000001",
        "turn_id": "00000000-0000-4000-8000-000000000002",
        "client_event_id": "00000000-0000-4000-8000-000000000003",
        "message_ids": {
            "user": "00000000-0000-4000-8000-000000000004",
            "assistant": "00000000-0000-4000-8000-000000000005",
        },
        "capture": {"mode": "none", "stored": False},
        "chat_stage": "opening",
        "request_kind": "privacy" if kind == "privacy" else "retrieval",
        "request_language": "en",
        "response_language": "en",
        "prompt_policy_version": "test-policy",
    }


def result_row(index, *, kind="answer", model_called=True):
    return {
        "id": f"turn-{index}",
        "level": "release",
        "slice": "retrieval",
        "status": 200,
        "latency_ms": 100.0,
        "transport_error": None,
        "passed": True,
        "failures": [],
        "response": response_contract(kind=kind, model_called=model_called),
    }


class WebsiteGuideEvaluationSuiteTests(unittest.TestCase):
    def setUp(self):
        self.document = run_website_guide_eval.load_json(
            ROOT / "evals" / "website-guide" / "cases.json"
        )

    def test_suite_has_required_size_slices_and_hard_controls(self):
        self.assertEqual(run_website_guide_eval.validate_suite(self.document), [])
        self.assertGreaterEqual(len(self.document["cases"]), 25)
        self.assertGreaterEqual(
            len({case["slice"] for case in self.document["cases"]}), 8
        )
        self.assertTrue(any(case["level"] == "hard" for case in self.document["cases"]))

    def test_case_ids_are_unique(self):
        case_ids = [case["id"] for case in self.document["cases"]]
        self.assertEqual(len(case_ids), len(set(case_ids)))

    def test_suite_explicitly_covers_every_request_and_response_kind(self):
        response_kinds = {
            value
            for case in self.document["cases"]
            for value in case["expect"].get("kind_in", [])
        }
        request_kinds = {
            value
            for case in self.document["cases"]
            for value in case["expect"].get("request_kind_in", [])
        }
        self.assertEqual(response_kinds, run_website_guide_eval.RESPONSE_KINDS)
        self.assertEqual(request_kinds, run_website_guide_eval.REQUEST_KINDS)

    def test_question_limit_control_exceeds_the_browser_boundary_by_one(self):
        case = next(
            case for case in self.document["cases"] if case["id"] == "over_client_limit"
        )
        self.assertEqual(len(run_website_guide_eval.expanded_message(case)), 601)
        self.assertEqual(case["expect"]["status"], 400)

    def test_authority_check_accepts_only_https_fortune_urls(self):
        self.assertTrue(
            run_website_guide_eval.allowed_url(
                "https://www.fortunedigitalequity.org/trainings"
            )
        )
        self.assertFalse(run_website_guide_eval.allowed_url("http://www.fortunedigitalequity.org/trainings"))
        self.assertFalse(run_website_guide_eval.allowed_url("https://example.com/trainings"))

    def test_capture_none_does_not_require_a_continuation_token(self):
        self.assertNotIn("conversation_token", run_website_guide_eval.REQUIRED_FIELDS)

    def test_wilson_interval_is_bounded_and_contains_the_rate(self):
        low, high = run_website_guide_eval.wilson_interval(26, 34)
        self.assertGreaterEqual(low, 0)
        self.assertLessEqual(high, 1)
        self.assertLessEqual(low, 26 / 34)
        self.assertGreaterEqual(high, 26 / 34)

    def test_kind_breakdown_reports_latency_copy_and_model_use(self):
        rows = [
            {
                "status": 200,
                "latency_ms": 100.0,
                "passed": True,
                "response": {
                    "kind": "answer",
                    "request_kind": "retrieval",
                    "message": "Open the device page.",
                    "model_called": True,
                },
            },
            {
                "status": 200,
                "latency_ms": 200.0,
                "passed": True,
                "response": {
                    "kind": "answer",
                    "request_kind": "retrieval",
                    "message": "Check the current calendar.",
                    "model_called": True,
                },
            },
        ]
        breakdown = run_website_guide_eval.kind_breakdown(rows, "kind")["answer"]
        self.assertEqual(breakdown["total"], 2)
        self.assertEqual(breakdown["latency_p50_ms"], 150.0)
        self.assertEqual(breakdown["message_words_max"], 4)
        self.assertEqual(breakdown["model_calls"], 2)

    def test_successful_nonprivacy_responses_require_a_model_call(self):
        expected = "model: successful non-privacy response must call the model"
        for kind in ("answer", "clarify", "handoff"):
            with self.subTest(kind=kind):
                failures = run_website_guide_eval.universal_failures(
                    response_contract(kind=kind, model_called=False), "none"
                )
                self.assertIn(expected, failures)

                called_failures = run_website_guide_eval.universal_failures(
                    response_contract(kind=kind, model_called=True), "none"
                )
                self.assertNotIn(expected, called_failures)

    def test_privacy_is_the_successful_zero_call_exemption(self):
        held = run_website_guide_eval.universal_failures(
            response_contract(kind="privacy", model_called=False), "none"
        )
        self.assertFalse(any(failure.startswith("model:") for failure in held))

        called = run_website_guide_eval.universal_failures(
            response_contract(kind="privacy", model_called=True), "none"
        )
        self.assertIn("model: privacy response must not call the model", called)

    def test_single_turn_release_gate_blocks_skipped_model_without_rewarding_it(self):
        results = [result_row(index) for index in range(25)]
        passing = run_website_guide_eval.aggregate(results, [])
        self.assertEqual(passing["decision"], "pass")
        self.assertTrue(passing["model_call_gate"]["passed"])
        self.assertEqual(passing["model_call_gate"]["call_rate"], 1.0)
        self.assertEqual(passing["arena"]["scores"]["efficiency"], 4)

        results[0]["response"]["model_called"] = False
        blocked = run_website_guide_eval.aggregate(results, [])
        self.assertEqual(blocked["decision"], "block")
        self.assertFalse(blocked["hard_gate"]["passed"])
        self.assertEqual(blocked["model_call_gate"]["skipped_turn_ids"], ["turn-0"])
        self.assertEqual(blocked["arena"]["scores"]["efficiency"], 4)

    def test_single_and_multiturn_release_gates_exempt_privacy_only(self):
        single_results = [result_row(index) for index in range(25)]
        single_results[0] = result_row(0, kind="privacy", model_called=False)
        self.assertEqual(
            run_website_guide_eval.aggregate(single_results, [])["decision"], "pass"
        )

        episodes = []
        for episode_index in range(10):
            turns = [
                {
                    **result_row(episode_index * 4 + turn_index),
                    "mode": "deictic",
                }
                for turn_index in range(4)
            ]
            episodes.append(
                {
                    "id": f"episode-{episode_index}",
                    "level": "release",
                    "slice": "retrieval",
                    "passed": True,
                    "turns": turns,
                }
            )
        episodes[0]["turns"][0]["response"] = response_contract(
            kind="privacy", model_called=False
        )
        passing = run_website_guide_multiturn_eval.aggregate(episodes, [])
        self.assertEqual(passing["decision"], "pass")
        self.assertEqual(passing["model_call_gate"]["required_turns"], 39)

        episodes[0]["turns"][1]["response"]["model_called"] = False
        blocked = run_website_guide_multiturn_eval.aggregate(episodes, [])
        self.assertEqual(blocked["decision"], "block")
        self.assertFalse(blocked["model_call_gate"]["passed"])

    def test_capture_smoke_uses_safe_model_turn_and_preserves_privacy_and_replay(self):
        first = response_contract(model_called=True)
        first["capture"] = {"mode": "transcript", "stored": True}
        replay = copy.deepcopy(first)
        privacy = response_contract(kind="privacy", model_called=False)
        posted = []
        responses = iter(((200, first), (200, replay), (409, {}), (200, privacy)))

        def fake_post(_base_url, payload):
            posted.append(payload)
            return next(responses)

        health = {"prompt_policy": {"version": "test-policy"}}
        with mock.patch.object(sys, "argv", ["verify_capture.py", "https://example.test"]), \
             mock.patch.object(verify_capture, "get_json", return_value=(200, health)), \
             mock.patch.object(verify_capture, "post", side_effect=fake_post), \
             contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(verify_capture.main(), 0)

        self.assertEqual(
            posted[0]["message"], "What does the Digital Equity Program offer?"
        )
        self.assertTrue(all(payload["client_surface"] == "benchmark" for payload in posted))

        first["model_called"] = False
        responses = iter(((200, first), (200, replay), (409, {}), (200, privacy)))
        with mock.patch.object(sys, "argv", ["verify_capture.py", "https://example.test"]), \
             mock.patch.object(verify_capture, "get_json", return_value=(200, health)), \
             mock.patch.object(verify_capture, "post", side_effect=fake_post), \
             contextlib.redirect_stdout(io.StringIO()), \
             self.assertRaisesRegex(AssertionError, "did not call the model"):
            verify_capture.main()


if __name__ == "__main__":
    unittest.main()

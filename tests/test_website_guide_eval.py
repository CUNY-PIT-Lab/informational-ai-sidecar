import pathlib
import unittest

from scripts import run_website_guide_eval


ROOT = pathlib.Path(__file__).resolve().parents[1]


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


if __name__ == "__main__":
    unittest.main()

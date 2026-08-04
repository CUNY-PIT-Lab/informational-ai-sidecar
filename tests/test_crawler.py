#!/usr/bin/env python3
"""Network-free tests for the public Wix sitemap crawler's pure functions."""

import importlib.util
import pathlib
import unittest
from unittest import mock


DEMO = pathlib.Path(__file__).resolve().parents[1]
SCRIPT = DEMO / "scripts" / "rebuild_site_index.py"
SPEC = importlib.util.spec_from_file_location("fortune_site_crawler", SCRIPT)
crawler = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(crawler)


def row(path, kind="pages"):
    return {
        "url": f"https://www.fortunedigitalequity.org{path}",
        "sitemap_kind": kind,
        "lastmod": "",
    }


class NoNetworkTestCase(unittest.TestCase):
    def setUp(self):
        network_guard = mock.patch.object(
            crawler,
            "fetch",
            side_effect=AssertionError("unit tests must not make network requests"),
        )
        network_guard.start()
        self.addCleanup(network_guard.stop)


class CanonicalizationTests(NoNetworkTestCase):
    def test_relative_and_same_host_urls_receive_one_canonical_shape(self):
        fixtures = {
            "/trainings/": "https://www.fortunedigitalequity.org/trainings",
            "https://fortunedigitalequity.org/about/?draft=1#staff": "https://www.fortunedigitalequity.org/about",
            "https://www.fortunedigitalequity.org/": "https://www.fortunedigitalequity.org/",
        }
        for value, expected in fixtures.items():
            with self.subTest(value=value):
                self.assertEqual(crawler.canonical_url(value), expected)

    def test_external_hosts_are_rejected(self):
        for value in (
            "https://example.org/trainings",
            "https://fortunedigitalequity.org.example.org/about",
        ):
            with self.subTest(value=value):
                self.assertEqual(crawler.canonical_url(value), "")

    def test_unicode_service_path_keeps_its_canonical_public_url(self):
        value = "https://www.fortunedigitalequity.org/service-page/alfabetización-digital-básica-en-español"
        self.assertEqual(crawler.canonical_url(value), value)


class AuthorityTests(NoNetworkTestCase):
    def test_current_pages_and_active_services_are_answer_sources(self):
        for record in (row("/trainings"), row("/service-page/intro-to-computers", "booking-services")):
            with self.subTest(record=record):
                self.assertEqual(crawler.authority_for(record)[0], "answer")

    def test_posts_past_tech_fairs_and_archived_services_are_archives(self):
        fixtures = (
            row("/post/older-update", "blog-posts"),
            row("/techfair/techfair22"),
            row("/service-page/excel-archive", "booking-services"),
        )
        for record in fixtures:
            with self.subTest(record=record):
                self.assertEqual(crawler.authority_for(record)[0], "archive")

    def test_news_and_blog_categories_are_navigation_only(self):
        fixtures = (
            row("/news"),
            row("/news/general", "blog-categories"),
        )
        for record in fixtures:
            with self.subTest(record=record):
                self.assertEqual(crawler.authority_for(record)[0], "navigation")

    def test_public_author_profiles_are_excluded(self):
        self.assertEqual(
            crawler.authority_for(row("/profile/jschwartz/profile", "profiles"))[0],
            "excluded",
        )

    def test_test_member_duplicate_and_sample_routes_are_excluded(self):
        fixtures = (
            row("/test"),
            row("/members"),
            row("/service-page/sample-class", "booking-services"),
            row("/service-page/identity-theft-how-to-minimize-risk-1", "booking-services"),
        )
        for record in fixtures:
            with self.subTest(record=record):
                self.assertEqual(crawler.authority_for(record)[0], "excluded")

    def test_refresh_retains_recorded_authority_for_existing_url(self):
        record = row("/news")
        previous = {
            "authority": "archive",
            "authority_reason": "news index; posts are historical and date-bound",
        }

        self.assertEqual(
            crawler.reviewed_authority(record, previous),
            (
                "archive",
                "news index; posts are historical and date-bound",
            ),
        )

    def test_new_sitemap_url_is_held_out_of_answers_pending_review(self):
        self.assertEqual(
            crawler.reviewed_authority(row("/calendar/test")),
            (
                "excluded",
                "new public URL pending Fortune staff source review",
            ),
        )

    def test_new_blog_and_pagination_routes_receive_non_answer_classifications(self):
        self.assertEqual(
            crawler.reviewed_authority(row("/post/older-update", "blog-posts"))[0],
            "archive",
        )
        self.assertEqual(
            crawler.reviewed_authority(row("/news/page/2", "blog-categories"))[0],
            "navigation",
        )


class RecordUtilityTests(NoNetworkTestCase):
    def test_page_ids_are_stable_distinct_and_kind_prefixed(self):
        training = row("/trainings")
        service = row("/service-page/intro-to-computers", "booking-services")

        self.assertEqual(crawler.page_id(training), crawler.page_id(dict(training)))
        self.assertEqual(crawler.page_id(training), "page-trainings-f2e3ea17")
        self.assertTrue(crawler.page_id(service).startswith("service-"))
        self.assertNotEqual(crawler.page_id(training), crawler.page_id(service))

    def test_clean_blocks_normalizes_deduplicates_and_drops_boilerplate(self):
        blocks = crawler.clean_blocks([
            " Top of page ",
            "A useful public sentence. ",
            "A   useful public sentence.",
            "a useful public sentence.",
            "x",
            "A second useful sentence.",
        ])

        self.assertEqual(
            blocks,
            ["A useful public sentence.", "A second useful sentence."],
        )

    def test_internal_links_are_canonical_deduplicated_and_host_filtered(self):
        base = "https://www.fortunedigitalequity.org/trainings"
        links = crawler.internal_links(base, [
            "/about/",
            "https://fortunedigitalequity.org/about?draft=1#staff",
            "../contact/",
            "#classes",
            "https://example.org/contact",
        ])

        self.assertEqual(
            links,
            [
                "https://www.fortunedigitalequity.org/about",
                "https://www.fortunedigitalequity.org/contact",
            ],
        )
        self.assertTrue(all("fortunedigitalequity.org" in link for link in links))

    def test_page_extractor_ignores_scripts_and_keeps_public_internal_links(self):
        parser = crawler.PageExtractor()
        parser.feed("""
          <html><head><title>Public page</title></head><body>
          <main data-main-content="true">
            <h1>Digital skills</h1>
            <p>Learn computer basics.</p>
            <script>privateTrackerValue = 123;</script>
            <a href="/contact">Contact staff</a>
          </main>
          </body></html>
        """)

        self.assertEqual(" ".join(parser.title_parts), "Public page")
        self.assertIn("Digital skills", parser.headings)
        self.assertIn("Learn computer basics.", parser.blocks)
        self.assertNotIn("privateTrackerValue", " ".join(parser.blocks))
        self.assertIn("/contact", parser.links)


if __name__ == "__main__":
    unittest.main()

from __future__ import annotations

import os
import re
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi.testclient import TestClient

from app import (
    BootstrapStore,
    Settings,
    TokenRateLimiter,
    create_app,
)


ROOT = Path(__file__).resolve().parents[1]


def test_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "development",
        "public_widget_url": "http://testserver",
        "public_origin": "http://testserver",
        "frame_ancestors": ("'self'",),
        "direct_line_secret": "",
        "direct_line_domain": (
            "https://directline.botframework.com/v3/directline"
        ),
        "mock_direct_line": True,
        "token_rate_limit": 3,
        "token_rate_window_seconds": 60,
        "widget_title": "Fortune information guide",
        "widget_description": "Public information.",
        "contact_url": "https://fortunesociety.org/contact-us/",
        "contact_label": "Contact The Fortune Society",
    }
    values.update(overrides)
    return Settings(**values)


class SettingsTests(unittest.TestCase):
    def test_production_rejects_mock_mode(self) -> None:
        env = {
            "APP_ENV": "production",
            "PUBLIC_WIDGET_URL": "https://guide.example.org",
            "ALLOWED_FRAME_ANCESTORS": "https://www.example.org",
            "COPILOT_DIRECT_LINE_SECRET": "not-a-real-secret",
            "MOCK_DIRECT_LINE": "true",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                RuntimeError, "unavailable in production"
            ):
                Settings.from_env()

    def test_production_rejects_wildcard_frame_ancestor(self) -> None:
        env = {
            "APP_ENV": "production",
            "PUBLIC_WIDGET_URL": "https://guide.example.org",
            "ALLOWED_FRAME_ANCESTORS": "https://*.example.org",
            "COPILOT_DIRECT_LINE_SECRET": "not-a-real-secret",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(RuntimeError, "must not contain"):
                Settings.from_env()

    def test_production_rejects_frame_ancestor_with_path(self) -> None:
        env = {
            "APP_ENV": "production",
            "PUBLIC_WIDGET_URL": "https://guide.example.org",
            "ALLOWED_FRAME_ANCESTORS": "https://www.example.org/chat",
            "COPILOT_DIRECT_LINE_SECRET": "not-a-real-secret",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(RuntimeError, "exact HTTPS origins"):
                Settings.from_env()


class GuardTests(unittest.TestCase):
    def test_bootstrap_is_one_use_and_client_bound(self) -> None:
        store = BootstrapStore(ttl_seconds=30)
        token = store.issue("client-a", now=10)
        self.assertFalse(store.consume(token, "client-b", now=11))

        token = store.issue("client-a", now=12)
        self.assertTrue(store.consume(token, "client-a", now=13))
        self.assertFalse(store.consume(token, "client-a", now=14))

    def test_rate_limit_reopens_after_window(self) -> None:
        limiter = TokenRateLimiter(limit=2, window_seconds=10)
        self.assertTrue(limiter.allow("client", now=1))
        self.assertTrue(limiter.allow("client", now=2))
        self.assertFalse(limiter.allow("client", now=3))
        self.assertTrue(limiter.allow("client", now=12))


class AppTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(create_app(test_settings()))

    def _bootstrap(self) -> str:
        response = self.client.get("/embed")
        self.assertEqual(response.status_code, 200)
        match = re.search(
            r'name="widget-bootstrap" content="([^"]+)"',
            response.text,
        )
        self.assertIsNotNone(match)
        return match.group(1)

    def test_embed_has_frame_and_browser_security_headers(self) -> None:
        response = self.client.get("/embed")
        csp = response.headers["content-security-policy"]
        self.assertIn("frame-ancestors 'self'", csp)
        self.assertIn("script-src 'self' https://cdn.botframework.com", csp)
        self.assertEqual(response.headers["cache-control"], "no-store, max-age=0")
        self.assertIn("camera=()", response.headers["permissions-policy"])

    def test_token_requires_same_origin_and_one_use_bootstrap(self) -> None:
        bootstrap = self._bootstrap()
        headers = {
            "Origin": "http://testserver",
            "Sec-Fetch-Site": "same-origin",
            "X-Widget-Bootstrap": bootstrap,
        }
        first = self.client.post("/api/direct-line/token", headers=headers)
        self.assertEqual(first.status_code, 200)
        self.assertTrue(first.json()["mock"])
        self.assertTrue(first.json()["userId"].startswith("dl_"))

        replay = self.client.post("/api/direct-line/token", headers=headers)
        self.assertEqual(replay.status_code, 403)

    def test_token_rejects_other_origin(self) -> None:
        response = self.client.post(
            "/api/direct-line/token",
            headers={
                "Origin": "https://attacker.example",
                "Sec-Fetch-Site": "cross-site",
                "X-Widget-Bootstrap": self._bootstrap(),
            },
        )
        self.assertEqual(response.status_code, 403)

    def test_preview_is_not_available_in_production(self) -> None:
        production = test_settings(
            environment="production",
            public_widget_url="https://guide.example.org",
            public_origin="https://guide.example.org",
            frame_ancestors=("https://www.example.org",),
            direct_line_secret="not-a-real-secret",
            mock_direct_line=False,
        )
        client = TestClient(create_app(production))
        self.assertEqual(client.get("/preview").status_code, 404)

    def test_preview_can_frame_only_same_origin_widget(self) -> None:
        response = self.client.get("/preview")
        csp = response.headers["content-security-policy"]
        self.assertIn("frame-ancestors 'none'", csp)
        self.assertIn("frame-src 'self'", csp)


class StaticSafetyTests(unittest.TestCase):
    def test_browser_never_uses_persistent_storage_or_secret(self) -> None:
        browser_source = (
            (ROOT / "static" / "widget.html").read_text()
            + (ROOT / "static" / "widget.js").read_text()
        )
        self.assertNotIn("localStorage", browser_source)
        self.assertNotIn("sessionStorage", browser_source)
        self.assertNotIn("COPILOT_DIRECT_LINE_SECRET", browser_source)

    def test_webchat_bundle_is_pinned(self) -> None:
        html = (ROOT / "static" / "widget.html").read_text()
        self.assertIn("__WEBCHAT_VERSION__", html)
        self.assertNotIn("/latest/", html)

    def test_iframe_does_not_grant_sensitive_browser_permissions(self) -> None:
        snippet = (ROOT / "wix-embed.html").read_text()
        self.assertNotIn("allow=\"camera", snippet)
        self.assertNotIn("microphone", snippet)
        self.assertIn('referrerpolicy="no-referrer"', snippet)


if __name__ == "__main__":
    unittest.main()

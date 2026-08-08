#!/usr/bin/env python3
"""Network-level evaluator access and static-file isolation tests."""

import http.client
import json
import pathlib
import sys
import threading
import unittest


DEMO = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO))

import server


class _FakeEvaluationStore:
    enabled = True
    absolute_seconds = 28800

    def public_status(self):
        return {
            "enabled": True,
            "ready": True,
            "total_slots": 4,
            "claimed_slots": 0,
            "unassigned_slots": 4,
        }

    def login(self, email, password):
        if email != "editor@example.org" or password != "correct horse battery":
            raise server.AuthenticationFailed("Email or password was not recognized.")
        return {
            "session_token": "session-token",
            "csrf_token": "csrf-token",
            "account": {
                "slot_key": "editor-1",
                "role": "editor",
                "display_name": "Editor 1",
            },
        }

    def authenticate(self, token):
        if token != "session-token":
            return None
        return {
            "slot_key": "editor-1",
            "role": "editor",
            "display_name": "Editor 1",
        }

    def csrf_token(self, token):
        return "csrf-token" if token == "session-token" else ""

    def csrf_matches(self, token, supplied):
        return token == "session-token" and supplied == "csrf-token"

    def logout(self, _token):
        return None

    def list_buckets(self, _slot):
        return []

    def list_conversations(self, _slot, _limit):
        return []

    def list_accounts(self):
        raise AssertionError("An editor must not reach the account list")


class EvaluationApiTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_store = server.EVALUATION_STORE
        server.EVALUATION_STORE = _FakeEvaluationStore()
        cls.httpd = server.ThreadingServer(("127.0.0.1", 0), server.Handler)
        cls.port = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join(timeout=2)
        server.EVALUATION_STORE = cls.original_store

    def request(self, method, path, body=None, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode() if body is not None else None
        request_headers = dict(headers or {})
        if payload is not None:
            request_headers.setdefault("Content-Type", "application/json")
            request_headers.setdefault("Content-Length", str(len(payload)))
        connection.request(method, path, body=payload, headers=request_headers)
        response = connection.getresponse()
        content = response.read()
        result = response.status, dict(response.getheaders()), content
        connection.close()
        return result

    def same_origin_headers(self):
        return {
            "Host": f"127.0.0.1:{self.port}",
            "Origin": f"http://127.0.0.1:{self.port}",
            "Sec-Fetch-Site": "same-origin",
        }

    def test_evaluation_page_is_public_but_cannot_be_framed(self):
        status, headers, body = self.request("GET", "/evaluation")
        self.assertEqual(status, 200)
        self.assertEqual(headers["X-Frame-Options"], "DENY")
        self.assertIn("frame-ancestors 'none'", headers["Content-Security-Policy"])
        self.assertIn(b"Review conversations", body)

    def test_repository_source_and_private_paths_are_not_static_assets(self):
        for path in (
            "/server.py",
            "/conversation_store.py",
            "/evaluation_store.py",
            "/.env.example",
            "/railway.json",
            "/requirements.txt",
            "/migrations/003_evaluator_identity.sql",
            "/scripts/issue_evaluator_invite.py",
            "/tests/test_evaluation_api.py",
            "/replica-snapshots/page-home-e6c04f0f.html.gz",
        ):
            with self.subTest(path=path):
                status, _, _ = self.request("GET", path)
                self.assertEqual(status, 404)

    def test_login_requires_a_same_origin_browser_request(self):
        status, _, _ = self.request(
            "POST",
            "/api/evaluation/auth/login",
            {"email": "editor@example.org", "password": "correct horse battery"},
        )
        self.assertEqual(status, 403)

    def test_login_cookie_and_session_endpoint_follow_security_contract(self):
        status, headers, body = self.request(
            "POST",
            "/api/evaluation/auth/login",
            {"email": "editor@example.org", "password": "correct horse battery"},
            self.same_origin_headers(),
        )
        self.assertEqual(status, 200)
        cookie = headers["Set-Cookie"]
        self.assertIn("__Host-fs_eval=session-token", cookie)
        for flag in ("Secure", "HttpOnly", "SameSite=Strict", "Path=/"):
            self.assertIn(flag, cookie)
        payload = json.loads(body)
        self.assertNotIn("session_token", payload)
        self.assertEqual(payload["csrf_token"], "csrf-token")

        status, _, body = self.request(
            "GET",
            "/api/evaluation/session",
            headers={"Cookie": "__Host-fs_eval=session-token"},
        )
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(body)["account"]["slot_key"], "editor-1")

    def test_mutation_requires_csrf_and_admin_data_is_role_guarded(self):
        headers = {
            **self.same_origin_headers(),
            "Cookie": "__Host-fs_eval=session-token",
        }
        status, _, _ = self.request(
            "POST",
            "/api/evaluation/auth/logout",
            {},
            headers,
        )
        self.assertEqual(status, 403)

        status, _, _ = self.request(
            "GET",
            "/api/evaluation/admin/accounts",
            headers={"Cookie": "__Host-fs_eval=session-token"},
        )
        self.assertEqual(status, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)

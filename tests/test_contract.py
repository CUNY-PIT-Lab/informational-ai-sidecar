#!/usr/bin/env python3
"""Key-free contract tests for the context-aware Digital Equity guide."""

import io
import json
import pathlib
import sys
import unittest
import uuid


DEMO = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DEMO))

import server


class SiteIndexTests(unittest.TestCase):
    def test_complete_public_sitemap_inventory_is_present(self):
        self.assertTrue(server.SITE_INDEX_PATH.exists())
        self.assertEqual(server.SITE_INDEX["unique_urls"], 200)
        self.assertEqual(server.SITE_INDEX["sitemap_entries"], 213)
        self.assertEqual(len(server.SITE_INDEX["pages"]), 200)

    def test_authority_boundary_is_explicit(self):
        self.assertEqual(
            server.SITE_INDEX["authority_counts"],
            {"answer": 143, "excluded": 27, "archive": 21, "navigation": 9},
        )
        self.assertGreaterEqual(len(server.ANSWER_SOURCES), 140)
        self.assertTrue(all(source["authority"] == "answer" for source in server.ANSWER_SOURCES))

    def test_every_indexed_url_stays_on_the_public_digital_equity_host(self):
        for page in server.SITE_INDEX["pages"]:
            self.assertTrue(page["url"].startswith("https://www.fortunedigitalequity.org/"), page["url"])
            for link in page["internal_links"]:
                self.assertTrue(link.startswith("https://www.fortunedigitalequity.org/"), link)

    def test_archives_tests_and_member_surfaces_cannot_support_answers(self):
        prohibited_fragments = ("/post/", "/test", "/members", "/groups", "/file-share", "archive")
        for source in server.ANSWER_SOURCES:
            self.assertFalse(any(fragment in source["url"] for fragment in prohibited_fragments), source["url"])

    def test_reviewed_core_sources_remain_available(self):
        self.assertTrue({"home", "trainings", "devices", "individual", "calendar", "contact"}.issubset(server.SOURCE_BY_ID))
        for source_id in ("home", "trainings", "devices", "individual", "calendar", "contact"):
            self.assertTrue(server.SOURCE_BY_ID[source_id]["facts"])

    def test_internal_drive_material_is_not_a_public_model_source(self):
        self.assertNotIn("docs.google.com", server.BASE_SYSTEM_PROMPT)
        self.assertNotIn("drive.google.com", server.BASE_SYSTEM_PROMPT)
        self.assertFalse(any("docs.google.com" in page["url"] for page in server.SITE_INDEX["pages"]))


class RetrievalTests(unittest.TestCase):
    def test_retrieval_finds_specific_booking_services(self):
        robot = server.retrieve_sources("robot coding")
        spanish = server.retrieve_sources("Spanish digital literacy")
        excel = server.retrieve_sources("Excel pivot table")
        self.assertIn("robot-coders-101", robot[0]["url"])
        self.assertIn("alfabetizaci", spanish[0]["url"])
        self.assertTrue(any("pivot-tables" in source["url"] for source in excel[:2]))

    def test_retrieval_keeps_device_question_on_device_route(self):
        self.assertEqual(server.retrieve_sources("Can I get a free laptop?")[0]["id"], "devices")

    def test_retrieval_never_returns_non_answer_authority(self):
        for query in ("2022 Tech Fair", "old blog post", "sample class", "member files"):
            for source in server.retrieve_sources(query):
                self.assertEqual(source["authority"], "answer")

    def test_page_context_is_canonicalized_and_weighted(self):
        context = server.sanitize_page_context({
            "url": "https://www.fortunedigitalequity.org/trainings?x=1#top",
            "path": "trainings",
            "title": "Workshops",
        })
        contextual = server.contextualize_sources(server.retrieve_sources("What else is here?"), context)
        self.assertEqual(context["url"], "https://www.fortunedigitalequity.org/trainings")
        self.assertEqual(contextual[0]["id"], "trainings")

    def test_external_page_context_is_not_trusted(self):
        context = server.sanitize_page_context({"url": "https://example.com/fake", "title": "Fake"})
        self.assertEqual(context["url"], "")


class StagedRetrievalTests(unittest.TestCase):
    def dispatch_chat(self, question, page_url, model_source_id="devices", history=None):
        model_calls = []
        body = json.dumps({
            "message": question,
            "page_context": {"url": page_url, "title": "Current page"},
            "history": history or [],
        }).encode()
        handler = server.Handler.__new__(server.Handler)
        handler.path = "/api/chat"
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        captured = {}
        handler._json = lambda status, value: captured.update(status=status, payload=value)

        def record_model_call(_handler, messages):
            model_calls.append(messages)
            return json.dumps({
                "kind": "answer",
                "message": "Use the approved page.",
                "reason": "It contains the matching public information.",
                "source_ids": [model_source_id],
            })

        handler._ollama = record_model_call.__get__(handler, server.Handler)
        original_key = server.KEY
        server.KEY = "test-only-placeholder"
        try:
            handler.do_POST()
        finally:
            server.KEY = original_key
        return captured, model_calls

    @staticmethod
    def retrieval_records(model_calls):
        system_prompt = model_calls[0][0]["content"]
        marker = "\nAPPROVED RETRIEVAL RECORDS:\n"
        return json.loads(system_prompt.split(marker, 1)[1])

    def test_current_page_evidence_is_the_only_record_sent_to_model(self):
        captured, model_calls = self.dispatch_chat(
            "Can I get a free laptop?",
            "https://www.fortunedigitalequity.org/devices",
        )
        self.assertEqual(captured["status"], 200)
        self.assertEqual(captured["payload"]["retrieval_scope"], "page")
        self.assertEqual([record["id"] for record in self.retrieval_records(model_calls)], ["devices"])

    def test_chat_response_has_stable_modular_identifiers_even_when_capture_is_off(self):
        captured, _ = self.dispatch_chat(
            "Can I get a free laptop?",
            "https://www.fortunedigitalequity.org/devices",
        )
        payload = captured["payload"]
        for key in ("conversation_id", "turn_id", "client_event_id"):
            self.assertEqual(str(uuid.UUID(payload[key])), payload[key])
        for message_id in payload["message_ids"].values():
            self.assertEqual(str(uuid.UUID(message_id)), message_id)
        self.assertEqual(payload["capture"], {"mode": "none", "stored": False})

    def test_response_logs_server_owned_interaction_context(self):
        captured, _ = self.dispatch_chat(
            "How do I register for a class?",
            "https://www.fortunedigitalequity.org/trainings",
            model_source_id="trainings",
            history=[
                {"role": "user", "content": "I want a class."},
                {"role": "assistant", "content": "Which topic?"},
            ],
        )
        payload = captured["payload"]
        self.assertEqual(payload["chat_stage"], "follow_up")
        self.assertEqual(payload["request_kind"], "procedure")
        self.assertEqual(payload["request_language"], "en")
        self.assertEqual(payload["response_language"], "en")
        self.assertEqual(payload["prompt_policy_version"], server.PROMPT_POLICY_VERSION)

    def test_every_content_complete_answer_url_resolves_to_page_only_evidence(self):
        complete_pages = [
            page for page in server.SITE_INDEX["pages"]
            if page.get("authority") == "answer" and page.get("status") == 200
        ]
        self.assertEqual(len(complete_pages), 143)
        for page in complete_pages:
            question = f"What does this page say about {page.get('title') or page['id']}?"
            with self.subTest(url=page["url"]):
                scope, sources = server.retrieval_plan(question, {
                    "url": page["url"],
                    "title": page.get("title", ""),
                })
                self.assertEqual(scope, "page")
                self.assertEqual([source["url"] for source in sources], [page["url"]])

    def test_non_answer_and_partial_urls_never_become_page_evidence(self):
        blocked_pages = [
            page for page in server.SITE_INDEX["pages"]
            if page.get("authority") != "answer" or page.get("status") != 200
        ]
        self.assertEqual(len(blocked_pages), 57)
        self.assertEqual(
            {page.get("authority") for page in blocked_pages},
            {"archive", "excluded", "navigation"},
        )
        for page in blocked_pages:
            question = f"What does this page say about {page.get('title') or page['id']}?"
            context = {"url": page["url"], "title": page.get("title", "")}
            with self.subTest(url=page["url"], authority=page.get("authority"), status=page.get("status")):
                self.assertIsNone(server.approved_current_page_source(context))
                scope, sources = server.retrieval_plan(question, context)
                self.assertNotEqual(scope, "page")
                self.assertNotIn(page["url"], [source["url"] for source in sources])

    def test_model_grounding_excerpts_come_only_from_the_validated_page_record(self):
        for source in server.ANSWER_SOURCES:
            question = f"What does this page say about {source.get('title') or source['id']}?"
            context = {"url": source["url"], "title": source.get("title", "")}
            with self.subTest(url=source["url"]):
                scope, sources = server.retrieval_plan(question, context)
                self.assertEqual(scope, "page")
                prompt = server.retrieval_prompt(question, sources, context)
                records = json.loads(prompt.split("\nAPPROVED RETRIEVAL RECORDS:\n", 1)[1])
                self.assertEqual([record["id"] for record in records], [source["id"]])
                self.assertEqual(records[0]["content"], server.source_excerpt(source, question))
                for grounded_line in records[0]["content"].splitlines():
                    self.assertIn(grounded_line, server.searchable_text(source))

    def test_site_search_occurs_only_after_current_page_miss(self):
        captured, model_calls = self.dispatch_chat(
            "Can I get a free laptop?",
            "https://www.fortunedigitalequity.org/trainings",
        )
        records = self.retrieval_records(model_calls)
        self.assertEqual(captured["payload"]["retrieval_scope"], "site")
        self.assertEqual(records[0]["id"], "devices")
        self.assertTrue(all(record["id"] in server.SOURCE_BY_ID for record in records))
        self.assertNotIn("trainings", [record["id"] for record in records])

    def test_page_reference_uses_only_the_current_page(self):
        captured, model_calls = self.dispatch_chat(
            "What does this page say?",
            "https://www.fortunedigitalequity.org/trainings",
            model_source_id="trainings",
        )
        self.assertEqual(captured["payload"]["retrieval_scope"], "page")
        self.assertEqual(
            [record["id"] for record in self.retrieval_records(model_calls)],
            ["trainings"],
        )

    def test_no_evidence_uses_staff_route_without_calling_model(self):
        captured, model_calls = self.dispatch_chat(
            "What is the zzyzx quasar permit policy?",
            "https://www.fortunedigitalequity.org/trainings",
        )
        payload = captured["payload"]
        self.assertEqual(payload["retrieval_scope"], "staff")
        self.assertEqual(payload["kind"], "handoff")
        self.assertFalse(payload["model_called"])
        self.assertEqual(model_calls, [])
        self.assertEqual(payload["message"], "I couldn’t confirm that on Fortune’s public pages.")
        self.assertNotIn("Use the approved page.", payload["message"])
        self.assertEqual([source["id"] for source in payload["sources"]], ["contact"])
        self.assertEqual(payload["handoff_url"], server.CONTACT_URL)
        self.assertTrue(payload["related"])

    def test_unknown_query_has_no_default_core_evidence(self):
        self.assertEqual(server.retrieve_sources("zzyzx quasar permit policy"), [])
        self.assertEqual(
            server.retrieval_plan(
                "zzyzx quasar permit policy",
                {"url": "https://www.fortunedigitalequity.org/trainings"},
            ),
            ("staff", []),
        )


class AmbiguityAndPrivacyTests(unittest.TestCase):
    def test_known_ambiguous_requests_ask_one_question_with_choices(self):
        for question in ("help", "device", "class", "internet"):
            response = server.ambiguity_response(question)
            self.assertIsNotNone(response, question)
            self.assertEqual(response["kind"], "clarify")
            self.assertEqual(response["message"].count("?"), 1)
            self.assertIn(len(response["choices"]), (2, 3))
            self.assertFalse(response["model_called"])
            self.assertTrue(response["related"])
            self.assertTrue(response["continuation"]["label"])

    def test_clear_requests_skip_deterministic_clarification(self):
        for question in ("Can I get a free laptop?", "I want an Excel pivot table class", "When is the email class?"):
            self.assertIsNone(server.ambiguity_response(question), question)

    def test_spanish_requests_are_detected_and_clarified_in_spanish(self):
        self.assertEqual(server.detect_language("Necesito ayuda con una clase"), "es")
        self.assertEqual(server.request_kind("¿Cómo puedo registrarme?"), "procedure")
        response = server.ambiguity_response("clase", "es")
        self.assertEqual(response["kind"], "clarify")
        self.assertIn("¿", response["message"])
        self.assertNotIn("What", response["message"])

    def test_language_detection_does_not_treat_non_latin_text_as_english(self):
        self.assertEqual(server.detect_language("需要帮助"), "other")

    def test_personal_details_are_held_before_model_use(self):
        cases = [
            "My Fortune ID is 12345",
            "My case number is ABC-9",
            "Email me at demo@example.com",
            "My date of birth is January 2",
            "My address is 100 Example Street",
        ]
        for text in cases:
            self.assertTrue(server.contains_personal_details(text), text)
        response = server.privacy_response("My Fortune ID is 12345")
        self.assertFalse(response["model_called"])
        self.assertNotIn("12345", response["message"])
        self.assertTrue(response["related"])

    def test_bare_six_digit_fortune_id_is_treated_as_personal_information(self):
        for text in (
            "123456",
            "123456 please",
            "Fortune 123456",
            "My number is 123456.",
            "123-456",
            "123 456",
            "１２３４５６",
            "١٢٣٤٥٦",
        ):
            self.assertTrue(server.contains_personal_details(text), text)
        self.assertFalse(server.contains_personal_details("12345"))
        self.assertFalse(server.contains_personal_details("1234567"))

    def test_six_digit_id_is_blocked_before_the_model_handler(self):
        model_calls = []
        original_key = server.KEY

        def record_model_call(handler, messages):
            model_calls.append(messages)
            raise AssertionError("The model must not receive a six-digit Fortune ID")

        body = json.dumps({"message": "123456"}).encode()
        handler = server.Handler.__new__(server.Handler)
        handler.path = "/api/chat"
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        handler._ollama = record_model_call.__get__(handler, server.Handler)
        captured = {}
        handler._json = lambda status, value: captured.update(status=status, payload=value)

        server.KEY = "test-only-placeholder"
        try:
            handler.do_POST()
        finally:
            server.KEY = original_key

        self.assertEqual(captured["status"], 200)
        self.assertEqual(captured["payload"]["kind"], "privacy")
        self.assertFalse(captured["payload"]["model_called"])
        self.assertEqual(model_calls, [])

    def test_privacy_response_is_short_and_keeps_contact_routes(self):
        response = server.privacy_response("123456")
        self.assertEqual(response["message"], "Remove personal information and try again.")
        self.assertFalse(response["model_called"])
        self.assertNotIn("123456", response["message"])
        self.assertEqual([source["id"] for source in response["sources"]], ["contact"])
        self.assertEqual(response["handoff_url"], server.CONTACT_URL)
        self.assertTrue(response["related"])

    def test_normal_public_questions_pass_privacy_gate(self):
        for text in ("Where can I learn email?", "Can I get a free laptop?", "Where is the Long Island City class?"):
            self.assertFalse(server.contains_personal_details(text), text)

    def test_sensitive_or_case_specific_requests_use_pre_model_handoff(self):
        for text in ("I need parole advice", "Can you help with my health benefits?", "This is an emergency"):
            self.assertTrue(server.needs_human_handoff(text), text)
            response = server.human_handoff_response(text)
            self.assertEqual(response["kind"], "handoff")
            self.assertFalse(response["model_called"])
            self.assertEqual(response["handoff_url"], server.CONTACT_URL)


class ResponseContractTests(unittest.TestCase):
    def test_every_answer_has_source_related_route_handoff_and_continuation(self):
        retrieved = server.retrieve_sources("free laptop")
        raw = json.dumps({
            "kind": "answer",
            "message": "Review the device page and ask staff to confirm current criteria.",
            "reason": "Eligibility and inventory can change.",
            "source_ids": [retrieved[0]["id"]],
        })
        result = server.parse_model_json(raw, "free laptop", retrieved)
        self.assertTrue(result["sources"])
        self.assertTrue(result["related"])
        self.assertEqual(result["handoff_url"], server.CONTACT_URL)
        self.assertEqual(result["continuation"]["label"], "Ask the live guide")

    def test_unknown_model_source_ids_never_become_links(self):
        retrieved = server.retrieve_sources("free laptop")
        raw = '{"kind":"answer","message":"Use this.","reason":"It fits.","source_ids":["invented"]}'
        result = server.parse_model_json(raw, "free laptop", retrieved)
        self.assertNotIn("invented", [source["id"] for source in result["sources"]])
        self.assertEqual(result["sources"][0]["id"], retrieved[0]["id"])

    def test_model_prose_cannot_become_an_unsupported_factual_claim(self):
        retrieved = server.retrieve_sources("free laptop")
        raw = json.dumps({
            "kind": "answer",
            "message": "Free laptops are definitely available today with no wait.",
            "reason": "I know this from elsewhere.",
            "source_ids": ["devices"],
        })
        result = server.parse_model_json(raw, "free laptop", retrieved, "page")
        self.assertNotIn("definitely available today", result["message"])
        self.assertNotIn("I know this from elsewhere", result["reason"])
        self.assertIn("Laptop supply is limited", result["message"])
        self.assertIn("distribution is currently on hold", result["message"].lower())

    def test_spanish_answer_uses_safe_navigation_copy_not_model_facts(self):
        retrieved = server.retrieve_sources("computadora")
        raw = json.dumps({
            "kind": "answer",
            "message": "Las computadoras son gratis y están disponibles hoy.",
            "reason": "Lo sé.",
            "source_ids": [retrieved[0]["id"]],
        })
        interaction = {
            "request_language": "es",
            "chat_stage": "opening",
            "request_kind": "retrieval",
        }
        result = server.parse_model_json(
            raw, "Necesito una computadora", retrieved, "site", interaction
        )
        self.assertIn("Encontré una página oficial", result["message"])
        self.assertNotIn("disponibles hoy", result["message"])
        self.assertLessEqual(len(result["message"].split()), server.MAX_MESSAGE_WORDS)

    def test_prompt_loads_only_the_selected_mode_stage_and_language_modules(self):
        retrieved = server.retrieve_sources("computer class")
        interaction = {
            "request_kind": "procedure",
            "chat_stage": "follow_up",
            "request_language": "es",
            "prompt_policy_version": server.PROMPT_POLICY_VERSION,
        }
        prompt = server.retrieval_prompt(
            "¿Cómo me registro?", retrieved, None, interaction
        )
        self.assertIn(server.REQUEST_MODE_PROMPTS["procedure"], prompt)
        self.assertNotIn(server.REQUEST_MODE_PROMPTS["clarification"], prompt)
        self.assertIn(server.CHAT_STAGE_PROMPTS["follow_up"], prompt)
        self.assertNotIn(server.CHAT_STAGE_PROMPTS["opening"], prompt)
        self.assertIn(server.LANGUAGE_PROMPTS["es"], prompt)

    def test_model_clarification_cannot_restate_facts_or_reopen_a_clear_request(self):
        retrieved = server.retrieve_sources("free laptop")
        raw = json.dumps({
            "kind": "clarify",
            "message": "These are definitely the current qualifying rules. Are you eligible?",
            "reason": "Trust the model.",
            "source_ids": ["devices"],
        })
        result = server.parse_model_json(raw, "Can I get a free laptop?", retrieved, "page")
        self.assertEqual(result["kind"], "answer")
        self.assertNotIn("definitely", result["message"])
        self.assertIn("distribution is currently on hold", result["message"].lower())

    def test_malformed_model_output_falls_back_to_retrieved_sources(self):
        retrieved = server.retrieve_sources("free laptop")
        result = server.parse_model_json("Please check the device page.", "free laptop", retrieved)
        self.assertEqual(result["kind"], "answer")
        self.assertEqual(result["sources"][0]["id"], "devices")

    def test_answer_length_is_capped(self):
        retrieved = server.retrieve_sources("computer class")
        raw = '{"kind":"answer","message":"' + "word " * 120 + '","reason":"' + "why " * 50 + '","source_ids":["trainings"]}'
        result = server.parse_model_json(raw, "computer class", retrieved)
        self.assertLessEqual(len(result["message"].split()), 90)
        self.assertLessEqual(len(result["reason"].split()), 30)

    def test_long_answers_prefer_a_complete_sentence_boundary(self):
        text = ("A useful first sentence has enough words to carry a complete participant-facing instruction clearly. "
                + "Extra material " * 100)
        clipped = server.clip_words(text, 30)
        self.assertTrue(clipped.endswith("clearly."))

    def test_related_routes_use_only_trusted_urls(self):
        for query in ("class", "laptop", "tutoring", "practice", "something else"):
            related = server.related_links(query, server.retrieve_sources(query))
            self.assertTrue(related)
            self.assertTrue(all(server.canonical_url(item["url"]) for item in related))

    def test_em_dash_normalization_does_not_leave_space_before_comma(self):
        self.assertEqual(server.clip_words("Great — a good starting point.", 20), "Great, a good starting point.")
        self.assertEqual(server.clip_words("Already spaced , badly.", 20), "Already spaced, badly.")

    def test_reasoning_tags_are_removed(self):
        self.assertEqual(server.strip_reasoning("secret plan</think>{\"kind\":\"answer\"}"), '{"kind":"answer"}')
        self.assertEqual(server.strip_reasoning("<think>secret</think>Visible"), "Visible")

    def test_history_drops_personal_details(self):
        safe_history = [
            {"role": "user", "content": "Where are classes?"},
            {"role": "assistant", "content": "Use the calendar."},
        ]
        private_values = (
            "123456",
            "123-456",
            "123 456",
            "１２３４５６",
            "١٢٣٤٥٦",
            "Email me at demo@example.com",
            "My SSN is 123-45-6789",
            "My case number is ABC-9",
        )
        for value in private_values:
            with self.subTest(value=value):
                history = safe_history + [{"role": "user", "content": value}]
                self.assertEqual(server.sanitize_history(history), safe_history)


class FrontendAndDeploymentTests(unittest.TestCase):
    def test_browser_origin_policy_allows_same_origin_and_rejects_unknown_origins(self):
        self.assertTrue(server.origin_is_allowed("", "127.0.0.1:8790"))
        self.assertTrue(server.origin_is_allowed("http://127.0.0.1:8790", "127.0.0.1:8790"))
        self.assertFalse(server.origin_is_allowed("https://unapproved.example", "127.0.0.1:8790"))

    def test_model_budget_enforces_hourly_and_shared_daily_limits(self):
        now = [1_000_000.0]
        budget = server.ModelCallBudget(2, 3, clock=lambda: now[0])
        self.assertTrue(budget.claim("client-a"))
        self.assertTrue(budget.claim("client-a"))
        self.assertFalse(budget.claim("client-a"))
        self.assertTrue(budget.claim("client-b"))
        self.assertFalse(budget.claim("client-c"))
        now[0] += 86400
        self.assertTrue(budget.claim("client-a"))

    def test_model_warmup_loads_once_per_cooldown(self):
        now = [100.0]
        warmer = server.ModelWarmup(60, clock=lambda: now[0])
        calls = []
        self.assertTrue(warmer.ensure(lambda: calls.append("load")))
        self.assertFalse(warmer.ensure(lambda: calls.append("load")))
        self.assertEqual(calls, ["load"])
        self.assertEqual(warmer.status(), "ready")
        now[0] += 61
        self.assertTrue(warmer.ensure(lambda: calls.append("load")))
        self.assertEqual(calls, ["load", "load"])
        now[0] += 59
        warmer.mark_ready()
        now[0] += 59
        self.assertFalse(warmer.ensure(lambda: calls.append("load")))

    def test_preload_uses_an_empty_request_and_keep_alive(self):
        payloads = []
        original_request = server.ollama_request
        server.ollama_request = lambda payload: payloads.append(payload) or {}
        try:
            server.preload_model()
        finally:
            server.ollama_request = original_request
        self.assertEqual(payloads, [{
            "model": server.MODEL,
            "stream": False,
            "keep_alive": server.MODEL_KEEP_ALIVE,
        }])

    def test_warmup_endpoint_requires_an_allowed_origin(self):
        handler = server.Handler.__new__(server.Handler)
        handler.path = "/api/warmup"
        handler.headers = {
            "Origin": "https://unapproved.example",
            "Host": "127.0.0.1:8790",
        }
        captured = {}
        handler._json = lambda status, value: captured.update(status=status, payload=value)
        handler.do_POST()
        self.assertEqual(captured["status"], 403)

    def test_health_and_public_runtime_never_expose_the_provider_key(self):
        server_source = (DEMO / "server.py").read_text(encoding="utf-8")
        config_source = (DEMO / "config.js").read_text(encoding="utf-8")
        self.assertNotIn('"OLLAMA_API_KEY": KEY', server_source)
        self.assertNotIn("'OLLAMA_API_KEY': KEY", server_source)
        self.assertNotIn("OLLAMA_API_KEY", config_source)
        self.assertIn('"model_enabled": bool(KEY)', server_source)

        handler = server.Handler.__new__(server.Handler)
        handler.path = "/health"
        handler.headers = {}
        captured = {}
        handler._json = lambda status, value: captured.update(status=status, payload=value)
        handler.do_GET()
        serialized = json.dumps(captured["payload"])
        self.assertEqual(captured["status"], 200)
        self.assertEqual(captured["payload"]["conversation_logging"]["capture_mode"], "none")
        self.assertNotIn("DATABASE_URL", serialized)
        self.assertNotIn("FORTUNE_CONVERSATION_TOKEN_SECRET", serialized)

    def test_chat_panel_keeps_only_the_compact_question_form_and_disclosed_info(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        panel = html[html.index('id="guide-panel"') : html.index("<!-- ROUTE_CONFIG -->")]
        self.assertIn('id="question-form"', panel)
        self.assertIn('<h2 id="guide-title">Website Guide</h2>', panel)
        self.assertIn('>Website Guide</button>', wix)
        self.assertIn('<h2 id="fortune-guide-title">Website Guide</h2>', wix)
        self.assertIn("Ask about this page", panel)
        self.assertIn(">Send</button>", panel)
        self.assertIn("Don’t include personal information.", panel)
        self.assertIn("<summary>Info</summary>", panel)
        self.assertIn("Press Enter to send. Press Shift+Enter for a new line.", panel)
        self.assertNotIn('id="faq', panel.lower())
        self.assertNotIn("FAQS", app)
        self.assertNotIn("renderMenu", app)
        self.assertNotIn("renderClasses", app)
        startup = app[app.index("window.FortuneMockSite.ready.then") :]
        self.assertNotIn("questionField.focus", startup)

    def test_walkthrough_and_tour_trigger_are_removed_from_the_minimal_guide(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        for identifier in (
            'id="walkthrough"',
            'id="walkthrough-title"',
            'id="walkthrough-next"',
            'id="walkthrough-skip"',
            'id="walkthrough-live"',
        ):
            self.assertNotIn(identifier, html)
        self.assertNotIn("WALKTHROUGH_STORAGE_KEY", app)
        self.assertNotIn('search.get("tour")', app)
        self.assertIn("@media (prefers-reduced-motion: reduce)", styles)

    def test_context_window_reports_the_same_three_exchange_limit_sent_to_the_server(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        readme = (DEMO / "README.md").read_text(encoding="utf-8")
        self.assertIn('id="context-window"', html)
        self.assertIn("Context · this page · 0/3", html)
        self.assertIn("const MAX_CONTEXT_MESSAGES = 6", app)
        self.assertIn("MAX_CONTEXT_EXCHANGES = MAX_CONTEXT_MESSAGES / 2", app)
        self.assertIn(".slice(-MAX_CONTEXT_MESSAGES)", app)
        self.assertIn("updateContextWindow();", app)
        self.assertIn("three recent exchanges (six messages)", readme)
        self.assertEqual(server.MAX_HISTORY, 6)

    def test_guide_starts_compact_and_expands_to_reveal_the_answer(self):
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        self.assertIn(".guide-panel.is-expanded", styles)
        transcript = styles[styles.index(".chat-transcript {") : styles.index(".chat-message {")]
        expanded = transcript[transcript.index(".guide-panel.is-expanded .chat-transcript") :]
        self.assertIn("max-height: 240px", transcript)
        self.assertIn("max-height: none", expanded)
        self.assertIn("flex: 1 1 auto", expanded)
        self.assertIn('panel.classList.add("is-expanded")', app)
        self.assertIn('panel.classList.remove("is-expanded")', app)
        self.assertIn("options.revealStart", app)
        self.assertIn("articleRect.top - transcriptRect.top", app)
        self.assertIn('.panel.expanded', wix)
        self.assertIn("this.revealResult()", wix)

    def test_frontend_styles_preserve_responsive_and_accessibility_states(self):
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        dashboard = (DEMO / "wix-app" / "dashboard" / "provider-settings.html").read_text(encoding="utf-8")
        for expected in (
            "content-visibility: auto",
            "contain: layout paint",
            "scrollbar-gutter: stable",
            "flex-wrap: nowrap",
            "@media (prefers-reduced-motion: reduce)",
            "@media (forced-colors: active)",
        ):
            self.assertIn(expected, styles)
        mobile = styles[styles.index("@media (max-width: 800px)") : styles.index("@media (max-width: 520px)")]
        self.assertIn(".guide,\n  html.sidecar-embed .guide { inset: auto 8px 8px; width: auto; }", mobile)
        self.assertIn(".guide:has(.guide-panel.is-expanded)", mobile)
        self.assertIn("html.sidecar-embed .guide:has(.guide-panel.is-expanded) { top: 8px; }", mobile)
        self.assertIn(".guide-panel.is-expanded { height: 100%; max-height: 100%; }", mobile)
        self.assertNotIn(".guide-panel.is-expanded { height: calc(100dvh", mobile)
        self.assertIn("height: calc(100dvh - 16px)", wix)
        self.assertIn(":focus-visible", wix)
        self.assertIn(":focus-visible", dashboard)

    def test_sidecar_and_wix_share_the_monochrome_minimal_tokens(self):
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        for source in (styles, wix):
            for token in (
                "--guide-ink: #0b0b0b",
                "--guide-muted: #6b6b6b",
                "--guide-line: #dddddd",
                "--guide-pale: #f1f1f1",
                "--guide-paper: #ffffff",
            ):
                self.assertIn(token, source)
            self.assertNotIn("--guide-accent", source)
        panel = styles[styles.index(".guide-panel {") : styles.index("@keyframes reveal-up")]
        self.assertIn("border: 1px solid var(--guide-ink)", panel)
        self.assertIn("border-radius: 3px", panel)
        self.assertNotIn("box-shadow", panel)

    def test_mobile_guide_prioritizes_model_text_over_composer_height(self):
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        self.assertIn("@media (max-width: 520px)", styles)
        self.assertIn(".guide-panel:not(.is-expanded) .chat-transcript:not(:empty) { min-height: 145px; }", styles)
        self.assertIn("grid-template-columns: minmax(0, 1fr) 74px", styles)
        self.assertIn(".guide-panel.is-expanded .chat-transcript", styles)
        self.assertIn(".guide-panel.is-expanded .privacy-copy", styles)
        self.assertNotIn(".chat-input-row { grid-template-columns: 1fr; }", styles)
        self.assertIn(".send { width: 74px;", wix)

    def test_pages_prepare_the_live_backend_connection_before_loading_css(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        self.assertIn('rel="preconnect"', html)
        self.assertIn('rel="dns-prefetch"', html)
        self.assertLess(html.index('rel="preconnect"'), html.index('rel="stylesheet"'))
        self.assertNotIn("OLLAMA_API_KEY", html)

    def test_member_access_appears_once_at_the_top_and_supports_profile_state(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        site = (DEMO / "site.js").read_text(encoding="utf-8")
        self.assertEqual(html.count("Create an Account"), 1)
        self.assertEqual(html.count("Sign In"), 1)
        self.assertEqual(html.count(">Profile<"), 1)
        self.assertLess(html.index("Create an Account"), html.index('<header class="site-header">'))
        self.assertIn("fortune:memberstate", site)
        self.assertIn("memberProfile.hidden = !signedIn", site)
        self.assertIn("memberSignedOut.hidden = signedIn", site)

    def test_frontend_renders_clarification_choices_and_related_links(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        self.assertIn("data.choices", app)
        self.assertIn("data.related", app)
        self.assertIn("page_context: pageContext()", app)

    def test_edit_update_replaces_only_the_latest_turn_after_the_new_answer_succeeds(self):
        html = (DEMO / "index.html").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        styles = (DEMO / "styles.css").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        ask = app[app.index("async function ask") : app.index("async function checkHealth")]
        self.assertNotIn('id="edit-banner"', html)
        self.assertIn('id="edit-cancel"', html)
        self.assertIn('id="edit-status"', html)
        self.assertNotIn(">Editing<", html)
        self.assertIn("Edit question", app)
        self.assertIn('submitButton.textContent = "Update"', app)
        self.assertIn(">Cancel</button>", html)
        self.assertIn("Core.historyBeforeLatestExchange(history)", app)
        self.assertIn("startNew: Boolean(editing)", app)
        self.assertLess(ask.index("const data = await remoteAnswer"), ask.index("node.remove()"))
        self.assertLess(ask.index('data.kind === "privacy"'), ask.index("node.remove()"))
        self.assertIn("privacyHold(Boolean(editing))", ask)
        self.assertIn("questionField.value = value", ask)
        self.assertIn("Couldn’t update. Try again or cancel.", app)
        self.assertNotIn("The original answer is unchanged; retry or cancel.", app)
        self.assertIn('pendingClientEventId = "";', app[app.index("function startEditing") : app.index("function privacyHold")])
        self.assertIn(".chat-edit-button", styles)
        self.assertIn('edit.textContent = "Edit"', wix)
        self.assertIn('this.sendButton.textContent = "Update"', wix)
        self.assertIn(">Cancel</button>", wix)
        self.assertIn("this.history.slice(0, -2)", wix)
        self.assertIn("conversation_id: editing ? undefined", wix)
        self.assertIn("this.turns.slice(0, -1).concat(turn)", wix)
        self.assertIn("this.renderConversation()", wix)
        self.assertNotIn("if (!editing) this.result.hidden = true;", wix)
        self.assertIn("Couldn’t update. Try again or cancel.", wix)
        self.assertNotIn("The original answer is unchanged; retry or cancel.", wix)

    def test_return_submits_while_shift_return_stays_in_the_textarea(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        handler = app[
            app.index('questionField.addEventListener("keydown"') :
            app.index('suggestions.addEventListener("click"')
        ]
        self.assertIn('event.key !== "Enter"', handler)
        self.assertIn("event.shiftKey", handler)
        self.assertIn("event.isComposing", handler)
        self.assertIn("event.preventDefault()", handler)
        self.assertIn("form.requestSubmit()", handler)

        wix_handler = wix[
            wix.index('this.input.addEventListener("keydown"') :
            wix.index('root.addEventListener("keydown"')
        ]
        self.assertIn('event.key !== "Enter"', wix_handler)
        self.assertIn("event.isComposing", wix_handler)
        self.assertIn("event.preventDefault()", wix_handler)
        self.assertIn("this.form.requestSubmit()", wix_handler)

    def test_keyboard_activated_starters_restore_composer_focus(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        app_starters = app[
            app.index('suggestions.addEventListener("click"') :
            app.index('transcript.addEventListener("click"')
        ]
        wix_starters = wix[
            wix.index('this.suggestions.addEventListener("click"') :
            wix.index('this.transcript.addEventListener("click"')
        ]
        self.assertIn("restoreFocus: event.detail === 0", app_starters)
        self.assertIn("restoreFocus: event.detail === 0", wix_starters)

        app_ask = app[app.index("async function ask") : app.index("async function checkHealth")]
        wix_ask_start = wix.index("async ask")
        wix_ask = wix[wix_ask_start : wix.index("\n    beginEdit()", wix_ask_start)]
        self.assertIn("const restoreComposerFocus = options.restoreFocus", app_ask)
        self.assertIn("if (restoreComposerFocus", app_ask)
        self.assertIn("const restoreComposerFocus = options.restoreFocus", wix_ask)
        self.assertIn("if (restoreComposerFocus", wix_ask)

    def test_pages_and_wix_preload_the_model_without_a_provider_key(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        wix = (DEMO / "wix-app" / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        self.assertIn('apiUrl("/api/warmup")', app)
        self.assertLess(app.index("warmupPromise = warmModel"), app.index("window.FortuneGuide ="))
        self.assertIn('this.apiUrl("/api/warmup")', wix)
        self.assertNotIn("OLLAMA_API_KEY", app)
        self.assertNotIn("OLLAMA_API_KEY", wix)

    def test_static_directory_fallback_is_not_used_as_an_unlogged_chat_answer(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        site = (DEMO / "site.js").read_text(encoding="utf-8")
        fallback = site[site.index("function staticAnswer") : site.index("function selectedUrl")]
        ask = app[app.index("async function ask") : app.index("async function checkHealth")]
        self.assertNotIn("const FAQS", app)
        self.assertLess(fallback.index("ambiguityAnswer"), fallback.index("rankPages"))
        self.assertIn("onCurrentPage", fallback)
        self.assertIn("fallbackDestination", fallback)
        self.assertIn("sources:", fallback)
        self.assertIn("related:", fallback)
        self.assertIn("handoff_url:", fallback)
        self.assertIn("model_called: false", fallback)
        self.assertIn("distinctDestination(data)", app)
        self.assertNotIn("staticAnswer", ask)
        self.assertIn("pendingClientEventId", ask)

    def test_page_families_keep_specific_prompts_behind_compact_buttons(self):
        core = (DEMO / "guide-core.js").read_text(encoding="utf-8")
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        for prompt in (
            "What would you like to know about this class?",
            "Do you need a device or help using one?",
            "What kind of individual help do you need?",
            "What current class information are you trying to find?",
            "What would you like to know about registration?",
            "What kind of help are you trying to reach?",
            "What event information do you need?",
            "What current information are you looking for?",
        ):
            self.assertIn(prompt, core)
        self.assertIn('title.textContent = "Website Guide"', app)
        self.assertNotIn('"AI guide"', app)
        self.assertIn('questionField.placeholder = "Ask about this page"', app)
        self.assertIn("button.dataset.prompt = prompt", app)
        self.assertIn("button.textContent = Core.suggestionLabel(prompt)", app)
        self.assertNotIn('button.setAttribute("aria-label", prompt)', app)

    def test_client_holds_six_digit_ids_before_any_network_request(self):
        app = (DEMO / "app.js").read_text(encoding="utf-8")
        core = (DEMO / "guide-core.js").read_text(encoding="utf-8")
        ask = app[app.index("async function ask") : app.index("async function checkHealth")]
        self.assertLess(ask.index("personalInformationDetected(value)"), ask.index("remoteAnswer(safeQuestion,"))
        self.assertIn("privacyHold(Boolean(editTarget));", ask)
        self.assertIn(r"\d{6}", core)
        self.assertIn(r"\d{3}[-‐‑‒–—.\s]?\d{3}", core)
        self.assertIn('normalize("NFKC")', core)
        self.assertIn("Remove personal information and try again.", app)

    def test_public_deployment_examples_contain_no_api_key_value(self):
        deployment = DEMO / "deployment"
        for path in deployment.rglob("*"):
            if path.is_file() and path.suffix.lower() in {".md", ".js", ".mjs", ".html", ".example"}:
                text = path.read_text(encoding="utf-8")
                self.assertNotRegex(text, r"(?i)ollama_api_key\s*[:=]\s*['\"][A-Za-z0-9_-]{12,}")

    def test_wix_bundle_collects_the_key_only_in_an_admin_surface(self):
        wix = DEMO / "wix-app"
        dashboard = (wix / "dashboard" / "provider-settings.js").read_text(encoding="utf-8")
        dashboard_html = (wix / "dashboard" / "provider-settings.html").read_text(encoding="utf-8")
        site_element = (wix / "site" / "fortune-guide-element.js").read_text(encoding="utf-8")
        backend = (wix / "velo-backend" / "provider-config.web.js").read_text(encoding="utf-8")
        self.assertIn('type="password"', dashboard_html)
        self.assertIn('autocomplete="new-password"', dashboard_html)
        self.assertNotIn("localStorage", dashboard)
        self.assertNotIn("sessionStorage", dashboard)
        self.assertNotIn("providerKey", site_element)
        self.assertIn("Permissions.Admin", backend)
        self.assertNotIn("Permissions.Anyone", backend)
        self.assertNotIn("getSecretValue", dashboard)
        self.assertNotIn("getSecretValue", site_element)
        portable = (DEMO / "deployment" / "wix" / "fortune-guide-element.example.js").read_text(encoding="utf-8")
        for field in ("client_event_id", "conversation_id", "conversation_token", "pendingClientEventId"):
            self.assertIn(field, site_element)
        self.assertIn("Retired portable example", portable)
        self.assertIn("../../wix-app/site/fortune-guide-element.js", portable)
        self.assertNotIn("--guide-blue", portable)

    def test_railway_manifest_has_a_healthcheck_and_no_secret_values(self):
        manifest = json.loads((DEMO / "railway.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["deploy"]["startCommand"], "python3 server.py")
        self.assertEqual(manifest["deploy"]["preDeployCommand"], "python3 scripts/migrate.py")
        self.assertEqual(manifest["deploy"]["healthcheckPath"], "/health")
        env_template = (DEMO / ".env.example").read_text(encoding="utf-8")
        self.assertIn("OLLAMA_API_KEY=", env_template)
        self.assertIn("FORTUNE_MODEL_WARMUP_COOLDOWN=900", env_template)
        self.assertIn("FORTUNE_MODEL_KEEP_ALIVE=30m", env_template)
        self.assertIn("FORTUNE_CONVERSATION_CAPTURE=none", env_template)
        self.assertIn("FORTUNE_CONVERSATION_TOKEN_SECRET=", env_template)
        self.assertIn("DATABASE_URL=", env_template)
        self.assertNotRegex(env_template, r"OLLAMA_API_KEY=.+")
        self.assertNotRegex(env_template, r"FORTUNE_CONVERSATION_TOKEN_SECRET=.+")
        self.assertNotRegex(env_template, r"DATABASE_URL=.+")


if __name__ == "__main__":
    unittest.main(verbosity=2)

#!/usr/bin/env python3
"""Prompt provenance and immutable-boundary tests."""

import hashlib
import json
import os
import pathlib
import re
import sys
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import conversation_store
import evaluation_store
import prompt_policy
import server
import source_selector


class PromptPolicyTests(unittest.TestCase):
    def test_runtime_and_capture_use_one_policy_id(self):
        self.assertEqual(prompt_policy.PROMPT_POLICY_VERSION, "2026-08-18-v21")
        self.assertEqual(
            prompt_policy.PROMPT_BEHAVIOR_RELEASE,
            "infobot-priority-grounded-guide",
        )
        self.assertEqual(server.PROMPT_POLICY_VERSION, prompt_policy.PROMPT_POLICY_VERSION)
        self.assertEqual(
            server.CONVERSATION_RECORDER.prompt_version,
            prompt_policy.PROMPT_POLICY_VERSION,
        )
        with mock.patch.dict(
            os.environ,
            {"FORTUNE_PROMPT_VERSION": "stale-environment-value"},
            clear=True,
        ):
            recorder = conversation_store.ConversationRecorder(mode="none")
        self.assertEqual(recorder.prompt_version, prompt_policy.PROMPT_POLICY_VERSION)

    def test_selector_uses_compiled_reviewed_policy(self):
        self.assertEqual(source_selector.SYSTEM_PROMPT, prompt_policy.SYSTEM_PROMPT)
        self.assertIn("one relevant approved page", source_selector.SYSTEM_PROMPT)
        self.assertIn("never combine pages", source_selector.SYSTEM_PROMPT)
        self.assertIn("brief, natural follow-up", source_selector.SYSTEM_PROMPT)
        self.assertIn("Pick ASK only when ambiguity actually prevents", source_selector.SYSTEM_PROMPT)
        self.assertIn("do not append a fake invitation question", source_selector.SYSTEM_PROMPT)
        self.assertIn("protect privacy and source fidelity", source_selector.SYSTEM_PROMPT)
        self.assertIn("answer the participant's latest request directly", source_selector.SYSTEM_PROMPT)
        self.assertIn("current page is a useful hint, not a boundary", source_selector.SYSTEM_PROMPT)
        self.assertIn("candidate pages from across the approved site", source_selector.SYSTEM_PROMPT)
        self.assertIn("never imply fresher knowledge", source_selector.SYSTEM_PROMPT)
        self.assertIn("continue without groveling", source_selector.SYSTEM_PROMPT)
        self.assertIn("Ignore without acknowledging", source_selector.SYSTEM_PROMPT)
        self.assertIn("Fortune Society Digital Equity Infobot", source_selector.SYSTEM_PROMPT)
        self.assertIn("You are an AI", source_selector.SYSTEM_PROMPT)
        self.assertIn("not a Fortune counselor, case manager, or staff member", source_selector.SYSTEM_PROMPT)
        self.assertIn("plain, warm, respectful, nonjudgmental language", source_selector.SYSTEM_PROMPT)
        self.assertIn("written for a phone screen", source_selector.SYSTEM_PROMPT)
        self.assertIn("short practical steps", source_selector.SYSTEM_PROMPT)
        self.assertIn("Avoid jargon, blame, assumptions, and scripted filler", source_selector.SYSTEM_PROMPT)
        self.assertIn("asks to confirm, restate, or explain", source_selector.SYSTEM_PROMPT)
        self.assertIn("preserve that status", source_selector.SYSTEM_PROMPT)
        self.assertIn("do not rewrite the service as currently offered or available", source_selector.SYSTEM_PROMPT)
        self.assertIn("status contradiction", prompt_policy.RETRY_INSTRUCTIONS)
        self.assertIn(
            "State the affected service's negative status first",
            prompt_policy.RETRY_INSTRUCTIONS["status contradiction"],
        )
        self.assertNotIn("conversation logs are recorded", source_selector.SYSTEM_PROMPT.lower())
        self.assertNotIn("988", source_selector.SYSTEM_PROMPT)
        self.assertNotIn("laptop", source_selector.SYSTEM_PROMPT.lower())
        self.assertNotIn("email class", source_selector.SYSTEM_PROMPT.lower())

    def test_only_allowlisted_tunable_variants_compile(self):
        self.assertEqual(prompt_policy.compile_system_prompt(), prompt_policy.SYSTEM_PROMPT)
        self.assertEqual(
            set(prompt_policy.PROMPT_LAB_TUNABLE_MODULES),
            {"style", "clarification", "follow_up", "page_awareness"},
        )
        with self.assertRaises(ValueError):
            prompt_policy.compile_system_prompt({"grounding": "anything"})
        with self.assertRaises(ValueError):
            prompt_policy.compile_system_prompt({"style": "free text"})

    def test_visible_prompts_catalog_uses_current_clarification_variant(self):
        catalog = {
            module["key"]: module
            for module in evaluation_store.EvaluationStore._prompt_module_catalog()
        }
        clarification = catalog["clarification"]
        self.assertEqual(
            clarification["current_variant"],
            "blocking_ambiguity_only",
        )
        self.assertEqual(
            clarification["current_value"],
            prompt_policy.TEAM_TUNABLE_PROMPT_MODULES["clarification"]
            ["blocking_ambiguity_only"],
        )
        self.assertIn("ambiguity actually prevents", clarification["current_value"])
        self.assertIn("fake invitation question", clarification["current_value"])

    def test_visible_prompts_preview_matches_current_policy_registry(self):
        javascript = (ROOT / "evaluation.js").read_text(encoding="utf-8")
        self.assertIn(
            f'version: "{prompt_policy.PROMPT_POLICY_VERSION}"',
            javascript,
        )
        self.assertIn(
            f'behavior_release: "{prompt_policy.PROMPT_BEHAVIOR_RELEASE}"',
            javascript,
        )
        for module in evaluation_store.EvaluationStore._prompt_module_catalog():
            self.assertIn(
                f'current_variant: "{module["current_variant"]}"',
                javascript,
            )
            self.assertIn(
                f'current_value: "{module["current_value"]}"',
                javascript,
            )

    def test_retry_text_is_allowlisted_and_versioned(self):
        base = prompt_policy.SYSTEM_PROMPT + "\nCANDIDATE RECORDS:\n[]"
        retry = prompt_policy.build_retry_prompt(base, "unsupported factual wording")
        self.assertIn(prompt_policy.RETRY_INSTRUCTIONS["unsupported factual wording"], retry)
        resolved = prompt_policy.build_retry_prompt(base, "resolved source can answer")
        self.assertIn(prompt_policy.RETRY_INSTRUCTIONS["resolved source can answer"], resolved)
        self.assertIn("Return that page ID, not ASK", resolved)
        self.assertEqual(
            prompt_policy.build_retry_prompt(base, "participant supplied text"),
            base,
        )
        self.assertNotIn(
            "one or two",
            " ".join(prompt_policy.RETRY_INSTRUCTIONS.values()),
        )

    def test_manifest_artifact_hashes_and_current_prompt_hash(self):
        manifest_path = ROOT / "prompts" / "manifest.json"
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        self.assertEqual(
            manifest["current_policy_id"], prompt_policy.PROMPT_POLICY_VERSION
        )
        policy_source = ROOT / "prompts" / manifest["current_policy_source"]
        policy_source_hash = hashlib.sha256(policy_source.read_bytes()).hexdigest()
        self.assertEqual(manifest["current_policy_source_sha256"], policy_source_hash)
        compiled_hash = hashlib.sha256(prompt_policy.SYSTEM_PROMPT.encode()).hexdigest()
        self.assertEqual(manifest["current_compiled_prompt_sha256"], compiled_hash)
        current_artifact = (ROOT / "prompts" / "current.md").read_text(encoding="utf-8")
        compiled_block = re.search(
            r"## Compiled prompt\n\n```text\n(.*?)```",
            current_artifact,
            re.DOTALL,
        )
        self.assertIsNotNone(compiled_block)
        self.assertEqual(compiled_block.group(1), prompt_policy.SYSTEM_PROMPT)
        for entry in manifest["versions"]:
            artifact = ROOT / "prompts" / entry["artifact"]
            digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
            self.assertEqual(entry["artifact_sha256"], digest, entry["policy_id"])
            if entry.get("compiled_prompt_artifact"):
                compiled_artifact = ROOT / "prompts" / entry["compiled_prompt_artifact"]
                compiled_digest = hashlib.sha256(compiled_artifact.read_bytes()).hexdigest()
                self.assertEqual(
                    entry["compiled_prompt_artifact_sha256"],
                    compiled_digest,
                    entry["policy_id"],
                )
            if entry["reconstructed"]:
                self.assertTrue(entry.get("source_commit"), entry["policy_id"])
            else:
                self.assertTrue(entry.get("source_state"), entry["policy_id"])

    def test_v18_artifacts_remain_byte_exact_after_v19(self):
        manifest = json.loads(
            (ROOT / "prompts" / "manifest.json").read_text(encoding="utf-8")
        )
        v18 = next(
            entry
            for entry in manifest["versions"]
            if entry["policy_id"] == "2026-08-18-v18"
        )
        self.assertEqual(
            v18["artifact_sha256"],
            "d52ed256c4322240ec45936eb67e3d2166fd976961aa1cfce15e080ac5150770",
        )
        self.assertEqual(
            v18["compiled_prompt_artifact"],
            "versions/2026-08-18-v18-compiled.md",
        )
        self.assertEqual(
            v18["compiled_prompt_artifact_sha256"],
            "56fdc98e5678c87863dbacfa68a524e92823970667ab0b251a02ad716c660d8f",
        )

    def test_v19_artifacts_remain_byte_exact_after_v20(self):
        manifest = json.loads(
            (ROOT / "prompts" / "manifest.json").read_text(encoding="utf-8")
        )
        v19 = next(
            entry
            for entry in manifest["versions"]
            if entry["policy_id"] == "2026-08-18-v19"
        )
        self.assertEqual(
            v19["compiled_prompt_artifact"],
            "versions/2026-08-18-v19-compiled.md",
        )
        self.assertEqual(
            v19["compiled_prompt_artifact_sha256"],
            "5e60987ba9d5857ffd7a981f29fc73f965d8dae3414ca880765c2f4f95273d00",
        )

    def test_v20_artifacts_remain_byte_exact_after_v21(self):
        manifest = json.loads(
            (ROOT / "prompts" / "manifest.json").read_text(encoding="utf-8")
        )
        v20 = next(
            entry
            for entry in manifest["versions"]
            if entry["policy_id"] == "2026-08-18-v20"
        )
        self.assertEqual(
            v20["compiled_prompt_artifact"],
            "versions/2026-08-18-v20-compiled.md",
        )


if __name__ == "__main__":
    unittest.main()

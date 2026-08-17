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
import prompt_policy
import server
import source_selector


class PromptPolicyTests(unittest.TestCase):
    def test_runtime_and_capture_use_one_policy_id(self):
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
        self.assertIn("single page", source_selector.SYSTEM_PROMPT)
        self.assertIn("never combine pages", source_selector.SYSTEM_PROMPT)
        self.assertIn("Pick ASK only", source_selector.SYSTEM_PROMPT)
        self.assertIn("answer instead of asking which page or class", source_selector.SYSTEM_PROMPT)
        self.assertIn("Ignore without acknowledging", source_selector.SYSTEM_PROMPT)
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

    def test_retry_text_is_allowlisted_and_versioned(self):
        base = prompt_policy.SYSTEM_PROMPT + "\nCANDIDATE RECORDS:\n[]"
        retry = prompt_policy.build_retry_prompt(base, "unsupported factual wording")
        self.assertIn(prompt_policy.RETRY_INSTRUCTIONS["unsupported factual wording"], retry)
        resolved = prompt_policy.build_retry_prompt(base, "resolved source can answer")
        self.assertIn(prompt_policy.RETRY_INSTRUCTIONS["resolved source can answer"], resolved)
        self.assertEqual(
            prompt_policy.build_retry_prompt(base, "participant supplied text"),
            base,
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


if __name__ == "__main__":
    unittest.main()

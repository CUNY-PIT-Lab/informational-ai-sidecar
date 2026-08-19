#!/usr/bin/env python3
"""Clear staging conversation data while preserving evaluator and Prompts state.

The command is a dry run unless --apply is supplied. DATABASE_URL is read only
from the environment so credentials never enter shell history or process args.
"""

from __future__ import annotations

import argparse
import json
import os
import sys


TRANSCRIPT_TABLES = (
    "conversation_annotations",
    "conversation_evaluations",
    "conversation_messages",
    "conversation_turns",
    "conversations",
)
PRESERVED_TABLES = (
    "evaluator_accounts",
    "evaluator_sessions",
    "evaluation_bucket_sets",
    "evaluation_buckets",
    "prompt_review_workspaces",
    "prompt_proposals",
    "prompt_proposal_revisions",
    "prompt_proposal_comments",
    "prompt_proposal_events",
)


def table_counts(cursor, tables):
    counts = {}
    for table in tables:
        cursor.execute(f"SELECT COUNT(*) AS count FROM {table}")
        counts[table] = int(cursor.fetchone()["count"])
    return counts


def reset(connection, *, apply=False, expect_conversations=None):
    with connection.transaction():
        with connection.cursor() as cursor:
            cursor.execute("LOCK TABLE conversations IN ACCESS EXCLUSIVE MODE")
            before = table_counts(cursor, TRANSCRIPT_TABLES)
            cursor.execute(
                "SELECT COUNT(*) AS count FROM evaluation_audit_events "
                "WHERE conversation_id IS NOT NULL"
            )
            before["conversation_review_audit_events"] = int(
                cursor.fetchone()["count"]
            )
            preserved_before = table_counts(cursor, PRESERVED_TABLES)
            if (
                expect_conversations is not None
                and before["conversations"] != expect_conversations
            ):
                raise RuntimeError(
                    "Conversation count changed: expected "
                    f"{expect_conversations}, found {before['conversations']}"
                )
            if apply:
                # Normal review audit is append-only. A deliberate full reset
                # removes only conversation-linked audit rows in the same
                # transaction so no stale transcript reference survives.
                cursor.execute(
                    "ALTER TABLE evaluation_audit_events "
                    "DISABLE TRIGGER evaluation_audit_events_append_only"
                )
                cursor.execute(
                    "DELETE FROM evaluation_audit_events "
                    "WHERE conversation_id IS NOT NULL"
                )
                cursor.execute(
                    "ALTER TABLE evaluation_audit_events "
                    "ENABLE TRIGGER evaluation_audit_events_append_only"
                )
                cursor.execute("DELETE FROM conversations")
            after = table_counts(cursor, TRANSCRIPT_TABLES)
            cursor.execute(
                "SELECT COUNT(*) AS count FROM evaluation_audit_events "
                "WHERE conversation_id IS NOT NULL"
            )
            after["conversation_review_audit_events"] = int(
                cursor.fetchone()["count"]
            )
            preserved_after = table_counts(cursor, PRESERVED_TABLES)
            if preserved_after != preserved_before:
                raise RuntimeError("Evaluator or Prompts state changed during reset")
            if apply and any(after.values()):
                raise RuntimeError("Transcript reset left conversation data behind")
            return {
                "mode": "apply" if apply else "dry-run",
                "before": before,
                "after": after,
                "preserved_before": preserved_before,
                "preserved_after": preserved_after,
            }


def main(argv=None):
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expect-conversations", type=int)
    args = parser.parse_args(argv)
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("DATABASE_URL is required")

    import psycopg
    from psycopg.rows import dict_row

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        result = reset(
            connection,
            apply=args.apply,
            expect_conversations=args.expect_conversations,
        )
    json.dump(result, sys.stdout, sort_keys=True)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()

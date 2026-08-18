#!/usr/bin/env python3
"""Keep artifact-backed automated runs out of the evaluator queue.

The operation is metadata-only and dry-run by default. It never reads message
content, never deletes rows, and skips any conversation that has already
received evaluator work.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import uuid
from typing import Any


ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_RESULTS_DIR = ROOT / "evals" / "website-guide" / "results"
ID_FIELDS = {"conversation_id", "conversation_id_sent"}


def normalized_base_url(value: Any) -> str:
    return str(value or "").strip().rstrip("/").casefold()


def _artifact_ids(value: Any, found: set[str]) -> None:
    if isinstance(value, dict):
        for key, item in value.items():
            if key in ID_FIELDS and isinstance(item, str):
                try:
                    found.add(str(uuid.UUID(item)))
                except ValueError:
                    pass
            _artifact_ids(item, found)
    elif isinstance(value, list):
        for item in value:
            _artifact_ids(item, found)


def collect_conversation_ids(
    results_dir: pathlib.Path,
    target_base_url: str,
) -> tuple[list[pathlib.Path], set[str]]:
    expected_target = normalized_base_url(target_base_url)
    if not expected_target:
        raise ValueError("A target base URL is required")

    selected: list[pathlib.Path] = []
    found: set[str] = set()
    for path in sorted(results_dir.glob("*.json")):
        try:
            artifact = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        artifact_target = normalized_base_url(
            (artifact.get("target") or {}).get("base_url")
            if isinstance(artifact, dict)
            else ""
        )
        if artifact_target != expected_target:
            continue
        selected.append(path)
        _artifact_ids(artifact, found)
    return selected, found


def _dependencies():
    try:
        import psycopg
        from psycopg.rows import dict_row
    except ImportError as error:
        raise RuntimeError("Install requirements.txt before using this script") from error
    return psycopg, dict_row


def reclassify(
    database_url: str,
    conversation_ids: set[str],
    *,
    apply: bool,
) -> dict[str, int | bool]:
    if not str(database_url or "").strip():
        raise RuntimeError("DATABASE_URL is required")
    if not conversation_ids:
        raise RuntimeError("No artifact-backed conversation IDs were found")

    psycopg, dict_row = _dependencies()
    values = [uuid.UUID(value) for value in sorted(conversation_ids)]
    try:
        configured_min_inactive = int(
            os.environ.get("FORTUNE_EVALUATOR_MIN_INACTIVE_SECONDS", "60")
        )
    except ValueError:
        configured_min_inactive = 60
    min_inactive = max(0, min(configured_min_inactive, 3600))
    eligible_sql = """
        SELECT COUNT(*)::INTEGER AS count
        FROM conversations c
        WHERE c.id = ANY(%s)
          AND c.capture_mode = 'transcript'
          AND c.client_surface = 'synthetic'
          AND c.expires_at > NOW()
          AND c.last_turn_at <= NOW() - (%s * INTERVAL '1 second')
          AND EXISTS (
              SELECT 1 FROM conversation_turns t WHERE t.conversation_id = c.id
          )
          AND NOT EXISTS (
              SELECT 1
              FROM conversation_turns t
              WHERE t.conversation_id = c.id
                AND NOT (
                    t.status = 'complete'
                    AND t.privacy_state = 'clear'
                    AND t.review_state = 'ready'
                    AND (
                        SELECT COUNT(*) FROM conversation_messages m
                        WHERE m.turn_id = t.id
                    ) = 2
                )
          )
    """

    with psycopg.connect(database_url, row_factory=dict_row) as connection:
        with connection.transaction():
            with connection.cursor() as cursor:
                cursor.execute(
                    "SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))",
                    ("fortune:exclude-evaluation-runs",),
                )
                cursor.execute(
                    "SELECT id, client_surface FROM conversations "
                    "WHERE id = ANY(%s) ORDER BY id FOR UPDATE",
                    (values,),
                )
                matched_rows = [dict(row) for row in cursor.fetchall()]
                candidate_values = [row["id"] for row in matched_rows]
                profile = {
                    "matched_conversations": len(candidate_values),
                    "synthetic_conversations": sum(
                        row["client_surface"] == "synthetic" for row in matched_rows
                    ),
                    "benchmark_conversations": sum(
                        row["client_surface"] == "benchmark" for row in matched_rows
                    ),
                }

                cursor.execute(
                    "SELECT id FROM evaluation_bucket_sets "
                    "WHERE account_slot = 'admin' AND archived_at IS NULL"
                )
                bucket_set = cursor.fetchone()
                if not bucket_set:
                    raise RuntimeError("The shared evaluator workspace is unavailable")
                bucket_set_id = bucket_set["id"]

                cursor.execute(
                    """
                    SELECT pg_advisory_xact_lock(hashtextextended(
                        'evaluation:' || %s::TEXT || ':' || c.id::TEXT || ':', 0
                    ))
                    FROM conversations c
                    WHERE c.id = ANY(%s)
                    ORDER BY c.id
                    """,
                    (bucket_set_id, candidate_values),
                )
                cursor.fetchall()
                cursor.execute(
                    """
                    SELECT pg_advisory_xact_lock(hashtextextended(
                        'annotation:' || %s::TEXT || ':' ||
                        m.conversation_id::TEXT || ':' || m.id::TEXT, 0
                    ))
                    FROM conversation_messages m
                    WHERE m.conversation_id = ANY(%s)
                    ORDER BY m.conversation_id, m.id
                    """,
                    (bucket_set_id, candidate_values),
                )
                cursor.fetchall()

                cursor.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM conversation_evaluations
                         WHERE conversation_id = ANY(%s))::INTEGER AS evaluations,
                        (SELECT COUNT(*) FROM conversation_annotations
                         WHERE conversation_id = ANY(%s))::INTEGER AS annotations,
                        (SELECT COUNT(*) FROM evaluation_audit_events
                         WHERE conversation_id = ANY(%s))::INTEGER AS audit_events
                    """,
                    (candidate_values, candidate_values, candidate_values),
                )
                reviewed = dict(cursor.fetchone())
                cursor.execute(
                    """
                    SELECT DISTINCT conversation_id
                    FROM (
                        SELECT conversation_id FROM conversation_evaluations
                        WHERE conversation_id = ANY(%s)
                        UNION
                        SELECT conversation_id FROM conversation_annotations
                        WHERE conversation_id = ANY(%s)
                        UNION
                        SELECT conversation_id FROM evaluation_audit_events
                        WHERE conversation_id = ANY(%s)
                    ) reviewer_work
                    WHERE conversation_id IS NOT NULL
                    """,
                    (candidate_values, candidate_values, candidate_values),
                )
                reviewed_ids = {
                    row["conversation_id"] for row in cursor.fetchall()
                }
                safe_values = [
                    value for value in candidate_values if value not in reviewed_ids
                ]

                cursor.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM conversation_turns
                         WHERE conversation_id = ANY(%s))::INTEGER AS turns,
                        (SELECT COUNT(*) FROM conversation_messages
                         WHERE conversation_id = ANY(%s))::INTEGER AS messages,
                        (SELECT COUNT(*) FROM conversation_turns t
                         JOIN conversations c ON c.id = t.conversation_id
                         WHERE c.id = ANY(%s)
                           AND c.client_surface = 'synthetic'
                           AND t.review_state = 'ready')::INTEGER AS ready_turns
                    """,
                    (safe_values, safe_values, safe_values),
                )
                before = dict(cursor.fetchone())
                cursor.execute(eligible_sql, (safe_values, min_inactive))
                eligible_before = int(cursor.fetchone()["count"])

                updated_turns = 0
                updated_conversations = 0
                if apply:
                    cursor.execute(
                        """
                        UPDATE conversation_turns t
                        SET review_state = 'pending'
                        FROM conversations c
                        WHERE t.conversation_id = c.id
                          AND c.id = ANY(%s)
                          AND c.client_surface = 'synthetic'
                          AND t.review_state = 'ready'
                        """,
                        (safe_values,),
                    )
                    updated_turns = max(0, int(cursor.rowcount))
                    cursor.execute(
                        """
                        UPDATE conversations
                        SET client_surface = 'benchmark'
                        WHERE id = ANY(%s)
                          AND client_surface = 'synthetic'
                        """,
                        (safe_values,),
                    )
                    updated_conversations = max(0, int(cursor.rowcount))

                cursor.execute(
                    """
                    SELECT
                        (SELECT COUNT(*) FROM conversation_turns
                         WHERE conversation_id = ANY(%s))::INTEGER AS turns,
                        (SELECT COUNT(*) FROM conversation_messages
                         WHERE conversation_id = ANY(%s))::INTEGER AS messages
                    """,
                    (safe_values, safe_values),
                )
                after = dict(cursor.fetchone())
                cursor.execute(eligible_sql, (safe_values, min_inactive))
                eligible_after = int(cursor.fetchone()["count"])

    return {
        **profile,
        "linked_evaluations": int(reviewed["evaluations"]),
        "linked_annotations": int(reviewed["annotations"]),
        "linked_audit_events": int(reviewed["audit_events"]),
        "skipped_reviewed_conversations": len(reviewed_ids),
        "safe_conversations": len(safe_values),
        "turns_before": int(before["turns"]),
        "turns_after": int(after["turns"]),
        "messages_before": int(before["messages"]),
        "messages_after": int(after["messages"]),
        "ready_turns_before": int(before["ready_turns"]),
        "eligible_before": eligible_before,
        "eligible_after": eligible_after,
        "updated_turns": updated_turns,
        "updated_conversations": updated_conversations,
        "applied": bool(apply),
    }


def parser() -> argparse.ArgumentParser:
    value = argparse.ArgumentParser(description=__doc__)
    value.add_argument(
        "--results-dir",
        type=pathlib.Path,
        default=DEFAULT_RESULTS_DIR,
    )
    value.add_argument("--target-base-url", required=True)
    value.add_argument(
        "--apply",
        action="store_true",
        help="apply the metadata-only reclassification; otherwise report a dry run",
    )
    return value


def main() -> int:
    args = parser().parse_args()
    files, conversation_ids = collect_conversation_ids(
        args.results_dir.resolve(), args.target_base_url
    )
    result = reclassify(
        os.environ.get("DATABASE_URL", ""),
        conversation_ids,
        apply=args.apply,
    )
    result.update(
        {
            "artifact_files": len(files),
            "artifact_conversation_ids": len(conversation_ids),
            "target_base_url": normalized_base_url(args.target_base_url),
        }
    )
    print(json.dumps(result, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Revoke one claimed evaluator account and issue one replacement invite."""

from __future__ import annotations

import argparse
import os
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from evaluation_store import EvaluationStore, SLOT_KEYS  # noqa: E402


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("slot", choices=SLOT_KEYS)
    parser.add_argument("--confirm-reset", required=True, choices=SLOT_KEYS)
    parser.add_argument("--email", help="Optionally bind the replacement invitation")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("FORTUNE_EVALUATION_BASE_URL", "").rstrip("/"),
        help="HTTPS service URL used to print the fragment-based claim link",
    )
    args = parser.parse_args()
    if args.confirm_reset != args.slot:
        parser.error("--confirm-reset must match the account slot")

    store = EvaluationStore(enabled=True)
    store.open()
    try:
        token = store.reset_account_invitation(args.slot, email=args.email)
    finally:
        store.close()

    if args.base_url:
        print(f"{args.base_url}/evaluation#invite={token}")
    else:
        print(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

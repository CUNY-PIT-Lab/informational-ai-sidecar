#!/usr/bin/env python3
"""Issue one evaluator invitation from a private operator shell.

The raw token is printed once. It is never stored in PostgreSQL and should not
be pasted into deployment variables or shared logs.
"""

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
    parser.add_argument("--email", help="Optionally bind the invitation to one email address")
    parser.add_argument(
        "--base-url",
        default=os.environ.get("FORTUNE_EVALUATION_BASE_URL", "").rstrip("/"),
        help="HTTPS service URL used to print a fragment-based claim link",
    )
    args = parser.parse_args()

    store = EvaluationStore(enabled=True)
    store.open()
    try:
        token = store.issue_invitation(args.slot, email=args.email)
    finally:
        store.close()

    if args.base_url:
        print(f"{args.base_url}/evaluation#invite={token}")
    else:
        print(token)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

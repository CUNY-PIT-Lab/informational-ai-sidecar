#!/usr/bin/env python3
"""Apply versioned PostgreSQL migrations for the Fortune guide."""

from __future__ import annotations

import os
import pathlib
import sys


ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from conversation_store import run_migrations  # noqa: E402


def main() -> int:
    database_url = os.environ.get("DATABASE_URL", "").strip()
    if not database_url:
        print("DATABASE_URL is absent; no PostgreSQL migrations were needed.")
        return 0
    applied = run_migrations(database_url, ROOT / "migrations")
    if applied:
        print("Applied migrations: " + ", ".join(applied))
    else:
        print("PostgreSQL schema is current.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

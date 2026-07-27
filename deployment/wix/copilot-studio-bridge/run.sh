#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "test" ]]; then
  exec python3 -m unittest discover -s tests -p 'test_*.py'
fi

export APP_ENV="${APP_ENV:-development}"
export PUBLIC_WIDGET_URL="${PUBLIC_WIDGET_URL:-http://127.0.0.1:8788}"
export ALLOWED_FRAME_ANCESTORS="${ALLOWED_FRAME_ANCESTORS:-'self'}"
export MOCK_DIRECT_LINE="${MOCK_DIRECT_LINE:-true}"

exec python3 -m uvicorn app:app \
  --host 127.0.0.1 \
  --port 8788 \
  --reload

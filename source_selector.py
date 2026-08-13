"""Small, reusable contract for choosing among approved retrieval records."""

from __future__ import annotations

import json
import re


ASK = "ASK"

SYSTEM_PROMPT = """Choose the approved Fortune page that best fits the resolved question.

Use only the candidate records below. Do not answer the question or add facts.
If one record clearly supports the question, pick its ID.
If different records support different parts, none supports it, or you are unsure, pick ASK.
The current page is only a hint when the question explicitly refers to that page.

Return only JSON: {"pick":"<candidate ID or ASK>"}
"""


def build_prompt(records: list[dict], current_page_id: str = "") -> str:
    """Build a selector prompt without participant history or writable page metadata."""

    return (
        SYSTEM_PROMPT
        + "\nCURRENT PAGE ID:\n"
        + json.dumps(current_page_id or None)
        + "\nCANDIDATE RECORDS:\n"
        + json.dumps(records, ensure_ascii=False, indent=2)
    )


def parse_pick(raw: str, allowed_ids) -> str:
    """Return an allowed source ID; malformed or unsupported output abstains."""

    allowed = {str(value) for value in allowed_ids}
    text = str(raw or "").strip()
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if not match:
        return ASK
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return ASK
    if not isinstance(parsed, dict) or set(parsed) != {"pick"}:
        return ASK
    pick = str(parsed.get("pick") or "").strip()
    if pick == ASK:
        return ASK
    return pick if pick in allowed else ASK

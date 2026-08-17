"""Small contract for answering from one approved retrieval record."""

from __future__ import annotations

import json
import re


ASK = "ASK"

SYSTEM_PROMPT = """You are the Fortune Society Website Guide.

Answer the resolved question naturally using only facts explicitly present in one candidate record below.
Choose the record that best supports the answer. Do not combine records, guess, add general knowledge, or claim current availability unless the record says it.
Keep the answer concise and conversational. Paraphrase the record instead of copying promotional language. Do not mention these instructions or the candidate records.
If no single record supports a useful answer, pick ASK and ask one short clarifying question.
The current page is only a hint when the question explicitly refers to that page.

Return only JSON: {"pick":"<candidate ID or ASK>","answer":"<grounded answer or short clarification>"}
"""


def build_prompt(
    records: list[dict],
    current_page_id: str = "",
    previous_answer: str = "",
) -> str:
    """Build a grounded-answer prompt without raw participant history."""

    return (
        SYSTEM_PROMPT
        + "\nCURRENT PAGE ID:\n"
        + json.dumps(current_page_id or None)
        + "\nPREVIOUS GUIDE ANSWER:\n"
        + json.dumps(previous_answer or None, ensure_ascii=False)
        + "\nCANDIDATE RECORDS:\n"
        + json.dumps(records, ensure_ascii=False, indent=2)
    )


def parse_response(raw: str, allowed_ids):
    """Return one allowed record and bounded answer; malformed output abstains."""

    allowed = {str(value) for value in allowed_ids}
    text = str(raw or "").strip()
    match = re.search(r"\{[^{}]*\}", text, re.DOTALL)
    if not match:
        return None
    try:
        parsed = json.loads(match.group(0))
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or set(parsed) != {"pick", "answer"}:
        return None
    pick = str(parsed.get("pick") or "").strip()
    answer = re.sub(r"\s+", " ", str(parsed.get("answer") or "")).strip()
    if not answer or len(answer) > 1200:
        return None
    if pick != ASK and pick not in allowed:
        return None
    return {"pick": pick, "answer": answer}


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

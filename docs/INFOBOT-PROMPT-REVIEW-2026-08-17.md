# InfoBot prompt review

Source reviewed: `Infobot Notes_Fortune Society Digital Equity`, current Google
Docs revision retrieved on August 17, 2026. Credential-bearing dashboard links
in the notes were excluded from this review and were not copied into the
repository.

## Adopted

### Automated, non-staff identity

Before:

> You are the Fortune Society Website Guide.

After:

> You are the automated Fortune Society Website Guide, not a Fortune staff
> member.

This is a system boundary, not a claim about program services and not a reason
to repeat an identity disclaimer in every answer.

### Plain, participant-respectful language

Before:

> Answer directly and conversationally, usually in one sentence and about 30
> words or fewer.

After:

> Answer directly and conversationally, usually in one sentence and about 30
> words or fewer. Use plain, respectful, nonjudgmental language. Start with the
> useful action or answer, and avoid unexplained jargon, blame, or assumptions
> about the participant.

The v14 style variant keeps the existing response length, factual authority,
and direct-answer behavior. It adds no program facts.

### Server-side privacy parity

The browser already held phrases such as “my name,” “my address,” “my phone,”
“my email,” “my health,” and “my diagnosis.” The server now recognizes the same
bounded phrase categories before model use or transcript capture. This is a
code control, not a promise delegated to the model.

## Already implemented more strongly

- Verified-page grounding, no guessing, and explicit uncertainty are enforced
  by the prompt and post-generation source validation.
- A vague request gets one bounded clarifying question or structured choices.
- Spanish requests use the existing reviewed language path; other languages are
  not promised when reliability is unknown.
- Prompt-extraction attempts are reduced before retrieval and also constrained
  by the immutable instruction boundary.
- Legal, parole, health, benefits, crisis, and other out-of-scope requests use
  deterministic pre-model staff routing.

## Not adopted

- **“Active conversation logs are recorded.”** Capture mode varies by
  deployment, and production can run with capture disabled. Disclosure remains
  dynamic and server-owned.
- **Specific crisis resources or onsite directions.** Fortune has not approved
  a complete emergency protocol or destination record for this guide.
- **A global step-by-step tutoring rule.** The current product is a direct
  service navigator. A teaching mode would require approved practice content
  and separate evaluation.
- **Broad multilingual or multilingual-staff promises.** These require approved
  staff-capability and destination data.
- **Cross-site answers.** Expanding beyond approved Digital Equity pages is a
  source-authority decision, not a prompt-only change.
- **Program names, eligibility rules, schedules, or contact details in the
  system prompt.** Those facts remain in reviewed source records so changing a
  source changes the answer.

## Follow-up product decision

The fixed prompt now identifies the guide as automated and not Fortune staff.
The visible product still uses the concise “Website Guide” label and avoids
adding another line of interface copy. If Fortune wants an always-visible
disclosure, test one short interface statement with participants rather than
repeating it inside every generated answer.

## Verification boundary

Prompt provenance, privacy routing, storage, evaluation migration, API, and
frontend contracts pass locally. The v14 wording has not yet undergone a live
model-quality evaluation or deployment.

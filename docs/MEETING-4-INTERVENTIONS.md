# Infobot Meeting 4: design and development interventions

Source reviewed: Sasha's August 17, 2026 Zoom summary, forwarded the same day.
This report omits meeting credentials and participant-private material.

## Immediate product changes

| Area | Intervention | Release state |
| --- | --- | --- |
| Responses | Generate factual wording from one approved current page; never use canned factual answers or general knowledge. Retry one unsupported or repeated draft, then clarify. | Implemented; the combined local regression suite is green, with staging evaluation still required. |
| Conversation | Preserve context across page navigation and give the visitor a local reset control. | Implemented; verify again in the final production browser pass. |
| Shared evaluation | All four evaluators see the same transcript pool and bucket placements. Preserve actor attribution and optimistic conflict handling. | Implemented on the shared staging evaluator. |
| Transcript review | Show timestamps, sort newest first, and paginate the unreviewed list. | Implemented on the shared staging evaluator. |
| Prompt collaboration | Show the current reviewable modules and let evaluators share bounded drafts and comments without runtime activation. | Implemented with immutable proposal revisions; migration and staging verification remain release gates. |
| Source currency | Refresh updated workshop descriptions and the new home/contact FAQs. Exclude Staging, Inactive, outdated, and non-answer surfaces from answer authority. | Implemented from one 138-route Wix revision 2063 snapshot; staging retrieval evaluation remains. |
| Taxonomy | Keep Success and Needs Work, remove the Handoff review bucket, and return its existing placements to Not yet reviewed. | Implemented in migration 008; old bucket rows remain archived for history. |
| Wix | Keep the canonical mock deployment as the test surface until integration is ready. Do not create a second PIT Lab deployment. | Deferred by design. |

## Prompt intervention

The old effective prompt was scattered across prompt strings, runtime retry
text, server validators, and a stale transcript-logging default. Version 11
makes the division explicit:

- Fixed: source allowlist, one-record grounding, no guessing, current-detail
  caution, privacy, abstention, JSON schema, retry allowlist, output validators,
  repetition checks, rate limits, and deployment promotion.
- Team-tunable in Prompts: concise tone, clarification phrasing, follow-up
  advancement, and page-reference behavior. Reliable language mirroring stays
  a separate, code-controlled presentation module.
- Runtime data, never settings: the participant question, current page, prior
  answer, retrieved records, and source excerpts.

This keeps the model's job conversational and small. The server still decides
what material it may see and rejects unsupported claims.

## Bounded Prompts contract

The dashboard supports shared *proposals*, not direct production editing. A
proposal may target only style, clarification, follow-up, or page awareness and
may contain bounded suggestion text for human review. It records base policy
ID, author, timestamps, status, an optimistic version number, and an immutable
revision history.

Editors may draft and comment. An admin may mark a proposal ready for developer
review. Neither role may activate it or feed suggestion text to the model. A
developer must convert an accepted suggestion into a registered code variant.
Activation then requires a committed prompt artifact, updated manifest hash,
automated evaluation, pull-request review, merge, staging verification, and
explicit production deployment.

Free-text system prompts, edits to immutable modules, raw transcript insertion,
and dashboard-to-production activation are out of scope because they would
weaken the source and privacy boundary.

## Acceptance checks for the next release

1. Current FAQ and workshop mutations change generated answers in tests.
2. Ten multi-turn conversations retrieve different supported details without
   repeating a prepared paragraph.
3. Unsupported current-status, eligibility, and inventory claims are rejected.
4. Every evaluator sees the same transcript count, recency order, timestamps,
   placements, and notes.
5. Prompt policy ID is identical in health metadata, response metadata, stored
   turns, manifest, and the compiled prompt artifact.
6. Production retains capture mode `none`; evaluation data stays on the shared
   staging backend.

# Website Guide prompt history

This directory makes the prompt policy reviewable without making production
prompt text editable from the evaluation dashboard.

- `manifest.json` is the release ledger. Historical entries are reconstructed
  from the named Git commit and say so explicitly.
- `versions/` contains human-readable snapshots of each meaningful prompt or
  prompt-behavior release.
- `current.md` describes the compiled policy and the boundary between fixed
  server invariants and team-tunable presentation choices.
- Runtime data such as the participant question, prior guide answer, current
  page ID, and approved candidate records is deliberately absent.

The source of truth for the current compiled prompt is `prompt_policy.py`.
The server validates the selected source and answer after generation, so a
prompt proposal cannot authorize ungrounded facts. Historical version numbers
skip where a release changed routing or validation without creating a distinct
prompt artifact.

## Change process

1. Evaluators discuss a bounded suggestion within a reviewable presentation
   module; the suggestion has no runtime effect.
2. A developer converts an accepted suggestion into a registered variant,
   updates `prompt_policy.py`, adds a version snapshot, and updates the manifest.
3. Automated grounding, mutation, privacy, and multi-turn tests must pass.
4. The change reaches production only through review, merge, and deployment.

No dashboard action activates a prompt in production.

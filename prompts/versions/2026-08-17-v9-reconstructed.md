# Grounded sampling release v9 (reconstructed)

- Source commit: `4da667bca684b98ebf14ee4be7b0232a625b0c04`
- Commit date: `2026-08-17T16:48:16-04:00`
- Behavior release: bounded response variation
- Code-owned policy ID: `2026-08-17-v9`

The prompt text was byte-for-byte unchanged from v8. This release changed
model sampling from a fixed temperature of 0.35 to temperature 0.5 with a
per-call random seed. It remains a separate manifest entry because behavior
changed even though prompt text did not.

See `2026-08-17-v8-reconstructed.md` for the effective prompt.

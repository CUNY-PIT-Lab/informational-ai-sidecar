# Project TODO

## Evaluator signup links

Create three separate, one-time signup links for:

- [ ] Fortune Society representative (`editor-1`)
- [ ] Student delegate 1 (`editor-2`)
- [ ] Student delegate 2 (`editor-3`)

Do this only after:

- [x] Railway conversation capture is healthy and writing to Postgres.
- [x] At least one privacy-cleared conversation appears in the evaluation workspace.
- [x] A conversation and its bucket placement still appear after a reload.

Verified on staging on 2026-08-08: the content-free quality gate passed, 9 conversations were eligible for review, and 3 placements persisted through deployment.

Before sharing the links:

- [ ] Add admin-dashboard controls to generate or rotate each unassigned signup link.
- [ ] Confirm each link is limited to its intended account slot and expires after 24 hours.
- [ ] Deliver each link privately; never commit invitation tokens or passwords.

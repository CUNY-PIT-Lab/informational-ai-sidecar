# Website Guide — next steps

## Released baseline — 2026-08-09

- [x] Release the minimalist Website Guide to Railway and GitHub Pages.
- [x] Route broad starter questions to the bounded choice set: **Take a class**, **Get a device**, or **Talk to staff**.
- [x] Keep public production conversation capture off (`capture_mode=none`); it has no chat database or evaluator access.
- [x] Prove the synthetic staging evaluator can persist review buckets, notes, and annotations.

## 1. Fortune review of public guidance

- [ ] Review the current public-source refresh with a Fortune source owner before treating changed material as approved guidance.
- [ ] Confirm the wording and destinations for the three starter choices, plus class, device, individual-support, registration, and staff-handoff questions.
- [ ] Record the approved source URL, owner, approval date, and next review date for any new public answer claim.
- [ ] Build a small staff-approved question set for regression testing. Generic questions should offer choices; specific questions should remain source-backed.

## 2. Keep the public release healthy

- [ ] Perform a short post-release check: live `/health`, a Return-key chat smoke test, starter buttons, and a representative mobile page.
- [ ] Review Railway operational logs for error rate and request metadata only. Do not inspect or retain participant chat text.
- [ ] On every future release, run `./run.sh test`, `python3 scripts/build_pages.py`, deploy, then verify the live artifact rather than relying on a successful build alone.

## 3. Synthetic evaluator — staging only

- [ ] Add admin controls to issue or rotate an unassigned evaluator invite.
- [ ] Assign the Fortune representative and two student delegates only after Fortune names the three accounts.
- [ ] Make each invite single-use, account-bound, and valid for 24 hours; deliver it privately and never commit the token.
- [ ] Re-run the staging acceptance pass: save, reopen, and remove one note and annotation; confirm reviewer isolation, a stale-version `409`, and `orphan_annotations=0`.

## 4. Wix pilot — blocked on the site owner account

- [ ] Create or open the private Wix app, generate its real app/extension IDs, and grant the required Secrets Manager and Members Area permissions.
- [ ] Add the bounded backend chat endpoint or explicitly configure the external Railway API; keep the provider key server-side.
- [ ] If the external API is used, allow only the exact Fortune production and approved preview origins.
- [ ] Install first on a Wix test site and verify page context, compact controls, Return/Shift+Return, mobile layout, privacy hold, and staff handoff.
- [ ] Obtain Fortune approval before enabling the guide on the production Wix site.

## 5. Participant capture is not authorized

- [ ] Keep Railway production at `capture_mode=none`; do not copy staging database, capture, or evaluator variables into production.
- [ ] Before any participant transcript pilot, Fortune must approve the purpose, legal/privacy owner, exact notice, inclusion and exclusion rules, named reviewers, retention period, deletion/export process, incident contact, and end/renewal date.
- [ ] Run any proposed capture pilot on synthetic staging first. Transcript capture is not anonymization and must not be enabled for public traffic without that approval.

## Reference

- [Conversation capture contract](deployment/CONVERSATION-CAPTURE.md)
- [Evaluation workspace contract](deployment/EVALUATION-WORKSPACE.md)
- [Wix adoption roadmap](deployment/wix/ROADMAP.md)
- [GitHub Pages roadmap](deployment/github-pages/ROADMAP.md)

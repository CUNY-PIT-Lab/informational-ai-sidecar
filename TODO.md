# Website Guide — next steps

## Bounded source selector — 2026-08-12

- [x] Replace the prose-generating model contract with one reusable decision: return one allowed page ID or `ASK`.
- [x] Keep raw conversation history out of the provider request; send only the server-resolved question and bounded approved candidates.
- [x] Expand uncertain retrieval from three to ten candidates and prove all 144 substantive answer-authority pages are reachable by public title; exclude the Wix template-only Partners route.
- [x] Reject malformed IDs, unsupported distinctive terms, and model-selected records with no overlapping evidence; use compact clarification buttons instead of a fallback guess.
- [x] Remove Wix template people and boilerplate from searchable/model evidence while preserving legitimate structured team names from the About page.
- [x] Correct laptop guidance to match the live Devices page: free refurbished laptops through Computers 4 People have limited supply; the hold applies to mobile-device distribution.
- [x] Expand the stateful benchmark to 14 conversations and 59 turns, including Tech Fair Q&A and About/team deep-page retrieval.
- [x] Pass the full fixed and expanded suites against Railway staging with the real model: 41/41 fixed cases and 14/14 conversations, 59/59 turns, and 35/35 contextual turns. One truly ambiguous turn called the model and clarified; the synthetic-capture boundary stayed unchanged.
- [x] Promote the exact tested commit to production with capture `none`; repeat the capture-none benchmark at 41/41 fixed cases and 14/14 conversations, 59/59 turns, and 35/35 contextual turns; verify Return, a deep-page follow-up, clarification buttons, and source destinations in the published browser UI.

## Multi-turn retrieval release — 2026-08-12

- [x] Add 13 stateful retrieval conversations with 55 turns, including 32 deictic, elliptical, or topic-switch turns and a seven-turn stale-context test.
- [x] Freeze a pre-fix production baseline: 0/13 complete conversations, 28/55 turns, and 14/32 context-dependent turns passed.
- [x] Prefer reviewed class, device, certification, practice, support, registration, partner, impact, and Spanish-language sources without weakening privacy or source-authority gates.
- [x] Carry only the latest explicit safe topic into genuinely elliptical follow-ups; keep explicit topic shifts from reviving stale context.
- [x] Pass the real-model suite on Railway staging and production: 13/13 conversations, 55/55 turns, and 32/32 context-dependent turns on both.
- [x] Replay the seven-turn topic-switch conversation in the published browser UI with Return; all 14 visible user/guide messages rendered and the console stayed clean.
- [ ] Resolve the two stale pending turns reported by the staging aggregate audit before the next evaluator review. Do not alter participant-capture policy or copy staging data settings into production.

## Responsiveness and coverage release — 2026-08-12

- [x] Audit the canonical checkout, remote branches, and both GitHub repositories. The demo repository has no open PR; the PIT Lab mirror still has one open sync PR that predates this release.
- [x] Expand the fixed suite to 41 cases across all six request kinds and all four response kinds.
- [x] Fix typo routing, page-aware follow-ups, class clarification, prompt-injection cleanup, and the 600-character server boundary.
- [x] Route confident public-source matches without waiting for the model and remove model warmup from the send path.
- [x] Cap participant-facing answers at 32 words and keep clarifications, privacy holds, and staff handoffs shorter.
- [x] Deploy the exact tested commit to Railway staging and production; require terminal success and a capture-none production health boundary.
- [x] Merge the release PR, wait for GitHub Pages to finish, and verify the published asset hash.
- [x] Capture successful live runs for clarification, navigation, procedure, retrieval, privacy, and sensitive requests.
- [x] Re-run the immutable 41-case benchmark against production and attach its report to the release record.
- [ ] Review and refresh the open PIT Lab mirror PR after the canonical release is accepted.

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

- [x] Perform a short post-release check: live `/health`, Return-key chat runs, starter buttons, and the responsive-layout contracts.
- [x] Review Railway operational logs for error rate and request metadata only. Do not inspect or retain participant chat text.
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

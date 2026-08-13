# Website Guide systematic update report

Date: 2026-08-13  
Repositories: `zmuhls/fortune-digital-equity-guide-demo` and `CUNY-PIT-Lab/informational-ai-sidecar`

## Release decision

Fortune pull request [#13](https://github.com/zmuhls/fortune-digital-equity-guide-demo/pull/13) was merged on explicit operator instruction as `354898eb7a33fa4bd594e790a7ebdda9e84303b3`. The PIT Lab synchronization branch merged that exact Fortune `main` state in `06ab231` while preserving the PIT Lab README attribution banner. PIT Lab pull request [#1](https://github.com/CUNY-PIT-Lab/informational-ai-sidecar/pull/1) then merged the synchronized tree to PIT Lab `main` as `979becd1d4ce9f4ac94a224688a7e9466e521b8c`.

At the synchronization point, every implementation and test file in the PIT Lab branch matched Fortune `main` byte-for-byte. The only repository-specific difference was the eight-line PIT Lab attribution and deployment banner in `README.md`; this report is the second intentional PIT Lab-only file.

## Scope of the PIT Lab update

The update from PIT Lab base `e881b4888eebd309f21b86d29757344151051ec8` contains 63 commits and, before adding this report, changed 293 files with 84,081 additions and 7,347 deletions.

| Area | Files represented | Result |
| --- | ---: | --- |
| Sanitized public-page snapshots | 200 | Reproducible inert snapshots for the reviewed route inventory |
| Evaluation specifications, reports, and stored results | 22 | Fixed-case and multi-turn evidence retained with the code |
| Database migrations | 6 | Conversation capture, page context, evaluator identity/taxonomy, interaction context, and transcript annotations |
| Deployment and operator documentation | 7 | Explicit GitHub Pages, Railway, Wix, capture, evaluation, and replica contracts |
| Scripts | 11 | Build, capture verification, migration, audit, invitation, indexing, and evaluation utilities |
| Automated test modules | 11 | Server, browser, capture, evaluator, retrieval, build, and source-index contracts |
| Wix reference implementation | 4 | Website Guide element and bounded provider configuration source |

## Participant-facing changes

### Interface and interaction

- Renamed the participant surface to **Website Guide** throughout the sidecar UI.
- Replaced the earlier busy, rounded visual treatment with a monochrome editorial layout, compact controls, restrained borders, and stable mobile containment.
- Made Return submit the current message; Shift+Return inserts a newline; focus returns to the composer after keyboard submission.
- Added short, page-aware starter buttons whose hidden prompts retain the complete request.
- Replaced stacked clarification cards with one discreet selector that submits the selected approved option back through the normal request path.
- Removed the participant-facing `Source` disclosure and preserved at most one distinct destination action when navigation is useful.
- Added transactional edit/update/cancel behavior for the latest completed turn. A failed update preserves the original exchange and continuation state.
- Kept the transcript scrollable while the composer, privacy reminder, Info, and Contact controls remain stable.

### Retrieval and conversation behavior

- Replaced the large prose-generation contract with a bounded selector contract: the provider may return one approved page ID or `ASK`.
- Kept participant-facing prose, source authority, evidence extraction, and validation on the server.
- Prevented raw conversation history from being sent to the selector. The server resolves the current question and supplies no more than ten approved candidates.
- Routed clear navigation, program, class, staff, event, and site-information intents deterministically before a model call.
- Preserved elliptical follow-ups while allowing explicit topic changes to override prior context.
- Rejected malformed page IDs, unsupported terms, weak evidence, template-only content, excluded records, and archived/partial pages.
- Made 144 reviewed substantive answer pages reachable by title while excluding the captured Wix Partners placeholder.
- Kept clarification available for genuine ambiguity instead of guessing. The server returns a compact approved choice set when one source cannot be established.

### Grounding and source coverage

- Expanded the replica to 200 unique HTTPS routes and 200 reviewed compressed snapshots.
- Classified every route into a reviewed page family and retained source-owner/approval metadata in the index.
- Kept internal replica links inside the static demonstration while sending booking, form, upload, and member actions to the public Fortune site.
- Kept provider credentials, Wix runtime scripts, trackers, authenticated services, forms, and captured tokens out of the static artifact.

## Privacy, logging, and evaluation boundaries

- The browser and server both hold likely Fortune IDs and other obvious personal information before retrieval or a model call.
- Production remains `capture_mode=none`, with no configured conversation database and evaluation disabled.
- Staging alone uses `capture_mode=transcript`, a private Railway PostgreSQL service, 30-day retention, and synthetic test traffic.
- Only complete, privacy-clear, synthetic conversations may become review-ready. Non-synthetic, privacy-held, mixed, incomplete, or expired conversations are excluded from evaluator queues.
- Evaluator sessions use hashed tokens, secure same-site cookies, CSRF protection, role checks, expiring single-use invitations, and Argon2id password hashes.
- Reviewers receive isolated bucket sets, private notes, and message annotations. Audit and annotation tables reference IDs rather than copying transcript text.
- The aggregate-only staging audit initially found two expired pending leases. They were preserved as failed/excluded audit records; the repeated audit passed with zero stale turns, unsafe review-ready turns, privacy-text violations, orphan placements, or orphan annotations.

## Validation evidence

The following checks were run from the synchronized PIT Lab checkout after merging Fortune `main`:

| Check | Result |
| --- | --- |
| Python suite | 162 passed |
| Browser-core and bridge suite | 15 passed |
| Snapshot/capture safety suite | 13 passed |
| Canonical route-index validation | 200 unique HTTPS routes |
| Snapshot/manifest validation | 200 reviewed snapshots |
| Static Pages build | 211 files; 200 indexed and 200 replica routes |
| Dependency audit | 0 vulnerabilities |
| Whitespace/error scan | `git diff --check` passed |
| Fortune Pages workflow | Run `31727135550` completed successfully for merge `354898e` |

Stored production acceptance evidence in `evals/website-guide/results/` records 41/41 fixed cases, 14/14 multi-turn conversations, 59/59 turns, and 35/35 contextual turns. Those stored live evaluations are release evidence from the bounded-selector deployment; the test counts above are the fresh post-merge verification performed for this synchronization.

## Live environment readback

Read back on 2026-08-13 after the Fortune merge:

| Surface | State |
| --- | --- |
| Fortune GitHub Pages | Workflow `31727135550` succeeded from `354898e` |
| Railway production | Deployment `b3c91b3f-7b4e-4bd8-9950-4b9f6cc71ec6` is `SUCCESS`; 200 pages; capture off; no database; evaluator disabled |
| Railway staging | Deployment `743c86df-a0bd-4d01-af5f-355df6ebe826` is `SUCCESS`; 200 pages; synthetic transcript capture ready; schemas 005/006 ready |
| PIT Lab repository | PR #1 merged to `main` as `979becd` |
| PIT Lab GitHub Pages | Run `31727343295` passed build and deploy; the live sidecar and four shared JS/CSS assets matched Fortune Pages byte-for-byte |

## Boundaries and unresolved ownership work

- PIT Lab Pages is enabled with GitHub Actions and publishes the same static Website Guide artifact as Fortune Pages. Both static sites use the shared Railway production API.
- The Wix reference implementation is current in source, but this repository does not contain the generated private Wix app identifiers or authorization needed to publish it to the Fortune Wix site.
- Production participant transcript capture remains deliberately disabled. Enabling it still requires an approved purpose, notice, reviewer identities, retention/deletion/export process, and incident owner.
- The PR #13 merge records the operator's release instruction; it is not independent evidence of a separate Fortune source-owner sign-off.

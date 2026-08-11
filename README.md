# Fortune Digital Equity page-aware guide

<div align="center">

**[▶ Live deployment — zmuhls.github.io/fortune-digital-equity-guide-demo](https://zmuhls.github.io/fortune-digital-equity-guide-demo/)**

Built and deployed by [@zmuhls](https://github.com/zmuhls) · [CUNY AI Lab](https://github.com/CUNY-AI-Lab)

</div>

This repository publishes an inert replica of the public Fortune Digital Equity site with its informational sidecar. The August 8 inventory contains 200 public HTML routes drawn from the Wix sitemaps, blog feed, pagination links, and public member links. Each route preserves the rendered public page while removing Wix scripts, forms, tokens, trackers, and authenticated services. Internal links stay inside the replica; booking, form, upload, and member actions lead to the live Fortune site.

The page remains readable when the model service is unavailable. In that state, the static GitHub Pages build uses the public index for page context and links visitors to source pages. The published Pages configuration calls a separate Railway backend at `https://guide-api-production-a1a1.up.railway.app`. That service holds the provider key, accepts the `https://zmuhls.github.io` browser origin, and applies per-client and shared daily model-call limits. The server preloads GLM-5.2 at startup. The Pages and Wix clients repeat the same empty warm-up request when the guide loads, while a server-side cooldown collapses visitors into one provider call and keeps the model ready for 30 minutes.

## Source limits

The index is a public-site inventory, not a claim that every URL can support an answer. The current crawl contains:

- 143 current operational pages that may support answers.
- 27 excluded pages, including new routes awaiting review, test, member, upload, duplicate, and staging pages.
- 21 archived pages retained for provenance and historical navigation.
- 9 navigation records that can lead to another page but cannot establish current service facts.

Old posts, category archives, past Tech Fair pages, member surfaces, test pages, duplicate services, and archive-labelled classes do not support participant answers. Dates, locations, registration, availability, eligibility, and inventory can change. The guide sends visitors to the current Fortune page or staff for confirmation.

Every index record carries its canonical URL, authority state, content hash, proposed content owner, and Fortune-review status. The crawler keeps excluded and archived records in the inventory so reviewers can see the full routing scope.

## Page-aware chat

The generated mock site uses the canonical path for each indexed URL. Opening the guide on a class, device, support, calendar, event, program, news, or archive page changes the guide heading, suggested questions, and page context. The interface keeps the initial state small: one question field, an explicit privacy notice, and a few prompts drawn from the current page.

The guide stays compact: two page-specific actions, one question field, a short privacy notice, and collapsed **Info** and source details. Use `?open=1` on a demonstration URL to open it for review.

After a question:

1. The browser starts a credential-free warm-up request while the visitor reads the page. The backend sends Ollama's documented empty preload request and keeps the model loaded for the configured period.
2. The browser sends the question, a short in-memory history, and the canonical current-page URL, path, and title.
3. The privacy gate holds likely personal information before retrieval or model use. A standalone six-digit value is treated as a possible Fortune ID.
4. Known vague requests such as **help**, **device**, **class**, and **internet** receive one short clarifying question.
5. The server checks the approved record for the current page. When that record contains matching evidence, it is the only factual record sent to the model.
6. When the current page cannot answer, retrieval searches the wider approved public index. When that search finds no matching evidence, the model is not called and the guide sends the visitor to staff.
7. GLM-5.2 on Ollama Cloud selects from the supplied source IDs. The server validates that choice and builds the visible factual answer from sentences in the selected website record. Model-written factual prose is never shown.
8. Every answer adds another useful page, the staff route, and a way to continue asking questions. The browser never receives `OLLAMA_API_KEY`.

The latest completed user question includes **Edit**. The original question and answer stay visible while the visitor edits. **Update** branches from the preceding bounded context without reusing the old server conversation, and replaces the visible pair only after the revised request succeeds. The Wix element follows the same latest-question behavior.

Archive, navigation, and excluded routes still receive a tailored guide. Their page text cannot become factual answer authority. The guide moves the visitor to a current operational page.

## Privacy

The guide tells visitors: **Do not enter your six-digit Fortune ID, name, phone number, email, address, case details, or other personal information.** The browser replaces a message containing a likely six-digit Fortune ID with a privacy notice before adding it to chat history or making a network request. The backend applies the same hold before retrieval or a model call. Names, contact details, case information, health information, passwords, and similar details follow the same pre-model route.

Conversation capture is off by default. With `FORTUNE_CONVERSATION_CAPTURE=none`, the server writes no query log and needs no chat database. Browser history exists only in memory for the current tab and is capped at three recent exchanges (six messages). Moving to another mock page clears that history. Open-ended questions sent to the active model must use public or invented information.

An isolated evaluation deployment may select `metadata` or `transcript` capture after Fortune approves the purpose, notice, reviewers, and retention period. Metadata mode stores identifiers and bounded routing/result fields without question or answer text. It also records server-owned interaction labels: opening or follow-up, request type, request and response language, retrieval scope, and prompt-policy version. Transcript mode stores the question and answer only when the automated privacy hold classifies the turn as clear; blocked and sensitive turns keep metadata but no message content. The hold is not guaranteed anonymization, so transcript mode is synthetic-only until Fortune approves participant use and its visible notice. Captured conversations expire after 90 days by default. See [the conversation-capture deployment contract](deployment/CONVERSATION-CAPTURE.md).

Internal Drive notes and meeting transcripts may shape navigation, ambiguity, transparency, and handoff tests. They are not participant-facing factual sources. A statement enters the public answer index only after Fortune assigns a source URL, owner, approval date, and next review date. See [deployment/TRANSCRIPT-INGESTION.md](deployment/TRANSCRIPT-INGESTION.md).

## Evaluation workspace

Railway serves a separate `/evaluation` workspace for approved synthetic transcripts. The database seeds one admin slot and three editor slots with no email, password, or invitation token. Each reviewer receives an independent bucket set with **Success**, **Needs work**, and **Handoff**, plus the virtual **Unsorted** area and custom buckets. Moves use optimistic versions, persist in PostgreSQL, and append a transcript-free audit event.

The workspace only lists complete, privacy-clear, unexpired conversations whose client surface is `synthetic`. Reviewers can keep a private conversation note and annotate individual transcript messages as helpful, unclear, incorrect, a safety concern, or other. Annotation records reference message IDs and never copy transcript text into evaluation or audit tables. Invitation tokens are generated only when an operator deliberately assigns a slot. See [the evaluation deployment contract](deployment/EVALUATION-WORKSPACE.md).

Run the content-free aggregate release gate with `DATABASE_URL` supplied through the environment:

```bash
python3 scripts/audit_conversation_quality.py
```

## Local commands

Run the key-free tests and check that the index can produce all route shells:

```bash
./run.sh test
python3 scripts/build_pages.py --check-index
```

The test launcher runs the Python unit suite across retrieval, API contracts, privacy, source authority, grounding, conversation persistence, the crawler, the Pages builder, production limits, warm-up behavior, responsive answer expansion, member access, styling safeguards, and Wix secret handling. It then runs 15 browser-core and bridge tests plus 13 snapshot-capture safety tests.

Build the static GitHub Pages output:

```bash
python3 scripts/build_pages.py
python3 -m http.server 8791 --directory _site
```

The build writes 200 `index.html` route snapshots under `_site/`, including the root route, and copies only the shared files that the replica and sidecar require.

Run the live local model demo:

```bash
export OLLAMA_API_KEY="your Ollama Cloud key"
./run.sh
```

The launcher uses `http://127.0.0.1:8790`, leaves an occupied port untouched, and keeps the credential in the server process.

Refresh the public Wix index manually when a source review is planned:

```bash
./run.sh index
python3 scripts/build_pages.py --check-index
./run.sh test
```

The refresh obeys `robots.txt`, rate-limits requests, retries `429` responses, and rewrites `site-index.json`. Review content-hash changes, authority changes, removed URLs, partial responses, and volatile service information before accepting the refreshed file.

## Weekly source review

The repository scaffold includes a Monday 13:17 UTC index-refresh check and a manual dispatch in [`.github/workflows/refresh-index.yml`](.github/workflows/refresh-index.yml). The check preserves the checked-in index as `baseline-site-index.json`, creates a refreshed `site-index.json`, validates that it can build all route shells, and uploads both files for 14 days in an artifact named `fortune-site-index-review-<run number>`.

The refresh check has read-only repository permission. It does not commit, push, deploy, or treat changed public text as approved. A reviewer compares the two index files, confirms source authority and volatile claims with Fortune staff, then deliberately accepts any approved update and rebuilds `_site/`.

## Wix and GitHub Pages

The [deployment overview](deployment/README.md) carries the shared API contract.

- [Wix app subset](wix-app/README.md) contains the administrator key form, Admin-only Wix Secrets Manager methods, backend-only secret reader, embedded-script fragment, and site guide element. [The earlier roadmap](deployment/wix/ROADMAP.md) retains the extension-selection history.
- [Copilot Studio bridge](deployment/wix/copilot-studio-bridge/README.md) is an optional, separately hosted Direct Line embed for evaluating Fortune's Microsoft agent on Wix without exposing its channel secret. It is limited to approved public information and does not replace the guide's pre-provider privacy and source-authority checks.
- [GitHub Pages roadmap](deployment/github-pages/ROADMAP.md) describes the 200-route public replica, the source-backed static state, the active-model backend, and the review gates before sharing the URL with Jacob and the Fortune team.

The Pages publication workflow is [`.github/workflows/pages.yml`](.github/workflows/pages.yml). It builds the allowlisted `_site/` directory and deploys that artifact after changes reach `main` or an authorized manual run begins.

The provider remains behind the server contract. Fortune can later move from the Ollama meeting provider to its approved Microsoft route without rebuilding the participant interface.

## GitHub publication

The demonstration has a dedicated public repository at [zmuhls/fortune-digital-equity-guide-demo](https://github.com/zmuhls/fortune-digital-equity-guide-demo). Its repository root contains only the demonstration source, tests, workflows, and deployment notes. GitHub Actions builds the allowlisted static artifact and publishes it at [zmuhls.github.io/fortune-digital-equity-guide-demo](https://zmuhls.github.io/fortune-digital-equity-guide-demo/). The public Pages version uses the HTTPS model backend configured in `config.js`. If that service is unavailable, the replicated pages and source navigation remain readable, while chat reports that it is unavailable instead of substituting an unlogged browser answer.

## Suggested meeting path

1. Open a route with `?open=1` and press one page-specific starter.
2. Open a second mock route and show that the sidecar title, prompts, and context counter reset with the page.
3. Ask a page-specific question and follow the related route to another mock page.
4. Enter `device` to show one clarifying question.
5. Ask about an Excel topic to show retrieval of a specific class page.
6. Enter `123456` to show the pre-model Fortune ID privacy hold.
7. Stop the backend and show that the static page context and source links remain available.

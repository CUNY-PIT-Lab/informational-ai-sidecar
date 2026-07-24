# Deployment scaffold

This directory separates the public guide from the service that calls the model. Browser code receives an API base URL. The Ollama key stays in Wix Secrets Manager or in the environment of an external backend. The maintained Wix implementation subset now lives at [`../wix-app/`](../wix-app/); the files under `deployment/wix/` preserve the earlier portability examples and roadmap.

The shared backend also accepts `POST /api/warmup` from approved origins. The request has no user content and no credential. It asks Ollama to preload the configured model, applies a global cooldown, and keeps the model loaded for the configured duration. The server performs the same warm-up after startup. `FORTUNE_MODEL_WARMUP_COOLDOWN` defaults to 900 seconds and `FORTUNE_MODEL_KEEP_ALIVE` defaults to `30m`.

## Paths

- `wix/ROADMAP.md` describes a private Wix app that installs the guide across Fortune's site.
- `wix/embedded.html.example` is the small fragment an embedded-script extension adds at the end of each page.
- `wix/fortune-guide-element.example.js` is a portable custom element. It passes the current page URL and title to the backend and renders clarifying questions, approved sources, related routes, and staff handoff.
- `wix/backend/ollama-proxy.example.mjs` shows the server boundary without relying on invented Wix extension IDs or package imports.
- `github-pages/ROADMAP.md` describes a public static demonstration backed by the same external API.
- `github-pages/config.example.js` contains public runtime settings only.
- `TRANSCRIPT-INGESTION.md` defines how a private project transcript can inform behavior and tests without becoming a public answer source.

## Shared API contract

The Wix and GitHub Pages clients send the same request shape. History stays in browser memory and is capped at six user or assistant messages:

```json
{
  "message": "I need help with a computer",
  "history": [{ "role": "user", "content": "I need help" }],
  "page_context": {
    "url": "https://www.fortunedigitalequity.org/trainings",
    "path": "/trainings",
    "title": "Trainings"
  }
}
```

The server returns this response shape:

```json
{
  "kind": "answer",
  "message": "Source-bounded response",
  "reason": "Short explanation of the route",
  "sources": [{ "id": "approved-page", "title": "Approved page", "url": "https://www.fortunedigitalequity.org/..." }],
  "related": [{ "title": "Next section", "url": "https://www.fortunedigitalequity.org/..." }],
  "choices": [],
  "handoff_url": "https://www.fortunedigitalequity.org/contact",
  "model": "glm-5.2",
  "model_called": true,
  "continuation": { "label": "Ask the live guide", "available": true }
}
```

An ambiguous request returns `kind: "clarify"`, one short question in `message`, and two or three `{ "label", "prompt" }` choices. Every response includes at least one approved source and one related route. The interface keeps the question form available and offers `handoff_url` when the guide cannot resolve the request.

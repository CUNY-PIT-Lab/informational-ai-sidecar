# Public-site snapshot capture

The snapshot command reads every route from `site-index.json` and opens each
public URL in Firefox at 1440 by 1200 pixels. It scrolls through the rendered
page so lazy images and widgets can appear, upgrades each image to its resolved
`currentSrc`, and then serializes the main frame. Firefox rejects cookies for
the capture, and every route uses the same user agent and language.

Before serialization, the command removes scripts, templates, preload hints,
meta refreshes, token-bearing Wix data, inline handlers, executable URLs,
objects, embeds, and `srcdoc`. Forms become inert `div` shells, and buttons
become inert. A visible iframe becomes an inert screenshot linked to its
original public content; when a screenshot cannot be captured, its outbound
link remains as a labeled placeholder. This preserves the appearance of a
public form, calendar, video, or carousel without publishing its runtime.
Each result also receives `noindex` and `no-referrer` directives.

Install the pinned browser package and Firefox once:

```sh
npm ci
npx playwright install firefox
```

Run the complete capture:

```sh
npm run capture:replica -- --concurrency 2
```

The command stages all files in a temporary directory. It publishes
`replica-snapshots/<page-id>.html.gz` and `replica-manifest.json` only after
every indexed route succeeds with its expected status and every page reports
the same numeric Wix revision. Existing output remains in place when a route
fails.

For a bounded network smoke check, choose indexed routes and a separate output
directory:

```sh
npm run capture:replica -- \
  --route / \
  --route /about \
  --output-dir /tmp/fortune-replica-smoke
```

`source_bytes` and `source_sha256` describe the sanitized UTF-8 HTML before
compression. `snapshot_bytes` and `snapshot_sha256` describe the deterministic
gzip file produced by the pinned pure-JavaScript compressor. Setting
`SOURCE_DATE_EPOCH` also fixes the manifest's `captured_at` value for
reproducible builds.

An expected non-200 response requires an exact route exception and a separate
output directory:

```sh
npm run capture:replica -- \
  --allow-status https://www.fortunedigitalequity.org/example=404 \
  --output-dir /tmp/fortune-status-check
```

Production artifacts contain status 200 for all indexed routes. A capture that
reads an alternate `--index` also requires a separate output directory.

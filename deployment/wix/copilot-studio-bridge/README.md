# Safe Wix embed for Microsoft Copilot Studio

This package serves a small, sandboxed chat widget that a Wix site can embed
with an iframe. The Copilot Studio Direct Line secret stays on the server. The
browser receives only a short-lived token for one conversation.

The service is intended for a public-information agent. It must not be used for
case status, eligibility decisions, participant records, staff reviews, or
other sensitive workflows. Messages still pass through Microsoft Copilot
Studio before this service or any toolkit guardrail can inspect them.

## Architecture

```text
Wix page
  -> sandboxed iframe on the widget origin
     -> same-origin token request
        -> server-side Direct Line secret
           -> one-conversation Direct Line token
              -> Microsoft Copilot Studio
```

The server:

- restricts framing with `Content-Security-Policy: frame-ancestors`
- issues a one-use bootstrap value for each widget load
- rate-limits new conversations by client address
- creates an unguessable Direct Line user ID beginning with `dl_`
- binds the Direct Line token to the widget origin
- never returns or logs the Direct Line secret
- disables caching and browser permissions the widget does not need

The browser:

- holds its Direct Line token in memory only
- loads a pinned Microsoft Web Chat bundle
- does not use local storage, session storage, cameras, microphones, or uploads
- displays a category-only privacy boundary and a direct human-contact route

## Local preview

Install the small runtime and start the mock preview:

```bash
cd deployment/wix/copilot-studio-bridge
python3 -m pip install -r requirements.txt
./run.sh
```

Open `http://127.0.0.1:8788/preview`. Mock mode exercises the embed, handshake,
rate limit, responsive layout, and message UI without a Microsoft secret or
model call.

Run the tests:

```bash
./run.sh test
```

## Copilot Studio setup

1. Keep this agent limited to approved public information.
2. In Copilot Studio, open **Settings**, **Security**, then **Web channel
   security**.
3. Turn on **Require secured access**.
4. Copy one Direct Line secret into the deployment environment as
   `COPILOT_DIRECT_LINE_SECRET`.
5. If the channel exposes enhanced authentication or a trusted-origins list,
   add the exact widget origin from `PUBLIC_WIDGET_URL`. A trusted-origin list
   configured in Microsoft overrides origins supplied during token generation.
6. Test the published agent with prompts containing names, case details,
   requests for eligibility decisions, prompt injection, unsupported claims,
   and requests to contact a person.

Microsoft notes that web-channel security changes can take up to two hours to
propagate. Treat the agent as public during that window.

## Railway deployment

Deploy this directory as its own Railway service, with
`deployment/wix/copilot-studio-bridge` set as the service root directory. Do
not replace the repository's existing root Railway service. Configure:

```text
APP_ENV=production
PUBLIC_WIDGET_URL=https://YOUR-WIDGET-DOMAIN
ALLOWED_FRAME_ANCESTORS=https://www.fortunesociety.org https://YOUR-WIX-PREVIEW-DOMAIN
COPILOT_DIRECT_LINE_SECRET=stored-only-in-Railway
WIDGET_TITLE=Fortune information guide
WIDGET_DESCRIPTION=Verified public information about programs, events, and ways to connect.
CONTACT_URL=https://fortunesociety.org/contact-us/
CONTACT_LABEL=Contact The Fortune Society
```

`ALLOWED_FRAME_ANCESTORS` is a space-separated CSP source list. Use exact HTTPS
origins. Do not use `*`. Wix preview and the published custom domain may have
different origins, so test both and remove preview origins when they are no
longer needed.

Optional settings:

```text
DIRECT_LINE_DOMAIN=https://directline.botframework.com/v3/directline
TOKEN_RATE_LIMIT=8
TOKEN_RATE_WINDOW_SECONDS=300
```

Use the regional Direct Line domain when the Copilot Studio agent is
regionalized. Mock mode is rejected in production.

The bundled rate limiter is intentionally small and runs in process. Keep this
service at one replica for the pilot. Before scaling horizontally or supporting
high public traffic, replace it with a shared Redis or edge rate limit.

## Wix installation

1. Deploy the widget and verify `/health`.
2. Replace `https://YOUR-WIDGET-DOMAIN` in
   [`wix-embed.html`](wix-embed.html) with the exact `PUBLIC_WIDGET_URL`.
3. In Wix, add **Embed Code**, choose **Embed HTML**, and paste the iframe.
4. Give the component a stable desktop height of about 680 px and a mobile
   height of at least 620 px.
5. Confirm that the published page origin appears in
   `ALLOWED_FRAME_ANCESTORS`.

No Direct Line secret, API key, or Copilot agent ID belongs in Wix page code.

## Production acceptance checks

- Opening the widget directly and through Wix creates separate conversations.
- The Direct Line secret does not appear in page source, browser storage,
  network responses, Wix code, or logs.
- A second use of the same bootstrap value is rejected.
- Requests from a different `Origin` are rejected.
- The iframe fails to render from a domain absent from `frame-ancestors`.
- A long conversation remains connected after the initial Direct Line token
  lifetime; DirectLineJS refreshes unexpired tokens automatically.
- The agent declines sensitive and case-specific requests without repeating the
  submitted details.
- Source links, hours, phone numbers, and service descriptions match the
  approved Fortune source set.
- A human contact route remains available when the chat fails.

## Why this is not yet a Wix App

A Wix App or Blocks widget could automate placement and configuration, but it
would still need this server-side token exchange. Packaging can follow after
Fortune validates the public-information workflow, visual treatment, licensing,
and traffic assumptions. The iframe keeps the first pilot portable and easy to
remove.

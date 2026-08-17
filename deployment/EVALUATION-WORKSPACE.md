# Evaluation workspace deployment contract

The evaluator is a Railway-only surface at `/evaluation`. It is not copied into the GitHub Pages artifact and it does not reuse Fortune's public member login.

## Initial account state

Migration `003_evaluator_identity.sql` creates exactly four inert slots:

- `admin`: one Fortune representative
- `editor-1`: student delegate
- `editor-2`: student delegate
- `editor-3`: reserved editor slot

All four begin with null email, display name, password hash, invitation digest, and claim time. Deployment must not generate invitations automatically. An operator issues the first admin invitation later from a private Railway shell:

```bash
python3 scripts/issue_evaluator_invite.py admin \
  --base-url https://<staging-domain>
```

The command prints one fragment-based claim link. PostgreSQL stores only its keyed digest. Do not place the raw link in Railway variables or logs.

After the admin account is claimed, the administrator can open **Account** in the evaluator and create or replace an email-bound link for any unassigned editor slot. Each link opens the first-use registration form, expires after 24 hours, works once, and signs the tester in immediately after registration. Share links only through a private channel; do not paste them into issues, commits, deployment logs, or test reports.

Returning testers sign in at `/evaluation` with the email and password they chose during registration. Their queue placements, buckets, conversation notes, and message annotations are stored in PostgreSQL by reviewer account and remain available after reload, sign-out, and a new browser session. Interface preferences are browser-local and reviewer-scoped.

If a claimed account must be reassigned, use the private operator command below. It revokes active sessions and clears only that slot's authentication fields; reviewer buckets, placements, notes, annotations, and audit history remain attached to the same slot.

```bash
python3 scripts/reset_evaluator_invite.py admin \
  --confirm-reset admin \
  --base-url https://<staging-domain>
```

The replacement link follows the same single-use, 24-hour, private-delivery rules. Resetting a claimed account is destructive to its existing login and requires explicit owner authorization.

## Staging variables

```text
FORTUNE_EVALUATION_ENABLED=1
FORTUNE_EVALUATOR_AUTH_SECRET=<independent random value of at least 32 characters>
FORTUNE_EVALUATOR_IDLE_SECONDS=1800
FORTUNE_EVALUATOR_ABSOLUTE_SECONDS=28800
FORTUNE_EVALUATOR_INVITE_SECONDS=86400
FORTUNE_EVALUATOR_MIN_INACTIVE_SECONDS=60
```

`DATABASE_URL` must continue to use Railway private networking. The evaluator secret must not reuse the conversation continuation secret.

## Data boundary

Only a conversation satisfying every condition enters a reviewer's queue:

- transcript capture mode;
- `client_surface='synthetic'`;
- unexpired and inactive for the configured minimum;
- every turn complete, privacy-clear, and ready;
- exactly one user and one assistant message for every turn.

Mixed or privacy-held conversations are withheld in full. Reviewers receive their own placements, buckets, conversation notes, and message annotations. Annotation rows reference canonical message IDs and never copy transcript text. All evaluation records cascade away when the conversation expires.

## HTTP boundary

- Sessions store only HMAC digests and use `__Host-fs_eval` with `Secure`, `HttpOnly`, and `SameSite=Strict`.
- Mutations require a same-origin browser request and a session-derived CSRF token.
- Editors cannot read account administration routes.
- Evaluation pages use `frame-ancestors 'none'` and are no-index.
- Repository source, migrations, tests, environment templates, and snapshots are not served by the backend.
- Structured request logs contain request ID, method, route template, status, and duration only—never transcript text, notes, email, cookies, tokens, or persistent IP identifiers.

## Release gate

1. Run `./run.sh test` and both snapshot checks.
2. Apply migrations through Railway's pre-deploy command.
3. Confirm `/health` reports evaluation schema `006_transcript_annotations`, four total slots, and the expected claimed/unassigned slot counts.
4. Confirm `/server.py`, `/.env.example`, `/migrations/003_evaluator_identity.sql`, and `/scripts/issue_evaluator_invite.py` return `404`.
5. Confirm `/evaluation` shows the login surface and no reviewer data without a session.
6. Claim the admin account, create one editor link from **Account**, and verify first-use registration signs the editor in without exposing the token in an HTTP request path or server log.
7. Reload, sign out and back in, then reopen a saved bucket, note, and annotation; confirm another reviewer cannot see those placements or edits.
8. Confirm the same invitation cannot be claimed twice, then leave the remaining invitation fields null until Fortune names the recipients.

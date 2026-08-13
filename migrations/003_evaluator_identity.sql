CREATE TABLE evaluator_accounts (
    slot_key TEXT PRIMARY KEY
        CHECK (slot_key IN ('admin', 'editor-1', 'editor-2', 'editor-3')),
    role TEXT NOT NULL CHECK (role IN ('admin', 'editor')),
    email_normalized TEXT,
    display_name TEXT,
    password_hash TEXT,
    invite_token_hash CHAR(64),
    invite_expires_at TIMESTAMPTZ,
    invited_at TIMESTAMPTZ,
    claimed_at TIMESTAMPTZ,
    disabled_at TIMESTAMPTZ,
    auth_version INTEGER NOT NULL DEFAULT 1 CHECK (auth_version > 0),
    failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
    locked_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (
        (slot_key = 'admin' AND role = 'admin') OR
        (slot_key IN ('editor-1', 'editor-2', 'editor-3') AND role = 'editor')
    ),
    CHECK (email_normalized IS NULL OR LENGTH(email_normalized) BETWEEN 3 AND 254),
    CHECK (display_name IS NULL OR LENGTH(display_name) BETWEEN 1 AND 80),
    CHECK (password_hash IS NULL OR password_hash LIKE '$argon2id$%'),
    CHECK (invite_token_hash IS NULL OR invite_token_hash ~ '^[0-9a-f]{64}$'),
    CHECK (
        (invite_token_hash IS NULL AND invite_expires_at IS NULL) OR
        (invite_token_hash IS NOT NULL AND invite_expires_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX ux_evaluator_accounts_email
    ON evaluator_accounts (email_normalized)
    WHERE email_normalized IS NOT NULL;
CREATE UNIQUE INDEX ux_evaluator_accounts_invite
    ON evaluator_accounts (invite_token_hash)
    WHERE invite_token_hash IS NOT NULL;

INSERT INTO evaluator_accounts (slot_key, role) VALUES
    ('admin', 'admin'),
    ('editor-1', 'editor'),
    ('editor-2', 'editor'),
    ('editor-3', 'editor')
ON CONFLICT (slot_key) DO NOTHING;

CREATE TABLE evaluator_sessions (
    id UUID PRIMARY KEY,
    token_hash CHAR(64) NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    account_slot TEXT NOT NULL REFERENCES evaluator_accounts(slot_key) ON DELETE CASCADE,
    auth_version INTEGER NOT NULL CHECK (auth_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idle_expires_at TIMESTAMPTZ NOT NULL,
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    CHECK (idle_expires_at <= absolute_expires_at)
);

CREATE INDEX ix_evaluator_sessions_active
    ON evaluator_sessions (token_hash, idle_expires_at, absolute_expires_at)
    WHERE revoked_at IS NULL;
CREATE INDEX ix_evaluator_sessions_account
    ON evaluator_sessions (account_slot, created_at DESC);

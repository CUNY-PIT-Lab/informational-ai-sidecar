CREATE TABLE prompt_review_workspaces (
    scope_key TEXT PRIMARY KEY CHECK (scope_key = 'shared'),
    bucket_set_id UUID NOT NULL UNIQUE
        REFERENCES evaluation_bucket_sets(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO prompt_review_workspaces (scope_key, bucket_set_id)
VALUES ('shared', '00000000-0000-4000-8000-000000000001')
ON CONFLICT (scope_key) DO NOTHING;

CREATE TABLE prompt_proposals (
    id UUID PRIMARY KEY,
    scope_key TEXT NOT NULL DEFAULT 'shared'
        REFERENCES prompt_review_workspaces(scope_key) ON DELETE RESTRICT,
    base_prompt_version TEXT NOT NULL CHECK (
        LENGTH(base_prompt_version) BETWEEN 1 AND 80
    ),
    title TEXT NOT NULL CHECK (LENGTH(title) BETWEEN 1 AND 80),
    module_values JSONB NOT NULL CHECK (
        jsonb_typeof(module_values) = 'object'
        AND module_values <> '{}'::jsonb
        AND module_values
            - 'style'
            - 'clarification'
            - 'page_awareness'
            - 'follow_up' = '{}'::jsonb
        AND (
            NOT module_values ? 'style'
            OR jsonb_typeof(module_values -> 'style') = 'string'
        )
        AND (
            NOT module_values ? 'clarification'
            OR jsonb_typeof(module_values -> 'clarification') = 'string'
        )
        AND (
            NOT module_values ? 'page_awareness'
            OR jsonb_typeof(module_values -> 'page_awareness') = 'string'
        )
        AND (
            NOT module_values ? 'follow_up'
            OR jsonb_typeof(module_values -> 'follow_up') = 'string'
        )
        AND LENGTH(COALESCE(module_values ->> 'style', '')) BETWEEN 0 AND 500
        AND LENGTH(COALESCE(module_values ->> 'clarification', '')) BETWEEN 0 AND 500
        AND LENGTH(COALESCE(module_values ->> 'page_awareness', '')) BETWEEN 0 AND 500
        AND LENGTH(COALESCE(module_values ->> 'follow_up', '')) BETWEEN 0 AND 500
        AND pg_column_size(module_values) <= 4096
    ),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (
        status IN ('draft', 'ready', 'archived')
    ),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
    created_by TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    updated_by TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ready_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    CHECK (status <> 'ready' OR ready_at IS NOT NULL),
    CHECK (status <> 'archived' OR archived_at IS NOT NULL)
);

CREATE INDEX ix_prompt_proposals_shared_recency
    ON prompt_proposals (scope_key, updated_at DESC, id);

CREATE TABLE prompt_proposal_revisions (
    proposal_id UUID NOT NULL REFERENCES prompt_proposals(id) ON DELETE RESTRICT,
    proposal_version INTEGER NOT NULL CHECK (proposal_version > 0),
    base_prompt_version TEXT NOT NULL CHECK (
        LENGTH(base_prompt_version) BETWEEN 1 AND 80
    ),
    title TEXT NOT NULL CHECK (LENGTH(title) BETWEEN 1 AND 80),
    module_values JSONB NOT NULL CHECK (
        jsonb_typeof(module_values) = 'object'
        AND module_values <> '{}'::jsonb
        AND module_values
            - 'style'
            - 'clarification'
            - 'page_awareness'
            - 'follow_up' = '{}'::jsonb
        AND pg_column_size(module_values) <= 4096
    ),
    status TEXT NOT NULL CHECK (status IN ('draft', 'ready', 'archived')),
    actor_slot TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    action TEXT NOT NULL CHECK (action IN (
        'proposal.create', 'proposal.update',
        'proposal.ready', 'proposal.archive'
    )),
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (proposal_id, proposal_version)
);

CREATE INDEX ix_prompt_proposal_revisions_history
    ON prompt_proposal_revisions (proposal_id, proposal_version DESC);

CREATE FUNCTION capture_prompt_proposal_revision()
RETURNS TRIGGER AS $$
DECLARE
    revision_action TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        revision_action := 'proposal.create';
    ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
        revision_action := 'proposal.' || NEW.status;
    ELSE
        revision_action := 'proposal.update';
    END IF;

    INSERT INTO prompt_proposal_revisions (
        proposal_id, proposal_version, base_prompt_version, title,
        module_values, status, actor_slot, action
    ) VALUES (
        NEW.id, NEW.version, NEW.base_prompt_version, NEW.title,
        NEW.module_values, NEW.status, NEW.updated_by, revision_action
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_proposals_capture_revision
AFTER INSERT OR UPDATE ON prompt_proposals
FOR EACH ROW EXECUTE FUNCTION capture_prompt_proposal_revision();

CREATE TABLE prompt_proposal_comments (
    id UUID PRIMARY KEY,
    proposal_id UUID NOT NULL REFERENCES prompt_proposals(id) ON DELETE RESTRICT,
    operation_id UUID NOT NULL UNIQUE,
    body TEXT NOT NULL CHECK (LENGTH(body) BETWEEN 1 AND 1000),
    actor_slot TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    proposal_version INTEGER NOT NULL CHECK (proposal_version > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ix_prompt_proposal_comments_history
    ON prompt_proposal_comments (proposal_id, created_at, id);

CREATE TABLE prompt_proposal_events (
    id UUID PRIMARY KEY,
    operation_id UUID NOT NULL UNIQUE,
    proposal_id UUID NOT NULL REFERENCES prompt_proposals(id) ON DELETE RESTRICT,
    actor_slot TEXT NOT NULL REFERENCES evaluator_accounts(slot_key),
    action TEXT NOT NULL CHECK (action IN (
        'proposal.create', 'proposal.update', 'proposal.comment',
        'proposal.ready', 'proposal.archive'
    )),
    proposal_version INTEGER NOT NULL CHECK (proposal_version > 0),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK (pg_column_size(metadata) <= 4096)
);

CREATE INDEX ix_prompt_proposal_events_history
    ON prompt_proposal_events (proposal_id, created_at, id);

CREATE FUNCTION prevent_prompt_proposal_event_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'prompt proposal events are append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_proposal_events_append_only
BEFORE UPDATE OR DELETE ON prompt_proposal_events
FOR EACH ROW EXECUTE FUNCTION prevent_prompt_proposal_event_mutation();

CREATE TRIGGER prompt_proposal_comments_append_only
BEFORE UPDATE OR DELETE ON prompt_proposal_comments
FOR EACH ROW EXECUTE FUNCTION prevent_prompt_proposal_event_mutation();

CREATE TRIGGER prompt_proposal_revisions_append_only
BEFORE UPDATE OR DELETE ON prompt_proposal_revisions
FOR EACH ROW EXECUTE FUNCTION prevent_prompt_proposal_event_mutation();

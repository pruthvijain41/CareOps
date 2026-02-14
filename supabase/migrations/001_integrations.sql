-- ============================================================================
-- CareOps — Integrations Table (OAuth tokens for Gmail, Google Calendar)
-- ============================================================================

CREATE TABLE IF NOT EXISTS integrations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider        TEXT NOT NULL,  -- 'gmail' or 'gcal'
    credentials     JSONB NOT NULL DEFAULT '{}',  -- {access_token, refresh_token, token_uri, client_id, client_secret, expiry}
    connected_email TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_integrations_ws_provider
    ON integrations (workspace_id, provider);

CREATE INDEX IF NOT EXISTS idx_integrations_workspace
    ON integrations (workspace_id);

-- RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view integrations in their workspace"
    ON integrations FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Owners can manage integrations"
    ON integrations FOR ALL
    USING (
        workspace_id = public.user_workspace_id()
        AND public.user_role() = 'owner'
    );

-- Auto-update trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON integrations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

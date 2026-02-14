-- Migration: Create whatsapp_sessions table for persistent WhatsApp logins
CREATE TABLE IF NOT EXISTS whatsapp_sessions (
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    file_id         TEXT NOT NULL,
    data            JSONB NOT NULL,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (workspace_id, file_id)
);

-- Enable RLS (usually accessed via service role, but good practice)
ALTER TABLE whatsapp_sessions ENABLE ROW LEVEL SECURITY;

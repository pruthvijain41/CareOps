-- ============================================================================
-- CareOps — Add Lead Management Columns to Contacts
-- ============================================================================

-- Lead pipeline status
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_status TEXT NOT NULL DEFAULT 'new';

-- Where the lead came from
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT NOT NULL DEFAULT 'unknown';

-- Free-text staff notes about the lead
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_notes TEXT;

-- When staff last contacted this lead
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ;

-- Index for filtering leads by status
CREATE INDEX IF NOT EXISTS idx_contacts_lead_status ON contacts (workspace_id, lead_status);

-- Index for filtering leads by source
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON contacts (workspace_id, lead_source);

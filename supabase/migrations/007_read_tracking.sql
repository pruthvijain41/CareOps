-- Migration: Add is_read tracking to conversations and form_submissions
-- This enables proper unread/read state tracking for dashboard metrics

-- Add is_read to conversations (default false for new messages)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Add is_read to form_submissions (default false for new submissions)
ALTER TABLE form_submissions ADD COLUMN IF NOT EXISTS is_read BOOLEAN NOT NULL DEFAULT false;

-- Index for efficient unread counting
CREATE INDEX IF NOT EXISTS idx_conversations_unread ON conversations (workspace_id, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_form_submissions_unread ON form_submissions (workspace_id, is_read) WHERE is_read = false;

-- ============================================================================
-- Migration: Add staff permissions & invitations table
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Add permissions JSONB column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '{"inbox": true, "bookings": true, "forms": true, "inventory": false, "reports": false}';

-- 2. Create staff_invitations table
CREATE TABLE IF NOT EXISTS staff_invitations (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    full_name   TEXT NOT NULL,
    role        user_role NOT NULL DEFAULT 'staff',
    permissions JSONB NOT NULL DEFAULT '{"inbox": true, "bookings": true, "forms": true, "inventory": false, "reports": false}',
    status      TEXT NOT NULL DEFAULT 'pending',
    invited_by  UUID REFERENCES auth.users(id),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_staff_invitations_workspace ON staff_invitations (workspace_id);
CREATE INDEX IF NOT EXISTS idx_staff_invitations_email ON staff_invitations (email);

-- 4. Set owner permissions to all-true for existing owners
UPDATE profiles
SET permissions = '{"inbox": true, "bookings": true, "forms": true, "inventory": true, "reports": true}'
WHERE role = 'owner';

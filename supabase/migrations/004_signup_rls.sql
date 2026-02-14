-- Migration: Allow new users to create workspace and profile during signup
-- Run this in Supabase SQL Editor

-- Allow authenticated users to create a workspace (for signup flow)
CREATE POLICY "Authenticated users can create a workspace"
    ON workspaces FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow authenticated users to create their own profile
CREATE POLICY "Users can create their own profile"
    ON profiles FOR INSERT
    WITH CHECK (id = auth.uid());

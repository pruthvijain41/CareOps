-- ============================================================================
-- CareOps — Supabase PostgreSQL Schema
-- ============================================================================
-- Multi-tenant operations platform for service-based businesses.
-- Covers: users, workspaces, contacts, conversations, bookings,
--         services, inventory, forms, automation.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 0. Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- --------------------------------------------------------------------------
-- 1. Enums
-- --------------------------------------------------------------------------
CREATE TYPE user_role AS ENUM ('owner', 'staff');

CREATE TYPE booking_status AS ENUM (
    'pending',
    'confirmed',
    'completed',
    'cancelled',
    'no_show'
);

CREATE TYPE message_source AS ENUM ('gmail', 'telegram', 'internal');

CREATE TYPE automation_trigger AS ENUM (
    'booking_created',
    'booking_confirmed',
    'booking_completed',
    'booking_cancelled',
    'message_received',
    'form_submitted',
    'inventory_low'
);

CREATE TYPE automation_action AS ENUM (
    'send_email',
    'send_telegram',
    'create_calendar_event',
    'distribute_form',
    'adjust_inventory',
    'notify_owner'
);

-- --------------------------------------------------------------------------
-- 2. Workspaces (multi-tenancy root)
-- --------------------------------------------------------------------------
CREATE TABLE workspaces (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    slug        TEXT NOT NULL UNIQUE,
    settings    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_workspaces_slug ON workspaces (slug);

-- --------------------------------------------------------------------------
-- 3. Profiles (linked to auth.users)
-- --------------------------------------------------------------------------
CREATE TABLE profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role            user_role NOT NULL DEFAULT 'staff',
    full_name       TEXT,
    avatar_url      TEXT,
    phone           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_profiles_workspace ON profiles (workspace_id);

-- --------------------------------------------------------------------------
-- 4. Contacts (CRM)
-- --------------------------------------------------------------------------
CREATE TABLE contacts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    email           TEXT,
    phone           TEXT,
    tags            TEXT[] DEFAULT '{}',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_contacts_workspace ON contacts (workspace_id);
CREATE INDEX idx_contacts_email ON contacts (workspace_id, email);

-- --------------------------------------------------------------------------
-- 5. Services
-- --------------------------------------------------------------------------
CREATE TABLE services (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    duration_mins   INTEGER NOT NULL DEFAULT 60,
    price           NUMERIC(10, 2),
    currency        TEXT NOT NULL DEFAULT 'INR',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_services_workspace ON services (workspace_id);

-- --------------------------------------------------------------------------
-- 6. Inventory Items
-- --------------------------------------------------------------------------
CREATE TABLE inventory_items (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    sku             TEXT,
    quantity         INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5,
    unit            TEXT NOT NULL DEFAULT 'pcs',
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_inventory_workspace ON inventory_items (workspace_id);
CREATE UNIQUE INDEX idx_inventory_sku ON inventory_items (workspace_id, sku)
    WHERE sku IS NOT NULL;

-- --------------------------------------------------------------------------
-- 7. Bookings
-- --------------------------------------------------------------------------
CREATE TABLE bookings (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    service_id      UUID REFERENCES services(id) ON DELETE SET NULL,
    status          booking_status NOT NULL DEFAULT 'pending',
    starts_at       TIMESTAMPTZ NOT NULL,
    ends_at         TIMESTAMPTZ NOT NULL,
    notes           TEXT,
    gcal_event_id   TEXT,
    metadata        JSONB NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_booking_times CHECK (ends_at > starts_at)
);

CREATE INDEX idx_bookings_workspace ON bookings (workspace_id);
CREATE INDEX idx_bookings_contact ON bookings (contact_id);
CREATE INDEX idx_bookings_status ON bookings (workspace_id, status);
CREATE INDEX idx_bookings_time_range ON bookings (workspace_id, starts_at, ends_at);

-- --------------------------------------------------------------------------
-- 8. Conversations (threaded)
-- --------------------------------------------------------------------------
CREATE TABLE conversations (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id      UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    subject         TEXT,
    channel         message_source NOT NULL DEFAULT 'internal',
    external_thread_id TEXT,
    is_archived     BOOLEAN NOT NULL DEFAULT false,
    last_message_at TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_workspace ON conversations (workspace_id);
CREATE INDEX idx_conversations_contact ON conversations (contact_id);
CREATE INDEX idx_conversations_channel ON conversations (workspace_id, channel);

-- --------------------------------------------------------------------------
-- 9. Messages
-- --------------------------------------------------------------------------
CREATE TABLE messages (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    sender_type     TEXT NOT NULL CHECK (sender_type IN ('contact', 'staff', 'system')),
    sender_id       UUID,
    source          message_source NOT NULL DEFAULT 'internal',
    body            TEXT NOT NULL,
    attachments     JSONB NOT NULL DEFAULT '[]',
    external_id     TEXT,
    sent_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation ON messages (conversation_id, sent_at);
CREATE INDEX idx_messages_workspace ON messages (workspace_id);

-- --------------------------------------------------------------------------
-- 10. Forms
-- --------------------------------------------------------------------------
CREATE TABLE forms (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    title           TEXT NOT NULL,
    description     TEXT,
    schema          JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_forms_workspace ON forms (workspace_id);

-- --------------------------------------------------------------------------
-- 11. Form Submissions
-- --------------------------------------------------------------------------
CREATE TABLE form_submissions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    form_id         UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    contact_id      UUID REFERENCES contacts(id) ON DELETE SET NULL,
    data            JSONB NOT NULL DEFAULT '{}',
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_submissions_form ON form_submissions (form_id);
CREATE INDEX idx_form_submissions_workspace ON form_submissions (workspace_id);

-- --------------------------------------------------------------------------
-- 12. Automation Rules
-- --------------------------------------------------------------------------
CREATE TABLE automation_rules (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    description     TEXT,
    trigger         automation_trigger NOT NULL,
    trigger_config  JSONB NOT NULL DEFAULT '{}',
    action          automation_action NOT NULL,
    action_config   JSONB NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_rules_workspace ON automation_rules (workspace_id);
CREATE INDEX idx_automation_rules_trigger ON automation_rules (workspace_id, trigger)
    WHERE is_active = true;

-- --------------------------------------------------------------------------
-- 13. Automation Logs
-- --------------------------------------------------------------------------
CREATE TABLE automation_logs (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    rule_id         UUID NOT NULL REFERENCES automation_rules(id) ON DELETE CASCADE,
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status          TEXT NOT NULL CHECK (status IN ('success', 'failure', 'skipped')),
    trigger_payload JSONB NOT NULL DEFAULT '{}',
    action_result   JSONB NOT NULL DEFAULT '{}',
    error_message   TEXT,
    executed_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_automation_logs_rule ON automation_logs (rule_id);
CREATE INDEX idx_automation_logs_workspace ON automation_logs (workspace_id, executed_at DESC);

-- ============================================================================
-- 14. Row-Level Security (RLS) Policies
-- ============================================================================

-- Helper: extract workspace_id from the current user's profile
CREATE OR REPLACE FUNCTION public.user_workspace_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper: extract role from the current user's profile
CREATE OR REPLACE FUNCTION public.user_role()
RETURNS user_role
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- ── Workspaces ──────────────────────────────────────────────────────────────
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own workspace"
    ON workspaces FOR SELECT
    USING (id = public.user_workspace_id());

CREATE POLICY "Owners can update their workspace"
    ON workspaces FOR UPDATE
    USING (id = public.user_workspace_id() AND public.user_role() = 'owner');

-- ── Profiles ────────────────────────────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view profiles in their workspace"
    ON profiles FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can update their own profile"
    ON profiles FOR UPDATE
    USING (id = auth.uid());

CREATE POLICY "Owners can manage all profiles in workspace"
    ON profiles FOR ALL
    USING (
        workspace_id = public.user_workspace_id()
        AND public.user_role() = 'owner'
    );

-- ── Contacts ────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view contacts in their workspace"
    ON contacts FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can manage contacts in their workspace"
    ON contacts FOR ALL
    USING (workspace_id = public.user_workspace_id());

-- ── Services ────────────────────────────────────────────────────────────────
ALTER TABLE services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view services in their workspace"
    ON services FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Owners can manage services"
    ON services FOR ALL
    USING (
        workspace_id = public.user_workspace_id()
        AND public.user_role() = 'owner'
    );

-- ── Inventory Items ─────────────────────────────────────────────────────────
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view inventory in their workspace"
    ON inventory_items FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can manage inventory in their workspace"
    ON inventory_items FOR ALL
    USING (workspace_id = public.user_workspace_id());

-- ── Bookings ────────────────────────────────────────────────────────────────
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bookings in their workspace"
    ON bookings FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can manage bookings in their workspace"
    ON bookings FOR ALL
    USING (workspace_id = public.user_workspace_id());

-- ── Conversations ───────────────────────────────────────────────────────────
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view conversations in their workspace"
    ON conversations FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can manage conversations in their workspace"
    ON conversations FOR ALL
    USING (workspace_id = public.user_workspace_id());

-- ── Messages ────────────────────────────────────────────────────────────────
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view messages in their workspace"
    ON messages FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Users can insert messages in their workspace"
    ON messages FOR INSERT
    WITH CHECK (workspace_id = public.user_workspace_id());

-- ── Forms ───────────────────────────────────────────────────────────────────
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view forms in their workspace"
    ON forms FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Owners can manage forms"
    ON forms FOR ALL
    USING (
        workspace_id = public.user_workspace_id()
        AND public.user_role() = 'owner'
    );

-- ── Form Submissions ────────────────────────────────────────────────────────
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view submissions in their workspace"
    ON form_submissions FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Anyone can insert submissions (public forms)"
    ON form_submissions FOR INSERT
    WITH CHECK (true);

-- ── Automation Rules ────────────────────────────────────────────────────────
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation rules in their workspace"
    ON automation_rules FOR SELECT
    USING (workspace_id = public.user_workspace_id());

CREATE POLICY "Owners can manage automation rules"
    ON automation_rules FOR ALL
    USING (
        workspace_id = public.user_workspace_id()
        AND public.user_role() = 'owner'
    );

-- ── Automation Logs ─────────────────────────────────────────────────────────
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation logs in their workspace"
    ON automation_logs FOR SELECT
    USING (workspace_id = public.user_workspace_id());

-- ============================================================================
-- 15. Triggers — auto-update `updated_at`
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER set_updated_at BEFORE UPDATE ON workspaces
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON services
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON inventory_items
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON forms
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON automation_rules
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

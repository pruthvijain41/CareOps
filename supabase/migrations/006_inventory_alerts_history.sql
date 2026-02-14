-- Migration 006: Inventory Alerts Log & Adjustment History
-- Adds persistent alert tracking and adjustment history for usage analytics.

-- 1. Inventory Alerts Log
CREATE TABLE IF NOT EXISTS inventory_alerts (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    item_name       TEXT NOT NULL,
    alert_type      TEXT NOT NULL DEFAULT 'low_stock',  -- 'low_stock', 'critical', 'out_of_stock'
    quantity_at_alert INTEGER NOT NULL,
    threshold       INTEGER NOT NULL,
    supplier_notified BOOLEAN NOT NULL DEFAULT false,
    resolved        BOOLEAN NOT NULL DEFAULT false,
    resolved_at     TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_alerts_workspace ON inventory_alerts (workspace_id);
CREATE INDEX IF NOT EXISTS idx_inv_alerts_item ON inventory_alerts (item_id);

-- RLS
ALTER TABLE inventory_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view inventory alerts in their workspace" ON inventory_alerts;
CREATE POLICY "Users can view inventory alerts in their workspace"
    ON inventory_alerts FOR SELECT
    USING (workspace_id = public.user_workspace_id());

DROP POLICY IF EXISTS "Users can manage inventory alerts in their workspace" ON inventory_alerts;
CREATE POLICY "Users can manage inventory alerts in their workspace"
    ON inventory_alerts FOR ALL
    USING (workspace_id = public.user_workspace_id());

-- 2. Inventory Adjustments (usage history)
CREATE TABLE IF NOT EXISTS inventory_adjustments (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id    UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    item_id         UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    adjustment      INTEGER NOT NULL,
    quantity_before  INTEGER NOT NULL,
    quantity_after   INTEGER NOT NULL,
    reason          TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_adj_workspace ON inventory_adjustments (workspace_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_item ON inventory_adjustments (item_id);
CREATE INDEX IF NOT EXISTS idx_inv_adj_created ON inventory_adjustments (created_at);

-- RLS
ALTER TABLE inventory_adjustments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view inventory adjustments in their workspace" ON inventory_adjustments;
CREATE POLICY "Users can view inventory adjustments in their workspace"
    ON inventory_adjustments FOR SELECT
    USING (workspace_id = public.user_workspace_id());

DROP POLICY IF EXISTS "Users can manage inventory adjustments in their workspace" ON inventory_adjustments;
CREATE POLICY "Users can manage inventory adjustments in their workspace"
    ON inventory_adjustments FOR ALL
    USING (workspace_id = public.user_workspace_id());

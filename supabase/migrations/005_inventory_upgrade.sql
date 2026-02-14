-- ============================================================================
-- Migration 005: Inventory Upgrade
-- Adds supplier_email to inventory_items and creates service_inventory junction
-- ============================================================================

-- 1. Add supplier_email column to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_email TEXT;

-- 2. Junction table: which inventory items each service uses (and how many)
CREATE TABLE IF NOT EXISTS service_inventory (
    id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    service_id   UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
    item_id      UUID NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
    qty_per_use  INTEGER NOT NULL DEFAULT 1,
    UNIQUE(service_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_si_service ON service_inventory(service_id);
CREATE INDEX IF NOT EXISTS idx_si_item    ON service_inventory(item_id);

-- 3. RLS for service_inventory
ALTER TABLE service_inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view service_inventory via service workspace" ON service_inventory;
CREATE POLICY "Users can view service_inventory via service workspace"
    ON service_inventory FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM services s
            JOIN profiles p ON p.workspace_id = s.workspace_id
            WHERE s.id = service_inventory.service_id
              AND p.id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can manage service_inventory via service workspace" ON service_inventory;
CREATE POLICY "Users can manage service_inventory via service workspace"
    ON service_inventory FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM services s
            JOIN profiles p ON p.workspace_id = s.workspace_id
            WHERE s.id = service_inventory.service_id
              AND p.id = auth.uid()
              AND p.role = 'owner'
        )
    );

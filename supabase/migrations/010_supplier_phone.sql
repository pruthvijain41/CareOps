-- Add supplier_phone to inventory_items
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS supplier_phone TEXT;

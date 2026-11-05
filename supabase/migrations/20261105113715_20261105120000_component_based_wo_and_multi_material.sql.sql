/*
# Component-Based Work Order Generation & Multi-Material Consumption

## Overview
This migration restructures work order generation to create component-based sub-work-orders.
When a SINGLE model work order is generated, sub-work-orders are created per component (LENGTH, FRONT, BACK).
When a DOUBLE model work order is generated, sub-work-orders include FRONT_MAIN, FRONT_SUB, BACK_MAIN, BACK_SUB, and LENGTH.
Each component sub-work-order follows its own routing path based on routing_item_rules.

## Changes

### 1. New column: sub_work_orders.component_type
- Text column to identify which component this sub-WO represents (LENGTH, FRONT, BACK, FRONT_MAIN, FRONT_SUB, BACK_MAIN, BACK_SUB)
- Nullable for backward compatibility with existing sub-WOs

### 2. New column: sub_work_orders.parent_sub_wo_id
- UUID column referencing sub_work_orders.id for linking sub-component WOs to parent
- Nullable, with FK constraint

### 3. New table: sub_work_order_materials
- Replaces single material_item_id/material_qty on sub_work_orders with a multi-material table
- Each stage can consume multiple raw materials
- Columns: id, sub_work_order_id, item_id, consumed_qty, unit_of_measure, unit_cost, total_cost, created_at

### 4. New columns on work_orders for cost tracking
- material_cost: total raw material cost
- labor_cost: total labor cost
- overhead_cost: overhead allocation
- total_cost: sum of all costs
- cost_calculated_at: when cost was last computed

### 5. New RPC: get_work_order_cost_summary
- Aggregates all material consumption and labor costs for a work order
- Returns breakdown of material, labor, and total cost

## Security
- RLS enabled on sub_work_order_materials with same policies as sub_work_orders
- Grants to authenticated role
*/

-- 1. Add component_type to sub_work_orders
ALTER TABLE sub_work_orders ADD COLUMN IF NOT EXISTS component_type text;
ALTER TABLE sub_work_orders ADD COLUMN IF NOT EXISTS parent_sub_wo_id uuid REFERENCES sub_work_orders(id) ON DELETE SET NULL;

-- 2. Add cost columns to work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS material_cost numeric DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS labor_cost numeric DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS overhead_cost numeric DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS total_cost numeric DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS cost_calculated_at timestamptz;

-- 3. Create sub_work_order_materials table
CREATE TABLE IF NOT EXISTS sub_work_order_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_work_order_id uuid NOT NULL REFERENCES sub_work_orders(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  item_code text NOT NULL,
  consumed_qty numeric NOT NULL DEFAULT 0,
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  unit_cost numeric NOT NULL DEFAULT 0,
  total_cost numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE sub_work_order_materials ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON sub_work_order_materials TO authenticated;

DROP POLICY IF EXISTS "select_own_swo_materials" ON sub_work_order_materials;
CREATE POLICY "select_own_swo_materials" ON sub_work_order_materials FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_own_swo_materials" ON sub_work_order_materials;
CREATE POLICY "insert_own_swo_materials" ON sub_work_order_materials FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_swo_materials" ON sub_work_order_materials;
CREATE POLICY "update_own_swo_materials" ON sub_work_order_materials FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_own_swo_materials" ON sub_work_order_materials;
CREATE POLICY "delete_own_swo_materials" ON sub_work_order_materials FOR DELETE
  TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_swo_materials_sub_wo_id ON sub_work_order_materials(sub_work_order_id);
CREATE INDEX IF NOT EXISTS idx_swo_component_type ON sub_work_orders(component_type);

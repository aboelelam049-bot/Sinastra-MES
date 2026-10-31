/*
# Phase 5b — Production Material Consumption

## Overview
Tracks actual material consumption during production, tied to a specific Work Order
and Work Center. Each record links an item (from item_master) to a production run,
recording the actual quantity consumed — which varies per model per unit.

This replaces the earlier work_center_materials table (which assumed fixed consumption
per work center regardless of model). Consumption is now recorded per production session.

## New Tables
1. `production_consumption` — records each material consumed during a production run.
   - `id` (uuid, primary key)
   - `work_order_id` (uuid, FK to work_orders, NOT NULL) — which work order consumed it
   - `work_center_id` (uuid, FK to work_centers, nullable) — where it was consumed
   - `machine_id` (uuid, FK to machines, nullable) — which machine consumed it
   - `item_id` (uuid, FK to item_master, NOT NULL) — what was consumed
   - `item_code` (text, NOT NULL) — denormalized for display
   - `consumed_qty` (numeric, NOT NULL) — actual quantity consumed
   - `unit_of_measure` (text, NOT NULL) — UoM of the consumed item
   - `produced_qty` (numeric, nullable) — how many units were produced with this consumption
   - `consumption_date` (date, NOT NULL, default CURRENT_DATE) — when it was consumed
   - `notes` (text, nullable)
   - `created_by` (uuid, FK to auth.users)
   - `created_at` (timestamptz)

## Security
- RLS enabled on production_consumption.
- CRUD granted to authenticated role.
- Policies: authenticated users can read all, insert/update/delete all.
*/

CREATE TABLE IF NOT EXISTS production_consumption (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  work_center_id uuid REFERENCES work_centers(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  item_code text NOT NULL,
  consumed_qty numeric NOT NULL CHECK (consumed_qty > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  produced_qty numeric,
  consumption_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pc_work_order ON production_consumption(work_order_id);
CREATE INDEX IF NOT EXISTS idx_pc_work_center ON production_consumption(work_center_id);
CREATE INDEX IF NOT EXISTS idx_pc_item ON production_consumption(item_id);
CREATE INDEX IF NOT EXISTS idx_pc_date ON production_consumption(consumption_date DESC);

ALTER TABLE production_consumption ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON production_consumption TO authenticated;

DROP POLICY IF EXISTS "pc_select_auth" ON production_consumption;
CREATE POLICY "pc_select_auth" ON production_consumption FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "pc_insert_auth" ON production_consumption;
CREATE POLICY "pc_insert_auth" ON production_consumption FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pc_update_auth" ON production_consumption;
CREATE POLICY "pc_update_auth" ON production_consumption FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "pc_delete_auth" ON production_consumption;
CREATE POLICY "pc_delete_auth" ON production_consumption FOR DELETE
  TO authenticated USING (true);

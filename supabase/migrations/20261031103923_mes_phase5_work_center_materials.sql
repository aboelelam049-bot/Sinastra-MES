/*
# Phase 5 — Work Center Input Materials

## Overview
Adds a new table to define which raw materials (items from item_master) are consumed
at each work center during production. This lets the planner specify, for example,
that the cutting station consumes wood boards, and the gluing station consumes glue.

## New Tables
1. `work_center_materials` — links a work center to an item (from item_master)
   with the quantity consumed per unit of output.
   - `id` (uuid, primary key)
   - `work_center_id` (uuid, FK to work_centers, NOT NULL)
   - `item_id` (uuid, FK to item_master, NOT NULL)
   - `item_code` (text, denormalized for display)
   - `consumption_qty` (numeric, NOT NULL) — qty consumed per unit of output
   - `unit_of_measure` (text, NOT NULL) — UoM of the consumed item
   - `is_active` (boolean, default true)
   - `created_by` (uuid, FK to auth.users)
   - `created_at` (timestamptz)
   - `updated_at` (timestamptz)

## Security
- RLS enabled on work_center_materials.
- CRUD granted to authenticated role.
- Policies: authenticated users can read all, insert/update/delete all
  (role enforcement is handled at the application level via MODULE_ACCESS).
*/

CREATE TABLE IF NOT EXISTS work_center_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_center_id uuid NOT NULL REFERENCES work_centers(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  item_code text NOT NULL,
  consumption_qty numeric NOT NULL DEFAULT 1 CHECK (consumption_qty > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wcm_work_center ON work_center_materials(work_center_id);
CREATE INDEX IF NOT EXISTS idx_wcm_item ON work_center_materials(item_id);

-- Prevent duplicate (work_center, item) pairs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wcm_wc_item_unique') THEN
    ALTER TABLE work_center_materials ADD CONSTRAINT wcm_wc_item_unique UNIQUE (work_center_id, item_id);
  END IF;
END $$;

ALTER TABLE work_center_materials ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON work_center_materials TO authenticated;

DROP POLICY IF EXISTS "wcm_select_auth" ON work_center_materials;
CREATE POLICY "wcm_select_auth" ON work_center_materials FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "wcm_insert_auth" ON work_center_materials;
CREATE POLICY "wcm_insert_auth" ON work_center_materials FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "wcm_update_auth" ON work_center_materials;
CREATE POLICY "wcm_update_auth" ON work_center_materials FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wcm_delete_auth" ON work_center_materials;
CREATE POLICY "wcm_delete_auth" ON work_center_materials FOR DELETE
  TO authenticated USING (true);

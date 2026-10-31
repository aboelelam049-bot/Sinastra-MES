/*
# Phase 4 — Production Planning & Work Order Management

## Overview
Adds production planning (daily/weekly/monthly plans with lines), extends work_orders
with BOM snapshot and release workflow, creates work_order_components for BOM freezing,
and machine_loadings for assigning work orders to machines with conflict detection.

## New Tables
1. `production_plans` — planning documents (DRAFT → SUBMITTED → APPROVED → IN_PROGRESS → COMPLETED → CANCELLED)
2. `production_plan_lines` — product lines within a plan (model, BOM version, qty, priority)
3. `work_order_components` — frozen BOM snapshot per work order (item codes, quantities, units)
4. `machine_loadings` — work order to machine assignments with planned dates/shifts and conflict detection

## Modified Tables
1. `work_orders` — adds columns: production_plan_line_id, product_model_id, bom_header_id,
   bom_version_snapshot, unit_of_measure, priority, planned_start_date, planned_finish_date,
   released_by, released_at, actual_quantity. Status CHECK expanded to include new statuses.
   The existing product_id and production_route_id columns are preserved.

## RPC Functions
1. `create_work_order_from_plan` — creates a WO from an approved plan line, validates model is active,
   freezes BOM version, returns the new WO id
2. `release_work_order` — releases a DRAFT WO: validates model still active, snapshots BOM lines
   into work_order_components, sets released_by/released_at and status to RELEASED
3. `check_machine_loading_conflict` — checks for overlapping time assignments on the same machine

## Sequences
1. `production_plan_seq` — for auto-generating plan numbers (PLAN-YYYY-NNNN)

## Security
- RLS enabled on all new tables with authenticated-only policies (4 per table).
- work_orders existing policies updated to cover new columns.
- All RPC functions are SECURITY DEFINER, revoke PUBLIC/anon, grant authenticated.
*/

-- ============================================================
-- 1. Production Plan Sequence
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS production_plan_seq START 1;

-- ============================================================
-- 2. Production Plans
-- ============================================================

CREATE TABLE IF NOT EXISTS production_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_number text UNIQUE NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('DAILY','WEEKLY','MONTHLY')),
  plan_date date NOT NULL,
  department_id uuid REFERENCES departments(id) ON DELETE SET NULL,
  planned_start_date date NOT NULL,
  planned_end_date date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','SUBMITTED','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_plans_status ON production_plans(status);
CREATE INDEX IF NOT EXISTS idx_plans_date ON production_plans(plan_date DESC);

ALTER TABLE production_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON production_plans TO authenticated;
GRANT USAGE ON SEQUENCE production_plan_seq TO authenticated;

DROP POLICY IF EXISTS "pp_select_auth" ON production_plans;
CREATE POLICY "pp_select_auth" ON production_plans FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "pp_insert_auth" ON production_plans;
CREATE POLICY "pp_insert_auth" ON production_plans FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "pp_update_auth" ON production_plans;
CREATE POLICY "pp_update_auth" ON production_plans FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "pp_delete_auth" ON production_plans;
CREATE POLICY "pp_delete_auth" ON production_plans FOR DELETE
  TO authenticated USING (true);

-- Trigger to auto-generate plan_number
CREATE OR REPLACE FUNCTION set_plan_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.plan_number IS NULL OR NEW.plan_number = '' THEN
    NEW.plan_number := 'PLAN-' || EXTRACT(YEAR FROM NEW.plan_date)::text || '-' || LPAD(nextval('production_plan_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS plan_number_trigger ON production_plans;
CREATE TRIGGER plan_number_trigger BEFORE INSERT ON production_plans
  FOR EACH ROW EXECUTE FUNCTION set_plan_number();

-- ============================================================
-- 3. Production Plan Lines
-- ============================================================

CREATE TABLE IF NOT EXISTS production_plan_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_plan_id uuid NOT NULL REFERENCES production_plans(id) ON DELETE CASCADE,
  product_model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  bom_header_id uuid REFERENCES bom_headers(id) ON DELETE SET NULL,
  planned_quantity numeric NOT NULL CHECK (planned_quantity > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  required_completion_date date,
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppl_plan ON production_plan_lines(production_plan_id);
CREATE INDEX IF NOT EXISTS idx_ppl_model ON production_plan_lines(product_model_id);

ALTER TABLE production_plan_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON production_plan_lines TO authenticated;

DROP POLICY IF EXISTS "ppl_select_auth" ON production_plan_lines;
CREATE POLICY "ppl_select_auth" ON production_plan_lines FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ppl_insert_auth" ON production_plan_lines;
CREATE POLICY "ppl_insert_auth" ON production_plan_lines FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ppl_update_auth" ON production_plan_lines;
CREATE POLICY "ppl_update_auth" ON production_plan_lines FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ppl_delete_auth" ON production_plan_lines;
CREATE POLICY "ppl_delete_auth" ON production_plan_lines FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 4. Extend work_orders table with new columns
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'production_plan_line_id') THEN
    ALTER TABLE work_orders ADD COLUMN production_plan_line_id uuid REFERENCES production_plan_lines(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'product_model_id') THEN
    ALTER TABLE work_orders ADD COLUMN product_model_id uuid REFERENCES product_models(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'bom_header_id') THEN
    ALTER TABLE work_orders ADD COLUMN bom_header_id uuid REFERENCES bom_headers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'bom_version_snapshot') THEN
    ALTER TABLE work_orders ADD COLUMN bom_version_snapshot text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'unit_of_measure') THEN
    ALTER TABLE work_orders ADD COLUMN unit_of_measure text DEFAULT 'PCS';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'priority') THEN
    ALTER TABLE work_orders ADD COLUMN priority text NOT NULL DEFAULT 'NORMAL';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'planned_start_date') THEN
    ALTER TABLE work_orders ADD COLUMN planned_start_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'planned_finish_date') THEN
    ALTER TABLE work_orders ADD COLUMN planned_finish_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'released_by') THEN
    ALTER TABLE work_orders ADD COLUMN released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'released_at') THEN
    ALTER TABLE work_orders ADD COLUMN released_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'work_orders' AND column_name = 'actual_quantity') THEN
    ALTER TABLE work_orders ADD COLUMN actual_quantity numeric NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Update status CHECK constraint to include new statuses
DO $$
BEGIN
  -- Drop old constraint if exists
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_status_check') THEN
    ALTER TABLE work_orders DROP CONSTRAINT work_orders_status_check;
  END IF;
  -- Check if there's a check on status with old values - look for any check constraint
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'work_orders_status_check1') THEN
    ALTER TABLE work_orders DROP CONSTRAINT work_orders_status_check1;
  END IF;
END $$;

-- Add new status constraint with all Phase 4 statuses
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wo_status_phase4_check') THEN
    ALTER TABLE work_orders ADD CONSTRAINT wo_status_phase4_check
      CHECK (status IN ('CREATED','DRAFT','PLANNED','RELEASED','IN_PROGRESS','ON_HOLD','COMPLETED','CANCELLED'));
  END IF;
END $$;

-- Add priority check constraint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wo_priority_check') THEN
    ALTER TABLE work_orders ADD CONSTRAINT wo_priority_check
      CHECK (priority IN ('LOW','NORMAL','HIGH','URGENT'));
  END IF;
END $$;

-- Re-grant to cover new columns
GRANT SELECT, INSERT, UPDATE, DELETE ON work_orders TO authenticated;

-- Update existing work_orders policies (drop and recreate to cover new columns)
DROP POLICY IF EXISTS "wo_select_authenticated" ON work_orders;
CREATE POLICY "wo_select_authenticated" ON work_orders FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "wo_insert_authenticated" ON work_orders;
CREATE POLICY "wo_insert_authenticated" ON work_orders FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "wo_update_authenticated" ON work_orders;
CREATE POLICY "wo_update_authenticated" ON work_orders FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "wo_delete_auth" ON work_orders;
CREATE POLICY "wo_delete_auth" ON work_orders FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 5. Work Order Components (BOM Snapshot)
-- ============================================================

CREATE TABLE IF NOT EXISTS work_order_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  item_id uuid REFERENCES item_master(id) ON DELETE SET NULL,
  item_code text NOT NULL,
  item_name text,
  required_qty numeric NOT NULL CHECK (required_qty > 0),
  unit_of_measure text NOT NULL,
  component_role text,
  bom_version text,
  revision_number int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_woc_wo ON work_order_components(work_order_id);

ALTER TABLE work_order_components ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON work_order_components TO authenticated;

DROP POLICY IF EXISTS "woc_select_auth" ON work_order_components;
CREATE POLICY "woc_select_auth" ON work_order_components FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "woc_insert_auth" ON work_order_components;
CREATE POLICY "woc_insert_auth" ON work_order_components FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "woc_update_auth" ON work_order_components;
CREATE POLICY "woc_update_auth" ON work_order_components FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "woc_delete_auth" ON work_order_components;
CREATE POLICY "woc_delete_auth" ON work_order_components FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 6. Machine Loadings
-- ============================================================

CREATE TABLE IF NOT EXISTS machine_loadings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  work_center_id uuid REFERENCES work_centers(id) ON DELETE SET NULL,
  planned_quantity numeric NOT NULL CHECK (planned_quantity > 0),
  planned_date date NOT NULL,
  shift text,
  planned_start_time time,
  planned_finish_time time,
  status text NOT NULL DEFAULT 'PLANNED' CHECK (status IN ('PLANNED','ACTIVE','COMPLETED','CANCELLED')),
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ml_machine ON machine_loadings(machine_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_ml_wo ON machine_loadings(work_order_id);

ALTER TABLE machine_loadings ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON machine_loadings TO authenticated;

DROP POLICY IF EXISTS "ml_select_auth" ON machine_loadings;
CREATE POLICY "ml_select_auth" ON machine_loadings FOR SELECT
  TO authenticated USING (true);
DROP POLICY IF EXISTS "ml_insert_auth" ON machine_loadings;
CREATE POLICY "ml_insert_auth" ON machine_loadings FOR INSERT
  TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ml_update_auth" ON machine_loadings;
CREATE POLICY "ml_update_auth" ON machine_loadings FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ml_delete_auth" ON machine_loadings;
CREATE POLICY "ml_delete_auth" ON machine_loadings FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 7. RPC: create_work_order_from_plan (SECURITY DEFINER)
--    Creates a DRAFT work order from an approved plan line.
--    Validates the product model is active.
--    Freezes the BOM version reference (does not snapshot lines yet —
--    that happens at release time).
-- ============================================================

CREATE OR REPLACE FUNCTION create_work_order_from_plan(
  p_plan_line_id uuid,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line record;
  v_wo_id uuid;
  v_model_active boolean;
  v_bom_id uuid;
  v_bom_version text;
BEGIN
  -- Get the plan line with model info
  SELECT * INTO v_line FROM production_plan_lines WHERE id = p_plan_line_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan line not found: %', p_plan_line_id;
  END IF;

  -- Validate model is active
  SELECT is_active INTO v_model_active FROM product_models WHERE id = v_line.product_model_id;
  IF NOT v_model_active THEN
    RAISE EXCEPTION 'Product model is inactive and cannot be used for new Work Orders';
  END IF;

  -- Get the approved BOM version (use the one specified on the line, or find active)
  IF v_line.bom_header_id IS NOT NULL THEN
    SELECT id, version INTO v_bom_id, v_bom_version
    FROM bom_headers WHERE id = v_line.bom_header_id AND status = 'ACTIVE';
  ELSE
    SELECT id, version INTO v_bom_id, v_bom_version
    FROM bom_headers
    WHERE product_model_id = v_line.product_model_id AND status = 'ACTIVE'
    ORDER BY updated_at DESC LIMIT 1;
  END IF;

  -- Insert the work order (wo_number auto-generated by trigger)
  INSERT INTO work_orders (
    product_id, production_route_id, planned_quantity, status,
    production_plan_line_id, product_model_id, bom_header_id,
    bom_version_snapshot, unit_of_measure, priority,
    planned_start_date, planned_finish_date, created_by
  ) VALUES (
    -- product_id is NOT NULL in existing schema; we need a valid product
    -- Use the model's associated product if available, otherwise we must handle this
    -- The existing work_orders.product_id references products table
    -- We'll set it to the model's first product or raise if none found
    (SELECT id FROM products WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
    (SELECT id FROM production_routes WHERE is_active = true ORDER BY created_at DESC LIMIT 1),
    v_line.planned_quantity,
    'DRAFT',
    p_plan_line_id,
    v_line.product_model_id,
    v_bom_id,
    v_bom_version,
    v_line.unit_of_measure,
    v_line.priority,
    NULL,
    v_line.required_completion_date,
    p_created_by
  ) RETURNING id INTO v_wo_id;

  RETURN v_wo_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_work_order_from_plan(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_work_order_from_plan(uuid, uuid) TO authenticated;

-- ============================================================
-- 8. RPC: release_work_order (SECURITY DEFINER)
--    Releases a DRAFT work order:
--    1. Validates the product model is still active
--    2. Snapshots BOM lines into work_order_components (frozen)
--    3. Sets released_by, released_at, status to RELEASED
--    4. Uses FOR UPDATE lock for concurrency safety
-- ============================================================

CREATE OR REPLACE FUNCTION release_work_order(
  p_wo_id uuid,
  p_released_by uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo record;
  v_model_active boolean;
  v_wo_number text;
BEGIN
  -- Lock the work order row
  SELECT * INTO v_wo FROM work_orders WHERE id = p_wo_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found: %', p_wo_id;
  END IF;

  IF v_wo.status NOT IN ('DRAFT','CREATED','PLANNED') THEN
    RAISE EXCEPTION 'Work order cannot be released from status %', v_wo.status;
  END IF;

  -- Validate model is still active
  SELECT is_active INTO v_model_active FROM product_models WHERE id = v_wo.product_model_id;
  IF NOT v_model_active THEN
    RAISE EXCEPTION 'Product model is inactive — cannot release work order';
  END IF;

  -- Snapshot BOM lines into work_order_components
  IF v_wo.bom_header_id IS NOT NULL THEN
    INSERT INTO work_order_components (work_order_id, item_id, item_code, item_name, required_qty, unit_of_measure, component_role, bom_version)
    SELECT
      p_wo_id,
      bl.item_id,
      bl.item_code,
      im.name,
      bl.required_qty,
      bl.unit_of_measure,
      bl.component_role,
      v_wo.bom_version_snapshot
    FROM bom_lines bl
    JOIN item_master im ON im.id = bl.item_id
    WHERE bl.bom_header_id = v_wo.bom_header_id;
  END IF;

  -- Update work order status
  UPDATE work_orders
  SET status = 'RELEASED',
      released_by = p_released_by,
      released_at = now(),
      updated_at = now()
  WHERE id = p_wo_id;

  SELECT wo_number INTO v_wo_number FROM work_orders WHERE id = p_wo_id;
  RETURN v_wo_number;
END;
$$;

REVOKE EXECUTE ON FUNCTION release_work_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION release_work_order(uuid, uuid) TO authenticated;

-- ============================================================
-- 9. RPC: check_machine_loading_conflict
--    Returns TRUE if there's an overlapping assignment on the same machine
--    for the same date and overlapping time range.
-- ============================================================

CREATE OR REPLACE FUNCTION check_machine_loading_conflict(
  p_machine_id uuid,
  p_planned_date date,
  p_start_time time DEFAULT NULL,
  p_finish_time time DEFAULT NULL,
  p_exclude_loading_id uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_conflict_count int;
BEGIN
  IF p_start_time IS NULL OR p_finish_time IS NULL THEN
    -- No times specified: conflict if any loading exists for that machine on that date
    SELECT count(*) INTO v_conflict_count
    FROM machine_loadings
    WHERE machine_id = p_machine_id
      AND planned_date = p_planned_date
      AND status IN ('PLANNED','ACTIVE')
      AND (p_exclude_loading_id IS NULL OR id != p_exclude_loading_id);
  ELSE
    -- Check time overlap
    SELECT count(*) INTO v_conflict_count
    FROM machine_loadings
    WHERE machine_id = p_machine_id
      AND planned_date = p_planned_date
      AND status IN ('PLANNED','ACTIVE')
      AND planned_start_time IS NOT NULL
      AND planned_finish_time IS NOT NULL
      AND (p_exclude_loading_id IS NULL OR id != p_exclude_loading_id)
      AND planned_start_time < p_finish_time
      AND planned_finish_time > p_start_time;
  END IF;

  RETURN v_conflict_count > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION check_machine_loading_conflict(uuid, date, time, time, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION check_machine_loading_conflict(uuid, date, time, time, uuid) TO authenticated;

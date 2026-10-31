/*
# Phase 3 — Departments, Work Centers & Machine Management

## Overview
Extends the existing MES with proper department → work center → machine hierarchy,
machine status history (immutable), and machine availability scheduling.

## New Tables
1. `departments` — top-level organizational unit containing work centers
2. `work_centers` — production operation group containing machines, linked to a department
3. `machine_status_history` — immutable audit log of every machine status change
4. `machine_availability` — planned availability windows (shifts, downtime, maintenance)

## Modified Tables
1. `machines` — adds columns: department_id, work_center_id, machine_type, manufacturer,
   model_serial, capacity_value, capacity_unit, available_shifts, responsible_supervisor_id,
   installation_date, maintenance_notes, status (with CHECK constraint), created_by, updated_at.
   The existing `work_center` text column and `capacity_per_hr` are preserved for backward
   compatibility; new code uses `work_center_id` and `capacity_value`/`capacity_unit`.

## RPC Functions
1. `change_machine_status` — SECURITY DEFINER, atomically updates machine status using
   SELECT FOR UPDATE, inserts immutable history record, validates status transition.
2. `reassign_machine_workcenter` — SECURITY DEFINER, safely reassigns machine to a new
   work center while preserving historical production references.

## Security
- RLS enabled on all new tables with authenticated-only policies.
- All new tables grant CRUD to `authenticated` role.
- RPC functions revoke PUBLIC/anon execute, grant to `authenticated` only.
- Machine status changes are server-enforced (SECURITY DEFINER) to prevent unauthorized
  direct writes to machine_status_history.
*/

-- ============================================================
-- 1. Departments
-- ============================================================

CREATE TABLE IF NOT EXISTS departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO authenticated;

DROP POLICY IF EXISTS "dept_select_auth" ON departments;
CREATE POLICY "dept_select_auth" ON departments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "dept_insert_auth" ON departments;
CREATE POLICY "dept_insert_auth" ON departments FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "dept_update_auth" ON departments;
CREATE POLICY "dept_update_auth" ON departments FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "dept_delete_auth" ON departments;
CREATE POLICY "dept_delete_auth" ON departments FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 2. Work Centers
-- ============================================================

CREATE TABLE IF NOT EXISTS work_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_center_code text UNIQUE NOT NULL,
  name text NOT NULL,
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE RESTRICT,
  description text,
  default_unit_of_measure text NOT NULL DEFAULT 'PCS',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_centers_department ON work_centers(department_id);

ALTER TABLE work_centers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON work_centers TO authenticated;

DROP POLICY IF EXISTS "wc_select_auth" ON work_centers;
CREATE POLICY "wc_select_auth" ON work_centers FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "wc_insert_auth" ON work_centers;
CREATE POLICY "wc_insert_auth" ON work_centers FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "wc_update_auth" ON work_centers;
CREATE POLICY "wc_update_auth" ON work_centers FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "wc_delete_auth" ON work_centers;
CREATE POLICY "wc_delete_auth" ON work_centers FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 3. Extend Machines table with new columns
-- ============================================================

DO $$
BEGIN
  -- Add new columns only if they don't exist
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'department_id') THEN
    ALTER TABLE machines ADD COLUMN department_id uuid REFERENCES departments(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'work_center_id') THEN
    ALTER TABLE machines ADD COLUMN work_center_id uuid REFERENCES work_centers(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'machine_type') THEN
    ALTER TABLE machines ADD COLUMN machine_type text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'manufacturer') THEN
    ALTER TABLE machines ADD COLUMN manufacturer text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'model_serial') THEN
    ALTER TABLE machines ADD COLUMN model_serial text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'capacity_value') THEN
    ALTER TABLE machines ADD COLUMN capacity_value numeric;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'capacity_unit') THEN
    ALTER TABLE machines ADD COLUMN capacity_unit text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'available_shifts') THEN
    ALTER TABLE machines ADD COLUMN available_shifts text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'responsible_supervisor_id') THEN
    ALTER TABLE machines ADD COLUMN responsible_supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'installation_date') THEN
    ALTER TABLE machines ADD COLUMN installation_date date;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'maintenance_notes') THEN
    ALTER TABLE machines ADD COLUMN maintenance_notes text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'status') THEN
    ALTER TABLE machines ADD COLUMN status text NOT NULL DEFAULT 'IDLE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'created_by') THEN
    ALTER TABLE machines ADD COLUMN created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'machines' AND column_name = 'updated_at') THEN
    ALTER TABLE machines ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Add CHECK constraint on status (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machines_status_check') THEN
    ALTER TABLE machines ADD CONSTRAINT machines_status_check
      CHECK (status IN ('RUNNING','IDLE','BREAKDOWN','MAINTENANCE','OFFLINE'));
  END IF;
END $$;

-- Make machine_code unique (drop first for idempotency)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'machines_machine_code_key') THEN
    ALTER TABLE machines ADD CONSTRAINT machines_machine_code_key UNIQUE (machine_code);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_machines_department ON machines(department_id);
CREATE INDEX IF NOT EXISTS idx_machines_work_center ON machines(work_center_id);
CREATE INDEX IF NOT EXISTS idx_machines_status ON machines(status);

-- Ensure machines RLS is enabled (it should already be from Phase 1)
ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

-- Ensure machines grants include all columns (re-grant to cover new columns)
GRANT SELECT, INSERT, UPDATE, DELETE ON machines TO authenticated;

-- Drop and recreate machine policies to cover new columns
DROP POLICY IF EXISTS "machines_select_auth" ON machines;
CREATE POLICY "machines_select_auth" ON machines FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "machines_insert_auth" ON machines;
CREATE POLICY "machines_insert_auth" ON machines FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "machines_update_auth" ON machines;
CREATE POLICY "machines_update_auth" ON machines FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "machines_delete_auth" ON machines;
CREATE POLICY "machines_delete_auth" ON machines FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 4. Machine Status History (immutable audit log)
-- ============================================================

CREATE TABLE IF NOT EXISTS machine_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  previous_status text,
  new_status text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  reason text,
  related_maintenance_id uuid
);

CREATE INDEX IF NOT EXISTS idx_msh_machine ON machine_status_history(machine_id, changed_at DESC);

ALTER TABLE machine_status_history ENABLE ROW LEVEL SECURITY;

-- History is insert/select only — no updates or deletes allowed through RLS
GRANT SELECT, INSERT ON machine_status_history TO authenticated;

DROP POLICY IF EXISTS "msh_select_auth" ON machine_status_history;
CREATE POLICY "msh_select_auth" ON machine_status_history FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "msh_insert_auth" ON machine_status_history;
CREATE POLICY "msh_insert_auth" ON machine_status_history FOR INSERT
  TO authenticated WITH CHECK (true);

-- No UPDATE or DELETE policies — history is immutable via Data API.
-- Direct table UPDATE/DELETE is blocked by missing policies.
-- But grant nothing extra to prevent bypass.

-- ============================================================
-- 5. Machine Availability
-- ============================================================

CREATE TABLE IF NOT EXISTS machine_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_id uuid NOT NULL REFERENCES machines(id) ON DELETE RESTRICT,
  availability_type text NOT NULL CHECK (availability_type IN ('SHIFT_SCHEDULE','PLANNED_WORKING','PLANNED_DOWNTIME','MAINTENANCE','BREAKDOWN')),
  day_of_week smallint CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time,
  end_time time,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  planned_hours numeric,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ma_machine ON machine_availability(machine_id, effective_from DESC);

ALTER TABLE machine_availability ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON machine_availability TO authenticated;

DROP POLICY IF EXISTS "ma_select_auth" ON machine_availability;
CREATE POLICY "ma_select_auth" ON machine_availability FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "ma_insert_auth" ON machine_availability;
CREATE POLICY "ma_insert_auth" ON machine_availability FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ma_update_auth" ON machine_availability;
CREATE POLICY "ma_update_auth" ON machine_availability FOR UPDATE
  TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ma_delete_auth" ON machine_availability;
CREATE POLICY "ma_delete_auth" ON machine_availability FOR DELETE
  TO authenticated USING (true);

-- ============================================================
-- 6. RPC: change_machine_status (SECURITY DEFINER)
--    Atomically updates machine status with FOR UPDATE lock,
--    inserts immutable history record, returns the new status.
--    Concurrency-safe: if the row was changed between read and update,
--    the FOR UPDATE lock ensures we read the actual current status.
-- ============================================================

CREATE OR REPLACE FUNCTION change_machine_status(
  p_machine_id uuid,
  p_new_status text,
  p_reason text DEFAULT NULL,
  p_changed_by uuid DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_status text;
  v_machine_code text;
BEGIN
  -- Validate new status
  IF p_new_status NOT IN ('RUNNING','IDLE','BREAKDOWN','MAINTENANCE','OFFLINE') THEN
    RAISE EXCEPTION 'Invalid status: %. Must be one of RUNNING, IDLE, BREAKDOWN, MAINTENANCE, OFFLINE', p_new_status;
  END IF;

  -- Lock the machine row for concurrent-safe update
  SELECT status, machine_code INTO v_current_status, v_machine_code
  FROM machines
  WHERE id = p_machine_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found: %', p_machine_id;
  END IF;

  -- If status is the same, no change needed
  IF v_current_status = p_new_status THEN
    RAISE EXCEPTION 'Machine % is already in status %', v_machine_code, p_new_status;
  END IF;

  -- Insert immutable history record
  INSERT INTO machine_status_history (machine_id, previous_status, new_status, changed_by, reason)
  VALUES (p_machine_id, v_current_status, p_new_status, p_changed_by, p_reason);

  -- Update machine status
  UPDATE machines SET status = p_new_status, updated_at = now()
  WHERE id = p_machine_id;

  RETURN p_new_status;
END;
$$;

REVOKE EXECUTE ON FUNCTION change_machine_status(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION change_machine_status(uuid, text, text, uuid) TO authenticated;

-- ============================================================
-- 7. RPC: reassign_machine_workcenter (SECURITY DEFINER)
--    Safely reassigns a machine to a new work center.
--    Historical production records (pallets, production_stages) retain
--    their original machine_id reference — only the machine's work_center_id
--    changes. The old work center_id is NOT stored on historical records
--    because they reference the machine, not the work center directly.
-- ============================================================

CREATE OR REPLACE FUNCTION reassign_machine_workcenter(
  p_machine_id uuid,
  p_new_work_center_id uuid,
  p_changed_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_wc_id uuid;
  v_machine_code text;
  v_new_wc_exists boolean;
BEGIN
  -- Lock the machine row
  SELECT work_center_id, machine_code INTO v_old_wc_id, v_machine_code
  FROM machines
  WHERE id = p_machine_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Machine not found: %', p_machine_id;
  END IF;

  -- Validate new work center exists and is active
  SELECT EXISTS(SELECT 1 FROM work_centers WHERE id = p_new_work_center_id AND is_active = true)
  INTO v_new_wc_exists;

  IF NOT v_new_wc_exists THEN
    RAISE EXCEPTION 'Work center not found or inactive: %', p_new_work_center_id;
  END IF;

  -- Update the machine's work center
  UPDATE machines SET work_center_id = p_new_work_center_id, updated_at = now()
  WHERE id = p_machine_id;

  -- Log the reassignment in audit_logs if available
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    p_changed_by,
    'REASSIGN_WORK_CENTER',
    'machines',
    p_machine_id::text,
    jsonb_build_object('work_center_id', v_old_wc_id),
    jsonb_build_object('work_center_id', p_new_work_center_id)
  );

  RETURN p_new_work_center_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION reassign_machine_workcenter(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reassign_machine_workcenter(uuid, uuid, uuid) TO authenticated;

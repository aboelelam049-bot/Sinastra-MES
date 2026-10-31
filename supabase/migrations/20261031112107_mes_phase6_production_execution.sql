/*
# Phase 6 — Production Execution & Shop Floor Transactions

## Overview
Implements append-only production transactions, shift sessions with multiple entries,
material conversion for initial cutting, and quality dispositions (rework/scrap).

## New Tables
1. `shift_sessions` — OPEN/CLOSING/CLOSED sessions per supervisor/machine/stage
2. `production_transactions` — immutable production records with idempotency
3. `material_conversions` — one-to-many initial cutting outputs with genealogy
4. `quantity_dispositions` — rework/scrap/return dispositions for rejected qty

## RPCs
1. `generate_transaction_number` — unique transaction number
2. `create_production_batch` — parent batch with overproduction prevention
3. `record_production_transaction` — atomic append-only with validation
4. `close_shift_session` — closes session, prevents further entries
5. `record_material_conversion` — one-to-many conversion with genealogy
6. `record_disposition` — rework/scrap disposition

## Security
- RLS on all tables, CRUD to authenticated.
- Production transactions are INSERT only (append-only).
*/

-- ============================================================
-- 1. Shift Sessions (must come first — production_transactions references it)
-- ============================================================

CREATE TABLE IF NOT EXISTS shift_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  production_stage_id uuid NOT NULL REFERENCES routing_stages(id) ON DELETE RESTRICT,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  work_center_id uuid REFERENCES work_centers(id) ON DELETE SET NULL,
  supervisor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shift text,
  production_date date NOT NULL DEFAULT CURRENT_DATE,
  start_time timestamptz NOT NULL DEFAULT now(),
  end_time timestamptz,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSING','CLOSED')),
  opened_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  closed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ss_wo ON shift_sessions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_ss_batch ON shift_sessions(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_ss_status ON shift_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ss_supervisor ON shift_sessions(supervisor_id);

ALTER TABLE shift_sessions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON shift_sessions TO authenticated;

DROP POLICY IF EXISTS "ss_select_auth" ON shift_sessions;
CREATE POLICY "ss_select_auth" ON shift_sessions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "ss_insert_auth" ON shift_sessions;
CREATE POLICY "ss_insert_auth" ON shift_sessions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ss_update_auth" ON shift_sessions;
CREATE POLICY "ss_update_auth" ON shift_sessions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ss_delete_auth" ON shift_sessions;
CREATE POLICY "ss_delete_auth" ON shift_sessions FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. Production Transactions (append-only)
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS production_transaction_seq START 1;

CREATE TABLE IF NOT EXISTS production_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number text UNIQUE NOT NULL,
  shift_session_id uuid REFERENCES shift_sessions(id) ON DELETE SET NULL,
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  production_stage_id uuid NOT NULL REFERENCES routing_stages(id) ON DELETE RESTRICT,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  input_qty numeric(14,2) NOT NULL DEFAULT 0,
  good_qty numeric(14,2) NOT NULL DEFAULT 0,
  rejected_qty numeric(14,2) NOT NULL DEFAULT 0,
  pending_qty numeric(14,2) NOT NULL DEFAULT 0,
  scrap_qty numeric(14,2) NOT NULL DEFAULT 0,
  rework_qty numeric(14,2) NOT NULL DEFAULT 0,
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  shift text,
  start_time timestamptz,
  completion_time timestamptz,
  notes text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (input_qty >= 0),
  CHECK (good_qty >= 0),
  CHECK (rejected_qty >= 0),
  CHECK (pending_qty >= 0),
  CHECK (scrap_qty >= 0),
  CHECK (rework_qty >= 0),
  CHECK (input_qty = good_qty + rejected_qty + pending_qty)
);

CREATE INDEX IF NOT EXISTS idx_pt_batch ON production_transactions(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_pt_wo ON production_transactions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_pt_session ON production_transactions(shift_session_id);
CREATE INDEX IF NOT EXISTS idx_pt_stage ON production_transactions(production_stage_id);
CREATE INDEX IF NOT EXISTS idx_pt_idempotency ON production_transactions(idempotency_key);

ALTER TABLE production_transactions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON production_transactions TO authenticated;
GRANT USAGE ON SEQUENCE production_transaction_seq TO authenticated;

DROP POLICY IF EXISTS "pt_select_auth" ON production_transactions;
CREATE POLICY "pt_select_auth" ON production_transactions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pt_insert_auth" ON production_transactions;
CREATE POLICY "pt_insert_auth" ON production_transactions FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 3. Material Conversions (initial cutting one-to-many)
-- ============================================================

CREATE TABLE IF NOT EXISTS material_conversions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  production_stage_id uuid NOT NULL REFERENCES routing_stages(id) ON DELETE RESTRICT,
  source_item_id uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  source_item_code text NOT NULL,
  source_qty numeric(14,2) NOT NULL CHECK (source_qty > 0),
  source_unit text NOT NULL,
  output_item_id uuid REFERENCES item_master(id) ON DELETE SET NULL,
  output_item_code text NOT NULL,
  output_qty numeric(14,2) NOT NULL CHECK (output_qty >= 0),
  output_unit text NOT NULL,
  output_type text NOT NULL CHECK (output_type IN ('LENGTH_STRIP','FRONT_BACK_STRIP','WASTE','LEFTOVER')),
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  operator_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversion_date date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mc_batch ON material_conversions(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_mc_wo ON material_conversions(work_order_id);
CREATE INDEX IF NOT EXISTS idx_mc_source ON material_conversions(source_item_id);

ALTER TABLE material_conversions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON material_conversions TO authenticated;

DROP POLICY IF EXISTS "mc_select_auth" ON material_conversions;
CREATE POLICY "mc_select_auth" ON material_conversions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mc_insert_auth" ON material_conversions;
CREATE POLICY "mc_insert_auth" ON material_conversions FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 4. Quantity Dispositions (rework/scrap/return)
-- ============================================================

CREATE TABLE IF NOT EXISTS quantity_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  production_transaction_id uuid NOT NULL REFERENCES production_transactions(id) ON DELETE RESTRICT,
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  disposition_type text NOT NULL CHECK (disposition_type IN ('REWORK','SCRAP','RETURN_FOR_INSPECTION')),
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  authorized_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reason text NOT NULL,
  rework_transaction_id uuid REFERENCES production_transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dt_transaction ON quantity_dispositions(production_transaction_id);
CREATE INDEX IF NOT EXISTS idx_dt_batch ON quantity_dispositions(parent_batch_id);

ALTER TABLE quantity_dispositions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON quantity_dispositions TO authenticated;

DROP POLICY IF EXISTS "qd_select_auth" ON quantity_dispositions;
CREATE POLICY "qd_select_auth" ON quantity_dispositions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "qd_insert_auth" ON quantity_dispositions;
CREATE POLICY "qd_insert_auth" ON quantity_dispositions FOR INSERT TO authenticated WITH CHECK (true);

-- ============================================================
-- 5. RPC: Generate Transaction Number
-- ============================================================

CREATE OR REPLACE FUNCTION generate_transaction_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  v_next := nextval('production_transaction_seq');
  RETURN 'TX-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(v_next::text, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_transaction_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_transaction_number() TO authenticated;

-- ============================================================
-- 6. RPC: Create Production Batch (with overproduction prevention)
-- ============================================================

CREATE OR REPLACE FUNCTION create_production_batch(
  p_work_order_id uuid,
  p_planned_quantity numeric,
  p_product_model_id uuid DEFAULT NULL,
  p_routing_version_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_batch_number text;
  v_batch_id uuid;
  v_existing_batches_qty numeric;
  v_remaining numeric;
  v_product_id uuid;
  v_route_id uuid;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found: %', p_work_order_id;
  END IF;

  IF v_wo.status NOT IN ('RELEASED', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'Work order must be RELEASED or IN_PROGRESS, current: %', v_wo.status;
  END IF;

  SELECT COALESCE(SUM(planned_quantity), 0) INTO v_existing_batches_qty
    FROM parent_batches
    WHERE work_order_id = p_work_order_id
      AND status IN ('CREATED', 'IN_PROGRESS');

  v_remaining := v_wo.planned_quantity - v_existing_batches_qty;

  IF p_planned_quantity > v_remaining THEN
    RAISE EXCEPTION 'Overproduction prevented: requested % exceeds remaining authorized quantity %', p_planned_quantity, v_remaining;
  END IF;

  v_product_id := v_wo.product_id;
  v_route_id := v_wo.production_route_id;
  v_batch_number := public.generate_batch_number();

  INSERT INTO parent_batches (
    batch_number, work_order_id, product_id, production_route_id,
    planned_quantity, actual_quantity, available_quantity,
    status, created_by
  )
  VALUES (
    v_batch_number, p_work_order_id, v_product_id, v_route_id,
    p_planned_quantity, 0, 0,
    'CREATED', auth.uid()
  )
  RETURNING id INTO v_batch_id;

  IF v_wo.status = 'RELEASED' THEN
    UPDATE work_orders SET status = 'IN_PROGRESS', updated_at = now() WHERE id = p_work_order_id;
  END IF;

  RETURN v_batch_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_production_batch(uuid, numeric, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_production_batch(uuid, numeric, uuid, uuid) TO authenticated;

-- ============================================================
-- 7. RPC: Record Production Transaction (atomic, append-only)
-- ============================================================

CREATE OR REPLACE FUNCTION record_production_transaction(
  p_shift_session_id uuid DEFAULT NULL,
  p_parent_batch_id uuid DEFAULT NULL,
  p_work_order_id uuid DEFAULT NULL,
  p_production_stage_id uuid DEFAULT NULL,
  p_machine_id uuid DEFAULT NULL,
  p_input_qty numeric DEFAULT 0,
  p_good_qty numeric DEFAULT 0,
  p_rejected_qty numeric DEFAULT 0,
  p_pending_qty numeric DEFAULT 0,
  p_unit_of_measure text DEFAULT 'PCS',
  p_shift text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL,
  p_operator_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_tx_number text;
  v_session shift_sessions%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_op_id uuid;
  v_wo_id uuid;
  v_batch_id uuid;
  v_stage_id uuid;
BEGIN
  IF p_shift_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM shift_sessions WHERE id = p_shift_session_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shift session not found: %', p_shift_session_id;
    END IF;
    IF v_session.status != 'OPEN' THEN
      RAISE EXCEPTION 'Shift session is not OPEN (current: %). New entries are not allowed.', v_session.status;
    END IF;
    v_wo_id := v_session.work_order_id;
    v_batch_id := v_session.parent_batch_id;
    v_stage_id := v_session.production_stage_id;
  ELSE
    v_wo_id := p_work_order_id;
    v_batch_id := p_parent_batch_id;
    v_stage_id := p_production_stage_id;
  END IF;

  IF v_wo_id IS NULL OR v_batch_id IS NULL OR v_stage_id IS NULL THEN
    RAISE EXCEPTION 'Missing required IDs: work_order_id, parent_batch_id, and production_stage_id are required';
  END IF;

  IF p_input_qty < 0 OR p_good_qty < 0 OR p_rejected_qty < 0 OR p_pending_qty < 0 THEN
    RAISE EXCEPTION 'Negative quantities are not allowed';
  END IF;

  IF p_input_qty != (p_good_qty + p_rejected_qty + p_pending_qty) THEN
    RAISE EXCEPTION 'Quantity reconciliation failed: input_qty (%) must equal good_qty (%) + rejected_qty (%) + pending_qty (%)',
      p_input_qty, p_good_qty, p_rejected_qty, p_pending_qty;
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM production_transactions WHERE idempotency_key = p_idempotency_key) THEN
      RAISE EXCEPTION 'Duplicate transaction detected (idempotency key: %)', p_idempotency_key;
    END IF;
  END IF;

  v_op_id := COALESCE(p_operator_id, auth.uid());
  v_tx_number := public.generate_transaction_number();

  INSERT INTO production_transactions (
    transaction_number, shift_session_id, parent_batch_id, work_order_id,
    production_stage_id, machine_id,
    input_qty, good_qty, rejected_qty, pending_qty,
    scrap_qty, rework_qty, unit_of_measure,
    operator_id, shift, completion_time, notes, idempotency_key
  )
  VALUES (
    v_tx_number, p_shift_session_id, v_batch_id, v_wo_id,
    v_stage_id, p_machine_id,
    p_input_qty, p_good_qty, p_rejected_qty, p_pending_qty,
    0, 0, p_unit_of_measure,
    v_op_id, p_shift, now(), p_notes, p_idempotency_key
  )
  RETURNING id INTO v_tx_id;

  SELECT * INTO v_batch FROM parent_batches WHERE id = v_batch_id FOR UPDATE;
  UPDATE parent_batches
    SET actual_quantity = actual_quantity + p_good_qty,
        available_quantity = available_quantity + p_good_qty,
        status = CASE WHEN status = 'CREATED' THEN 'IN_PROGRESS' ELSE status END,
        updated_at = now()
    WHERE id = v_batch_id;

  RETURN v_tx_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_production_transaction(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_production_transaction(uuid, uuid, uuid, uuid, uuid, numeric, numeric, numeric, numeric, text, text, text, text, uuid) TO authenticated;

-- ============================================================
-- 8. RPC: Close Shift Session
-- ============================================================

CREATE OR REPLACE FUNCTION close_shift_session(
  p_session_id uuid,
  p_closed_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_session shift_sessions%ROWTYPE;
BEGIN
  SELECT * INTO v_session FROM shift_sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shift session not found: %', p_session_id;
  END IF;

  IF v_session.status = 'CLOSED' THEN
    RAISE EXCEPTION 'Session is already CLOSED';
  END IF;

  UPDATE shift_sessions
    SET status = 'CLOSED',
        end_time = now(),
        closed_at = now(),
        closed_by = COALESCE(p_closed_by, auth.uid()),
        notes = COALESCE(p_notes, notes),
        updated_at = now()
    WHERE id = p_session_id;

  RETURN p_session_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION close_shift_session(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION close_shift_session(uuid, uuid, text) TO authenticated;

-- ============================================================
-- 9. RPC: Record Material Conversion (one-to-many)
-- ============================================================

CREATE OR REPLACE FUNCTION record_material_conversion(
  p_parent_batch_id uuid,
  p_work_order_id uuid,
  p_production_stage_id uuid,
  p_source_item_id uuid,
  p_source_item_code text,
  p_source_qty numeric,
  p_source_unit text,
  p_output_item_id uuid DEFAULT NULL,
  p_output_item_code text DEFAULT '',
  p_output_qty numeric DEFAULT 0,
  p_output_unit text DEFAULT 'PCS',
  p_output_type text DEFAULT 'LENGTH_STRIP',
  p_machine_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_op_id uuid;
BEGIN
  v_op_id := auth.uid();

  INSERT INTO material_conversions (
    parent_batch_id, work_order_id, production_stage_id,
    source_item_id, source_item_code, source_qty, source_unit,
    output_item_id, output_item_code, output_qty, output_unit, output_type,
    machine_id, operator_id, notes
  )
  VALUES (
    p_parent_batch_id, p_work_order_id, p_production_stage_id,
    p_source_item_id, p_source_item_code, p_source_qty, p_source_unit,
    p_output_item_id, p_output_item_code, p_output_qty, p_output_unit, p_output_type,
    p_machine_id, v_op_id, p_notes
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_material_conversion(uuid, uuid, uuid, uuid, text, numeric, text, uuid, text, numeric, text, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_material_conversion(uuid, uuid, uuid, uuid, text, numeric, text, uuid, text, numeric, text, text, uuid, text) TO authenticated;

-- ============================================================
-- 10. RPC: Record Disposition (rework/scrap/return)
-- ============================================================

CREATE OR REPLACE FUNCTION record_disposition(
  p_production_transaction_id uuid,
  p_parent_batch_id uuid,
  p_disposition_type text,
  p_quantity numeric,
  p_unit_of_measure text DEFAULT 'PCS',
  p_reason text DEFAULT NULL,
  p_rework_transaction_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_batch parent_batches%ROWTYPE;
BEGIN
  IF p_disposition_type NOT IN ('REWORK','SCRAP','RETURN_FOR_INSPECTION') THEN
    RAISE EXCEPTION 'Invalid disposition type: %', p_disposition_type;
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Disposition quantity must be positive';
  END IF;

  SELECT * INTO v_batch FROM parent_batches WHERE id = p_parent_batch_id FOR UPDATE;

  INSERT INTO quantity_dispositions (
    production_transaction_id, parent_batch_id, disposition_type,
    quantity, unit_of_measure, authorized_by, reason, rework_transaction_id
  )
  VALUES (
    p_production_transaction_id, p_parent_batch_id, p_disposition_type,
    p_quantity, p_unit_of_measure, auth.uid(), p_reason, p_rework_transaction_id
  )
  RETURNING id INTO v_id;

  IF p_disposition_type = 'SCRAP' THEN
    UPDATE parent_batches
      SET available_quantity = GREATEST(0, available_quantity - p_quantity),
          updated_at = now()
      WHERE id = p_parent_batch_id;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_disposition(uuid, uuid, text, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_disposition(uuid, uuid, text, numeric, text, text, uuid) TO authenticated;

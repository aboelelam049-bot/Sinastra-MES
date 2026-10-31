/*
# Simplified MES: Master Plan → Monthly Plan → Work Orders → Sub Work Orders → Quality Gate → Scrap → OEE

## Purpose
Replaces the sprawling planning/execution model (production_plans, production_plan_lines,
machine_loadings, shift_sessions, parent_batches, pallets flow) with a streamlined linear chain:
  Master Plan (models + quantities, in order)
   → Monthly Plan (feeds from master in sequence)
   → Work Orders (auto-created from approved monthly plan rows)
   → Sub Work Orders (one per routing stage/machine, auto-generated per work order)
   → Quality gate on every work order AND sub work order
   → Scrap recording on sub work orders
   → Warehouse transfer blocked until quality acceptance
   → OEE (Availability × Performance × Quality) computed per work order

## New Tables
1. master_plan — list of product models with target quantities and a sequence order.
   Columns: id, plan_code, name, description, status (DRAFT/APPROVED/CLOSED), created_by, created_at, updated_at.
2. master_plan_items — models in a master plan, ordered.
   Columns: id, master_plan_id, product_model_id, sequence_order, target_quantity, unit_of_measure, notes.
3. monthly_plan — a monthly plan that feeds from an approved master plan, in order.
   Columns: id, plan_code, name, master_plan_id, plan_month (date = first of month), status, created_by, approved_by, approved_at, created_at, updated_at.
4. monthly_plan_items — items in a monthly plan, pulled from master_plan_items in sequence.
   Columns: id, monthly_plan_id, master_plan_item_id, product_model_id, sequence_order, planned_quantity, unit_of_measure, planned_start_date, planned_end_date, work_order_id (nullable, set when WO auto-created), status.
5. sub_work_orders — one row per routing stage per work order.
   Columns: id, work_order_id, sequence_number, routing_stage_id, machine_id, planned_quantity, good_quantity, scrap_quantity, reject_quantity, status, planned_start_time, planned_end_time, actual_start_time, actual_end_time, quality_status, warehouse_transferred, notes, created_at, updated_at.
6. scrap_records — scrap entries on sub work orders.
   Columns: id, sub_work_order_id, work_order_id, quantity, defect_code, reason, recorded_by, recorded_at, notes.
7. oee_snapshots — cached OEE values per work order (recomputable).
   Columns: id, work_order_id, availability, performance, quality, oee, planned_run_minutes, actual_run_minutes, ideal_cycle_minutes, good_qty, total_qty, computed_at.

## Work Order Extensions (ALTER work_orders)
- planned_start_time, planned_end_time (timestamptz, for planning)
- actual_start_time, actual_end_time (timestamptz, for production recording)
- master_plan_item_id, monthly_plan_item_id (links back into the plan chain)
- quality_status (PENDING/PASSED/FAILED), warehouse_transferred (bool)

## RPCs
1. generate_plan_code(p_prefix text) — returns next sequential code like MP-001 / MPL-001.
2. create_monthly_plan_from_master(p_master_plan_id uuid, p_plan_month date, p_name text) —
   creates a monthly plan + copies all master_plan_items (in sequence) into monthly_plan_items.
3. approve_monthly_plan(p_monthly_plan_id uuid) —
   for each monthly_plan_item, auto-creates a work_order (main) and its sub_work_orders
   (one per routing stage of the model's active routing version, ordered by sequence_number).
4. start_sub_work_order(p_sub_wo_id uuid) — sets actual_start_time + status IN_PROGRESS.
5. complete_sub_work_order(p_sub_wo_id uuid, p_good_qty, p_scrap_qty, p_reject_qty) —
   sets actual_end_time, quantities, status COMPLETED; inserts scrap_records for scrap.
6. transfer_to_warehouse(p_work_order_id uuid) — blocked unless quality_status = 'PASSED'.
7. compute_oee(p_work_order_id uuid) — computes Availability × Performance × Quality from
   planned/actual times and good/total quantities; upserts oee_snapshots.

## Security
- All new tables get RLS enabled.
- Shared-data pattern (USING (true), TO authenticated) — the app has sign-in but production
  data is intentionally shared among authenticated shop-floor users, matching the existing tables.
- GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated on each table.
- Functions: REVOKE EXECUTE FROM PUBLIC, anon; GRANT EXECUTE TO authenticated.
- No DROP/DELETE of columns or tables; we only ADD new tables and ADD new columns.
*/

-- ============================================================
-- 1. master_plan
-- ============================================================
CREATE TABLE IF NOT EXISTS master_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','APPROVED','CLOSED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE master_plan ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON master_plan TO authenticated;
DROP POLICY IF EXISTS "mp_select" ON master_plan;
CREATE POLICY "mp_select" ON master_plan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mp_insert" ON master_plan;
CREATE POLICY "mp_insert" ON master_plan FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mp_update" ON master_plan;
CREATE POLICY "mp_update" ON master_plan FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "mp_delete" ON master_plan;
CREATE POLICY "mp_delete" ON master_plan FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. master_plan_items
-- ============================================================
CREATE TABLE IF NOT EXISTS master_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  master_plan_id uuid NOT NULL REFERENCES master_plan(id) ON DELETE CASCADE,
  product_model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  sequence_order integer NOT NULL DEFAULT 1,
  target_quantity numeric NOT NULL DEFAULT 0 CHECK (target_quantity >= 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE master_plan_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON master_plan_items TO authenticated;
DROP POLICY IF EXISTS "mpi_select" ON master_plan_items;
CREATE POLICY "mpi_select" ON master_plan_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mpi_insert" ON master_plan_items;
CREATE POLICY "mpi_insert" ON master_plan_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mpi_update" ON master_plan_items;
CREATE POLICY "mpi_update" ON master_plan_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "mpi_delete" ON master_plan_items;
CREATE POLICY "mpi_delete" ON master_plan_items FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. monthly_plan
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_plan (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_code text UNIQUE NOT NULL,
  name text NOT NULL,
  master_plan_id uuid NOT NULL REFERENCES master_plan(id) ON DELETE RESTRICT,
  plan_month date NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','APPROVED','IN_PROGRESS','COMPLETED','CANCELLED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE monthly_plan ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_plan TO authenticated;
DROP POLICY IF EXISTS "mop_select" ON monthly_plan;
CREATE POLICY "mop_select" ON monthly_plan FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mop_insert" ON monthly_plan;
CREATE POLICY "mop_insert" ON monthly_plan FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mop_update" ON monthly_plan;
CREATE POLICY "mop_update" ON monthly_plan FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "mop_delete" ON monthly_plan;
CREATE POLICY "mop_delete" ON monthly_plan FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 4. monthly_plan_items
-- ============================================================
CREATE TABLE IF NOT EXISTS monthly_plan_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_plan_id uuid NOT NULL REFERENCES monthly_plan(id) ON DELETE CASCADE,
  master_plan_item_id uuid REFERENCES master_plan_items(id) ON DELETE SET NULL,
  product_model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  sequence_order integer NOT NULL DEFAULT 1,
  planned_quantity numeric NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  planned_start_date date,
  planned_end_date date,
  work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','PLANNED','RELEASED','IN_PROGRESS','COMPLETED','CANCELLED')),
  notes text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE monthly_plan_items ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON monthly_plan_items TO authenticated;
DROP POLICY IF EXISTS "mopi_select" ON monthly_plan_items;
CREATE POLICY "mopi_select" ON monthly_plan_items FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "mopi_insert" ON monthly_plan_items;
CREATE POLICY "mopi_insert" ON monthly_plan_items FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "mopi_update" ON monthly_plan_items;
CREATE POLICY "mopi_update" ON monthly_plan_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "mopi_delete" ON monthly_plan_items;
CREATE POLICY "mopi_delete" ON monthly_plan_items FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 5. sub_work_orders
-- ============================================================
CREATE TABLE IF NOT EXISTS sub_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  sequence_number integer NOT NULL DEFAULT 1,
  routing_stage_id uuid REFERENCES routing_stages(id) ON DELETE SET NULL,
  machine_id uuid REFERENCES machines(id) ON DELETE SET NULL,
  stage_name text,
  planned_quantity numeric NOT NULL DEFAULT 0 CHECK (planned_quantity >= 0),
  good_quantity numeric NOT NULL DEFAULT 0 CHECK (good_quantity >= 0),
  scrap_quantity numeric NOT NULL DEFAULT 0 CHECK (scrap_quantity >= 0),
  reject_quantity numeric NOT NULL DEFAULT 0 CHECK (reject_quantity >= 0),
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','ON_HOLD','CANCELLED')),
  planned_start_time timestamptz,
  planned_end_time timestamptz,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  quality_status text NOT NULL DEFAULT 'PENDING'
    CHECK (quality_status IN ('PENDING','PASSED','FAILED','REWORK')),
  warehouse_transferred boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE sub_work_orders ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON sub_work_orders TO authenticated;
DROP POLICY IF EXISTS "swo_select" ON sub_work_orders;
CREATE POLICY "swo_select" ON sub_work_orders FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "swo_insert" ON sub_work_orders;
CREATE POLICY "swo_insert" ON sub_work_orders FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "swo_update" ON sub_work_orders;
CREATE POLICY "swo_update" ON sub_work_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "swo_delete" ON sub_work_orders;
CREATE POLICY "swo_delete" ON sub_work_orders FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_sub_wo_work_order ON sub_work_orders(work_order_id);
CREATE INDEX IF NOT EXISTS idx_sub_wo_machine ON sub_work_orders(machine_id);
CREATE INDEX IF NOT EXISTS idx_sub_wo_status ON sub_work_orders(status);

-- ============================================================
-- 6. scrap_records
-- ============================================================
CREATE TABLE IF NOT EXISTS scrap_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sub_work_order_id uuid NOT NULL REFERENCES sub_work_orders(id) ON DELETE CASCADE,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  quantity numeric NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  defect_code text,
  reason text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_at timestamptz DEFAULT now(),
  notes text
);
ALTER TABLE scrap_records ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON scrap_records TO authenticated;
DROP POLICY IF EXISTS "sr_select" ON scrap_records;
CREATE POLICY "sr_select" ON scrap_records FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "sr_insert" ON scrap_records;
CREATE POLICY "sr_insert" ON scrap_records FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "sr_update" ON scrap_records;
CREATE POLICY "sr_update" ON scrap_records FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "sr_delete" ON scrap_records;
CREATE POLICY "sr_delete" ON scrap_records FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_scrap_sub_wo ON scrap_records(sub_work_order_id);

-- ============================================================
-- 7. oee_snapshots
-- ============================================================
CREATE TABLE IF NOT EXISTS oee_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  availability numeric NOT NULL DEFAULT 0 CHECK (availability >= 0 AND availability <= 1),
  performance numeric NOT NULL DEFAULT 0 CHECK (performance >= 0 AND performance <= 1),
  quality numeric NOT NULL DEFAULT 0 CHECK (quality >= 0 AND quality <= 1),
  oee numeric NOT NULL DEFAULT 0 CHECK (oee >= 0 AND oee <= 1),
  planned_run_minutes numeric,
  actual_run_minutes numeric,
  ideal_cycle_minutes numeric,
  good_qty numeric,
  total_qty numeric,
  computed_at timestamptz DEFAULT now()
);
ALTER TABLE oee_snapshots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON oee_snapshots TO authenticated;
DROP POLICY IF EXISTS "oee_select" ON oee_snapshots;
CREATE POLICY "oee_select" ON oee_snapshots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "oee_insert" ON oee_snapshots;
CREATE POLICY "oee_insert" ON oee_snapshots FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "oee_update" ON oee_snapshots;
CREATE POLICY "oee_update" ON oee_snapshots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "oee_delete" ON oee_snapshots;
CREATE POLICY "oee_delete" ON oee_snapshots FOR DELETE TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_oee_wo ON oee_snapshots(work_order_id);

-- ============================================================
-- 8. work_orders extensions (ADD columns, never DROP)
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='planned_start_time') THEN
    ALTER TABLE work_orders ADD COLUMN planned_start_time timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='planned_end_time') THEN
    ALTER TABLE work_orders ADD COLUMN planned_end_time timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='actual_start_time') THEN
    ALTER TABLE work_orders ADD COLUMN actual_start_time timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='actual_end_time') THEN
    ALTER TABLE work_orders ADD COLUMN actual_end_time timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='master_plan_item_id') THEN
    ALTER TABLE work_orders ADD COLUMN master_plan_item_id uuid REFERENCES master_plan_items(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='monthly_plan_item_id') THEN
    ALTER TABLE work_orders ADD COLUMN monthly_plan_item_id uuid REFERENCES monthly_plan_items(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='quality_status') THEN
    ALTER TABLE work_orders ADD COLUMN quality_status text NOT NULL DEFAULT 'PENDING'
      CHECK (quality_status IN ('PENDING','PASSED','FAILED','REWORK'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='work_orders' AND column_name='warehouse_transferred') THEN
    ALTER TABLE work_orders ADD COLUMN warehouse_transferred boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- ============================================================
-- 9. RPC: generate_plan_code
-- ============================================================
CREATE OR REPLACE FUNCTION generate_plan_code(p_prefix text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next integer;
  v_code text;
BEGIN
  -- Find max numeric suffix across matching codes
  SELECT COALESCE(MAX(CAST(substring(plan_code FROM '[0-9]+$') AS integer)), 0) + 1
    INTO v_next
    FROM (
      SELECT plan_code FROM master_plan WHERE plan_code LIKE p_prefix || '-%'
      UNION
      SELECT plan_code FROM monthly_plan WHERE plan_code LIKE p_prefix || '-%'
    ) s;
  v_code := p_prefix || '-' || lpad(v_next::text, 3, '0');
  RETURN v_code;
END;
$$;
REVOKE EXECUTE ON FUNCTION generate_plan_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_plan_code(text) TO authenticated;

-- ============================================================
-- 10. RPC: create_monthly_plan_from_master
-- ============================================================
CREATE OR REPLACE FUNCTION create_monthly_plan_from_master(
  p_master_plan_id uuid,
  p_plan_month date,
  p_name text,
  p_created_by uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mp master_plan%ROWTYPE;
  v_code text;
  v_new_id uuid;
  v_item master_plan_items%ROWTYPE;
BEGIN
  SELECT * INTO v_mp FROM master_plan WHERE id = p_master_plan_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Master plan % not found', p_master_plan_id;
  END IF;
  IF v_mp.status <> 'APPROVED' THEN
    RAISE EXCEPTION 'Master plan must be APPROVED before feeding a monthly plan';
  END IF;

  v_code := generate_plan_code('MPL');
  INSERT INTO monthly_plan (plan_code, name, master_plan_id, plan_month, status, created_by)
    VALUES (v_code, COALESCE(p_name, v_mp.name || ' — شهرية'), p_master_plan_id, p_plan_month, 'DRAFT', p_created_by)
    RETURNING id INTO v_new_id;

  -- Copy items in sequence order
  FOR v_item IN SELECT * FROM master_plan_items WHERE master_plan_id = p_master_plan_id ORDER BY sequence_order
  LOOP
    INSERT INTO monthly_plan_items (
      monthly_plan_id, master_plan_item_id, product_model_id, sequence_order,
      planned_quantity, unit_of_measure, status
    ) VALUES (
      v_new_id, v_item.id, v_item.product_model_id, v_item.sequence_order,
      v_item.target_quantity, v_item.unit_of_measure, 'PENDING'
    );
  END LOOP;

  RETURN v_new_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION create_monthly_plan_from_master(uuid, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_monthly_plan_from_master(uuid, date, text, uuid) TO authenticated;

-- ============================================================
-- 11. RPC: approve_monthly_plan
-- For each monthly_plan_item, create a work_order (main) + sub_work_orders
-- (one per active routing stage of the model's routing).
-- ============================================================
CREATE OR REPLACE FUNCTION approve_monthly_plan(
  p_monthly_plan_id uuid,
  p_approved_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_mp monthly_plan%ROWTYPE;
  v_item monthly_plan_items%ROWTYPE;
  v_wo_id uuid;
  v_wo_code text;
  v_route_id uuid;
  v_rv_id uuid;
  v_stage routing_stages%ROWTYPE;
  v_seq integer := 0;
  v_product_id uuid;
BEGIN
  SELECT * INTO v_mp FROM monthly_plan WHERE id = p_monthly_plan_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly plan not found'; END IF;
  IF v_mp.status <> 'DRAFT' THEN RAISE EXCEPTION 'Monthly plan already processed'; END IF;

  -- Get a fallback product/route for the work_order (first product for model)
  FOR v_item IN SELECT * FROM monthly_plan_items WHERE monthly_plan_id = p_monthly_plan_id ORDER BY sequence_order
  LOOP
    -- Find a production route for the model (best effort: any route)
    SELECT id INTO v_route_id FROM production_routes LIMIT 1;
    SELECT id INTO v_product_id FROM products LIMIT 1;

    v_wo_code := 'WO-' || to_char(now(), 'YYMMDD') || '-' || lpad((EXTRACT(epoch FROM now())::bigint % 1000)::text, 3, '0');
    INSERT INTO work_orders (
      wo_number, product_id, production_route_id, planned_quantity, status,
      priority, product_model_id, unit_of_measure,
      master_plan_item_id, monthly_plan_item_id, quality_status, warehouse_transferred
    ) VALUES (
      v_wo_code, v_product_id, v_route_id, v_item.planned_quantity, 'RELEASED',
      'NORMAL', v_item.product_model_id, v_item.unit_of_measure,
      v_item.master_plan_item_id, v_item.id, 'PENDING', false
    )
    RETURNING id INTO v_wo_id;

    -- Link monthly plan item back to the work order
    UPDATE monthly_plan_items SET work_order_id = v_wo_id, status = 'RELEASED' WHERE id = v_item.id;

    -- Generate sub work orders from the model's active routing version stages
    v_seq := 0;
    SELECT rv.id INTO v_rv_id
      FROM routing_versions rv
      JOIN routing_templates rt ON rt.id = rv.routing_template_id
      WHERE rv.status = 'ACTIVE'
        AND (rt.product_model_applicability = 'ALL' OR rt.product_model_applicability IS NULL
             OR rt.id IN (SELECT routing_template_id FROM routing_item_rules WHERE product_model_id = v_item.product_model_id))
      ORDER BY rv.version_number DESC
      LIMIT 1;

    IF v_rv_id IS NOT NULL THEN
      FOR v_stage IN
        SELECT * FROM routing_stages
          WHERE routing_version_id = v_rv_id AND is_active
          ORDER BY sequence_number
      LOOP
        v_seq := v_seq + 1;
        INSERT INTO sub_work_orders (
          work_order_id, sequence_number, routing_stage_id, stage_name,
          planned_quantity, status, quality_status, warehouse_transferred
        ) VALUES (
          v_wo_id, v_stage.sequence_number, v_stage.id, v_stage.stage_name,
          v_item.planned_quantity, 'PENDING', 'PENDING', false
        );
      END LOOP;
    ELSE
      -- No routing defined: create a single generic sub work order
      INSERT INTO sub_work_orders (
        work_order_id, sequence_number, stage_name, planned_quantity,
        status, quality_status, warehouse_transferred
      ) VALUES (
        v_wo_id, 1, 'تجميع', v_item.planned_quantity, 'PENDING', 'PENDING', false
      );
    END IF;
  END LOOP;

  UPDATE monthly_plan
    SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), updated_at = now()
    WHERE id = p_monthly_plan_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION approve_monthly_plan(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_monthly_plan(uuid, uuid) TO authenticated;

-- ============================================================
-- 12. RPC: start_sub_work_order
-- ============================================================
CREATE OR REPLACE FUNCTION start_sub_work_order(p_sub_wo_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE sub_work_orders
    SET actual_start_time = now(),
        status = 'IN_PROGRESS',
        updated_at = now()
    WHERE id = p_sub_wo_id;

  UPDATE work_orders
    SET actual_start_time = COALESCE(actual_start_time, now()),
        status = 'IN_PROGRESS',
        updated_at = now()
    WHERE id IN (SELECT work_order_id FROM sub_work_orders WHERE id = p_sub_wo_id)
      AND actual_start_time IS NULL;
END;
$$;
REVOKE EXECUTE ON FUNCTION start_sub_work_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION start_sub_work_order(uuid) TO authenticated;

-- ============================================================
-- 13. RPC: complete_sub_work_order
-- ============================================================
CREATE OR REPLACE FUNCTION complete_sub_work_order(
  p_sub_wo_id uuid,
  p_good_qty numeric,
  p_scrap_qty numeric DEFAULT 0,
  p_reject_qty numeric DEFAULT 0,
  p_defect_code text DEFAULT NULL,
  p_reason text DEFAULT NULL,
  p_recorded_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wo_id uuid;
  v_plan_qty numeric;
BEGIN
  SELECT work_order_id, planned_quantity INTO v_wo_id, v_plan_qty FROM sub_work_orders WHERE id = p_sub_wo_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Sub work order not found'; END IF;

  UPDATE sub_work_orders
    SET good_quantity = p_good_qty,
        scrap_quantity = p_scrap_qty,
        reject_quantity = p_reject_qty,
        actual_end_time = now(),
        status = 'COMPLETED',
        updated_at = now()
    WHERE id = p_sub_wo_id;

  IF p_scrap_qty > 0 THEN
    INSERT INTO scrap_records (sub_work_order_id, work_order_id, quantity, defect_code, reason, recorded_by)
      VALUES (p_sub_wo_id, v_wo_id, p_scrap_qty, p_defect_code, p_reason, p_recorded_by);
  END IF;

  -- Update main work order actual quantities + completion
  UPDATE work_orders
    SET actual_quantity = (SELECT COALESCE(SUM(good_quantity), 0) FROM sub_work_orders WHERE work_order_id = v_wo_id AND sequence_number = (SELECT MAX(sequence_number) FROM sub_work_orders WHERE work_order_id = v_wo_id)),
        actual_end_time = CASE WHEN NOT EXISTS (
          SELECT 1 FROM sub_work_orders WHERE work_order_id = v_wo_id AND status <> 'COMPLETED'
        ) THEN now() ELSE actual_end_time END,
        status = CASE WHEN NOT EXISTS (
          SELECT 1 FROM sub_work_orders WHERE work_order_id = v_wo_id AND status <> 'COMPLETED'
        ) THEN 'COMPLETED' ELSE status END,
        updated_at = now()
    WHERE id = v_wo_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION complete_sub_work_order(uuid, numeric, numeric, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION complete_sub_work_order(uuid, numeric, numeric, numeric, text, text, uuid) TO authenticated;

-- ============================================================
-- 14. RPC: set_work_order_quality
-- Sets quality_status on a work order (and mirrors to its sub WOs).
-- ============================================================
CREATE OR REPLACE FUNCTION set_work_order_quality(
  p_work_order_id uuid,
  p_quality_status text,
  p_setter_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_quality_status NOT IN ('PENDING','PASSED','FAILED','REWORK') THEN
    RAISE EXCEPTION 'Invalid quality status: %', p_quality_status;
  END IF;
  UPDATE work_orders SET quality_status = p_quality_status, updated_at = now() WHERE id = p_work_order_id;
  UPDATE sub_work_orders SET quality_status = p_quality_status, updated_at = now() WHERE work_order_id = p_work_order_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_work_order_quality(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_work_order_quality(uuid, text, uuid) TO authenticated;

-- ============================================================
-- 15. RPC: transfer_to_warehouse
-- Blocked unless quality_status = 'PASSED'.
-- ============================================================
CREATE OR REPLACE FUNCTION transfer_to_warehouse(
  p_work_order_id uuid,
  p_transferred_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_qs text;
BEGIN
  SELECT quality_status INTO v_qs FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;
  IF v_qs <> 'PASSED' THEN
    RAISE EXCEPTION 'لا يمكن النقل للمخزن إلا بعد قبول الجودة (الحالة الحالية: %)', v_qs;
  END IF;
  UPDATE work_orders SET warehouse_transferred = true, updated_at = now() WHERE id = p_work_order_id;
  UPDATE sub_work_orders SET warehouse_transferred = true, updated_at = now() WHERE work_order_id = p_work_order_id;
END;
$$;
REVOKE EXECUTE ON FUNCTION transfer_to_warehouse(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transfer_to_warehouse(uuid, uuid) TO authenticated;

-- ============================================================
-- 16. RPC: compute_oee
-- Availability = actual_run_minutes / planned_run_minutes
-- Performance = ideal_cycle_minutes / actual_run_minutes (capped at 1)
-- Quality = good_qty / total_qty
-- OEE = A × P × Q
-- ============================================================
CREATE OR REPLACE FUNCTION compute_oee(p_work_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_planned_minutes numeric;
  v_actual_minutes numeric;
  v_ideal_minutes numeric;
  v_good numeric;
  v_total numeric;
  v_availability numeric;
  v_performance numeric;
  v_quality numeric;
  v_oee numeric;
  v_existing_id uuid;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Work order not found'; END IF;

  v_planned_minutes := COALESCE(
    (EXTRACT(EPOCH FROM (COALESCE(v_wo.planned_end_time, v_wo.planned_finish_date::timestamptz) - COALESCE(v_wo.planned_start_time, v_wo.planned_start_date::timestamptz))) / 60),
    0);
  v_actual_minutes := COALESCE(
    (EXTRACT(EPOCH FROM (COALESCE(v_wo.actual_end_time, now()) - COALESCE(v_wo.actual_start_time, v_wo.actual_start_time))) / 60),
    0);
  -- Ideal cycle time: assume planned_qty over planned minutes as the ideal rate
  v_ideal_minutes := CASE WHEN v_planned_minutes > 0 AND v_wo.planned_quantity > 0
    THEN (v_wo.actual_quantity / v_wo.planned_quantity) * v_planned_minutes
    ELSE 0 END;

  v_good := COALESCE(v_wo.actual_quantity, 0);
  v_total := v_good;
  -- Add scrap from sub work orders
  SELECT COALESCE(SUM(scrap_quantity + reject_quantity), 0) INTO v_total FROM sub_work_orders WHERE work_order_id = p_work_order_id;
  v_total := v_total + v_good;

  v_availability := CASE WHEN v_planned_minutes > 0 THEN LEAST(v_actual_minutes / v_planned_minutes, 1) ELSE 0 END;
  v_performance := CASE WHEN v_actual_minutes > 0 THEN LEAST(v_ideal_minutes / v_actual_minutes, 1) ELSE 0 END;
  v_quality := CASE WHEN v_total > 0 THEN v_good / v_total ELSE 0 END;
  v_oee := v_availability * v_performance * v_quality;

  SELECT id INTO v_existing_id FROM oee_snapshots WHERE work_order_id = p_work_order_id ORDER BY computed_at DESC LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE oee_snapshots SET
      availability = v_availability,
      performance = v_performance,
      quality = v_quality,
      oee = v_oee,
      planned_run_minutes = v_planned_minutes,
      actual_run_minutes = v_actual_minutes,
      ideal_cycle_minutes = v_ideal_minutes,
      good_qty = v_good,
      total_qty = v_total,
      computed_at = now()
    WHERE id = v_existing_id;
  ELSE
    INSERT INTO oee_snapshots (work_order_id, availability, performance, quality, oee,
      planned_run_minutes, actual_run_minutes, ideal_cycle_minutes, good_qty, total_qty)
    VALUES (p_work_order_id, v_availability, v_performance, v_quality, v_oee,
      v_planned_minutes, v_actual_minutes, v_ideal_minutes, v_good, v_total);
  END IF;

  RETURN jsonb_build_object(
    'availability', v_availability,
    'performance', v_performance,
    'quality', v_quality,
    'oee', v_oee,
    'planned_minutes', v_planned_minutes,
    'actual_minutes', v_actual_minutes,
    'good_qty', v_good,
    'total_qty', v_total
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION compute_oee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION compute_oee(uuid) TO authenticated;

-- ============================================================
-- 17. RPC: set_sub_work_order_quality
-- Sets quality_status on a single sub work order.
-- ============================================================
CREATE OR REPLACE FUNCTION set_sub_work_order_quality(
  p_sub_wo_id uuid,
  p_quality_status text,
  p_setter_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wo_id uuid;
  v_all_passed boolean;
BEGIN
  IF p_quality_status NOT IN ('PENDING','PASSED','FAILED','REWORK') THEN
    RAISE EXCEPTION 'Invalid quality status: %', p_quality_status;
  END IF;
  UPDATE sub_work_orders SET quality_status = p_quality_status, updated_at = now() WHERE id = p_sub_wo_id;

  -- If all sub WOs of the parent passed, mark parent passed; if any failed, mark failed
  SELECT work_order_id INTO v_wo_id FROM sub_work_orders WHERE id = p_sub_wo_id;
  IF v_wo_id IS NOT NULL THEN
    SELECT bool_and(quality_status = 'PASSED') INTO v_all_passed
      FROM sub_work_orders WHERE work_order_id = v_wo_id;
    IF v_all_passed THEN
      UPDATE work_orders SET quality_status = 'PASSED', updated_at = now() WHERE id = v_wo_id;
    ELSE
      UPDATE work_orders SET quality_status = CASE
        WHEN EXISTS (SELECT 1 FROM sub_work_orders WHERE work_order_id = v_wo_id AND quality_status = 'FAILED') THEN 'FAILED'
        ELSE 'PENDING' END,
        updated_at = now()
      WHERE id = v_wo_id;
    END IF;
  END IF;
END;
$$;
REVOKE EXECUTE ON FUNCTION set_sub_work_order_quality(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_sub_work_order_quality(uuid, text, uuid) TO authenticated;
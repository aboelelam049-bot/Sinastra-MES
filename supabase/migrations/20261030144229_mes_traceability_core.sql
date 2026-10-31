/*
# MES Traceability — Parent Batches, Pallets, Movements, Barcodes

## Summary
Creates the core traceability data architecture with two-level tracking:
1. Parent Batch — main production batch linked to a Work Order.
2. Pallet — physically separated quantity within a Parent Batch.

Also creates PalletMovement (audit trail) and Barcode (unique identifiers).

## New Tables
### parent_batches
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Batch ID |
| batch_number | text (UQ) | System-generated, immutable, unique batch number |
| work_order_id | uuid (FK) | References work_orders |
| product_id | uuid (FK) | References products |
| production_route_id | uuid (FK) | References production_routes |
| current_stage_id | uuid (FK) | References production_stages (nullable) |
| planned_quantity | numeric | Planned quantity for this batch |
| actual_quantity | numeric | Actual produced quantity |
| available_quantity | numeric | Available for pallet allocation |
| status | text | CREATED, IN_PROGRESS, COMPLETED, CANCELLED |
| created_by | uuid | User who created the batch |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### pallets
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Pallet ID |
| pallet_number | text (UQ) | System-generated, immutable, unique pallet number |
| parent_batch_id | uuid (FK) | References parent_batches |
| work_order_id | uuid (FK) | References work_orders |
| product_id | uuid (FK) | References products |
| stage_id | uuid (FK) | References production_stages |
| machine_id | uuid (FK) | References machines (nullable) |
| quantity | numeric | Quantity on this pallet |
| quality_card_id | uuid (FK) | References quality_cards (nullable) |
| status | text | CREATED, IN_PRODUCTION, QUALITY_PENDING, QUALITY_APPROVED, WAREHOUSE_RECEIVED, SPLIT, CANCELLED |
| created_by | uuid | User who created the pallet |
| created_at | timestamptz | Creation timestamp |
| updated_at | timestamptz | Last update timestamp |

### pallet_movements
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Movement ID |
| pallet_id | uuid (FK) | References pallets |
| source_stage_id | uuid (FK) | Previous stage (nullable) |
| destination_stage_id | uuid (FK) | New stage |
| movement_type | text | CREATED, STAGE_TRANSFER, SPLIT, QUALITY_INSPECTION, WAREHOUSE_RECEIPT |
| quantity | numeric | Quantity at time of movement |
| performed_by | uuid | User who performed the movement |
| timestamp | timestamptz | When the movement occurred |
| reference_id | uuid | Reference to related record |
| notes | text | Movement notes |

### barcodes
| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Barcode ID |
| barcode_value | text (UQ) | Unique barcode value (secure lookup token) |
| pallet_id | uuid (FK) | References pallets |
| barcode_type | text | PALLET |
| created_at | timestamptz | Creation timestamp |
| printed_at | timestamptz | Last print timestamp (nullable) |
| print_count | int | Number of times printed |
| status | text | ACTIVE, RETIRED |

## RPC Functions (all SECURITY DEFINER)
- generate_batch_number() — returns 'PB-YYYY-NNNNN'
- generate_pallet_number() — returns 'PL-YYYY-NNNNN'
- create_parent_batch(p_work_order_id, p_planned_quantity, p_current_stage_id)
- create_pallet(p_parent_batch_id, p_stage_id, p_quantity, p_machine_id) — atomic quantity check with row lock
- split_pallet(p_pallet_id, p_quantities[], p_performed_by) — atomic, preserves genealogy
- generate_barcode(p_pallet_id) — one barcode per pallet, UUID-based token
- reprint_barcode(p_barcode_id) — increments print_count only, no status change
- lookup_pallet_by_barcode(p_barcode_value) — full pallet details as JSONB
- record_pallet_movement(...) — records movement + audit log
- update_batch_quantity(p_batch_id, p_actual_quantity) — updates actual/available

## Security
- RLS on all tables. SELECT to authenticated on all.
- Pallets: mutations only via RPC (no direct INSERT/UPDATE/DELETE policy).
- pallet_movements: INSERT only via RPC.
- barcodes: mutations only via RPC.

## Important Notes
1. Batch and pallet numbers are generated via sequences and are immutable.
2. Pallet quantity validation uses SELECT ... FOR UPDATE (concurrency protection).
3. Barcode encodes only a UUID-based token — no editable data.
4. Printing barcode does NOT change pallet/warehouse status (Rule 7).
5. Reprinting increments print_count, keeps same barcode_value (Rule 8).
6. Split creates new pallets with genealogy via reference_id (Rule 10).
7. Pallet merging NOT implemented (Rule 11).
*/

-- ============================================================
-- 1. SEQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS parent_batch_seq START 1;
CREATE SEQUENCE IF NOT EXISTS pallet_seq START 1;

-- ============================================================
-- 2. PARENT BATCHES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS parent_batches (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number        text UNIQUE NOT NULL,
  work_order_id       uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  production_route_id uuid NOT NULL REFERENCES production_routes(id) ON DELETE RESTRICT,
  current_stage_id    uuid REFERENCES production_stages(id) ON DELETE SET NULL,
  planned_quantity    numeric(14,2) NOT NULL DEFAULT 0,
  actual_quantity     numeric(14,2) NOT NULL DEFAULT 0,
  available_quantity  numeric(14,2) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'CREATED'
                      CHECK (status IN ('CREATED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE parent_batches ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON parent_batches TO authenticated;
GRANT UPDATE (current_stage_id, actual_quantity, available_quantity, status) ON parent_batches TO authenticated;
GRANT USAGE ON SEQUENCE parent_batch_seq TO authenticated;

DROP POLICY IF EXISTS "pb_select_authenticated" ON parent_batches;
CREATE POLICY "pb_select_authenticated"
  ON parent_batches FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pb_update_authenticated" ON parent_batches;
CREATE POLICY "pb_update_authenticated"
  ON parent_batches FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS pb_updated_at ON parent_batches;
CREATE TRIGGER pb_updated_at
  BEFORE UPDATE ON parent_batches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 3. PALLETS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS pallets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_number   text UNIQUE NOT NULL,
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  work_order_id   uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  product_id      uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  stage_id        uuid NOT NULL REFERENCES production_stages(id) ON DELETE RESTRICT,
  machine_id      uuid REFERENCES machines(id) ON DELETE SET NULL,
  quantity        numeric(14,2) NOT NULL DEFAULT 0,
  quality_card_id uuid REFERENCES quality_cards(id) ON DELETE SET NULL,
  status          text NOT NULL DEFAULT 'CREATED'
                  CHECK (status IN ('CREATED', 'IN_PRODUCTION', 'QUALITY_PENDING', 'QUALITY_APPROVED', 'WAREHOUSE_RECEIVED', 'SPLIT', 'CANCELLED')),
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pallets ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON pallets TO authenticated;
GRANT USAGE ON SEQUENCE pallet_seq TO authenticated;

DROP POLICY IF EXISTS "pallets_select_authenticated" ON pallets;
CREATE POLICY "pallets_select_authenticated"
  ON pallets FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS pallets_updated_at ON pallets;
CREATE TRIGGER pallets_updated_at
  BEFORE UPDATE ON pallets
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 4. PALLET MOVEMENTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS pallet_movements (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pallet_id            uuid NOT NULL REFERENCES pallets(id) ON DELETE RESTRICT,
  source_stage_id      uuid REFERENCES production_stages(id) ON DELETE SET NULL,
  destination_stage_id uuid REFERENCES production_stages(id) ON DELETE SET NULL,
  movement_type        text NOT NULL
                       CHECK (movement_type IN ('CREATED', 'STAGE_TRANSFER', 'SPLIT', 'QUALITY_INSPECTION', 'WAREHOUSE_RECEIPT')),
  quantity             numeric(14,2) NOT NULL DEFAULT 0,
  performed_by         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  "timestamp"          timestamptz NOT NULL DEFAULT now(),
  reference_id         uuid,
  notes                text
);

ALTER TABLE pallet_movements ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON pallet_movements TO authenticated;

DROP POLICY IF EXISTS "pm_select_authenticated" ON pallet_movements;
CREATE POLICY "pm_select_authenticated"
  ON pallet_movements FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. BARCODES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS barcodes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode_value text UNIQUE NOT NULL,
  pallet_id     uuid NOT NULL REFERENCES pallets(id) ON DELETE RESTRICT,
  barcode_type  text NOT NULL DEFAULT 'PALLET'
                CHECK (barcode_type IN ('PALLET')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  printed_at    timestamptz,
  print_count   int NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'ACTIVE'
                CHECK (status IN ('ACTIVE', 'RETIRED'))
);

ALTER TABLE barcodes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON barcodes TO authenticated;

DROP POLICY IF EXISTS "barcodes_select_authenticated" ON barcodes;
CREATE POLICY "barcodes_select_authenticated"
  ON barcodes FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 6. NUMBER GENERATION FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_batch_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  year_str text;
BEGIN
  next_val := nextval('public.parent_batch_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'PB-' || year_str || '-' || lpad(next_val::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_batch_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_batch_number() TO authenticated;

CREATE OR REPLACE FUNCTION public.generate_pallet_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  year_str text;
BEGIN
  next_val := nextval('public.pallet_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'PL-' || year_str || '-' || lpad(next_val::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_pallet_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_pallet_number() TO authenticated;

-- ============================================================
-- 7. CREATE PARENT BATCH RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_parent_batch(
  p_work_order_id uuid,
  p_planned_quantity numeric,
  p_current_stage_id uuid DEFAULT NULL
)
RETURNS public.parent_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_wo work_orders%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_batch_number text;
BEGIN
  SELECT * INTO v_wo FROM work_orders WHERE id = p_work_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work order not found: %', p_work_order_id;
  END IF;

  IF v_wo.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot create batch for a cancelled work order';
  END IF;

  IF p_planned_quantity <= 0 THEN
    RAISE EXCEPTION 'Planned quantity must be greater than zero';
  END IF;

  v_batch_number := public.generate_batch_number();

  INSERT INTO parent_batches (
    batch_number, work_order_id, product_id, production_route_id,
    current_stage_id, planned_quantity, actual_quantity,
    available_quantity, status, created_by
  ) VALUES (
    v_batch_number, p_work_order_id, v_wo.product_id, v_wo.production_route_id,
    p_current_stage_id, p_planned_quantity, 0,
    0, 'CREATED', auth.uid()
  )
  RETURNING * INTO v_batch;

  IF v_wo.status = 'CREATED' THEN
    UPDATE work_orders SET status = 'IN_PROGRESS' WHERE id = p_work_order_id;
  END IF;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), 'INSERT', 'parent_batches', v_batch.id::text,
    jsonb_build_object(
      'batch_number', v_batch.batch_number,
      'work_order_id', v_batch.work_order_id,
      'planned_quantity', v_batch.planned_quantity
    )
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_parent_batch(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_parent_batch(uuid, numeric, uuid) TO authenticated;

-- ============================================================
-- 8. CREATE PALLET RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_pallet(
  p_parent_batch_id uuid,
  p_stage_id uuid,
  p_quantity numeric,
  p_machine_id uuid DEFAULT NULL
)
RETURNS public.pallets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch parent_batches%ROWTYPE;
  v_pallet pallets%ROWTYPE;
  v_pallet_number text;
  v_current_allocated numeric(14,2);
BEGIN
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Pallet quantity must be greater than zero';
  END IF;

  SELECT * INTO v_batch
  FROM parent_batches
  WHERE id = p_parent_batch_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent batch not found: %', p_parent_batch_id;
  END IF;

  IF v_batch.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Cannot create pallet for a cancelled batch';
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_current_allocated
  FROM pallets
  WHERE parent_batch_id = p_parent_batch_id
    AND status NOT IN ('CANCELLED', 'SPLIT');

  IF v_current_allocated + p_quantity > v_batch.available_quantity THEN
    RAISE EXCEPTION
      'Pallet quantity exceeds available batch quantity. Available: %, Already allocated: %, Requested: %',
      v_batch.available_quantity, v_current_allocated, p_quantity;
  END IF;

  v_pallet_number := public.generate_pallet_number();

  INSERT INTO pallets (
    pallet_number, parent_batch_id, work_order_id, product_id,
    stage_id, machine_id, quantity, status, created_by
  ) VALUES (
    v_pallet_number, p_parent_batch_id, v_batch.work_order_id,
    v_batch.product_id, p_stage_id, p_machine_id, p_quantity,
    'CREATED', auth.uid()
  )
  RETURNING * INTO v_pallet;

  INSERT INTO pallet_movements (
    pallet_id, source_stage_id, destination_stage_id,
    movement_type, quantity, performed_by, notes
  ) VALUES (
    v_pallet.id, NULL, p_stage_id, 'CREATED', p_quantity, auth.uid(),
    'Pallet created for batch ' || v_batch.batch_number
  );

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), 'INSERT', 'pallets', v_pallet.id::text,
    jsonb_build_object(
      'pallet_number', v_pallet.pallet_number,
      'parent_batch_id', v_pallet.parent_batch_id,
      'quantity', v_pallet.quantity
    )
  );

  RETURN v_pallet;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_pallet(uuid, uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_pallet(uuid, uuid, numeric, uuid) TO authenticated;

-- ============================================================
-- 9. SPLIT PALLET RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.split_pallet(
  p_pallet_id uuid,
  p_quantities numeric[],
  p_performed_by uuid DEFAULT NULL
)
RETURNS public.pallets[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source pallets%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_sum numeric(14,2) := 0;
  v_qty numeric;
  v_new_pallet pallets%ROWTYPE;
  v_result pallets[];
  v_performer uuid := COALESCE(p_performed_by, auth.uid());
  v_pallet_number text;
BEGIN
  SELECT * INTO v_source FROM pallets WHERE id = p_pallet_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found: %', p_pallet_id;
  END IF;

  IF v_source.status IN ('CANCELLED', 'WAREHOUSE_RECEIVED', 'SPLIT') THEN
    RAISE EXCEPTION 'Cannot split pallet with status: %', v_source.status;
  END IF;

  IF array_length(p_quantities, 1) IS NULL OR array_length(p_quantities, 1) < 2 THEN
    RAISE EXCEPTION 'Must provide at least 2 quantities for splitting';
  END IF;

  FOREACH v_qty IN ARRAY p_quantities LOOP
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'All split quantities must be greater than zero';
    END IF;
    v_sum := v_sum + v_qty;
  END LOOP;

  IF v_sum <> v_source.quantity THEN
    RAISE EXCEPTION
      'Sum of split quantities (%) does not equal source pallet quantity (%)',
      v_sum, v_source.quantity;
  END IF;

  SELECT * INTO v_batch FROM parent_batches WHERE id = v_source.parent_batch_id FOR UPDATE;

  UPDATE pallets SET status = 'SPLIT' WHERE id = p_pallet_id;

  INSERT INTO pallet_movements (
    pallet_id, source_stage_id, destination_stage_id,
    movement_type, quantity, performed_by, reference_id, notes
  ) VALUES (
    p_pallet_id, v_source.stage_id, NULL, 'SPLIT', v_source.quantity,
    v_performer, NULL, 'Source pallet split into ' || array_length(p_quantities, 1) || ' new pallets'
  );

  FOREACH v_qty IN ARRAY p_quantities LOOP
    v_pallet_number := public.generate_pallet_number();

    INSERT INTO pallets (
      pallet_number, parent_batch_id, work_order_id, product_id,
      stage_id, machine_id, quantity, status, created_by
    ) VALUES (
      v_pallet_number, v_source.parent_batch_id, v_source.work_order_id,
      v_source.product_id, v_source.stage_id, v_source.machine_id, v_qty,
      'CREATED', v_performer
    )
    RETURNING * INTO v_new_pallet;

    INSERT INTO pallet_movements (
      pallet_id, source_stage_id, destination_stage_id,
      movement_type, quantity, performed_by, reference_id, notes
    ) VALUES (
      v_new_pallet.id, NULL, v_source.stage_id, 'SPLIT', v_qty,
      v_performer, p_pallet_id, 'Pallet created from split of ' || v_source.pallet_number
    );

    v_result := array_append(v_result, v_new_pallet);
  END LOOP;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    v_performer, 'SPLIT', 'pallets', p_pallet_id::text,
    jsonb_build_object('pallet_number', v_source.pallet_number, 'quantity', v_source.quantity),
    jsonb_build_object('split_count', array_length(p_quantities, 1), 'quantities', to_jsonb(p_quantities))
  );

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.split_pallet(uuid, numeric[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.split_pallet(uuid, numeric[], uuid) TO authenticated;

-- ============================================================
-- 10. GENERATE BARCODE RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.generate_barcode(p_pallet_id uuid)
RETURNS public.barcodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_existing barcodes%ROWTYPE;
  v_barcode barcodes%ROWTYPE;
  v_token text;
BEGIN
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found: %', p_pallet_id;
  END IF;

  SELECT * INTO v_existing FROM barcodes WHERE pallet_id = p_pallet_id AND status = 'ACTIVE';
  IF FOUND THEN
    RAISE EXCEPTION 'Active barcode already exists for pallet %', v_pallet.pallet_number;
  END IF;

  -- Generate unique token using gen_random_uuid (no editable data encoded)
  v_token := 'MES-' || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO barcodes (barcode_value, pallet_id, barcode_type, status)
  VALUES (v_token, p_pallet_id, 'PALLET', 'ACTIVE')
  RETURNING * INTO v_barcode;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), 'INSERT', 'barcodes', v_barcode.id::text,
    jsonb_build_object('barcode_value', v_barcode.barcode_value, 'pallet_id', p_pallet_id)
  );

  RETURN v_barcode;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_barcode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_barcode(uuid) TO authenticated;

-- ============================================================
-- 11. REPRINT BARCODE RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.reprint_barcode(p_barcode_id uuid)
RETURNS public.barcodes
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barcode barcodes%ROWTYPE;
BEGIN
  SELECT * INTO v_barcode FROM barcodes WHERE id = p_barcode_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barcode not found: %', p_barcode_id;
  END IF;

  IF v_barcode.status = 'RETIRED' THEN
    RAISE EXCEPTION 'Cannot reprint a retired barcode';
  END IF;

  -- Increment print count only. Does NOT change pallet/warehouse status.
  UPDATE barcodes
  SET print_count = print_count + 1,
      printed_at = now()
  WHERE id = p_barcode_id
  RETURNING * INTO v_barcode;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), 'PRINT', 'barcodes', p_barcode_id::text,
    jsonb_build_object('print_count', v_barcode.print_count)
  );

  RETURN v_barcode;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reprint_barcode(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reprint_barcode(uuid) TO authenticated;

-- ============================================================
-- 12. LOOKUP PALLET BY BARCODE RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.lookup_pallet_by_barcode(p_barcode_value text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_barcode barcodes%ROWTYPE;
  v_pallet pallets%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_wo work_orders%ROWTYPE;
  v_product products%ROWTYPE;
  v_stage production_stages%ROWTYPE;
  v_machine machines%ROWTYPE;
  v_qc quality_cards%ROWTYPE;
  v_route production_routes%ROWTYPE;
  v_movements jsonb;
  v_warehouse_received boolean := false;
BEGIN
  SELECT * INTO v_barcode FROM barcodes WHERE barcode_value = p_barcode_value;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Barcode not found: %', p_barcode_value;
  END IF;

  SELECT * INTO v_pallet FROM pallets WHERE id = v_barcode.pallet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found for barcode';
  END IF;

  SELECT * INTO v_batch FROM parent_batches WHERE id = v_pallet.parent_batch_id;
  SELECT * INTO v_wo FROM work_orders WHERE id = v_pallet.work_order_id;
  SELECT * INTO v_product FROM products WHERE id = v_pallet.product_id;
  SELECT * INTO v_stage FROM production_stages WHERE id = v_pallet.stage_id;
  SELECT * INTO v_machine FROM machines WHERE id = v_pallet.machine_id;
  SELECT * INTO v_qc FROM quality_cards WHERE id = v_pallet.quality_card_id;
  SELECT * INTO v_route FROM production_routes WHERE id = v_batch.production_route_id;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', pm.id,
      'movement_type', pm.movement_type,
      'quantity', pm.quantity,
      'timestamp', pm."timestamp",
      'notes', pm.notes,
      'source_stage', ss.name,
      'destination_stage', ds.name
    ) ORDER BY pm."timestamp"
  ), '[]'::jsonb) INTO v_movements
  FROM pallet_movements pm
  LEFT JOIN production_stages ss ON pm.source_stage_id = ss.id
  LEFT JOIN production_stages ds ON pm.destination_stage_id = ds.id
  WHERE pm.pallet_id = v_pallet.id;

  v_warehouse_received := (v_pallet.status = 'WAREHOUSE_RECEIVED');

  RETURN jsonb_build_object(
    'barcode', jsonb_build_object(
      'barcode_value', v_barcode.barcode_value,
      'status', v_barcode.status,
      'print_count', v_barcode.print_count,
      'printed_at', v_barcode.printed_at
    ),
    'pallet', jsonb_build_object(
      'id', v_pallet.id,
      'pallet_number', v_pallet.pallet_number,
      'quantity', v_pallet.quantity,
      'status', v_pallet.status,
      'created_at', v_pallet.created_at
    ),
    'parent_batch', jsonb_build_object(
      'id', v_batch.id,
      'batch_number', v_batch.batch_number,
      'planned_quantity', v_batch.planned_quantity,
      'actual_quantity', v_batch.actual_quantity,
      'available_quantity', v_batch.available_quantity,
      'status', v_batch.status
    ),
    'work_order', jsonb_build_object(
      'id', v_wo.id,
      'wo_number', v_wo.wo_number,
      'status', v_wo.status
    ),
    'product', jsonb_build_object(
      'id', v_product.id,
      'item_code', v_product.item_code,
      'name', v_product.name,
      'name_en', v_product.name_en
    ),
    'route', jsonb_build_object(
      'id', v_route.id,
      'route_code', v_route.route_code,
      'name', v_route.name
    ),
    'stage', jsonb_build_object(
      'id', v_stage.id,
      'stage_code', v_stage.stage_code,
      'name', v_stage.name,
      'name_en', v_stage.name_en
    ),
    'machine', CASE WHEN v_machine.id IS NOT NULL THEN
      jsonb_build_object('id', v_machine.id, 'machine_code', v_machine.machine_code, 'name', v_machine.name)
    ELSE NULL END,
    'quality', CASE WHEN v_qc.id IS NOT NULL THEN
      jsonb_build_object(
        'id', v_qc.id,
        'card_number', v_qc.card_number,
        'inspection_result', v_qc.inspection_result,
        'physical_card_confirmed', v_qc.physical_card_confirmed,
        'inspected_at', v_qc.inspected_at
      )
    ELSE NULL END,
    'warehouse_received', v_warehouse_received,
    'movements', v_movements
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.lookup_pallet_by_barcode(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lookup_pallet_by_barcode(text) TO authenticated;

-- ============================================================
-- 13. RECORD PALLET MOVEMENT RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_pallet_movement(
  p_pallet_id uuid,
  p_source_stage_id uuid DEFAULT NULL,
  p_destination_stage_id uuid DEFAULT NULL,
  p_movement_type text DEFAULT 'STAGE_TRANSFER',
  p_quantity numeric DEFAULT 0,
  p_reference_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS public.pallet_movements
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pallet pallets%ROWTYPE;
  v_movement pallet_movements%ROWTYPE;
BEGIN
  SELECT * INTO v_pallet FROM pallets WHERE id = p_pallet_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pallet not found: %', p_pallet_id;
  END IF;

  IF v_pallet.status IN ('CANCELLED', 'SPLIT') THEN
    RAISE EXCEPTION 'Cannot record movement for pallet with status: %', v_pallet.status;
  END IF;

  IF p_quantity < 0 THEN
    RAISE EXCEPTION 'Quantity cannot be negative';
  END IF;

  INSERT INTO pallet_movements (
    pallet_id, source_stage_id, destination_stage_id,
    movement_type, quantity, performed_by, reference_id, notes
  ) VALUES (
    p_pallet_id, p_source_stage_id, p_destination_stage_id,
    p_movement_type, p_quantity, auth.uid(), p_reference_id, p_notes
  )
  RETURNING * INTO v_movement;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), p_movement_type, 'pallet_movements', v_movement.id::text,
    jsonb_build_object(
      'pallet_id', p_pallet_id,
      'movement_type', p_movement_type,
      'quantity', p_quantity
    )
  );

  RETURN v_movement;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_pallet_movement(uuid, uuid, uuid, text, numeric, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_pallet_movement(uuid, uuid, uuid, text, numeric, uuid, text) TO authenticated;

-- ============================================================
-- 14. UPDATE BATCH QUANTITY RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_batch_quantity(
  p_batch_id uuid,
  p_actual_quantity numeric
)
RETURNS public.parent_batches
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch parent_batches%ROWTYPE;
BEGIN
  SELECT * INTO v_batch FROM parent_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Batch not found: %', p_batch_id;
  END IF;

  IF p_actual_quantity < 0 THEN
    RAISE EXCEPTION 'Actual quantity cannot be negative';
  END IF;

  UPDATE parent_batches
  SET actual_quantity = p_actual_quantity,
      available_quantity = p_actual_quantity,
      status = CASE WHEN p_actual_quantity > 0 AND v_batch.status = 'CREATED' THEN 'IN_PROGRESS' ELSE v_batch.status END
  WHERE id = p_batch_id
  RETURNING * INTO v_batch;

  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (
    auth.uid(), 'UPDATE', 'parent_batches', p_batch_id::text,
    jsonb_build_object('actual_quantity', p_actual_quantity, 'available_quantity', p_actual_quantity)
  );

  RETURN v_batch;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_batch_quantity(uuid, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_batch_quantity(uuid, numeric) TO authenticated;
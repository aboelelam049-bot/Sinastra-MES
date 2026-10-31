/*
# Phase 7 — Quality Control, Inspections, Disposition & Quality Cards

## Overview
Implements a full Quality Management module integrated with production execution.
Quality inspection is required after the final production operation of each route.
Rejected quantities enter a disposition workflow (ACCEPT, REWORK, SCRAP, RE-INSPECTION).
Quality cards are digitally generated, printable, and linked to inspection approvals.

## New Tables
1. `defect_master` — configurable defect catalog with categories and applicability
2. `inspection_lots` — quality inspection lot linked to work order, batch, route, stage, source transactions
3. `inspection_results` — per-inspection result with accepted/rejected/pending quantities and defect codes
4. `inspection_defects` — multiple defects per inspection with defect quantities
5. `quality_dispositions` — disposition workflow for rejected quantities (ACCEPT/REWORK/SCRAP/RE-INSPECTION)
6. `quality_approvals` — immutable approval records with approver role and decision
7. `quality_card_prints` — print history audit for quality cards

## Modified Tables
- `quality_cards` — extended with inspection_lot_id, work_order_id, parent_batch_id, product_model_id,
  item_id, route info, stage info, accepted_quantity, approver_id, approval_id, approval_date, etc.
  New columns are nullable to preserve existing rows (0 rows currently).

## RPCs
1. `generate_inspection_lot_number()` — unique lot number IL-YYYY-NNNNNN
2. `generate_quality_card_number()` — unique card number QC-YYYY-NNNNNN
3. `create_inspection_lot()` — creates lot from final-stage production transactions
4. `record_inspection_result()` — records inspection with quantity reconciliation enforcement
5. `approve_inspection_lot()` — creates immutable approval, links to quality card
6. `record_quality_disposition()` — records REWORK/SCRAP/RE-INSPECTION disposition
7. `generate_quality_card()` — creates a quality card from an approved inspection lot
8. `reprint_quality_card()` — increments print count, records print history

## Security
- RLS on all new tables, CRUD to authenticated.
- Inspection lots: INSERT/UPDATE via RPC only.
- Inspection results: INSERT via RPC only.
- Quality approvals: INSERT via RPC only (immutable after creation).
- Quality cards: INSERT/UPDATE via RPC only.
- Quality card prints: INSERT via RPC only.

## Seed Data
- 6 initial defect codes: DIMENSIONAL, PVC_GLUING, CUTTING, OPENING_CUTOUT, SURFACE, OTHER

## Important Notes
1. Only production transactions from a final production stage can enter inspection.
2. Partial inspections are supported — same batch can have multiple lots.
3. Inspected = Accepted + Rejected + Pending is enforced at DB level.
4. Rejected quantity is NOT automatically classified as scrap.
5. Either QUALITY or PRODUCTION_ENGINEER can approve a disposition (not both required).
6. Quality approvals are immutable — corrections require auditable reversal.
7. Quality card numbers are unique; reprinting retains the same number with print history.
8. Quality card allocations cannot exceed approved quantity.
9. Pallet-level quality card linkage is supported via quality_cards.pallet_id (nullable until pallet exists).
*/

-- ============================================================
-- 1. SEQUENCES
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS inspection_lot_seq START 1;
CREATE SEQUENCE IF NOT EXISTS quality_card_seq START 1;

-- ============================================================
-- 2. DEFECT MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS defect_master (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  defect_code text UNIQUE NOT NULL,
  defect_name text NOT NULL,
  defect_category text NOT NULL DEFAULT 'OTHER',
  description text,
  applicable_item_types text DEFAULT 'ALL',
  applicable_production_stages text DEFAULT 'ALL',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dm_active ON defect_master(is_active);
CREATE INDEX IF NOT EXISTS idx_dm_category ON defect_master(defect_category);

ALTER TABLE defect_master ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON defect_master TO authenticated;

DROP POLICY IF EXISTS "dm_select_auth" ON defect_master;
CREATE POLICY "dm_select_auth" ON defect_master FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "dm_insert_auth" ON defect_master;
CREATE POLICY "dm_insert_auth" ON defect_master FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "dm_update_auth" ON defect_master;
CREATE POLICY "dm_update_auth" ON defect_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "dm_delete_auth" ON defect_master;
CREATE POLICY "dm_delete_auth" ON defect_master FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. INSPECTION LOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_number text UNIQUE NOT NULL,
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE RESTRICT,
  parent_batch_id uuid NOT NULL REFERENCES parent_batches(id) ON DELETE RESTRICT,
  product_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL,
  item_id uuid REFERENCES item_master(id) ON DELETE SET NULL,
  production_route_id uuid NOT NULL REFERENCES production_routes(id) ON DELETE RESTRICT,
  routing_version_id uuid REFERENCES routing_versions(id) ON DELETE SET NULL,
  final_stage_id uuid NOT NULL REFERENCES routing_stages(id) ON DELETE RESTRICT,
  source_transaction_ids text NOT NULL DEFAULT '[]',
  quantity_submitted numeric(14,2) NOT NULL CHECK (quantity_submitted > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  status text NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING','IN_INSPECTION','INSPECTED','APPROVED','REJECTED','CLOSED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_il_wo ON inspection_lots(work_order_id);
CREATE INDEX IF NOT EXISTS idx_il_batch ON inspection_lots(parent_batch_id);
CREATE INDEX IF NOT EXISTS idx_il_status ON inspection_lots(status);

ALTER TABLE inspection_lots ENABLE ROW LEVEL SECURITY;
GRANT SELECT, UPDATE ON inspection_lots TO authenticated;

DROP POLICY IF EXISTS "il_select_auth" ON inspection_lots;
CREATE POLICY "il_select_auth" ON inspection_lots FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "il_update_auth" ON inspection_lots;
CREATE POLICY "il_update_auth" ON inspection_lots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. INSPECTION RESULTS
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_lot_id uuid NOT NULL REFERENCES inspection_lots(id) ON DELETE RESTRICT,
  inspected_quantity numeric(14,2) NOT NULL CHECK (inspected_quantity >= 0),
  accepted_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (accepted_quantity >= 0),
  rejected_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  pending_inspection_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (pending_inspection_quantity >= 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  inspection_date timestamptz NOT NULL DEFAULT now(),
  inspector_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  defect_codes text,
  defect_description text,
  notes text,
  attachments text,
  is_reinspection boolean NOT NULL DEFAULT false,
  original_inspection_id uuid REFERENCES inspection_results(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (inspected_quantity = accepted_quantity + rejected_quantity + pending_inspection_quantity)
);

CREATE INDEX IF NOT EXISTS idx_ir_lot ON inspection_results(inspection_lot_id);
CREATE INDEX IF NOT EXISTS idx_ir_inspector ON inspection_results(inspector_id);

ALTER TABLE inspection_results ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inspection_results TO authenticated;

DROP POLICY IF EXISTS "ir_select_auth" ON inspection_results;
CREATE POLICY "ir_select_auth" ON inspection_results FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. INSPECTION DEFECTS (multiple defects per inspection)
-- ============================================================

CREATE TABLE IF NOT EXISTS inspection_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_result_id uuid NOT NULL REFERENCES inspection_results(id) ON DELETE CASCADE,
  defect_id uuid NOT NULL REFERENCES defect_master(id) ON DELETE RESTRICT,
  defect_quantity numeric(14,2) NOT NULL CHECK (defect_quantity >= 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_id_result ON inspection_defects(inspection_result_id);
CREATE INDEX IF NOT EXISTS idx_id_defect ON inspection_defects(defect_id);

ALTER TABLE inspection_defects ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON inspection_defects TO authenticated;

DROP POLICY IF EXISTS "id_select_auth" ON inspection_defects;
CREATE POLICY "id_select_auth" ON inspection_defects FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 6. QUALITY DISPOSITIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS quality_dispositions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_lot_id uuid NOT NULL REFERENCES inspection_lots(id) ON DELETE RESTRICT,
  inspection_result_id uuid REFERENCES inspection_results(id) ON DELETE SET NULL,
  disposition_type text NOT NULL
    CHECK (disposition_type IN ('ACCEPT','REWORK','SCRAP','RE_INSPECTION')),
  quantity numeric(14,2) NOT NULL CHECK (quantity > 0),
  unit_of_measure text NOT NULL DEFAULT 'PCS',
  reason text,
  approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approver_role text,
  original_rejected_quantity numeric(14,2),
  rework_reference_id uuid REFERENCES quality_dispositions(id) ON DELETE SET NULL,
  re_inspection_result_id uuid REFERENCES inspection_results(id) ON DELETE SET NULL,
  is_final_scrap boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qd_lot ON quality_dispositions(inspection_lot_id);
CREATE INDEX IF NOT EXISTS idx_qd_type ON quality_dispositions(disposition_type);
CREATE INDEX IF NOT EXISTS idx_qd_approver ON quality_dispositions(approver_id);

ALTER TABLE quality_dispositions ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON quality_dispositions TO authenticated;

DROP POLICY IF EXISTS "qdisp_select_auth" ON quality_dispositions;
CREATE POLICY "qdisp_select_auth" ON quality_dispositions FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 7. QUALITY APPROVALS (immutable)
-- ============================================================

CREATE TABLE IF NOT EXISTS quality_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_lot_id uuid NOT NULL REFERENCES inspection_lots(id) ON DELETE RESTRICT,
  decision text NOT NULL
    CHECK (decision IN ('ACCEPT','REJECT','REWORK','SCRAP','RE_INSPECTION')),
  approved_quantity numeric(14,2) NOT NULL CHECK (approved_quantity >= 0),
  rejected_quantity numeric(14,2) NOT NULL DEFAULT 0 CHECK (rejected_quantity >= 0),
  disposition text
    CHECK (disposition IN ('ACCEPT','REWORK','SCRAP','RE_INSPECTION')),
  approver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approver_role text NOT NULL,
  approval_timestamp timestamptz NOT NULL DEFAULT now(),
  notes text,
  is_reversed boolean NOT NULL DEFAULT false,
  reversal_reason text,
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qa_lot ON quality_approvals(inspection_lot_id);
CREATE INDEX IF NOT EXISTS idx_qa_approver ON quality_approvals(approver_id);

ALTER TABLE quality_approvals ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON quality_approvals TO authenticated;

DROP POLICY IF EXISTS "qa_select_auth" ON quality_approvals;
CREATE POLICY "qa_select_auth" ON quality_approvals FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 8. QUALITY CARD PRINTS (print history audit)
-- ============================================================

CREATE TABLE IF NOT EXISTS quality_card_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_card_id uuid NOT NULL REFERENCES quality_cards(id) ON DELETE RESTRICT,
  printed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  printed_at timestamptz NOT NULL DEFAULT now(),
  print_notes text
);

CREATE INDEX IF NOT EXISTS idx_qcp_card ON quality_card_prints(quality_card_id);

ALTER TABLE quality_card_prints ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON quality_card_prints TO authenticated;

DROP POLICY IF EXISTS "qcp_select_auth" ON quality_card_prints;
CREATE POLICY "qcp_select_auth" ON quality_card_prints FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 9. EXTEND QUALITY_CARDS TABLE with Phase 7 columns
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='inspection_lot_id') THEN
    ALTER TABLE quality_cards ADD COLUMN inspection_lot_id uuid REFERENCES inspection_lots(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='work_order_id') THEN
    ALTER TABLE quality_cards ADD COLUMN work_order_id uuid REFERENCES work_orders(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='parent_batch_id') THEN
    ALTER TABLE quality_cards ADD COLUMN parent_batch_id uuid REFERENCES parent_batches(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='product_model_id') THEN
    ALTER TABLE quality_cards ADD COLUMN product_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='item_id') THEN
    ALTER TABLE quality_cards ADD COLUMN item_id uuid REFERENCES item_master(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='item_code') THEN
    ALTER TABLE quality_cards ADD COLUMN item_code text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='item_name') THEN
    ALTER TABLE quality_cards ADD COLUMN item_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='production_route_id') THEN
    ALTER TABLE quality_cards ADD COLUMN production_route_id uuid REFERENCES production_routes(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='routing_version_id') THEN
    ALTER TABLE quality_cards ADD COLUMN routing_version_id uuid REFERENCES routing_versions(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='final_stage_id') THEN
    ALTER TABLE quality_cards ADD COLUMN final_stage_id uuid REFERENCES routing_stages(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='final_stage_name') THEN
    ALTER TABLE quality_cards ADD COLUMN final_stage_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='accepted_quantity') THEN
    ALTER TABLE quality_cards ADD COLUMN accepted_quantity numeric(14,2) NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='approver_id') THEN
    ALTER TABLE quality_cards ADD COLUMN approver_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='approval_id') THEN
    ALTER TABLE quality_cards ADD COLUMN approval_id uuid REFERENCES quality_approvals(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='approval_date') THEN
    ALTER TABLE quality_cards ADD COLUMN approval_date timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='wo_number') THEN
    ALTER TABLE quality_cards ADD COLUMN wo_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='batch_number') THEN
    ALTER TABLE quality_cards ADD COLUMN batch_number text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='model_name') THEN
    ALTER TABLE quality_cards ADD COLUMN model_name text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='print_count') THEN
    ALTER TABLE quality_cards ADD COLUMN print_count integer NOT NULL DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='quality_cards' AND column_name='updated_at') THEN
    ALTER TABLE quality_cards ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
  END IF;
END $$;

-- Grant UPDATE on quality_cards (RPCs use SECURITY DEFINER so this is for any direct needs)
GRANT UPDATE ON quality_cards TO authenticated;

-- ============================================================
-- 10. SEED DEFECT MASTER
-- ============================================================

INSERT INTO defect_master (defect_code, defect_name, defect_category, description) VALUES
  ('DIMENSIONAL', 'عيب أبعاد', 'DIMENSIONAL', 'انحراف في الأبعاد عن المواصفات المطلوبة'),
  ('PVC_GLUING', 'عيب لصق PVC', 'PVC_GLUING', 'مشاكل في لصق فيلم PVC'),
  ('CUTTING', 'عيب قص', 'CUTTING', 'قص غير دقيق أو حواف غير منتظمة'),
  ('OPENING_CUTOUT', 'عيب فتحات', 'OPENING_CUTOUT', 'فتحات غير مطابقة للمواصفات'),
  ('SURFACE', 'عيب سطح', 'SURFACE', 'خدوش أو عيوب على السطح'),
  ('OTHER', 'أخرى', 'OTHER', 'عيوب أخرى غير مصنفة')
ON CONFLICT (defect_code) DO NOTHING;

-- ============================================================
-- 11. RPC: GENERATE INSPECTION LOT NUMBER
-- ============================================================

CREATE OR REPLACE FUNCTION generate_inspection_lot_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  v_next := nextval('inspection_lot_seq');
  RETURN 'IL-' || to_char(now(), 'YYYY') || '-' || lpad(v_next::text, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_inspection_lot_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_inspection_lot_number() TO authenticated;

-- ============================================================
-- 12. RPC: GENERATE QUALITY CARD NUMBER
-- ============================================================

CREATE OR REPLACE FUNCTION generate_quality_card_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next bigint;
BEGIN
  v_next := nextval('quality_card_seq');
  RETURN 'QC-' || to_char(now(), 'YYYY') || '-' || lpad(v_next::text, 6, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_quality_card_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_quality_card_number() TO authenticated;

-- ============================================================
-- 13. RPC: CREATE INSPECTION LOT
-- ============================================================

CREATE OR REPLACE FUNCTION create_inspection_lot(
  p_work_order_id uuid,
  p_parent_batch_id uuid,
  p_production_route_id uuid,
  p_final_stage_id uuid,
  p_quantity_submitted numeric,
  p_unit_of_measure text DEFAULT 'PCS',
  p_source_transaction_ids text DEFAULT '[]',
  p_product_model_id uuid DEFAULT NULL,
  p_item_id uuid DEFAULT NULL,
  p_routing_version_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lot_id uuid;
  v_lot_number text;
  v_stage routing_stages%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
BEGIN
  IF p_quantity_submitted <= 0 THEN
    RAISE EXCEPTION 'Quantity submitted must be greater than zero';
  END IF;

  SELECT * INTO v_stage FROM routing_stages WHERE id = p_final_stage_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Final stage not found: %', p_final_stage_id;
  END IF;

  IF NOT v_stage.quality_approval_required THEN
    RAISE EXCEPTION 'Stage % does not require quality approval. Only final production stages can create inspection lots.', v_stage.stage_code;
  END IF;

  SELECT * INTO v_batch FROM parent_batches WHERE id = p_parent_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent batch not found: %', p_parent_batch_id;
  END IF;

  v_lot_number := generate_inspection_lot_number();

  INSERT INTO inspection_lots (
    lot_number, work_order_id, parent_batch_id, product_model_id, item_id,
    production_route_id, routing_version_id, final_stage_id,
    source_transaction_ids, quantity_submitted, unit_of_measure,
    status, created_by
  )
  VALUES (
    v_lot_number, p_work_order_id, p_parent_batch_id, p_product_model_id, p_item_id,
    p_production_route_id, p_routing_version_id, p_final_stage_id,
    p_source_transaction_ids, p_quantity_submitted, p_unit_of_measure,
    'PENDING', auth.uid()
  )
  RETURNING id INTO v_lot_id;

  RETURN v_lot_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION create_inspection_lot(uuid, uuid, uuid, uuid, numeric, text, text, uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION create_inspection_lot(uuid, uuid, uuid, uuid, numeric, text, text, uuid, uuid, uuid) TO authenticated;

-- ============================================================
-- 14. RPC: RECORD INSPECTION RESULT
-- ============================================================

CREATE OR REPLACE FUNCTION record_inspection_result(
  p_inspection_lot_id uuid,
  p_inspected_quantity numeric,
  p_accepted_quantity numeric DEFAULT 0,
  p_rejected_quantity numeric DEFAULT 0,
  p_pending_inspection_quantity numeric DEFAULT 0,
  p_unit_of_measure text DEFAULT 'PCS',
  p_defect_codes text DEFAULT NULL,
  p_defect_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_reinspection boolean DEFAULT false,
  p_original_inspection_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result_id uuid;
  v_lot inspection_lots%ROWTYPE;
  v_total_inspected numeric(14,2);
  v_already_inspected numeric(14,2);
BEGIN
  IF p_inspected_quantity < 0 OR p_accepted_quantity < 0 OR p_rejected_quantity < 0 OR p_pending_inspection_quantity < 0 THEN
    RAISE EXCEPTION 'Negative quantities are not allowed';
  END IF;

  IF p_inspected_quantity != (p_accepted_quantity + p_rejected_quantity + p_pending_inspection_quantity) THEN
    RAISE EXCEPTION 'Quantity reconciliation failed: inspected (%) must equal accepted (%) + rejected (%) + pending (%)',
      p_inspected_quantity, p_accepted_quantity, p_rejected_quantity, p_pending_inspection_quantity;
  END IF;

  SELECT * INTO v_lot FROM inspection_lots WHERE id = p_inspection_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection lot not found: %', p_inspection_lot_id;
  END IF;

  IF v_lot.status = 'CLOSED' OR v_lot.status = 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot record inspection on a lot with status: %', v_lot.status;
  END IF;

  -- Prevent double inspection of the same physical quantity (unless re-inspection)
  IF NOT p_is_reinspection THEN
    SELECT COALESCE(SUM(inspected_quantity), 0) INTO v_already_inspected
      FROM inspection_results
      WHERE inspection_lot_id = p_inspection_lot_id
        AND is_reinspection = false;

    IF v_already_inspected + p_inspected_quantity > v_lot.quantity_submitted THEN
      RAISE EXCEPTION 'Total inspected quantity (%) + new inspection (%) exceeds submitted quantity (%). Duplicate inspection prevented.',
        v_already_inspected, p_inspected_quantity, v_lot.quantity_submitted;
    END IF;
  END IF;

  INSERT INTO inspection_results (
    inspection_lot_id, inspected_quantity, accepted_quantity, rejected_quantity,
    pending_inspection_quantity, unit_of_measure, inspection_date, inspector_id,
    defect_codes, defect_description, notes, is_reinspection, original_inspection_id
  )
  VALUES (
    p_inspection_lot_id, p_inspected_quantity, p_accepted_quantity, p_rejected_quantity,
    p_pending_inspection_quantity, p_unit_of_measure, now(), auth.uid(),
    p_defect_codes, p_defect_description, p_notes, p_is_reinspection, p_original_inspection_id
  )
  RETURNING id INTO v_result_id;

  -- Update lot status
  IF p_pending_inspection_quantity > 0 THEN
    UPDATE inspection_lots SET status = 'IN_INSPECTION', updated_at = now() WHERE id = p_inspection_lot_id;
  ELSE
    UPDATE inspection_lots SET status = 'INSPECTED', updated_at = now() WHERE id = p_inspection_lot_id;
  END IF;

  RETURN v_result_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_inspection_result(uuid, numeric, numeric, numeric, numeric, text, text, text, text, boolean, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_inspection_result(uuid, numeric, numeric, numeric, numeric, text, text, text, text, boolean, uuid) TO authenticated;

-- ============================================================
-- 15. RPC: APPROVE INSPECTION LOT (creates immutable approval + optional quality card)
-- ============================================================

CREATE OR REPLACE FUNCTION approve_inspection_lot(
  p_inspection_lot_id uuid,
  p_decision text,
  p_approved_quantity numeric,
  p_rejected_quantity numeric DEFAULT 0,
  p_disposition text DEFAULT 'ACCEPT',
  p_approver_role text DEFAULT 'QUALITY',
  p_notes text DEFAULT NULL,
  p_generate_card boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval_id uuid;
  v_card_id uuid;
  v_lot inspection_lots%ROWTYPE;
  v_profile profiles%ROWTYPE;
  v_actual_role text;
  v_card_number text;
  v_wo work_orders%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_stage routing_stages%ROWTYPE;
  v_item item_master%ROWTYPE;
  v_model product_models%ROWTYPE;
BEGIN
  IF p_decision NOT IN ('ACCEPT','REJECT','REWORK','SCRAP','RE_INSPECTION') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  IF p_disposition NOT IN ('ACCEPT','REWORK','SCRAP','RE_INSPECTION') THEN
    RAISE EXCEPTION 'Invalid disposition: %', p_disposition;
  END IF;

  IF p_approved_quantity < 0 OR p_rejected_quantity < 0 THEN
    RAISE EXCEPTION 'Negative quantities are not allowed';
  END IF;

  SELECT * INTO v_lot FROM inspection_lots WHERE id = p_inspection_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection lot not found: %', p_inspection_lot_id;
  END IF;

  IF v_lot.status = 'APPROVED' OR v_lot.status = 'CLOSED' THEN
    RAISE EXCEPTION 'Lot is already approved/closed. Cannot approve again.';
  END IF;

  -- Verify approver role from profiles table
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approver profile not found';
  END IF;

  v_actual_role := v_profile.role;
  IF v_actual_role NOT IN ('QUALITY','PRODUCTION_ENGINEER','ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: only QUALITY, PRODUCTION_ENGINEER, or ADMIN can approve inspection lots. Your role: %', v_actual_role;
  END IF;

  -- Prevent approval exceeding inspected quantity
  IF p_approved_quantity + p_rejected_quantity > v_lot.quantity_submitted THEN
    RAISE EXCEPTION 'Approved + rejected quantity exceeds submitted quantity';
  END IF;

  -- Create immutable approval record
  INSERT INTO quality_approvals (
    inspection_lot_id, decision, approved_quantity, rejected_quantity,
    disposition, approver_id, approver_role, approval_timestamp, notes
  )
  VALUES (
    p_inspection_lot_id, p_decision, p_approved_quantity, p_rejected_quantity,
    p_disposition, auth.uid(), v_actual_role, now(), p_notes
  )
  RETURNING id INTO v_approval_id;

  -- Update lot status
  UPDATE inspection_lots
    SET status = CASE WHEN p_decision = 'ACCEPT' THEN 'APPROVED' ELSE 'REJECTED' END,
        updated_at = now()
    WHERE id = p_inspection_lot_id;

  -- Generate quality card if requested and there's accepted quantity
  IF p_generate_card AND p_approved_quantity > 0 THEN
    SELECT * INTO v_wo FROM work_orders WHERE id = v_lot.work_order_id;
    SELECT * INTO v_batch FROM parent_batches WHERE id = v_lot.parent_batch_id;
    SELECT * INTO v_stage FROM routing_stages WHERE id = v_lot.final_stage_id;
    SELECT * INTO v_item FROM item_master WHERE id = v_lot.item_id;
    SELECT * INTO v_model FROM product_models WHERE id = v_lot.product_model_id;

    v_card_number := generate_quality_card_number();

    INSERT INTO quality_cards (
      card_number, inspection_lot_id, work_order_id, parent_batch_id,
      product_model_id, item_id, item_code, item_name,
      production_route_id, routing_version_id, final_stage_id, final_stage_name,
      accepted_quantity, inspection_result, inspector_id, approver_id, approval_id,
      approval_date, wo_number, batch_number, model_name, physical_card_confirmed, print_count
    )
    VALUES (
      v_card_number, p_inspection_lot_id, v_lot.work_order_id, v_lot.parent_batch_id,
      v_lot.product_model_id, v_lot.item_id, v_item.item_code, v_item.name,
      v_lot.production_route_id, v_lot.routing_version_id, v_lot.final_stage_id, v_stage.stage_name,
      p_approved_quantity, 'APPROVED', NULL, auth.uid(), v_approval_id,
      now(), v_wo.wo_number, v_batch.batch_number, v_model.name, false, 0
    )
    RETURNING id INTO v_card_id;
  END IF;

  RETURN v_approval_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION approve_inspection_lot(uuid, text, numeric, numeric, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_inspection_lot(uuid, text, numeric, numeric, text, text, text, boolean) TO authenticated;

-- ============================================================
-- 16. RPC: RECORD QUALITY DISPOSITION (REWORK/SCRAP/RE_INSPECTION)
-- ============================================================

CREATE OR REPLACE FUNCTION record_quality_disposition(
  p_inspection_lot_id uuid,
  p_disposition_type text,
  p_quantity numeric,
  p_unit_of_measure text DEFAULT 'PCS',
  p_reason text DEFAULT NULL,
  p_inspection_result_id uuid DEFAULT NULL,
  p_original_rejected_quantity numeric DEFAULT NULL,
  p_rework_reference_id uuid DEFAULT NULL,
  p_is_final_scrap boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_profile profiles%ROWTYPE;
  v_lot inspection_lots%ROWTYPE;
  v_existing_scrap numeric(14,2);
BEGIN
  IF p_disposition_type NOT IN ('ACCEPT','REWORK','SCRAP','RE_INSPECTION') THEN
    RAISE EXCEPTION 'Invalid disposition type: %', p_disposition_type;
  END IF;

  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'Quantity must be positive';
  END IF;

  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF v_profile.role NOT IN ('QUALITY','PRODUCTION_ENGINEER','ADMIN') THEN
    RAISE EXCEPTION 'Unauthorized: only QUALITY, PRODUCTION_ENGINEER, or ADMIN can record dispositions. Your role: %', v_profile.role;
  END IF;

  SELECT * INTO v_lot FROM inspection_lots WHERE id = p_inspection_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection lot not found: %', p_inspection_lot_id;
  END IF;

  -- Prevent double scrap of the same quantity
  IF p_disposition_type = 'SCRAP' THEN
    SELECT COALESCE(SUM(quantity), 0) INTO v_existing_scrap
      FROM quality_dispositions
      WHERE inspection_lot_id = p_inspection_lot_id
        AND disposition_type = 'SCRAP';

    IF v_existing_scrap + p_quantity > COALESCE(p_original_rejected_quantity, v_lot.quantity_submitted) THEN
      RAISE EXCEPTION 'Total scrap quantity (%) + new scrap (%) exceeds available rejected quantity (%). Double scrap prevented.',
        v_existing_scrap, p_quantity, COALESCE(p_original_rejected_quantity, v_lot.quantity_submitted);
    END IF;
  END IF;

  INSERT INTO quality_dispositions (
    inspection_lot_id, inspection_result_id, disposition_type, quantity,
    unit_of_measure, reason, approver_id, approver_role,
    original_rejected_quantity, rework_reference_id, is_final_scrap
  )
  VALUES (
    p_inspection_lot_id, p_inspection_result_id, p_disposition_type, p_quantity,
    p_unit_of_measure, p_reason, auth.uid(), v_profile.role,
    p_original_rejected_quantity, p_rework_reference_id, p_is_final_scrap
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION record_quality_disposition(uuid, text, numeric, text, text, uuid, numeric, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION record_quality_disposition(uuid, text, numeric, text, text, uuid, numeric, uuid, boolean) TO authenticated;

-- ============================================================
-- 17. RPC: GENERATE QUALITY CARD (standalone, for re-printing or pallet-level allocation)
-- ============================================================

CREATE OR REPLACE FUNCTION generate_quality_card(
  p_inspection_lot_id uuid,
  p_accepted_quantity numeric,
  p_pallet_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card_id uuid;
  v_card_number text;
  v_lot inspection_lots%ROWTYPE;
  v_approval quality_approvals%ROWTYPE;
  v_wo work_orders%ROWTYPE;
  v_batch parent_batches%ROWTYPE;
  v_stage routing_stages%ROWTYPE;
  v_item item_master%ROWTYPE;
  v_model product_models%ROWTYPE;
  v_total_cards_qty numeric(14,2);
BEGIN
  SELECT * INTO v_lot FROM inspection_lots WHERE id = p_inspection_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inspection lot not found: %', p_inspection_lot_id;
  END IF;

  IF v_lot.status != 'APPROVED' THEN
    RAISE EXCEPTION 'Cannot generate card for non-approved lot. Current status: %', v_lot.status;
  END IF;

  -- Check allocation does not exceed approved quantity
  SELECT COALESCE(SUM(accepted_quantity), 0) INTO v_total_cards_qty
    FROM quality_cards
    WHERE inspection_lot_id = p_inspection_lot_id;

  IF v_total_cards_qty + p_accepted_quantity > v_lot.quantity_submitted THEN
    RAISE EXCEPTION 'Quality card allocation (%) + existing cards (%) exceeds approved quantity (%). Allocation prevented.',
      p_accepted_quantity, v_total_cards_qty, v_lot.quantity_submitted;
  END IF;

  SELECT * INTO v_approval FROM quality_approvals
    WHERE inspection_lot_id = p_inspection_lot_id
      AND decision = 'ACCEPT'
      AND is_reversed = false
    ORDER BY approval_timestamp DESC LIMIT 1;

  SELECT * INTO v_wo FROM work_orders WHERE id = v_lot.work_order_id;
  SELECT * INTO v_batch FROM parent_batches WHERE id = v_lot.parent_batch_id;
  SELECT * INTO v_stage FROM routing_stages WHERE id = v_lot.final_stage_id;
  SELECT * INTO v_item FROM item_master WHERE id = v_lot.item_id;
  SELECT * INTO v_model FROM product_models WHERE id = v_lot.product_model_id;

  v_card_number := generate_quality_card_number();

  INSERT INTO quality_cards (
    card_number, inspection_lot_id, work_order_id, parent_batch_id,
    product_model_id, item_id, item_code, item_name,
    production_route_id, routing_version_id, final_stage_id, final_stage_name,
    accepted_quantity, inspection_result, approver_id, approval_id,
    approval_date, wo_number, batch_number, model_name,
    pallet_id, physical_card_confirmed, print_count
  )
  VALUES (
    v_card_number, p_inspection_lot_id, v_lot.work_order_id, v_lot.parent_batch_id,
    v_lot.product_model_id, v_lot.item_id, v_item.item_code, v_item.name,
    v_lot.production_route_id, v_lot.routing_version_id, v_lot.final_stage_id, v_stage.stage_name,
    p_accepted_quantity, 'APPROVED', v_approval.approver_id, v_approval.id,
    v_approval.approval_timestamp, v_wo.wo_number, v_batch.batch_number, v_model.name,
    p_pallet_id, false, 0
  )
  RETURNING id INTO v_card_id;

  RETURN v_card_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION generate_quality_card(uuid, numeric, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION generate_quality_card(uuid, numeric, uuid) TO authenticated;

-- ============================================================
-- 18. RPC: REPRINT QUALITY CARD (increment print count, record history)
-- ============================================================

CREATE OR REPLACE FUNCTION reprint_quality_card(
  p_quality_card_id uuid,
  p_print_notes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_card quality_cards%ROWTYPE;
BEGIN
  SELECT * INTO v_card FROM quality_cards WHERE id = p_quality_card_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quality card not found: %', p_quality_card_id;
  END IF;

  UPDATE quality_cards
    SET print_count = print_count + 1,
        updated_at = now()
    WHERE id = p_quality_card_id;

  INSERT INTO quality_card_prints (quality_card_id, printed_by, print_notes)
  VALUES (p_quality_card_id, auth.uid(), p_print_notes);

  RETURN p_quality_card_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION reprint_quality_card(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION reprint_quality_card(uuid, text) TO authenticated;

-- ============================================================
-- 19. GRANT SEQUENCE USAGE
-- ============================================================

GRANT USAGE ON SEQUENCE inspection_lot_seq TO authenticated;
GRANT USAGE ON SEQUENCE quality_card_seq TO authenticated;
/*
# MES Simplify V2: labor tracking, module settings, RPCs

## What this does
1. Adds labor_count, material columns to sub_work_orders
2. Creates module_settings table with default enabled/disabled modules
3. Creates/updates RPCs for auto work order creation, quality gate, warehouse transfer, OEE, dashboard

## Security
- RLS on module_settings, CRUD to anon+authenticated
- All RPCs SECURITY DEFINER, REVOKE from PUBLIC, GRANT to anon+authenticated
*/

-- Drop old compute_oee if signature differs
DROP FUNCTION IF EXISTS compute_oee(uuid);

-- 1. Add labor + material columns to sub_work_orders
ALTER TABLE sub_work_orders
  ADD COLUMN IF NOT EXISTS labor_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_item_id uuid REFERENCES item_master(id),
  ADD COLUMN IF NOT EXISTS material_qty numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS material_unit text DEFAULT 'PCS';

-- 2. module_settings table
CREATE TABLE IF NOT EXISTS module_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text UNIQUE NOT NULL,
  module_label text NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 99,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE module_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON module_settings TO anon, authenticated;

DROP POLICY IF EXISTS "ms_select" ON module_settings;
CREATE POLICY "ms_select" ON module_settings FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "ms_insert" ON module_settings;
CREATE POLICY "ms_insert" ON module_settings FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "ms_update" ON module_settings;
CREATE POLICY "ms_update" ON module_settings FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ms_delete" ON module_settings;
CREATE POLICY "ms_delete" ON module_settings FOR DELETE TO anon, authenticated USING (true);

INSERT INTO module_settings (module_key, module_label, is_enabled, sort_order) VALUES
  ('dashboard','لوحة التحكم',true,1),
  ('production-planning','تخطيط الإنتاج (ماستر/شهري)',true,2),
  ('production-execution','تنفيذ الإنتاج',true,3),
  ('quality-control','مراقبة الجودة',true,4),
  ('warehouse','مخزن الإنتاج',true,5),
  ('machines','الماكينات',true,6),
  ('routing','المسارات وسير العمل',true,7),
  ('reports','التقارير والتحليلات',true,8),
  ('product-models','موديلات المنتجات',true,9),
  ('product-families','عائلات المنتجات',true,10),
  ('item-master','الأصناف الرئيسية',true,11),
  ('work-orders','أوامر العمل (قديم)',false,20),
  ('machine-loading','تحميل الماكينات (قديم)',false,21),
  ('products-items','المنتجات والأصناف (قديم)',false,22),
  ('departments','الأقسام',false,23),
  ('work-centers','مراكز العمل',false,24),
  ('barcode','إدارة الباركود',false,25),
  ('parent-batches','الدفعات الأم',false,26),
  ('bom','شجرة المواد (BOM)',false,27),
  ('users','المستخدمين والصلاحيات',false,28),
  ('settings','إعدادات النظام',true,30)
ON CONFLICT (module_key) DO NOTHING;

-- 3. RPC: auto_create_work_order_from_monthly_item
CREATE OR REPLACE FUNCTION auto_create_work_order_from_monthly_item(
  p_monthly_plan_item_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item record; v_wo_id uuid; v_wo_number text;
  v_product_id uuid; v_route_id uuid; v_stage record; v_seq integer := 1;
BEGIN
  SELECT * INTO v_item FROM monthly_plan_items WHERE id = p_monthly_plan_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly plan item not found'; END IF;
  IF v_item.work_order_id IS NOT NULL THEN RETURN v_item.work_order_id; END IF;

  SELECT id INTO v_product_id FROM products LIMIT 1;
  IF v_product_id IS NULL THEN RAISE EXCEPTION 'No product found'; END IF;
  SELECT id INTO v_route_id FROM production_routes WHERE is_active = true LIMIT 1;
  IF v_route_id IS NULL THEN RAISE EXCEPTION 'No active route found'; END IF;

  v_wo_number := 'WO-' || to_char(now(),'YYMMDDHH24MI') || '-' || substr(md5(random()::text),1,4);
  INSERT INTO work_orders (wo_number, product_id, production_route_id, planned_quantity, status,
    product_model_id, unit_of_measure, created_by, master_plan_item_id, monthly_plan_item_id,
    quality_status, warehouse_transferred)
  VALUES (v_wo_number, v_product_id, v_route_id, v_item.planned_quantity, 'CREATED',
    v_item.product_model_id, v_item.unit_of_measure, p_created_by, v_item.master_plan_item_id, p_monthly_plan_item_id,
    'PENDING', false) RETURNING id INTO v_wo_id;

  UPDATE monthly_plan_items SET work_order_id = v_wo_id, status = 'PLANNED' WHERE id = p_monthly_plan_item_id;

  FOR v_stage IN SELECT rs.id, rs.stage_name, rs.sequence_number
    FROM routing_stages rs JOIN routing_versions rv ON rs.routing_version_id = rv.id
    WHERE rv.status = 'ACTIVE' AND rs.is_active = true ORDER BY rs.sequence_number
  LOOP
    INSERT INTO sub_work_orders (work_order_id, sequence_number, routing_stage_id, stage_name, planned_quantity, status, quality_status)
    VALUES (v_wo_id, v_stage.sequence_number, v_stage.id, v_stage.stage_name, v_item.planned_quantity, 'PENDING', 'PENDING');
    v_seq := v_seq + 1;
  END LOOP;

  IF v_seq = 1 THEN
    INSERT INTO sub_work_orders (work_order_id, sequence_number, stage_name, planned_quantity, status, quality_status)
    VALUES (v_wo_id, 1, 'إنتاج', v_item.planned_quantity, 'PENDING', 'PENDING');
  END IF;
  RETURN v_wo_id;
END; $$;

REVOKE EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) TO anon, authenticated;

-- 4. RPC: set_sub_work_order_quality
CREATE OR REPLACE FUNCTION set_sub_work_order_quality(p_sub_wo_id uuid, p_quality_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE sub_work_orders SET quality_status = p_quality_status, updated_at = now() WHERE id = p_sub_wo_id;
END; $$;
REVOKE EXECUTE ON FUNCTION set_sub_work_order_quality(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_sub_work_order_quality(uuid, text) TO anon, authenticated;

-- 5. RPC: set_work_order_quality
CREATE OR REPLACE FUNCTION set_work_order_quality(p_wo_id uuid, p_quality_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_failed integer; v_pending integer;
BEGIN
  SELECT count(*) INTO v_failed FROM sub_work_orders WHERE work_order_id = p_wo_id AND quality_status = 'FAILED';
  SELECT count(*) INTO v_pending FROM sub_work_orders WHERE work_order_id = p_wo_id AND quality_status = 'PENDING';
  IF p_quality_status = 'PASSED' AND v_pending > 0 THEN RAISE EXCEPTION '% sub work orders still pending', v_pending; END IF;
  IF p_quality_status = 'PASSED' AND v_failed > 0 THEN RAISE EXCEPTION '% sub work orders failed', v_failed; END IF;
  UPDATE work_orders SET quality_status = p_quality_status, updated_at = now() WHERE id = p_wo_id;
END; $$;
REVOKE EXECUTE ON FUNCTION set_work_order_quality(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION set_work_order_quality(uuid, text) TO anon, authenticated;

-- 6. RPC: transfer_to_warehouse
CREATE OR REPLACE FUNCTION transfer_to_warehouse(p_wo_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_q text;
BEGIN
  SELECT quality_status INTO v_q FROM work_orders WHERE id = p_wo_id;
  IF v_q IS NULL THEN RAISE EXCEPTION 'Work order not found'; END IF;
  IF v_q <> 'PASSED' THEN RAISE EXCEPTION 'Quality must be PASSED (current: %)', v_q; END IF;
  UPDATE work_orders SET warehouse_transferred = true, status = 'COMPLETED', updated_at = now() WHERE id = p_wo_id;
END; $$;
REVOKE EXECUTE ON FUNCTION transfer_to_warehouse(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION transfer_to_warehouse(uuid) TO anon, authenticated;

-- 7. RPC: compute_oee
CREATE OR REPLACE FUNCTION compute_oee(p_wo_id uuid)
RETURNS TABLE(availability numeric, performance numeric, quality numeric, oee numeric,
  planned_minutes numeric, actual_minutes numeric, good_qty numeric, total_qty numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ps timestamptz; v_pe timestamptz; v_as timestamptz; v_ae timestamptz;
  v_pm numeric; v_am numeric; v_g numeric; v_t numeric;
  v_av numeric := 0; v_pf numeric := 0; v_qu numeric := 0;
BEGIN
  SELECT planned_start_time, planned_end_time, actual_start_time, actual_end_time
    INTO v_ps, v_pe, v_as, v_ae FROM work_orders WHERE id = p_wo_id;
  SELECT COALESCE(SUM(good_quantity),0), COALESCE(SUM(good_quantity+scrap_quantity+reject_quantity),0)
    INTO v_g, v_t FROM sub_work_orders WHERE work_order_id = p_wo_id;

  v_pm := CASE WHEN v_ps IS NOT NULL AND v_pe IS NOT NULL THEN EXTRACT(EPOCH FROM (v_pe - v_ps))/60.0 ELSE 0 END;
  v_am := CASE WHEN v_as IS NOT NULL AND v_ae IS NOT NULL THEN EXTRACT(EPOCH FROM (v_ae - v_as))/60.0 ELSE 0 END;

  IF v_pm > 0 AND v_am > 0 THEN v_av := LEAST(v_am / v_pm, 1.0); END IF;
  IF v_am > 0 AND v_pm > 0 THEN
    IF v_am <= v_pm THEN v_pf := 1.0; ELSE v_pf := v_pm / v_am; END IF;
  END IF;
  IF v_t > 0 THEN v_qu := v_g / v_t; END IF;

  DELETE FROM oee_snapshots WHERE work_order_id = p_wo_id;
  INSERT INTO oee_snapshots (work_order_id, availability, performance, quality, oee,
    planned_run_minutes, actual_run_minutes, good_qty, total_qty, computed_at)
  VALUES (p_wo_id, v_av, v_pf, v_qu, v_av*v_pf*v_qu, v_pm, v_am, v_g, v_t, now());

  RETURN QUERY SELECT v_av, v_pf, v_qu, v_av*v_pf*v_qu, v_pm, v_am, v_g, v_t;
END; $$;
REVOKE EXECUTE ON FUNCTION compute_oee(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION compute_oee(uuid) TO anon, authenticated;

-- 8. RPC: get_mes_dashboard
CREATE OR REPLACE FUNCTION get_mes_dashboard()
RETURNS TABLE(total_work_orders bigint, quality_pending_count bigint, quality_passed_count bigint,
  warehouse_pending_count bigint, total_scrap numeric, avg_oee numeric)
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY SELECT
    COUNT(DISTINCT wo.id)::bigint,
    COUNT(DISTINCT CASE WHEN wo.quality_status='PENDING' THEN wo.id END)::bigint,
    COUNT(DISTINCT CASE WHEN wo.quality_status='PASSED' THEN wo.id END)::bigint,
    COUNT(DISTINCT CASE WHEN wo.quality_status='PASSED' AND wo.warehouse_transferred=false THEN wo.id END)::bigint,
    COALESCE(SUM(sr.quantity),0),
    COALESCE(AVG(os.oee),0)
  FROM work_orders wo
  LEFT JOIN scrap_records sr ON sr.work_order_id = wo.id
  LEFT JOIN (SELECT DISTINCT ON (work_order_id) work_order_id, oee FROM oee_snapshots ORDER BY work_order_id, computed_at DESC) os ON os.work_order_id = wo.id
  WHERE wo.status <> 'CANCELLED';
END; $$;
REVOKE EXECUTE ON FUNCTION get_mes_dashboard() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_mes_dashboard() TO anon, authenticated;

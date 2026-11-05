/*
# إصلاح اعتماد الخطة الشهرية وتوليد أوامر الشغل التلقائي + تصنيف الخامات

## المشاكل المراد إصلاحها
1. استعلام بنود الخطة الشهرية يفشل بسبب وجود علاقتين بين monthly_plan_items و work_orders. الحل: استخدام FK hint صريح في الاستعلام.
2. اعتماد الخطة الشهرية لا يولد أوامر الشغل تلقائيًا. الحل: دالة approve_monthly_and_generate_wos تنشئ أمر شغل لكل بند.
3. دالة auto_create_work_order_from_monthly_item تختار أول منتج ومسار عشوائيًا. الحل: ربط الموديل بالمسار بشكل صحيح واستخدام أي منتج متاح.
4. تصنيف الخامات: إضافة عمود is_raw_material و material_classification إلى item_master لتمييز الخامات (خشب/غراء/PVC) عن المكونات (أطوال/أوشاح/ضهور).

## التغييرات
1. إضافة أعمدة إلى item_master: is_raw_material, material_classification
2. تحديث auto_create_work_order_from_monthly_item للبحث عن المسار المرتبط بالموديل
3. دالة جديدة approve_monthly_and_generate_wos: تعتمد الخطة وتولد أوامر الشغل لكل البنود
4. منح الصلاحيات للأدوار anon و authenticated
*/

-- 1. تصنيف الخامات في item_master
ALTER TABLE item_master
  ADD COLUMN IF NOT EXISTS is_raw_material boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS material_classification text DEFAULT 'COMPONENT';

UPDATE item_master
SET is_raw_material = true, material_classification = 'RAW_MATERIAL'
WHERE category = 'Raw Board'
   OR item_type ILIKE '%raw%'
   OR name ILIKE '%خشب%' OR name ILIKE '%غراء%' OR name ILIKE '%pvc%'
   OR name ILIKE '%wood%' OR name ILIKE '%glue%';

UPDATE item_master
SET is_raw_material = false, material_classification = 'COMPONENT'
WHERE category IN ('Length', 'Front', 'Back');

-- 2. تحسين دالة auto_create_work_order_from_monthly_item للبحث عن المسار المرتبط بالموديل
DROP FUNCTION IF EXISTS auto_create_work_order_from_monthly_item(uuid, uuid);

CREATE OR REPLACE FUNCTION auto_create_work_order_from_monthly_item(
  p_monthly_plan_item_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item record; v_wo_id uuid; v_wo_number text;
  v_product_id uuid; v_route_id uuid; v_stage record; v_seq integer := 1;
  v_model_id uuid;
BEGIN
  SELECT * INTO v_item FROM monthly_plan_items WHERE id = p_monthly_plan_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly plan item not found'; END IF;
  IF v_item.work_order_id IS NOT NULL THEN RETURN v_item.work_order_id; END IF;

  v_model_id := v_item.product_model_id;

  -- استخدام أي منتج متاح (جدول products لا يحتوي على product_model_id)
  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  IF v_product_id IS NULL THEN
    INSERT INTO products (item_code, name, unit_of_measure, is_active)
    VALUES ('AUTO-' || substr(md5(random()::text),1,8), 'منتج تلقائي', 'PCS', true)
    RETURNING id INTO v_product_id;
  END IF;

  -- البحث عن مسار إنتاج مرتبط بالموديل عبر routing_templates
  SELECT rv.id INTO v_route_id
  FROM routing_versions rv
  JOIN routing_templates rt ON rv.routing_template_id = rt.id
  JOIN routing_item_rules rir ON rir.routing_template_id = rt.id
  WHERE rv.status = 'ACTIVE' AND rir.product_model_id = v_model_id
  LIMIT 1;
  IF v_route_id IS NULL THEN
    SELECT rv.id INTO v_route_id
    FROM routing_versions rv
    JOIN routing_templates rt ON rv.routing_template_id = rt.id
    WHERE rv.status = 'ACTIVE' AND rt.product_model_applicability = 'ALL'
    LIMIT 1;
  END IF;
  IF v_route_id IS NULL THEN
    SELECT id INTO v_route_id FROM production_routes WHERE is_active = true LIMIT 1;
  END IF;
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

-- 3. دالة جديدة: اعتماد الخطة الشهرية وتوليد أوامر الشغل تلقائيًا
CREATE OR REPLACE FUNCTION approve_monthly_and_generate_wos(
  p_plan_id uuid, p_approved_by uuid DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item_id uuid; v_wo_id uuid; v_count integer := 0; v_existing_wo_id uuid;
BEGIN
  UPDATE monthly_plan
  SET status = 'APPROVED', approved_by = p_approved_by, approved_at = now(), updated_at = now()
  WHERE id = p_plan_id AND status = 'DRAFT';

  IF NOT FOUND THEN RAISE EXCEPTION 'Plan not found or not in DRAFT status'; END IF;

  FOR v_item_id IN SELECT id FROM monthly_plan_items WHERE monthly_plan_id = p_plan_id ORDER BY sequence_order
  LOOP
    SELECT work_order_id INTO v_existing_wo_id FROM monthly_plan_items WHERE id = v_item_id;
    IF v_existing_wo_id IS NULL THEN
      v_wo_id := auto_create_work_order_from_monthly_item(v_item_id, p_approved_by);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END; $$;

REVOKE EXECUTE ON FUNCTION approve_monthly_and_generate_wos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_monthly_and_generate_wos(uuid, uuid) TO anon, authenticated;

/*
# إصلاح دالة auto_create_work_order_from_monthly_item
المشكلة: الدالة كانت تختار routing_versions.id وتستخدمه كـ production_route_id في work_orders،
لكن work_orders.production_route_id يشير إلى production_routes وليس routing_versions.
الحل: استخدام production_routes.id كقيمة لـ production_route_id، واستخدام routing_versions فقط لجلب المراحل.
*/

DROP FUNCTION IF EXISTS auto_create_work_order_from_monthly_item(uuid, uuid);

CREATE OR REPLACE FUNCTION auto_create_work_order_from_monthly_item(
  p_monthly_plan_item_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item record; v_wo_id uuid; v_wo_number text;
  v_product_id uuid; v_route_id uuid; v_stage record; v_seq integer := 1;
  v_model_id uuid; v_routing_version_id uuid;
BEGIN
  SELECT * INTO v_item FROM monthly_plan_items WHERE id = p_monthly_plan_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly plan item not found'; END IF;
  IF v_item.work_order_id IS NOT NULL THEN RETURN v_item.work_order_id; END IF;

  v_model_id := v_item.product_model_id;

  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  IF v_product_id IS NULL THEN
    INSERT INTO products (item_code, name, unit_of_measure, is_active)
    VALUES ('AUTO-' || substr(md5(random()::text),1,8), 'منتج تلقائي', 'PCS', true)
    RETURNING id INTO v_product_id;
  END IF;

  -- production_route_id يجب أن يشير إلى production_routes
  SELECT id INTO v_route_id FROM production_routes WHERE is_active = true LIMIT 1;
  IF v_route_id IS NULL THEN RAISE EXCEPTION 'No active production route found'; END IF;

  -- ابحث عن نسخة التوجيه المرتبطة بالموديل لجلب المراحل
  SELECT rv.id INTO v_routing_version_id
  FROM routing_versions rv
  JOIN routing_item_rules rir ON rir.routing_template_id = rv.routing_template_id
  WHERE rv.status = 'ACTIVE' AND rir.product_model_id = v_model_id
  LIMIT 1;
  IF v_routing_version_id IS NULL THEN
    SELECT rv.id INTO v_routing_version_id
    FROM routing_versions rv
    JOIN routing_templates rt ON rv.routing_template_id = rt.id
    WHERE rv.status = 'ACTIVE' AND rt.product_model_applicability = 'ALL'
    LIMIT 1;
  END IF;

  v_wo_number := 'WO-' || to_char(now(),'YYMMDDHH24MI') || '-' || substr(md5(random()::text),1,4);
  INSERT INTO work_orders (wo_number, product_id, production_route_id, planned_quantity, status,
    product_model_id, unit_of_measure, created_by, master_plan_item_id, monthly_plan_item_id,
    quality_status, warehouse_transferred)
  VALUES (v_wo_number, v_product_id, v_route_id, v_item.planned_quantity, 'CREATED',
    v_item.product_model_id, v_item.unit_of_measure, p_created_by, v_item.master_plan_item_id, p_monthly_plan_item_id,
    'PENDING', false) RETURNING id INTO v_wo_id;

  UPDATE monthly_plan_items SET work_order_id = v_wo_id, status = 'PLANNED' WHERE id = p_monthly_plan_item_id;

  -- إنشاء الأوامر الفرعية من مراحل نسخة التوجيه
  IF v_routing_version_id IS NOT NULL THEN
    FOR v_stage IN SELECT rs.id, rs.stage_name, rs.sequence_number
      FROM routing_stages rs WHERE rs.routing_version_id = v_routing_version_id AND rs.is_active = true
      ORDER BY rs.sequence_number
    LOOP
      INSERT INTO sub_work_orders (work_order_id, sequence_number, routing_stage_id, stage_name, planned_quantity, status, quality_status)
      VALUES (v_wo_id, v_stage.sequence_number, v_stage.id, v_stage.stage_name, v_item.planned_quantity, 'PENDING', 'PENDING');
      v_seq := v_seq + 1;
    END LOOP;
  END IF;

  -- إذا لا توجد مراحل، أنشئ مرحلة افتراضية
  IF v_seq = 1 THEN
    INSERT INTO sub_work_orders (work_order_id, sequence_number, stage_name, planned_quantity, status, quality_status)
    VALUES (v_wo_id, 1, 'إنتاج', v_item.planned_quantity, 'PENDING', 'PENDING');
  END IF;
  RETURN v_wo_id;
END; $$;

REVOKE EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) TO anon, authenticated;

/*
# Rewrite auto_create_work_order: Component-Based Sub-Work-Orders

## Overview
Rewrites the function to generate component-based sub-work-orders:
- SINGLE model: creates component sub-WOs for LENGTH, FRONT (main), BACK (main)
- DOUBLE model: creates component sub-WOs for LENGTH, FRONT_MAIN, FRONT_SUB, BACK_MAIN, BACK_SUB

For each component, the function:
1. Looks up the routing template matching that item_type via routing_item_rules
2. Finds the ACTIVE routing version for that template
3. Creates sub-work-orders from the routing stages, tagged with component_type
4. Links child sub-WOs (per-stage) to a parent component sub-WO

## Notes
- Backward compatible: if no routing is found for a component, creates a single default sub-WO
- The first sub-WO for each component is the "parent" component WO; subsequent stage sub-WOs link to it via parent_sub_wo_id
- component_type is set on all sub-WOs in the component chain
*/

DROP FUNCTION IF EXISTS auto_create_work_order_from_monthly_item(uuid, uuid);

CREATE OR REPLACE FUNCTION auto_create_work_order_from_monthly_item(
  p_monthly_plan_item_id uuid, p_created_by uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_item record;
  v_wo_id uuid;
  v_wo_number text;
  v_product_id uuid;
  v_route_id uuid;
  v_model record;
  v_components text[];
  v_comp text;
  v_routing_version_id uuid;
  v_stage record;
  v_seq integer := 1;
  v_parent_sub_wo_id uuid;
  v_sub_wo_id uuid;
  v_component_seq integer;
BEGIN
  SELECT * INTO v_item FROM monthly_plan_items WHERE id = p_monthly_plan_item_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Monthly plan item not found'; END IF;
  IF v_item.work_order_id IS NOT NULL THEN RETURN v_item.work_order_id; END IF;

  SELECT * INTO v_model FROM product_models WHERE id = v_item.product_model_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Product model not found'; END IF;

  -- Get or create a product
  SELECT id INTO v_product_id FROM products WHERE is_active = true LIMIT 1;
  IF v_product_id IS NULL THEN
    INSERT INTO products (item_code, name, unit_of_measure, is_active)
    VALUES ('AUTO-' || substr(md5(random()::text),1,8), 'منتج تلقائي', 'PCS', true)
    RETURNING id INTO v_product_id;
  END IF;

  -- Get production route
  SELECT id INTO v_route_id FROM production_routes WHERE is_active = true LIMIT 1;
  IF v_route_id IS NULL THEN RAISE EXCEPTION 'No active production route found'; END IF;

  -- Determine components based on kit_type
  IF v_model.kit_type = 'SINGLE' THEN
    v_components := ARRAY['LENGTH', 'FRONT', 'BACK'];
  ELSIF v_model.kit_type = 'DOUBLE' THEN
    v_components := ARRAY['LENGTH', 'FRONT_MAIN', 'FRONT_SUB', 'BACK_MAIN', 'BACK_SUB'];
  ELSE
    v_components := ARRAY['LENGTH', 'FRONT', 'BACK'];
  END IF;

  -- Create the main work order
  v_wo_number := 'WO-' || to_char(now(),'YYMMDDHH24MI') || '-' || substr(md5(random()::text),1,4);
  INSERT INTO work_orders (wo_number, product_id, production_route_id, planned_quantity, status,
    product_model_id, unit_of_measure, created_by, master_plan_item_id, monthly_plan_item_id,
    quality_status, warehouse_transferred)
  VALUES (v_wo_number, v_product_id, v_route_id, v_item.planned_quantity, 'CREATED',
    v_item.product_model_id, v_item.unit_of_measure, p_created_by, v_item.master_plan_item_id, p_monthly_plan_item_id,
    'PENDING', false) RETURNING id INTO v_wo_id;

  UPDATE monthly_plan_items SET work_order_id = v_wo_id, status = 'PLANNED' WHERE id = p_monthly_plan_item_id;

  -- Create sub-work-orders per component
  v_component_seq := 1;
  FOREACH v_comp IN ARRAY v_components LOOP
    -- Find routing version for this component type
    v_routing_version_id := NULL;

    -- First try: routing_item_rules matching this model + item_type
    SELECT rv.id INTO v_routing_version_id
    FROM routing_item_rules rir
    JOIN routing_versions rv ON rv.routing_template_id = rir.routing_template_id AND rv.status = 'ACTIVE'
    WHERE rir.product_model_id = v_model.id
      AND rir.is_active = true
      AND (
        rir.item_type = v_comp
        OR rir.item_type = CASE
          WHEN v_comp IN ('FRONT','FRONT_MAIN','FRONT_SUB') THEN 'FRONT'
          WHEN v_comp IN ('BACK','BACK_MAIN','BACK_SUB') THEN 'BACK'
          WHEN v_comp = 'LENGTH' THEN 'LENGTH'
          ELSE v_comp
        END
      )
    LIMIT 1;

    -- Second try: routing_item_rules with item_type matching generic category, any model
    IF v_routing_version_id IS NULL THEN
      SELECT rv.id INTO v_routing_version_id
      FROM routing_item_rules rir
      JOIN routing_versions rv ON rv.routing_template_id = rir.routing_template_id AND rv.status = 'ACTIVE'
      WHERE rir.is_active = true
        AND rir.product_model_id IS NULL
        AND rir.item_type = CASE
          WHEN v_comp IN ('FRONT','FRONT_MAIN','FRONT_SUB') THEN 'FRONT'
          WHEN v_comp IN ('BACK','BACK_MAIN','BACK_SUB') THEN 'BACK'
          WHEN v_comp = 'LENGTH' THEN 'LENGTH'
          ELSE v_comp
        END
      LIMIT 1;
    END IF;

    -- Third try: template with item_type_applicability matching, any model
    IF v_routing_version_id IS NULL THEN
      SELECT rv.id INTO v_routing_version_id
      FROM routing_templates rt
      JOIN routing_versions rv ON rv.routing_template_id = rt.id AND rv.status = 'ACTIVE'
      WHERE rt.is_active = true
        AND rt.product_model_applicability = 'ALL'
        AND (
          rt.item_type_applicability = CASE
            WHEN v_comp IN ('FRONT','FRONT_MAIN','FRONT_SUB') THEN 'FRONT'
            WHEN v_comp IN ('BACK','BACK_MAIN','BACK_SUB') THEN 'BACK'
            WHEN v_comp = 'LENGTH' THEN 'LENGTH'
            ELSE 'ALL'
          END
          OR rt.item_type_applicability = 'ALL'
        )
      LIMIT 1;
    END IF;

    v_parent_sub_wo_id := NULL;

    IF v_routing_version_id IS NOT NULL THEN
      -- Create sub-WOs from routing stages for this component
      FOR v_stage IN SELECT rs.id, rs.stage_name, rs.sequence_number, rs.work_center_id
        FROM routing_stages rs
        WHERE rs.routing_version_id = v_routing_version_id AND rs.is_active = true
        ORDER BY rs.sequence_number
      LOOP
        INSERT INTO sub_work_orders (
          work_order_id, sequence_number, routing_stage_id, stage_name,
          planned_quantity, status, quality_status,
          component_type, parent_sub_wo_id
        ) VALUES (
          v_wo_id, v_component_seq, v_stage.id, v_stage.stage_name,
          v_item.planned_quantity, 'PENDING', 'PENDING',
          v_comp, v_parent_sub_wo_id
        ) RETURNING id INTO v_sub_wo_id;

        IF v_parent_sub_wo_id IS NULL THEN
          v_parent_sub_wo_id := v_sub_wo_id;
        END IF;
        v_component_seq := v_component_seq + 1;
      END LOOP;
    END IF;

    -- If no routing stages found, create a single default sub-WO for this component
    IF v_parent_sub_wo_id IS NULL THEN
      INSERT INTO sub_work_orders (
        work_order_id, sequence_number, stage_name,
        planned_quantity, status, quality_status,
        component_type
      ) VALUES (
        v_wo_id, v_component_seq, v_comp,
        v_item.planned_quantity, 'PENDING', 'PENDING',
        v_comp
      ) RETURNING id INTO v_sub_wo_id;
      v_component_seq := v_component_seq + 1;
    END IF;
  END LOOP;

  RETURN v_wo_id;
END; $$;

REVOKE EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION auto_create_work_order_from_monthly_item(uuid, uuid) TO anon, authenticated;

-- Cost summary RPC
CREATE OR REPLACE FUNCTION get_work_order_cost_summary(p_wo_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_material_cost numeric := 0;
  v_labor_cost numeric := 0;
  v_overhead_cost numeric := 0;
  v_total numeric := 0;
  v_material_count integer := 0;
  v_materials json;
BEGIN
  -- Sum all material consumption from sub_work_order_materials
  SELECT COALESCE(SUM(total_cost), 0), COUNT(*) INTO v_material_cost, v_material_count
  FROM sub_work_order_materials swom
  JOIN sub_work_orders swo ON swo.id = swom.sub_work_order_id
  WHERE swo.work_order_id = p_wo_id;

  -- Also sum from production_consumption table
  SELECT COALESCE(SUM(consumed_qty * COALESCE(
    (SELECT im.thickness_mm FROM item_master im WHERE im.id = pc.item_id), 0
  )), 0) INTO v_overhead_cost
  FROM production_consumption pc
  WHERE pc.work_order_id = p_wo_id;

  -- Labor cost: sum labor_count * estimated hourly rate (simplified)
  SELECT COALESCE(SUM(labor_count), 0) INTO v_labor_cost
  FROM sub_work_orders
  WHERE work_order_id = p_wo_id AND status = 'COMPLETED';

  v_total := v_material_cost + v_labor_cost + v_overhead_cost;

  -- Update work_orders with cost
  UPDATE work_orders
  SET material_cost = v_material_cost,
      labor_cost = v_labor_cost,
      overhead_cost = v_overhead_cost,
      total_cost = v_total,
      cost_calculated_at = now()
  WHERE id = p_wo_id;

  -- Get materials breakdown
  SELECT COALESCE(json_agg(json_build_object(
    'item_code', swom.item_code,
    'consumed_qty', swom.consumed_qty,
    'unit_cost', swom.unit_cost,
    'total_cost', swom.total_cost,
    'component_type', swo.component_type,
    'stage_name', swo.stage_name
  )), '[]'::json) INTO v_materials
  FROM sub_work_order_materials swom
  JOIN sub_work_orders swo ON swo.id = swom.sub_work_order_id
  WHERE swo.work_order_id = p_wo_id;

  RETURN json_build_object(
    'material_cost', v_material_cost,
    'labor_cost', v_labor_cost,
    'overhead_cost', v_overhead_cost,
    'total_cost', v_total,
    'material_count', v_material_count,
    'materials', v_materials
  );
END; $$;

REVOKE EXECUTE ON FUNCTION get_work_order_cost_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_work_order_cost_summary(uuid) TO anon, authenticated;

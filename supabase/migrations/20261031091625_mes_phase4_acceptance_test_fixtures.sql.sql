/*
# Phase 4 Acceptance Test Fixtures

Creates prerequisite data needed to run the Phase 4 acceptance tests:
- A second active product model (so a plan can contain multiple models)
- An inactive product model (to test WO rejection)
- Two active products (needed by work_orders.product_id NOT NULL)
- Two active production routes (needed by work_orders.production_route_id NOT NULL)
- An ACTIVE BOM header + 2 BOM lines for the first model (for snapshot tests)

This is test fixture data, not application schema.
*/

-- Second active product model
INSERT INTO product_models (model_code, name, family_id, product_type, kit_type, is_active)
SELECT 'MDL-AS500', 'AS-5000', id, 'Cabinet', 'DOUBLE', true
FROM product_families WHERE family_code = 'FAM-04" W'
ON CONFLICT DO NOTHING;

-- Inactive product model
INSERT INTO product_models (model_code, name, family_id, product_type, kit_type, is_active)
SELECT 'MDL-AS900-OBS', 'AS-9000 (Obsolete)', id, 'Cabinet', 'DOUBLE', false
FROM product_families WHERE family_code = 'FAM-04" W'
ON CONFLICT DO NOTHING;

-- Two active products
INSERT INTO products (item_code, name, unit_of_measure, category, is_active)
VALUES ('PROD-AS4000', 'AS-4000 Speaker', 'PCS', 'FINISHED', true),
       ('PROD-AS5000', 'AS-5000 Speaker', 'PCS', 'FINISHED', true)
ON CONFLICT DO NOTHING;

-- Two active production routes
INSERT INTO production_routes (route_code, name, is_active)
VALUES ('RT-STD-001', 'Standard Production Route', true),
       ('RT-STD-002', 'Secondary Production Route', true)
ON CONFLICT DO NOTHING;

-- ACTIVE BOM header for the first model (AS-4000)
INSERT INTO bom_headers (product_model_id, version, status, effective_date)
SELECT pm.id, 'V1.0', 'ACTIVE', '2026-01-01'
FROM product_models pm
WHERE pm.model_code = 'MDL-AS400'
ON CONFLICT DO NOTHING;

-- BOM line 1: COMPONENT role
INSERT INTO bom_lines (bom_header_id, item_id, item_code, required_qty, unit_of_measure, component_role)
SELECT bh.id, im.id, im.item_code, 2, 'PCS', 'COMPONENT'
FROM bom_headers bh
JOIN product_models pm ON pm.id = bh.product_model_id
JOIN item_master im ON im.item_code = (SELECT item_code FROM item_master LIMIT 1)
WHERE pm.model_code = 'MDL-AS400' AND bh.version = 'V1.0'
AND NOT EXISTS (SELECT 1 FROM bom_lines bl WHERE bl.bom_header_id = bh.id)
ON CONFLICT DO NOTHING;

-- BOM line 2: SUBASSEMBLY role
INSERT INTO bom_lines (bom_header_id, item_id, item_code, required_qty, unit_of_measure, component_role)
SELECT bh.id, im.id, im.item_code, 4, 'PCS', 'SUBASSEMBLY'
FROM bom_headers bh
JOIN product_models pm ON pm.id = bh.product_model_id
JOIN item_master im ON im.item_code = (SELECT item_code FROM item_master LIMIT 1)
WHERE pm.model_code = 'MDL-AS400' AND bh.version = 'V1.0'
AND NOT EXISTS (
  SELECT 1 FROM bom_lines bl
  WHERE bl.bom_header_id = bh.id AND bl.component_role = 'SUBASSEMBLY'
)
ON CONFLICT DO NOTHING;

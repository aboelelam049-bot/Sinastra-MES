/*
# Phase 4 Test Fixture: Second Item + Second BOM Line

Adds a second item_master row (matching valid category/item_type values)
so the BOM can have 2 distinct components, then adds the second BOM line.
*/

-- Second item (using valid enum values from existing constraints)
INSERT INTO item_master (item_code, name, category, item_type, unit_of_measure)
VALUES ('ITM-0002', 'مغناطيس صوتي', 'Raw Board', 'Wood', 'PCS')
ON CONFLICT DO NOTHING;

-- Second BOM line (SUBASSEMBLY) using the new item
INSERT INTO bom_lines (bom_header_id, item_id, item_code, required_qty, unit_of_measure, component_role)
SELECT bh.id, im.id, im.item_code, 4, 'PCS', 'SUBASSEMBLY'
FROM bom_headers bh
JOIN item_master im ON im.item_code = 'ITM-0002'
WHERE bh.id = '4d8bdb46-b351-43f7-91a7-b31d310e00cf'
AND NOT EXISTS (
  SELECT 1 FROM bom_lines bl
  WHERE bl.bom_header_id = bh.id AND bl.item_id = im.id
)
ON CONFLICT DO NOTHING;

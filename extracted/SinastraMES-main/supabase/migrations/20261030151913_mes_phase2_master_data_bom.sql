/*
# MES Phase 2 — Product Families, Models, Item Master, BOM

## Summary
Creates the master data architecture for product families, product models, item master, and bill of materials (BOM).
These are normalized relational tables with foreign keys, unique constraints, and RLS.

## New Tables

### product_families
| Column        | Type         | Description                              |
|---------------|--------------|------------------------------------------|
| id            | uuid (PK)    | Family ID                                |
| family_code   | text (UQ)    | Unique family code                       |
| name          | text         | Family name (Arabic)                     |
| description   | text         | Family description                       |
| is_active     | boolean      | Active/Inactive status                   |
| created_by    | uuid (FK)    | User who created the record              |
| created_at    | timestamptz  | Creation timestamp                       |
| updated_at    | timestamptz  | Last update timestamp                    |

### product_models
| Column        | Type         | Description                              |
|---------------|--------------|------------------------------------------|
| id            | uuid (PK)    | Model ID                                 |
| model_code    | text (UQ)    | Unique model code                        |
| name          | text         | Model name                               |
| family_id     | uuid (FK)    | References product_families              |
| product_type  | text         | Type of product (e.g. 'CABINET')         |
| kit_type      | text         | SINGLE, DOUBLE, or custom                |
| description   | text         | Model description                        |
| length_mm     | numeric      | Optional dimension                       |
| width_mm      | numeric      | Optional dimension                       |
| height_mm     | numeric      | Optional dimension                       |
| is_active     | boolean      | Active/Inactive                          |
| created_by    | uuid (FK)    | User who created the record              |
| created_at    | timestamptz  | Creation timestamp                       |
| updated_at    | timestamptz  | Last update timestamp                    |

### item_master
| Column        | Type         | Description                              |
|---------------|--------------|------------------------------------------|
| id            | uuid (PK)    | Item ID                                  |
| item_code     | text (UQ)    | Unique item code (primary identifier)    |
| name          | text         | Item name                                |
| category      | text         | Length, Front, Back, Raw Board, Other    |
| item_type     | text         | Type classification                      |
| unit_of_measure| text        | Unit (piece, meter, etc.)                |
| length_mm     | numeric      | Optional length dimension                |
| width_mm      | numeric      | Optional width dimension                 |
| thickness_mm  | numeric      | Optional thickness dimension             |
| description   | text         | Item description                         |
| is_active     | boolean      | Active/Inactive                          |
| created_by    | uuid (FK)    | User who created the record              |
| created_at    | timestamptz  | Creation timestamp                       |
| updated_at    | timestamptz  | Last update timestamp                    |

### bom_headers
| Column          | Type         | Description                            |
|-----------------|--------------|----------------------------------------|
| id              | uuid (PK)    | BOM header ID                          |
| product_model_id| uuid (FK)    | References product_models              |
| version         | text         | BOM version (e.g. 'v1', 'v2')          |
| effective_date  | date         | When this BOM version becomes effective|
| status          | text         | DRAFT, ACTIVE, SUPERSEDED              |
| created_by      | uuid (FK)    | User who created the BOM               |
| created_at      | timestamptz  | Creation timestamp                     |
| updated_at      | timestamptz  | Last update timestamp                  |

### bom_lines
| Column         | Type         | Description                            |
|----------------|--------------|----------------------------------------|
| id             | uuid (PK)    | BOM line ID                            |
| bom_header_id  | uuid (FK)    | References bom_headers                 |
| item_id        | uuid (FK)    | References item_master                 |
| item_code      | text         | Denormalized for historical reference  |
| required_qty   | numeric      | Required quantity per unit             |
| unit_of_measure| text         | Unit of measure                        |
| component_role | text         | Role (LENGTH, FRONT, BACK, etc.)       |
| notes          | text         | Optional notes                         |
| created_at     | timestamptz  | Creation timestamp                     |

### kit_templates
| Column     | Type         | Description                            |
|------------|--------------|----------------------------------------|
| id         | uuid (PK)    | Template ID                            |
| kit_type   | text (UQ)    | SINGLE, DOUBLE                         |
| name       | text         | Template name                          |
| is_active  | boolean      | Active/Inactive                        |
| created_at | timestamptz  | Creation timestamp                     |

### kit_template_lines
| Column           | Type      | Description                          |
|------------------|-----------|--------------------------------------|
| id               | uuid (PK) | Line ID                              |
| kit_template_id  | uuid (FK) | References kit_templates             |
| component_role   | text      | Role (LENGTH, FRONT, BACK, etc.)    |
| required_qty     | numeric   | Required quantity                    |
| sort_order       | int       | Display order                        |

## RPC Functions

### create_bom_with_lines(p_model_id, p_version, p_effective_date, p_lines)
Creates a BOM header with multiple lines in a single atomic operation.
Validates that all items exist and are active.
Returns the new BOM header ID.

### activate_bom_version(p_bom_header_id)
Activates a DRAFT BOM and supersedes any previously ACTIVE BOM for the same model.
Historical BOM versions remain available (status = SUPERSEDED, not deleted).

## Security
- RLS enabled on all tables.
- All tables: authenticated SELECT (shared factory data).
- INSERT/UPDATE: authenticated users can create/modify master data.
- DELETE: NOT granted — deactivation only (is_active = false).
- All RPC functions: SECURITY DEFINER, REVOKE from PUBLIC/anon, GRANT to authenticated.

## Important Notes
1. Item codes are the primary business identifier — dimensions are supplementary, not unique.
2. Multiple items can have identical dimensions.
3. BOM is stored as normalized tables (bom_headers + bom_lines), not JSON.
4. Historical BOM versions are preserved with status = SUPERSEDED.
5. Inactive items cannot be added to new active BOMs (validated in create_bom_with_lines).
6. Master data is never deleted — only deactivated.
7. Kit templates are configurable starting points, not hardcoded BOMs.
*/

-- ============================================================
-- 1. PRODUCT FAMILIES
-- ============================================================

CREATE TABLE IF NOT EXISTS product_families (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_code text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_families ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON product_families TO authenticated;

DROP POLICY IF EXISTS "pf_select_auth" ON product_families;
CREATE POLICY "pf_select_auth" ON product_families FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pf_insert_auth" ON product_families;
CREATE POLICY "pf_insert_auth" ON product_families FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pf_update_auth" ON product_families;
CREATE POLICY "pf_update_auth" ON product_families FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS pf_updated_at ON product_families;
CREATE TRIGGER pf_updated_at BEFORE UPDATE ON product_families
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2. PRODUCT MODELS
-- ============================================================

CREATE TABLE IF NOT EXISTS product_models (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model_code   text UNIQUE NOT NULL,
  name         text NOT NULL,
  family_id    uuid NOT NULL REFERENCES product_families(id) ON DELETE RESTRICT,
  product_type text NOT NULL DEFAULT 'CABINET',
  kit_type     text NOT NULL DEFAULT 'SINGLE'
               CHECK (kit_type IN ('SINGLE', 'DOUBLE', 'CUSTOM')),
  description  text,
  length_mm    numeric(10,2),
  width_mm     numeric(10,2),
  height_mm    numeric(10,2),
  is_active    boolean NOT NULL DEFAULT true,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE product_models ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON product_models TO authenticated;

DROP POLICY IF EXISTS "pm_select_auth" ON product_models;
CREATE POLICY "pm_select_auth" ON product_models FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "pm_insert_auth" ON product_models;
CREATE POLICY "pm_insert_auth" ON product_models FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "pm_update_auth" ON product_models;
CREATE POLICY "pm_update_auth" ON product_models FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS pm_updated_at ON product_models;
CREATE TRIGGER pm_updated_at BEFORE UPDATE ON product_models
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_product_models_family_id ON product_models(family_id);

-- ============================================================
-- 3. ITEM MASTER
-- ============================================================

CREATE TABLE IF NOT EXISTS item_master (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code       text UNIQUE NOT NULL,
  name            text NOT NULL,
  category        text NOT NULL DEFAULT 'Other Components'
                  CHECK (category IN ('Length', 'Front', 'Back', 'Raw Board', 'Other Components')),
  item_type       text NOT NULL DEFAULT 'COMPONENT',
  unit_of_measure text NOT NULL DEFAULT 'piece',
  length_mm       numeric(10,2),
  width_mm        numeric(10,2),
  thickness_mm    numeric(10,2),
  description     text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE item_master ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON item_master TO authenticated;

DROP POLICY IF EXISTS "im_select_auth" ON item_master;
CREATE POLICY "im_select_auth" ON item_master FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "im_insert_auth" ON item_master;
CREATE POLICY "im_insert_auth" ON item_master FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "im_update_auth" ON item_master;
CREATE POLICY "im_update_auth" ON item_master FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS im_updated_at ON item_master;
CREATE TRIGGER im_updated_at BEFORE UPDATE ON item_master
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_item_master_category ON item_master(category);
CREATE INDEX IF NOT EXISTS idx_item_master_is_active ON item_master(is_active);

-- ============================================================
-- 4. BOM HEADERS
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_headers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_model_id uuid NOT NULL REFERENCES product_models(id) ON DELETE RESTRICT,
  version          text NOT NULL,
  effective_date   date,
  status           text NOT NULL DEFAULT 'DRAFT'
                   CHECK (status IN ('DRAFT', 'ACTIVE', 'SUPERSEDED')),
  created_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_model_id, version)
);

ALTER TABLE bom_headers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON bom_headers TO authenticated;

DROP POLICY IF EXISTS "bh_select_auth" ON bom_headers;
CREATE POLICY "bh_select_auth" ON bom_headers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bh_insert_auth" ON bom_headers;
CREATE POLICY "bh_insert_auth" ON bom_headers FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bh_update_auth" ON bom_headers;
CREATE POLICY "bh_update_auth" ON bom_headers FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS bh_updated_at ON bom_headers;
CREATE TRIGGER bh_updated_at BEFORE UPDATE ON bom_headers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE INDEX IF NOT EXISTS idx_bom_headers_model_id ON bom_headers(product_model_id);
CREATE INDEX IF NOT EXISTS idx_bom_headers_status ON bom_headers(status);

-- ============================================================
-- 5. BOM LINES
-- ============================================================

CREATE TABLE IF NOT EXISTS bom_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bom_header_id   uuid NOT NULL REFERENCES bom_headers(id) ON DELETE CASCADE,
  item_id         uuid NOT NULL REFERENCES item_master(id) ON DELETE RESTRICT,
  item_code       text NOT NULL,
  required_qty    numeric(14,4) NOT NULL DEFAULT 1 CHECK (required_qty > 0),
  unit_of_measure text NOT NULL DEFAULT 'piece',
  component_role  text NOT NULL DEFAULT 'COMPONENT',
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bom_header_id, item_id)
);

ALTER TABLE bom_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON bom_lines TO authenticated;

DROP POLICY IF EXISTS "bl_select_auth" ON bom_lines;
CREATE POLICY "bl_select_auth" ON bom_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "bl_insert_auth" ON bom_lines;
CREATE POLICY "bl_insert_auth" ON bom_lines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "bl_update_auth" ON bom_lines;
CREATE POLICY "bl_update_auth" ON bom_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "bl_delete_auth" ON bom_lines;
CREATE POLICY "bl_delete_auth" ON bom_lines FOR DELETE TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_bom_lines_header_id ON bom_lines(bom_header_id);
CREATE INDEX IF NOT EXISTS idx_bom_lines_item_id ON bom_lines(item_id);

-- ============================================================
-- 6. KIT TEMPLATES
-- ============================================================

CREATE TABLE IF NOT EXISTS kit_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_type   text UNIQUE NOT NULL CHECK (kit_type IN ('SINGLE', 'DOUBLE', 'CUSTOM')),
  name       text NOT NULL,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE kit_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE ON kit_templates TO authenticated;

DROP POLICY IF EXISTS "kt_select_auth" ON kit_templates;
CREATE POLICY "kt_select_auth" ON kit_templates FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "kt_insert_auth" ON kit_templates;
CREATE POLICY "kt_insert_auth" ON kit_templates FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "kt_update_auth" ON kit_templates;
CREATE POLICY "kt_update_auth" ON kit_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 7. KIT TEMPLATE LINES
-- ============================================================

CREATE TABLE IF NOT EXISTS kit_template_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_template_id uuid NOT NULL REFERENCES kit_templates(id) ON DELETE CASCADE,
  component_role  text NOT NULL,
  required_qty    numeric(14,4) NOT NULL DEFAULT 1 CHECK (required_qty > 0),
  sort_order      int NOT NULL DEFAULT 1
);

ALTER TABLE kit_template_lines ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON kit_template_lines TO authenticated;

DROP POLICY IF EXISTS "ktl_select_auth" ON kit_template_lines;
CREATE POLICY "ktl_select_auth" ON kit_template_lines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "ktl_insert_auth" ON kit_template_lines;
CREATE POLICY "ktl_insert_auth" ON kit_template_lines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "ktl_update_auth" ON kit_template_lines;
CREATE POLICY "ktl_update_auth" ON kit_template_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "ktl_delete_auth" ON kit_template_lines;
CREATE POLICY "ktl_delete_auth" ON kit_template_lines FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 8. SEED KIT TEMPLATES
-- ============================================================

INSERT INTO kit_templates (kit_type, name, is_active)
VALUES ('SINGLE', 'Single Kit Template', true)
ON CONFLICT (kit_type) DO NOTHING;

INSERT INTO kit_templates (kit_type, name, is_active)
VALUES ('DOUBLE', 'Double Kit Template', true)
ON CONFLICT (kit_type) DO NOTHING;

-- Single Kit lines: 1 Length, 1 Front, 1 Back
INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'LENGTH', 1, 1 FROM kit_templates kt WHERE kt.kit_type = 'SINGLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'FRONT', 1, 2 FROM kit_templates kt WHERE kt.kit_type = 'SINGLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'BACK', 1, 3 FROM kit_templates kt WHERE kt.kit_type = 'SINGLE'
ON CONFLICT DO NOTHING;

-- Double Kit lines: 2 Lengths, 1 Main Front, 1 Secondary Front, 1 Main Back, 1 Secondary Back
INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'LENGTH', 2, 1 FROM kit_templates kt WHERE kt.kit_type = 'DOUBLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'MAIN_FRONT', 1, 2 FROM kit_templates kt WHERE kt.kit_type = 'DOUBLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'SECONDARY_FRONT', 1, 3 FROM kit_templates kt WHERE kt.kit_type = 'DOUBLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'MAIN_BACK', 1, 4 FROM kit_templates kt WHERE kt.kit_type = 'DOUBLE'
ON CONFLICT DO NOTHING;

INSERT INTO kit_template_lines (kit_template_id, component_role, required_qty, sort_order)
SELECT kt.id, 'SECONDARY_BACK', 1, 5 FROM kit_templates kt WHERE kt.kit_type = 'DOUBLE'
ON CONFLICT DO NOTHING;

-- ============================================================
-- 9. CREATE BOM WITH LINES RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_bom_with_lines(
  p_model_id uuid,
  p_version text,
  p_effective_date date DEFAULT NULL,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bom_id uuid;
  v_line jsonb;
  v_item_id uuid;
  v_item_code text;
  v_item_active boolean;
  v_qty numeric;
  v_uom text;
  v_role text;
  v_notes text;
BEGIN
  -- Validate model exists
  IF NOT EXISTS (SELECT 1 FROM product_models WHERE id = p_model_id) THEN
    RAISE EXCEPTION 'Product model not found: %', p_model_id;
  END IF;

  -- Validate version is unique for this model
  IF EXISTS (SELECT 1 FROM bom_headers WHERE product_model_id = p_model_id AND version = p_version) THEN
    RAISE EXCEPTION 'BOM version % already exists for this model', p_version;
  END IF;

  -- Validate lines array is not empty
  IF jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'BOM must have at least one line';
  END IF;

  -- Create the BOM header
  INSERT INTO bom_headers (product_model_id, version, effective_date, status, created_by)
  VALUES (p_model_id, p_version, p_effective_date, 'DRAFT', auth.uid())
  RETURNING id INTO v_bom_id;

  -- Process each line
  FOR v_line IN SELECT jsonb_array_elements(p_lines) LOOP
    v_item_id := v_line->>'item_id';
    v_qty := (v_line->>'required_qty')::numeric;
    v_uom := COALESCE(v_line->>'unit_of_measure', 'piece');
    v_role := COALESCE(v_line->>'component_role', 'COMPONENT');
    v_notes := v_line->>'notes';

    -- Validate item exists and is active
    SELECT item_code, is_active INTO v_item_code, v_item_active
    FROM item_master WHERE id = v_item_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found: %', v_item_id;
    END IF;

    IF NOT v_item_active THEN
      RAISE EXCEPTION 'Inactive item cannot be added to BOM: %', v_item_code;
    END IF;

    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Required quantity must be greater than zero for item %', v_item_code;
    END IF;

    -- Insert the BOM line
    INSERT INTO bom_lines (bom_header_id, item_id, item_code, required_qty, unit_of_measure, component_role, notes)
    VALUES (v_bom_id, v_item_id, v_item_code, v_qty, v_uom, v_role, v_notes);
  END LOOP;

  -- Audit log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, new_values)
  VALUES (auth.uid(), 'INSERT', 'bom_headers', v_bom_id::text,
    jsonb_build_object('model_id', p_model_id, 'version', p_version, 'line_count', jsonb_array_length(p_lines)));

  RETURN v_bom_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_bom_with_lines(uuid, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_bom_with_lines(uuid, text, date, jsonb) TO authenticated;

-- ============================================================
-- 10. ACTIVATE BOM VERSION RPC
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_bom_version(p_bom_header_id uuid)
RETURNS bom_headers
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bom bom_headers%ROWTYPE;
  v_old_active bom_headers%ROWTYPE;
BEGIN
  -- Get the BOM to activate
  SELECT * INTO v_bom FROM bom_headers WHERE id = p_bom_header_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BOM header not found: %', p_bom_header_id;
  END IF;

  IF v_bom.status = 'ACTIVE' THEN
    RAISE EXCEPTION 'BOM is already active';
  END IF;

  IF v_bom.status = 'SUPERSEDED' THEN
    RAISE EXCEPTION 'Cannot activate a superseded BOM';
  END IF;

  -- Supersede any currently ACTIVE BOM for the same model
  SELECT * INTO v_old_active FROM bom_headers
  WHERE product_model_id = v_bom.product_model_id AND status = 'ACTIVE';

  IF FOUND THEN
    UPDATE bom_headers SET status = 'SUPERSEDED' WHERE id = v_old_active.id;
  END IF;

  -- Activate the new BOM
  UPDATE bom_headers SET status = 'ACTIVE' WHERE id = p_bom_header_id
  RETURNING * INTO v_bom;

  -- Audit log
  INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values)
  VALUES (
    auth.uid(), 'ACTIVATE', 'bom_headers', p_bom_header_id::text,
    jsonb_build_object('old_active_id', v_old_active.id),
    jsonb_build_object('new_active_id', p_bom_header_id)
  );

  RETURN v_bom;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.activate_bom_version(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.activate_bom_version(uuid) TO authenticated;
/*
# MES Foundation — Products, Work Orders, Machines, Routes, Stages, Quality Cards

## Summary
Creates the core production data tables that the traceability system depends on.
These tables are referenced by parent_batches, pallets, and pallet_movements.

## New Tables

### products
Master data for wooden speaker cabinets and components.
| Column          | Type         | Description                                    |
|-----------------|--------------|------------------------------------------------|
| id              | uuid (PK)    | Product ID                                     |
| item_code       | text (UQ)    | Unique item code (e.g. SPK-CAB-001)            |
| name            | text         | Product name (Arabic or English)               |
| name_en         | text         | Product name in English                        |
| description     | text         | Product description                            |
| unit_of_measure | text         | e.g. 'piece', 'set'                            |
| category        | text         | Product category                               |
| is_active       | boolean      | Whether the product is in active production    |
| created_by      | uuid         | User who created the record                    |
| created_at      | timestamptz  | Creation timestamp                             |
| updated_at      | timestamptz  | Last update timestamp                          |

### machines
Machines and work centers in the factory.
| Column          | Type         | Description                                    |
|-----------------|--------------|------------------------------------------------|
| id              | uuid (PK)    | Machine ID                                     |
| machine_code    | text (UQ)    | Unique machine code                            |
| name            | text         | Machine name                                   |
| work_center     | text         | Work center grouping                           |
| capacity_per_hr | numeric      | Production capacity (units/hour)               |
| is_active       | boolean      | Whether the machine is operational             |
| created_at      | timestamptz  | Creation timestamp                             |

### production_routes
Configurable production routes for products.
| Column          | Type         | Description                                    |
|-----------------|--------------|------------------------------------------------|
| id              | uuid (PK)    | Route ID                                       |
| route_code      | text (UQ)    | Unique route code                              |
| name            | text         | Route name                                     |
| description     | text         | Route description                              |
| is_active       | boolean      | Whether the route is active                    |
| created_at      | timestamptz  | Creation timestamp                             |

### production_stages
Stages within a production route (ordered steps).
| Column          | Type         | Description                                    |
|-----------------|--------------|------------------------------------------------|
| id              | uuid (PK)    | Stage ID                                       |
| route_id        | uuid (FK)    | References production_routes                   |
| stage_code      | text (UQ)    | Unique stage code                              |
| name            | text         | Stage name (Arabic)                            |
| name_en         | text         | Stage name (English)                           |
| sequence_order  | int          | Order within the route (1, 2, 3...)            |
| machine_id      | uuid (FK)    | Associated machine (nullable)                  |
| is_active       | boolean      | Whether the stage is active                    |
| created_at      | timestamptz  | Creation timestamp                             |

### work_orders
Production work orders.
| Column             | Type         | Description                                 |
|--------------------|--------------|---------------------------------------------|
| id                 | uuid (PK)    | Work order ID                               |
| wo_number          | text (UQ)    | Unique work order number (system-generated) |
| product_id         | uuid (FK)    | References products                         |
| production_route_id| uuid (FK)    | References production_routes                |
| planned_quantity   | numeric      | Planned production quantity                 |
| status             | text         | CREATED, PLANNED, IN_PROGRESS, COMPLETED    |
| scheduled_date     | date         | Scheduled production date                   |
| created_by         | uuid         | User who created the WO                     |
| created_at         | timestamptz  | Creation timestamp                          |
| updated_at         | timestamptz  | Last update timestamp                       |

### quality_cards
Quality inspection cards linked to pallets.
| Column           | Type         | Description                                   |
|------------------|--------------|-----------------------------------------------|
| id               | uuid (PK)    | Quality card ID                               |
| card_number      | text (UQ)    | Unique card number (system-generated)         |
| pallet_id        | uuid (FK)    | References pallets (nullable until linked)    |
| inspection_result| text         | PENDING, APPROVED, REJECTED                   |
| inspector_id     | uuid         | User who performed the inspection             |
| notes            | text         | Inspection notes                              |
| physical_card_confirmed | boolean | Confirms physical card is attached          |
| inspected_at     | timestamptz  | Inspection timestamp                          |
| created_at       | timestamptz  | Creation timestamp                            |

## Security
- RLS enabled on ALL tables.
- All tables: authenticated users can SELECT (shared factory data).
- INSERT/UPDATE: authenticated users can create and modify production data.
- Column-restricted UPDATE on work_orders (status changes via RPC only, not direct update).
- Grants: SELECT to authenticated on all; INSERT/UPDATE to authenticated on products, machines,
  production_routes, production_stages, work_orders, quality_cards.

## Important Notes
1. work_orders.wo_number is auto-generated via a sequence and a SECURITY DEFINER function.
2. quality_cards.card_number is auto-generated via a sequence.
3. production_stages are ordered by sequence_order within each route.
4. No production stages are pre-populated — they must be approved before use.
*/

-- ============================================================
-- 1. PRODUCTS TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS products (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_code       text UNIQUE NOT NULL,
  name            text NOT NULL,
  name_en         text,
  description     text,
  unit_of_measure text NOT NULL DEFAULT 'piece',
  category        text,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON products TO authenticated;
GRANT INSERT, UPDATE ON products TO authenticated;

DROP POLICY IF EXISTS "products_select_authenticated" ON products;
CREATE POLICY "products_select_authenticated"
  ON products FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "products_insert_authenticated" ON products;
CREATE POLICY "products_insert_authenticated"
  ON products FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "products_update_authenticated" ON products;
CREATE POLICY "products_update_authenticated"
  ON products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 2. MACHINES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS machines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  machine_code    text UNIQUE NOT NULL,
  name            text NOT NULL,
  work_center     text,
  capacity_per_hr numeric(10,2),
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON machines TO authenticated;
GRANT INSERT, UPDATE ON machines TO authenticated;

DROP POLICY IF EXISTS "machines_select_authenticated" ON machines;
CREATE POLICY "machines_select_authenticated"
  ON machines FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "machines_insert_authenticated" ON machines;
CREATE POLICY "machines_insert_authenticated"
  ON machines FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "machines_update_authenticated" ON machines;
CREATE POLICY "machines_update_authenticated"
  ON machines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 3. PRODUCTION ROUTES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS production_routes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code  text UNIQUE NOT NULL,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_routes ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON production_routes TO authenticated;
GRANT INSERT, UPDATE ON production_routes TO authenticated;

DROP POLICY IF EXISTS "routes_select_authenticated" ON production_routes;
CREATE POLICY "routes_select_authenticated"
  ON production_routes FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "routes_insert_authenticated" ON production_routes;
CREATE POLICY "routes_insert_authenticated"
  ON production_routes FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "routes_update_authenticated" ON production_routes;
CREATE POLICY "routes_update_authenticated"
  ON production_routes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 4. PRODUCTION STAGES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS production_stages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id      uuid NOT NULL REFERENCES production_routes(id) ON DELETE CASCADE,
  stage_code    text UNIQUE NOT NULL,
  name          text NOT NULL,
  name_en       text,
  sequence_order int NOT NULL DEFAULT 1,
  machine_id    uuid REFERENCES machines(id) ON DELETE SET NULL,
  is_active     boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE production_stages ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON production_stages TO authenticated;
GRANT INSERT, UPDATE ON production_stages TO authenticated;

DROP POLICY IF EXISTS "stages_select_authenticated" ON production_stages;
CREATE POLICY "stages_select_authenticated"
  ON production_stages FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "stages_insert_authenticated" ON production_stages;
CREATE POLICY "stages_insert_authenticated"
  ON production_stages FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "stages_update_authenticated" ON production_stages;
CREATE POLICY "stages_update_authenticated"
  ON production_stages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 5. WORK ORDERS TABLE + SEQUENCE
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS work_order_seq START 1;

CREATE TABLE IF NOT EXISTS work_orders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_number           text UNIQUE NOT NULL,
  product_id          uuid NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  production_route_id uuid NOT NULL REFERENCES production_routes(id) ON DELETE RESTRICT,
  planned_quantity    numeric(14,2) NOT NULL DEFAULT 0,
  status              text NOT NULL DEFAULT 'CREATED'
                      CHECK (status IN ('CREATED', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  scheduled_date      date,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE work_orders ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON work_orders TO authenticated;
GRANT INSERT, UPDATE (product_id, production_route_id, planned_quantity, scheduled_date) ON work_orders TO authenticated;
GRANT USAGE ON SEQUENCE work_order_seq TO authenticated;

DROP POLICY IF EXISTS "wo_select_authenticated" ON work_orders;
CREATE POLICY "wo_select_authenticated"
  ON work_orders FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "wo_insert_authenticated" ON work_orders;
CREATE POLICY "wo_insert_authenticated"
  ON work_orders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "wo_update_authenticated" ON work_orders;
CREATE POLICY "wo_update_authenticated"
  ON work_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Function to generate WO number
CREATE OR REPLACE FUNCTION public.generate_wo_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  year_str text;
BEGIN
  next_val := nextval('public.work_order_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'WO-' || year_str || '-' || lpad(next_val::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_wo_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_wo_number() TO authenticated;

-- Trigger to auto-generate WO number on insert
CREATE OR REPLACE FUNCTION public.set_wo_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.wo_number IS NULL OR NEW.wo_number = '' THEN
    NEW.wo_number := public.generate_wo_number();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_wo_number() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS wo_number_trigger ON work_orders;
CREATE TRIGGER wo_number_trigger
  BEFORE INSERT ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.set_wo_number();

-- updated_at trigger for work_orders
DROP TRIGGER IF EXISTS wo_updated_at ON work_orders;
CREATE TRIGGER wo_updated_at
  BEFORE UPDATE ON work_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 6. QUALITY CARDS TABLE + SEQUENCE
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS quality_card_seq START 1;

CREATE TABLE IF NOT EXISTS quality_cards (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  card_number            text UNIQUE NOT NULL,
  pallet_id              uuid,
  inspection_result      text NOT NULL DEFAULT 'PENDING'
                         CHECK (inspection_result IN ('PENDING', 'APPROVED', 'REJECTED')),
  inspector_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  notes                  text,
  physical_card_confirmed boolean NOT NULL DEFAULT false,
  inspected_at           timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quality_cards ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON quality_cards TO authenticated;
GRANT INSERT, UPDATE ON quality_cards TO authenticated;
GRANT USAGE ON SEQUENCE quality_card_seq TO authenticated;

DROP POLICY IF EXISTS "qc_select_authenticated" ON quality_cards;
CREATE POLICY "qc_select_authenticated"
  ON quality_cards FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "qc_insert_authenticated" ON quality_cards;
CREATE POLICY "qc_insert_authenticated"
  ON quality_cards FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "qc_update_authenticated" ON quality_cards;
CREATE POLICY "qc_update_authenticated"
  ON quality_cards FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Function to generate quality card number
CREATE OR REPLACE FUNCTION public.generate_qc_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_val bigint;
  year_str text;
BEGIN
  next_val := nextval('public.quality_card_seq');
  year_str := to_char(now(), 'YYYY');
  RETURN 'QC-' || year_str || '-' || lpad(next_val::text, 5, '0');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_qc_number() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_qc_number() TO authenticated;

-- Trigger to auto-generate card number on insert
CREATE OR REPLACE FUNCTION public.set_qc_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.card_number IS NULL OR NEW.card_number = '' THEN
    NEW.card_number := public.generate_qc_number();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_qc_number() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS qc_number_trigger ON quality_cards;
CREATE TRIGGER qc_number_trigger
  BEFORE INSERT ON quality_cards
  FOR EACH ROW
  EXECUTE FUNCTION public.set_qc_number();
/*
# Phase 5 — Woodworking Routing & Workflow Engine

## Overview
Implements a configurable routing system for woodworking production with versioning,
stage transitions, branching (Lengths vs Fronts/Backs), and item routing rules.

## New Tables
1. `routing_templates` — top-level routing definition with applicability
2. `routing_versions` — versioned routing with DRAFT/ACTIVE/RETIRED status
3. `routing_stages` — individual operations in a routing version
4. `stage_transitions` — allowed source→destination stage moves
5. `routing_item_rules` — which item types/models use which routing

## Confirmed Routes
- ROUTE A (LENGTHS): Initial Cutting → Milling → PVC Gluing → Tathir → V-Cutting
- ROUTE B (FRONTS & BACKS): Initial Cutting → PVC Gluing → Final Cutting → Openings
- Initial Cutting is shared; branching happens after it.

## Security
- RLS enabled on all new tables, CRUD granted to authenticated.
*/

-- ============================================================
-- 1. Routing Templates
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  route_code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  product_model_applicability text DEFAULT 'ALL',
  item_type_applicability text DEFAULT 'ALL',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE routing_templates ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON routing_templates TO authenticated;

DROP POLICY IF EXISTS "rt_select_auth" ON routing_templates;
CREATE POLICY "rt_select_auth" ON routing_templates FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rt_insert_auth" ON routing_templates;
CREATE POLICY "rt_insert_auth" ON routing_templates FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rt_update_auth" ON routing_templates;
CREATE POLICY "rt_update_auth" ON routing_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rt_delete_auth" ON routing_templates;
CREATE POLICY "rt_delete_auth" ON routing_templates FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 2. Routing Versions
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_template_id uuid NOT NULL REFERENCES routing_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  effective_date date,
  status text NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT','ACTIVE','RETIRED')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routing_template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_rv_template ON routing_versions(routing_template_id);

ALTER TABLE routing_versions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON routing_versions TO authenticated;

DROP POLICY IF EXISTS "rv_select_auth" ON routing_versions;
CREATE POLICY "rv_select_auth" ON routing_versions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rv_insert_auth" ON routing_versions;
CREATE POLICY "rv_insert_auth" ON routing_versions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rv_update_auth" ON routing_versions;
CREATE POLICY "rv_update_auth" ON routing_versions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rv_delete_auth" ON routing_versions;
CREATE POLICY "rv_delete_auth" ON routing_versions FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 3. Routing Stages
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_version_id uuid NOT NULL REFERENCES routing_versions(id) ON DELETE CASCADE,
  stage_code text NOT NULL,
  stage_name text NOT NULL,
  stage_name_en text,
  sequence_number integer NOT NULL,
  work_center_id uuid REFERENCES work_centers(id) ON DELETE SET NULL,
  eligible_machine_ids text,
  responsible_role text,
  input_item_type text,
  output_item_type text,
  input_unit text,
  output_unit text,
  quality_approval_required boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(routing_version_id, stage_code)
);

CREATE INDEX IF NOT EXISTS idx_rs_version ON routing_stages(routing_version_id);
CREATE INDEX IF NOT EXISTS idx_rs_sequence ON routing_stages(routing_version_id, sequence_number);

ALTER TABLE routing_stages ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON routing_stages TO authenticated;

DROP POLICY IF EXISTS "rs_select_auth" ON routing_stages;
CREATE POLICY "rs_select_auth" ON routing_stages FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rs_insert_auth" ON routing_stages;
CREATE POLICY "rs_insert_auth" ON routing_stages FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rs_update_auth" ON routing_stages;
CREATE POLICY "rs_update_auth" ON routing_stages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rs_delete_auth" ON routing_stages;
CREATE POLICY "rs_delete_auth" ON routing_stages FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 4. Stage Transitions
-- ============================================================

CREATE TABLE IF NOT EXISTS stage_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_version_id uuid NOT NULL REFERENCES routing_versions(id) ON DELETE CASCADE,
  source_stage_id uuid REFERENCES routing_stages(id) ON DELETE CASCADE,
  destination_stage_id uuid NOT NULL REFERENCES routing_stages(id) ON DELETE CASCADE,
  transition_rules text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_st_version ON stage_transitions(routing_version_id);
CREATE INDEX IF NOT EXISTS idx_st_source ON stage_transitions(source_stage_id);

ALTER TABLE stage_transitions ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON stage_transitions TO authenticated;

DROP POLICY IF EXISTS "st_select_auth" ON stage_transitions;
CREATE POLICY "st_select_auth" ON stage_transitions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "st_insert_auth" ON stage_transitions;
CREATE POLICY "st_insert_auth" ON stage_transitions FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "st_update_auth" ON stage_transitions;
CREATE POLICY "st_update_auth" ON stage_transitions FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "st_delete_auth" ON stage_transitions;
CREATE POLICY "st_delete_auth" ON stage_transitions FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 5. Routing Item Rules
-- ============================================================

CREATE TABLE IF NOT EXISTS routing_item_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routing_template_id uuid NOT NULL REFERENCES routing_templates(id) ON DELETE CASCADE,
  item_type text,
  product_model_id uuid REFERENCES product_models(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rir_template ON routing_item_rules(routing_template_id);

ALTER TABLE routing_item_rules ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON routing_item_rules TO authenticated;

DROP POLICY IF EXISTS "rir_select_auth" ON routing_item_rules;
CREATE POLICY "rir_select_auth" ON routing_item_rules FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "rir_insert_auth" ON routing_item_rules;
CREATE POLICY "rir_insert_auth" ON routing_item_rules FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "rir_update_auth" ON routing_item_rules;
CREATE POLICY "rir_update_auth" ON routing_item_rules FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "rir_delete_auth" ON routing_item_rules;
CREATE POLICY "rir_delete_auth" ON routing_item_rules FOR DELETE TO authenticated USING (true);

-- ============================================================
-- 6. RPC: Activate Routing Version (SECURITY DEFINER)
--    Retires any currently ACTIVE version for the same template,
--    then activates the new one. Prevents two active versions.
-- ============================================================

CREATE OR REPLACE FUNCTION activate_routing_version(
  p_version_id uuid,
  p_approved_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template_id uuid;
BEGIN
  SELECT routing_template_id INTO v_template_id FROM routing_versions WHERE id = p_version_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Routing version not found: %', p_version_id;
  END IF;

  -- Retire any currently active version for this template
  UPDATE routing_versions SET status = 'RETIRED', updated_at = now()
    WHERE routing_template_id = v_template_id AND status = 'ACTIVE';

  -- Activate the new version
  UPDATE routing_versions
    SET status = 'ACTIVE', approved_by = p_approved_by, updated_at = now()
    WHERE id = p_version_id;

  RETURN p_version_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION activate_routing_version(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION activate_routing_version(uuid, uuid) TO authenticated;

import { supabase } from '@/lib/supabase';
import type {
  RoutingTemplate, RoutingVersion, RoutingStage,
  StageTransition, RoutingItemRule, RoutingVersionStatus,
  WorkCenter,
} from '@/types';

// ============================================================
// Routing Templates
// ============================================================

export async function fetchRoutingTemplates(search?: string) {
  let query = supabase
    .from('routing_templates')
    .select('*')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`route_code.ilike.%${search}%,name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as RoutingTemplate[];
}

export async function fetchRoutingTemplate(id: string) {
  const { data, error } = await supabase
    .from('routing_templates')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as RoutingTemplate | null;
}

export async function createRoutingTemplate(fields: {
  route_code: string;
  name: string;
  description?: string;
  product_model_applicability?: string;
  item_type_applicability?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('routing_templates')
    .insert({
      ...fields,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingTemplate;
}

export async function updateRoutingTemplate(
  id: string,
  fields: Partial<Pick<RoutingTemplate, 'name' | 'description' | 'product_model_applicability' | 'item_type_applicability' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('routing_templates')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingTemplate;
}

// ============================================================
// Routing Versions
// ============================================================

export async function fetchRoutingVersions(templateId?: string) {
  let query = supabase
    .from('routing_versions')
    .select('*')
    .order('version_number', { ascending: false });
  if (templateId) query = query.eq('routing_template_id', templateId);
  const { data, error } = await query;
  if (error) throw error;
  return data as RoutingVersion[];
}

export async function createRoutingVersion(templateId: string, versionNumber: number, effectiveDate?: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('routing_versions')
    .insert({
      routing_template_id: templateId,
      version_number: versionNumber,
      effective_date: effectiveDate ?? null,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingVersion;
}

export async function activateRoutingVersion(versionId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('activate_routing_version', {
    p_version_id: versionId,
    p_approved_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function retireRoutingVersion(versionId: string) {
  const { data, error } = await supabase
    .from('routing_versions')
    .update({ status: 'RETIRED' as RoutingVersionStatus, updated_at: new Date().toISOString() })
    .eq('id', versionId)
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingVersion;
}

// ============================================================
// Routing Stages
// ============================================================

export async function fetchRoutingStages(versionId: string) {
  const { data, error } = await supabase
    .from('routing_stages')
    .select('*, work_center:work_centers(*)')
    .eq('routing_version_id', versionId)
    .order('sequence_number', { ascending: true });
  if (error) throw error;
  return data as (RoutingStage & { work_center: WorkCenter | null })[];
}

export async function createRoutingStage(fields: {
  routing_version_id: string;
  stage_code: string;
  stage_name: string;
  stage_name_en?: string;
  sequence_number: number;
  work_center_id?: string;
  responsible_role?: string;
  input_item_type?: string;
  output_item_type?: string;
  input_unit?: string;
  output_unit?: string;
  quality_approval_required?: boolean;
}) {
  const { data, error } = await supabase
    .from('routing_stages')
    .insert({
      ...fields,
      work_center_id: fields.work_center_id || null,
      responsible_role: fields.responsible_role || null,
      input_item_type: fields.input_item_type || null,
      output_item_type: fields.output_item_type || null,
      input_unit: fields.input_unit || null,
      output_unit: fields.output_unit || null,
      quality_approval_required: fields.quality_approval_required ?? false,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingStage;
}

export async function updateRoutingStage(
  id: string,
  fields: Partial<Pick<RoutingStage,
    'stage_name' | 'stage_name_en' | 'sequence_number' | 'work_center_id' |
    'responsible_role' | 'input_item_type' | 'output_item_type' |
    'input_unit' | 'output_unit' | 'quality_approval_required' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('routing_stages')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingStage;
}

export async function deleteRoutingStage(id: string) {
  const { error } = await supabase
    .from('routing_stages')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Stage Transitions
// ============================================================

export async function fetchStageTransitions(versionId: string) {
  const { data, error } = await supabase
    .from('stage_transitions')
    .select('*, source:routing_stages!source_stage_id(*), destination:routing_stages!destination_stage_id(*)')
    .eq('routing_version_id', versionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as (StageTransition & {
    source: RoutingStage | null;
    destination: RoutingStage;
  })[];
}

export async function createStageTransition(fields: {
  routing_version_id: string;
  source_stage_id?: string | null;
  destination_stage_id: string;
  transition_rules?: string;
}) {
  const { data, error } = await supabase
    .from('stage_transitions')
    .insert({
      routing_version_id: fields.routing_version_id,
      source_stage_id: fields.source_stage_id || null,
      destination_stage_id: fields.destination_stage_id,
      transition_rules: fields.transition_rules || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as StageTransition;
}

export async function deleteStageTransition(id: string) {
  const { error } = await supabase
    .from('stage_transitions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Routing Item Rules
// ============================================================

export async function fetchRoutingItemRules(templateId?: string) {
  let query = supabase
    .from('routing_item_rules')
    .select('*, template:routing_templates(*), model:product_models(*)')
    .order('created_at', { ascending: false });
  if (templateId) query = query.eq('routing_template_id', templateId);
  const { data, error } = await query;
  if (error) throw error;
  return data as (RoutingItemRule & {
    template: RoutingTemplate;
    model: { id: string; model_code: string; name: string } | null;
  })[];
}

export async function createRoutingItemRule(fields: {
  routing_template_id: string;
  item_type?: string;
  product_model_id?: string;
}) {
  const { data, error } = await supabase
    .from('routing_item_rules')
    .insert({
      routing_template_id: fields.routing_template_id,
      item_type: fields.item_type || null,
      product_model_id: fields.product_model_id || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as RoutingItemRule;
}

export async function deleteRoutingItemRule(id: string) {
  const { error } = await supabase
    .from('routing_item_rules')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

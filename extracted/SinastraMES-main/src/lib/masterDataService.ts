import { supabase } from '@/lib/supabase';
import type {
  ProductFamily, ProductModel, ItemMaster,
  BOMHeader, BOMLine, BOMLineInput,
  KitTemplate, KitTemplateLine,
} from '@/types';

// ============================================================
// Product Families
// ============================================================

export async function fetchProductFamilies(search?: string) {
  let query = supabase.from('product_families').select('*').order('created_at', { ascending: false });
  if (search) query = query.or(`family_code.ilike.%${search}%,name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as ProductFamily[];
}

export async function fetchProductFamily(id: string) {
  const { data, error } = await supabase
    .from('product_families').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ProductFamily | null;
}

export async function createProductFamily(
  familyCode: string, name: string, description?: string,
) {
  const { data, error } = await supabase
    .from('product_families')
    .insert({ family_code: familyCode, name, description })
    .select('*').single();
  if (error) throw error;
  return data as ProductFamily;
}

export async function updateProductFamily(
  id: string, fields: Partial<Pick<ProductFamily, 'name' | 'description' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('product_families').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as ProductFamily;
}

export async function toggleProductFamilyActive(id: string, isActive: boolean) {
  return updateProductFamily(id, { is_active: isActive });
}

// ============================================================
// Product Models
// ============================================================

export async function fetchProductModels(search?: string, familyId?: string) {
  let query = supabase
    .from('product_models')
    .select('*, family:product_families(*)')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`model_code.ilike.%${search}%,name.ilike.%${search}%`);
  if (familyId) query = query.eq('family_id', familyId);
  const { data, error } = await query;
  if (error) throw error;
  return data as (ProductModel & { family: ProductFamily })[];
}

export async function fetchProductModel(id: string) {
  const { data, error } = await supabase
    .from('product_models')
    .select('*, family:product_families(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data as (ProductModel & { family: ProductFamily }) | null;
}

export async function createProductModel(
  modelCode: string, name: string, familyId: string,
  productType: string, kitType: string,
  description?: string, dimensions?: { length_mm?: number; width_mm?: number; height_mm?: number },
) {
  const { data, error } = await supabase
    .from('product_models')
    .insert({
      model_code: modelCode, name, family_id: familyId,
      product_type: productType, kit_type: kitType,
      description, ...dimensions,
    })
    .select('*').single();
  if (error) throw error;
  return data as ProductModel;
}

export async function updateProductModel(
  id: string, fields: Partial<Pick<ProductModel,
    'name' | 'family_id' | 'product_type' | 'kit_type' | 'description' |
    'length_mm' | 'width_mm' | 'height_mm' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('product_models').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as ProductModel;
}

export async function toggleProductModelActive(id: string, isActive: boolean) {
  return updateProductModel(id, { is_active: isActive });
}

// ============================================================
// Item Master
// ============================================================

export async function fetchItems(search?: string, category?: string, activeOnly?: boolean) {
  let query = supabase.from('item_master').select('*').order('created_at', { ascending: false });
  if (search) query = query.or(`item_code.ilike.%${search}%,name.ilike.%${search}%`);
  if (category) query = query.eq('category', category);
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as ItemMaster[];
}

export async function fetchItem(id: string) {
  const { data, error } = await supabase
    .from('item_master').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as ItemMaster | null;
}

export async function createItem(
  itemCode: string, name: string, category: string,
  itemType: string, unitOfMeasure: string,
  dimensions?: { length_mm?: number; width_mm?: number; thickness_mm?: number },
  description?: string,
) {
  const { data, error } = await supabase
    .from('item_master')
    .insert({
      item_code: itemCode, name, category,
      item_type: itemType, unit_of_measure: unitOfMeasure,
      description, ...dimensions,
    })
    .select('*').single();
  if (error) throw error;
  return data as ItemMaster;
}

export async function updateItem(
  id: string, fields: Partial<Pick<ItemMaster,
    'name' | 'category' | 'item_type' | 'unit_of_measure' |
    'length_mm' | 'width_mm' | 'thickness_mm' | 'description' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('item_master').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as ItemMaster;
}

export async function toggleItemActive(id: string, isActive: boolean) {
  return updateItem(id, { is_active: isActive });
}

// ============================================================
// BOM Headers & Lines
// ============================================================

export async function fetchBOMHeaders(modelId?: string) {
  let query = supabase
    .from('bom_headers')
    .select('*, model:product_models(*, family:product_families(*))')
    .order('created_at', { ascending: false });
  if (modelId) query = query.eq('product_model_id', modelId);
  const { data, error } = await query;
  if (error) throw error;
  return data as (BOMHeader & {
    model: ProductModel & { family: ProductFamily };
  })[];
}

export async function fetchBOMHeader(id: string) {
  const { data, error } = await supabase
    .from('bom_headers')
    .select('*, model:product_models(*, family:product_families(*))')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data as (BOMHeader & {
    model: ProductModel & { family: ProductFamily };
  }) | null;
}

export async function fetchBOMLines(bomHeaderId: string) {
  const { data, error } = await supabase
    .from('bom_lines')
    .select('*, item:item_master(*)')
    .eq('bom_header_id', bomHeaderId)
    .order('component_role', { ascending: true });
  if (error) throw error;
  return data as (BOMLine & { item: ItemMaster })[];
}

export async function createBOMWithLines(
  modelId: string, version: string,
  effectiveDate: string | null,
  lines: BOMLineInput[],
) {
  const { data, error } = await supabase.rpc('create_bom_with_lines', {
    p_model_id: modelId,
    p_version: version,
    p_effective_date: effectiveDate,
    p_lines: JSON.parse(JSON.stringify(lines)),
  });
  if (error) throw error;
  return data as string;
}

export async function activateBOMVersion(bomHeaderId: string) {
  const { data, error } = await supabase.rpc('activate_bom_version', {
    p_bom_header_id: bomHeaderId,
  });
  if (error) throw error;
  return data as BOMHeader;
}

export async function deleteBOMLine(lineId: string) {
  const { error } = await supabase.from('bom_lines').delete().eq('id', lineId);
  if (error) throw error;
}

export async function addBOMLine(
  bomHeaderId: string, itemId: string, itemCode: string,
  requiredQty: number, unitOfMeasure: string, componentRole: string,
  notes?: string,
) {
  const { data, error } = await supabase
    .from('bom_lines')
    .insert({
      bom_header_id: bomHeaderId, item_id: itemId, item_code: itemCode,
      required_qty: requiredQty, unit_of_measure: unitOfMeasure,
      component_role: componentRole, notes,
    })
    .select('*').single();
  if (error) throw error;
  return data as BOMLine;
}

// ============================================================
// Kit Templates
// ============================================================

export async function fetchKitTemplates() {
  const { data: templates, error: e1 } = await supabase
    .from('kit_templates').select('*').order('kit_type');
  if (e1) throw e1;

  const { data: lines, error: e2 } = await supabase
    .from('kit_template_lines').select('*').order('sort_order');
  if (e2) throw e2;

  return (templates as KitTemplate[]).map(t => ({
    ...t,
    lines: (lines as KitTemplateLine[]).filter(l => l.kit_template_id === t.id),
  }));
}

import { supabase } from '@/lib/supabase';
import type {
  ProductModel, Machine, ItemMaster, WorkOrder, QualityGateStatus,
  MasterPlan, MasterPlanItem, MonthlyPlan, MonthlyPlanItem,
  SubWorkOrder, ScrapRecord, OeeSnapshot,
} from '@/types';

// ============================================================
// Types
// ============================================================

export type MasterPlanWithItems = MasterPlan & {
  items: (MasterPlanItem & { model: ProductModel })[];
};

export type MonthlyPlanWithItems = MonthlyPlan & {
  master_plan: MasterPlan | null;
  items: (MonthlyPlanItem & {
    model: ProductModel;
    work_order: Pick<WorkOrder, 'id' | 'wo_number' | 'status' | 'quality_status' | 'warehouse_transferred' | 'planned_quantity' | 'actual_quantity'> | null;
  })[];
};

export type SimplifiedWorkOrder = Pick<WorkOrder,
  'id' | 'wo_number' | 'status' | 'planned_quantity' | 'actual_quantity' |
  'quality_status' | 'warehouse_transferred' |
  'planned_start_time' | 'planned_end_time' | 'actual_start_time' | 'actual_end_time'
> & {
  model: Pick<ProductModel, 'id' | 'name' | 'model_code'> | null;
  monthly_plan_item_id: string | null;
  master_plan_item_id: string | null;
};

export type SubWorkOrderWithRelations = SubWorkOrder & {
  machine: Pick<Machine, 'id' | 'name' | 'machine_code'> | null;
  material_item: Pick<ItemMaster, 'id' | 'name' | 'item_code' | 'unit_of_measure' | 'is_raw_material' | 'material_classification'> | null;
  work_order?: { wo_number: string } | null;
};

export interface OeeResult {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  planned_minutes: number;
  actual_minutes: number;
  good_qty: number;
  total_qty: number;
}

// ============================================================
// Master Plan
// ============================================================

export async function fetchMasterPlans(): Promise<MasterPlan[]> {
  const { data, error } = await supabase
    .from('master_plan')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as MasterPlan[];
}

export async function fetchMasterPlanItems(planId: string): Promise<(MasterPlanItem & { model: ProductModel })[]> {
  const { data, error } = await supabase
    .from('master_plan_items')
    .select('*, model:product_models(*)')
    .eq('master_plan_id', planId)
    .order('sequence_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (MasterPlanItem & { model: ProductModel })[];
}

export async function createMasterPlan(name: string, description?: string): Promise<MasterPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  const code = 'MP-' + Date.now().toString(36).toUpperCase();
  const { data, error } = await supabase
    .from('master_plan')
    .insert({ plan_code: code, name, description: description ?? null, created_by: user?.id ?? null })
    .select('*')
    .single();
  if (error) throw error;
  return data as MasterPlan;
}

export async function approveMasterPlan(planId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('master_plan')
    .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
    .eq('id', planId);
  if (error) throw error;
}

export async function addMasterPlanItem(fields: {
  master_plan_id: string;
  product_model_id: string;
  sequence_order: number;
  target_quantity: number;
  unit_of_measure?: string;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('master_plan_items')
    .insert({
      master_plan_id: fields.master_plan_id,
      product_model_id: fields.product_model_id,
      sequence_order: fields.sequence_order,
      target_quantity: fields.target_quantity,
      unit_of_measure: fields.unit_of_measure ?? 'PCS',
      notes: fields.notes ?? null,
    });
  if (error) throw error;
}

export async function deleteMasterPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('master_plan_items').delete().eq('id', id);
  if (error) throw error;
}

export async function updateMasterPlanItem(id: string, fields: Partial<Pick<MasterPlanItem, 'sequence_order' | 'target_quantity' | 'notes'>>): Promise<void> {
  const { error } = await supabase.from('master_plan_items').update(fields).eq('id', id);
  if (error) throw error;
}

// ============================================================
// Monthly Plan
// ============================================================

export async function fetchMonthlyPlans(): Promise<MonthlyPlan[]> {
  const { data, error } = await supabase
    .from('monthly_plan')
    .select('*, master_plan:master_plan(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as MonthlyPlan[];
}

export async function fetchMonthlyPlanItems(planId: string): Promise<(MonthlyPlanItem & {
  model: ProductModel;
  work_order: Pick<WorkOrder, 'id' | 'wo_number' | 'status' | 'quality_status' | 'warehouse_transferred' | 'planned_quantity' | 'actual_quantity'> | null;
})[]> {
  const { data, error } = await supabase
    .from('monthly_plan_items')
    .select('*, model:product_models(*), work_order:work_orders!monthly_plan_items_work_order_id_fkey(id, wo_number, status, quality_status, warehouse_transferred, planned_quantity, actual_quantity)')
    .eq('monthly_plan_id', planId)
    .order('sequence_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as (MonthlyPlanItem & {
    model: ProductModel;
    work_order: Pick<WorkOrder, 'id' | 'wo_number' | 'status' | 'quality_status' | 'warehouse_transferred' | 'planned_quantity' | 'actual_quantity'> | null;
  })[];
}

export async function createMonthlyPlan(masterPlanId: string, name: string, planMonth: string): Promise<MonthlyPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  const code = 'MO-' + Date.now().toString(36).toUpperCase();
  const { data, error } = await supabase
    .from('monthly_plan')
    .insert({
      plan_code: code,
      name,
      master_plan_id: masterPlanId,
      plan_month: planMonth,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as MonthlyPlan;
}

export async function approveMonthlyPlan(planId: string): Promise<number> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('approve_monthly_and_generate_wos', {
    p_plan_id: planId,
    p_approved_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as number;
}

export async function copyMasterPlanItemsToMonthly(masterPlanId: string, monthlyPlanId: string): Promise<number> {
  const items = await fetchMasterPlanItems(masterPlanId);
  if (items.length === 0) return 0;

  const rows = items.map((item, idx) => ({
    monthly_plan_id: monthlyPlanId,
    master_plan_item_id: item.id,
    product_model_id: item.product_model_id,
    sequence_order: item.sequence_order,
    planned_quantity: item.target_quantity,
    unit_of_measure: item.unit_of_measure,
    status: 'PENDING',
  }));

  const { error } = await supabase.from('monthly_plan_items').insert(rows);
  if (error) throw error;
  return rows.length;
}

export async function updateMonthlyPlanItem(id: string, fields: Partial<Pick<MonthlyPlanItem, 'planned_quantity' | 'planned_start_date' | 'planned_end_date' | 'sequence_order' | 'notes' | 'status'>>): Promise<void> {
  const { error } = await supabase.from('monthly_plan_items').update(fields).eq('id', id);
  if (error) throw error;
}

export async function deleteMonthlyPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('monthly_plan_items').delete().eq('id', id);
  if (error) throw error;
}

export async function generateWorkOrderForMonthlyItem(monthlyPlanItemId: string): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('auto_create_work_order_from_monthly_item', {
    p_monthly_plan_item_id: monthlyPlanItemId,
    p_created_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Work Orders (simplified)
// ============================================================

export async function fetchSimplifiedWorkOrders(search?: string, status?: string): Promise<SimplifiedWorkOrder[]> {
  let query = supabase
    .from('work_orders')
    .select(`
      id, wo_number, status, planned_quantity, actual_quantity,
      quality_status, warehouse_transferred,
      planned_start_time, planned_end_time, actual_start_time, actual_end_time,
      monthly_plan_item_id, master_plan_item_id,
      model:product_models(id, name, model_code)
    `)
    .not('monthly_plan_item_id', 'is', null)
    .order('created_at', { ascending: false });
  if (search) query = query.ilike('wo_number', `%${search}%`);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as SimplifiedWorkOrder[];
}

export async function fetchWorkOrderDetail(woId: string): Promise<SimplifiedWorkOrder | null> {
  const { data, error } = await supabase
    .from('work_orders')
    .select(`
      id, wo_number, status, planned_quantity, actual_quantity,
      quality_status, warehouse_transferred,
      planned_start_time, planned_end_time, actual_start_time, actual_end_time,
      monthly_plan_item_id, master_plan_item_id,
      model:product_models(id, name, model_code)
    `)
    .eq('id', woId)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SimplifiedWorkOrder | null;
}

// ============================================================
// Sub Work Orders
// ============================================================

export async function fetchSubWorkOrders(woId: string): Promise<SubWorkOrderWithRelations[]> {
  const { data, error } = await supabase
    .from('sub_work_orders')
    .select(`
      *,
      machine:machines(id, name, machine_code),
      material_item:item_master(id, name, item_code, unit_of_measure, is_raw_material, material_classification)
    `)
    .eq('work_order_id', woId)
    .order('sequence_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as unknown as SubWorkOrderWithRelations[];
}

export async function startSubWorkOrder(subWoId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('sub_work_orders')
    .update({ status: 'IN_PROGRESS', actual_start_time: now, updated_at: now })
    .eq('id', subWoId);
  if (error) throw error;

  // Also update parent WO to IN_PROGRESS + actual_start_time if not set
  const { data: sub } = await supabase.from('sub_work_orders').select('work_order_id').eq('id', subWoId).single();
  if (sub) {
    await supabase
      .from('work_orders')
      .update({ status: 'IN_PROGRESS', actual_start_time: now, updated_at: now })
      .eq('id', sub.work_order_id)
      .is('actual_start_time', null);
  }
}

export async function completeSubWorkOrder(fields: {
  sub_wo_id: string;
  good_qty: number;
  scrap_qty: number;
  reject_qty: number;
  labor_count?: number;
  material_item_id?: string;
  material_qty?: number;
  material_unit?: string;
  notes?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    status: 'COMPLETED',
    good_quantity: fields.good_qty,
    scrap_quantity: fields.scrap_qty,
    reject_quantity: fields.reject_qty,
    actual_end_time: now,
    updated_at: now,
  };
  if (fields.labor_count !== undefined) update.labor_count = fields.labor_count;
  if (fields.material_item_id !== undefined) update.material_item_id = fields.material_item_id ?? null;
  if (fields.material_qty !== undefined) update.material_qty = fields.material_qty;
  if (fields.material_unit !== undefined) update.material_unit = fields.material_unit;
  if (fields.notes !== undefined) update.notes = fields.notes;

  const { error } = await supabase.from('sub_work_orders').update(update).eq('id', fields.sub_wo_id);
  if (error) throw error;

  // Update parent WO actual_quantity (sum of good)
  const { data: sub } = await supabase.from('sub_work_orders').select('work_order_id').eq('id', fields.sub_wo_id).single();
  if (sub) {
    const { data: subs } = await supabase
      .from('sub_work_orders')
      .select('good_quantity')
      .eq('work_order_id', sub.work_order_id);
    const totalGood = (subs ?? []).reduce((s: number, x: { good_quantity: number }) => s + Number(x.good_quantity), 0);
    await supabase
      .from('work_orders')
      .update({ actual_quantity: totalGood, actual_end_time: now, updated_at: now })
      .eq('id', sub.work_order_id);
  }
}

export async function assignSubWorkOrderMachine(subWoId: string, machineId: string | null): Promise<void> {
  const { error } = await supabase
    .from('sub_work_orders')
    .update({ machine_id: machineId, updated_at: new Date().toISOString() })
    .eq('id', subWoId);
  if (error) throw error;
}

// ============================================================
// Quality Gate
// ============================================================

export async function setSubWorkOrderQuality(subWoId: string, status: QualityGateStatus): Promise<void> {
  const { error } = await supabase.rpc('set_sub_work_order_quality', {
    p_sub_wo_id: subWoId,
    p_quality_status: status,
  });
  if (error) throw error;
}

export async function setWorkOrderQuality(woId: string, status: QualityGateStatus): Promise<void> {
  const { error } = await supabase.rpc('set_work_order_quality', {
    p_wo_id: woId,
    p_quality_status: status,
  });
  if (error) throw error;
}

// ============================================================
// Warehouse Transfer
// ============================================================

export async function transferToWarehouse(woId: string): Promise<void> {
  const { error } = await supabase.rpc('transfer_to_warehouse', { p_wo_id: woId });
  if (error) throw error;
}

// ============================================================
// Scrap Records
// ============================================================

export async function fetchScrapRecords(woId: string): Promise<ScrapRecord[]> {
  const { data, error } = await supabase
    .from('scrap_records')
    .select('*')
    .eq('work_order_id', woId)
    .order('recorded_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScrapRecord[];
}

export async function addScrapRecord(fields: {
  sub_work_order_id: string;
  work_order_id: string;
  quantity: number;
  defect_code?: string;
  reason?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('scrap_records')
    .insert({
      sub_work_order_id: fields.sub_work_order_id,
      work_order_id: fields.work_order_id,
      quantity: fields.quantity,
      defect_code: fields.defect_code ?? null,
      reason: fields.reason ?? null,
      recorded_by: user?.id ?? null,
    });
  if (error) throw error;

  // Update sub work order scrap quantity
  const { data: existing } = await supabase
    .from('sub_work_orders')
    .select('scrap_quantity')
    .eq('id', fields.sub_work_order_id)
    .single();
  if (existing) {
    await supabase
      .from('sub_work_orders')
      .update({ scrap_quantity: Number(existing.scrap_quantity) + fields.quantity, updated_at: new Date().toISOString() })
      .eq('id', fields.sub_work_order_id);
  }
}

// ============================================================
// OEE
// ============================================================

export async function computeOee(woId: string): Promise<OeeResult> {
  const { data, error } = await supabase.rpc('compute_oee', { p_wo_id: woId });
  if (error) throw error;
  return data as unknown as OeeResult;
}

export async function fetchOeeSnapshot(woId: string): Promise<OeeSnapshot | null> {
  const { data, error } = await supabase
    .from('oee_snapshots')
    .select('*')
    .eq('work_order_id', woId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as OeeSnapshot | null;
}

export async function fetchAllOeeSnapshots(): Promise<(OeeSnapshot & { work_order?: { id: string; wo_number: string; model?: { name: string } } })[]> {
  const { data, error } = await supabase
    .from('oee_snapshots')
    .select(`
      *,
      work_order:work_orders(id, wo_number, model:product_models(name))
    `)
    .order('computed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as (OeeSnapshot & { work_order?: { id: string; wo_number: string; model?: { name: string } } })[];
}

// ============================================================
// Dashboard
// ============================================================

export async function fetchMesDashboard(): Promise<{
  totalWorkOrders: number;
  qualityPendingCount: number;
  qualityPassedCount: number;
  warehousePendingCount: number;
  totalScrap: number;
  avgOee: number;
}> {
  const { data, error } = await supabase.rpc('get_mes_dashboard');
  if (error) throw error;
  const d = data as unknown as {
    total_work_orders: number;
    quality_pending_count: number;
    quality_passed_count: number;
    warehouse_pending_count: number;
    total_scrap: number;
    avg_oee: number;
  };
  return {
    totalWorkOrders: Number(d.total_work_orders ?? 0),
    qualityPendingCount: Number(d.quality_pending_count ?? 0),
    qualityPassedCount: Number(d.quality_passed_count ?? 0),
    warehousePendingCount: Number(d.warehouse_pending_count ?? 0),
    totalScrap: Number(d.total_scrap ?? 0),
    avgOee: Number(d.avg_oee ?? 0),
  };
}

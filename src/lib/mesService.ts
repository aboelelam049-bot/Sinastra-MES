import { supabase } from '@/lib/supabase';
import type {
  MasterPlan, MasterPlanItem, MonthlyPlan, MonthlyPlanItem,
  SubWorkOrder, ScrapRecord, OeeSnapshot, QualityGateStatus,
  ProductModel, Machine, RoutingStage,
} from '@/types';

// ============================================================
// Joined relation types
// ============================================================

export type MasterPlanWithItems = MasterPlan & { items: (MasterPlanItem & { model: ProductModel })[] };
export type MonthlyPlanWithItems = MonthlyPlan & {
  master: MasterPlan;
  items: (MonthlyPlanItem & { model: ProductModel; work_order: { id: string; wo_number: string; status: string } | null })[];
};
export type SubWorkOrderWithRelations = SubWorkOrder & {
  machine: Machine | null;
  routing_stage: RoutingStage | null;
};

// ============================================================
// Master Plan
// ============================================================

export async function fetchMasterPlans(): Promise<MasterPlan[]> {
  const { data, error } = await supabase
    .from('master_plan')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as MasterPlan[];
}

export async function fetchMasterPlan(id: string): Promise<MasterPlanWithItems | null> {
  const { data: plan, error: e1 } = await supabase
    .from('master_plan')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (e1) throw e1;
  if (!plan) return null;
  const { data: items, error: e2 } = await supabase
    .from('master_plan_items')
    .select('*, model:product_models(*)')
    .eq('master_plan_id', id)
    .order('sequence_order', { ascending: true });
  if (e2) throw e2;
  return { ...(plan as MasterPlan), items: (items ?? []) as (MasterPlanItem & { model: ProductModel })[] };
}

export async function createMasterPlan(name: string, description?: string): Promise<MasterPlan> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('master_plan')
    .insert({ name, description: description ?? null, created_by: user?.id ?? null, status: 'DRAFT' })
    .select('*')
    .single();
  if (error) throw error;
  return data as MasterPlan;
}

export async function addMasterPlanItem(fields: {
  master_plan_id: string;
  product_model_id: string;
  sequence_order: number;
  target_quantity: number;
  unit_of_measure?: string;
  notes?: string;
}): Promise<MasterPlanItem> {
  const { data, error } = await supabase
    .from('master_plan_items')
    .insert({
      master_plan_id: fields.master_plan_id,
      product_model_id: fields.product_model_id,
      sequence_order: fields.sequence_order,
      target_quantity: fields.target_quantity,
      unit_of_measure: fields.unit_of_measure ?? 'PCS',
      notes: fields.notes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as MasterPlanItem;
}

export async function deleteMasterPlanItem(id: string): Promise<void> {
  const { error } = await supabase.from('master_plan_items').delete().eq('id', id);
  if (error) throw error;
}

export async function approveMasterPlan(id: string): Promise<MasterPlan> {
  const { data, error } = await supabase
    .from('master_plan')
    .update({ status: 'APPROVED', updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MasterPlan;
}

// ============================================================
// Monthly Plan
// ============================================================

export async function fetchMonthlyPlans(): Promise<MonthlyPlanWithItems[]> {
  const { data: plans, error: e1 } = await supabase
    .from('monthly_plan')
    .select('*, master:master_plan(*)')
    .order('created_at', { ascending: false });
  if (e1) throw e1;
  const result: MonthlyPlanWithItems[] = [];
  for (const p of (plans ?? []) as (MonthlyPlan & { master: MasterPlan })[]) {
    const { data: items } = await supabase
      .from('monthly_plan_items')
      .select('*, model:product_models(*), work_order:work_orders(id, wo_number, status)')
      .eq('monthly_plan_id', p.id)
      .order('sequence_order', { ascending: true });
    result.push({ ...p, items: (items ?? []) as (MonthlyPlanItem & { model: ProductModel; work_order: { id: string; wo_number: string; status: string } | null })[] });
  }
  return result;
}

export async function fetchMonthlyPlan(id: string): Promise<MonthlyPlanWithItems | null> {
  const { data: p, error: e1 } = await supabase
    .from('monthly_plan')
    .select('*, master:master_plan(*)')
    .eq('id', id)
    .maybeSingle();
  if (e1) throw e1;
  if (!p) return null;
  const { data: items, error: e2 } = await supabase
    .from('monthly_plan_items')
    .select('*, model:product_models(*), work_order:work_orders(id, wo_number, status)')
    .eq('monthly_plan_id', id)
    .order('sequence_order', { ascending: true });
  if (e2) throw e2;
  return { ...(p as MonthlyPlan & { master: MasterPlan }), items: (items ?? []) as (MonthlyPlanItem & { model: ProductModel; work_order: { id: string; wo_number: string; status: string } | null })[] };
}

export async function createMonthlyPlanFromMaster(
  masterPlanId: string,
  planMonth: string,
  name?: string,
): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('create_monthly_plan_from_master', {
    p_master_plan_id: masterPlanId,
    p_plan_month: planMonth,
    p_name: name ?? null,
    p_created_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function approveMonthlyPlan(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('approve_monthly_plan', {
    p_monthly_plan_id: id,
    p_approved_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function updateMonthlyPlanItemDates(
  itemId: string,
  plannedStart?: string | null,
  plannedEnd?: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('monthly_plan_items')
    .update({
      planned_start_date: plannedStart ?? null,
      planned_end_date: plannedEnd ?? null,
    })
    .eq('id', itemId);
  if (error) throw error;
}

// ============================================================
// Work Orders (simplified view)
// ============================================================

export type SimplifiedWorkOrder = {
  id: string;
  wo_number: string;
  product_model_id: string | null;
  planned_quantity: number;
  actual_quantity: number;
  status: string;
  priority: string;
  unit_of_measure: string | null;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  quality_status: QualityGateStatus;
  warehouse_transferred: boolean;
  model: ProductModel | null;
  monthly_plan_item_id: string | null;
};

export async function fetchSimplifiedWorkOrders(search?: string, status?: string): Promise<SimplifiedWorkOrder[]> {
  let q = supabase
    .from('work_orders')
    .select('*, model:product_models(*)')
    .order('created_at', { ascending: false });
  if (search) q = q.or(`wo_number.ilike.%${search}%`);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SimplifiedWorkOrder[];
}

export async function fetchWorkOrderDetail(id: string): Promise<SimplifiedWorkOrder | null> {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, model:product_models(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as SimplifiedWorkOrder | null;
}

export async function updateWorkOrderTimes(id: string, fields: {
  planned_start_time?: string | null;
  planned_end_time?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('work_orders')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Sub Work Orders
// ============================================================

export async function fetchSubWorkOrders(workOrderId: string): Promise<SubWorkOrderWithRelations[]> {
  const { data, error } = await supabase
    .from('sub_work_orders')
    .select('*, machine:machines(*), routing_stage:routing_stages(*)')
    .eq('work_order_id', workOrderId)
    .order('sequence_number', { ascending: true });
  if (error) throw error;
  return (data ?? []) as SubWorkOrderWithRelations[];
}

export async function assignSubWorkOrderMachine(subWoId: string, machineId: string | null): Promise<void> {
  const { error } = await supabase
    .from('sub_work_orders')
    .update({ machine_id: machineId, updated_at: new Date().toISOString() })
    .eq('id', subWoId);
  if (error) throw error;
}

export async function startSubWorkOrder(subWoId: string): Promise<void> {
  const { error } = await supabase.rpc('start_sub_work_order', { p_sub_wo_id: subWoId });
  if (error) throw error;
}

export async function completeSubWorkOrder(fields: {
  sub_wo_id: string;
  good_qty: number;
  scrap_qty: number;
  reject_qty: number;
  defect_code?: string;
  reason?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('complete_sub_work_order', {
    p_sub_wo_id: fields.sub_wo_id,
    p_good_qty: fields.good_qty,
    p_scrap_qty: fields.scrap_qty,
    p_reject_qty: fields.reject_qty,
    p_defect_code: fields.defect_code ?? null,
    p_reason: fields.reason ?? null,
    p_recorded_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function setSubWorkOrderQuality(subWoId: string, status: QualityGateStatus): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('set_sub_work_order_quality', {
    p_sub_wo_id: subWoId,
    p_quality_status: status,
    p_setter_id: user?.id ?? null,
  });
  if (error) throw error;
}

export async function setWorkOrderQuality(workOrderId: string, status: QualityGateStatus): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('set_work_order_quality', {
    p_work_order_id: workOrderId,
    p_quality_status: status,
    p_setter_id: user?.id ?? null,
  });
  if (error) throw error;
}

// ============================================================
// Warehouse transfer (gated by quality)
// ============================================================

export async function transferToWarehouse(workOrderId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.rpc('transfer_to_warehouse', {
    p_work_order_id: workOrderId,
    p_transferred_by: user?.id ?? null,
  });
  if (error) throw error;
}

// ============================================================
// Scrap records
// ============================================================

export async function fetchScrapRecords(workOrderId: string): Promise<ScrapRecord[]> {
  const { data, error } = await supabase
    .from('scrap_records')
    .select('*')
    .eq('work_order_id', workOrderId)
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
  notes?: string;
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
      notes: fields.notes ?? null,
      recorded_by: user?.id ?? null,
    });
  if (error) throw error;
  // Also bump the sub work order scrap tally
  const { data: swo } = await supabase
    .from('sub_work_orders')
    .select('scrap_quantity')
    .eq('id', fields.sub_work_order_id)
    .maybeSingle();
  if (swo) {
    await supabase
      .from('sub_work_orders')
      .update({ scrap_quantity: Number((swo as { scrap_quantity: number }).scrap_quantity) + fields.quantity, updated_at: new Date().toISOString() })
      .eq('id', fields.sub_work_order_id);
  }
}

// ============================================================
// OEE
// ============================================================

export type OeeResult = {
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  planned_minutes: number;
  actual_minutes: number;
  good_qty: number;
  total_qty: number;
};

export async function computeOee(workOrderId: string): Promise<OeeResult> {
  const { data, error } = await supabase.rpc('compute_oee', { p_work_order_id: workOrderId });
  if (error) throw error;
  return data as OeeResult;
}

export async function fetchOeeSnapshot(workOrderId: string): Promise<OeeSnapshot | null> {
  const { data, error } = await supabase
    .from('oee_snapshots')
    .select('*')
    .eq('work_order_id', workOrderId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data as OeeSnapshot | null;
}

export async function fetchAllOeeSnapshots(): Promise<OeeSnapshot[]> {
  const { data, error } = await supabase
    .from('oee_snapshots')
    .select('*, work_order:work_orders(id, wo_number, model:product_models(name))')
    .order('computed_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as OeeSnapshot[];
}

// ============================================================
// Dashboard metrics
// ============================================================

export interface MesDashboardMetrics {
  totalMasterPlans: number;
  totalMonthlyPlans: number;
  totalWorkOrders: number;
  woByStatus: Record<string, number>;
  qualityPendingCount: number;
  qualityPassedCount: number;
  warehousePendingCount: number;
  totalScrap: number;
  avgOee: number;
}

export async function fetchMesDashboard(): Promise<MesDashboardMetrics> {
  const [wos, scrap, oee] = await Promise.all([
    fetchSimplifiedWorkOrders(),
    supabase.from('scrap_records').select('quantity'),
    supabase.from('oee_snapshots').select('oee'),
  ]);

  const woByStatus: Record<string, number> = {};
  for (const w of wos) {
    woByStatus[w.status] = (woByStatus[w.status] ?? 0) + 1;
  }

  const scrapRows = (scrap.data ?? []) as { quantity: number }[];
  const totalScrap = scrapRows.reduce((s, r) => s + Number(r.quantity), 0);

  const oeeRows = (oee.data ?? []) as { oee: number }[];
  const avgOee = oeeRows.length > 0 ? oeeRows.reduce((s, r) => s + Number(r.oee), 0) / oeeRows.length : 0;

  return {
    totalMasterPlans: 0,
    totalMonthlyPlans: 0,
    totalWorkOrders: wos.length,
    woByStatus,
    qualityPendingCount: wos.filter(w => w.quality_status === 'PENDING').length,
    qualityPassedCount: wos.filter(w => w.quality_status === 'PASSED').length,
    warehousePendingCount: wos.filter(w => w.quality_status === 'PASSED' && !w.warehouse_transferred).length,
    totalScrap,
    avgOee,
  };
}

import { supabase } from '@/lib/supabase';
import type {
  ProductionPlan, ProductionPlanLine, WorkOrder, WorkOrderComponent,
  MachineLoading, PlanType, PlanStatus, Priority, LoadingStatus,
  ProductModel, Department, Machine, WorkCenter, BOMHeader,
} from '@/types';

// ============================================================
// Production Plans
// ============================================================

export async function fetchPlans(search?: string, status?: string, type?: string) {
  let query = supabase
    .from('production_plans')
    .select('*, department:departments(*)')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`plan_number.ilike.%${search}%`);
  if (status) query = query.eq('status', status);
  if (type) query = query.eq('plan_type', type);
  const { data, error } = await query;
  if (error) throw error;
  return data as (ProductionPlan & { department: Department | null })[];
}

export async function fetchPlan(id: string) {
  const { data, error } = await supabase
    .from('production_plans')
    .select('*, department:departments(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as (ProductionPlan & { department: Department | null }) | null;
}

export async function createPlan(fields: {
  plan_type: PlanType;
  plan_date: string;
  department_id?: string;
  planned_start_date: string;
  planned_end_date: string;
  notes?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('production_plans')
    .insert({
      plan_type: fields.plan_type,
      plan_date: fields.plan_date,
      department_id: fields.department_id || null,
      planned_start_date: fields.planned_start_date,
      planned_end_date: fields.planned_end_date,
      notes: fields.notes || null,
      created_by: user?.id ?? null,
    })
    .select('*, department:departments(*)')
    .single();
  if (error) throw error;
  return data as ProductionPlan & { department: Department | null };
}

export async function updatePlan(id: string, fields: Partial<Pick<ProductionPlan,
  'plan_type' | 'plan_date' | 'department_id' | 'planned_start_date' |
  'planned_end_date' | 'notes' | 'status'>>) {
  const { data, error } = await supabase
    .from('production_plans')
    .update(fields)
    .eq('id', id)
    .select('*, department:departments(*)')
    .single();
  if (error) throw error;
  return data as ProductionPlan & { department: Department | null };
}

export async function submitPlan(id: string) {
  return updatePlan(id, { status: 'SUBMITTED' });
}

export async function approvePlan(id: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('production_plans')
    .update({ status: 'APPROVED', approved_by: user?.id ?? null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ProductionPlan;
}

export async function cancelPlan(id: string) {
  return updatePlan(id, { status: 'CANCELLED' });
}

// ============================================================
// Production Plan Lines
// ============================================================

export async function fetchPlanLines(planId: string) {
  const { data, error } = await supabase
    .from('production_plan_lines')
    .select('*, model:product_models(*), bom:bom_headers(*)')
    .eq('production_plan_id', planId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (ProductionPlanLine & {
    model: ProductModel;
    bom: BOMHeader | null;
  })[];
}

export async function addPlanLine(fields: {
  production_plan_id: string;
  product_model_id: string;
  bom_header_id?: string;
  planned_quantity: number;
  unit_of_measure: string;
  required_completion_date?: string;
  priority: Priority;
  notes?: string;
}) {
  const { data, error } = await supabase
    .from('production_plan_lines')
    .insert({
      production_plan_id: fields.production_plan_id,
      product_model_id: fields.product_model_id,
      bom_header_id: fields.bom_header_id || null,
      planned_quantity: fields.planned_quantity,
      unit_of_measure: fields.unit_of_measure,
      required_completion_date: fields.required_completion_date || null,
      priority: fields.priority,
      notes: fields.notes || null,
    })
    .select('*, model:product_models(*), bom:bom_headers(*)')
    .single();
  if (error) throw error;
  return data as ProductionPlanLine & { model: ProductModel; bom: BOMHeader | null };
}

export async function deletePlanLine(id: string) {
  const { error } = await supabase
    .from('production_plan_lines')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// ============================================================
// Work Orders
// ============================================================

export async function fetchWorkOrders(search?: string, status?: string) {
  let query = supabase
    .from('work_orders')
    .select('*, model:product_models(*), plan_line:production_plan_lines(*)')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`wo_number.ilike.%${search}%`);
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data as (WorkOrder & {
    model: ProductModel | null;
    plan_line: ProductionPlanLine | null;
  })[];
}

export async function fetchWorkOrder(id: string) {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, model:product_models(*), plan_line:production_plan_lines(*, model:product_models(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as (WorkOrder & {
    model: ProductModel | null;
    plan_line: (ProductionPlanLine & { model: ProductModel }) | null;
  }) | null;
}

export async function createWorkOrderFromPlan(planLineId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('create_work_order_from_plan', {
    p_plan_line_id: planLineId,
    p_created_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function releaseWorkOrder(woId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('release_work_order', {
    p_wo_id: woId,
    p_released_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function updateWorkOrderStatus(id: string, status: string) {
  const { data, error } = await supabase
    .from('work_orders')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as WorkOrder;
}

export async function updateWorkOrderDates(id: string, fields: {
  planned_start_date?: string;
  planned_finish_date?: string;
  priority?: Priority;
}) {
  const { data, error } = await supabase
    .from('work_orders')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as WorkOrder;
}

// ============================================================
// Work Order Components (BOM Snapshot)
// ============================================================

export async function fetchWorkOrderComponents(woId: string) {
  const { data, error } = await supabase
    .from('work_order_components')
    .select('*')
    .eq('work_order_id', woId)
    .order('revision_number', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as WorkOrderComponent[];
}

// ============================================================
// Machine Loadings
// ============================================================

export async function fetchMachineLoadings(machineId?: string, date?: string) {
  let query = supabase
    .from('machine_loadings')
    .select('*, machine:machines(*), work_center:work_centers(*), work_order:work_orders(*)')
    .order('planned_date', { ascending: false });
  if (machineId) query = query.eq('machine_id', machineId);
  if (date) query = query.eq('planned_date', date);
  const { data, error } = await query;
  if (error) throw error;
  return data as (MachineLoading & {
    machine: Machine;
    work_center: WorkCenter | null;
    work_order: WorkOrder;
  })[];
}

export async function fetchAllLoadings() {
  const { data, error } = await supabase
    .from('machine_loadings')
    .select('*, machine:machines(*), work_center:work_centers(*), work_order:work_orders(*, model:product_models(*))')
    .order('planned_date', { ascending: false });
  if (error) throw error;
  return data as (MachineLoading & {
    machine: Machine;
    work_center: WorkCenter | null;
    work_order: WorkOrder & { model: ProductModel | null };
  })[];
}

export async function createMachineLoading(fields: {
  work_order_id: string;
  machine_id: string;
  work_center_id?: string;
  planned_quantity: number;
  planned_date: string;
  shift?: string;
  planned_start_time?: string;
  planned_finish_time?: string;
  notes?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('machine_loadings')
    .insert({
      work_order_id: fields.work_order_id,
      machine_id: fields.machine_id,
      work_center_id: fields.work_center_id || null,
      planned_quantity: fields.planned_quantity,
      planned_date: fields.planned_date,
      shift: fields.shift || null,
      planned_start_time: fields.planned_start_time || null,
      planned_finish_time: fields.planned_finish_time || null,
      notes: fields.notes || null,
      created_by: user?.id ?? null,
    })
    .select('*, machine:machines(*), work_center:work_centers(*), work_order:work_orders(*)')
    .single();
  if (error) throw error;
  return data as MachineLoading & {
    machine: Machine;
    work_center: WorkCenter | null;
    work_order: WorkOrder;
  };
}

export async function updateLoadingStatus(id: string, status: LoadingStatus) {
  const { data, error } = await supabase
    .from('machine_loadings')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as MachineLoading;
}

export async function deleteMachineLoading(id: string) {
  const { error } = await supabase
    .from('machine_loadings')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

export async function checkMachineLoadingConflict(fields: {
  machine_id: string;
  planned_date: string;
  start_time?: string;
  finish_time?: string;
  exclude_id?: string;
}) {
  const { data, error } = await supabase.rpc('check_machine_loading_conflict', {
    p_machine_id: fields.machine_id,
    p_planned_date: fields.planned_date,
    p_start_time: fields.start_time ?? null,
    p_finish_time: fields.finish_time ?? null,
    p_exclude_loading_id: fields.exclude_id ?? null,
  });
  if (error) throw error;
  return data as boolean;
}

// ============================================================
// Dashboard Aggregations
// ============================================================

export interface PlanningDashboard {
  totalPlannedQty: number;
  totalActualQty: number;
  woByStatus: Record<string, number>;
  overdueCount: number;
  upcomingDeadlines: WorkOrder[];
  unassignedCount: number;
  loadingsByMachine: { machineId: string; machineName: string; plannedQty: number }[];
  loadingsByWorkCenter: { wcId: string; wcName: string; plannedQty: number }[];
}

export async function fetchPlanningDashboard(): Promise<PlanningDashboard> {
  const [wos, loadings] = await Promise.all([
    fetchWorkOrders(),
    fetchAllLoadings(),
  ]);

  const totalPlannedQty = wos.reduce((s, w) => s + Number(w.planned_quantity), 0);
  const totalActualQty = wos.reduce((s, w) => s + Number(w.actual_quantity), 0);

  const woByStatus: Record<string, number> = {};
  for (const w of wos) {
    woByStatus[w.status] = (woByStatus[w.status] ?? 0) + 1;
  }

  const today = new Date().toISOString().slice(0, 10);
  const overdueCount = wos.filter(w =>
    w.planned_finish_date &&
    w.planned_finish_date < today &&
    w.status !== 'COMPLETED' &&
    w.status !== 'CANCELLED',
  ).length;

  const upcomingDeadlines = wos
    .filter(w =>
      w.planned_finish_date &&
      w.status !== 'COMPLETED' &&
      w.status !== 'CANCELLED',
    )
    .sort((a, b) => (a.planned_finish_date ?? '').localeCompare(b.planned_finish_date ?? ''))
    .slice(0, 5);

  const assignedWoIds = new Set(loadings.map(l => l.work_order_id));
  const unassignedCount = wos.filter(w =>
    !assignedWoIds.has(w.id) &&
    w.status !== 'CANCELLED' &&
    w.status !== 'COMPLETED',
  ).length;

  const loadingsByMachineMap = new Map<string, { machineName: string; plannedQty: number }>();
  for (const l of loadings) {
    if (l.status === 'CANCELLED') continue;
    const existing = loadingsByMachineMap.get(l.machine_id);
    if (existing) {
      existing.plannedQty += Number(l.planned_quantity);
    } else {
      loadingsByMachineMap.set(l.machine_id, {
        machineName: l.machine?.name ?? '—',
        plannedQty: Number(l.planned_quantity),
      });
    }
  }

  const loadingsByWcMap = new Map<string, { wcName: string; plannedQty: number }>();
  for (const l of loadings) {
    if (l.status === 'CANCELLED') continue;
    const wcId = l.work_center_id ?? l.machine?.work_center_id ?? 'none';
    const existing = loadingsByWcMap.get(wcId);
    if (existing) {
      existing.plannedQty += Number(l.planned_quantity);
    } else {
      loadingsByWcMap.set(wcId, {
        wcName: l.work_center?.name ?? 'غير محدد',
        plannedQty: Number(l.planned_quantity),
      });
    }
  }

  return {
    totalPlannedQty,
    totalActualQty,
    woByStatus,
    overdueCount,
    upcomingDeadlines,
    unassignedCount,
    loadingsByMachine: Array.from(loadingsByMachineMap.entries()).map(([machineId, v]) => ({
      machineId, machineName: v.machineName, plannedQty: v.plannedQty,
    })),
    loadingsByWorkCenter: Array.from(loadingsByWcMap.entries()).map(([wcId, v]) => ({
      wcId, wcName: v.wcName, plannedQty: v.plannedQty,
    })),
  };
}

import { supabase } from '@/lib/supabase';
import type {
  ShiftSession, ProductionTransaction, MaterialConversion,
  QuantityDisposition, RoutingStage, Machine, WorkCenter,
  WorkOrder, ParentBatch, Profile,
} from '@/types';

// ============================================================
// Types for joined queries
// ============================================================

export type SessionWithRelations = ShiftSession & {
  work_order: WorkOrder & { model: { id: string; model_code: string; name: string } | null };
  parent_batch: ParentBatch;
  production_stage: RoutingStage;
  machine: Machine | null;
  work_center: WorkCenter | null;
  supervisor: Pick<Profile, 'id' | 'full_name'> | null;
};

export type TransactionWithRelations = ProductionTransaction & {
  production_stage: RoutingStage;
  machine: Machine | null;
  operator: Pick<Profile, 'id' | 'full_name'> | null;
};

export type ConversionWithRelations = MaterialConversion & {
  source_item: { id: string; item_code: string; name: string };
  output_item: { id: string; item_code: string; name: string } | null;
  production_stage: RoutingStage;
  machine: Machine | null;
};

// ============================================================
// Shift Sessions
// ============================================================

export async function fetchOpenSessions(): Promise<SessionWithRelations[]> {
  const { data, error } = await supabase
    .from('shift_sessions')
    .select(`*, work_order:work_orders(*, model:product_models(*)), parent_batch:parent_batches(*),
      production_stage:routing_stages(*), machine:machines(*), work_center:work_centers(*),
      supervisor:profiles!shift_sessions_supervisor_id_fkey(id, full_name)`)
    .in('status', ['OPEN', 'CLOSING'])
    .order('start_time', { ascending: false });
  if (error) throw error;
  return data as unknown as SessionWithRelations[];
}

export async function fetchAllSessions(): Promise<SessionWithRelations[]> {
  const { data, error } = await supabase
    .from('shift_sessions')
    .select(`*, work_order:work_orders(*, model:product_models(*)), parent_batch:parent_batches(*),
      production_stage:routing_stages(*), machine:machines(*), work_center:work_centers(*),
      supervisor:profiles!shift_sessions_supervisor_id_fkey(id, full_name)`)
    .order('production_date', { ascending: false })
    .order('start_time', { ascending: false });
  if (error) throw error;
  return data as unknown as SessionWithRelations[];
}

export async function fetchSession(id: string): Promise<SessionWithRelations | null> {
  const { data, error } = await supabase
    .from('shift_sessions')
    .select(`*, work_order:work_orders(*, model:product_models(*)), parent_batch:parent_batches(*),
      production_stage:routing_stages(*), machine:machines(*), work_center:work_centers(*),
      supervisor:profiles!shift_sessions_supervisor_id_fkey(id, full_name)`)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as SessionWithRelations | null;
}

export async function openShiftSession(fields: {
  work_order_id: string;
  parent_batch_id: string;
  production_stage_id: string;
  machine_id?: string;
  work_center_id?: string;
  supervisor_id?: string;
  shift?: string;
  production_date?: string;
}): Promise<ShiftSession> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('shift_sessions')
    .insert({
      ...fields,
      machine_id: fields.machine_id || null,
      work_center_id: fields.work_center_id || null,
      supervisor_id: fields.supervisor_id || user?.id || null,
      shift: fields.shift || null,
      production_date: fields.production_date || new Date().toISOString().slice(0, 10),
      opened_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as ShiftSession;
}

export async function closeShiftSession(sessionId: string, notes?: string): Promise<string> {
  const { data, error } = await supabase.rpc('close_shift_session', {
    p_session_id: sessionId,
    p_notes: notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Production Transactions
// ============================================================

export async function fetchSessionTransactions(sessionId: string): Promise<TransactionWithRelations[]> {
  const { data, error } = await supabase
    .from('production_transactions')
    .select(`*, production_stage:routing_stages(*), machine:machines(*),
      operator:profiles!production_transactions_operator_id_fkey(id, full_name)`)
    .eq('shift_session_id', sessionId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as TransactionWithRelations[];
}

export async function fetchBatchTransactions(batchId: string): Promise<TransactionWithRelations[]> {
  const { data, error } = await supabase
    .from('production_transactions')
    .select(`*, production_stage:routing_stages(*), machine:machines(*),
      operator:profiles!production_transactions_operator_id_fkey(id, full_name)`)
    .eq('parent_batch_id', batchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as TransactionWithRelations[];
}

export async function fetchTransactionsWithRejected(): Promise<TransactionWithRelations[]> {
  const { data, error } = await supabase
    .from('production_transactions')
    .select(`*, production_stage:routing_stages(*), machine:machines(*),
      operator:profiles!production_transactions_operator_id_fkey(id, full_name),
      parent_batch:parent_batches(*), work_order:work_orders(*)`)
    .gt('rejected_qty', 0)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as TransactionWithRelations[];
}

export async function recordProduction(fields: {
  shift_session_id?: string;
  parent_batch_id?: string;
  work_order_id?: string;
  production_stage_id?: string;
  machine_id?: string;
  input_qty: number;
  good_qty: number;
  rejected_qty: number;
  pending_qty: number;
  unit_of_measure?: string;
  shift?: string;
  notes?: string;
  idempotency_key?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_production_transaction', {
    p_shift_session_id: fields.shift_session_id ?? null,
    p_parent_batch_id: fields.parent_batch_id ?? null,
    p_work_order_id: fields.work_order_id ?? null,
    p_production_stage_id: fields.production_stage_id ?? null,
    p_machine_id: fields.machine_id ?? null,
    p_input_qty: fields.input_qty,
    p_good_qty: fields.good_qty,
    p_rejected_qty: fields.rejected_qty,
    p_pending_qty: fields.pending_qty,
    p_unit_of_measure: fields.unit_of_measure ?? 'PCS',
    p_shift: fields.shift ?? null,
    p_notes: fields.notes ?? null,
    p_idempotency_key: fields.idempotency_key ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Parent Batch Creation (via RPC with overproduction prevention)
// ============================================================

export async function createProductionBatch(
  workOrderId: string,
  plannedQuantity: number,
): Promise<string> {
  const { data, error } = await supabase.rpc('create_production_batch', {
    p_work_order_id: workOrderId,
    p_planned_quantity: plannedQuantity,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Material Conversions (Initial Cutting)
// ============================================================

export async function fetchConversions(batchId: string): Promise<ConversionWithRelations[]> {
  const { data, error } = await supabase
    .from('material_conversions')
    .select(`*, source_item:item_master!material_conversions_source_item_id_fkey(id, item_code, name),
      output_item:item_master!material_conversions_output_item_id_fkey(id, item_code, name),
      production_stage:routing_stages(*), machine:machines(*)`)
    .eq('parent_batch_id', batchId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as ConversionWithRelations[];
}

export async function recordConversion(fields: {
  parent_batch_id: string;
  work_order_id: string;
  production_stage_id: string;
  source_item_id: string;
  source_item_code: string;
  source_qty: number;
  source_unit: string;
  output_item_id?: string;
  output_item_code: string;
  output_qty: number;
  output_unit: string;
  output_type: string;
  machine_id?: string;
  notes?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_material_conversion', {
    p_parent_batch_id: fields.parent_batch_id,
    p_work_order_id: fields.work_order_id,
    p_production_stage_id: fields.production_stage_id,
    p_source_item_id: fields.source_item_id,
    p_source_item_code: fields.source_item_code,
    p_source_qty: fields.source_qty,
    p_source_unit: fields.source_unit,
    p_output_item_id: fields.output_item_id ?? null,
    p_output_item_code: fields.output_item_code,
    p_output_qty: fields.output_qty,
    p_output_unit: fields.output_unit,
    p_output_type: fields.output_type,
    p_machine_id: fields.machine_id ?? null,
    p_notes: fields.notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Quantity Dispositions (Rework / Scrap)
// ============================================================

export async function fetchDispositions(transactionId?: string): Promise<QuantityDisposition[]> {
  let query = supabase
    .from('quantity_dispositions')
    .select('*')
    .order('created_at', { ascending: false });
  if (transactionId) query = query.eq('production_transaction_id', transactionId);
  const { data, error } = await query;
  if (error) throw error;
  return data as QuantityDisposition[];
}

export async function recordDisposition(fields: {
  production_transaction_id: string;
  parent_batch_id: string;
  disposition_type: 'REWORK' | 'SCRAP' | 'RETURN_FOR_INSPECTION';
  quantity: number;
  unit_of_measure?: string;
  reason: string;
  rework_transaction_id?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_disposition', {
    p_production_transaction_id: fields.production_transaction_id,
    p_parent_batch_id: fields.parent_batch_id,
    p_disposition_type: fields.disposition_type,
    p_quantity: fields.quantity,
    p_unit_of_measure: fields.unit_of_measure ?? 'PCS',
    p_reason: fields.reason,
    p_rework_transaction_id: fields.rework_transaction_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Session Summary (computed from transactions)
// ============================================================

export interface SessionSummary {
  totalInput: number;
  totalGood: number;
  totalRejected: number;
  totalPending: number;
  entryCount: number;
  firstEntryTime: string | null;
  lastEntryTime: string | null;
}

export function computeSessionSummary(txs: ProductionTransaction[]): SessionSummary {
  if (txs.length === 0) {
    return { totalInput: 0, totalGood: 0, totalRejected: 0, totalPending: 0, entryCount: 0, firstEntryTime: null, lastEntryTime: null };
  }
  return {
    totalInput: txs.reduce((s, t) => s + t.input_qty, 0),
    totalGood: txs.reduce((s, t) => s + t.good_qty, 0),
    totalRejected: txs.reduce((s, t) => s + t.rejected_qty, 0),
    totalPending: txs.reduce((s, t) => s + t.pending_qty, 0),
    entryCount: txs.length,
    firstEntryTime: txs[0]?.created_at ?? null,
    lastEntryTime: txs[txs.length - 1]?.created_at ?? null,
  };
}

import { supabase } from '@/lib/supabase';
import type {
  DefectMaster, InspectionLot, InspectionResultRecord, InspectionDefect,
  QualityDisposition, QualityApproval, QualityCard, QualityCardPrint,
  WorkOrder, ParentBatch, RoutingStage, ProductModel, ItemMaster,
} from '@/types';

// ============================================================
// Joined Types
// ============================================================

export type InspectionLotWithRelations = InspectionLot & {
  work_order: Pick<WorkOrder, 'id' | 'wo_number'> | null;
  parent_batch: Pick<ParentBatch, 'id' | 'batch_number'> | null;
  final_stage: Pick<RoutingStage, 'id' | 'stage_code' | 'stage_name'> | null;
  product_model: Pick<ProductModel, 'id' | 'model_code' | 'name'> | null;
  item: Pick<ItemMaster, 'id' | 'item_code' | 'name'> | null;
  created_by_profile: { id: string; full_name: string } | null;
};

export type InspectionResultWithRelations = InspectionResultRecord & {
  inspector: { id: string; full_name: string } | null;
  defects: (InspectionDefect & { defect: DefectMaster })[];
};

export type QualityCardWithRelations = QualityCard & {
  inspection_lot: Pick<InspectionLot, 'id' | 'lot_number'> | null;
  approver: { id: string; full_name: string } | null;
};

// ============================================================
// Defect Master
// ============================================================

export async function fetchDefects(activeOnly = false): Promise<DefectMaster[]> {
  let query = supabase
    .from('defect_master')
    .select('*')
    .order('defect_code', { ascending: true });
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as DefectMaster[];
}

export async function createDefect(fields: {
  defect_code: string;
  defect_name: string;
  defect_category?: string;
  description?: string;
  applicable_item_types?: string;
  applicable_production_stages?: string;
}): Promise<DefectMaster> {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('defect_master')
    .insert({
      ...fields,
      created_by: user?.id ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as DefectMaster;
}

export async function updateDefect(
  id: string,
  fields: Partial<Pick<DefectMaster, 'defect_name' | 'defect_category' | 'description' | 'applicable_item_types' | 'applicable_production_stages' | 'is_active'>>,
): Promise<DefectMaster> {
  const { data, error } = await supabase
    .from('defect_master')
    .update(fields)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as DefectMaster;
}

export async function deleteDefect(id: string): Promise<void> {
  const { error } = await supabase.from('defect_master').delete().eq('id', id);
  if (error) throw error;
}

// ============================================================
// Inspection Lots
// ============================================================

export async function fetchInspectionLots(status?: string): Promise<InspectionLotWithRelations[]> {
  let query = supabase
    .from('inspection_lots')
    .select(`*,
      work_order:work_orders(id, wo_number),
      parent_batch:parent_batches(id, batch_number),
      final_stage:routing_stages!inspection_lots_final_stage_id_fkey(id, stage_code, stage_name),
      product_model:product_models(id, model_code, name),
      item:item_master!inspection_lots_item_id_fkey(id, item_code, name),
      created_by_profile:profiles!inspection_lots_created_by_fkey(id, full_name)
    `)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as InspectionLotWithRelations[];
}

export async function fetchInspectionLot(id: string): Promise<InspectionLotWithRelations | null> {
  const { data, error } = await supabase
    .from('inspection_lots')
    .select(`*,
      work_order:work_orders(id, wo_number),
      parent_batch:parent_batches(id, batch_number),
      final_stage:routing_stages!inspection_lots_final_stage_id_fkey(id, stage_code, stage_name),
      product_model:product_models(id, model_code, name),
      item:item_master!inspection_lots_item_id_fkey(id, item_code, name),
      created_by_profile:profiles!inspection_lots_created_by_fkey(id, full_name)
    `)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as unknown as InspectionLotWithRelations | null;
}

export async function createInspectionLot(fields: {
  work_order_id: string;
  parent_batch_id: string;
  production_route_id: string;
  final_stage_id: string;
  quantity_submitted: number;
  unit_of_measure?: string;
  source_transaction_ids?: string;
  product_model_id?: string;
  item_id?: string;
  routing_version_id?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('create_inspection_lot', {
    p_work_order_id: fields.work_order_id,
    p_parent_batch_id: fields.parent_batch_id,
    p_production_route_id: fields.production_route_id,
    p_final_stage_id: fields.final_stage_id,
    p_quantity_submitted: fields.quantity_submitted,
    p_unit_of_measure: fields.unit_of_measure ?? 'PCS',
    p_source_transaction_ids: fields.source_transaction_ids ?? '[]',
    p_product_model_id: fields.product_model_id ?? null,
    p_item_id: fields.item_id ?? null,
    p_routing_version_id: fields.routing_version_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Inspection Results
// ============================================================

export async function fetchInspectionResults(lotId: string): Promise<InspectionResultWithRelations[]> {
  const { data, error } = await supabase
    .from('inspection_results')
    .select(`*,
      inspector:profiles!inspection_results_inspector_id_fkey(id, full_name),
      defects:inspection_defects(*, defect:defect_master(*))
    `)
    .eq('inspection_lot_id', lotId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as unknown as InspectionResultWithRelations[];
}

export async function recordInspectionResult(fields: {
  inspection_lot_id: string;
  inspected_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  pending_inspection_quantity: number;
  unit_of_measure?: string;
  defect_codes?: string;
  defect_description?: string;
  notes?: string;
  is_reinspection?: boolean;
  original_inspection_id?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_inspection_result', {
    p_inspection_lot_id: fields.inspection_lot_id,
    p_inspected_quantity: fields.inspected_quantity,
    p_accepted_quantity: fields.accepted_quantity,
    p_rejected_quantity: fields.rejected_quantity,
    p_pending_inspection_quantity: fields.pending_inspection_quantity,
    p_unit_of_measure: fields.unit_of_measure ?? 'PCS',
    p_defect_codes: fields.defect_codes ?? null,
    p_defect_description: fields.defect_description ?? null,
    p_notes: fields.notes ?? null,
    p_is_reinspection: fields.is_reinspection ?? false,
    p_original_inspection_id: fields.original_inspection_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function addInspectionDefect(fields: {
  inspection_result_id: string;
  defect_id: string;
  defect_quantity: number;
  notes?: string;
}): Promise<void> {
  const { error } = await supabase
    .from('inspection_defects')
    .insert({
      inspection_result_id: fields.inspection_result_id,
      defect_id: fields.defect_id,
      defect_quantity: fields.defect_quantity,
      notes: fields.notes ?? null,
    });
  if (error) throw error;
}

// ============================================================
// Quality Approvals
// ============================================================

export async function fetchApprovals(lotId?: string): Promise<QualityApproval[]> {
  let query = supabase
    .from('quality_approvals')
    .select(`*,
      approver:profiles!quality_approvals_approver_id_fkey(id, full_name)
    `)
    .order('approval_timestamp', { ascending: false });
  if (lotId) query = query.eq('inspection_lot_id', lotId);
  const { data, error } = await query;
  if (error) throw error;
  return data as unknown as (QualityApproval & { approver: { id: string; full_name: string } | null })[];
}

export async function approveInspectionLot(fields: {
  inspection_lot_id: string;
  decision: 'ACCEPT' | 'REJECT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION';
  approved_quantity: number;
  rejected_quantity?: number;
  disposition?: 'ACCEPT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION';
  approver_role?: string;
  notes?: string;
  generate_card?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('approve_inspection_lot', {
    p_inspection_lot_id: fields.inspection_lot_id,
    p_decision: fields.decision,
    p_approved_quantity: fields.approved_quantity,
    p_rejected_quantity: fields.rejected_quantity ?? 0,
    p_disposition: fields.disposition ?? 'ACCEPT',
    p_approver_role: fields.approver_role ?? 'QUALITY',
    p_notes: fields.notes ?? null,
    p_generate_card: fields.generate_card ?? true,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Quality Dispositions
// ============================================================

export async function fetchDispositions(lotId?: string): Promise<QualityDisposition[]> {
  let query = supabase
    .from('quality_dispositions')
    .select('*')
    .order('created_at', { ascending: false });
  if (lotId) query = query.eq('inspection_lot_id', lotId);
  const { data, error } = await query;
  if (error) throw error;
  return data as QualityDisposition[];
}

export async function recordQualityDisposition(fields: {
  inspection_lot_id: string;
  disposition_type: 'ACCEPT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION';
  quantity: number;
  unit_of_measure?: string;
  reason?: string;
  inspection_result_id?: string;
  original_rejected_quantity?: number;
  rework_reference_id?: string;
  is_final_scrap?: boolean;
}): Promise<string> {
  const { data, error } = await supabase.rpc('record_quality_disposition', {
    p_inspection_lot_id: fields.inspection_lot_id,
    p_disposition_type: fields.disposition_type,
    p_quantity: fields.quantity,
    p_unit_of_measure: fields.unit_of_measure ?? 'PCS',
    p_reason: fields.reason ?? null,
    p_inspection_result_id: fields.inspection_result_id ?? null,
    p_original_rejected_quantity: fields.original_rejected_quantity ?? null,
    p_rework_reference_id: fields.rework_reference_id ?? null,
    p_is_final_scrap: fields.is_final_scrap ?? false,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Quality Cards
// ============================================================

export async function fetchQualityCards(): Promise<QualityCardWithRelations[]> {
  const { data, error } = await supabase
    .from('quality_cards')
    .select(`*,
      inspection_lot:inspection_lots(id, lot_number),
      approver:profiles!quality_cards_approver_id_fkey(id, full_name)
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as unknown as QualityCardWithRelations[];
}

export async function fetchQualityCardPrints(cardId: string): Promise<QualityCardPrint[]> {
  const { data, error } = await supabase
    .from('quality_card_prints')
    .select('*, printed_by_profile:profiles!quality_card_prints_printed_by_fkey(id, full_name)')
    .eq('quality_card_id', cardId)
    .order('printed_at', { ascending: false });
  if (error) throw error;
  return data as unknown as (QualityCardPrint & { printed_by_profile: { id: string; full_name: string } | null })[];
}

export async function reprintQualityCard(cardId: string, notes?: string): Promise<string> {
  const { data, error } = await supabase.rpc('reprint_quality_card', {
    p_quality_card_id: cardId,
    p_print_notes: notes ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function generateQualityCardForPallet(fields: {
  inspection_lot_id: string;
  accepted_quantity: number;
  pallet_id?: string;
}): Promise<string> {
  const { data, error } = await supabase.rpc('generate_quality_card', {
    p_inspection_lot_id: fields.inspection_lot_id,
    p_accepted_quantity: fields.accepted_quantity,
    p_pallet_id: fields.pallet_id ?? null,
  });
  if (error) throw error;
  return data as string;
}

// ============================================================
// Dashboard Metrics
// ============================================================

export interface QualityDashboardMetrics {
  pendingInspections: number;
  totalAccepted: number;
  totalRejected: number;
  reworkQuantity: number;
  finalScrapQuantity: number;
  totalLots: number;
  approvedLots: number;
}

export async function fetchQualityDashboardMetrics(): Promise<QualityDashboardMetrics> {
  const [lots, dispositions] = await Promise.all([
    supabase.from('inspection_lots').select('status, quantity_submitted'),
    supabase.from('quality_dispositions').select('disposition_type, quantity, is_final_scrap'),
  ]);

  if (lots.error) throw lots.error;
  if (dispositions.error) throw dispositions.error;

  const lotRows = lots.data as Pick<InspectionLot, 'status' | 'quantity_submitted'>[];
  const dispRows = dispositions.data as Pick<QualityDisposition, 'disposition_type' | 'quantity' | 'is_final_scrap'>[];

  // Get inspection results for accepted/rejected totals
  const { data: resultsData, error: resultsError } = await supabase
    .from('inspection_results')
    .select('accepted_quantity, rejected_quantity');
  if (resultsError) throw resultsError;
  const resultRows = resultsData as Pick<InspectionResultRecord, 'accepted_quantity' | 'rejected_quantity'>[];

  return {
    pendingInspections: lotRows.filter(l => l.status === 'PENDING' || l.status === 'IN_INSPECTION').length,
    totalAccepted: resultRows.reduce((s, r) => s + r.accepted_quantity, 0),
    totalRejected: resultRows.reduce((s, r) => s + r.rejected_quantity, 0),
    reworkQuantity: dispRows.filter(d => d.disposition_type === 'REWORK').reduce((s, d) => s + d.quantity, 0),
    finalScrapQuantity: dispRows.filter(d => d.disposition_type === 'SCRAP' && d.is_final_scrap).reduce((s, d) => s + d.quantity, 0),
    totalLots: lotRows.length,
    approvedLots: lotRows.filter(l => l.status === 'APPROVED').length,
  };
}

// ============================================================
// Eligible Production Transactions for Inspection
// ============================================================

export async function fetchEligibleForInspection(): Promise<{
  batches: Array<{
    parent_batch: ParentBatch;
    work_order: WorkOrder;
    final_stage: RoutingStage;
    good_qty: number;
  }>;
}> {
  // Find production transactions where the stage has quality_approval_required = true
  // and the batch has available quantity
  const { data, error } = await supabase
    .from('production_transactions')
    .select(`*,
      parent_batch:parent_batches(*),
      work_order:work_orders(*),
      production_stage:routing_stages!production_transactions_production_stage_id_fkey(*)
    `)
    .gt('good_qty', 0)
    .order('created_at', { ascending: false });

  if (error) throw error;

  const txs = data as unknown as Array<{
    good_qty: number;
    parent_batch: ParentBatch;
    work_order: WorkOrder;
    production_stage: RoutingStage;
  }>;

  // Filter to only those where stage has quality_approval_required
  const eligible = txs.filter(t => t.production_stage?.quality_approval_required);

  // Group by parent_batch + final_stage to aggregate
  const map = new Map<string, {
    parent_batch: ParentBatch;
    work_order: WorkOrder;
    final_stage: RoutingStage;
    good_qty: number;
  }>();

  for (const t of eligible) {
    const key = `${t.parent_batch.id}_${t.production_stage.id}`;
    const existing = map.get(key);
    if (existing) {
      existing.good_qty += t.good_qty;
    } else {
      map.set(key, {
        parent_batch: t.parent_batch,
        work_order: t.work_order,
        final_stage: t.production_stage,
        good_qty: t.good_qty,
      });
    }
  }

  return { batches: Array.from(map.values()) };
}

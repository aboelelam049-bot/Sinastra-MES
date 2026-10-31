import { supabase } from '@/lib/supabase';
import type {
  ParentBatch, Pallet, Barcode, PalletLookupResult,
  Product, Machine, ProductionRoute, ProductionStage, WorkOrder, QualityCard,
} from '@/types';

// ============================================================
// Products
// ============================================================

export async function fetchProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Product[];
}

// ============================================================
// Machines
// ============================================================

export async function fetchMachines() {
  const { data, error } = await supabase
    .from('machines')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Machine[];
}

// ============================================================
// Production Routes & Stages
// ============================================================

export async function fetchRoutes() {
  const { data, error } = await supabase
    .from('production_routes')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as ProductionRoute[];
}

export async function fetchStages(routeId?: string) {
  let query = supabase
    .from('production_stages')
    .select('*')
    .eq('is_active', true)
    .order('sequence_order', { ascending: true });
  if (routeId) query = query.eq('route_id', routeId);
  const { data, error } = await query;
  if (error) throw error;
  return data as ProductionStage[];
}

// ============================================================
// Work Orders
// ============================================================

export async function fetchWorkOrders() {
  const { data, error } = await supabase
    .from('work_orders')
    .select('*, product:products(*), route:production_routes(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (WorkOrder & { product: Product; route: ProductionRoute })[];
}

export async function createWorkOrder(
  productId: string,
  routeId: string,
  plannedQuantity: number,
  scheduledDate?: string,
) {
  const { data, error } = await supabase
    .from('work_orders')
    .insert({
      product_id: productId,
      production_route_id: routeId,
      planned_quantity: plannedQuantity,
      scheduled_date: scheduledDate || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as WorkOrder;
}

// ============================================================
// Parent Batches
// ============================================================

export async function fetchParentBatches() {
  const { data, error } = await supabase
    .from('parent_batches')
    .select('*, work_order:work_orders(*), product:products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (ParentBatch & { work_order: WorkOrder; product: Product })[];
}

export async function fetchParentBatch(id: string) {
  const { data, error } = await supabase
    .from('parent_batches')
    .select('*, work_order:work_orders(*), product:products(*), route:production_routes(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as (ParentBatch & { work_order: WorkOrder; product: Product; route: ProductionRoute }) | null;
}

export async function createParentBatch(
  workOrderId: string,
  plannedQuantity: number,
  currentStageId?: string,
) {
  const { data, error } = await supabase.rpc('create_parent_batch', {
    p_work_order_id: workOrderId,
    p_planned_quantity: plannedQuantity,
    p_current_stage_id: currentStageId ?? null,
  });
  if (error) throw error;
  return data as ParentBatch;
}

export async function updateBatchQuantity(batchId: string, actualQuantity: number) {
  const { data, error } = await supabase.rpc('update_batch_quantity', {
    p_batch_id: batchId,
    p_actual_quantity: actualQuantity,
  });
  if (error) throw error;
  return data as ParentBatch;
}

// ============================================================
// Pallets
// ============================================================

export async function fetchPalletsByBatch(batchId: string) {
  const { data, error } = await supabase
    .from('pallets')
    .select('*, stage:production_stages(*), machine:machines(*)')
    .eq('parent_batch_id', batchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (Pallet & { stage: ProductionStage; machine: Machine | null })[];
}

export async function fetchAllPallets() {
  const { data, error } = await supabase
    .from('pallets')
    .select('*, parent_batch:parent_batches(*), stage:production_stages(*), product:products(*)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as (Pallet & {
    parent_batch: ParentBatch;
    stage: ProductionStage;
    product: Product;
  })[];
}

export async function createPallet(
  batchId: string,
  stageId: string,
  quantity: number,
  machineId?: string,
) {
  const { data, error } = await supabase.rpc('create_pallet', {
    p_parent_batch_id: batchId,
    p_stage_id: stageId,
    p_quantity: quantity,
    p_machine_id: machineId ?? null,
  });
  if (error) throw error;
  return data as Pallet;
}

export async function splitPallet(palletId: string, quantities: number[]) {
  const { data, error } = await supabase.rpc('split_pallet', {
    p_pallet_id: palletId,
    p_quantities: quantities,
  });
  if (error) throw error;
  return data as Pallet[];
}

// ============================================================
// Pallet Movements
// ============================================================

export async function fetchPalletMovements(palletId: string) {
  const { data, error } = await supabase
    .from('pallet_movements')
    .select('*')
    .eq('pallet_id', palletId)
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data;
}

// ============================================================
// Barcodes
// ============================================================

export async function fetchBarcodesByPallet(palletId: string) {
  const { data, error } = await supabase
    .from('barcodes')
    .select('*')
    .eq('pallet_id', palletId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as Barcode[];
}

export async function generateBarcode(palletId: string) {
  const { data, error } = await supabase.rpc('generate_barcode', {
    p_pallet_id: palletId,
  });
  if (error) throw error;
  return data as Barcode;
}

export async function reprintBarcode(barcodeId: string) {
  const { data, error } = await supabase.rpc('reprint_barcode', {
    p_barcode_id: barcodeId,
  });
  if (error) throw error;
  return data as Barcode;
}

export async function lookupPalletByBarcode(barcodeValue: string) {
  const { data, error } = await supabase.rpc('lookup_pallet_by_barcode', {
    p_barcode_value: barcodeValue,
  });
  if (error) throw error;
  return data as PalletLookupResult;
}

// ============================================================
// Quality Cards
// ============================================================

export async function fetchQualityCards() {
  const { data, error } = await supabase
    .from('quality_cards')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as QualityCard[];
}

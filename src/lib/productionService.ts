import { supabase } from '@/lib/supabase';
import type {
  ProductionConsumption, WorkOrder, WorkCenter, Machine, ItemMaster, ProductModel,
} from '@/types';

export type ConsumptionWithRelations = ProductionConsumption & {
  item: ItemMaster;
  work_center: WorkCenter | null;
  machine: Machine | null;
  work_order: WorkOrder & { model: ProductModel | null };
};

export async function fetchConsumptions(workOrderId?: string) {
  let query = supabase
    .from('production_consumption')
    .select(
      '*, item:item_master(*), work_center:work_centers(*), machine:machines(*), work_order:work_orders(*, model:product_models(*))',
    )
    .order('consumption_date', { ascending: false })
    .order('created_at', { ascending: false });
  if (workOrderId) query = query.eq('work_order_id', workOrderId);
  const { data, error } = await query;
  if (error) throw error;
  return data as ConsumptionWithRelations[];
}

export async function addConsumption(fields: {
  work_order_id: string;
  work_center_id?: string;
  machine_id?: string;
  item_id: string;
  item_code: string;
  consumed_qty: number;
  unit_of_measure: string;
  produced_qty?: number;
  consumption_date?: string;
  notes?: string;
}) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('production_consumption')
    .insert({
      ...fields,
      work_center_id: fields.work_center_id || null,
      machine_id: fields.machine_id || null,
      produced_qty: fields.produced_qty ?? null,
      consumption_date: fields.consumption_date ?? new Date().toISOString().slice(0, 10),
      notes: fields.notes || null,
      created_by: user?.id ?? null,
    })
    .select(
      '*, item:item_master(*), work_center:work_centers(*), machine:machines(*), work_order:work_orders(*, model:product_models(*))',
    )
    .single();
  if (error) throw error;
  return data as ConsumptionWithRelations;
}

export async function deleteConsumption(id: string) {
  const { error } = await supabase
    .from('production_consumption')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

import { supabase } from '@/lib/supabase';
import type {
  Department, WorkCenter, Machine, MachineStatus,
  MachineStatusHistory, MachineAvailability, AvailabilityType,
} from '@/types';

// ============================================================
// Departments
// ============================================================

export async function fetchDepartments(search?: string) {
  let query = supabase
    .from('departments')
    .select('*')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`department_code.ilike.%${search}%,name.ilike.%${search}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data as Department[];
}

export async function fetchDepartment(id: string) {
  const { data, error } = await supabase
    .from('departments').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Department | null;
}

export async function createDepartment(
  code: string, name: string, description?: string,
) {
  const { data, error } = await supabase
    .from('departments')
    .insert({ department_code: code, name, description })
    .select('*').single();
  if (error) throw error;
  return data as Department;
}

export async function updateDepartment(
  id: string, fields: Partial<Pick<Department, 'name' | 'description' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('departments').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Department;
}

export async function toggleDepartmentActive(id: string, isActive: boolean) {
  return updateDepartment(id, { is_active: isActive });
}

// ============================================================
// Work Centers
// ============================================================

export async function fetchWorkCenters(search?: string, departmentId?: string) {
  let query = supabase
    .from('work_centers')
    .select('*, department:departments(*)')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`work_center_code.ilike.%${search}%,name.ilike.%${search}%`);
  if (departmentId) query = query.eq('department_id', departmentId);
  const { data, error } = await query;
  if (error) throw error;
  return data as (WorkCenter & { department: Department })[];
}

export async function fetchWorkCenter(id: string) {
  const { data, error } = await supabase
    .from('work_centers')
    .select('*, department:departments(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data as (WorkCenter & { department: Department }) | null;
}

export async function createWorkCenter(
  code: string, name: string, departmentId: string,
  defaultUom: string, description?: string,
) {
  const { data, error } = await supabase
    .from('work_centers')
    .insert({
      work_center_code: code, name, department_id: departmentId,
      default_unit_of_measure: defaultUom, description,
    })
    .select('*').single();
  if (error) throw error;
  return data as WorkCenter;
}

export async function updateWorkCenter(
  id: string, fields: Partial<Pick<WorkCenter,
    'name' | 'department_id' | 'default_unit_of_measure' | 'description' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('work_centers').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as WorkCenter;
}

export async function toggleWorkCenterActive(id: string, isActive: boolean) {
  return updateWorkCenter(id, { is_active: isActive });
}

// ============================================================
// Machines
// ============================================================

export async function fetchMachines(search?: string, departmentId?: string, status?: string, activeOnly?: boolean) {
  let query = supabase
    .from('machines')
    .select('*, department:departments(*), work_center:work_centers(*)')
    .order('created_at', { ascending: false });
  if (search) query = query.or(`machine_code.ilike.%${search}%,name.ilike.%${search}%`);
  if (departmentId) query = query.eq('department_id', departmentId);
  if (status) query = query.eq('status', status);
  if (activeOnly) query = query.eq('is_active', true);
  const { data, error } = await query;
  if (error) throw error;
  return data as (Machine & {
    department: Department | null;
    work_center: WorkCenter | null;
  })[];
}

export async function fetchMachine(id: string) {
  const { data, error } = await supabase
    .from('machines')
    .select('*, department:departments(*), work_center:work_centers(*)')
    .eq('id', id).maybeSingle();
  if (error) throw error;
  return data as (Machine & {
    department: Department | null;
    work_center: WorkCenter | null;
  }) | null;
}

export async function createMachine(fields: {
  machine_code: string;
  name: string;
  department_id?: string;
  work_center_id?: string;
  machine_type?: string;
  manufacturer?: string;
  model_serial?: string;
  capacity_value?: number;
  capacity_unit?: string;
  available_shifts?: string;
  installation_date?: string;
  maintenance_notes?: string;
}) {
  const { data, error } = await supabase
    .from('machines')
    .insert({
      ...fields,
      status: 'IDLE',
    })
    .select('*').single();
  if (error) throw error;
  return data as Machine;
}

export async function updateMachine(
  id: string, fields: Partial<Pick<Machine,
    'name' | 'department_id' | 'work_center_id' | 'machine_type' | 'manufacturer' |
    'model_serial' | 'capacity_value' | 'capacity_unit' | 'available_shifts' |
    'installation_date' | 'maintenance_notes' | 'is_active'>>,
) {
  const { data, error } = await supabase
    .from('machines').update(fields).eq('id', id).select('*').single();
  if (error) throw error;
  return data as Machine;
}

export async function toggleMachineActive(id: string, isActive: boolean) {
  return updateMachine(id, { is_active: isActive });
}

// ============================================================
// Machine Status History & Status Changes (RPC)
// ============================================================

export async function changeMachineStatus(
  machineId: string, newStatus: MachineStatus, reason?: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('change_machine_status', {
    p_machine_id: machineId,
    p_new_status: newStatus,
    p_reason: reason ?? null,
    p_changed_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function reassignMachineWorkCenter(
  machineId: string, newWorkCenterId: string,
) {
  const { data: { user } } = await supabase.auth.getUser();
  const { data, error } = await supabase.rpc('reassign_machine_workcenter', {
    p_machine_id: machineId,
    p_new_work_center_id: newWorkCenterId,
    p_changed_by: user?.id ?? null,
  });
  if (error) throw error;
  return data as string;
}

export async function fetchMachineStatusHistory(machineId: string) {
  const { data, error } = await supabase
    .from('machine_status_history')
    .select('*')
    .eq('machine_id', machineId)
    .order('changed_at', { ascending: false });
  if (error) throw error;
  return data as MachineStatusHistory[];
}

// ============================================================
// Machine Availability
// ============================================================

export async function fetchMachineAvailability(machineId: string) {
  const { data, error } = await supabase
    .from('machine_availability')
    .select('*')
    .eq('machine_id', machineId)
    .order('effective_from', { ascending: false });
  if (error) throw error;
  return data as MachineAvailability[];
}

export async function createMachineAvailability(fields: {
  machine_id: string;
  availability_type: AvailabilityType;
  day_of_week?: number | null;
  start_time?: string | null;
  end_time?: string | null;
  effective_from?: string;
  effective_to?: string | null;
  planned_hours?: number | null;
  notes?: string | null;
}) {
  const { data, error } = await supabase
    .from('machine_availability')
    .insert(fields)
    .select('*').single();
  if (error) throw error;
  return data as MachineAvailability;
}

export async function deleteMachineAvailability(id: string) {
  const { error } = await supabase
    .from('machine_availability').delete().eq('id', id);
  if (error) throw error;
}

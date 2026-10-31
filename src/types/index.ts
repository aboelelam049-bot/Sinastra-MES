export type UserRole =
  | 'ADMIN'
  | 'PLANNING'
  | 'PRODUCTION_MANAGER'
  | 'PRODUCTION_ENGINEER'
  | 'SUPERVISOR'
  | 'QUALITY'
  | 'WAREHOUSE'
  | 'REPORTS_VIEWER';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  employee_id: string | null;
  department: string | null;
  phone: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AuditLog {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
}

export type ModuleKey =
  | 'dashboard'
  | 'production-planning'
  | 'work-orders'
  | 'machine-loading'
  | 'products-items'
  | 'machines'
  | 'departments'
  | 'work-centers'
  | 'routing'
  | 'production-execution'
  | 'quality-control'
  | 'barcode'
  | 'parent-batches'
  | 'product-families'
  | 'product-models'
  | 'item-master'
  | 'bom'
  | 'warehouse'
  | 'reports'
  | 'users'
  | 'settings';

export interface NavItem {
  key: ModuleKey;
  label: string;
  labelEn: string;
  icon: string;
}

// ============================================================
// Production Data Types
// ============================================================

export interface Product {
  id: string;
  item_code: string;
  name: string;
  name_en: string | null;
  description: string | null;
  unit_of_measure: string;
  category: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MachineStatus = 'RUNNING' | 'IDLE' | 'BREAKDOWN' | 'MAINTENANCE' | 'OFFLINE';

export interface Machine {
  id: string;
  machine_code: string;
  name: string;
  work_center: string | null;
  capacity_per_hr: number | null;
  department_id: string | null;
  work_center_id: string | null;
  machine_type: string | null;
  manufacturer: string | null;
  model_serial: string | null;
  capacity_value: number | null;
  capacity_unit: string | null;
  available_shifts: string | null;
  responsible_supervisor_id: string | null;
  installation_date: string | null;
  maintenance_notes: string | null;
  status: MachineStatus;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Department {
  id: string;
  department_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkCenter {
  id: string;
  work_center_code: string;
  name: string;
  department_id: string;
  description: string | null;
  default_unit_of_measure: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MachineStatusHistory {
  id: string;
  machine_id: string;
  previous_status: MachineStatus | null;
  new_status: MachineStatus;
  changed_by: string | null;
  changed_at: string;
  reason: string | null;
  related_maintenance_id: string | null;
}

export type AvailabilityType = 'SHIFT_SCHEDULE' | 'PLANNED_WORKING' | 'PLANNED_DOWNTIME' | 'MAINTENANCE' | 'BREAKDOWN';

export interface MachineAvailability {
  id: string;
  machine_id: string;
  availability_type: AvailabilityType;
  day_of_week: number | null;
  start_time: string | null;
  end_time: string | null;
  effective_from: string;
  effective_to: string | null;
  planned_hours: number | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ProductionRoute {
  id: string;
  route_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ProductionStage {
  id: string;
  route_id: string;
  stage_code: string;
  name: string;
  name_en: string | null;
  sequence_order: number;
  machine_id: string | null;
  is_active: boolean;
  created_at: string;
}

export type WorkOrderStatus = 'CREATED' | 'DRAFT' | 'PLANNED' | 'RELEASED' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type Priority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export interface WorkOrder {
  id: string;
  wo_number: string;
  product_id: string;
  production_route_id: string;
  planned_quantity: number;
  status: WorkOrderStatus;
  scheduled_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  production_plan_line_id: string | null;
  product_model_id: string | null;
  bom_header_id: string | null;
  bom_version_snapshot: string | null;
  unit_of_measure: string | null;
  priority: Priority;
  planned_start_date: string | null;
  planned_finish_date: string | null;
  released_by: string | null;
  released_at: string | null;
  actual_quantity: number;
}

export type InspectionResult = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface QualityCard {
  id: string;
  card_number: string;
  pallet_id: string | null;
  inspection_result: InspectionResult;
  inspector_id: string | null;
  notes: string | null;
  physical_card_confirmed: boolean;
  inspected_at: string | null;
  created_at: string;
}

// ============================================================
// Traceability Types
// ============================================================

export type BatchStatus = 'CREATED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ParentBatch {
  id: string;
  batch_number: string;
  work_order_id: string;
  product_id: string;
  production_route_id: string;
  current_stage_id: string | null;
  planned_quantity: number;
  actual_quantity: number;
  available_quantity: number;
  status: BatchStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type PalletStatus =
  | 'CREATED'
  | 'IN_PRODUCTION'
  | 'QUALITY_PENDING'
  | 'QUALITY_APPROVED'
  | 'WAREHOUSE_RECEIVED'
  | 'SPLIT'
  | 'CANCELLED';

export interface Pallet {
  id: string;
  pallet_number: string;
  parent_batch_id: string;
  work_order_id: string;
  product_id: string;
  stage_id: string;
  machine_id: string | null;
  quantity: number;
  quality_card_id: string | null;
  status: PalletStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type MovementType = 'CREATED' | 'STAGE_TRANSFER' | 'SPLIT' | 'QUALITY_INSPECTION' | 'WAREHOUSE_RECEIPT';

export interface PalletMovement {
  id: string;
  pallet_id: string;
  source_stage_id: string | null;
  destination_stage_id: string | null;
  movement_type: MovementType;
  quantity: number;
  performed_by: string | null;
  timestamp: string;
  reference_id: string | null;
  notes: string | null;
}

export type BarcodeStatus = 'ACTIVE' | 'RETIRED';

export interface Barcode {
  id: string;
  barcode_value: string;
  pallet_id: string;
  barcode_type: string;
  created_at: string;
  printed_at: string | null;
  print_count: number;
  status: BarcodeStatus;
}

// ============================================================
// Lookup Result (from lookup_pallet_by_barcode RPC)
// ============================================================

export interface PalletLookupResult {
  barcode: {
    barcode_value: string;
    status: BarcodeStatus;
    print_count: number;
    printed_at: string | null;
  };
  pallet: {
    id: string;
    pallet_number: string;
    quantity: number;
    status: PalletStatus;
    created_at: string;
  };
  parent_batch: {
    id: string;
    batch_number: string;
    planned_quantity: number;
    actual_quantity: number;
    available_quantity: number;
    status: BatchStatus;
  };
  work_order: {
    id: string;
    wo_number: string;
    status: WorkOrderStatus;
  };
  product: {
    id: string;
    item_code: string;
    name: string;
    name_en: string | null;
  };
  route: {
    id: string;
    route_code: string;
    name: string;
  } | null;
  stage: {
    id: string;
    stage_code: string;
    name: string;
    name_en: string | null;
  } | null;
  machine: {
    id: string;
    machine_code: string;
    name: string;
  } | null;
  quality: {
    id: string;
    card_number: string;
    inspection_result: InspectionResult;
    physical_card_confirmed: boolean;
    inspected_at: string | null;
  } | null;
  warehouse_received: boolean;
  movements: Array<{
    id: string;
    movement_type: MovementType;
    quantity: number;
    timestamp: string;
    notes: string | null;
    source_stage: string | null;
    destination_stage: string | null;
  }>;
}

// ============================================================
// Phase 2 — Master Data Types
// ============================================================

export interface ProductFamily {
  id: string;
  family_code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type KitType = 'SINGLE' | 'DOUBLE' | 'CUSTOM';

export interface ProductModel {
  id: string;
  model_code: string;
  name: string;
  family_id: string;
  product_type: string;
  kit_type: KitType;
  description: string | null;
  length_mm: number | null;
  width_mm: number | null;
  height_mm: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type ItemCategory = 'Length' | 'Front' | 'Back' | 'Raw Board' | 'Other Components';

export interface ItemMaster {
  id: string;
  item_code: string;
  name: string;
  category: ItemCategory;
  item_type: string;
  unit_of_measure: string;
  length_mm: number | null;
  width_mm: number | null;
  thickness_mm: number | null;
  description: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type BOMStatus = 'DRAFT' | 'ACTIVE' | 'SUPERSEDED';

export interface BOMHeader {
  id: string;
  product_model_id: string;
  version: string;
  effective_date: string | null;
  status: BOMStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface BOMLine {
  id: string;
  bom_header_id: string;
  item_id: string;
  item_code: string;
  required_qty: number;
  unit_of_measure: string;
  component_role: string;
  notes: string | null;
  created_at: string;
}

export interface KitTemplate {
  id: string;
  kit_type: KitType;
  name: string;
  is_active: boolean;
  created_at: string;
}

export interface KitTemplateLine {
  id: string;
  kit_template_id: string;
  component_role: string;
  required_qty: number;
  sort_order: number;
}

// ============================================================
// Phase 5 — Work Center Input Materials
// ============================================================

export interface WorkCenterMaterial {
  id: string;
  work_center_id: string;
  item_id: string;
  item_code: string;
  consumption_qty: number;
  unit_of_measure: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Phase 5b — Production Material Consumption
// ============================================================

export interface ProductionConsumption {
  id: string;
  work_order_id: string;
  work_center_id: string | null;
  machine_id: string | null;
  item_id: string;
  item_code: string;
  consumed_qty: number;
  unit_of_measure: string;
  produced_qty: number | null;
  consumption_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BOMLineInput {
  item_id: string;
  required_qty: number;
  unit_of_measure: string;
  component_role: string;
  notes?: string | null;
}

// ============================================================
// Phase 4 — Production Planning & Work Orders
// ============================================================

export type PlanType = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type PlanStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ProductionPlan {
  id: string;
  plan_number: string;
  plan_type: PlanType;
  plan_date: string;
  department_id: string | null;
  planned_start_date: string;
  planned_end_date: string;
  status: PlanStatus;
  created_by: string | null;
  approved_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionPlanLine {
  id: string;
  production_plan_id: string;
  product_model_id: string;
  bom_header_id: string | null;
  planned_quantity: number;
  unit_of_measure: string;
  required_completion_date: string | null;
  priority: Priority;
  notes: string | null;
  created_at: string;
}

export interface WorkOrderComponent {
  id: string;
  work_order_id: string;
  item_id: string | null;
  item_code: string;
  item_name: string | null;
  required_qty: number;
  unit_of_measure: string;
  component_role: string | null;
  bom_version: string | null;
  revision_number: number;
  created_at: string;
}

export type LoadingStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';

export interface MachineLoading {
  id: string;
  work_order_id: string;
  machine_id: string;
  work_center_id: string | null;
  planned_quantity: number;
  planned_date: string;
  shift: string | null;
  planned_start_time: string | null;
  planned_finish_time: string | null;
  status: LoadingStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

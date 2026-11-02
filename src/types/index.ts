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

// ============================================================
// Phase 5 — Routing Engine Types
// ============================================================

export type RoutingVersionStatus = 'DRAFT' | 'ACTIVE' | 'RETIRED';

export interface RoutingTemplate {
  id: string;
  route_code: string;
  name: string;
  description: string | null;
  product_model_applicability: string;
  item_type_applicability: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutingVersion {
  id: string;
  routing_template_id: string;
  version_number: number;
  effective_date: string | null;
  status: RoutingVersionStatus;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RoutingStage {
  id: string;
  routing_version_id: string;
  stage_code: string;
  stage_name: string;
  stage_name_en: string | null;
  sequence_number: number;
  work_center_id: string | null;
  eligible_machine_ids: string | null;
  responsible_role: string | null;
  input_item_type: string | null;
  output_item_type: string | null;
  input_unit: string | null;
  output_unit: string | null;
  quality_approval_required: boolean;
  is_active: boolean;
  created_at: string;
}

export interface StageTransition {
  id: string;
  routing_version_id: string;
  source_stage_id: string | null;
  destination_stage_id: string;
  transition_rules: string | null;
  is_active: boolean;
  created_at: string;
}

export interface RoutingItemRule {
  id: string;
  routing_template_id: string;
  item_type: string | null;
  product_model_id: string | null;
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
  quality_status: QualityGateStatus;
  warehouse_transferred: boolean;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  monthly_plan_item_id: string | null;
  master_plan_item_id: string | null;
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
  // Phase 7 extensions
  inspection_lot_id: string | null;
  work_order_id: string | null;
  parent_batch_id: string | null;
  product_model_id: string | null;
  item_id: string | null;
  item_code: string | null;
  item_name: string | null;
  production_route_id: string | null;
  routing_version_id: string | null;
  final_stage_id: string | null;
  final_stage_name: string | null;
  accepted_quantity: number;
  approver_id: string | null;
  approval_id: string | null;
  approval_date: string | null;
  wo_number: string | null;
  batch_number: string | null;
  model_name: string | null;
  print_count: number;
  updated_at: string;
}

// ============================================================
// Phase 7 — Quality Management Types
// ============================================================

export type InspectionLotStatus = 'PENDING' | 'IN_INSPECTION' | 'INSPECTED' | 'APPROVED' | 'REJECTED' | 'CLOSED';

export interface DefectMaster {
  id: string;
  defect_code: string;
  defect_name: string;
  defect_category: string;
  description: string | null;
  applicable_item_types: string;
  applicable_production_stages: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionLot {
  id: string;
  lot_number: string;
  work_order_id: string;
  parent_batch_id: string;
  product_model_id: string | null;
  item_id: string | null;
  production_route_id: string;
  routing_version_id: string | null;
  final_stage_id: string;
  source_transaction_ids: string;
  quantity_submitted: number;
  unit_of_measure: string;
  status: InspectionLotStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface InspectionResultRecord {
  id: string;
  inspection_lot_id: string;
  inspected_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  pending_inspection_quantity: number;
  unit_of_measure: string;
  inspection_date: string;
  inspector_id: string | null;
  defect_codes: string | null;
  defect_description: string | null;
  notes: string | null;
  attachments: string | null;
  is_reinspection: boolean;
  original_inspection_id: string | null;
  created_at: string;
}

export interface InspectionDefect {
  id: string;
  inspection_result_id: string;
  defect_id: string;
  defect_quantity: number;
  notes: string | null;
  created_at: string;
}

export type QualityDispositionType = 'ACCEPT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION';

export interface QualityDisposition {
  id: string;
  inspection_lot_id: string;
  inspection_result_id: string | null;
  disposition_type: QualityDispositionType;
  quantity: number;
  unit_of_measure: string;
  reason: string | null;
  approver_id: string | null;
  approver_role: string | null;
  original_rejected_quantity: number | null;
  rework_reference_id: string | null;
  re_inspection_result_id: string | null;
  is_final_scrap: boolean;
  created_at: string;
}

export type QualityApprovalDecision = 'ACCEPT' | 'REJECT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION';

export interface QualityApproval {
  id: string;
  inspection_lot_id: string;
  decision: QualityApprovalDecision;
  approved_quantity: number;
  rejected_quantity: number;
  disposition: string | null;
  approver_id: string;
  approver_role: string;
  approval_timestamp: string;
  notes: string | null;
  is_reversed: boolean;
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
}

export interface QualityCardPrint {
  id: string;
  quality_card_id: string;
  printed_by: string | null;
  printed_at: string;
  print_notes: string | null;
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

// ============================================================
// Phase 6 — Production Execution & Shop Floor Transactions
// ============================================================

export type ShiftSessionStatus = 'OPEN' | 'CLOSING' | 'CLOSED';

export interface ShiftSession {
  id: string;
  work_order_id: string;
  parent_batch_id: string;
  production_stage_id: string;
  machine_id: string | null;
  work_center_id: string | null;
  supervisor_id: string | null;
  shift: string | null;
  production_date: string;
  start_time: string;
  end_time: string | null;
  status: ShiftSessionStatus;
  opened_by: string | null;
  closed_by: string | null;
  closed_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductionTransaction {
  id: string;
  transaction_number: string;
  shift_session_id: string | null;
  parent_batch_id: string;
  work_order_id: string;
  production_stage_id: string;
  machine_id: string | null;
  input_qty: number;
  good_qty: number;
  rejected_qty: number;
  pending_qty: number;
  scrap_qty: number;
  rework_qty: number;
  unit_of_measure: string;
  operator_id: string | null;
  shift: string | null;
  start_time: string | null;
  completion_time: string | null;
  notes: string | null;
  idempotency_key: string | null;
  created_at: string;
}

export interface MaterialConversion {
  id: string;
  parent_batch_id: string;
  work_order_id: string;
  production_stage_id: string;
  source_item_id: string;
  source_item_code: string;
  source_qty: number;
  source_unit: string;
  output_item_id: string | null;
  output_item_code: string;
  output_qty: number;
  output_unit: string;
  output_type: string;
  machine_id: string | null;
  operator_id: string | null;
  conversion_date: string;
  notes: string | null;
  created_at: string;
}

export type DispositionType = 'REWORK' | 'SCRAP' | 'RETURN_FOR_INSPECTION';

export interface QuantityDisposition {
  id: string;
  production_transaction_id: string;
  parent_batch_id: string;
  disposition_type: DispositionType;
  quantity: number;
  unit_of_measure: string;
  authorized_by: string | null;
  reason: string;
  rework_transaction_id: string | null;
  created_at: string;
}

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

// ============================================================
// Simplified MES Types (Master Plan → Monthly Plan → Work Orders)
// ============================================================

export type MasterPlanStatus = 'DRAFT' | 'APPROVED' | 'CLOSED';
export type MonthlyPlanStatus = 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type SubWorkOrderStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'ON_HOLD' | 'CANCELLED';
export type QualityGateStatus = 'PENDING' | 'PASSED' | 'FAILED' | 'REWORK';
export type MonthlyPlanItemStatus = 'PENDING' | 'PLANNED' | 'RELEASED';

export interface MasterPlan {
  id: string;
  plan_code: string;
  name: string;
  description: string | null;
  status: MasterPlanStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface MasterPlanItem {
  id: string;
  master_plan_id: string;
  product_model_id: string;
  sequence_order: number;
  target_quantity: number;
  unit_of_measure: string;
  notes: string | null;
  created_at: string;
}

export interface MonthlyPlan {
  id: string;
  plan_code: string;
  name: string;
  master_plan_id: string;
  plan_month: string;
  status: MonthlyPlanStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MonthlyPlanItem {
  id: string;
  monthly_plan_id: string;
  master_plan_item_id: string | null;
  product_model_id: string;
  sequence_order: number;
  planned_quantity: number;
  unit_of_measure: string;
  planned_start_date: string | null;
  planned_end_date: string | null;
  work_order_id: string | null;
  status: MonthlyPlanItemStatus;
  notes: string | null;
  created_at: string;
}

export interface SubWorkOrder {
  id: string;
  work_order_id: string;
  sequence_number: number;
  routing_stage_id: string | null;
  machine_id: string | null;
  stage_name: string | null;
  planned_quantity: number;
  good_quantity: number;
  scrap_quantity: number;
  reject_quantity: number;
  status: SubWorkOrderStatus;
  planned_start_time: string | null;
  planned_end_time: string | null;
  actual_start_time: string | null;
  actual_end_time: string | null;
  quality_status: QualityGateStatus;
  warehouse_transferred: boolean;
  labor_count: number;
  material_item_id: string | null;
  material_qty: number;
  material_unit: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ScrapRecord {
  id: string;
  sub_work_order_id: string;
  work_order_id: string;
  quantity: number;
  defect_code: string | null;
  reason: string | null;
  recorded_by: string | null;
  recorded_at: string;
  notes: string | null;
}

export interface OeeSnapshot {
  id: string;
  work_order_id: string;
  availability: number;
  performance: number;
  quality: number;
  oee: number;
  planned_run_minutes: number | null;
  actual_run_minutes: number | null;
  ideal_cycle_minutes: number | null;
  good_qty: number | null;
  total_qty: number | null;
  computed_at: string;
}

export interface ModuleSetting {
  id: string;
  module_key: string;
  module_label: string;
  is_enabled: boolean;
  sort_order: number;
}
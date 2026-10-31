import type { PalletStatus, BatchStatus, WorkOrderStatus, InspectionResult, MovementType, MachineStatus, AvailabilityType, PlanStatus, PlanType, LoadingStatus, Priority } from '@/types';

export const PALLET_STATUS_LABELS: Record<PalletStatus, string> = {
  CREATED: 'تم الإنشاء',
  IN_PRODUCTION: 'قيد الإنتاج',
  QUALITY_PENDING: 'بانتظار الجودة',
  QUALITY_APPROVED: 'معتمد الجودة',
  WAREHOUSE_RECEIVED: 'تم الاستلام بالمخزن',
  SPLIT: 'تم تقسيمه',
  CANCELLED: 'ملغي',
};

export const PALLET_STATUS_COLORS: Record<PalletStatus, string> = {
  CREATED: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_PRODUCTION: 'bg-blue-100 text-blue-700 border-blue-200',
  QUALITY_PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  QUALITY_APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  WAREHOUSE_RECEIVED: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  SPLIT: 'bg-purple-100 text-purple-700 border-purple-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export const BATCH_STATUS_LABELS: Record<BatchStatus, string> = {
  CREATED: 'تم الإنشاء',
  IN_PROGRESS: 'قيد التشغيل',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const BATCH_STATUS_COLORS: Record<BatchStatus, string> = {
  CREATED: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_PROGRESS: 'bg-blue-100 text-blue-700 border-blue-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export const WO_STATUS_LABELS: Record<WorkOrderStatus, string> = {
  CREATED: 'تم الإنشاء',
  DRAFT: 'مسودة',
  PLANNED: 'مخطط',
  RELEASED: 'مُطلق',
  IN_PROGRESS: 'قيد التنفيذ',
  ON_HOLD: 'معلّق',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const WO_STATUS_COLORS: Record<WorkOrderStatus, string> = {
  CREATED: 'bg-slate-100 text-slate-700 border-slate-200',
  DRAFT: 'bg-slate-100 text-slate-500 border-slate-200',
  PLANNED: 'bg-blue-100 text-blue-700 border-blue-200',
  RELEASED: 'bg-teal-100 text-teal-700 border-teal-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200',
  ON_HOLD: 'bg-orange-100 text-orange-700 border-orange-200',
  COMPLETED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export const INSPECTION_LABELS: Record<InspectionResult, string> = {
  PENDING: 'بانتظار الفحص',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
};

export const INSPECTION_COLORS: Record<InspectionResult, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
};

export const MOVEMENT_LABELS: Record<MovementType, string> = {
  CREATED: 'إنشاء',
  STAGE_TRANSFER: 'نقل مرحلة',
  SPLIT: 'تقسيم',
  QUALITY_INSPECTION: 'فحص جودة',
  WAREHOUSE_RECEIPT: 'استلام مخزن',
};

export const MOVEMENT_COLORS: Record<MovementType, string> = {
  CREATED: 'bg-slate-100 text-slate-700 border-slate-200',
  STAGE_TRANSFER: 'bg-blue-100 text-blue-700 border-blue-200',
  SPLIT: 'bg-purple-100 text-purple-700 border-purple-200',
  QUALITY_INSPECTION: 'bg-amber-100 text-amber-700 border-amber-200',
  WAREHOUSE_RECEIPT: 'bg-cyan-100 text-cyan-700 border-cyan-200',
};

export const MACHINE_STATUS_LABELS: Record<MachineStatus, string> = {
  RUNNING: 'يعمل',
  IDLE: 'متوقف',
  BREAKDOWN: 'عطل',
  MAINTENANCE: 'صيانة',
  OFFLINE: 'غير متصل',
};

export const MACHINE_STATUS_COLORS: Record<MachineStatus, string> = {
  RUNNING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  IDLE: 'bg-slate-100 text-slate-700 border-slate-200',
  BREAKDOWN: 'bg-red-100 text-red-700 border-red-200',
  MAINTENANCE: 'bg-amber-100 text-amber-700 border-amber-200',
  OFFLINE: 'bg-slate-100 text-slate-400 border-slate-200',
};

export const AVAILABILITY_LABELS: Record<AvailabilityType, string> = {
  SHIFT_SCHEDULE: 'جدولة الورديات',
  PLANNED_WORKING: 'ساعات عمل مخططة',
  PLANNED_DOWNTIME: 'توقف مخطط',
  MAINTENANCE: 'صيانة',
  BREAKDOWN: 'أعطال',
};

export const AVAILABILITY_COLORS: Record<AvailabilityType, string> = {
  SHIFT_SCHEDULE: 'bg-blue-100 text-blue-700 border-blue-200',
  PLANNED_WORKING: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PLANNED_DOWNTIME: 'bg-amber-100 text-amber-700 border-amber-200',
  MAINTENANCE: 'bg-purple-100 text-purple-700 border-purple-200',
  BREAKDOWN: 'bg-red-100 text-red-700 border-red-200',
};

// ============================================================
// Phase 4 — Planning & Work Orders
// ============================================================

export const PLAN_STATUS_LABELS: Record<PlanStatus, string> = {
  DRAFT: 'مسودة',
  SUBMITTED: 'مُرسلة',
  APPROVED: 'معتمدة',
  IN_PROGRESS: 'قيد التنفيذ',
  COMPLETED: 'مكتملة',
  CANCELLED: 'ملغية',
};

export const PLAN_STATUS_COLORS: Record<PlanStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  IN_PROGRESS: 'bg-amber-100 text-amber-700 border-amber-200',
  COMPLETED: 'bg-teal-100 text-teal-700 border-teal-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

export const PLAN_TYPE_LABELS: Record<PlanType, string> = {
  DAILY: 'يومي',
  WEEKLY: 'أسبوعي',
  MONTHLY: 'شهري',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: 'منخفضة',
  NORMAL: 'عادية',
  HIGH: 'عالية',
  URGENT: 'عاجلة',
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  LOW: 'bg-slate-100 text-slate-600 border-slate-200',
  NORMAL: 'bg-blue-100 text-blue-700 border-blue-200',
  HIGH: 'bg-amber-100 text-amber-700 border-amber-200',
  URGENT: 'bg-red-100 text-red-700 border-red-200',
};

export const LOADING_STATUS_LABELS: Record<LoadingStatus, string> = {
  PLANNED: 'مخطط',
  ACTIVE: 'نشط',
  COMPLETED: 'مكتمل',
  CANCELLED: 'ملغي',
};

export const LOADING_STATUS_COLORS: Record<LoadingStatus, string> = {
  PLANNED: 'bg-blue-100 text-blue-700 border-blue-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  COMPLETED: 'bg-slate-100 text-slate-600 border-slate-200',
  CANCELLED: 'bg-red-100 text-red-700 border-red-200',
};

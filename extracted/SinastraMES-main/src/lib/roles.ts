import type { ModuleKey, UserRole } from '@/types';

export const ROLES: { value: UserRole; labelAr: string; labelEn: string; description: string }[] = [
  { value: 'ADMIN', labelAr: 'مدير النظام', labelEn: 'Administrator', description: 'صلاحيات كاملة على النظام' },
  { value: 'PLANNING', labelAr: 'تخطيط الإنتاج', labelEn: 'Planning', description: 'إدارة خطط الإنتاج والأوامر' },
  { value: 'PRODUCTION_MANAGER', labelAr: 'مدير الإنتاج', labelEn: 'Production Manager', description: 'إدارة عمليات الإنتاج' },
  { value: 'PRODUCTION_ENGINEER', labelAr: 'مهندس إنتاج', labelEn: 'Production Engineer', description: 'تنفيذ ومتابعة الإنتاج' },
  { value: 'SUPERVISOR', labelAr: 'مشرف', labelEn: 'Supervisor', description: 'إشراف على خطوط الإنتاج' },
  { value: 'QUALITY', labelAr: 'مراقبة الجودة', labelEn: 'Quality Control', description: 'فحص واعتماد الجودة' },
  { value: 'WAREHOUSE', labelAr: 'المخزن', labelEn: 'Warehouse', description: 'استلام وتخزين المنتجات' },
  { value: 'REPORTS_VIEWER', labelAr: 'عرض التقارير', labelEn: 'Reports Viewer', description: 'عرض التقارير فقط' },
];

export const ROLE_VALUES = ROLES.map((r) => r.value);

export function getRoleLabel(role: UserRole): string {
  const r = ROLES.find((x) => x.value === role);
  return r ? r.labelAr : role;
}

export function getRoleLabelEn(role: UserRole): string {
  const r = ROLES.find((x) => x.value === role);
  return r ? r.labelEn : role;
}

export const ROLE_COLORS: Record<UserRole, string> = {
  ADMIN: 'bg-red-100 text-red-700 border-red-200',
  PLANNING: 'bg-blue-100 text-blue-700 border-blue-200',
  PRODUCTION_MANAGER: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  PRODUCTION_ENGINEER: 'bg-teal-100 text-teal-700 border-teal-200',
  SUPERVISOR: 'bg-amber-100 text-amber-700 border-amber-200',
  QUALITY: 'bg-purple-100 text-purple-700 border-purple-200',
  WAREHOUSE: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  REPORTS_VIEWER: 'bg-slate-100 text-slate-700 border-slate-200',
};

// Module access per role — Phase 1 uses this for UI gating only.
// Backend RLS enforcement will be added in Phase 2.
export const MODULE_ACCESS: Record<UserRole, ModuleKey[]> = {
  ADMIN: [
    'dashboard', 'production-planning', 'work-orders', 'machine-loading', 'products-items',
    'product-families', 'product-models', 'item-master', 'bom',
    'departments', 'work-centers', 'machines', 'routing', 'production-execution', 'quality-control',
    'barcode', 'parent-batches', 'warehouse', 'reports', 'users', 'settings',
  ],
  PLANNING: [
    'dashboard', 'production-planning', 'work-orders', 'machine-loading', 'products-items',
    'product-families', 'product-models', 'item-master', 'bom',
    'departments', 'work-centers', 'machines', 'routing', 'reports',
  ],
  PRODUCTION_MANAGER: [
    'dashboard', 'production-planning', 'work-orders', 'machine-loading', 'products-items',
    'product-families', 'product-models', 'item-master', 'bom',
    'departments', 'work-centers', 'machines', 'routing',
    'production-execution', 'quality-control', 'parent-batches', 'warehouse', 'reports',
  ],
  PRODUCTION_ENGINEER: [
    'dashboard', 'work-orders', 'machine-loading', 'products-items',
    'departments', 'work-centers', 'machines',
    'product-models', 'item-master',
    'production-execution', 'quality-control', 'barcode', 'parent-batches', 'reports',
  ],
  SUPERVISOR: [
    'dashboard', 'work-orders', 'machine-loading', 'production-execution',
    'quality-control', 'barcode', 'parent-batches',
    'machines', 'reports',
  ],
  QUALITY: [
    'dashboard', 'work-orders', 'quality-control', 'barcode', 'parent-batches', 'reports',
  ],
  WAREHOUSE: [
    'dashboard', 'products-items', 'barcode', 'parent-batches', 'warehouse', 'reports',
  ],
  REPORTS_VIEWER: ['dashboard', 'reports'],
};

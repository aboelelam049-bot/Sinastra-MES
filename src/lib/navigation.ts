import type { NavItem } from '@/types';

export const NAV_ITEMS: NavItem[] = [
  { key: 'dashboard', label: 'لوحة التحكم', labelEn: 'Dashboard', icon: 'LayoutDashboard' },
  { key: 'production-planning', label: 'الخطة ماستر والشهرية', labelEn: 'Master & Monthly Plan', icon: 'CalendarRange' },
  { key: 'work-orders', label: 'أوامر العمل', labelEn: 'Work Orders', icon: 'ClipboardList' },
  { key: 'machine-loading', label: 'تحميل الماكينات', labelEn: 'Machine Loading', icon: 'CalendarClock' },
  { key: 'products-items', label: 'المنتجات والأصناف', labelEn: 'Products & Items', icon: 'Package' },
  { key: 'product-families', label: 'عائلات المنتجات', labelEn: 'Product Families', icon: 'Boxes' },
  { key: 'product-models', label: 'موديلات المنتجات', labelEn: 'Product Models', icon: 'Layers' },
  { key: 'item-master', label: 'الأصناف الرئيسية', labelEn: 'Item Master', icon: 'PackageSearch' },
  { key: 'bom', label: 'شجرة المواد (BOM)', labelEn: 'Bill of Materials', icon: 'ListTree' },
  { key: 'departments', label: 'الأقسام', labelEn: 'Departments', icon: 'Building2' },
  { key: 'work-centers', label: 'مراكز العمل', labelEn: 'Work Centers', icon: 'Factory' },
  { key: 'machines', label: 'الماكينات', labelEn: 'Machines', icon: 'Cog' },
  { key: 'routing', label: 'المسارات وسير العمل', labelEn: 'Routing & Workflow', icon: 'GitBranch' },
  { key: 'production-execution', label: 'تنفيذ الإنتاج و OEE', labelEn: 'Production Execution & OEE', icon: 'PlayCircle' },
  { key: 'quality-control', label: 'مراقبة الجودة', labelEn: 'Quality Control', icon: 'ShieldCheck' },
  { key: 'barcode', label: 'إدارة الباركود', labelEn: 'Barcode Management', icon: 'Barcode' },
  { key: 'parent-batches', label: 'الدفعات الأم', labelEn: 'Parent Batches', icon: 'Layers' },
  { key: 'warehouse', label: 'مخزن الإنتاج', labelEn: 'Production Warehouse', icon: 'Warehouse' },
  { key: 'reports', label: 'التقارير والتحليلات', labelEn: 'Reports & Analytics', icon: 'BarChart3' },
  { key: 'users', label: 'المستخدمين والصلاحيات', labelEn: 'Users & Permissions', icon: 'Users' },
  { key: 'settings', label: 'إعدادات النظام', labelEn: 'System Settings', icon: 'Settings' },
];

export function getNavItem(key: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.key === key);
}

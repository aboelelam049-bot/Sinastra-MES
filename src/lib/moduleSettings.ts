import { supabase } from '@/lib/supabase';

export interface ModuleSetting {
  id: string;
  module_key: string;
  module_label: string;
  is_enabled: boolean;
  sort_order: number;
}

const CACHE_KEY = 'mes_module_settings';
let cachedSettings: ModuleSetting[] | null = null;

export async function fetchModuleSettings(): Promise<ModuleSetting[]> {
  if (cachedSettings) return cachedSettings;
  try {
    const { data, error } = await supabase
      .from('module_settings')
      .select('*')
      .order('sort_order', { ascending: true });
    if (error) throw error;
    cachedSettings = (data as ModuleSetting[]) ?? [];
    return cachedSettings;
  } catch {
    // Fallback to defaults if table not accessible
    return getDefaultSettings();
  }
}

export async function updateModuleEnabled(key: string, enabled: boolean): Promise<void> {
  if (cachedSettings) {
    const s = cachedSettings.find(s => s.module_key === key);
    if (s) s.is_enabled = enabled;
  }
  try {
    await supabase
      .from('module_settings')
      .update({ is_enabled: enabled, updated_at: new Date().toISOString() })
      .eq('module_key', key);
  } catch { /* ignore — cache is source of truth for UI */ }
}

export function isModuleEnabled(settings: ModuleSetting[] | null, key: string): boolean {
  if (!settings || settings.length === 0) return true;
  const s = settings.find(s => s.module_key === key);
  return s ? s.is_enabled : true;
}

export function clearModuleSettingsCache() {
  cachedSettings = null;
}

function getDefaultSettings(): ModuleSetting[] {
  const defaults: Record<string, [string, boolean, number]> = {
    'dashboard': ['لوحة التحكم', true, 1],
    'production-planning': ['تخطيط الإنتاج', true, 2],
    'production-execution': ['تنفيذ الإنتاج', true, 3],
    'quality-control': ['مراقبة الجودة', true, 4],
    'warehouse': ['مخزن الإنتاج', true, 5],
    'machines': ['الماكينات', true, 6],
    'routing': ['المسارات', true, 7],
    'reports': ['التقارير', true, 8],
    'product-models': ['موديلات المنتجات', true, 9],
    'product-families': ['عائلات المنتجات', true, 10],
    'item-master': ['الأصناف الرئيسية', true, 11],
    'settings': ['الإعدادات', true, 30],
    'work-orders': ['أوامر العمل', false, 20],
    'machine-loading': ['تحميل الماكينات', false, 21],
    'products-items': ['المنتجات والأصناف', false, 22],
    'departments': ['الأقسام', false, 23],
    'work-centers': ['مراكز العمل', false, 24],
    'barcode': ['الباركود', false, 25],
    'parent-batches': ['الدفعات الأم', false, 26],
    'bom': ['BOM', false, 27],
    'users': ['المستخدمين', false, 28],
  };
  return Object.entries(defaults).map(([key, [label, enabled, order]]) => ({
    id: key, module_key: key, module_label: label, is_enabled: enabled, sort_order: order,
  }));
}

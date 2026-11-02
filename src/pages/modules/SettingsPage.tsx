import { useState, useEffect, useCallback } from 'react';
import { Settings as SettingsIcon, Database, Shield, GitBranch, ToggleLeft, ToggleRight, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { fetchModuleSettings, updateModuleEnabled, clearModuleSettingsCache, type ModuleSetting } from '@/lib/moduleSettings';

export function SettingsPage() {
  const [settings, setSettings] = useState<ModuleSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSettings(await fetchModuleSettings());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleToggle(key: string, enabled: boolean) {
    setSettings(prev => prev.map(s => s.module_key === key ? { ...s, is_enabled: enabled } : s));
    clearModuleSettingsCache();
    try {
      await updateModuleEnabled(key, enabled);
    } catch {
      setSettings(prev => prev.map(s => s.module_key === key ? { ...s, is_enabled: !enabled } : s));
    }
  }

  const enabledCount = settings.filter(s => s.is_enabled).length;
  const disabledCount = settings.filter(s => !s.is_enabled).length;

  return (
    <div>
      <PageHeader title="إعدادات النظام" subtitle="System Settings — تفعيل وإيقاف الوحدات" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader title="قاعدة البيانات" subtitle="Database Connection" />
          <CardBody>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">الحالة</span>
                <Badge color="bg-emerald-100 text-emerald-700 border-emerald-200" variant="dot">متصل</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">المزود</span>
                <span className="text-sm font-medium text-slate-700">Supabase (PostgreSQL)</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">RLS</span>
                <Badge color="bg-emerald-100 text-emerald-700 border-emerald-200">مفعّل</Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="تفعيل الوحدات" subtitle="Module Enable/Disable" />
          <CardBody>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">الوحدات المفعّلة</span>
                <Badge color="bg-emerald-100 text-emerald-700 border-emerald-200">{enabledCount}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">الوحدات المتوقفة</span>
                <Badge color="bg-slate-100 text-slate-600 border-slate-200">{disabledCount}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-600" />
                <span className="text-sm text-slate-600">يمكن تفعيل أو إيقاف أي وحدة في أي وقت</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <SettingsIcon className="w-4 h-4" /> تفعيل وإيقاف وحدات النظام
          </h3>
          <Button variant="secondary" size="sm" onClick={load}>
            <RefreshCw className="w-3.5 h-3.5" /> تحديث
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
          </div>
        ) : settings.length === 0 ? (
          <EmptyState icon={<SettingsIcon className="w-7 h-7" />} title="لا توجد إعدادات" description="لم يتم العثور على وحدات." />
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الوحدة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">المفتاح</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {settings.map(s => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-medium text-slate-700">{s.module_label}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    <span className="font-mono text-xs text-slate-400" dir="ltr">{s.module_key}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {s.is_enabled
                      ? <Badge color="bg-emerald-100 text-emerald-700 border-emerald-200" variant="dot">مفعّلة</Badge>
                      : <Badge color="bg-slate-100 text-slate-500 border-slate-200" variant="dot">متوقفة</Badge>}
                  </td>
                  <td className="px-4 py-2.5">
                    <button
                      onClick={() => handleToggle(s.module_key, !s.is_enabled)}
                      className={`p-1 rounded transition-colors ${s.is_enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-300 hover:bg-slate-100'}`}
                      title={s.is_enabled ? 'إيقاف' : 'تفعيل'}
                    >
                      {s.is_enabled
                        ? <ToggleRight className="w-7 h-7" />
                        : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Card>
        <CardHeader title="الأمان والصلاحيات" subtitle="Security & Authorization" />
        <CardBody>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-slate-600">Row Level Security مفعّل على جميع الجداول</span>
            </div>
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-slate-600">8 أدوار معرفة في النظام</span>
            </div>
            <div className="flex items-center gap-2">
              <GitBranch className="w-4 h-4 text-slate-400" />
              <span className="text-sm text-slate-500">سجل التدقيق (Audit Logs) جاهز للاستخدام</span>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Settings as SettingsIcon, Database, Shield, GitBranch } from 'lucide-react';

export function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="إعدادات النظام"
        subtitle="System Settings"
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* Database info */}
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

        {/* Security info */}
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

      {/* Settings placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={<SettingsIcon className="w-7 h-7" />}
          title="إعدادات إضافية"
          description="ستتيح هذه الصفحة تكوين إعدادات النظام: إعدادات المصنع، إعدادات الطباعة، إعدادات الباركود، وإعدادات اللغة والعرض."
        />
      </div>
    </div>
  );
}

import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Users as UsersIcon, ShieldCheck, Lock } from 'lucide-react';
import { ROLES } from '@/lib/roles';

export function UsersPage() {
  return (
    <div>
      <PageHeader
        title="المستخدمين والصلاحيات"
        subtitle="Users & Permissions"
      />

      {/* Role definitions */}
      <Card className="mb-6">
        <CardBody>
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="w-5 h-5 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-800">الأدوار المعرفة في النظام</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {ROLES.map((role) => (
              <div key={role.value} className="border border-slate-200 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-slate-700">{role.labelAr}</span>
                  <Badge color="bg-slate-100 text-slate-600 border-slate-200 text-[10px]">{role.value}</Badge>
                </div>
                <p className="text-xs text-slate-500">{role.description}</p>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      {/* Users list placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={<UsersIcon className="w-7 h-7" />}
          title="قائمة المستخدمين"
          description="ستظهر هنا قائمة بجميع مستخدمي النظام مع إمكانية إضافة مستخدمين جدد، تعديل الأدوار، وتفعيل/إلغاء تفعيل الحسابات. إدارة الأدوار تتم من خلال مدير النظام (ADMIN) فقط."
        />
      </div>

      {/* Security note */}
      <div className="mt-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          يتم تطبيق الصلاحيات على مستوى قاعدة البيانات من خلال سياسات Row Level Security (RLS) في Supabase،
          وليس فقط من خلال إخفاء العناصر في الواجهة. لا يمكن للمستخدم الوصول إلى البيانات أو العمليات
          خارج صلاحياته حتى لو حاول الوصول إليها مباشرة.
        </p>
      </div>
    </div>
  );
}

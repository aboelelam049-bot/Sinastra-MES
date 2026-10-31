import { useState, useEffect } from 'react';
import {
  TrendingUp, ClipboardList, Clock, ShieldCheck, Warehouse,
  AlertTriangle, Gauge, Package, Activity, Loader2, CalendarClock,
} from 'lucide-react';
import { StatCard } from '@/components/ui/StatCard';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { fetchPlanningDashboard, type PlanningDashboard } from '@/lib/planningService';
import { WO_STATUS_LABELS, WO_STATUS_COLORS } from '@/lib/statusLabels';
import type { WorkOrderStatus } from '@/types';

export function DashboardPage() {
  const today = new Date().toLocaleDateString('ar-EG', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const [dash, setDash] = useState<PlanningDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setDash(await fetchPlanningDashboard());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalWOs = dash ? Object.values(dash.woByStatus).reduce((s, n) => s + n, 0) : 0;
  const completionRate = dash && dash.totalPlannedQty > 0
    ? Math.round((dash.totalActualQty / dash.totalPlannedQty) * 100)
    : 0;

  return (
    <div>
      <PageHeader title="لوحة التحكم" subtitle={today} />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertTriangle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : (
        <>
          {/* Top row: Planning stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="إجمالي الكمية المخططة"
              value={dash?.totalPlannedQty ?? 0}
              icon={ClipboardList}
              iconColor="text-blue-600"
              iconBg="bg-blue-50"
            />
            <StatCard
              label="إجمالي الكمية الفعلية"
              value={dash?.totalActualQty ?? 0}
              icon={TrendingUp}
              iconColor="text-emerald-600"
              iconBg="bg-emerald-50"
            />
            <StatCard
              label="نسبة الإنجاز"
              value={`${completionRate}%`}
              icon={Activity}
              iconColor="text-teal-600"
              iconBg="bg-teal-50"
            />
            <StatCard
              label="إجمالي أوامر العمل"
              value={totalWOs}
              icon={Package}
              iconColor="text-amber-600"
              iconBg="bg-amber-50"
            />
          </div>

          {/* Second row: Operations stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard
              label="أوامر متأخرة"
              value={dash?.overdueCount ?? 0}
              icon={AlertTriangle}
              iconColor="text-red-600"
              iconBg="bg-red-50"
            />
            <StatCard
              label="أوامر غير مخصصة"
              value={dash?.unassignedCount ?? 0}
              icon={CalendarClock}
              iconColor="text-indigo-600"
              iconBg="bg-indigo-50"
            />
            <StatCard
              label="فحوصات جودة معلقة"
              value="—"
              icon={ShieldCheck}
              iconColor="text-purple-600"
              iconBg="bg-purple-50"
              isPlaceholder
            />
            <StatCard
              label="بانتظار استلام المخزن"
              value="—"
              icon={Warehouse}
              iconColor="text-cyan-600"
              iconBg="bg-cyan-50"
              isPlaceholder
            />
          </div>

          {/* Bottom row: WO by status + Upcoming deadlines */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* WO by Status */}
            <Card>
              <CardHeader title="أوامر العمل حسب الحالة" subtitle="Work Orders by Status" />
              <CardBody>
                {dash && Object.keys(dash.woByStatus).length > 0 ? (
                  <div className="space-y-2">
                    {Object.entries(dash.woByStatus).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between">
                        <Badge color={WO_STATUS_COLORS[status as WorkOrderStatus]} variant="dot">
                          {WO_STATUS_LABELS[status as WorkOrderStatus]}
                        </Badge>
                        <span className="text-sm font-semibold text-slate-700">{count}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-6">لا توجد أوامر عمل</p>
                )}
              </CardBody>
            </Card>

            {/* Upcoming deadlines */}
            <Card>
              <CardHeader title="المواعيد القادمة" subtitle="Upcoming Deadlines" />
              <CardBody>
                {dash && dash.upcomingDeadlines.length > 0 ? (
                  <div className="space-y-2">
                    {dash.upcomingDeadlines.map(w => (
                      <div key={w.id} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                        <div>
                          <p className="font-mono text-xs font-medium text-slate-700" dir="ltr">{w.wo_number}</p>
                          <p className="text-xs text-slate-400">{w.planned_quantity} {w.unit_of_measure}</p>
                        </div>
                        <div className="text-left">
                          <p className="text-xs text-slate-600" dir="ltr">{w.planned_finish_date}</p>
                          <Badge color={WO_STATUS_COLORS[w.status]}>{WO_STATUS_LABELS[w.status]}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 text-center py-6">لا توجد مواعيد قادمة</p>
                )}
              </CardBody>
            </Card>
          </div>

          {/* Workload by machine */}
          {dash && dash.loadingsByMachine.length > 0 && (
            <div className="mt-4">
              <Card>
                <CardHeader title="الحمل المخطط حسب الماكينة" subtitle="Planned Workload by Machine" />
                <CardBody>
                  <div className="space-y-2">
                    {dash.loadingsByMachine.map(m => (
                      <div key={m.machineId} className="flex items-center justify-between">
                        <span className="text-sm text-slate-700">{m.machineName}</span>
                        <span className="text-sm font-semibold text-slate-800">{m.plannedQty}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

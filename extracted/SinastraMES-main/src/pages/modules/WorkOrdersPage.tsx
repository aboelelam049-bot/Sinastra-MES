import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Plus, Loader2, AlertCircle, RefreshCw,
  Search, ArrowRight, Zap, Package, Clock, XCircle,
  CalendarDays, Layers, AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchWorkOrders, fetchWorkOrder, createWorkOrderFromPlan,
  releaseWorkOrder, updateWorkOrderStatus, updateWorkOrderDates,
  fetchWorkOrderComponents,
} from '@/lib/planningService';
import {
  fetchPlans, fetchPlanLines,
} from '@/lib/planningService';
import {
  WO_STATUS_LABELS, WO_STATUS_COLORS,
  PRIORITY_LABELS, PRIORITY_COLORS,
} from '@/lib/statusLabels';
import type {
  WorkOrder, WorkOrderComponent, PlanStatus,
  ProductModel, ProductionPlanLine, Priority, BOMHeader,
} from '@/types';

type WOWithModel = WorkOrder & {
  model: ProductModel | null;
  plan_line: (ProductionPlanLine & { model: ProductModel }) | null;
};

const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const CANCELLABLE_STATUSES = ['DRAFT', 'CREATED', 'PLANNED', 'RELEASED', 'IN_PROGRESS', 'ON_HOLD'];

export function WorkOrdersPage() {
  const [wos, setWos] = useState<WOWithModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkOrders(search.trim() || undefined, statusFilter || undefined);
      setWos(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(wos.length / ITEM_PAGE_SIZE));
  const pageRows = wos.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  if (detailId) {
    return <WorkOrderDetail woId={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="أوامر العمل"
        subtitle="Work Orders — إنشاء وإدارة أوامر العمل من الخطط المعتمدة"
        action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> أمر عمل جديد</Button>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-3 flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم أمر العمل…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الحالات</option>
 {Object.keys(WO_STATUS_LABELS).map(s => <option key={s} value={s}>{WO_STATUS_LABELS[s as keyof typeof WO_STATUS_LABELS]}</option>)}
        </select>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : pageRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<ClipboardList className="w-7 h-7" />} title="لا توجد أوامر عمل"
            description="أنشئ أول أمر عمل من بند خطة معتمدة. يتم توليد رقم الأمر تلقائياً."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> أمر عمل جديد</Button>} />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">رقم الأمر</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">الموديل</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية المخططة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الفعلي</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">الأولوية</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(w => (
                  <tr key={w.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailId(w.id)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{w.wo_number}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 hidden md:table-cell">{w.model?.name ?? w.plan_line?.model?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{w.planned_quantity}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell">
                      <span className={Number(w.actual_quantity) > 0 ? 'text-emerald-600 font-medium' : 'text-slate-400'}>{w.actual_quantity}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell"><Badge color={PRIORITY_COLORS[w.priority]}>{PRIORITY_LABELS[w.priority]}</Badge></td>
                    <td className="px-4 py-3"><Badge color={WO_STATUS_COLORS[w.status]} variant="dot">{WO_STATUS_LABELS[w.status]}</Badge></td>
                    <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={wos.length} onChange={setPage} />
        </>
      )}

      {showCreate && <CreateWOModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setDetailId(id); }} />}
    </div>
  );
}

// ============================================================
// Create Work Order Modal (from approved plan line)
// ============================================================

function CreateWOModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [approvedLines, setApprovedLines] = useState<(ProductionPlanLine & { model: ProductModel; bom: BOMHeader | null })[]>([]);
  const [selectedLine, setSelectedLine] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setFetching(true);
      try {
        // Fetch approved plans
        const plans = await fetchPlans(undefined, 'APPROVED', undefined);
        // Also include IN_PROGRESS plans
        const inProgressPlans = await fetchPlans(undefined, 'IN_PROGRESS', undefined);
        const allPlans = [...plans, ...inProgressPlans];
        const allLines: (ProductionPlanLine & { model: ProductModel; bom: BOMHeader | null })[] = [];
        for (const p of allPlans) {
          const lines = await fetchPlanLines(p.id);
          allLines.push(...lines);
        }
        setApprovedLines(allLines);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'حدث خطأ');
      } finally {
        setFetching(false);
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const id = await createWorkOrderFromPlan(selectedLine);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء أمر عمل جديد" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 text-xs text-blue-700 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>يتم إنشاء أوامر العمل من بنود الخطط المعتمدة فقط. سيتم تجميد إصدار BOM عند الإطلاق.</span>
        </div>
        <Field label="بند الخطة المعتمد">
          {fetching ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ تحميل البنود…</div>
          ) : approvedLines.length === 0 ? (
            <div className="text-sm text-slate-500 bg-slate-50 rounded-lg px-3 py-2.5">
              لا توجد بنود معتمدة. اعتمد خطة إنتاج أولاً.
            </div>
          ) : (
            <select value={selectedLine} onChange={e => setSelectedLine(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">اختر بند</option>
              {approvedLines.map(l => (
                <option key={l.id} value={l.id}>
                  {l.model.name} ({l.model.model_code}) — {l.planned_quantity} {l.unit_of_measure}
                </option>
              ))}
            </select>
          )}
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !selectedLine || approvedLines.length === 0}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Work Order Detail
// ============================================================

function WorkOrderDetail({ woId, onBack }: { woId: string; onBack: () => void }) {
  const [wo, setWo] = useState<WOWithModel | null>(null);
  const [components, setComponents] = useState<WorkOrderComponent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showReleaseConfirm, setShowReleaseConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [showEditDates, setShowEditDates] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [w, comps] = await Promise.all([
        fetchWorkOrder(woId),
        fetchWorkOrderComponents(woId),
      ]);
      setWo(w);
      setComponents(comps);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => { load(); }, [load]);

  async function handleRelease() {
    setActionError(null);
    try {
      await releaseWorkOrder(woId);
      setShowReleaseConfirm(false);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ');
      setShowReleaseConfirm(false);
    }
  }

  async function handleCancel() {
    setActionError(null);
    try {
      await updateWorkOrderStatus(woId, 'CANCELLED');
      setShowCancelConfirm(false);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'حدث خطأ');
      setShowCancelConfirm(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  }
  if (!wo) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ArrowRight className="w-5 h-5 rotate-180" /></button>
          <span className="text-sm text-slate-500">أمر العمل غير موجود</span>
        </div>
      </div>
    );
  }

  const canRelease = wo.status === 'DRAFT' || wo.status === 'CREATED' || wo.status === 'PLANNED';
  const canCancel = CANCELLABLE_STATUSES.includes(wo.status);
  const canEditDates = wo.status === 'DRAFT' || wo.status === 'CREATED' || wo.status === 'PLANNED';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ArrowRight className="w-5 h-5 rotate-180" /></button>
        <PageHeader title={wo.wo_number} subtitle={wo.model?.name ?? wo.plan_line?.model?.name ?? ''} />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {actionError && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {actionError}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBox label="الحالة" value={WO_STATUS_LABELS[wo.status]} />
        <SummaryBox label="الكمية المخططة" value={String(wo.planned_quantity)} />
        <SummaryBox label="الكمية الفعلية" value={String(wo.actual_quantity)} highlight={Number(wo.actual_quantity) > 0} />
        <SummaryBox label="الأولوية" value={PRIORITY_LABELS[wo.priority]} />
      </div>

      {/* Quantity distinction banner */}
      <div className="mb-4 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-600">
          الكمية المخططة هي الكمية المستهدفة للإنتاج، بينما الكمية الفعلية هي ما تم إنتاجه فعلياً.
          في هذه المرحلة لا يتم توليد حركات إنتاج فعلية — تبقى الكمية الفعلية صفر حتى يتم تنفيذ الإنتاج.
        </p>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {canRelease && <Button size="sm" onClick={() => setShowReleaseConfirm(true)}><Zap className="w-3.5 h-3.5" /> إطلاق أمر العمل</Button>}
        {canEditDates && <Button size="sm" variant="secondary" onClick={() => setShowEditDates(true)}><CalendarDays className="w-3.5 h-3.5" /> تعديل المواعيد</Button>}
        {canCancel && <Button size="sm" variant="danger" onClick={() => setShowCancelConfirm(true)}><XCircle className="w-3.5 h-3.5" /> إلغاء الأمر</Button>}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <InfoBox label="إصدار BOM المجمد" value={wo.bom_version_snapshot ?? '—'} mono />
        <InfoBox label="وحدة القياس" value={wo.unit_of_measure ?? '—'} mono />
        <InfoBox label="تاريخ البداية" value={wo.planned_start_date ?? '—'} mono />
        <InfoBox label="تاريخ النهاية" value={wo.planned_finish_date ?? '—'} mono />
      </div>

      {/* Release info */}
      {wo.released_at && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">معلومات الإطلاق</h4>
          <p className="text-sm text-slate-700" dir="ltr">
            تم الإطلاق في: {new Date(wo.released_at).toLocaleString('en-GB')}
          </p>
        </div>
      )}

      {/* Components snapshot */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Layers className="w-4 h-4 text-slate-400" /> مكونات BOM المجمدة
          </h4>
          <p className="text-xs text-slate-400 mt-0.5">
            لقطة من متطلبات المواد وقت الإطلاق. لا تتأثر بتغييرات BOM اللاحقة.
          </p>
        </div>
        {components.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            {wo.status === 'RELEASED' || wo.status === 'IN_PROGRESS' || wo.status === 'COMPLETED'
              ? 'لا توجد مكونات في اللقطة'
              : 'سيتم إنشاء لقطة المكونات عند إطلاق أمر العمل'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الصنف</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الوحدة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">الدور</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">المراجعة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {components.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-slate-700">{c.item_name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400" dir="ltr">{c.item_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{c.required_qty}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{c.unit_of_measure}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden md:table-cell" dir="ltr">{c.component_role ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell">#{c.revision_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showEditDates && wo && (
        <EditDatesModal wo={wo} onClose={() => setShowEditDates(false)} onSaved={() => { setShowEditDates(false); load(); }} />
      )}
      <ConfirmDialog
        open={showReleaseConfirm}
        title="إطلاق أمر العمل"
        message="سيتم إطلاق أمر العمل وتجميد لقطة مكونات BOM. لا يمكن تعديل الموديل أو إصدار BOM بعد الإطلاق."
        confirmLabel="إطلاق"
        onConfirm={handleRelease}
        onCancel={() => setShowReleaseConfirm(false)}
      />
      <ConfirmDialog
        open={showCancelConfirm}
        title="إلغاء أمر العمل"
        message="سيتم إلغاء أمر العمل. يبقى الأمر في السجلات التاريخية لكن لا يمكن استخدامه في عمليات جديدة."
        confirmLabel="إلغاء الأمر" variant="danger"
        onConfirm={handleCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />
    </div>
  );
}

// ============================================================
// Edit Dates Modal
// ============================================================

function EditDatesModal({ wo, onClose, onSaved }: { wo: WorkOrder; onClose: () => void; onSaved: () => void }) {
  const [startDate, setStartDate] = useState(wo.planned_start_date ?? '');
  const [finishDate, setFinishDate] = useState(wo.planned_finish_date ?? '');
  const [priority, setPriority] = useState<Priority>(wo.priority);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateWorkOrderDates(wo.id, {
        planned_start_date: startDate || undefined,
        planned_finish_date: finishDate || undefined,
        priority,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تعديل المواعيد والأولوية" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ البداية">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="تاريخ النهاية">
            <input type="date" value={finishDate} onChange={e => setFinishDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="الأولوية">
          <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
          </select>
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarDays className="w-4 h-4" />}
            حفظ
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold ${highlight ? 'text-emerald-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function InfoBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}

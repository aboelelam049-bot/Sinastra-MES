import { useState, useEffect, useCallback } from 'react';
import {
  CalendarRange, Plus, Loader2, AlertCircle, RefreshCw,
  Search, ArrowRight, CheckCircle2, Send, XCircle, Trash2,
  ClipboardList,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchPlans, fetchPlan, createPlan, updatePlan,
  submitPlan, approvePlan, cancelPlan,
  fetchPlanLines, addPlanLine, deletePlanLine,
} from '@/lib/planningService';
import {
  fetchDepartments, fetchWorkCenters,
} from '@/lib/machineService';
import {
  fetchProductModels, fetchBOMHeaders,
} from '@/lib/masterDataService';
import {
  PLAN_STATUS_LABELS, PLAN_STATUS_COLORS, PLAN_TYPE_LABELS,
  PRIORITY_LABELS, PRIORITY_COLORS,
} from '@/lib/statusLabels';
import type {
  ProductionPlan, ProductionPlanLine, PlanType, PlanStatus,
  ProductModel, Department, BOMHeader, Priority,
} from '@/types';

type PlanWithDept = ProductionPlan & { department: Department | null };
type LineWithModel = ProductionPlanLine & { model: ProductModel; bom: BOMHeader | null };

const PLAN_TYPES: PlanType[] = ['DAILY', 'WEEKLY', 'MONTHLY'];
const PRIORITIES: Priority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function ProductionPlanningPage() {
  const [plans, setPlans] = useState<PlanWithDept[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPlans(
        search.trim() || undefined,
        statusFilter || undefined,
        typeFilter || undefined,
      );
      setPlans(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, statusFilter, typeFilter]);

  const pageCount = Math.max(1, Math.ceil(plans.length / ITEM_PAGE_SIZE));
  const pageRows = plans.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  if (detailId) {
    return <PlanDetail planId={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="تخطيط الإنتاج"
        subtitle="Production Planning — خطط الإنتاج اليومية والأسبوعية والشهرية"
        action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة جديدة</Button>}
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
            placeholder="بحث برقم الخطة…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الحالات</option>
          {Object.keys(PLAN_STATUS_LABELS).map(s => <option key={s} value={s}>{PLAN_STATUS_LABELS[s as PlanStatus]}</option>)}
        </select>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الأنواع</option>
          {PLAN_TYPES.map(t => <option key={t} value={t}>{PLAN_TYPE_LABELS[t]}</option>)}
        </select>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : pageRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<CalendarRange className="w-7 h-7" />} title="لا توجد خطط إنتاج"
            description="أنشئ أول خطة إنتاج (يومية، أسبوعية، أو شهرية) وأضف إليها موديلات المنتجات."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة جديدة</Button>} />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">رقم الخطة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">النوع</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">تاريخ الخطة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">القسم</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">المدة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(p => (
                  <tr key={p.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailId(p.id)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{p.plan_number}</td>
                    <td className="px-4 py-3"><Badge color="bg-slate-100 text-slate-600 border-slate-200">{PLAN_TYPE_LABELS[p.plan_type]}</Badge></td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{p.plan_date}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{p.department?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">{p.planned_start_date} → {p.planned_end_date}</td>
                    <td className="px-4 py-3"><Badge color={PLAN_STATUS_COLORS[p.status]} variant="dot">{PLAN_STATUS_LABELS[p.status]}</Badge></td>
                    <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={plans.length} onChange={setPage} />
        </>
      )}

      {showCreate && <CreatePlanModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setDetailId(id); }} />}
    </div>
  );
}

// ============================================================
// Create Plan Modal
// ============================================================

function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [planType, setPlanType] = useState<PlanType>('DAILY');
  const [planDate, setPlanDate] = useState(new Date().toISOString().slice(0, 10));
  const [deptId, setDeptId] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setDepartments(await fetchDepartments()); } catch { /* ignore */ }
    })();
  }, []);

  function handleTypeChange(type: PlanType) {
    setPlanType(type);
    const today = new Date();
    const d = today.toISOString().slice(0, 10);
    setPlanDate(d);
    setStartDate(d);
    if (type === 'DAILY') {
      setEndDate(d);
    } else if (type === 'WEEKLY') {
      const end = new Date(today); end.setDate(end.getDate() + 6);
      setEndDate(end.toISOString().slice(0, 10));
    } else {
      const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setEndDate(end.toISOString().slice(0, 10));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const plan = await createPlan({
        plan_type: planType,
        plan_date: planDate,
        department_id: deptId || undefined,
        planned_start_date: startDate,
        planned_end_date: endDate,
        notes: notes || undefined,
      });
      onCreated(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء خطة إنتاج جديدة" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="نوع الخطة" hint="Plan Type">
          <div className="flex gap-2">
            {PLAN_TYPES.map(t => (
              <button key={t} type="button" onClick={() => handleTypeChange(t)}
                className={`px-4 py-2 text-sm rounded-lg border transition-colors ${
                  planType === t ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}>{PLAN_TYPE_LABELS[t]}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ الخطة" hint="Plan Date">
            <input type="date" value={planDate} onChange={e => setPlanDate(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="القسم" hint="اختياري">
            <select value={deptId} onChange={e => setDeptId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— بدون —</option>
              {departments.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ البداية">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="تاريخ النهاية">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="ملاحظات">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>
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
// Plan Detail
// ============================================================

function PlanDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<PlanWithDept | null>(null);
  const [lines, setLines] = useState<LineWithModel[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [boms, setBoms] = useState<BOMHeader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);
  const [removeLineTarget, setRemoveLineTarget] = useState<LineWithModel | null>(null);
  const [actionTarget, setActionTarget] = useState<{ action: 'submit' | 'approve' | 'cancel' } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, lns, mdls] = await Promise.all([
        fetchPlan(planId),
        fetchPlanLines(planId),
        fetchProductModels(),
      ]);
      setPlan(p);
      setLines(lns);
      setModels(mdls);
      // Fetch BOMs for all active models
      const allBoms: BOMHeader[] = [];
      for (const m of mdls.filter(x => x.is_active)) {
        try {
          const modelBoms = await fetchBOMHeaders(m.id);
          allBoms.push(...modelBoms);
        } catch { /* ignore */ }
      }
      setBoms(allBoms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  async function handleAction() {
    if (!actionTarget || !plan) return;
    try {
      if (actionTarget.action === 'submit') await submitPlan(plan.id);
      else if (actionTarget.action === 'approve') await approvePlan(plan.id);
      else if (actionTarget.action === 'cancel') await cancelPlan(plan.id);
      setActionTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  async function handleRemoveLine() {
    if (!removeLineTarget) return;
    try {
      await deletePlanLine(removeLineTarget.id);
      setRemoveLineTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  }
  if (!plan) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ArrowRight className="w-5 h-5 rotate-180" /></button>
          <span className="text-sm text-slate-500">الخطة غير موجودة</span>
        </div>
      </div>
    );
  }

  const canEdit = plan.status === 'DRAFT';
  const canSubmit = plan.status === 'DRAFT';
  const canApprove = plan.status === 'SUBMITTED';
  const canCancel = plan.status !== 'COMPLETED' && plan.status !== 'CANCELLED';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"><ArrowRight className="w-5 h-5 rotate-180" /></button>
        <PageHeader title={plan.plan_number} subtitle={`${PLAN_TYPE_LABELS[plan.plan_type]} · ${plan.plan_date}`} />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBox label="الحالة" value={PLAN_STATUS_LABELS[plan.status]} />
        <SummaryBox label="القسم" value={plan.department?.name ?? '—'} />
        <SummaryBox label="المدة" value={`${plan.planned_start_date} → ${plan.planned_end_date}`} mono />
        <SummaryBox label="عدد البنود" value={String(lines.length)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {canSubmit && <Button size="sm" onClick={() => setActionTarget({ action: 'submit' })}><Send className="w-3.5 h-3.5" /> إرسال للمراجعة</Button>}
        {canApprove && <Button size="sm" onClick={() => setActionTarget({ action: 'approve' })}><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد الخطة</Button>}
        {canCancel && <Button size="sm" variant="danger" onClick={() => setActionTarget({ action: 'cancel' })}><XCircle className="w-3.5 h-3.5" /> إلغاء الخطة</Button>}
        {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowAddLine(true)}><Plus className="w-3.5 h-3.5" /> إضافة بند</Button>}
      </div>

      {plan.notes && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">ملاحظات</h4>
          <p className="text-sm text-slate-700">{plan.notes}</p>
        </div>
      )}

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-400" /> بنود الخطة
          </h4>
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            {canEdit ? 'لا توجد بنود. أضف موديل منتج للبدء.' : 'لا توجد بنود في هذه الخطة.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">إصدار BOM</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">الأولوية</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">تاريخ الإنجاز</th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-slate-700">{l.model?.name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400" dir="ltr">{l.model?.model_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{l.bom?.version ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{l.planned_quantity} <span className="text-xs text-slate-400">{l.unit_of_measure}</span></td>
                  <td className="px-4 py-2.5 hidden md:table-cell"><Badge color={PRIORITY_COLORS[l.priority]}>{PRIORITY_LABELS[l.priority]}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">{l.required_completion_date ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => setRemoveLineTarget(l)} className="p-1 rounded text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddLine && (
        <AddLineModal
          planId={plan.id}
          models={models.filter(m => m.is_active)}
          boms={boms.filter(b => b.status === 'ACTIVE')}
          onClose={() => setShowAddLine(false)}
          onAdded={() => { setShowAddLine(false); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!removeLineTarget}
        title="حذف البند"
        message={`سيتم حذف بند «${removeLineTarget?.model?.name ?? ''}» من الخطة.`}
        confirmLabel="حذف" variant="danger"
        onConfirm={handleRemoveLine}
        onCancel={() => setRemoveLineTarget(null)}
      />
      <ConfirmDialog
        open={!!actionTarget}
        title={
          actionTarget?.action === 'submit' ? 'إرسال الخطة للمراجعة' :
          actionTarget?.action === 'approve' ? 'اعتماد الخطة' : 'إلغاء الخطة'
        }
        message={
          actionTarget?.action === 'submit' ? 'سيتم إرسال الخطة للمراجعة من قبل مدير الإنتاج. لن يمكن تعديل البنود بعد الإرسال.' :
          actionTarget?.action === 'approve' ? 'سيتم اعتماد الخطة. يمكن بعد ذلك إنشاء أوامر عمل من البنود المعتمدة.' :
          'سيتم إلغاء الخطة. لا يمكن التراجع عن هذا الإجراء.'
        }
        confirmLabel={
          actionTarget?.action === 'submit' ? 'إرسال' :
          actionTarget?.action === 'approve' ? 'اعتماد' : 'إلغاء الخطة'
        }
        variant={actionTarget?.action === 'cancel' ? 'danger' : 'default'}
        onConfirm={handleAction}
        onCancel={() => setActionTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Add Line Modal
// ============================================================

function AddLineModal({ planId, models, boms, onClose, onAdded }: {
  planId: string;
  models: ProductModel[];
  boms: BOMHeader[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [modelId, setModelId] = useState('');
  const [bomId, setBomId] = useState('');
  const [qty, setQty] = useState('');
  const [uom, setUom] = useState('PCS');
  const [completionDate, setCompletionDate] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const modelBoms = boms.filter(b => b.product_model_id === modelId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addPlanLine({
        production_plan_id: planId,
        product_model_id: modelId,
        bom_header_id: bomId || undefined,
        planned_quantity: parseFloat(qty),
        unit_of_measure: uom,
        required_completion_date: completionDate || undefined,
        priority,
        notes: notes || undefined,
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة بند للخطة" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="موديل المنتج">
          <select value={modelId} onChange={e => { setModelId(e.target.value); setBomId(''); }} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر موديل</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.model_code})</option>)}
          </select>
        </Field>
        <Field label="إصدار BOM المعتمد" hint="اختياري — سيتم استخدام الإصدار النشط تلقائياً إذا لم تختر">
          <select value={bomId} onChange={e => setBomId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">تلقائي (الإصدار النشط)</option>
            {modelBoms.map(b => <option key={b.id} value={b.id}>{b.version}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية المخططة">
            <input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="وحدة القياس">
            <input value={uom} onChange={e => setUom(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ الإنجاز المطلوب" hint="اختياري">
            <input type="date" value={completionDate} onChange={e => setCompletionDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="الأولوية">
            <select value={priority} onChange={e => setPriority(e.target.value as Priority)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              {PRIORITIES.map(p => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
            </select>
          </Field>
        </div>
        <Field label="ملاحظات">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !modelId || !qty}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}

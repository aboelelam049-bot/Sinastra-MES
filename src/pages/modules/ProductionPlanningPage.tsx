import { useState, useEffect, useCallback } from 'react';
import {
  CalendarRange, Plus, Loader2, AlertCircle, RefreshCw,
  Search, ArrowRight, ArrowLeft, CheckCircle2, Copy,
  Trash2, ClipboardList, Layers,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from './ProductFamiliesPage';
import {
  fetchMasterPlans, fetchMasterPlanItems, createMasterPlan, approveMasterPlan,
  addMasterPlanItem, deleteMasterPlanItem, updateMasterPlanItem,
  fetchMonthlyPlans, fetchMonthlyPlanItems, createMonthlyPlan, approveMonthlyPlan,
  copyMasterPlanItemsToMonthly, updateMonthlyPlanItem, deleteMonthlyPlanItem, addMonthlyPlanItem,
  generateWorkOrderForMonthlyItem,
} from '@/lib/mesService';
import { fetchProductModels } from '@/lib/masterDataService';
import {
  MASTER_PLAN_STATUS_LABELS, MASTER_PLAN_STATUS_COLORS,
  MONTHLY_PLAN_STATUS_LABELS, MONTHLY_PLAN_STATUS_COLORS,
  WO_STATUS_LABELS, WO_STATUS_COLORS,
  QUALITY_GATE_LABELS, QUALITY_GATE_COLORS,
} from '@/lib/statusLabels';
import type {
  MasterPlan, MasterPlanItem, MonthlyPlan, MonthlyPlanItem,
  ProductModel, WorkOrder,
} from '@/types';

type MasterItemWithModel = MasterPlanItem & { model: ProductModel };
type MonthlyItemWithModel = MonthlyPlanItem & {
  model: ProductModel;
  work_order: Pick<WorkOrder, 'id' | 'wo_number' | 'status' | 'quality_status' | 'warehouse_transferred' | 'planned_quantity' | 'actual_quantity'> | null;
};

export function ProductionPlanningPage() {
  const [tab, setTab] = useState<'master' | 'monthly'>('master');

  return (
    <div>
      <PageHeader
        title="تخطيط الإنتاج"
        subtitle="الخطة ماستر → الخطة الشهرية → أوامر الشغل التلقائية"
      />
      <div className="flex gap-2 mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-1 w-fit">
        <button
          onClick={() => setTab('master')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            tab === 'master' ? 'bg-amber-50 border border-amber-300 text-amber-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          الخطة ماستر
        </button>
        <button
          onClick={() => setTab('monthly')}
          className={`px-4 py-2 text-sm rounded-lg transition-colors ${
            tab === 'monthly' ? 'bg-amber-50 border border-amber-300 text-amber-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          الخطة الشهرية
        </button>
      </div>
      {tab === 'master' ? <MasterPlanTab /> : <MonthlyPlanTab />}
    </div>
  );
}

// ============================================================
// Master Plan Tab
// ============================================================

function MasterPlanTab() {
  const [plans, setPlans] = useState<MasterPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await fetchMasterPlans());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (detailId) {
    return <MasterPlanDetail planId={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="mb-4">
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة ماستر جديدة</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<Layers className="w-7 h-7" />} title="لا توجد خطط ماستر"
            description="أنشئ خطة ماستر وأضف إليها الموديلات بالترتيب. عند اعتمادها يمكن إنشاء خطط شهرية منها."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة ماستر جديدة</Button>} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">رمز الخطة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">تاريخ الإنشاء</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailId(p.id)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{p.plan_code}</td>
                  <td className="px-4 py-3 text-slate-700">{p.name}</td>
                  <td className="px-4 py-3"><Badge color={MASTER_PLAN_STATUS_COLORS[p.status]} variant="dot">{MASTER_PLAN_STATUS_LABELS[p.status]}</Badge></td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">{new Date(p.created_at).toLocaleDateString('ar-EG')}</td>
                  <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateMasterPlanModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setDetailId(id); }} />}
    </div>
  );
}

function CreateMasterPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const plan = await createMasterPlan(name.trim(), description.trim() || undefined);
      onCreated(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="خطة ماستر جديدة" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="اسم الخطة">
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="مثال: خطة ماستر - الربع الأول" />
        </Field>
        <Field label="وصف" hint="اختياري">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function MasterPlanDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<MasterPlan | null>(null);
  const [items, setItems] = useState<MasterItemWithModel[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [approveTarget, setApproveTarget] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MasterItemWithModel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allPlans, itemsData, modelsData] = await Promise.all([
        fetchMasterPlans(),
        fetchMasterPlanItems(planId),
        fetchProductModels(),
      ]);
      setPlan(allPlans.find(p => p.id === planId) ?? null);
      setItems(itemsData);
      setModels(modelsData.filter(m => m.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;

  const canEdit = plan?.status === 'DRAFT';
  const canApprove = plan?.status === 'DRAFT';

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> رجوع
      </button>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {plan && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{plan.name}</h2>
              <p className="text-sm text-slate-500 font-mono" dir="ltr">{plan.plan_code}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={MASTER_PLAN_STATUS_COLORS[plan.status]} variant="dot">{MASTER_PLAN_STATUS_LABELS[plan.status]}</Badge>
              {canApprove && <Button size="sm" onClick={() => setApproveTarget(true)}><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد</Button>}
            </div>
          </div>
          {plan.description && <p className="text-sm text-slate-600 mt-2">{plan.description}</p>}
          <div className="text-sm text-slate-500 mt-2">عدد الموديلات: {items.length}</div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-slate-400" /> موديلات الخطة</h3>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" /> إضافة موديل</Button>}
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {canEdit ? 'لا توجد موديلات. أضف موديل للبدء.' : 'لا توجد موديلات في هذه الخطة.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-12">#</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية المستهدفة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">ملاحظات</th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.sequence_order}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-slate-700">{item.model?.name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400" dir="ltr">{item.model?.model_code}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <input type="number" min="0" value={item.target_quantity}
                        onChange={async (e) => { await updateMasterPlanItem(item.id, { target_quantity: Number(e.target.value) }); load(); }}
                        className="w-24 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    ) : (
                      <span className="font-medium text-slate-700" dir="ltr">{item.target_quantity} {item.unit_of_measure}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden sm:table-cell">{item.notes ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => setRemoveTarget(item)} className="p-1 rounded text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddMasterItemModal planId={planId} models={models} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />}
      <ConfirmDialog open={approveTarget} title="اعتماد الخطة ماستر"
        message="بعد الاعتماد يمكن إنشاء خطط شهرية من هذه الخطة ولن يمكن تعديل الموديلات."
        confirmLabel="اعتماد" onConfirm={async () => { try { await approveMasterPlan(planId); setApproveTarget(false); load(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setApproveTarget(false); } }}
        onCancel={() => setApproveTarget(false)} />
      <ConfirmDialog open={!!removeTarget} title="حذف الموديل" message={`حذف «${removeTarget?.model?.name ?? ''}» من الخطة؟`}
        confirmLabel="حذف" variant="danger" onConfirm={async () => { try { await deleteMasterPlanItem(removeTarget!.id); setRemoveTarget(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setRemoveTarget(null); } }}
        onCancel={() => setRemoveTarget(null)} />
    </div>
  );
}

function AddMasterItemModal({ planId, models, onClose, onAdded }: {
  planId: string; models: ProductModel[]; onClose: () => void; onAdded: () => void;
}) {
  const [modelId, setModelId] = useState('');
  const [qty, setQty] = useState('100');
  const [seq, setSeq] = useState('1');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addMasterPlanItem({
        master_plan_id: planId,
        product_model_id: modelId,
        sequence_order: Number(seq),
        target_quantity: Number(qty),
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
    <Modal open title="إضافة موديل للخطة ماستر" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="الموديل">
          <select value={modelId} onChange={e => setModelId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر موديل</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.model_code})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الترتيب">
            <input type="number" min="1" value={seq} onChange={e => setSeq(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="الكمية المستهدفة">
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="ملاحظات" hint="اختياري">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !modelId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Monthly Plan Tab
// ============================================================

function MonthlyPlanTab() {
  const [plans, setPlans] = useState<MonthlyPlan[]>([]);
  const [masterPlans, setMasterPlans] = useState<MasterPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [mps, mps2] = await Promise.all([fetchMonthlyPlans(), fetchMasterPlans()]);
      setPlans(mps);
      setMasterPlans(mps2.filter(p => p.status === 'APPROVED'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (detailId) {
    return <MonthlyPlanDetail planId={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <div>
      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="mb-4">
        <Button onClick={() => setShowCreate(true)} disabled={masterPlans.length === 0}>
          <Plus className="w-4 h-4" /> خطة شهرية جديدة
        </Button>
        {masterPlans.length === 0 && (
          <span className="text-sm text-slate-400 mr-3">يجب اعتماد خطة ماستر أولاً</span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<CalendarRange className="w-7 h-7" />} title="لا توجد خطط شهرية"
            description="أنشئ خطة شهرية من خطة ماستر معتمدة. بمجرد اعتمادها تنشأ أوامر الشغل تلقائياً." />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">رمز الخطة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الشهر</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {plans.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailId(p.id)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{p.plan_code}</td>
                  <td className="px-4 py-3 text-slate-700">{p.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">{p.plan_month}</td>
                  <td className="px-4 py-3"><Badge color={MONTHLY_PLAN_STATUS_COLORS[p.status]} variant="dot">{MONTHLY_PLAN_STATUS_LABELS[p.status]}</Badge></td>
                  <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateMonthlyPlanModal masterPlans={masterPlans} onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setDetailId(id); }} />}
    </div>
  );
}

function CreateMonthlyPlanModal({ masterPlans, onClose, onCreated }: {
  masterPlans: MasterPlan[]; onClose: () => void; onCreated: (id: string) => void;
}) {
  const [masterPlanId, setMasterPlanId] = useState('');
  const [name, setName] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7) + '-01');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const plan = await createMonthlyPlan(masterPlanId, name.trim(), month);
      await copyMasterPlanItemsToMonthly(masterPlanId, plan.id);
      onCreated(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="خطة شهرية جديدة" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="الخطة ماستر المعتمدة">
          <select value={masterPlanId} onChange={e => setMasterPlanId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر خطة ماستر</option>
            {masterPlans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.plan_code})</option>)}
          </select>
        </Field>
        <Field label="اسم الخطة الشهرية">
          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="مثال: خطة شهر نوفمبر" />
        </Field>
        <Field label="الشهر">
          <input type="date" value={month} onChange={e => setMonth(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
          سيتم نسخ كل موديلات الخطة ماستر تلقائياً عند الإنشاء.
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !masterPlanId || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إنشاء
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function MonthlyPlanDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<MonthlyPlan | null>(null);
  const [items, setItems] = useState<MonthlyItemWithModel[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState(false);
  const [genWoTarget, setGenWoTarget] = useState<MonthlyItemWithModel | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MonthlyItemWithModel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allPlans, itemsData, modelsData] = await Promise.all([
        fetchMonthlyPlans(), fetchMonthlyPlanItems(planId), fetchProductModels(),
      ]);
      setPlan(allPlans.find(p => p.id === planId) ?? null);
      setItems(itemsData);
      setModels(modelsData.filter(m => m.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;

  const canEdit = plan?.status === 'DRAFT';
  const canApprove = plan?.status === 'DRAFT';

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> رجوع
      </button>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {plan && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-800">{plan.name}</h2>
              <p className="text-sm text-slate-500 font-mono" dir="ltr">{plan.plan_code} · {plan.plan_month}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge color={MONTHLY_PLAN_STATUS_COLORS[plan.status]} variant="dot">{MONTHLY_PLAN_STATUS_LABELS[plan.status]}</Badge>
              {canApprove && <Button size="sm" onClick={() => setApproveTarget(true)}><CheckCircle2 className="w-3.5 h-3.5" /> اعتماد وتوليد أوامر الشغل</Button>}
            </div>
          </div>
          <div className="text-sm text-slate-500 mt-2">عدد الموديلات: {items.length}</div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-slate-400" /> موديلات الخطة الشهرية</h3>
          {canEdit && <Button size="sm" variant="secondary" onClick={() => setShowAdd(true)}><Plus className="w-3.5 h-3.5" /> إضافة موديل</Button>}
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            {canEdit ? 'لا توجد موديلات. أضف موديل للبدء أو أنشئ الخطة من خطة ماستر معتمدة.' : 'لا توجد موديلات في هذه الخطة.'}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 w-12">#</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">البداية المخططة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">النهاية المخططة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">أمر الشغل</th>
                <th className="px-4 py-2.5"></th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {items.map(item => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-500">{item.sequence_order}</td>
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-slate-700">{item.model?.name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400" dir="ltr">{item.model?.model_code}</div>
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <input type="number" min="0" value={item.planned_quantity}
                        onChange={async (e) => { await updateMonthlyPlanItem(item.id, { planned_quantity: Number(e.target.value) }); load(); }}
                        className="w-20 px-2 py-1 text-sm border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    ) : (
                      <span className="font-medium text-slate-700" dir="ltr">{item.planned_quantity}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <input type="date" value={item.planned_start_date ?? ''} onChange={async (e) => { await updateMonthlyPlanItem(item.id, { planned_start_date: e.target.value || null }); load(); }}
                        className="px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    ) : <span className="text-xs text-slate-500" dir="ltr">{item.planned_start_date ?? '—'}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {canEdit ? (
                      <input type="date" value={item.planned_end_date ?? ''} onChange={async (e) => { await updateMonthlyPlanItem(item.id, { planned_end_date: e.target.value || null }); load(); }}
                        className="px-2 py-1 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" />
                    ) : <span className="text-xs text-slate-500" dir="ltr">{item.planned_end_date ?? '—'}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {item.work_order ? (
                      <div className="flex flex-col gap-1">
                        <span className="font-mono text-xs text-slate-700" dir="ltr">{item.work_order.wo_number}</span>
                        <Badge color={WO_STATUS_COLORS[item.work_order.status]}>{WO_STATUS_LABELS[item.work_order.status]}</Badge>
                      </div>
                    ) : plan?.status === 'APPROVED' ? (
                      <Button size="sm" variant="secondary" onClick={() => setGenWoTarget(item)}>
                        <Copy className="w-3.5 h-3.5" /> توليد أمر شغل
                      </Button>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    {item.work_order && (
                      <Badge color={QUALITY_GATE_COLORS[item.work_order.quality_status]} variant="dot">{QUALITY_GATE_LABELS[item.work_order.quality_status]}</Badge>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => setRemoveTarget(item)} className="p-1 rounded text-red-400 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAdd && <AddMonthlyItemModal planId={planId} models={models} existingItems={items} onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load(); }} />}
      <ConfirmDialog open={approveTarget} title="اعتماد الخطة الشهرية"
        message="بعد الاعتماد سيتم توليد أوامر الشغل تلقائياً لكل موديل. لن يمكن تعديل الكميات."
        confirmLabel="اعتماد وتوليد أوامر الشغل" onConfirm={async () => { try { const count = await approveMonthlyPlan(planId); setApproveTarget(false); load(); if (count > 0) setError(`تم توليد ${count} أمر شغل تلقائياً`); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setApproveTarget(false); } }}
        onCancel={() => setApproveTarget(false)} />
      <ConfirmDialog open={!!genWoTarget} title="توليد أمر شغل"
        message={`سيتم إنشاء أمر شغل وأوامر فرعية لكل مراحل التشغيل للموديل «${genWoTarget?.model?.name ?? ''}».`}
        confirmLabel="توليد" onConfirm={async () => { try { await generateWorkOrderForMonthlyItem(genWoTarget!.id); setGenWoTarget(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setGenWoTarget(null); } }}
        onCancel={() => setGenWoTarget(null)} />
      <ConfirmDialog open={!!removeTarget} title="حذف الموديل" message={`حذف «${removeTarget?.model?.name ?? ''}» من الخطة الشهرية؟`}
        confirmLabel="حذف" variant="danger" onConfirm={async () => { try { await deleteMonthlyPlanItem(removeTarget!.id); setRemoveTarget(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setRemoveTarget(null); } }}
        onCancel={() => setRemoveTarget(null)} />
    </div>
  );
}

function AddMonthlyItemModal({ planId, models, existingItems, onClose, onAdded }: {
  planId: string; models: ProductModel[]; existingItems: MonthlyItemWithModel[]; onClose: () => void; onAdded: () => void;
}) {
  const existingModelIds = new Set(existingItems.map(i => i.product_model_id));
  const availableModels = models.filter(m => !existingModelIds.has(m.id));
  const [modelId, setModelId] = useState('');
  const [qty, setQty] = useState('100');
  const [seq, setSeq] = useState(String(existingItems.length + 1));
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await addMonthlyPlanItem({
        monthly_plan_id: planId,
        product_model_id: modelId,
        sequence_order: Number(seq),
        planned_quantity: Number(qty),
        planned_start_date: startDate || null,
        planned_end_date: endDate || null,
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة موديل للخطة الشهرية" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="الموديل">
          <select value={modelId} onChange={e => setModelId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر موديل</option>
            {availableModels.map(m => <option key={m.id} value={m.id}>{m.name} ({m.model_code}){m.kit_type === 'SINGLE' ? ' — سنجل' : m.kit_type === 'DOUBLE' ? ' — دابل' : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الترتيب">
            <input type="number" min="1" value={seq} onChange={e => setSeq(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="الكمية المخططة">
            <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ البداية المخططة" hint="اختياري">
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="تاريخ النهاية المخططة" hint="اختياري">
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        {availableModels.length === 0 && (
          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">كل الموديلات المفعلة مضافة بالفعل في هذه الخطة.</div>
        )}
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !modelId || availableModels.length === 0}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

import { useState, useEffect, useCallback } from 'react';
import {
  CalendarRange, Plus, Loader2, AlertCircle, RefreshCw,
  ArrowRight, CheckCircle2, Trash2, ArrowLeft, ListOrdered,
  ChevronDown, ChevronUp,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  fetchMasterPlans, fetchMasterPlan, createMasterPlan,
  addMasterPlanItem, deleteMasterPlanItem, approveMasterPlan,
  fetchMonthlyPlans, fetchMonthlyPlan, createMonthlyPlanFromMaster,
  approveMonthlyPlan, updateMonthlyPlanItemDates,
} from '@/lib/mesService';
import { fetchProductModels } from '@/lib/masterDataService';
import {
  MASTER_PLAN_STATUS_LABELS, MASTER_PLAN_STATUS_COLORS,
  MONTHLY_PLAN_STATUS_LABELS, MONTHLY_PLAN_STATUS_COLORS,
} from '@/lib/statusLabels';
import type {
  MasterPlan, MasterPlanItem, MonthlyPlan, MonthlyPlanItem,
  ProductModel, MasterPlanStatus,
} from '@/types';

type MasterPlanWithItems = MasterPlan & { items: (MasterPlanItem & { model: ProductModel })[] };
type MonthlyPlanWithItems = MonthlyPlan & {
  items: (MonthlyPlanItem & { model: ProductModel; work_order: { id: string; wo_number: string; status: string } | null })[];
  master: MasterPlan;
};

export function ProductionPlanningPage() {
  const [tab, setTab] = useState<'master' | 'monthly'>('master');

  return (
    <div>
      <PageHeader
        title="الخطة ماستر والشهرية"
        subtitle="Master Plan → Monthly Plan → Auto Work Orders"
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
          الخطط الشهرية
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
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

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
      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة ماستر جديدة</Button>
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<CalendarRange className="w-7 h-7" />} title="لا توجد خطط ماستر"
            description="أنشئ أول خطة ماستر وأضف إليها موديلات المنتجات بالترتيب. ستتغذى منها الخطط الشهرية تلقائيًا."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة ماستر جديدة</Button>} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">كود الخطة</th>
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
      const plan = await createMasterPlan(name, description || undefined);
      onCreated(plan.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء خطة ماستر جديدة" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم الخطة</label>
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الوصف (اختياري)</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
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

function MasterPlanDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<MasterPlanWithItems | null>(null);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<MasterPlanItem | null>(null);
  const [approveTarget, setApproveTarget] = useState<MasterPlan | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [p, mdls] = await Promise.all([fetchMasterPlan(planId), fetchProductModels()]);
      setPlan(p);
      setModels(mdls);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    if (!approveTarget) return;
    try {
      await approveMasterPlan(approveTarget.id);
      setApproveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  if (error) return <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div>;
  if (!plan) return null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> رجوع للقائمة
      </button>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{plan.name}</h2>
            <p className="text-sm text-slate-500 font-mono" dir="ltr">{plan.plan_code}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={MASTER_PLAN_STATUS_COLORS[plan.status]} variant="dot">{MASTER_PLAN_STATUS_LABELS[plan.status]}</Badge>
            {plan.status === 'DRAFT' && (
              <Button onClick={() => setApproveTarget(plan)}><CheckCircle2 className="w-4 h-4" /> اعتماد الخطة</Button>
            )}
          </div>
        </div>
        {plan.description && <p className="text-sm text-slate-600 mt-2">{plan.description}</p>}
      </div>

      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
          <ListOrdered className="w-4 h-4" /> الموديلات بالترتيب ({plan.items.length})
        </h3>
        {plan.status === 'DRAFT' && (
          <Button onClick={() => setShowAddItem(true)}><Plus className="w-4 h-4" /> إضافة موديل</Button>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-right px-4 py-3 font-medium text-slate-600 w-12">الترتيب</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">الموديل</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية المستهدفة</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">ملاحظات</th>
              {plan.status === 'DRAFT' && <th className="px-4 py-3"></th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {plan.items.map((item, idx) => (
              <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{idx + 1}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-slate-700">{item.model.name}</div>
                  <div className="text-xs text-slate-400 font-mono" dir="ltr">{item.model.model_code}</div>
                </td>
                <td className="px-4 py-3 font-medium text-slate-700" dir="ltr">{Number(item.target_quantity)} {item.unit_of_measure}</td>
                <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell">{item.notes ?? '—'}</td>
                {plan.status === 'DRAFT' && (
                  <td className="px-4 py-3">
                    <button onClick={(e) => { e.stopPropagation(); setRemoveTarget(item); }}
                      className="text-red-500 hover:text-red-700 p-1"><Trash2 className="w-4 h-4" /></button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {plan.items.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">لا توجد موديلات بعد. أضف موديلات بالترتيب الذي تريد تنفيذها.</div>
        )}
      </div>

      {showAddItem && (
        <AddItemModal
          models={models.filter(m => m.is_active)}
          currentCount={plan.items.length}
          onClose={() => setShowAddItem(false)}
          onAdded={() => { setShowAddItem(false); load(); }}
          masterPlanId={plan.id}
        />
      )}
      {removeTarget && (
        <ConfirmDialog
          open
          title="حذف الموديل"
          message={`هل تريد حذف "${removeTarget.product_model_id}" من الخطة؟`}
          confirmLabel="حذف"
          onConfirm={async () => {
            try { await deleteMasterPlanItem(removeTarget.id); setRemoveTarget(null); load(); }
            catch (err) { setError(err instanceof Error ? err.message : 'حدث خطأ'); }
          }}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
      {approveTarget && (
        <ConfirmDialog
          open
          title="اعتماد الخطة ماستر"
          message="بعد الاعتماد لن تتمكن من تعديل الموديلات. يمكن إنشاء خطط شهرية منها."
          confirmLabel="اعتماد"
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
        />
      )}
    </div>
  );
}

function AddItemModal({ models, currentCount, onClose, onAdded, masterPlanId }: {
  models: ProductModel[];
  currentCount: number;
  onClose: () => void;
  onAdded: () => void;
  masterPlanId: string;
}) {
  const [modelId, setModelId] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!modelId) { setError('اختر موديل'); return; }
    setLoading(true);
    setError(null);
    try {
      await addMasterPlanItem({
        master_plan_id: masterPlanId,
        product_model_id: modelId,
        sequence_order: currentCount + 1,
        target_quantity: Number(quantity),
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
    <Modal open title="إضافة موديل للخطة ماستر" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الموديل</label>
          <select value={modelId} onChange={e => setModelId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">— اختر موديل —</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.model_code})</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الكمية المستهدفة</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ملاحظات (اختياري)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إضافة
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
  const [plans, setPlans] = useState<MonthlyPlanWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlans(await fetchMonthlyPlans());
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
      <div className="flex justify-end mb-3">
        <Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة شهرية جديدة</Button>
      </div>
      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : plans.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<CalendarRange className="w-7 h-7" />} title="لا توجد خطط شهرية"
            description="أنشئ خطة شهرية من خطة ماستر معتمدة. ستتغذى منها تلقائيًا بنفس الترتيب."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> خطة شهرية جديدة</Button>} />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">كود الخطة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الشهر</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">عدد الأصناف</th>
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
                  <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{p.items.length}</td>
                  <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showCreate && <CreateMonthlyPlanModal onClose={() => setShowCreate(false)} onCreated={(id) => { setShowCreate(false); setDetailId(id); }} />}
    </div>
  );
}

function CreateMonthlyPlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [masterPlans, setMasterPlans] = useState<MasterPlan[]>([]);
  const [masterId, setMasterId] = useState('');
  const [planMonth, setPlanMonth] = useState(new Date().toISOString().slice(0, 8) + '01');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const all = await fetchMasterPlans();
        setMasterPlans(all.filter(p => p.status === 'APPROVED'));
      } catch { /* ignore */ }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!masterId) { setError('اختر خطة ماستر معتمدة'); return; }
    setLoading(true);
    setError(null);
    try {
      const id = await createMonthlyPlanFromMaster(masterId, planMonth, name || undefined);
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء خطة شهرية من خطة ماستر" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الخطة ماستر (المعتمدة)</label>
          <select value={masterId} onChange={e => setMasterId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">— اختر —</option>
            {masterPlans.map(p => <option key={p.id} value={p.id}>{p.name} ({p.plan_code})</option>)}
          </select>
          {masterPlans.length === 0 && <p className="text-xs text-amber-600 mt-1">لا توجد خطط ماستر معتمدة. اعتمد خطة ماستر أولًا.</p>}
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">الشهر</label>
          <input type="date" value={planMonth} onChange={e => setPlanMonth(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">اسم الخطة (اختياري)</label>
          <input value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
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

function MonthlyPlanDetail({ planId, onBack }: { planId: string; onBack: () => void }) {
  const [plan, setPlan] = useState<MonthlyPlanWithItems | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<MonthlyPlan | null>(null);
  const [editingItem, setEditingItem] = useState<MonthlyPlanItem | null>(null);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPlan(await fetchMonthlyPlan(planId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [planId]);

  useEffect(() => { load(); }, [load]);

  async function handleApprove() {
    if (!approveTarget) return;
    try {
      await approveMonthlyPlan(approveTarget.id);
      setApproveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  if (error) return <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div>;
  if (!plan) return null;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3">
        <ArrowLeft className="w-4 h-4" /> رجوع للقائمة
      </button>
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{plan.name}</h2>
            <p className="text-sm text-slate-500 font-mono" dir="ltr">{plan.plan_code} — {plan.plan_month}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge color={MONTHLY_PLAN_STATUS_COLORS[plan.status]} variant="dot">{MONTHLY_PLAN_STATUS_LABELS[plan.status]}</Badge>
            {plan.status === 'DRAFT' && (
              <Button onClick={() => setApproveTarget(plan)}><CheckCircle2 className="w-4 h-4" /> اعتماد وإنشاء أوامر الشغل</Button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="text-right px-4 py-3 font-medium text-slate-600 w-12">#</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">الموديل</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">البداية المخططة</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">النهاية المخططة</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">أمر الشغل</th>
              <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {plan.items.map((item, idx) => (
              <>
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{idx + 1}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-700">{item.model.name}</div>
                    <div className="text-xs text-slate-400 font-mono" dir="ltr">{item.model.model_code}</div>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700" dir="ltr">{Number(item.planned_quantity)} {item.unit_of_measure}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">{item.planned_start_date ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">{item.planned_end_date ?? '—'}</td>
                  <td className="px-4 py-3">
                    {item.work_order ? (
                      <span className="font-mono text-xs text-blue-600" dir="ltr">{item.work_order.wo_number}</span>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3"><Badge color="bg-slate-100 text-slate-600 border-slate-200" variant="dot">{item.status}</Badge></td>
                  <td className="px-4 py-3">
                    {plan.status === 'DRAFT' && (
                      <button onClick={(e) => { e.stopPropagation(); setEditingItem(item); }}
                        className="text-amber-600 hover:text-amber-800 text-xs">تحديد المواعيد</button>
                    )}
                  </td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </div>

      {plan.status === 'DRAFT' && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
          <p className="font-medium mb-1">عند الاعتماد:</p>
          <ul className="list-disc list-inside space-y-1 text-amber-700">
            <li>سيتم إنشاء أمر شغل رئيسي لكل صنف بالترتيب المذكور</li>
            <li>سيتم إنشاء أوامر شغل فرعية على كل مرحلة في مسار التشغيل تلقائيًا</li>
            <li>لن تنتقل أي منتجات للمخزن إلا بعد قبول الجودة</li>
          </ul>
        </div>
      )}

      {editingItem && (
        <EditDatesModal item={editingItem} onClose={() => setEditingItem(null)} onSaved={() => { setEditingItem(null); load(); }} />
      )}
      {approveTarget && (
        <ConfirmDialog
          open
          title="اعتماد الخطة الشهرية"
          message="سيتم إنشاء أوامر شغل تلقائيًا لكل الأصناف مع أوامر شغل فرعية على كل مرحلة. لا يمكن التراجع."
          confirmLabel="اعتماد وإنشاء"
          onConfirm={handleApprove}
          onCancel={() => setApproveTarget(null)}
        />
      )}
    </div>
  );
}

function EditDatesModal({ item, onClose, onSaved }: {
  item: MonthlyPlanItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [startDate, setStartDate] = useState(item.planned_start_date ?? '');
  const [endDate, setEndDate] = useState(item.planned_end_date ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await updateMonthlyPlanItemDates(item.id, startDate || null, endDate || null);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تحديد المواعيد المخططة" onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">البداية المخططة</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">النهاية المخططة</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            حفظ
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

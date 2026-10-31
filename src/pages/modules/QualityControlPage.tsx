import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ShieldCheck, Loader2, AlertCircle, RefreshCw, Plus,
  ClipboardCheck, CheckCircle, XCircle, Wrench, Trash2,
  Printer, FileText, Eye, ArrowRight, ChevronLeft,
  Package, AlertTriangle, Award, ListChecks, Bug,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/context/AuthContext';
import type {
  DefectMaster, InspectionLot, InspectionResultRecord,
  QualityDisposition, QualityApproval, QualityCard,
  UserRole,
} from '@/types';
import {
  fetchDefects, createDefect, updateDefect, deleteDefect,
  fetchInspectionLots, fetchInspectionLot, createInspectionLot,
  fetchInspectionResults, recordInspectionResult, addInspectionDefect,
  fetchApprovals, approveInspectionLot,
  fetchDispositions, recordQualityDisposition,
  fetchQualityCards, reprintQualityCard, fetchQualityCardPrints,
  fetchQualityDashboardMetrics, fetchEligibleForInspection,
  type InspectionLotWithRelations, type InspectionResultWithRelations,
  type QualityCardWithRelations, type QualityDashboardMetrics,
} from '@/lib/qualityService';
import type { WorkOrder, ParentBatch, RoutingStage, ProductModel, ItemMaster } from '@/types';
import { fetchWorkOrders } from '@/lib/planningService';
import { fetchRoutingVersions, fetchRoutingStages } from '@/lib/routingService';

// ============================================================
// Status labels & colors
// ============================================================

const LOT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'بانتظار الفحص',
  IN_INSPECTION: 'قيد الفحص',
  INSPECTED: 'تم الفحص',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  CLOSED: 'مغلق',
};

const LOT_STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700 border-amber-200',
  IN_INSPECTION: 'bg-blue-100 text-blue-700 border-blue-200',
  INSPECTED: 'bg-cyan-100 text-cyan-700 border-cyan-200',
  APPROVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REJECTED: 'bg-red-100 text-red-700 border-red-200',
  CLOSED: 'bg-slate-100 text-slate-700 border-slate-200',
};

const DISPOSITION_LABELS: Record<string, string> = {
  ACCEPT: 'قبول',
  REWORK: 'إعادة عمل',
  SCRAP: 'هالك',
  RE_INSPECTION: 'إعادة فحص',
};

const DISPOSITION_COLORS: Record<string, string> = {
  ACCEPT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  REWORK: 'bg-amber-100 text-amber-700 border-amber-200',
  SCRAP: 'bg-red-100 text-red-700 border-red-200',
  RE_INSPECTION: 'bg-blue-100 text-blue-700 border-blue-200',
};

const APPROVER_ROLES: UserRole[] = ['QUALITY', 'PRODUCTION_ENGINEER', 'ADMIN'];

// ============================================================
// Main Page
// ============================================================

type Tab = 'dashboard' | 'queue' | 'defects' | 'cards' | 'reports';

export function QualityControlPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [metrics, setMetrics] = useState<QualityDashboardMetrics | null>(null);
  const [lots, setLots] = useState<InspectionLotWithRelations[]>([]);
  const [cards, setCards] = useState<QualityCardWithRelations[]>([]);
  const [defects, setDefects] = useState<DefectMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLotId, setDetailLotId] = useState<string | null>(null);
  const [showCreateLot, setShowCreateLot] = useState(false);
  const [showDefectModal, setShowDefectModal] = useState(false);
  const { profile } = useAuth();

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, l, c, d] = await Promise.all([
        fetchQualityDashboardMetrics(),
        fetchInspectionLots(),
        fetchQualityCards(),
        fetchDefects(),
      ]);
      setMetrics(m);
      setLots(l);
      setCards(c);
      setDefects(d);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (detailLotId) {
    return <LotDetailPage lotId={detailLotId} onBack={() => { setDetailLotId(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="مراقبة الجودة"
        subtitle="Quality Control — إدارة فحوصات الجودة والاعتماد والبطاقات"
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200 overflow-x-auto">
        <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={ShieldCheck}>
          لوحة الجودة
        </TabBtn>
        <TabBtn active={tab === 'queue'} onClick={() => setTab('queue')} icon={ClipboardCheck}>
          قائمة الفحص
        </TabBtn>
        <TabBtn active={tab === 'defects'} onClick={() => setTab('defects')} icon={Bug}>
          العيوب
        </TabBtn>
        <TabBtn active={tab === 'cards'} onClick={() => setTab('cards')} icon={Award}>
          بطاقات الجودة
        </TabBtn>
        <TabBtn active={tab === 'reports'} onClick={() => setTab('reports')} icon={FileText}>
          التقارير
        </TabBtn>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : tab === 'dashboard' ? (
        <DashboardTab metrics={metrics} lots={lots} onOpenLot={setDetailLotId} onCreateLot={() => setShowCreateLot(true)} />
      ) : tab === 'queue' ? (
        <QueueTab lots={lots} onOpenLot={setDetailLotId} onCreateLot={() => setShowCreateLot(true)} />
      ) : tab === 'defects' ? (
        <DefectsTab defects={defects} onReload={load} />
      ) : tab === 'cards' ? (
        <CardsTab cards={cards} onReload={load} />
      ) : (
        <ReportsTab lots={lots} defects={defects} />
      )}

      {showCreateLot && (
        <CreateLotModal onClose={() => setShowCreateLot(false)} onCreated={() => { setShowCreateLot(false); load(); }} />
      )}
      {showDefectModal && (
        <DefectModal onClose={() => setShowDefectModal(false)} onSaved={() => { setShowDefectModal(false); load(); }} />
      )}
    </div>
  );
}

// ============================================================
// Tab Button
// ============================================================

function TabBtn({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? 'border-amber-600 text-amber-700'
          : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
      }`}
    >
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

// ============================================================
// Stat Box
// ============================================================

function StatBox({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center ${color}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-lg font-semibold text-slate-800">{value}</p>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Dashboard Tab
// ============================================================

function DashboardTab({ metrics, lots, onOpenLot, onCreateLot }: {
  metrics: QualityDashboardMetrics | null;
  lots: InspectionLotWithRelations[];
  onOpenLot: (id: string) => void;
  onCreateLot: () => void;
}) {
  const pendingLots = lots.filter(l => l.status === 'PENDING' || l.status === 'IN_INSPECTION');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateLot}><Plus className="w-4 h-4" /> إنشاء لوط فحص</Button>
      </div>

      {/* Dashboard indicators */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox icon={ClipboardCheck} label="فحوصات معلقة" value={metrics?.pendingInspections ?? 0} color="text-amber-600" />
        <StatBox icon={CheckCircle} label="الكمية المقبولة" value={metrics?.totalAccepted ?? 0} color="text-emerald-600" />
        <StatBox icon={XCircle} label="الكمية المرفوضة" value={metrics?.totalRejected ?? 0} color="text-red-600" />
        <StatBox icon={Wrench} label="كمية إعادة العمل" value={metrics?.reworkQuantity ?? 0} color="text-amber-600" />
        <StatBox icon={Trash2} label="الهالك النهائي" value={metrics?.finalScrapQuantity ?? 0} color="text-red-600" />
        <StatBox icon={Package} label="إجمالي الألواط" value={metrics?.totalLots ?? 0} color="text-slate-600" />
        <StatBox icon={Award} label="ألواط معتمدة" value={metrics?.approvedLots ?? 0} color="text-emerald-600" />
        <StatBox icon={AlertTriangle} label="مرفوض (غير هالك)" value={(metrics?.totalRejected ?? 0) - (metrics?.finalScrapQuantity ?? 0)} color="text-orange-600" />
      </div>

      {/* Pending inspection queue */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">قائمة الفحص المعلق</h4>
        </div>
        {pendingLots.length === 0 ? (
          <EmptyState
            icon={<ClipboardCheck className="w-7 h-7" />}
            title="لا توجد فحوصات معلقة"
            description="الكميات المنتجة من المرحلة النهائية ستظهر هنا للفحص"
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">رقم اللوط</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">أمر العمل</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الدفعة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">المرحلة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pendingLots.map(lot => (
                  <tr key={lot.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => onOpenLot(lot.id)}>
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700" dir="ltr">{lot.lot_number}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700" dir="ltr">{lot.work_order?.wo_number ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700" dir="ltr">{lot.parent_batch?.batch_number ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{lot.final_stage?.stage_name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700">{lot.quantity_submitted} {lot.unit_of_measure}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={LOT_STATUS_COLORS[lot.status]} variant="dot">{LOT_STATUS_LABELS[lot.status]}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Queue Tab
// ============================================================

function QueueTab({ lots, onOpenLot, onCreateLot }: {
  lots: InspectionLotWithRelations[];
  onOpenLot: (id: string) => void;
  onCreateLot: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onCreateLot}><Plus className="w-4 h-4" /> إنشاء لوط فحص</Button>
      </div>

      {lots.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<ClipboardCheck className="w-7 h-7" />}
            title="لا توجد ألواط فحص"
            description="أنشئ لوط فحص من الكميات المنتجة في المرحلة النهائية"
          />
        </div>
      ) : (
        <div className="space-y-2">
          {lots.map(lot => (
            <div
              key={lot.id}
              className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
              onClick={() => onOpenLot(lot.id)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-medium text-slate-700" dir="ltr">{lot.lot_number}</span>
                  <span className="text-xs text-slate-400">—</span>
                  <span className="text-sm text-slate-600" dir="ltr">{lot.work_order?.wo_number ?? '—'}</span>
                </div>
                <Badge color={LOT_STATUS_COLORS[lot.status]} variant="dot">{LOT_STATUS_LABELS[lot.status]}</Badge>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div><span className="text-slate-400">الدفعة:</span> <span className="text-slate-700" dir="ltr">{lot.parent_batch?.batch_number ?? '—'}</span></div>
                <div><span className="text-slate-400">المرحلة:</span> <span className="text-slate-700">{lot.final_stage?.stage_name ?? '—'}</span></div>
                <div><span className="text-slate-400">الكمية:</span> <span className="text-slate-700">{lot.quantity_submitted} {lot.unit_of_measure}</span></div>
                <div><span className="text-slate-400">الموديل:</span> <span className="text-slate-700">{lot.product_model?.name ?? '—'}</span></div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Defects Tab
// ============================================================

function DefectsTab({ defects, onReload }: {
  defects: DefectMaster[];
  onReload: () => void;
}) {
  const [editing, setEditing] = useState<DefectMaster | null>(null);
  const [showModal, setShowModal] = useState(false);
  const { profile } = useAuth();
  const canManage = profile?.role === 'ADMIN' || profile?.role === 'QUALITY';

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex gap-2">
          <Button onClick={() => { setEditing(null); setShowModal(true); }}>
            <Plus className="w-4 h-4" /> إضافة عيب
          </Button>
        </div>
      )}

      {defects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<Bug className="w-7 h-7" />} title="لا توجد عيوب" description="أضف عيوب قابلة للتهيئة لتسجيلها أثناء الفحص" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكود</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الاسم</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الفئة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الوصف</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
                  {canManage && <th className="text-right px-4 py-2.5 font-medium text-slate-600">إجراءات</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {defects.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700" dir="ltr">{d.defect_code}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700">{d.defect_name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{d.defect_category}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-500">{d.description ?? '—'}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={d.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                        {d.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    {canManage && (
                      <td className="px-4 py-2.5">
                        <div className="flex gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(d); setShowModal(true); }}>
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={async () => { await deleteDefect(d.id); onReload(); }}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showModal && (
        <DefectModal defect={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); onReload(); }} />
      )}
    </div>
  );
}

function DefectModal({ defect, onClose, onSaved }: {
  defect: DefectMaster | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(defect?.defect_code ?? '');
  const [name, setName] = useState(defect?.defect_name ?? '');
  const [category, setCategory] = useState(defect?.defect_category ?? 'OTHER');
  const [description, setDescription] = useState(defect?.description ?? '');
  const [active, setActive] = useState(defect?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      if (defect) {
        await updateDefect(defect.id, { defect_name: name, defect_category: category, description, is_active: active });
      } else {
        await createDefect({ defect_code: code, defect_name: name, defect_category: category, description });
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title={defect ? 'تعديل عيب' : 'إضافة عيب'} onClose={onClose}>
      <div className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}
        <Field label="كود العيب">
          <input type="text" value={code} disabled={!!defect} onChange={e => setCode(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none disabled:bg-slate-50" dir="ltr" />
        </Field>
        <Field label="اسم العيب">
          <input type="text" value={name} onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>
        <Field label="الفئة">
          <input type="text" value={category} onChange={e => setCategory(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>
        <Field label="الوصف">
          <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>
        {defect && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="rounded" />
            نشط
          </label>
        )}
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            حفظ
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Cards Tab
// ============================================================

function CardsTab({ cards, onReload }: {
  cards: QualityCardWithRelations[];
  onReload: () => void;
}) {
  const [printCard, setPrintCard] = useState<QualityCardWithRelations | null>(null);
  const [printHistory, setPrintHistory] = useState<{ id: string; printed_at: string; printed_by: string | null }[]>([]);

  async function handlePrint(card: QualityCardWithRelations) {
    try {
      await reprintQualityCard(card.id);
      onReload();
      setPrintCard(card);
      // Fetch print history
      const history = await fetchQualityCardPrints(card.id);
      setPrintHistory(history.map(h => ({ id: h.id, printed_at: h.printed_at, printed_by: h.printed_by })));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'حدث خطأ');
    }
  }

  return (
    <div className="space-y-4">
      {cards.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<Award className="w-7 h-7" />} title="لا توجد بطاقات جودة" description="يتم إنشاء بطاقات الجودة تلقائياً عند اعتماد لوط الفحص" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {cards.map(card => (
            <div key={card.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Award className="w-5 h-5 text-amber-600" />
                  <span className="font-mono text-sm font-semibold text-slate-800" dir="ltr">{card.card_number}</span>
                </div>
                <Badge color="bg-emerald-100 text-emerald-700 border-emerald-200">
                  {card.inspection_result === 'APPROVED' ? 'معتمد' : card.inspection_result}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div><span className="text-slate-400">أمر العمل:</span> <span className="text-slate-700" dir="ltr">{card.wo_number ?? '—'}</span></div>
                <div><span className="text-slate-400">الدفعة:</span> <span className="text-slate-700" dir="ltr">{card.batch_number ?? '—'}</span></div>
                <div><span className="text-slate-400">الموديل:</span> <span className="text-slate-700">{card.model_name ?? '—'}</span></div>
                <div><span className="text-slate-400">الصنف:</span> <span className="text-slate-700">{card.item_name ?? '—'}</span></div>
                <div><span className="text-slate-400">المرحلة:</span> <span className="text-slate-700">{card.final_stage_name ?? '—'}</span></div>
                <div><span className="text-slate-400">الكمية:</span> <span className="text-slate-700">{card.accepted_quantity} PCS</span></div>
                <div><span className="text-slate-400">المعتمد:</span> <span className="text-slate-700">{card.approver?.full_name ?? '—'}</span></div>
                <div><span className="text-slate-400">تاريخ الاعتماد:</span> <span className="text-slate-700">{card.approval_date ? new Date(card.approval_date).toLocaleDateString('en-GB') : '—'}</span></div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <div className="text-xs text-slate-400">
                  طبعت {card.print_count} مرة
                  {card.pallet_id && <span className="mr-2 text-cyan-600">• مرتبطة ببليت</span>}
                </div>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => handlePrint(card)}>
                    <Printer className="w-3.5 h-3.5" /> طباعة
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setPrintCard(card)}>
                    <Eye className="w-3.5 h-3.5" /> معاينة
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {printCard && (
        <QualityCardPreview card={printCard} printHistory={printHistory} onClose={() => setPrintCard(null)} />
      )}
    </div>
  );
}

function QualityCardPreview({ card, printHistory, onClose }: {
  card: QualityCardWithRelations;
  printHistory: { id: string; printed_at: string; printed_by: string | null }[];
  onClose: () => void;
}) {
  return (
    <Modal open title="معاينة بطاقة الجودة" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {/* Printable area */}
        <div id="quality-card-print" className="border-2 border-slate-300 rounded-xl p-6 bg-white">
          <div className="flex items-center justify-between mb-4 pb-4 border-b border-slate-200">
            <div>
              <h2 className="text-lg font-bold text-slate-800">بطاقة جودة</h2>
              <p className="text-xs text-slate-500">Quality Card</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm font-semibold text-amber-700" dir="ltr">{card.card_number}</p>
              <p className="text-xs text-slate-500">{card.inspection_result === 'APPROVED' ? 'معتمد' : card.inspection_result}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <InfoRow label="رقم أمر العمل" value={card.wo_number} />
            <InfoRow label="رقم الدفعة" value={card.batch_number} />
            <InfoRow label="الموديل" value={card.model_name} />
            <InfoRow label="كود الصنف" value={card.item_code} />
            <InfoRow label="اسم الصنف" value={card.item_name} />
            <InfoRow label="المرحلة النهائية" value={card.final_stage_name} />
            <InfoRow label="الكمية المقبولة" value={`${card.accepted_quantity} PCS`} />
            <InfoRow label="المعتمد" value={card.approver?.full_name ?? '—'} />
            <InfoRow label="تاريخ الاعتماد" value={card.approval_date ? new Date(card.approval_date).toLocaleString('en-GB') : '—'} />
            <InfoRow label="عدد الطباعات" value={String(card.print_count)} />
          </div>
          {card.notes && <div className="mt-4 pt-3 border-t border-slate-100"><p className="text-xs text-slate-500">{card.notes}</p></div>}
        </div>

        {/* Print history */}
        {printHistory.length > 0 && (
          <div className="bg-slate-50 rounded-lg p-3">
            <h4 className="text-xs font-semibold text-slate-600 mb-2">سجل الطباعة</h4>
            <div className="space-y-1">
              {printHistory.map((h, i) => (
                <div key={h.id} className="flex items-center gap-2 text-xs text-slate-500">
                  <Printer className="w-3 h-3" />
                  <span>طباعة #{i + 1}</span>
                  <span dir="ltr">{new Date(h.printed_at).toLocaleString('en-GB')}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>إغلاق</Button>
          <Button size="sm" onClick={() => window.print()}>
            <Printer className="w-4 h-4" /> طباعة PDF
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <p className="text-sm font-medium text-slate-700" dir="ltr">{value ?? '—'}</p>
    </div>
  );
}

// ============================================================
// Reports Tab
// ============================================================

function ReportsTab({ lots, defects }: {
  lots: InspectionLotWithRelations[];
  defects: DefectMaster[];
}) {
  const results = lots.reduce((acc, l) => {
    acc.totalSubmitted += l.quantity_submitted;
    if (l.status === 'APPROVED') acc.approved++;
    if (l.status === 'REJECTED') acc.rejected++;
    if (l.status === 'PENDING' || l.status === 'IN_INSPECTION') acc.pending++;
    return acc;
  }, { totalSubmitted: 0, approved: 0, rejected: 0, pending: 0 });

  // By model
  const byModel = useMemo(() => {
    const map = new Map<string, { name: string; submitted: number; count: number }>();
    for (const l of lots) {
      const name = l.product_model?.name ?? 'غير محدد';
      const existing = map.get(l.product_model_id ?? 'none');
      if (existing) {
        existing.submitted += l.quantity_submitted;
        existing.count++;
      } else {
        map.set(l.product_model_id ?? 'none', { name, submitted: l.quantity_submitted, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [lots]);

  // By stage
  const byStage = useMemo(() => {
    const map = new Map<string, { name: string; submitted: number; count: number }>();
    for (const l of lots) {
      const name = l.final_stage?.stage_name ?? 'غير محدد';
      const key = l.final_stage_id;
      const existing = map.get(key);
      if (existing) {
        existing.submitted += l.quantity_submitted;
        existing.count++;
      } else {
        map.set(key, { name, submitted: l.quantity_submitted, count: 1 });
      }
    }
    return Array.from(map.values());
  }, [lots]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatBox icon={Package} label="إجمالي الألواط" value={lots.length} color="text-slate-600" />
        <StatBox icon={CheckCircle} label="ألواط معتمدة" value={results.approved} color="text-emerald-600" />
        <StatBox icon={XCircle} label="ألواط مرفوضة" value={results.rejected} color="text-red-600" />
        <StatBox icon={ClipboardCheck} label="بانتظار الفحص" value={results.pending} color="text-amber-600" />
      </div>

      {/* By Model */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">أداء الجودة حسب الموديل</h4>
        </div>
        {byModel.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">لا توجد بيانات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">عدد الألواط</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">إجمالي الكمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byModel.map((m, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{m.name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{m.count}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{m.submitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* By Stage */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">أداء الجودة حسب المرحلة</h4>
        </div>
        {byStage.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">لا توجد بيانات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">المرحلة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">عدد الألواط</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">إجمالي الكمية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {byStage.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-sm text-slate-700">{s.name}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{s.count}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{s.submitted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Defect Distribution */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">توزيع العيوب</h4>
        </div>
        {defects.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500 text-center">لا توجد عيوب</p>
        ) : (
          <div className="p-4 space-y-2">
            {defects.map(d => (
              <div key={d.id} className="flex items-center justify-between py-1.5">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-slate-400" />
                  <span className="text-sm text-slate-700">{d.defect_name}</span>
                  <span className="text-xs text-slate-400">({d.defect_code})</span>
                </div>
                <Badge color={d.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'}>
                  {d.is_active ? 'نشط' : 'غير نشط'}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Lot Detail Page
// ============================================================

function LotDetailPage({ lotId, onBack }: { lotId: string; onBack: () => void }) {
  const [lot, setLot] = useState<InspectionLotWithRelations | null>(null);
  const [results, setResults] = useState<InspectionResultWithRelations[]>([]);
  const [approvals, setApprovals] = useState<(QualityApproval & { approver: { id: string; full_name: string } | null })[]>([]);
  const [dispositions, setDispositions] = useState<QualityDisposition[]>([]);
  const [defects, setDefects] = useState<DefectMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [showApproval, setShowApproval] = useState(false);
  const [showDisposition, setShowDisposition] = useState(false);
  const { profile } = useAuth();
  const canInspect = profile?.role === 'QUALITY' || profile?.role === 'PRODUCTION_ENGINEER' || profile?.role === 'ADMIN' || profile?.role === 'SUPERVISOR';
  const canApprove = profile?.role === 'QUALITY' || profile?.role === 'PRODUCTION_ENGINEER' || profile?.role === 'ADMIN';
  const canDisposition = profile?.role === 'QUALITY' || profile?.role === 'PRODUCTION_ENGINEER' || profile?.role === 'ADMIN';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [l, r, a, d, def] = await Promise.all([
        fetchInspectionLot(lotId),
        fetchInspectionResults(lotId),
        fetchApprovals(lotId),
        fetchDispositions(lotId),
        fetchDefects(true),
      ]);
      setLot(l);
      setResults(r);
      setApprovals(a);
      setDispositions(d);
      setDefects(def);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [lotId]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  }
  if (!lot) {
    return <div className="text-center py-16"><p className="text-slate-500">لم يتم العثور على اللوط</p></div>;
  }

  const totalAccepted = results.reduce((s, r) => s + r.accepted_quantity, 0);
  const totalRejected = results.reduce((s, r) => s + r.rejected_quantity, 0);
  const totalPending = results.reduce((s, r) => s + r.pending_inspection_quantity, 0);
  const reworkQty = dispositions.filter(d => d.disposition_type === 'REWORK').reduce((s, d) => s + d.quantity, 0);
  const scrapQty = dispositions.filter(d => d.disposition_type === 'SCRAP').reduce((s, d) => s + d.quantity, 0);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ChevronLeft className="w-4 h-4" /> رجوع لقائمة الجودة
      </button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800" dir="ltr">{lot.lot_number}</h2>
            <p className="text-sm text-slate-500 mt-0.5">لوط فحص الجودة</p>
          </div>
          <Badge color={LOT_STATUS_COLORS[lot.status]} variant="dot">{LOT_STATUS_LABELS[lot.status]}</Badge>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div><span className="text-slate-400">أمر العمل:</span> <span className="text-slate-700" dir="ltr">{lot.work_order?.wo_number ?? '—'}</span></div>
          <div><span className="text-slate-400">الدفعة:</span> <span className="text-slate-700" dir="ltr">{lot.parent_batch?.batch_number ?? '—'}</span></div>
          <div><span className="text-slate-400">المرحلة:</span> <span className="text-slate-700">{lot.final_stage?.stage_name ?? '—'}</span></div>
          <div><span className="text-slate-400">الموديل:</span> <span className="text-slate-700">{lot.product_model?.name ?? '—'}</span></div>
          <div><span className="text-slate-400">الكمية المقدمة:</span> <span className="text-slate-700">{lot.quantity_submitted} {lot.unit_of_measure}</span></div>
          <div><span className="text-slate-400">الصنف:</span> <span className="text-slate-700">{lot.item?.name ?? '—'}</span></div>
          <div><span className="text-slate-400">أنشأه:</span> <span className="text-slate-700">{lot.created_by_profile?.full_name ?? '—'}</span></div>
          <div><span className="text-slate-400">التاريخ:</span> <span className="text-slate-700" dir="ltr">{new Date(lot.created_at).toLocaleDateString('en-GB')}</span></div>
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatBox icon={CheckCircle} label="مقبول" value={totalAccepted} color="text-emerald-600" />
        <StatBox icon={XCircle} label="مرفوض" value={totalRejected} color="text-red-600" />
        <StatBox icon={ClipboardCheck} label="بانتظار الفحص" value={totalPending} color="text-amber-600" />
        <StatBox icon={Wrench} label="إعادة عمل" value={reworkQty} color="text-orange-600" />
        <StatBox icon={Trash2} label="هالك" value={scrapQty} color="text-red-600" />
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-2 mb-4">
        {canInspect && lot.status !== 'APPROVED' && lot.status !== 'CLOSED' && (
          <Button onClick={() => setShowInspection(true)}>
            <ClipboardCheck className="w-4 h-4" /> تسجيل فحص
          </Button>
        )}
        {canApprove && lot.status === 'INSPECTED' && (
          <Button onClick={() => setShowApproval(true)}>
            <Award className="w-4 h-4" /> اعتماد
          </Button>
        )}
        {canDisposition && (lot.status === 'INSPECTED' || lot.status === 'REJECTED') && totalRejected > 0 && (
          <Button variant="secondary" onClick={() => setShowDisposition(true)}>
            <ListChecks className="w-4 h-4" /> تصرف في المرفوضات
          </Button>
        )}
      </div>

      {/* Inspection Results */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">نتائج الفحص</h4>
        </div>
        {results.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="w-7 h-7" />} title="لم يتم تسجيل فحص" description="سجل نتيجة فحص لهذا اللوط" />
        ) : (
          <div className="divide-y divide-slate-50">
            {results.map((r, i) => (
              <div key={r.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">فحص #{i + 1}</span>
                    {r.is_reinspection && <Badge color="bg-blue-100 text-blue-700 border-blue-200">إعادة فحص</Badge>}
                  </div>
                  <span className="text-xs text-slate-400" dir="ltr">{new Date(r.inspection_date).toLocaleString('en-GB')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-400">المفحوص:</span> <span className="text-slate-700">{r.inspected_quantity} {r.unit_of_measure}</span></div>
                  <div><span className="text-slate-400">المقبول:</span> <span className="text-emerald-600 font-medium">{r.accepted_quantity}</span></div>
                  <div><span className="text-slate-400">المرفوض:</span> <span className="text-red-600 font-medium">{r.rejected_quantity}</span></div>
                  <div><span className="text-slate-400">معلق:</span> <span className="text-amber-600 font-medium">{r.pending_inspection_quantity}</span></div>
                </div>
                {r.defect_codes && (
                  <div className="mt-2 text-xs"><span className="text-slate-400">العيوب:</span> <span className="text-slate-700">{r.defect_codes}</span></div>
                )}
                {r.defect_description && (
                  <div className="mt-1 text-xs"><span className="text-slate-400">وصف العيب:</span> <span className="text-slate-700">{r.defect_description}</span></div>
                )}
                {r.notes && <div className="mt-1 text-xs"><span className="text-slate-400">ملاحظات:</span> <span className="text-slate-700">{r.notes}</span></div>}
                {r.inspector && <div className="mt-1 text-xs"><span className="text-slate-400">الفاحص:</span> <span className="text-slate-700">{r.inspector.full_name}</span></div>}
                {/* Defects detail */}
                {r.defects && r.defects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {r.defects.map(d => (
                      <Badge key={d.id} color="bg-red-50 text-red-600 border-red-100">
                        {d.defect.defect_name} ({d.defect_quantity})
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Approvals */}
      {approvals.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-700">سجل الاعتماد</h4>
          </div>
          <div className="divide-y divide-slate-50">
            {approvals.map(a => (
              <div key={a.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-medium text-slate-700">قرار: {a.decision}</span>
                    {a.is_reversed && <Badge color="bg-red-100 text-red-700 border-red-200">ملغي</Badge>}
                  </div>
                  <span className="text-xs text-slate-400" dir="ltr">{new Date(a.approval_timestamp).toLocaleString('en-GB')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div><span className="text-slate-400">الكمية المعتمدة:</span> <span className="text-emerald-600 font-medium">{a.approved_quantity}</span></div>
                  <div><span className="text-slate-400">الكمية المرفوضة:</span> <span className="text-red-600 font-medium">{a.rejected_quantity}</span></div>
                  <div><span className="text-slate-400">التصرف:</span> <span className="text-slate-700">{a.disposition ? DISPOSITION_LABELS[a.disposition] ?? a.disposition : '—'}</span></div>
                  <div><span className="text-slate-400">المعتمد:</span> <span className="text-slate-700">{a.approver?.full_name ?? '—'} ({a.approver_role})</span></div>
                </div>
                {a.notes && <div className="mt-1 text-xs"><span className="text-slate-400">ملاحظات:</span> <span className="text-slate-700">{a.notes}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispositions */}
      {dispositions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-700">التصرفات</h4>
          </div>
          <div className="divide-y divide-slate-50">
            {dispositions.map(d => (
              <div key={d.id} className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <Badge color={DISPOSITION_COLORS[d.disposition_type]} variant="dot">
                    {DISPOSITION_LABELS[d.disposition_type]}
                  </Badge>
                  <span className="text-xs text-slate-400" dir="ltr">{new Date(d.created_at).toLocaleString('en-GB')}</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div><span className="text-slate-400">الكمية:</span> <span className="text-slate-700">{d.quantity} {d.unit_of_measure}</span></div>
                  <div><span className="text-slate-400">الصلاحية:</span> <span className="text-slate-700">{d.approver_role}</span></div>
                  {d.is_final_scrap && <div><span className="text-red-600 font-medium">هالك نهائي</span></div>}
                </div>
                {d.reason && <div className="mt-1 text-xs"><span className="text-slate-400">السبب:</span> <span className="text-slate-700">{d.reason}</span></div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showInspection && (
        <InspectionModal
          lot={lot}
          defects={defects}
          onClose={() => setShowInspection(false)}
          onSaved={() => { setShowInspection(false); load(); }}
        />
      )}
      {showApproval && (
        <ApprovalModal
          lot={lot}
          totalAccepted={totalAccepted}
          totalRejected={totalRejected}
          onClose={() => setShowApproval(false)}
          onSaved={() => { setShowApproval(false); load(); }}
        />
      )}
      {showDisposition && (
        <DispositionModal
          lot={lot}
          totalRejected={totalRejected}
          onClose={() => setShowDisposition(false)}
          onSaved={() => { setShowDisposition(false); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Field Component
// ============================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

// ============================================================
// Inspection Modal
// ============================================================

function InspectionModal({ lot, defects, onClose, onSaved }: {
  lot: InspectionLotWithRelations;
  defects: DefectMaster[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [inspected, setInspected] = useState(lot.quantity_submitted);
  const [accepted, setAccepted] = useState(0);
  const [rejected, setRejected] = useState(0);
  const [pending, setPending] = useState(0);
  const [defectCodes, setDefectCodes] = useState('');
  const [defectDesc, setDefectDesc] = useState('');
  const [notes, setNotes] = useState('');
  const [isReinspection, setIsReinspection] = useState(false);
  const [selectedDefects, setSelectedDefects] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reconciliationOk = inspected === accepted + rejected + pending;

  async function handleSave() {
    setSaving(true);
    setErr(null);
    if (!reconciliationOk) {
      setErr('مطلوب: المفحوص = المقبول + المرفوض + المعلق');
      setSaving(false);
      return;
    }
    try {
      const resultId = await recordInspectionResult({
        inspection_lot_id: lot.id,
        inspected_quantity: inspected,
        accepted_quantity: accepted,
        rejected_quantity: rejected,
        pending_inspection_quantity: pending,
        defect_codes: defectCodes || (selectedDefects.length > 0 ? selectedDefects.join(', ') : null) || undefined,
        defect_description: defectDesc || undefined,
        notes: notes || undefined,
        is_reinspection: isReinspection,
      });

      // Add selected defects
      for (const defectId of selectedDefects) {
        await addInspectionDefect({
          inspection_result_id: resultId,
          defect_id: defectId,
          defect_quantity: rejected,
        });
      }

      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="تسجيل نتيجة فحص" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}

        <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
          اللوط: <span className="font-mono font-medium" dir="ltr">{lot.lot_number}</span> — الكمية المقدمة: {lot.quantity_submitted} {lot.unit_of_measure}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية المفحوصة">
            <input type="number" min={0} value={inspected} onChange={e => setInspected(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
          <Field label="الكمية المقبولة">
            <input type="number" min={0} value={accepted} onChange={e => setAccepted(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
          <Field label="الكمية المرفوضة">
            <input type="number" min={0} value={rejected} onChange={e => setRejected(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
          <Field label="كمية معلقة للفحص">
            <input type="number" min={0} value={pending} onChange={e => setPending(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
        </div>

        {/* Reconciliation check */}
        <div className={`text-xs px-3 py-2 rounded-lg flex items-center gap-2 ${reconciliationOk ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {reconciliationOk ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {reconciliationOk ? `متوازن: ${inspected} = ${accepted} + ${rejected} + ${pending}` : `غير متوازن: ${inspected} ≠ ${accepted + rejected + pending}`}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={isReinspection} onChange={e => setIsReinspection(e.target.checked)} className="rounded" />
          إعادة فحص
        </label>

        {/* Defect selection */}
        <Field label="العيوب">
          <div className="flex flex-wrap gap-2">
            {defects.map(d => (
              <button
                key={d.id}
                type="button"
                onClick={() => {
                  setSelectedDefects(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id]);
                }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${selectedDefects.includes(d.id) ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300'}`}
              >
                {d.defect_name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="وصف العيب">
          <textarea value={defectDesc} onChange={e => setDefectDesc(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>

        <Field label="ملاحظات">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={handleSave} disabled={saving || !reconciliationOk}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            حفظ الفحص
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Approval Modal
// ============================================================

function ApprovalModal({ lot, totalAccepted, totalRejected, onClose, onSaved }: {
  lot: InspectionLotWithRelations;
  totalAccepted: number;
  totalRejected: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<'ACCEPT' | 'REJECT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION'>('ACCEPT');
  const [approvedQty, setApprovedQty] = useState(totalAccepted);
  const [rejectedQty, setRejectedQty] = useState(totalRejected);
  const [disposition, setDisposition] = useState<'ACCEPT' | 'REWORK' | 'SCRAP' | 'RE_INSPECTION'>('ACCEPT');
  const [notes, setNotes] = useState('');
  const [generateCard, setGenerateCard] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { profile } = useAuth();

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await approveInspectionLot({
        inspection_lot_id: lot.id,
        decision,
        approved_quantity: approvedQty,
        rejected_quantity: rejectedQty,
        disposition,
        approver_role: profile?.role ?? 'QUALITY',
        notes: notes || undefined,
        generate_card: generateCard,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="اعتماد لوط الفحص" onClose={onClose}>
      <div className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}

        <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
          سيتم إنشاء بطاقة جودة تلقائياً عند القبول بالكمية المعتمدة. الاعتماد نهائي وغير قابل للتعديل.
        </div>

        <Field label="القرار">
          <select value={decision} onChange={e => setDecision(e.target.value as typeof decision)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none">
            <option value="ACCEPT">قبول</option>
            <option value="REJECT">رفض</option>
            <option value="REWORK">إعادة عمل</option>
            <option value="SCRAP">هالك</option>
            <option value="RE_INSPECTION">إعادة فحص</option>
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية المعتمدة">
            <input type="number" min={0} value={approvedQty} onChange={e => setApprovedQty(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
          <Field label="الكمية المرفوضة">
            <input type="number" min={0} value={rejectedQty} onChange={e => setRejectedQty(Number(e.target.value))}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
          </Field>
        </div>

        <Field label="التصرف">
          <select value={disposition} onChange={e => setDisposition(e.target.value as typeof disposition)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none">
            <option value="ACCEPT">قبول</option>
            <option value="REWORK">إعادة عمل</option>
            <option value="SCRAP">هالك</option>
            <option value="RE_INSPECTION">إعادة فحص</option>
          </select>
        </Field>

        <Field label="ملاحظات">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={generateCard} onChange={e => setGenerateCard(e.target.checked)} className="rounded" />
          إنشاء بطاقة جودة تلقائياً
        </label>

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            اعتماد
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Disposition Modal
// ============================================================

function DispositionModal({ lot, totalRejected, onClose, onSaved }: {
  lot: InspectionLotWithRelations;
  totalRejected: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [dispType, setDispType] = useState<'REWORK' | 'SCRAP' | 'RE_INSPECTION'>('REWORK');
  const [quantity, setQuantity] = useState(totalRejected);
  const [reason, setReason] = useState('');
  const [isFinalScrap, setIsFinalScrap] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setErr(null);
    try {
      await recordQualityDisposition({
        inspection_lot_id: lot.id,
        disposition_type: dispType,
        quantity,
        reason: reason || undefined,
        is_final_scrap: isFinalScrap,
        original_rejected_quantity: totalRejected,
      });
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="التصرف في الكمية المرفوضة" onClose={onClose}>
      <div className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}

        <div className="bg-amber-50 rounded-lg px-3 py-2 text-xs text-amber-700">
          المرفوض المتاح: {totalRejected} {lot.unit_of_measure}. لا يتم تصنيف المرفوض كهالك تلقائياً.
        </div>

        <Field label="نوع التصرف">
          <select value={dispType} onChange={e => setDispType(e.target.value as typeof dispType)}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none">
            <option value="REWORK">إعادة عمل</option>
            <option value="SCRAP">هالك</option>
            <option value="RE_INSPECTION">إعادة فحص</option>
          </select>
        </Field>

        <Field label="الكمية">
          <input type="number" min={0} max={totalRejected} value={quantity} onChange={e => setQuantity(Number(e.target.value))}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>

        <Field label="السبب">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2}
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
        </Field>

        {dispType === 'SCRAP' && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={isFinalScrap} onChange={e => setIsFinalScrap(e.target.checked)} className="rounded" />
            هالك نهائي
          </label>
        )}

        {dispType === 'REWORK' && (
          <div className="bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
            إعادة العمل: يحافظ على المعاملة الأصلية ولا يحتسب كإنتاج جديد. يجب إعادة الفحص بعد الإصلاح.
          </div>
        )}

        <div className="flex gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            حفظ التصرف
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================
// Create Lot Modal
// ============================================================

function CreateLotModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [eligible, setEligible] = useState<Array<{
    parent_batch: ParentBatch;
    work_order: WorkOrder;
    final_stage: RoutingStage;
    good_qty: number;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [qty, setQty] = useState(0);

  useEffect(() => {
    fetchEligibleForInspection()
      .then(data => { setEligible(data.batches); setLoading(false); })
      .catch(e => { setErr(e instanceof Error ? e.message : 'حدث خطأ'); setLoading(false); });
  }, []);

  async function handleCreate() {
    if (selectedIdx === null) return;
    setSaving(true);
    setErr(null);
    try {
      const item = eligible[selectedIdx];
      await createInspectionLot({
        work_order_id: item.work_order.id,
        parent_batch_id: item.parent_batch.id,
        production_route_id: item.parent_batch.production_route_id,
        final_stage_id: item.final_stage.id,
        quantity_submitted: qty || item.good_qty,
        unit_of_measure: item.parent_batch.planned_quantity > 0 ? 'PCS' : 'PCS',
      });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'حدث خطأ');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open title="إنشاء لوط فحص" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-4">
        {err && <div className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle className="w-4 h-4" />{err}</div>}

        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
        ) : eligible.length === 0 ? (
          <EmptyState icon={<ClipboardCheck className="w-7 h-7" />} title="لا توجد كميات قابلة للفحص" description="الكميات المنتجة من المرحلة النهائية (التي تتطلب اعتماد جودة) ستظهر هنا" />
        ) : (
          <>
            <p className="text-xs text-slate-500">اختر دفعة ذات كمية منتج من المرحلة النهائية لإنشاء لوط فحص:</p>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {eligible.map((item, i) => (
                <div
                  key={`${item.parent_batch.id}_${item.final_stage.id}`}
                  onClick={() => { setSelectedIdx(i); setQty(item.good_qty); }}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${selectedIdx === i ? 'bg-amber-50 border-amber-300' : 'bg-white border-slate-200 hover:border-slate-300'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-slate-700" dir="ltr">{item.parent_batch.batch_number}</span>
                    <span className="text-xs text-slate-500" dir="ltr">{item.work_order.wo_number}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                    <span>المرحلة: {item.final_stage.stage_name}</span>
                    <span>الكمية المنتجة: {item.good_qty}</span>
                  </div>
                </div>
              ))}
            </div>

            {selectedIdx !== null && (
              <Field label="الكمية المقدمة للفحص">
                <input type="number" min={1} value={qty} onChange={e => setQty(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none" />
              </Field>
            )}

            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={onClose}>إلغاء</Button>
              <Button size="sm" onClick={handleCreate} disabled={saving || selectedIdx === null}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                إنشاء
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

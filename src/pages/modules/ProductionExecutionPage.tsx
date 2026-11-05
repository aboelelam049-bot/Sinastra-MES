import { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle, Loader2, AlertCircle, RefreshCw, Search,
  ArrowRight, ArrowLeft, Play, CheckCircle2, ShieldCheck,
  Warehouse, Trash2, Gauge, Users, Package, Clock,
  Cog, ChevronDown, ChevronLeft,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  fetchSimplifiedWorkOrders, fetchWorkOrderDetail, fetchSubWorkOrders,
  startSubWorkOrder, completeSubWorkOrder, assignSubWorkOrderMachine,
  setSubWorkOrderQuality, setWorkOrderQuality, transferToWarehouse,
  fetchScrapRecords, addScrapRecord, computeOee, fetchOeeSnapshot,
  fetchMesDashboard, fetchAllOeeSnapshots, getWorkOrderCostSummary,
  type SimplifiedWorkOrder, type SubWorkOrderWithRelations, type OeeResult,
} from '@/lib/mesService';
import { fetchMachines } from '@/lib/machineService';
import { fetchDefects } from '@/lib/qualityService';
import { fetchItems } from '@/lib/masterDataService';
import { supabase } from '@/lib/supabase';
import {
  WO_STATUS_LABELS, WO_STATUS_COLORS,
  SUB_WO_STATUS_LABELS, SUB_WO_STATUS_COLORS,
  QUALITY_GATE_LABELS, QUALITY_GATE_COLORS,
} from '@/lib/statusLabels';
import type { Machine, QualityGateStatus, DefectMaster, ItemMaster, OeeSnapshot, WorkOrderCostSummary } from '@/types';

const COMPONENT_LABELS: Record<string, string> = {
  LENGTH: 'طول',
  FRONT: 'وش رئيسي',
  BACK: 'ضهر رئيسي',
  FRONT_MAIN: 'وش رئيسي',
  FRONT_SUB: 'وش فرعي',
  BACK_MAIN: 'ضهر رئيسي',
  BACK_SUB: 'ضهر فرعي',
};

const COMPONENT_COLORS: Record<string, string> = {
  LENGTH: 'bg-blue-100 text-blue-700 border-blue-200',
  FRONT: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  BACK: 'bg-amber-100 text-amber-700 border-amber-200',
  FRONT_MAIN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  FRONT_SUB: 'bg-teal-100 text-teal-700 border-teal-200',
  BACK_MAIN: 'bg-amber-100 text-amber-700 border-amber-200',
  BACK_SUB: 'bg-orange-100 text-orange-700 border-orange-200',
};

export function ProductionExecutionPage() {
  const [tab, setTab] = useState<'machines' | 'orders' | 'dashboard'>('machines');

  return (
    <div>
      <PageHeader title="تنفيذ الإنتاج" subtitle="الماكينات → أوامر الشغل → تسجيل الإنتاج → الجودة → المخزن → OEE" />
      <div className="flex gap-2 mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-1 w-fit">
        <button onClick={() => setTab('machines')} className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === 'machines' ? 'bg-amber-50 border border-amber-300 text-amber-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><Cog className="w-4 h-4" /> الماكينات</span>
        </button>
        <button onClick={() => setTab('orders')} className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === 'orders' ? 'bg-amber-50 border border-amber-300 text-amber-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><PlayCircle className="w-4 h-4" /> أوامر الشغل</span>
        </button>
        <button onClick={() => setTab('dashboard')} className={`px-4 py-2 text-sm rounded-lg transition-colors ${tab === 'dashboard' ? 'bg-amber-50 border border-amber-300 text-amber-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}>
          <span className="flex items-center gap-1.5"><Gauge className="w-4 h-4" /> لوحة OEE</span>
        </button>
      </div>
      {tab === 'machines' ? <MachinesTab /> : tab === 'orders' ? <WorkOrdersTab /> : <OeeDashboardTab />}
    </div>
  );
}

// ============================================================
// Machines Tab — shows machines, expand to see their sub work orders
// ============================================================

function MachinesTab() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [allSubWos, setAllSubWos] = useState<Record<string, SubWorkOrderWithRelations[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMachine, setExpandedMachine] = useState<string | null>(null);
  const [completeTarget, setCompleteTarget] = useState<SubWorkOrderWithRelations | null>(null);
  const [scrapTarget, setScrapTarget] = useState<SubWorkOrderWithRelations | null>(null);
  const [qualityTarget, setQualityTarget] = useState<SubWorkOrderWithRelations | null>(null);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [defects, setDefects] = useState<DefectMaster[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const mc = await fetchMachines(undefined, undefined, undefined, true);
      setMachines(mc);
      const [its, df] = await Promise.all([
        fetchItems(undefined, undefined, true),
        fetchDefects(true),
      ]);
      setItems(its);
      setDefects(df);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function expandMachine(machineId: string) {
    if (expandedMachine === machineId) { setExpandedMachine(null); return; }
    setExpandedMachine(machineId);
    if (!allSubWos[machineId]) {
      try {
        const { data } = await supabase
          .from('sub_work_orders')
          .select(`*, machine:machines(id, name, machine_code), material_item:item_master(id, name, item_code, unit_of_measure, is_raw_material, material_classification), work_order:work_orders!sub_work_orders_work_order_id_fkey(id, wo_number, model:product_models(id, name, model_code))`)
          .eq('machine_id', machineId)
          .in('status', ['PENDING', 'IN_PROGRESS'])
          .order('sequence_number', { ascending: true });
        setAllSubWos(prev => ({ ...prev, [machineId]: (data as SubWorkOrderWithRelations[]) ?? [] }));
      } catch { /* ignore */ }
    }
  }

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  if (error) return <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div>;

  return (
    <div>
      {machines.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<Cog className="w-7 h-7" />} title="لا توجد ماكينات"
            description="أضف ماكينات من صفحة الماكينات أولاً." />
        </div>
      ) : (
        <div className="space-y-3">
          {machines.map(m => {
            const subWos = allSubWos[m.id] ?? [];
            const activeCount = subWos.length;
            return (
              <div key={m.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <button onClick={() => expandMachine(m.id)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${m.status === 'RUNNING' ? 'bg-emerald-100' : 'bg-slate-100'}`}>
                      <Cog className={`w-5 h-5 ${m.status === 'RUNNING' ? 'text-emerald-600' : 'text-slate-400'}`} />
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-slate-700">{m.name}</div>
                      <div className="font-mono text-xs text-slate-400" dir="ltr">{m.machine_code}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {activeCount > 0 && <Badge color="bg-amber-100 text-amber-700 border-amber-200">{activeCount} أمر شغل</Badge>}
                    {expandedMachine === m.id ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronLeft className="w-4 h-4 text-slate-400" />}
                  </div>
                </button>
                {expandedMachine === m.id && (
                  <div className="border-t border-slate-100">
                    {subWos.length === 0 ? (
                      <div className="p-6 text-center text-sm text-slate-400">لا توجد أوامر شغل معينة لهذه الماكينة</div>
                    ) : (
                      <table className="w-full text-sm">
                        <thead className="bg-slate-50">
                          <tr>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">أمر الشغل</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">المرحلة</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">الكمية</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">الحالة</th>
                            <th className="text-right px-4 py-2 font-medium text-slate-600">الجودة</th>
                            <th className="px-4 py-2"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {subWos.map(swo => (
                            <tr key={swo.id} className="hover:bg-slate-50">
                              <td className="px-4 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{swo.work_order?.wo_number ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-700">{swo.stage_name ?? '—'}</td>
                              <td className="px-4 py-2.5 text-slate-600" dir="ltr">{swo.good_quantity}/{swo.planned_quantity}</td>
                              <td className="px-4 py-2.5"><Badge color={SUB_WO_STATUS_COLORS[swo.status]} variant="dot">{SUB_WO_STATUS_LABELS[swo.status]}</Badge></td>
                              <td className="px-4 py-2.5"><Badge color={QUALITY_GATE_COLORS[swo.quality_status]} variant="dot">{QUALITY_GATE_LABELS[swo.quality_status]}</Badge></td>
                              <td className="px-4 py-2.5">
                                <div className="flex gap-1 justify-end">
                                  {swo.status === 'PENDING' && (
                                    <button onClick={() => handleStart(swo.id, load, setError)} title="بدء" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Play className="w-4 h-4" /></button>
                                  )}
                                  {swo.status === 'IN_PROGRESS' && (
                                    <button onClick={() => setCompleteTarget(swo)} title="إنهاء" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"><CheckCircle2 className="w-4 h-4" /></button>
                                  )}
                                  {swo.status === 'COMPLETED' && swo.quality_status === 'PENDING' && (
                                    <button onClick={() => setQualityTarget(swo)} title="قرار الجودة" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><ShieldCheck className="w-4 h-4" /></button>
                                  )}
                                  {swo.status === 'COMPLETED' && (
                                    <button onClick={() => setScrapTarget(swo)} title="تسجيل إسكراب" className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completeTarget && <CompleteModal swo={completeTarget} items={items} onClose={() => setCompleteTarget(null)} onDone={() => { setCompleteTarget(null); load(); }} />}
      {scrapTarget && <ScrapModal swo={scrapTarget} defects={defects} woId={scrapTarget.work_order_id} onClose={() => setScrapTarget(null)} onDone={() => { setScrapTarget(null); load(); }} />}
      {qualityTarget && <QualityModal target={{ swo: qualityTarget, wo: null }} onClose={() => setQualityTarget(null)} onDone={() => { setQualityTarget(null); load(); }} />}
    </div>
  );
}

// ============================================================
// Work Orders Tab
// ============================================================

function WorkOrdersTab() {
  const [orders, setOrders] = useState<SimplifiedWorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setOrders(await fetchSimplifiedWorkOrders(search.trim() || undefined, statusFilter || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);

  if (detailId) return <WorkOrderDetail woId={detailId} onBack={() => { setDetailId(null); load(); }} />;

  return (
    <div>
      {error && <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div>}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث برقم أمر الشغل…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الحالات</option>
          {Object.keys(WO_STATUS_LABELS).map(s => <option key={s} value={s}>{WO_STATUS_LABELS[s as keyof typeof WO_STATUS_LABELS]}</option>)}
        </select>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      : orders.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<PlayCircle className="w-7 h-7" />} title="لا توجد أوامر شغل"
            description="أوامر الشغل تُنشأ تلقائيًا عند اعتماد الخطة الشهرية وتوليد أوامر الشغل منها." />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">رقم الأمر</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الموديل</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الجودة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">المخزن</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {orders.map(w => (
                <tr key={w.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setDetailId(w.id)}>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{w.wo_number}</td>
                  <td className="px-4 py-3 text-slate-700">{w.model?.name ?? '—'}</td>
                  <td className="px-4 py-3 font-medium text-slate-700" dir="ltr">{Number(w.planned_quantity)}</td>
                  <td className="px-4 py-3"><Badge color={WO_STATUS_COLORS[w.status as keyof typeof WO_STATUS_COLORS]} variant="dot">{WO_STATUS_LABELS[w.status as keyof typeof WO_STATUS_LABELS]}</Badge></td>
                  <td className="px-4 py-3"><Badge color={QUALITY_GATE_COLORS[w.quality_status]} variant="dot">{QUALITY_GATE_LABELS[w.quality_status]}</Badge></td>
                  <td className="px-4 py-3 hidden md:table-cell">{w.warehouse_transferred ? <Badge color="bg-cyan-100 text-cyan-700 border-cyan-200">تم النقل</Badge> : <span className="text-xs text-slate-400">—</span>}</td>
                  <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Work Order Detail
// ============================================================

function WorkOrderDetail({ woId, onBack }: { woId: string; onBack: () => void }) {
  const [wo, setWo] = useState<SimplifiedWorkOrder | null>(null);
  const [subWos, setSubWos] = useState<SubWorkOrderWithRelations[]>([]);
  const [scrap, setScrap] = useState<{ id: string; quantity: number; defect_code: string | null; reason: string | null; recorded_at: string }[]>([]);
  const [oee, setOee] = useState<OeeResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [defects, setDefects] = useState<DefectMaster[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [completeTarget, setCompleteTarget] = useState<SubWorkOrderWithRelations | null>(null);
  const [scrapTarget, setScrapTarget] = useState<SubWorkOrderWithRelations | null>(null);
  const [qualityTarget, setQualityTarget] = useState<{ swo: SubWorkOrderWithRelations | null; wo: SimplifiedWorkOrder | null } | null>(null);
  const [warehouseTarget, setWarehouseTarget] = useState<SimplifiedWorkOrder | null>(null);
  const [costSummary, setCostSummary] = useState<WorkOrderCostSummary | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [w, subs, scraps, mc, df, its] = await Promise.all([
        fetchWorkOrderDetail(woId),
        fetchSubWorkOrders(woId),
        fetchScrapRecords(woId),
        fetchMachines(undefined, undefined, undefined, true),
        fetchDefects(true),
        fetchItems(undefined, undefined, true),
      ]);
      setWo(w); setSubWos(subs); setScrap(scraps); setMachines(mc); setDefects(df); setItems(its);
      try { setOee(await computeOee(woId)); } catch { /* OEE optional */ }
      try { setCostSummary(await getWorkOrderCostSummary(woId)); } catch { /* cost optional */ }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [woId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  if (error) return <div><button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3"><ArrowLeft className="w-4 h-4" /> رجوع</button><div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div></div>;
  if (!wo) return null;

  const totalGood = subWos.reduce((s, x) => s + Number(x.good_quantity), 0);
  const totalScrap = subWos.reduce((s, x) => s + Number(x.scrap_quantity), 0);
  const allSubsDone = subWos.length > 0 && subWos.every(s => s.status === 'COMPLETED');

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1 text-sm text-slate-600 hover:text-amber-700 mb-3"><ArrowLeft className="w-4 h-4" /> رجوع للقائمة</button>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-800 font-mono" dir="ltr">{wo.wo_number}</h2>
            <p className="text-sm text-slate-500">{wo.model?.name ?? '—'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Badge color={WO_STATUS_COLORS[wo.status as keyof typeof WO_STATUS_COLORS]} variant="dot">{WO_STATUS_LABELS[wo.status as keyof typeof WO_STATUS_LABELS]}</Badge>
            <Badge color={QUALITY_GATE_COLORS[wo.quality_status]} variant="dot">{QUALITY_GATE_LABELS[wo.quality_status]}</Badge>
            {wo.warehouse_transferred && <Badge color="bg-cyan-100 text-cyan-700 border-cyan-200">تم النقل للمخزن</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
          <Stat label="الكمية المخططة" value={Number(wo.planned_quantity).toString()} />
          <Stat label="المنتج الفعلي" value={totalGood.toString()} color="text-emerald-600" />
          <Stat label="الإسكراب" value={totalScrap.toString()} color="text-red-600" />
          <Stat label="أوامر فرعية" value={`${subWos.filter(s => s.status === 'COMPLETED').length}/${subWos.length}`} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3 pt-3 border-t border-slate-100">
          <Stat label="البداية المخططة" value={wo.planned_start_time ? fmt(wo.planned_start_time) : '—'} small />
          <Stat label="النهاية المخططة" value={wo.planned_end_time ? fmt(wo.planned_end_time) : '—'} small />
          <Stat label="البداية الفعلية" value={wo.actual_start_time ? fmt(wo.actual_start_time) : '—'} small />
          <Stat label="النهاية الفعلية" value={wo.actual_end_time ? fmt(wo.actual_end_time) : '—'} small />
        </div>
      </div>

      {oee && <OeeCard oee={oee} />}
      {costSummary && <CostCard summary={costSummary} />}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">أوامر الشغل الفرعية ({subWos.length})</h3></div>
        {subWos.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">لا توجد أوامر فرعية. تأكد من تعريف مسار تشغيل للموديل.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 w-10">#</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">المرحلة</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الجزء</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الماكينة</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الإسكراب</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600 hidden md:table-cell">العمالة</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">الحالة</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">الجودة</th>
                <th className="px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {subWos.map(swo => (
                <tr key={swo.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{swo.sequence_number}</td>
                  <td className="px-3 py-2.5 font-medium text-slate-700">{swo.stage_name}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">{swo.component_type && <span className={`inline-block px-2 py-0.5 text-xs rounded-full border ${COMPONENT_COLORS[swo.component_type] ?? 'bg-slate-100 text-slate-600 border-slate-200'}`}>{COMPONENT_LABELS[swo.component_type] ?? swo.component_type}</span>}</td>
                  <td className="px-3 py-2.5 hidden sm:table-cell">
                    <select value={swo.machine_id ?? ''} disabled={swo.status === 'COMPLETED'} onChange={(e) => handleAssignMachine(swo.id, e.target.value || null, load, setError)}
                      className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:bg-slate-50">
                      <option value="">— بدون —</option>
                      {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2.5 text-slate-600" dir="ltr">{Number(swo.good_quantity)}/{Number(swo.planned_quantity)}</td>
                  <td className="px-3 py-2.5 text-red-600 hidden sm:table-cell" dir="ltr">{Number(swo.scrap_quantity)}</td>
                  <td className="px-3 py-2.5 hidden md:table-cell text-slate-600">{swo.labor_count || '—'}</td>
                  <td className="px-3 py-2.5"><Badge color={SUB_WO_STATUS_COLORS[swo.status]} variant="dot">{SUB_WO_STATUS_LABELS[swo.status]}</Badge></td>
                  <td className="px-3 py-2.5"><Badge color={QUALITY_GATE_COLORS[swo.quality_status]} variant="dot">{QUALITY_GATE_LABELS[swo.quality_status]}</Badge></td>
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      {swo.status === 'PENDING' && <button onClick={() => handleStart(swo.id, load, setError)} title="بدء" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded"><Play className="w-4 h-4" /></button>}
                      {swo.status === 'IN_PROGRESS' && <button onClick={() => setCompleteTarget(swo)} title="إنهاء" className="p-1.5 text-amber-600 hover:bg-amber-50 rounded"><CheckCircle2 className="w-4 h-4" /></button>}
                      {swo.status === 'COMPLETED' && swo.quality_status === 'PENDING' && <button onClick={() => setQualityTarget({ swo, wo: null })} title="قرار الجودة" className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"><ShieldCheck className="w-4 h-4" /></button>}
                      {swo.status === 'COMPLETED' && <button onClick={() => setScrapTarget(swo)} title="تسجيل إسكراب" className="p-1.5 text-red-600 hover:bg-red-50 rounded"><Trash2 className="w-4 h-4" /></button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex flex-wrap gap-3">
        {wo.quality_status === 'PENDING' && allSubsDone && <Button onClick={() => setQualityTarget({ swo: null, wo })}><ShieldCheck className="w-4 h-4" /> قرار الجودة للأمر الرئيسي</Button>}
        {wo.quality_status === 'PASSED' && !wo.warehouse_transferred && <Button onClick={() => setWarehouseTarget(wo)}><Warehouse className="w-4 h-4" /> نقل للمخزن</Button>}
        <Button variant="secondary" onClick={async () => { try { setOee(await computeOee(woId)); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); } }}><Gauge className="w-4 h-4" /> إعادة حساب OEE</Button>
      </div>

      {scrap.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700">سجل الإسكراب ({scrap.length})</h3></div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="text-right px-4 py-2 font-medium text-slate-600">الكمية</th><th className="text-right px-4 py-2 font-medium text-slate-600">نوع العيب</th><th className="text-right px-4 py-2 font-medium text-slate-600">السبب</th><th className="text-right px-4 py-2 font-medium text-slate-600">الوقت</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {scrap.map(r => (<tr key={r.id} className="hover:bg-slate-50"><td className="px-4 py-2 font-medium text-red-600" dir="ltr">{Number(r.quantity)}</td><td className="px-4 py-2 text-slate-600">{r.defect_code ?? '—'}</td><td className="px-4 py-2 text-slate-600 text-xs">{r.reason ?? '—'}</td><td className="px-4 py-2 text-xs text-slate-400" dir="ltr">{fmt(r.recorded_at)}</td></tr>))}
            </tbody>
          </table>
        </div>
      )}

      {completeTarget && <CompleteModal swo={completeTarget} items={items} onClose={() => setCompleteTarget(null)} onDone={() => { setCompleteTarget(null); load(); }} />}
      {scrapTarget && <ScrapModal swo={scrapTarget} defects={defects} woId={woId} onClose={() => setScrapTarget(null)} onDone={() => { setScrapTarget(null); load(); }} />}
      {qualityTarget && <QualityModal target={qualityTarget} onClose={() => setQualityTarget(null)} onDone={() => { setQualityTarget(null); load(); }} />}
      {warehouseTarget && <ConfirmDialog open title="نقل للمخزن" message={`سيتم نقل الكمية للمخزن. لا يمكن التراجع.`} confirmLabel="نقل للمخزن"
        onConfirm={async () => { try { await transferToWarehouse(warehouseTarget.id); setWarehouseTarget(null); load(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); setWarehouseTarget(null); } }}
        onCancel={() => setWarehouseTarget(null)} />}
    </div>
  );
}

// ============================================================
// Complete Modal — with labor, material, scrap, time
// ============================================================

interface MaterialEntry {
  item_id: string;
  item_code: string;
  consumed_qty: string;
  unit_of_measure: string;
  unit_cost: string;
}

function CompleteModal({ swo, items, onClose, onDone }: { swo: SubWorkOrderWithRelations; items: ItemMaster[]; onClose: () => void; onDone: () => void }) {
  const [good, setGood] = useState(String(swo.planned_quantity));
  const [scrap, setScrap] = useState('0');
  const [reject, setReject] = useState('0');
  const [labor, setLabor] = useState(String(swo.labor_count || '1'));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [materials, setMaterials] = useState<MaterialEntry[]>(
    (swo.materials ?? []).map(m => ({
      item_id: m.item_id,
      item_code: m.item_code,
      consumed_qty: String(m.consumed_qty),
      unit_of_measure: m.unit_of_measure,
      unit_cost: String(m.unit_cost ?? 0),
    }))
  );

  const rawMaterials = items.filter(i => i.is_raw_material);

  function addMaterial() {
    setMaterials(prev => [...prev, { item_id: '', item_code: '', consumed_qty: '', unit_of_measure: 'PCS', unit_cost: '0' }]);
  }

  function updateMaterial(idx: number, field: keyof MaterialEntry, value: string) {
    setMaterials(prev => prev.map((m, i) => {
      if (i !== idx) return m;
      const updated = { ...m, [field]: value };
      if (field === 'item_id') {
        const item = items.find(it => it.id === value);
        if (item) {
          updated.item_code = item.item_code;
          updated.unit_of_measure = item.unit_of_measure;
        }
      }
      return updated;
    }));
  }

  function removeMaterial(idx: number) {
    setMaterials(prev => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const validMaterials = materials
        .filter(m => m.item_id && Number(m.consumed_qty) > 0)
        .map(m => ({
          item_id: m.item_id,
          item_code: m.item_code,
          consumed_qty: Number(m.consumed_qty),
          unit_of_measure: m.unit_of_measure,
          unit_cost: Number(m.unit_cost) || 0,
        }));
      await completeSubWorkOrder({
        sub_wo_id: swo.id,
        good_qty: Number(good), scrap_qty: Number(scrap), reject_qty: Number(reject),
        labor_count: Number(labor) || 0,
        notes: notes || undefined,
        materials: validMaterials.length > 0 ? validMaterials : undefined,
      });
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'حدث خطأ'); }
    finally { setLoading(false); }
  }

  const componentLabel = swo.component_type ? COMPONENT_LABELS[swo.component_type] ?? swo.component_type : null;

  return (
    <Modal open title={`إنهاء: ${swo.stage_name}${componentLabel ? ' — ' + componentLabel : ''}`} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div><label className="block text-xs font-medium text-slate-600 mb-1">صالح</label><input type="number" min="0" value={good} onChange={e => setGood(e.target.value)} required className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">إسكراب</label><input type="number" min="0" value={scrap} onChange={e => setScrap(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" /></div>
          <div><label className="block text-xs font-medium text-slate-600 mb-1">مرفوض</label><input type="number" min="0" value={reject} onChange={e => setReject(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
        </div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> عدد العمالة</label><input type="number" min="0" value={labor} onChange={e => setLabor(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>

        {/* Multi-material consumption */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-medium text-slate-600 flex items-center gap-1"><Package className="w-3 h-3" /> الخامات المستخدمة في هذه المرحلة</label>
            {rawMaterials.length > 0 && <button type="button" onClick={addMaterial} className="text-xs text-amber-600 hover:text-amber-700 font-medium">+ إضافة خامة</button>}
          </div>
          {materials.length === 0 ? (
            <div className="text-xs text-slate-400 bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">لم يتم إضافة خامات. اضغط "إضافة خامة" لتسجيل الخامات المصروف فعلياً.</div>
          ) : (
            <div className="space-y-2">
              {materials.map((m, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                  <div className="col-span-5">
                    <select value={m.item_id} onChange={e => updateMaterial(idx, 'item_id', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500">
                      <option value="">— اختر خامة —</option>
                      {rawMaterials.map(i => <option key={i.id} value={i.id}>{i.name} ({i.item_code})</option>)}
                    </select>
                  </div>
                  <div className="col-span-3"><input type="number" min="0" step="0.01" placeholder="الكمية" value={m.consumed_qty} onChange={e => updateMaterial(idx, 'consumed_qty', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" /></div>
                  <div className="col-span-2"><input type="number" min="0" step="0.01" placeholder="تكلفة الوحدة" value={m.unit_cost} onChange={e => updateMaterial(idx, 'unit_cost', e.target.value)} className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500" /></div>
                  <div className="col-span-1 text-xs text-slate-400 py-1.5 text-center">{m.unit_of_measure}</div>
                  <div className="col-span-1"><button type="button" onClick={() => removeMaterial(idx)} className="p-1 text-red-500 hover:bg-red-50 rounded w-full"><Trash2 className="w-3.5 h-3.5 mx-auto" /></button></div>
                </div>
              ))}
              <div className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-1.5">
                إجمالي تكلفة الخامات لهذه المرحلة: <span className="font-medium text-amber-700" dir="ltr">{materials.reduce((s, m) => s + (Number(m.consumed_qty) || 0) * (Number(m.unit_cost) || 0), 0).toFixed(2)}</span>
              </div>
            </div>
          )}
        </div>

        <div><label className="block text-xs font-medium text-slate-600 mb-1">ملاحظات</label><input value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
        <div className="text-xs text-slate-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 flex items-center gap-1"><Clock className="w-3 h-3" /> وقت البداية والنهاية يسجل تلقائياً — الخامات والتكلفة تُحفظ في تكلفة أمر الشغل</div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} إنهاء واعتماد</Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Scrap Modal
// ============================================================

function ScrapModal({ swo, defects, woId, onClose, onDone }: { swo: SubWorkOrderWithRelations; defects: DefectMaster[]; woId: string; onClose: () => void; onDone: () => void }) {
  const [quantity, setQuantity] = useState('1');
  const [defectCode, setDefectCode] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try { await addScrapRecord({ sub_work_order_id: swo.id, work_order_id: woId, quantity: Number(quantity), defect_code: defectCode || undefined, reason: reason || undefined }); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : 'حدث خطأ'); }
    finally { setLoading(false); }
  }

  return (
    <Modal open title={`تسجيل إسكراب: ${swo.stage_name}`} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-xs font-medium text-slate-600 mb-1">الكمية</label><input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} required className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" /></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">نوع العيب</label><select value={defectCode} onChange={e => setDefectCode(e.target.value)} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"><option value="">— اختر —</option>{defects.map(d => <option key={d.id} value={d.defect_code}>{d.defect_name}</option>)}</select></div>
        <div><label className="block text-xs font-medium text-slate-600 mb-1">السبب</label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" /></div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1"><Button type="submit" variant="danger" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} تسجيل</Button><Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button></div>
      </form>
    </Modal>
  );
}

// ============================================================
// Quality Modal
// ============================================================

function QualityModal({ target, onClose, onDone }: { target: { swo: SubWorkOrderWithRelations | null; wo: SimplifiedWorkOrder | null }; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<QualityGateStatus>('PASSED');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError(null);
    try {
      if (target.swo) await setSubWorkOrderQuality(target.swo.id, status);
      else if (target.wo) await setWorkOrderQuality(target.wo.id, status);
      onDone();
    } catch (err) { setError(err instanceof Error ? err.message : 'حدث خطأ'); }
    finally { setLoading(false); }
  }

  const title = target.swo ? `قرار الجودة: ${target.swo.stage_name}` : 'قرار الجودة للأمر الرئيسي';
  return (
    <Modal open title={title} onClose={onClose} maxWidth="max-w-md">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div><label className="block text-sm font-medium text-slate-700 mb-2">القرار</label>
          <div className="grid grid-cols-2 gap-2">
            {(['PASSED', 'FAILED', 'REWORK'] as QualityGateStatus[]).map(s => (
              <button key={s} type="button" onClick={() => setStatus(s)} className={`px-4 py-2.5 text-sm rounded-lg border transition-colors ${status === s ? QUALITY_GATE_COLORS[s] + ' font-medium border-current' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>{QUALITY_GATE_LABELS[s]}</button>
            ))}
          </div>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1"><Button type="submit" disabled={loading}>{loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} تأكيد</Button><Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button></div>
      </form>
    </Modal>
  );
}

// ============================================================
// OEE Dashboard
// ============================================================

function OeeDashboardTab() {
  const [snapshots, setSnapshots] = useState<(OeeSnapshot & { work_order?: { id: string; wo_number: string; model?: { name: string } } })[]>([]);
  const [metrics, setMetrics] = useState<{ totalWorkOrders: number; qualityPendingCount: number; qualityPassedCount: number; warehousePendingCount: number; totalScrap: number; avgOee: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [snaps, m] = await Promise.all([fetchAllOeeSnapshots(), fetchMesDashboard()]);
      setSnapshots(snaps); setMetrics(m);
    } catch (err) { setError(err instanceof Error ? err.message : 'حدث خطأ'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>;
  if (error) return <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2"><AlertCircle className="w-4 h-4" /> {error}</div>;

  const pct = (v: number) => Math.round(v * 100) + '%';
  return (
    <div>
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <DashCard label="إجمالي الأوامر" value={metrics.totalWorkOrders.toString()} />
          <DashCard label="بانتظار الجودة" value={metrics.qualityPendingCount.toString()} color="text-amber-600" />
          <DashCard label="مقبول جودة" value={metrics.qualityPassedCount.toString()} color="text-emerald-600" />
          <DashCard label="بانتظار المخزن" value={metrics.warehousePendingCount.toString()} color="text-blue-600" />
          <DashCard label="إجمالي الإسكراب" value={metrics.totalScrap.toString()} color="text-red-600" />
          <DashCard label="متوسط OEE" value={pct(metrics.avgOee)} color={metrics.avgOee >= 0.6 ? 'text-emerald-600' : 'text-amber-600'} />
        </div>
      )}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100"><h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1"><Gauge className="w-4 h-4" /> سجلات OEE</h3></div>
        {snapshots.length === 0 ? <div className="p-8 text-center text-sm text-slate-400">لا توجد حسابات OEE بعد.</div> : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200"><tr><th className="text-right px-4 py-2.5 font-medium text-slate-600">أمر الشغل</th><th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th><th className="text-right px-4 py-2.5 font-medium text-slate-600">الإتاحة</th><th className="text-right px-4 py-2.5 font-medium text-slate-600">الأداء</th><th className="text-right px-4 py-2.5 font-medium text-slate-600">الجودة</th><th className="text-right px-4 py-2.5 font-medium text-slate-600">OEE</th></tr></thead>
            <tbody className="divide-y divide-slate-50">
              {snapshots.map(s => {
                const wo = s.work_order; const oeeColor = s.oee >= 0.85 ? 'text-emerald-600' : s.oee >= 0.6 ? 'text-amber-600' : 'text-red-600';
                return (<tr key={s.id} className="hover:bg-slate-50"><td className="px-4 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{wo?.wo_number ?? '—'}</td><td className="px-4 py-2.5 text-slate-600">{wo?.model?.name ?? '—'}</td><td className="px-4 py-2.5 text-blue-600" dir="ltr">{pct(s.availability)}</td><td className="px-4 py-2.5 text-amber-600" dir="ltr">{pct(s.performance)}</td><td className="px-4 py-2.5 text-emerald-600" dir="ltr">{pct(s.quality)}</td><td className={`px-4 py-2.5 font-bold ${oeeColor}`} dir="ltr">{pct(s.oee)}</td></tr>);
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return <div><div className={`text-xs text-slate-500 ${small ? 'mb-0.5' : 'mb-1'}`}>{label}</div><div className={`${small ? 'text-sm' : 'text-lg font-semibold'} ${color ?? 'text-slate-800'}`} dir="ltr">{value}</div></div>;
}

function CostCard({ summary }: { summary: WorkOrderCostSummary }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1"><Package className="w-4 h-4 text-amber-500" /> تكلفة أمر الشغل</h3>
      <div className="grid grid-cols-3 gap-3">
        <div className="text-center"><div className="text-xs text-slate-500 mb-1">تكلفة الخامات</div><div className="text-xl font-bold text-amber-600" dir="ltr">{Number(summary.material_cost).toFixed(2)}</div></div>
        <div className="text-center"><div className="text-xs text-slate-500 mb-1">تكلفة العمالة</div><div className="text-xl font-bold text-blue-600" dir="ltr">{Number(summary.labor_cost).toFixed(2)}</div></div>
        <div className="text-center border-r border-slate-100 pr-3"><div className="text-xs text-slate-500 mb-1">إجمالي التكلفة</div><div className="text-2xl font-bold text-slate-800" dir="ltr">{Number(summary.total_cost).toFixed(2)}</div></div>
      </div>
      {summary.materials.length > 0 && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs text-slate-500 mb-2">تفاصيل الخامات المصروفة:</div>
          <div className="space-y-1">
            {summary.materials.map((m, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <span className="text-slate-600">
                  {m.component_type && <span className={`inline-block px-1.5 py-0.5 rounded-full border ${COMPONENT_COLORS[m.component_type] ?? 'bg-slate-100 text-slate-600 border-slate-200'} ml-1`}>{COMPONENT_LABELS[m.component_type] ?? m.component_type}</span>}
                  <span className="font-mono" dir="ltr">{m.item_code}</span>
                  {m.stage_name && <span className="text-slate-400"> — {m.stage_name}</span>}
                </span>
                <span className="text-slate-700" dir="ltr">{Number(m.consumed_qty)} × {Number(m.unit_cost).toFixed(2)} = <span className="font-medium text-amber-700">{Number(m.total_cost).toFixed(2)}</span></span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OeeCard({ oee }: { oee: OeeResult }) {
  const pct = (v: number) => Math.round(v * 100) + '%';
  const oeeColor = oee.oee >= 0.85 ? 'text-emerald-600' : oee.oee >= 0.6 ? 'text-amber-600' : 'text-red-600';
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mb-4">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-1"><Gauge className="w-4 h-4" /> OEE</h3>
      <div className="grid grid-cols-4 gap-3">
        <div className="text-center"><div className="text-xs text-slate-500 mb-1">الإتاحة</div><div className="text-xl font-bold text-blue-600" dir="ltr">{pct(oee.availability)}</div></div>
        <div className="text-center"><div className="text-xs text-slate-500 mb-1">الأداء</div><div className="text-xl font-bold text-amber-600" dir="ltr">{pct(oee.performance)}</div></div>
        <div className="text-center"><div className="text-xs text-slate-500 mb-1">الجودة</div><div className="text-xl font-bold text-emerald-600" dir="ltr">{pct(oee.quality)}</div></div>
        <div className="text-center border-r border-slate-100 pr-3"><div className="text-xs text-slate-500 mb-1">OEE</div><div className={`text-2xl font-bold ${oeeColor}`} dir="ltr">{pct(oee.oee)}</div></div>
      </div>
      <div className="flex justify-between mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
        <span>زمن مخطط: {Math.round(oee.planned_minutes)} د</span><span>زمن فعلي: {Math.round(oee.actual_minutes)} د</span><span>منتج جيد: {Math.round(oee.good_qty)} / {Math.round(oee.total_qty)}</span>
      </div>
    </div>
  );
}

function DashCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4"><div className="text-xs text-slate-500 mb-1">{label}</div><div className={`text-2xl font-bold ${color ?? 'text-slate-800'}`} dir="ltr">{value}</div></div>;
}

function fmt(iso: string): string {
  const d = new Date(iso); return d.toLocaleString('ar-EG', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

async function handleStart(subWoId: string, reload: () => void, setError: (e: string | null) => void) {
  try { await startSubWorkOrder(subWoId); reload(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
}

async function handleAssignMachine(subWoId: string, machineId: string | null, reload: () => void, setError: (e: string | null) => void) {
  try { await assignSubWorkOrderMachine(subWoId, machineId); reload(); } catch (e) { setError(e instanceof Error ? e.message : 'خطأ'); }
}

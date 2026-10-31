import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  PlayCircle, Plus, Loader2, AlertCircle, RefreshCw, Search,
  ArrowRight, Trash2, Package, Clock, CheckCircle, XCircle,
  Scissors, ChevronLeft, Activity, ClipboardList, Lock,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import { fetchWorkOrders } from '@/lib/planningService';
import { fetchItems } from '@/lib/masterDataService';
import { fetchMachines, fetchWorkCenters } from '@/lib/machineService';
import { fetchRoutingVersions, fetchRoutingStages } from '@/lib/routingService';
import {
  fetchOpenSessions, fetchAllSessions, fetchSession, openShiftSession, closeShiftSession,
  fetchSessionTransactions, fetchBatchTransactions, fetchTransactionsWithRejected,
  recordProduction, createProductionBatch,
  fetchConversions, recordConversion,
  fetchDispositions, recordDisposition,
  computeSessionSummary,
  type SessionWithRelations, type TransactionWithRelations, type ConversionWithRelations,
  type SessionSummary,
} from '@/lib/productionExecutionService';
import type {
  WorkOrder, ProductModel, ItemMaster, WorkCenter, Machine,
  RoutingVersion, RoutingStage, ParentBatch, QuantityDisposition,
} from '@/types';
import { WO_STATUS_LABELS, WO_STATUS_COLORS } from '@/lib/statusLabels';

const EXECUTABLE_STATUSES = ['RELEASED', 'IN_PROGRESS'];
const SESSION_STATUS_COLORS: Record<string, string> = {
  OPEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CLOSING: 'bg-amber-100 text-amber-700 border-amber-200',
  CLOSED: 'bg-slate-100 text-slate-700 border-slate-200',
};

export function ProductionExecutionPage() {
  const [tab, setTab] = useState<'dashboard' | 'sessions' | 'rejected'>('dashboard');
  const [workOrders, setWorkOrders] = useState<(WorkOrder & { model: ProductModel | null })[]>([]);
  const [sessions, setSessions] = useState<SessionWithRelations[]>([]);
  const [rejectedTxs, setRejectedTxs] = useState<TransactionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailTarget, setDetailTarget] = useState<SessionWithRelations | null>(null);
  const [showCreateBatch, setShowCreateBatch] = useState(false);
  const [showOpenSession, setShowOpenSession] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [woData, sessData, rejData] = await Promise.all([
        fetchWorkOrders(undefined, undefined),
        fetchOpenSessions(),
        fetchTransactionsWithRejected(),
      ]);
      setWorkOrders(woData.filter(w => EXECUTABLE_STATUSES.includes(w.status)));
      setSessions(sessData);
      setRejectedTxs(rejData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (detailTarget) {
    return <SessionDetail session={detailTarget} onBack={() => { setDetailTarget(null); load(); }} />;
  }

  // Dashboard stats
  const totalPlanned = workOrders.reduce((s, w) => s + w.planned_quantity, 0);
  const totalActual = workOrders.reduce((s, w) => s + w.actual_quantity, 0);
  const openSessionCount = sessions.filter(s => s.status === 'OPEN').length;
  const rejectedCount = rejectedTxs.length;

  return (
    <div>
      <PageHeader
        title="تنفيذ الإنتاج"
        subtitle="Production Execution — تسجيل الإنتاج الفعلي وإدارة ورديات العمل"
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Dashboard stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatBox icon={ClipboardList} label="أوامر العمل النشطة" value={String(workOrders.length)} color="text-blue-600" />
        <StatBox icon={Activity} label="ورديات مفتوحة" value={String(openSessionCount)} color="text-emerald-600" />
        <StatBox icon={Package} label="الكمية المخططة" value={String(totalPlanned)} color="text-slate-600" />
        <StatBox icon={AlertCircle} label="مرفوضات بانتظار التصرف" value={String(rejectedCount)} color="text-red-600" />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <TabBtn active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={Activity}>
          لوحة الإنتاج
        </TabBtn>
        <TabBtn active={tab === 'sessions'} onClick={() => setTab('sessions')} icon={Clock}>
          الورديات النشطة
        </TabBtn>
        <TabBtn active={tab === 'rejected'} onClick={() => setTab('rejected')} icon={AlertCircle}>
          المرفوضات ({rejectedCount})
        </TabBtn>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : tab === 'dashboard' ? (
        <DashboardTab
          workOrders={workOrders}
          totalActual={totalActual}
          onOpenSession={() => setShowOpenSession(true)}
          onCreateBatch={() => setShowCreateBatch(true)}
        />
      ) : tab === 'sessions' ? (
        <SessionsTab sessions={sessions} onOpenDetail={setDetailTarget} onOpenSession={() => setShowOpenSession(true)} />
      ) : (
        <RejectedTab txs={rejectedTxs} onResolved={load} />
      )}

      {showOpenSession && (
        <OpenSessionModal
          workOrders={workOrders}
          onClose={() => setShowOpenSession(false)}
          onCreated={() => { setShowOpenSession(false); load(); }}
        />
      )}
      {showCreateBatch && (
        <CreateBatchModal
          workOrders={workOrders}
          onClose={() => setShowCreateBatch(false)}
          onCreated={() => { setShowCreateBatch(false); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Dashboard Tab
// ============================================================

function DashboardTab({ workOrders, totalActual, onOpenSession, onCreateBatch }: {
  workOrders: (WorkOrder & { model: ProductModel | null })[];
  totalActual: number;
  onOpenSession: () => void;
  onCreateBatch: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button onClick={onOpenSession}><PlayCircle className="w-4 h-4" /> فتح وردية</Button>
        <Button variant="secondary" onClick={onCreateBatch}><Plus className="w-4 h-4" /> إنشاء دفعة إنتاج</Button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700">أوامر العمل القابلة للتنفيذ</h4>
        </div>
        {workOrders.length === 0 ? (
          <EmptyState icon={<ClipboardList className="w-7 h-7" />} title="لا توجد أوامر عمل نشطة"
            description="أوامر العمل المُعتمدة (Released) أو قيد التنفيذ (In Progress) ستظهر هنا." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">رقم الأمر</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">المخططة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الفعلية</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {workOrders.map(wo => (
                  <tr key={wo.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700" dir="ltr">{wo.wo_number}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-700">{wo.model?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sm text-slate-600">{wo.planned_quantity} {wo.unit_of_measure ?? ''}</td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{wo.actual_quantity} {wo.unit_of_measure ?? ''}</td>
                    <td className="px-4 py-2.5">
                      <Badge color={WO_STATUS_COLORS[wo.status]} variant="dot">{WO_STATUS_LABELS[wo.status]}</Badge>
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
// Sessions Tab
// ============================================================

function SessionsTab({ sessions, onOpenDetail, onOpenSession }: {
  sessions: SessionWithRelations[];
  onOpenDetail: (s: SessionWithRelations) => void;
  onOpenSession: () => void;
}) {
  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={<Clock className="w-7 h-7" />}
          title="لا توجد ورديات نشطة"
          description="افتح وردية جديدة لبدء تسجيل الإنتاج. الوردية تربط أمر العمل والدفعة والمرحلة والماكينة والمشرف."
          action={<Button onClick={onOpenSession}><PlayCircle className="w-4 h-4" /> فتح وردية</Button>}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <Button onClick={onOpenSession}><PlayCircle className="w-4 h-4" /> فتح وردية</Button>
      <div className="space-y-2">
        {sessions.map(s => (
          <div
            key={s.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => onOpenDetail(s)}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-700">{s.work_order?.wo_number}</span>
                <span className="text-xs text-slate-400">—</span>
                <span className="text-sm text-slate-600">{s.parent_batch?.batch_number}</span>
              </div>
              <Badge color={SESSION_STATUS_COLORS[s.status]} variant="dot">
                {s.status === 'OPEN' ? 'مفتوحة' : s.status === 'CLOSING' ? 'جارية الإغلاق' : 'مغلقة'}
              </Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              <div><span className="text-slate-400">المرحلة:</span> <span className="text-slate-700">{s.production_stage?.stage_name}</span></div>
              <div><span className="text-slate-400">الماكينة:</span> <span className="text-slate-700">{s.machine?.name ?? '—'}</span></div>
              <div><span className="text-slate-400">المشرف:</span> <span className="text-slate-700">{s.supervisor?.full_name ?? '—'}</span></div>
              <div><span className="text-slate-400">الوردية:</span> <span className="text-slate-700">{s.shift ?? '—'}</span></div>
            </div>
            <div className="mt-2 text-xs text-slate-400" dir="ltr">
              {new Date(s.start_time).toLocaleString('en-GB')} — {s.end_time ? new Date(s.end_time).toLocaleString('en-GB') : 'ongoing'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Session Detail — production entries, live summary, closing
// ============================================================

function SessionDetail({ session, onBack }: { session: SessionWithRelations; onBack: () => void }) {
  const [txs, setTxs] = useState<TransactionWithRelations[]>([]);
  const [conversions, setConversions] = useState<ConversionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showEntry, setShowEntry] = useState(false);
  const [showConversion, setShowConversion] = useState(false);
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closeNotes, setCloseNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txData, convData] = await Promise.all([
        fetchSessionTransactions(session.id),
        fetchConversions(session.parent_batch_id),
      ]);
      setTxs(txData);
      setConversions(convData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [session.id, session.parent_batch_id]);

  useEffect(() => { load(); }, [load]);

  const summary = useMemo(() => computeSessionSummary(txs), [txs]);
  const isOpen = session.status === 'OPEN';

  async function handleClose() {
    try {
      await closeShiftSession(session.id, closeNotes.trim() || undefined);
      setCloseConfirm(false);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader title={session.parent_batch?.batch_number ?? 'وردية'} subtitle={session.work_order?.wo_number} />
      </div>

      {/* Session info */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <InfoBox label="أمر العمل" value={session.work_order?.wo_number ?? '—'} />
        <InfoBox label="المرحلة" value={session.production_stage?.stage_name ?? '—'} />
        <InfoBox label="الماكينة" value={session.machine?.name ?? '—'} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs font-medium text-slate-500 mb-0.5">الحالة</p>
          <Badge color={SESSION_STATUS_COLORS[session.status]} variant="dot">
            {session.status === 'OPEN' ? 'مفتوحة' : session.status === 'CLOSING' ? 'جارية الإغلاق' : 'مغلقة'}
          </Badge>
        </div>
      </div>

      {/* Live Summary */}
      <div className="bg-gradient-to-l from-slate-50 to-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" /> ملخص الوردية المباشر
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <SummaryStat label="إجمالي المدخل" value={summary.totalInput} color="text-slate-700" />
          <SummaryStat label="الجيد" value={summary.totalGood} color="text-emerald-600" />
          <SummaryStat label="المرفوض" value={summary.totalRejected} color="text-red-600" />
          <SummaryStat label="المعلق" value={summary.totalPending} color="text-amber-600" />
          <SummaryStat label="عدد الإدخالات" value={summary.entryCount} color="text-blue-600" />
        </div>
        {summary.firstEntryTime && (
          <p className="text-xs text-slate-400 mt-2" dir="ltr">
            {new Date(summary.firstEntryTime).toLocaleString('en-GB')} → {summary.lastEntryTime ? new Date(summary.lastEntryTime).toLocaleString('en-GB') : '—'}
          </p>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Action buttons */}
      {isOpen && (
        <div className="flex flex-wrap gap-2 mb-4">
          <Button onClick={() => setShowEntry(true)}><Plus className="w-4 h-4" /> تسجيل إنتاج</Button>
          <Button variant="secondary" onClick={() => setShowConversion(true)}><Scissors className="w-4 h-4" /> تحويل مواد (تقطيع)</Button>
          <Button variant="secondary" onClick={() => setCloseConfirm(true)}><Lock className="w-4 h-4" /> إغلاق الوردية</Button>
        </div>
      )}

      {/* Production entries */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-slate-400" /> إدخالات الإنتاج ({txs.length})
          </h4>
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
        ) : txs.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد إدخالات بعد. اضغط «تسجيل إنتاج» لإضافة أول إدخال.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">رقم العملية</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">المدخل</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">الجيد</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">المرفوض</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600">المعلق</th>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الوقت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {txs.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{t.transaction_number}</td>
                    <td className="px-3 py-2.5 text-sm text-slate-700">{t.input_qty} {t.unit_of_measure}</td>
                    <td className="px-3 py-2.5 text-sm font-medium text-emerald-700">{t.good_qty}</td>
                    <td className="px-3 py-2.5 text-sm text-red-600">{t.rejected_qty > 0 ? t.rejected_qty : '—'}</td>
                    <td className="px-3 py-2.5 text-sm text-amber-600">{t.pending_qty > 0 ? t.pending_qty : '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-400 hidden sm:table-cell" dir="ltr">{new Date(t.created_at).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Material conversions */}
      {conversions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100">
            <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
              <Scissors className="w-4 h-4 text-slate-400" /> تحويلات المواد ({conversions.length})
            </h4>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">المصدر</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">المخرج</th>
                <th className="text-right px-3 py-2.5 font-medium text-slate-600">النوع</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {conversions.map(c => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2.5 text-xs text-slate-700">{c.source_item?.name}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-600">{c.source_qty} {c.source_unit}</td>
                  <td className="px-3 py-2.5 text-xs text-slate-700">{c.output_item?.name ?? c.output_item_code}</td>
                  <td className="px-3 py-2.5">
                    <Badge color="bg-blue-50 text-blue-600 border-blue-100" >
                      {c.output_type === 'LENGTH_STRIP' ? 'طول' : c.output_type === 'FRONT_BACK_STRIP' ? 'وش/ظهر' : c.output_type === 'WASTE' ? 'هدر' : 'متبقي'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showEntry && (
        <ProductionEntryModal
          session={session}
          onClose={() => setShowEntry(false)}
          onSaved={() => { setShowEntry(false); load(); }}
        />
      )}
      {showConversion && (
        <ConversionModal
          session={session}
          onClose={() => setShowConversion(false)}
          onSaved={() => { setShowConversion(false); load(); }}
        />
      )}
      <ConfirmDialog
        open={closeConfirm}
        title="إغلاق الوردية"
        message="بعد الإغلاق لن يمكن إضافة إدخالات جديدة. سيتم الحفاظ على سجل الإدخالات كما هو."
        confirmLabel="إغلاق"
        variant="danger"
        onConfirm={handleClose}
        onCancel={() => setCloseConfirm(false)}
      />
    </div>
  );
}

// ============================================================
// Production Entry Modal
// ============================================================

function ProductionEntryModal({ session, onClose, onSaved }: {
  session: SessionWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [inputQty, setInputQty] = useState('');
  const [goodQty, setGoodQty] = useState('');
  const [rejectedQty, setRejectedQty] = useState('0');
  const [pendingQty, setPendingQty] = useState('0');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMachines(undefined, undefined, undefined, true);
        setMachines(data);
      } catch { /* ignore */ }
    })();
  }, []);

  const inp = parseFloat(inputQty) || 0;
  const good = parseFloat(goodQty) || 0;
  const rej = parseFloat(rejectedQty) || 0;
  const pend = parseFloat(pendingQty) || 0;
  const reconciled = inp === good + rej + pend;
  const valid = inp > 0 && good >= 0 && rej >= 0 && pend >= 0 && reconciled;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) { setError('مطابقة الكميات غير صحيحة: المدخل يجب أن يساوي الجيد + المرفوض + المعلق'); return; }
    setLoading(true);
    setError(null);
    try {
      await recordProduction({
        shift_session_id: session.id,
        machine_id: session.machine_id ?? undefined,
        input_qty: inp,
        good_qty: good,
        rejected_qty: rej,
        pending_qty: pend,
        unit_of_measure: session.work_order?.unit_of_measure ?? 'PCS',
        shift: session.shift ?? undefined,
        notes: notes.trim() || undefined,
        idempotency_key: `${session.id}-${Date.now()}`,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تسجيل إنتاج" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 space-y-1">
          <div className="flex justify-between"><span>أمر العمل:</span> <span className="font-mono font-medium" dir="ltr">{session.work_order?.wo_number}</span></div>
          <div className="flex justify-between"><span>الدفعة:</span> <span className="font-mono" dir="ltr">{session.parent_batch?.batch_number}</span></div>
          <div className="flex justify-between"><span>المرحلة:</span> <span>{session.production_stage?.stage_name}</span></div>
        </div>

        <Field label="الكمية المدخلة">
          <input type="number" min="0.01" step="0.01" value={inputQty}
            onChange={e => setInputQty(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="الجيد">
            <input type="number" min="0" step="0.01" value={goodQty}
              onChange={e => setGoodQty(e.target.value)} required
              className={`w-full px-3 py-2.5 text-sm border rounded-lg focus:outline-none focus:ring-2 ${reconciled ? 'border-slate-300 focus:ring-emerald-500' : 'border-red-300 focus:ring-red-500'}`} />
          </Field>
          <Field label="المرفوض">
            <input type="number" min="0" step="0.01" value={rejectedQty}
              onChange={e => setRejectedQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500" />
          </Field>
          <Field label="المعلق">
            <input type="number" min="0" step="0.01" value={pendingQty}
              onChange={e => setPendingQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>

        <div className={`text-sm rounded-lg px-3 py-2 ${reconciled ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
          {reconciled ? `مطابق: ${inp} = ${good} + ${rej} + ${pend}` : `غير مطابق: ${inp} ≠ ${good} + ${rej} + ${pend} (= ${good + rej + pend})`}
        </div>

        <Field label="ملاحظات">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !valid}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            تأكيد الإنتاج
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Material Conversion Modal (Initial Cutting)
// ============================================================

function ConversionModal({ session, onClose, onSaved }: {
  session: SessionWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [search, setSearch] = useState('');
  const [sourceItemId, setSourceItemId] = useState('');
  const [sourceQty, setSourceQty] = useState('1');
  const [sourceUnit, setSourceUnit] = useState('BOARD');
  const [outputItemId, setOutputItemId] = useState('');
  const [outputQty, setOutputQty] = useState('1');
  const [outputUnit, setOutputUnit] = useState('PCS');
  const [outputType, setOutputType] = useState('LENGTH_STRIP');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchItems(search.trim() || undefined, undefined, true);
        setItems(data);
      } catch { /* ignore */ }
    })();
  }, [search]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const sourceItem = items.find(i => i.id === sourceItemId);
      if (!sourceItem) throw new Error('اختر صنف المصدر');
      const outputItem = items.find(i => i.id === outputItemId);
      await recordConversion({
        parent_batch_id: session.parent_batch_id,
        work_order_id: session.work_order_id,
        production_stage_id: session.production_stage_id,
        source_item_id: sourceItem.id,
        source_item_code: sourceItem.item_code,
        source_qty: parseFloat(sourceQty),
        source_unit: sourceUnit,
        output_item_id: outputItemId || undefined,
        output_item_code: outputItem?.item_code ?? '',
        output_qty: parseFloat(outputQty),
        output_unit: outputUnit,
        output_type: outputType,
        machine_id: session.machine_id ?? undefined,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تحويل مواد — تقطيع أولي" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-blue-50 rounded-lg px-3 py-2 text-sm text-blue-700">
          سجّل تحويل المواد الخام (ألواح) إلى مخرجات (أطوال / أوجه / ظهور). كل تحويل يحافظ على سلسلة المواد.
        </div>

        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="بحث عن صنف…"
          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />

        <Field label="الصنف المصدر (اللوح الخام)">
          <select value={sourceItemId} onChange={e => setSourceItemId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر صنف</option>
            {items.map(i => <option key={i.id} value={i.id}>{i.name} ({i.item_code})</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="كمية المصدر">
            <input type="number" min="0.01" step="0.01" value={sourceQty} onChange={e => setSourceQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="وحدة المصدر">
            <input value={sourceUnit} onChange={e => setSourceUnit(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>

        <div className="border-t border-slate-200 pt-3">
          <h5 className="text-xs font-semibold text-slate-600 mb-2">المخرجات</h5>
          <Field label="صنف المخرج (اختياري)">
            <select value={outputItemId} onChange={e => setOutputItemId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              {items.filter(i => i.id !== sourceItemId).map(i => <option key={i.id} value={i.id}>{i.name} ({i.item_code})</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="كمية المخرج">
              <input type="number" min="0" step="0.01" value={outputQty} onChange={e => setOutputQty(e.target.value)} required
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </Field>
            <Field label="الوحدة">
              <input value={outputUnit} onChange={e => setOutputUnit(e.target.value)} required dir="ltr"
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
            </Field>
            <Field label="نوع المخرج">
              <select value={outputType} onChange={e => setOutputType(e.target.value)}
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
                <option value="LENGTH_STRIP">طول (Length Strip)</option>
                <option value="FRONT_BACK_STRIP">وش / ظهر (Front/Back Strip)</option>
                <option value="WASTE">هدر (Waste)</option>
                <option value="LEFTOVER">متبقي (Leftover)</option>
              </select>
            </Field>
          </div>
        </div>

        <Field label="ملاحظات">
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !sourceItemId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
            تسجيل التحويل
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Rejected Tab — quality dispositions
// ============================================================

function RejectedTab({ txs, onResolved }: { txs: TransactionWithRelations[]; onResolved: () => void }) {
  const [dispositions, setDispositions] = useState<Record<string, QuantityDisposition[]>>({});
  const [showDisp, setShowDisp] = useState<TransactionWithRelations | null>(null);

  const loadDispositions = useCallback(async () => {
    const allDisps: Record<string, QuantityDisposition[]> = {};
    for (const tx of txs) {
      try {
        const d = await fetchDispositions(tx.id);
        if (d.length > 0) allDisps[tx.id] = d;
      } catch { /* ignore */ }
    }
    setDispositions(allDisps);
  }, [txs]);

  useEffect(() => { loadDispositions(); }, [loadDispositions]);

  if (txs.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState icon={<CheckCircle className="w-7 h-7" />} title="لا توجد مرفوضات"
          description="لا توجد كميات مرفوضة بانتظار التصرف. سيتم عرض الكميات المرفوضة من عمليات الإنتاج هنا." />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {txs.map(tx => {
        const disps = dispositions[tx.id] ?? [];
        const remainingRejected = tx.rejected_qty - disps.reduce((s, d) => s + d.quantity, 0);
        return (
          <div key={tx.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="font-mono text-xs text-slate-700" dir="ltr">{tx.transaction_number}</span>
                <span className="text-sm text-slate-600 mr-2">— {tx.production_stage?.stage_name}</span>
              </div>
              <Badge color={remainingRejected > 0 ? 'bg-red-100 text-red-700 border-red-200' : 'bg-emerald-100 text-emerald-700 border-emerald-200'}>
                {remainingRejected > 0 ? `${remainingRejected} بانتظار التصرف` : 'تم التصرف'}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 mb-2">
              الكمية المرفوضة: {tx.rejected_qty} {tx.unit_of_measure}
            </div>
            {disps.length > 0 && (
              <div className="space-y-1 mb-2">
                {disps.map(d => (
                  <div key={d.id} className="text-xs flex items-center gap-2">
                    <Badge color={
                      d.disposition_type === 'SCRAP' ? 'bg-red-50 text-red-600 border-red-100' :
                      d.disposition_type === 'REWORK' ? 'bg-amber-50 text-amber-600 border-amber-100' :
                      'bg-blue-50 text-blue-600 border-blue-100'
                    }>
                      {d.disposition_type === 'SCRAP' ? 'هدر' : d.disposition_type === 'REWORK' ? 'إعادة عمل' : 'إعادة فحص'}
                    </Badge>
                    <span className="text-slate-600">{d.quantity} {d.unit_of_measure}</span>
                    <span className="text-slate-400">— {d.reason}</span>
                  </div>
                ))}
              </div>
            )}
            {remainingRejected > 0 && (
              <Button size="sm" variant="secondary" onClick={() => setShowDisp(tx)}>
                <Plus className="w-3.5 h-3.5" /> تسجيل تصرف
              </Button>
            )}
          </div>
        );
      })}
      {showDisp && (
        <DispositionModal
          tx={showDisp}
          onClose={() => setShowDisp(null)}
          onSaved={() => { setShowDisp(null); onResolved(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Disposition Modal
// ============================================================

function DispositionModal({ tx, onClose, onSaved }: {
  tx: TransactionWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<'REWORK' | 'SCRAP' | 'RETURN_FOR_INSPECTION'>('SCRAP');
  const [qty, setQty] = useState(String(tx.rejected_qty));
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await recordDisposition({
        production_transaction_id: tx.id,
        parent_batch_id: tx.parent_batch_id,
        disposition_type: type,
        quantity: parseFloat(qty),
        unit_of_measure: tx.unit_of_measure,
        reason: reason.trim(),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تسجيل تصرف في الكمية المرفوضة" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
          العملية: <span className="font-mono" dir="ltr">{tx.transaction_number}</span> — الكمية المرفوضة: {tx.rejected_qty} {tx.unit_of_measure}
        </div>
        <Field label="نوع التصرف">
          <select value={type} onChange={e => setType(e.target.value as typeof type)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="SCRAP">هدر نهائي (Scrap)</option>
            <option value="REWORK">إعادة عمل (Rework)</option>
            <option value="RETURN_FOR_INSPECTION">إعادة فحص</option>
          </select>
        </Field>
        <Field label="الكمية">
          <input type="number" min="0.01" max={tx.rejected_qty} step="0.01" value={qty}
            onChange={e => setQty(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="السبب">
          <textarea value={reason} onChange={e => setReason(e.target.value)} required rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !reason.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            تأكيد التصرف
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Open Session Modal
// ============================================================

function OpenSessionModal({ workOrders, onClose, onCreated }: {
  workOrders: (WorkOrder & { model: ProductModel | null })[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [woId, setWoId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [stageId, setStageId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [shift, setShift] = useState('');
  const [batches, setBatches] = useState<ParentBatch[]>([]);
  const [stages, setStages] = useState<RoutingStage[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchMachines(undefined, undefined, undefined, true);
        setMachines(data);
      } catch { /* ignore */ }
    })();
  }, []);

  // Fetch batches for selected work order
  const loadBatches = useCallback(async (woId: string) => {
    const { data, error } = await supabase
      .from('parent_batches')
      .select('*')
      .eq('work_order_id', woId)
      .in('status', ['CREATED', 'IN_PROGRESS'])
      .order('created_at', { ascending: false });
    if (error) return;
    setBatches(data as ParentBatch[]);
  }, []);

  // Fetch routing stages when batch is selected
  const loadStages = useCallback(async (batch: ParentBatch) => {
    // Get routing versions for this template
    const { data: versions } = await supabase
      .from('routing_versions')
      .select('*, template:routing_templates(*)')
      .eq('status', 'ACTIVE')
      .order('version_number', { ascending: false })
      .limit(1);
    if (versions && versions.length > 0) {
      const { data: stageData } = await supabase
        .from('routing_stages')
        .select('*')
        .eq('routing_version_id', versions[0].id)
        .eq('is_active', true)
        .order('sequence_number', { ascending: true });
      setStages(stageData as RoutingStage[] ?? []);
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await openShiftSession({
        work_order_id: woId,
        parent_batch_id: batchId,
        production_stage_id: stageId,
        machine_id: machineId || undefined,
        shift: shift || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="فتح وردية إنتاج" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="أمر العمل">
          <select value={woId} onChange={e => { setWoId(e.target.value); loadBatches(e.target.value); setBatchId(''); }}
            required className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر أمر عمل</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.wo_number} — {w.model?.name}</option>)}
          </select>
        </Field>
        <Field label="دفعة الإنتاج">
          <select value={batchId} onChange={e => {
              setBatchId(e.target.value);
              const b = batches.find(x => x.id === e.target.value);
              if (b) loadStages(b);
            }} required disabled={!woId}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر دفعة</option>
            {batches.map(b => <option key={b.id} value={b.id}>{b.batch_number} ({b.planned_quantity})</option>)}
          </select>
        </Field>
        <Field label="مرحلة الإنتاج">
          <select value={stageId} onChange={e => setStageId(e.target.value)} required disabled={!batchId}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر المرحلة</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name} ({s.stage_code})</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الماكينة (اختياري)">
            <select value={machineId} onChange={e => setMachineId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.machine_code})</option>)}
            </select>
          </Field>
          <Field label="الوردية">
            <select value={shift} onChange={e => setShift(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              <option value="MORNING">صباحية</option>
              <option value="EVENING">مسائية</option>
              <option value="NIGHT">ليلية</option>
            </select>
          </Field>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !woId || !batchId || !stageId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            فتح الوردية
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Create Batch Modal
// ============================================================

function CreateBatchModal({ workOrders, onClose, onCreated }: {
  workOrders: (WorkOrder & { model: ProductModel | null })[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [woId, setWoId] = useState('');
  const [qty, setQty] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWO = workOrders.find(w => w.id === woId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createProductionBatch(woId, parseFloat(qty));
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء دفعة إنتاج" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="أمر العمل">
          <select value={woId} onChange={e => setWoId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر أمر عمل</option>
            {workOrders.map(w => <option key={w.id} value={w.id}>{w.wo_number} — {w.model?.name}</option>)}
          </select>
        </Field>
        {selectedWO && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600">
            الكمية المخططة: {selectedWO.planned_quantity} {selectedWO.unit_of_measure}
          </div>
        )}
        <Field label="الكمية المخططة للدفعة">
          <input type="number" min="0.01" step="0.01" value={qty}
            onChange={e => setQty(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700">
          النظام يمنع الإفراط في الإنتاج: مجموع دفعات الأمر لا يمكن أن يتجاوز الكمية المعتمدة.
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !woId || !qty}>
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
// Shared components
// ============================================================

import { supabase } from '@/lib/supabase';

function StatBox({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 flex items-center gap-3">
      <Icon className={`w-5 h-5 ${color}`} />
      <div>
        <p className="text-xs font-medium text-slate-500">{label}</p>
        <p className="text-lg font-bold text-slate-800">{value}</p>
      </div>
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function SummaryStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}>
      <Icon className="w-4 h-4" />
      {children}
    </button>
  );
}

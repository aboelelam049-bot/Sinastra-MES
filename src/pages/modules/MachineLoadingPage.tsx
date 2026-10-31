import { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock, Plus, Loader2, AlertCircle, RefreshCw,
  Search, ArrowRight, Trash2, AlertTriangle, Clock,
  CheckCircle2, XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchAllLoadings, createMachineLoading, deleteMachineLoading,
  updateLoadingStatus, checkMachineLoadingConflict,
  fetchWorkOrders,
} from '@/lib/planningService';
import {
  fetchMachines, fetchWorkCenters,
} from '@/lib/machineService';
import {
  LOADING_STATUS_LABELS, LOADING_STATUS_COLORS,
  WO_STATUS_LABELS, WO_STATUS_COLORS,
} from '@/lib/statusLabels';
import type {
  MachineLoading, Machine, WorkCenter, WorkOrder,
  ProductModel, LoadingStatus,
} from '@/types';

type LoadingWithRelations = MachineLoading & {
  machine: Machine;
  work_center: WorkCenter | null;
  work_order: WorkOrder & { model: ProductModel | null };
};

const LOADING_STATUSES: LoadingStatus[] = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];
const SHIFTS = ['Morning', 'Evening', 'Night'];

export function MachineLoadingPage() {
  const [loadings, setLoadings] = useState<LoadingWithRelations[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [machineFilter, setMachineFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LoadingWithRelations | null>(null);
  const [statusTarget, setStatusTarget] = useState<{ loading: LoadingWithRelations; newStatus: LoadingStatus } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, macs, wcs] = await Promise.all([
        fetchAllLoadings(),
        fetchMachines(undefined, undefined, undefined, false),
        fetchWorkCenters(),
      ]);
      setLoadings(data);
      setMachines(macs.filter(m => m.is_active));
      setWorkCenters(wcs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, machineFilter, statusFilter]);

  let filtered = loadings;
  if (search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = filtered.filter(l =>
      l.work_order.wo_number.toLowerCase().includes(q) ||
      l.machine.name.toLowerCase().includes(q) ||
      (l.work_order.model?.name ?? '').toLowerCase().includes(q),
    );
  }
  if (machineFilter) filtered = filtered.filter(l => l.machine_id === machineFilter);
  if (statusFilter) filtered = filtered.filter(l => l.status === statusFilter);

  const pageCount = Math.max(1, Math.ceil(filtered.length / ITEM_PAGE_SIZE));
  const pageRows = filtered.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await deleteMachineLoading(removeTarget.id);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  async function handleStatusChange() {
    if (!statusTarget) return;
    try {
      await updateLoadingStatus(statusTarget.loading.id, statusTarget.newStatus);
      setStatusTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div>
      <PageHeader
        title="تحميل الماكينات"
        subtitle="Machine Loading — تخصيص أوامر العمل للماكينات مع كشف التعارضات"
        action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> تحميل جديد</Button>}
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
            placeholder="بحث برقم الأمر أو الماكينة…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={machineFilter} onChange={e => setMachineFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الماكينات</option>
          {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الحالات</option>
          {LOADING_STATUSES.map(s => <option key={s} value={s}>{LOADING_STATUS_LABELS[s]}</option>)}
        </select>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : pageRows.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<CalendarClock className="w-7 h-7" />} title="لا توجد تحميلات"
            description="خصّص أمر عمل لماكينة مع تحديد الكمية والتاريخ والوردة. يتم كشف التعارضات في المواعيد تلقائياً."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> تحميل جديد</Button>} />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">أمر العمل</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الماكينة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">مركز العمل</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">التاريخ</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">الوردة/الوقت</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(l => (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs font-medium text-slate-700" dir="ltr">{l.work_order.wo_number}</div>
                      <div className="text-xs text-slate-400">{l.work_order.model?.name ?? '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">{l.machine.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{l.work_center?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">{l.planned_quantity}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{l.planned_date}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">
                      {l.shift ?? '—'} {l.planned_start_time && `(${l.planned_start_time}-${l.planned_finish_time})`}
                    </td>
                    <td className="px-4 py-3"><Badge color={LOADING_STATUS_COLORS[l.status]} variant="dot">{LOADING_STATUS_LABELS[l.status]}</Badge></td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {l.status === 'PLANNED' && (
                          <button onClick={() => setStatusTarget({ loading: l, newStatus: 'ACTIVE' })}
                            className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="تفعيل">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {(l.status === 'PLANNED' || l.status === 'ACTIVE') && (
                          <button onClick={() => setStatusTarget({ loading: l, newStatus: 'COMPLETED' })}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="إكمال">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                        )}
                        {l.status !== 'CANCELLED' && l.status !== 'COMPLETED' && (
                          <button onClick={() => setStatusTarget({ loading: l, newStatus: 'CANCELLED' })}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-500" title="إلغاء">
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button onClick={() => setRemoveTarget(l)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-400" title="حذف">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />
        </>
      )}

      {showCreate && (
        <CreateLoadingModal
          machines={machines}
          workCenters={workCenters}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!removeTarget}
        title="حذف التحميل"
        message={`سيتم حذف تحميل أمر العمل «${removeTarget?.work_order.wo_number ?? ''}» من الماكينة.`}
        confirmLabel="حذف" variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        open={!!statusTarget}
        title="تغيير حالة التحميل"
        message={`سيتم تغيير حالة التحميل إلى «${statusTarget ? LOADING_STATUS_LABELS[statusTarget.newStatus] : ''}».`}
        confirmLabel="تأكيد"
        variant={statusTarget?.newStatus === 'CANCELLED' ? 'danger' : 'default'}
        onConfirm={handleStatusChange}
        onCancel={() => setStatusTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Create Loading Modal
// ============================================================

function CreateLoadingModal({ machines, workCenters, onClose, onCreated }: {
  machines: Machine[];
  workCenters: WorkCenter[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [workOrders, setWorkOrders] = useState<(WorkOrder & { model: ProductModel | null })[]>([]);
  const [woId, setWoId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [wcId, setWcId] = useState('');
  const [qty, setQty] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [shift, setShift] = useState('');
  const [startTime, setStartTime] = useState('');
  const [finishTime, setFinishTime] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const wos = await fetchWorkOrders();
        // Only show WOs that can be loaded (released or in progress, not cancelled/completed)
        setWorkOrders(wos.filter(w =>
          w.status !== 'CANCELLED' && w.status !== 'COMPLETED' && w.status !== 'DRAFT',
        ));
      } catch { /* ignore */ }
      finally { setFetching(false); }
    })();
  }, []);

  // Check conflict when machine/date/time changes
  useEffect(() => {
    if (!machineId || !date) { setConflict(null); return; }
    (async () => {
      setChecking(true);
      try {
        const hasConflict = await checkMachineLoadingConflict({
          machine_id: machineId,
          planned_date: date,
          start_time: startTime || undefined,
          finish_time: finishTime || undefined,
        });
        setConflict(hasConflict);
      } catch {
        setConflict(null);
      } finally {
        setChecking(false);
      }
    })();
  }, [machineId, date, startTime, finishTime]);

  const selectedMachine = machines.find(m => m.id === machineId);
  const filteredWCs = workCenters.filter(wc => !selectedMachine?.department_id || wc.department_id === selectedMachine.department_id);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (conflict === true) {
      setError('يوجد تعارض في المواعيد على هذه الماكينة. اختر وقتاً أو تاريخاً آخر.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createMachineLoading({
        work_order_id: woId,
        machine_id: machineId,
        work_center_id: wcId || undefined,
        planned_quantity: parseFloat(qty),
        planned_date: date,
        shift: shift || undefined,
        planned_start_time: startTime || undefined,
        planned_finish_time: finishTime || undefined,
        notes: notes || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تحميل أمر عمل على ماكينة" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="أمر العمل">
          {fetching ? (
            <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> جارٍ التحميل…</div>
          ) : (
            <select value={woId} onChange={e => {
              setWoId(e.target.value);
              const wo = workOrders.find(w => w.id === e.target.value);
              if (wo) setQty(String(wo.planned_quantity));
            }} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">اختر أمر عمل</option>
              {workOrders.map(w => (
                <option key={w.id} value={w.id}>{w.wo_number} — {w.model?.name ?? '—'} ({w.planned_quantity})</option>
              ))}
            </select>
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الماكينة">
            <select value={machineId} onChange={e => { setMachineId(e.target.value); setWcId(''); }} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">اختر ماكينة</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.machine_code})</option>)}
            </select>
          </Field>
          <Field label="مركز العمل" hint="اختياري">
            <select value={wcId} onChange={e => setWcId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— بدون —</option>
              {filteredWCs.map(wc => <option key={wc.id} value={wc.id}>{wc.name}</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الكمية المخططة">
            <input type="number" min="0.01" step="0.01" value={qty} onChange={e => setQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="التاريخ">
            <input type="date" value={date} onChange={e => setDate(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="الوردة" hint="اختياري">
            <select value={shift} onChange={e => setShift(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              {SHIFTS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="وقت البداية">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="وقت النهاية">
            <input type="time" value={finishTime} onChange={e => setFinishTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>

        {/* Conflict indicator */}
        {machineId && date && (
          <div className={`rounded-lg px-3 py-2.5 text-sm flex items-center gap-2 ${
            checking ? 'bg-slate-50 text-slate-500' :
            conflict === true ? 'bg-red-50 text-red-700 border border-red-100' :
            conflict === false ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
            'bg-slate-50 text-slate-500'
          }`}>
            {checking ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> جارٍ فحص التعارضات…</>
            ) : conflict === true ? (
              <><AlertTriangle className="w-4 h-4 shrink-0" /> يوجد تعارض في المواعيد على هذه الماكينة في هذا التاريخ</>
            ) : conflict === false ? (
              <><CheckCircle2 className="w-4 h-4 shrink-0" /> لا توجد تعارضات — الميعاد متاح</>
            ) : (
              <><Clock className="w-4 h-4 shrink-0" /> اختر ماكينة وتاريخاً لفحص التعارضات</>
            )}
          </div>
        )}

        <Field label="ملاحظات">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !woId || !machineId || !qty || conflict === true}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            تحميل
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

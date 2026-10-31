import { useState, useEffect, useCallback } from 'react';
import {
  PlayCircle, Plus, Loader2, AlertCircle, RefreshCw, Search,
  ArrowRight, Trash2, Package, Clock,
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
import {
  fetchConsumptions, addConsumption, deleteConsumption,
  type ConsumptionWithRelations,
} from '@/lib/productionService';
import type {
  WorkOrder, ProductModel, ItemMaster, WorkCenter, Machine,
} from '@/types';
import { WO_STATUS_LABELS, WO_STATUS_COLORS } from '@/lib/statusLabels';

type WOWithModel = WorkOrder & { model: ProductModel | null };

const EXECUTABLE_STATUSES = ['RELEASED', 'IN_PROGRESS'];

export function ProductionExecutionPage() {
  const [workOrders, setWorkOrders] = useState<WOWithModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [detailTarget, setDetailTarget] = useState<WOWithModel | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchWorkOrders(search.trim() || undefined, statusFilter || undefined);
      setWorkOrders(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const filtered = statusFilter
    ? workOrders.filter(w => w.status === statusFilter)
    : workOrders.filter(w => EXECUTABLE_STATUSES.includes(w.status));
  const pageCount = Math.max(1, Math.ceil(filtered.length / ITEM_PAGE_SIZE));
  const pageRows = filtered.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  if (detailTarget) {
    return (
      <ProductionExecutionDetail
        wo={detailTarget}
        onBack={() => { setDetailTarget(null); load(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="تنفيذ الإنتاج"
        subtitle="Production Execution — تسجيل الإنتاج الفعلي واستهلاك المواد"
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث برقم أمر العمل…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">أوامر قابلة للتنفيذ</option>
          <option value="RELEASED">Released</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="ON_HOLD">On Hold</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
        <Button variant="secondary" onClick={load}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<PlayCircle className="w-7 h-7" />}
            title="لا توجد أوامر عمل للتنفيذ"
            description="أوامر العمل المُعتمدة (Released) أو قيد التنفيذ (In Progress) ستظهر هنا لتسجيل الإنتاج الفعلي واستهلاك المواد."
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">رقم الأمر</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الموديل</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الكمية المخططة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">الكمية الفعلية</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(wo => (
                  <tr
                    key={wo.id}
                    className="hover:bg-slate-50 cursor-pointer transition-colors"
                    onClick={() => setDetailTarget(wo)}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{wo.wo_number}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{wo.model?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 hidden sm:table-cell">{wo.planned_quantity} {wo.unit_of_measure ?? ''}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 hidden md:table-cell">{wo.actual_quantity} {wo.unit_of_measure ?? ''}</td>
                    <td className="px-4 py-3">
                      <Badge color={WO_STATUS_COLORS[wo.status]} variant="dot">
                        {WO_STATUS_LABELS[wo.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <ArrowRight className="w-4 h-4 text-slate-300" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={filtered.length} onChange={setPage} />
        </>
      )}
    </div>
  );
}

// ============================================================
// Production Execution Detail — consumption recording
// ============================================================

function ProductionExecutionDetail({ wo, onBack }: { wo: WOWithModel; onBack: () => void }) {
  const [consumptions, setConsumptions] = useState<ConsumptionWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ConsumptionWithRelations | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConsumptions(wo.id);
      setConsumptions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [wo.id]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await deleteConsumption(removeTarget.id);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  const totalConsumed = consumptions.reduce((s, c) => s + c.consumed_qty, 0);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader
          title={wo.wo_number}
          subtitle={wo.model?.name ?? '—'}
        />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBox label="الكمية المخططة" value={`${wo.planned_quantity} ${wo.unit_of_measure ?? ''}`} />
        <SummaryBox label="الكمية الفعلية" value={`${wo.actual_quantity} ${wo.unit_of_measure ?? ''}`} />
        <SummaryBox label="إجمالي الاستهلاك" value={`${totalConsumed}`} />
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
          <p className="text-xs font-medium text-slate-500 mb-0.5">الحالة</p>
          <Badge color={WO_STATUS_COLORS[wo.status]} variant="dot">
            {WO_STATUS_LABELS[wo.status]}
          </Badge>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
        <p>الكمية المخططة تختلف عن الكمية الفعلية. سجّل استهلاك المواد الفعلي لكل أمر تشغيل — الاستهلاك يختلف من موديل لآخر.</p>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Consumption records */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Package className="w-4 h-4 text-slate-400" /> سجل استهلاك المواد
          </h4>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="w-3.5 h-3.5" /> تسجيل استهلاك
          </Button>
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          </div>
        ) : consumptions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">
            لا يوجد استهلاك مسجل لهذا الأمر بعد. اضغط «تسجيل استهلاك» لإضافة المواد المستهلكة.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الصنف</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">المركز/الماكينة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية المستهلكة</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">المنتج</th>
                  <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">التاريخ</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {consumptions.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-slate-700">{c.item?.name ?? '—'}</div>
                      <div className="font-mono text-xs text-slate-400" dir="ltr">{c.item_code}</div>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 hidden md:table-cell">
                      {c.work_center?.name ?? '—'}
                      {c.machine ? ` / ${c.machine.name}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-sm font-medium text-slate-700">
                      {c.consumed_qty} {c.unit_of_measure}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell">
                      {c.produced_qty != null ? `${c.produced_qty}` : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">
                      {c.consumption_date}
                    </td>
                    <td className="px-4 py-2.5">
                      <button
                        onClick={() => setRemoveTarget(c)}
                        className="p-1 rounded text-red-400 hover:bg-red-50"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && (
        <AddConsumptionModal
          wo={wo}
          existingItemIds={consumptions.map(c => c.item_id)}
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!removeTarget}
        title="حذف سجل الاستهلاك"
        message={`سيتم حذف سجل استهلاك «${removeTarget?.item?.name ?? ''}» (${removeTarget?.consumed_qty} ${removeTarget?.unit_of_measure}).`}
        confirmLabel="حذف"
        variant="danger"
        onConfirm={handleRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Add Consumption Modal
// ============================================================

function AddConsumptionModal({ wo, existingItemIds, onClose, onAdded }: {
  wo: WOWithModel;
  existingItemIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [itemId, setItemId] = useState('');
  const [wcId, setWcId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [consumedQty, setConsumedQty] = useState('1');
  const [uom, setUom] = useState('PCS');
  const [producedQty, setProducedQty] = useState('');
  const [consumptionDate, setConsumptionDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [itemData, wcData, machineData] = await Promise.all([
          fetchItems(itemSearch.trim() || undefined, undefined, true),
          fetchWorkCenters(),
          fetchMachines(undefined, undefined, undefined, true),
        ]);
        setItems(itemData.filter(i => !existingItemIds.includes(i.id)));
        setWorkCenters(wcData);
        setMachines(machineData);
      } catch { /* ignore */ }
    })();
  }, [itemSearch, existingItemIds]);

  const filteredMachines = wcId
    ? machines.filter(m => m.work_center_id === wcId)
    : machines;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error('اختر صنف');
      await addConsumption({
        work_order_id: wo.id,
        work_center_id: wcId || undefined,
        machine_id: machineId || undefined,
        item_id: item.id,
        item_code: item.item_code,
        consumed_qty: parseFloat(consumedQty),
        unit_of_measure: uom,
        produced_qty: producedQty ? parseFloat(producedQty) : undefined,
        consumption_date: consumptionDate,
        notes: notes.trim() || undefined,
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تسجيل استهلاك مادة" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm text-slate-600 flex items-center gap-2">
          <Clock className="w-4 h-4 text-slate-400" />
          أمر العمل: <span className="font-mono font-medium" dir="ltr">{wo.wo_number}</span>
          {wo.model && <span>— {wo.model.name}</span>}
        </div>

        <Field label="الصنف المستهلك">
          <input
            value={itemSearch}
            onChange={e => setItemSearch(e.target.value)}
            placeholder="بحث عن صنف…"
            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 mb-2"
          />
          <select
            value={itemId}
            onChange={e => {
              setItemId(e.target.value);
              const it = items.find(i => i.id === e.target.value);
              if (it) setUom(it.unit_of_measure);
            }}
            required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">اختر صنف</option>
            {items.map(i => (
              <option key={i.id} value={i.id}>{i.name} ({i.item_code})</option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="مركز العمل" hint="اختياري">
            <select
              value={wcId}
              onChange={e => { setWcId(e.target.value); setMachineId(''); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">—</option>
              {workCenters.map(wc => (
                <option key={wc.id} value={wc.id}>{wc.name} ({wc.work_center_code})</option>
              ))}
            </select>
          </Field>
          <Field label="الماكينة" hint="اختياري">
            <select
              value={machineId}
              onChange={e => setMachineId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">—</option>
              {filteredMachines.map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.machine_code})</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Field label="الكمية المستهلكة">
            <input
              type="number" min="0.01" step="0.01" value={consumedQty}
              onChange={e => setConsumedQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </Field>
          <Field label="الوحدة">
            <input
              value={uom}
              onChange={e => setUom(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </Field>
          <Field label="الكمية المنتجة" hint="اختياري">
            <input
              type="number" min="0" step="0.01" value={producedQty}
              onChange={e => setProducedQty(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="تاريخ الاستهلاك">
            <input
              type="date" value={consumptionDate}
              onChange={e => setConsumptionDate(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </Field>
          <Field label="ملاحظات">
            <input
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </Field>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !itemId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            تسجيل الاستهلاك
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

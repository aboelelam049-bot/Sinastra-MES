import { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, Package, Plus, Loader2, ArrowRight,
  Layers, Boxes, AlertCircle, RefreshCw, Scissors,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import {
  fetchParentBatches, fetchPalletsByBatch, createParentBatch,
  createPallet, updateBatchQuantity, splitPallet,
  fetchWorkOrders, fetchStages, fetchMachines,
} from '@/lib/traceabilityService';
import {
  BATCH_STATUS_LABELS, BATCH_STATUS_COLORS,
  PALLET_STATUS_LABELS, PALLET_STATUS_COLORS,
} from '@/lib/statusLabels';
import type { ParentBatch, WorkOrder, Product, ProductionStage, Machine, Pallet, ProductionRoute } from '@/types';

type BatchWithRelations = ParentBatch & { work_order: WorkOrder; product: Product };

export function ParentBatchPage() {
  const [batches, setBatches] = useState<BatchWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedBatch, setSelectedBatch] = useState<BatchWithRelations | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchParentBatches();
      setBatches(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (selectedBatch) {
    return (
      <BatchDetailPage
        batch={selectedBatch}
        onBack={() => { setSelectedBatch(null); load(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="الدفعات الأم"
        subtitle="Parent Batches — الدفعات الرئيسية المرتبطة بأوامر العمل"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            دفعة جديدة
          </Button>
        }
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<Layers className="w-7 h-7" />}
            title="لا توجد دفعات أم"
            description="لم يتم إنشاء أي دفعة أم بعد. أنشئ دفعة جديدة مرتبطة بأمر عمل لبدء تتبع الإنتاج."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> دفعة جديدة</Button>}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">رقم الدفعة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">أمر العمل</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">المنتج</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">المخطط</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">المتاح</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {batches.map((batch) => (
                <tr
                  key={batch.id}
                  className="hover:bg-slate-50 cursor-pointer transition-colors"
                  onClick={() => setSelectedBatch(batch)}
                >
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{batch.batch_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">{batch.work_order.wo_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{batch.product.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{batch.planned_quantity}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{batch.available_quantity}</td>
                  <td className="px-4 py-3">
                    <Badge color={BATCH_STATUS_COLORS[batch.status]}>{BATCH_STATUS_LABELS[batch.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <ArrowRight className="w-4 h-4 text-slate-300" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateBatchModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

// ============================================================
// Create Batch Modal
// ============================================================

function CreateBatchModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [workOrders, setWorkOrders] = useState<(WorkOrder & { product: Product; route: ProductionRoute })[]>([]);
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [selectedWO, setSelectedWO] = useState('');
  const [plannedQty, setPlannedQty] = useState('');
  const [selectedStage, setSelectedStage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [wos, sts] = await Promise.all([fetchWorkOrders(), fetchStages()]);
        setWorkOrders(wos.filter(w => w.status !== 'CANCELLED'));
        setStages(sts);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'خطأ في تحميل البيانات');
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createParentBatch(selectedWO, parseFloat(plannedQty), selectedStage || undefined);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">إنشاء دفعة أم جديدة</h3>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">أمر العمل</label>
            <select
              value={selectedWO}
              onChange={e => setSelectedWO(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">اختر أمر عمل</option>
              {workOrders.map(wo => (
                <option key={wo.id} value={wo.id}>
                  {wo.wo_number} — {wo.product.name} ({wo.planned_quantity})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">الكمية المخططة</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={plannedQty}
              onChange={e => setPlannedQty(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">المرحلة الحالية (اختياري)</label>
            <select
              value={selectedStage}
              onChange={e => setSelectedStage(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">— بدون —</option>
              {stages.map(s => (
                <option key={s.id} value={s.id}>{s.name} ({s.stage_code})</option>
              ))}
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={loading || !selectedWO || !plannedQty}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              إنشاء
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Batch Detail Page
// ============================================================

function BatchDetailPage({ batch, onBack }: { batch: BatchWithRelations; onBack: () => void }) {
  const [pallets, setPallets] = useState<(Pallet & { stage: ProductionStage; machine: Machine | null })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddPallet, setShowAddPallet] = useState(false);
  const [showUpdateQty, setShowUpdateQty] = useState(false);
  const [showSplit, setShowSplit] = useState<Pallet | null>(null);
  const [actualQty, setActualQty] = useState('');

  const loadPallets = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchPalletsByBatch(batch.id);
      setPallets(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    } finally {
      setLoading(false);
    }
  }, [batch.id]);

  useEffect(() => { loadPallets(); }, [loadPallets]);

  const allocatedQty = pallets
    .filter(p => p.status !== 'CANCELLED' && p.status !== 'SPLIT')
    .reduce((sum, p) => sum + parseFloat(String(p.quantity)), 0);

  async function handleUpdateQty(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateBatchQuantity(batch.id, parseFloat(actualQty));
      setShowUpdateQty(false);
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطأ');
    }
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader title={`دفعة ${batch.batch_number}`} subtitle={batch.product.name} />
      </div>

      {/* Batch summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBox label="المخطط" value={String(batch.planned_quantity)} />
        <SummaryBox label="الفعلي" value={String(batch.actual_quantity)} />
        <SummaryBox label="المتاح للتخصيص" value={String(batch.available_quantity)} />
        <SummaryBox label="المخصص للبليتات" value={String(allocatedQty)} />
      </div>

      {/* Actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => { setActualQty(String(batch.actual_quantity)); setShowUpdateQty(true); }}>
          <RefreshCw className="w-3.5 h-3.5" /> تحديث الكمية الفعلية
        </Button>
        <Button size="sm" onClick={() => setShowAddPallet(true)} disabled={batch.available_quantity <= 0}>
          <Plus className="w-3.5 h-3.5" /> بليت جديد
        </Button>
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Pallets list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : pallets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<Boxes className="w-7 h-7" />}
            title="لا توجد بليتات"
            description="أنشئ بليتاً جديداً لتخصيص كمية من هذه الدفعة. كل بليت له رقم فريد وباركود مستقل."
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">رقم البليت</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">المرحلة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {pallets.map(pallet => (
                <tr key={pallet.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{pallet.pallet_number}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell">{pallet.stage.name}</td>
                  <td className="px-4 py-3 text-xs text-slate-600">{pallet.quantity}</td>
                  <td className="px-4 py-3">
                    <Badge color={PALLET_STATUS_COLORS[pallet.status]}>{PALLET_STATUS_LABELS[pallet.status]}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    {pallet.status !== 'CANCELLED' && pallet.status !== 'SPLIT' && pallet.status !== 'WAREHOUSE_RECEIVED' && (
                      <button
                        onClick={() => setShowSplit(pallet)}
                        className="text-xs text-purple-600 hover:text-purple-700 flex items-center gap-1"
                      >
                        <Scissors className="w-3.5 h-3.5" /> تقسيم
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals */}
      {showAddPallet && (
        <AddPalletModal
          batch={batch}
          availableQty={batch.available_quantity - allocatedQty}
          onClose={() => setShowAddPallet(false)}
          onCreated={() => { setShowAddPallet(false); loadPallets(); }}
        />
      )}

      {showUpdateQty && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={() => setShowUpdateQty(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-base font-semibold text-slate-800">تحديث الكمية الفعلية</h3>
            </div>
            <form onSubmit={handleUpdateQty} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1.5">الكمية الفعلية المنتجة</label>
                <input
                  type="number" step="0.01" min="0"
                  value={actualQty}
                  onChange={e => setActualQty(e.target.value)}
                  required
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  سيتم تحديث الكمية المتاحة للتخصيص للبليتات
                </p>
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={!actualQty}><RefreshCw className="w-4 h-4" /> تحديث</Button>
                <Button type="button" variant="secondary" onClick={() => setShowUpdateQty(false)}>إلغاء</Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showSplit && (
        <SplitPalletModal
          pallet={showSplit}
          onClose={() => setShowSplit(null)}
          onSplit={() => { setShowSplit(null); loadPallets(); }}
        />
      )}
    </div>
  );
}

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border border-slate-200 px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-lg font-bold text-slate-700 mt-1">{value}</p>
    </div>
  );
}

// ============================================================
// Add Pallet Modal
// ============================================================

function AddPalletModal({
  batch, availableQty, onClose, onCreated,
}: {
  batch: BatchWithRelations;
  availableQty: number;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [stages, setStages] = useState<ProductionStage[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [stageId, setStageId] = useState('');
  const [qty, setQty] = useState('');
  const [machineId, setMachineId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [sts, macs] = await Promise.all([fetchStages(), fetchMachines()]);
        setStages(sts);
        setMachines(macs);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'خطأ');
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseFloat(qty);
    if (q > availableQty) {
      setError(`الكمية المتاحة هي ${availableQty} فقط`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await createPallet(batch.id, stageId, q, machineId || undefined);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">إنشاء بليت جديد</h3>
          <p className="text-xs text-slate-500 mt-0.5">الدفعة: {batch.batch_number}</p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">المرحلة</label>
            <select
              value={stageId} onChange={e => setStageId(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">اختر مرحلة</option>
              {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">
              الكمية (متاح: {availableQty})
            </label>
            <input
              type="number" step="0.01" min="0.01" max={availableQty}
              value={qty} onChange={e => setQty(e.target.value)}
              required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1.5">الماكينة (اختياري)</label>
            <select
              value={machineId} onChange={e => setMachineId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">— بدون —</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !stageId || !qty}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              إنشاء
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================
// Split Pallet Modal
// ============================================================

function SplitPalletModal({
  pallet, onClose, onSplit,
}: {
  pallet: Pallet;
  onClose: () => void;
  onSplit: () => void;
}) {
  const [parts, setParts] = useState<string[]>(['', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sourceQty = parseFloat(String(pallet.quantity));
  const sum = parts.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const valid = sum === sourceQty && parts.every(v => parseFloat(v) > 0);

  function updatePart(idx: number, val: string) {
    const next = [...parts];
    next[idx] = val;
    setParts(next);
  }

  function addPart() {
    setParts([...parts, '']);
  }

  function removePart(idx: number) {
    if (parts.length <= 2) return;
    setParts(parts.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setLoading(true);
    setError(null);
    try {
      await splitPallet(pallet.id, parts.map(v => parseFloat(v)));
      onSplit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">تقسيم البليت</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            البليت: <span dir="ltr" className="font-mono">{pallet.pallet_number}</span> — الكمية: {pallet.quantity}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="space-y-2">
            {parts.map((part, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <input
                  type="number" step="0.01" min="0.01"
                  value={part}
                  onChange={e => updatePart(idx, e.target.value)}
                  placeholder={`الكمية ${idx + 1}`}
                  required
                  className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                {parts.length > 2 && (
                  <button type="button" onClick={() => removePart(idx)} className="text-red-500 hover:text-red-600 p-1">
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>

          <button type="button" onClick={addPart} className="text-xs text-amber-600 hover:text-amber-700 flex items-center gap-1">
            <Plus className="w-3 h-3" /> إضافة قسم
          </button>

          <div className="text-xs flex items-center justify-between">
            <span className="text-slate-500">المجموع: {sum}</span>
            {sum === sourceQty ? (
              <span className="text-emerald-600 flex items-center gap-1"><ClipboardList className="w-3 h-3" /> يطابق الكمية</span>
            ) : (
              <span className="text-red-500">يجب أن يساوي {sourceQty}</span>
            )}
          </div>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading || !valid}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Scissors className="w-4 h-4" />}
              تقسيم
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
          </div>
        </form>
      </div>
    </div>
  );
}

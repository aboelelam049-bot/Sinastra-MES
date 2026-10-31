import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ListTree, Plus, Loader2, AlertCircle, RefreshCw,
  Search, ArrowRight, Trash2, Zap, Eye, Table, List,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field } from './ProductFamiliesPage';
import {
  fetchBOMHeaders, fetchBOMLines, fetchBOMHeader,
  createBOMWithLines, activateBOMVersion, deleteBOMLine, addBOMLine,
  fetchProductModels, fetchItems, fetchBOMMatrix, fetchProductFamilies,
} from '@/lib/masterDataService';
import type {
  BOMHeader, BOMLine, ProductModel, ItemMaster, ProductFamily,
  BOMLineInput, BOMStatus, KitType,
} from '@/types';

type BOMWithModel = BOMHeader & { model: ProductModel & { family: { name: string; family_code: string } } };
type LineWithItem = BOMLine & { item: ItemMaster };
type MatrixRow = ProductModel & {
  family: ProductFamily;
  bom: (BOMHeader & { bom_lines: (BOMLine & { item: ItemMaster })[] }) | null;
};

const BOM_STATUS_COLORS: Record<BOMStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  SUPERSEDED: 'bg-slate-100 text-slate-700 border-slate-200',
};
const BOM_STATUS_LABELS: Record<BOMStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  SUPERSEDED: 'Superseded',
};

export function BOMPage() {
  const [boms, setBoms] = useState<BOMWithModel[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [activateTarget, setActivateTarget] = useState<BOMWithModel | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'matrix'>('matrix');
  const [matrixData, setMatrixData] = useState<MatrixRow[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (viewMode === 'matrix') {
        const [data, mdls, fams] = await Promise.all([
          fetchBOMMatrix(),
          fetchProductModels(),
          fetchProductFamilies(),
        ]);
        let filtered = data;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          filtered = filtered.filter(m =>
            m.model_code.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q) ||
            (m.family?.name ?? '').toLowerCase().includes(q)
          );
        }
        if (modelFilter) filtered = filtered.filter(m => m.family_id === modelFilter);
        setMatrixData(filtered);
        setModels(mdls);
        setFamilies(fams);
      } else {
        const [data, mdls, fams] = await Promise.all([
          fetchBOMHeaders(),
          fetchProductModels(),
          fetchProductFamilies(),
        ]);
        let filtered = data;
        if (search.trim()) {
          const q = search.trim().toLowerCase();
          filtered = filtered.filter(b =>
            b.version.toLowerCase().includes(q) ||
            b.model?.name.toLowerCase().includes(q) ||
            b.model?.model_code.toLowerCase().includes(q)
          );
        }
        if (modelFilter) filtered = filtered.filter(b => b.product_model_id === modelFilter);
        setBoms(filtered);
        setModels(mdls);
        setFamilies(fams);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, modelFilter, viewMode]);

  useEffect(() => { load(); }, [load]);

  async function handleActivate() {
    if (!activateTarget) return;
    try {
      await activateBOMVersion(activateTarget.id);
      setActivateTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (detailId) {
    return (
      <BOMDetail
        bomId={detailId}
        onBack={() => { setDetailId(null); load(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="قوائم المواد"
        subtitle="Bill of Materials — BOM بإصدارات ومراحل اعتماد"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            BOM جديد
          </Button>
        }
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
            placeholder={viewMode === 'matrix' ? 'بحث برمز الموديل أو الاسم…' : 'بحث برمز الموديل أو الإصدار…'}
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={modelFilter}
          onChange={e => setModelFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">كل العائلات</option>
          {families.map(f => (
            <option key={f.id} value={f.id}>{f.name} ({f.family_code})</option>
          ))}
        </select>
        <div className="flex rounded-lg border border-slate-300 overflow-hidden">
          <button
            onClick={() => setViewMode('matrix')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
              viewMode === 'matrix' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title="عرض مصفوفة كل الموديلات"
          >
            <Table className="w-4 h-4" /> مصفوفة
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-2 text-sm flex items-center gap-1.5 transition-colors ${
              viewMode === 'list' ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title="عرض قائمة الإصدارات"
          >
            <List className="w-4 h-4" /> إصدارات
          </button>
        </div>
        <Button variant="secondary" onClick={load}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : viewMode === 'matrix' ? (
        <BOMMatrixView rows={matrixData} onModelClick={(bomId) => setDetailId(bomId)} />
      ) : boms.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<ListTree className="w-7 h-7" />}
            title="لا توجد قوائم مواد"
            description="أنشئ أول قائمة مواد (BOM) لموديل منتج. يمكن إضافة بنود الأصناف وتحديد الكميات."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> BOM جديد</Button>}
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الموديل</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الإصدار</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">العائلة</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">تاريخ السريان</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {boms.map(b => (
                <tr key={b.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailId(b.id)}>
                  <td className="px-4 py-3 text-sm text-slate-700">
                    <span className="font-medium">{b.model?.name}</span>
                    <span className="text-xs text-slate-400 mr-2" dir="ltr">{b.model?.model_code}</span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{b.version}</td>
                  <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{b.model?.family?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">
                    {b.effective_date ? new Date(b.effective_date).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={BOM_STATUS_COLORS[b.status]} variant="dot">{BOM_STATUS_LABELS[b.status]}</Badge>
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setDetailId(b.id)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تفاصيل">
                        <Eye className="w-4 h-4" />
                      </button>
                      {b.status === 'DRAFT' && (
                        <button onClick={() => setActivateTarget(b)} className="p-1.5 rounded-lg hover:bg-amber-50 text-amber-600" title="اعتماد الإصدار">
                          <Zap className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && (
        <CreateBOMModal
          models={models}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => { setShowCreate(false); setDetailId(id); }}
        />
      )}
      <ConfirmDialog
        open={!!activateTarget}
        title="اعتماد إصدار BOM"
        message={
          activateTarget
            ? `سيتم اعتماد إصدار «${activateTarget.version}» لموديل «${activateTarget.model?.name}». أي إصدار نشط سابق سيُ mark كـ Superseded مع الحفاظ على السجل التاريخي.`
            : ''
        }
        confirmLabel="اعتماد"
        onConfirm={handleActivate}
        onCancel={() => setActivateTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Create BOM Modal (with multi-line picker)
// ============================================================

function CreateBOMModal({
  models, onClose, onCreated,
}: {
  models: ProductModel[];
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [modelId, setModelId] = useState('');
  const [version, setVersion] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [itemSearch, setItemSearch] = useState('');
  const [lines, setLines] = useState<BOMLineInput[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchItems(itemSearch.trim() || undefined, undefined, true);
        setItems(data);
      } catch { /* ignore */ }
    })();
  }, [itemSearch]);

  function addLine(item: ItemMaster) {
    if (lines.some(l => l.item_id === item.id)) return;
    setLines(prev => [...prev, {
      item_id: item.id,
      required_qty: 1,
      unit_of_measure: item.unit_of_measure,
      component_role: item.category,
      notes: null,
    }]);
  }

  function updateLine(itemId: string, patch: Partial<BOMLineInput>) {
    setLines(prev => prev.map(l => l.item_id === itemId ? { ...l, ...patch } : l));
  }

  function removeLine(itemId: string) {
    setLines(prev => prev.filter(l => l.item_id !== itemId));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lines.length === 0) { setError('يجب إضافة بند واحد على الأقل'); return; }
    setLoading(true);
    setError(null);
    try {
      const id = await createBOMWithLines(
        modelId, version.trim(),
        effectiveDate || null,
        lines,
      );
      onCreated(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء قائمة مواد جديدة" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="الموديل">
            <select
              value={modelId} onChange={e => setModelId(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="">اختر الموديل</option>
              {models.filter(m => m.is_active).map(m => (
                <option key={m.id} value={m.id}>{m.name} ({m.model_code})</option>
              ))}
            </select>
          </Field>
          <Field label="الإصدار" hint="Version — فريد لكل موديل">
            <input
              value={version} onChange={e => setVersion(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="V1.0"
            />
          </Field>
        </div>
        <Field label="تاريخ السريان" hint="Effective Date — اختياري">
          <input
            type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </Field>

        {/* Lines section */}
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <div className="bg-slate-50 px-3 py-2 border-b border-slate-200">
            <h4 className="text-xs font-semibold text-slate-700">بنود BOM ({lines.length})</h4>
          </div>
          {lines.length > 0 && (
            <div className="divide-y divide-slate-50 max-h-48 overflow-y-auto">
              {lines.map(l => {
                const item = items.find(i => i.id === l.item_id);
                return (
                  <div key={l.item_id} className="flex items-center gap-2 px-3 py-2">
                    <span className="font-mono text-xs text-slate-600 flex-shrink-0" dir="ltr">
                      {item?.item_code ?? l.item_id.slice(0, 8)}
                    </span>
                    <input
                      type="number" min="0.01" step="0.01"
                      value={l.required_qty}
                      onChange={e => updateLine(l.item_id, { required_qty: parseFloat(e.target.value) })}
                      className="w-20 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <input
                      value={l.unit_of_measure}
                      onChange={e => updateLine(l.item_id, { unit_of_measure: e.target.value })}
                      className="w-16 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                      dir="ltr"
                    />
                    <input
                      value={l.component_role}
                      onChange={e => updateLine(l.item_id, { component_role: e.target.value })}
                      className="flex-1 px-2 py-1 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
                      placeholder="Component Role"
                      dir="ltr"
                    />
                    <button type="button" onClick={() => removeLine(l.item_id)}
                      className="p-1 rounded text-red-400 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {/* Item picker */}
          <div className="border-t border-slate-200 p-2">
            <input
              value={itemSearch}
              onChange={e => setItemSearch(e.target.value)}
              placeholder="بحث عن صنف لإضافته…"
              className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-amber-500 mb-2"
            />
            <div className="max-h-32 overflow-y-auto space-y-1">
              {items
                .filter(i => !lines.some(l => l.item_id === i.id))
                .slice(0, 8)
                .map(i => (
                  <button
                    key={i.id} type="button"
                    onClick={() => addLine(i)}
                    className="w-full text-right flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-amber-50 border border-transparent hover:border-amber-200"
                  >
                    <span className="text-slate-700">{i.name}</span>
                    <span className="font-mono text-slate-400" dir="ltr">{i.item_code}</span>
                  </button>
                ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !modelId || !version.trim() || lines.length === 0}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            إنشاء BOM
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// BOM Detail
// ============================================================

function BOMDetail({ bomId, onBack }: { bomId: string; onBack: () => void }) {
  const [bom, setBom] = useState<BOMWithModel | null>(null);
  const [lines, setLines] = useState<LineWithItem[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddLine, setShowAddLine] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<LineWithItem | null>(null);
  const [activateConfirm, setActivateConfirm] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [header, lns, its] = await Promise.all([
        fetchBOMHeader(bomId),
        fetchBOMLines(bomId),
        fetchItems(undefined, undefined, true),
      ]);
      setBom(header);
      setLines(lns);
      setItems(its);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [bomId]);

  useEffect(() => { load(); }, [load]);

  async function handleRemoveLine() {
    if (!removeTarget) return;
    try {
      await deleteBOMLine(removeTarget.id);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  async function handleActivate() {
    try {
      await activateBOMVersion(bomId);
      setActivateConfirm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
      </div>
    );
  }

  if (!bom) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
            <ArrowRight className="w-5 h-5 rotate-180" />
          </button>
          <span className="text-sm text-slate-500">BOM غير موجود</span>
        </div>
      </div>
    );
  }

  const canEdit = bom.status === 'DRAFT';

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader
          title={`${bom.model?.name} — ${bom.version}`}
          subtitle={`BOM ${bom.model?.model_code} · ${bom.model?.family?.name ?? ''}`}
        />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <SummaryBox label="الإصدار" value={bom.version} mono />
        <SummaryBox label="الحالة" value={BOM_STATUS_LABELS[bom.status]} />
        <SummaryBox label="تاريخ السريان" value={bom.effective_date ? new Date(bom.effective_date).toLocaleDateString('en-GB') : '—'} />
        <SummaryBox label="عدد البنود" value={String(lines.length)} />
      </div>

      {/* Lines table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">بنود القائمة</h4>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setShowAddLine(true)}>
              <Plus className="w-3.5 h-3.5" /> إضافة بند
            </Button>
          )}
        </div>
        {lines.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد بنود في هذه القائمة</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الصنف</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الكمية</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الوحدة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">الدور</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">ملاحظات</th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {lines.map(l => (
                <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-2.5">
                    <div className="text-sm text-slate-700">{l.item?.name ?? '—'}</div>
                    <div className="font-mono text-xs text-slate-400" dir="ltr">{l.item_code}</div>
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-slate-700">{l.required_qty}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{l.unit_of_measure}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden md:table-cell" dir="ltr">{l.component_role}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell">{l.notes ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => setRemoveTarget(l)}
                        className="p-1 rounded text-red-400 hover:bg-red-50">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Activate button for DRAFT */}
      {canEdit && (
        <div className="flex gap-2">
          <Button onClick={() => setActivateConfirm(true)}>
            <Zap className="w-4 h-4" /> اعتماد الإصدار
          </Button>
        </div>
      )}

      {showAddLine && (
        <AddLineModal
          items={items.filter(i => !lines.some(l => l.item_id === i.id))}
          onClose={() => setShowAddLine(false)}
          onAdded={() => { setShowAddLine(false); load(); }}
          bomHeaderId={bomId}
        />
      )}
      <ConfirmDialog
        open={!!removeTarget}
        title="حذف البند"
        message={`سيتم حذف صنف «${removeTarget?.item?.name ?? ''}» من القائمة.`}
        confirmLabel="حذف"
        variant="danger"
        onConfirm={handleRemoveLine}
        onCancel={() => setRemoveTarget(null)}
      />
      <ConfirmDialog
        open={activateConfirm}
        title="اعتماد إصدار BOM"
        message="سيتم اعتماد هذا الإصدار. الإصدار النشط السابق سيُ mark كـ Superseded مع الحفاظ على السجل التاريخي."
        confirmLabel="اعتماد"
        onConfirm={handleActivate}
        onCancel={() => setActivateConfirm(false)}
      />
    </div>
  );
}

// ============================================================
// Add Line Modal
// ============================================================

function AddLineModal({
  items, bomHeaderId, onClose, onAdded,
}: {
  items: ItemMaster[];
  bomHeaderId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [itemId, setItemId] = useState('');
  const [qty, setQty] = useState('1');
  const [uom, setUom] = useState('PCS');
  const [role, setRole] = useState('Length');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const item = items.find(i => i.id === itemId);
      if (!item) throw new Error('اختر صنف');
      await addBOMLine(
        bomHeaderId, itemId, item.item_code,
        parseFloat(qty), uom, role, notes.trim() || undefined,
      );
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة بند للقائمة" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="الصنف">
          <select
            value={itemId} onChange={e => {
              setItemId(e.target.value);
              const it = items.find(i => i.id === e.target.value);
              if (it) { setUom(it.unit_of_measure); setRole(it.category); }
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
          <Field label="الكمية">
            <input type="number" min="0.01" step="0.01" value={qty}
              onChange={e => setQty(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="الوحدة">
            <input value={uom} onChange={e => setUom(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="دور المكوّن" hint="Component Role">
          <input value={role} onChange={e => setRole(e.target.value)} required dir="ltr"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="ملاحظات">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !itemId}>
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
// Shared
// ============================================================

function SummaryBox({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}

// ============================================================
// BOM Matrix View — consolidated list of all models
// SINGLE: 1 Length, Main Front, Main Back
// DOUBLE: 2 Lengths, Main Front, Sub Front, Main Back, Sub Back
// ============================================================

const SINGLE_ROLES = ['LENGTH', 'FRONT', 'BACK'] as const;
const DOUBLE_ROLES = ['LENGTH', 'LENGTH', 'MAIN_FRONT', 'SECONDARY_FRONT', 'MAIN_BACK', 'SECONDARY_BACK'] as const;

const ROLE_LABELS: Record<string, string> = {
  LENGTH: 'طول',
  FRONT: 'وش رئيسي',
  BACK: 'ضهر رئيسي',
  MAIN_FRONT: 'وش رئيسي',
  SECONDARY_FRONT: 'وش فرعي',
  MAIN_BACK: 'ضهر رئيسي',
  SECONDARY_BACK: 'ضهر فرعي',
};

function getLineForRole(
  bom: MatrixRow['bom'],
  role: string,
  occurrence: number,
): (BOMLine & { item: ItemMaster }) | null {
  if (!bom) return null;
  const matching = bom.bom_lines.filter(l => l.component_role.toUpperCase() === role);
  return matching[occurrence] ?? null;
}

function BOMMatrixView({
  rows, onModelClick,
}: {
  rows: MatrixRow[];
  onModelClick: (bomId: string) => void;
}) {
  const grouped = useMemo(() => {
    const byFamily = new Map<string, MatrixRow[]>();
    for (const r of rows) {
      const key = r.family?.id ?? 'no-family';
      if (!byFamily.has(key)) byFamily.set(key, []);
      byFamily.get(key)!.push(r);
    }
    return Array.from(byFamily.entries()).map(([key, items]) => ({
      key,
      family: items[0]?.family,
      items,
    }));
  }, [rows]);

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={<Table className="w-7 h-7" />}
          title="لا توجد موديلات"
          description="لا توجد موديلات منتجات لعرضها في المصفوفة. أنشئ موديلات أولاً ثم أضف لها قوائم مواد."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(group => (
        <div key={group.key}>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-sm font-semibold text-slate-700">{group.family?.name ?? 'بدون عائلة'}</h3>
            {group.family && (
              <span className="font-mono text-xs text-slate-400" dir="ltr">{group.family.family_code}</span>
            )}
            <Badge color="bg-slate-100 text-slate-600 border-slate-200">{group.items.length}</Badge>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-3 py-2.5 font-medium text-slate-600 sticky right-0 bg-slate-50 z-10 min-w-[140px]">الموديل</th>
                  <th className="text-center px-2 py-2.5 font-medium text-slate-500">نوع</th>
                  {DOUBLE_ROLES.map((role, i) => {
                    const label = ROLE_LABELS[role] ?? role;
                    const isSecondLength = role === 'LENGTH' && i === 1;
                    return (
                      <th key={`${role}-${i}`} className="text-right px-3 py-2.5 font-medium text-slate-600 whitespace-nowrap min-w-[120px]">
                        {isSecondLength ? `${label} ٢` : label}
                      </th>
                    );
                  })}
                  <th className="text-center px-2 py-2.5 font-medium text-slate-500">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {group.items.map(m => {
                  const isDouble = m.kit_type === 'DOUBLE';
                  const roles = isDouble ? DOUBLE_ROLES : SINGLE_ROLES;
                  // For SINGLE, use MAIN_FRONT/MAIN_BACK fallbacks
                  const roleMap: Record<number, { role: string; occ: number }> = isDouble
                    ? { 0: { role: 'LENGTH', occ: 0 }, 1: { role: 'LENGTH', occ: 1 }, 2: { role: 'MAIN_FRONT', occ: 0 }, 3: { role: 'SECONDARY_FRONT', occ: 0 }, 4: { role: 'MAIN_BACK', occ: 0 }, 5: { role: 'SECONDARY_BACK', occ: 0 } }
                    : { 0: { role: 'LENGTH', occ: 0 }, 1: { role: 'FRONT', occ: 0 }, 2: { role: 'BACK', occ: 0 } };

                  return (
                    <tr
                      key={m.id}
                      className={`hover:bg-slate-50 transition-colors ${m.bom ? 'cursor-pointer' : 'opacity-60'}`}
                      onClick={() => m.bom && onModelClick(m.bom.id)}
                    >
                      <td className="px-3 py-2.5 sticky right-0 bg-white z-10 border-l border-slate-100">
                        <div className="text-sm text-slate-700 font-medium">{m.name}</div>
                        <div className="font-mono text-xs text-slate-400" dir="ltr">{m.model_code}</div>
                      </td>
                      <td className="px-2 py-2.5 text-center">
                        <Badge color={isDouble ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-blue-100 text-blue-700 border-blue-200'}>
                          {isDouble ? 'Double' : 'Single'}
                        </Badge>
                      </td>
                      {roles.map((_, i) => {
                        const { role, occ } = roleMap[i];
                        const line = getLineForRole(m.bom, role, occ);
                        return (
                          <td key={i} className="px-3 py-2.5">
                            {line ? (
                          <div>
                            <div className="text-xs text-slate-700 font-medium">{line.item?.name ?? '—'}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-[10px] text-slate-400" dir="ltr">{line.item_code}</span>
                              {line.required_qty !== 1 && (
                                <span className="text-[10px] text-amber-600 font-medium">×{line.required_qty}</span>
                              )}
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>
                        );
                      })}
                      <td className="px-2 py-2.5 text-center">
                        {m.bom ? (
                          <Badge color={BOM_STATUS_COLORS[m.bom.status]} variant="dot">
                            {BOM_STATUS_LABELS[m.bom.status]}
                          </Badge>
                        ) : (
                          <span className="text-xs text-slate-400">لا يوجد BOM</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

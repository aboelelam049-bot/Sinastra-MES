import { useState, useEffect, useCallback } from 'react';
import {
  Layers, Plus, Loader2, AlertCircle, RefreshCw,
  Search, Pencil, Power, ArrowUpDown, ArrowRight,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';

const BADGE_GREEN = 'bg-emerald-100 text-emerald-700 border-emerald-200';
const BADGE_SLATE = 'bg-slate-100 text-slate-700 border-slate-200';
const BADGE_AMBER = 'bg-amber-100 text-amber-700 border-amber-200';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchProductModels, createProductModel, updateProductModel, toggleProductModelActive,
  fetchProductFamilies,
} from '@/lib/masterDataService';
import type { ProductFamily, ProductModel, KitType } from '@/types';

type ModelWithFamily = ProductModel & { family: ProductFamily };
type SortField = 'model_code' | 'name' | 'created_at';
type SortDir = 'asc' | 'desc';

const KIT_TYPES: { value: KitType; label: string }[] = [
  { value: 'SINGLE', label: 'Single' },
  { value: 'DOUBLE', label: 'Double' },
  { value: 'CUSTOM', label: 'Custom' },
];

export function ProductModelsPage() {
  const [models, setModels] = useState<ModelWithFamily[]>([]);
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [familyFilter, setFamilyFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ModelWithFamily | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ModelWithFamily | null>(null);
  const [detailTarget, setDetailTarget] = useState<ModelWithFamily | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, fams] = await Promise.all([
        fetchProductModels(search.trim() || undefined, familyFilter || undefined),
        fetchProductFamilies(),
      ]);
      setModels(data);
      setFamilies(fams);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, familyFilter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, familyFilter, sortField, sortDir]);

  const sorted = [...models].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = String(a[sortField] ?? '');
    const bv = String(b[sortField] ?? '');
    return av.localeCompare(bv, 'ar') * dir;
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / ITEM_PAGE_SIZE));
  const pageRows = sorted.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  async function handleToggle() {
    if (!toggleTarget) return;
    try {
      await toggleProductModelActive(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (detailTarget) {
    return (
      <ModelDetail model={detailTarget} onBack={() => { setDetailTarget(null); load(); }} />
    );
  }

  return (
    <div>
      <PageHeader
        title="موديلات المنتجات"
        subtitle="Product Models — الموديلات التابعة لعائلات المنتجات"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            موديل جديد
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
            placeholder="بحث برمز الموديل أو الاسم…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={familyFilter}
          onChange={e => setFamilyFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">كل العائلات</option>
          {families.map(f => (
            <option key={f.id} value={f.id}>{f.name} ({f.family_code})</option>
          ))}
        </select>
        <Button variant="secondary" onClick={load}>
          <RefreshCw className="w-4 h-4" /> تحديث
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 text-amber-600 animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<Layers className="w-7 h-7" />}
            title="لا توجد موديلات منتجات"
            description="أنشئ أول موديل منتج تابع لإحدى العائلات."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> موديل جديد</Button>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('model_code')} active={sortField === 'model_code'} dir={sortDir}>رمز الموديل</Th>
                  <Th onClick={() => toggleSort('name')} active={sortField === 'name'} dir={sortDir}>الاسم</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">العائلة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">نوع الكيت</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الأبعاد (مم)</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailTarget(m)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{m.model_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{m.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{m.family?.name ?? '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <Badge color={BADGE_AMBER}>{m.kit_type}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">
                      {m.length_mm ?? '?'}×{m.width_mm ?? '?'}×{m.height_mm ?? '?'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge color={m.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                        {m.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setToggleTarget(m)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title={m.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={sorted.length} onChange={setPage} />
        </>
      )}

      {showCreate && (
        <ModelFormModal
          families={families}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
      {editTarget && (
        <ModelFormModal
          families={families}
          model={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'إلغاء تنشيط الموديل' : 'تنشيط الموديل'}
        message={
          toggleTarget?.is_active
            ? `سيتم إلغاء تنشيط موديل «${toggleTarget.name}». لن يمكن استخدامه في سجلات جديدة، لكن المراجع القديمة تبقى محفوظة.`
            : `سيتم إعادة تنشيط موديل «${toggleTarget?.name}».`
        }
        confirmLabel={toggleTarget?.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
        variant={toggleTarget?.is_active ? 'danger' : 'default'}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Form Modal
// ============================================================

function ModelFormModal({
  families, model, onClose, onSaved,
}: {
  families: ProductFamily[];
  model?: ModelWithFamily;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(model?.model_code ?? '');
  const [name, setName] = useState(model?.name ?? '');
  const [familyId, setFamilyId] = useState(model?.family_id ?? '');
  const [productType, setProductType] = useState(model?.product_type ?? 'Cabinet');
  const [kitType, setKitType] = useState<KitType>(model?.kit_type ?? 'SINGLE');
  const [length, setLength] = useState(model?.length_mm?.toString() ?? '');
  const [width, setWidth] = useState(model?.width_mm?.toString() ?? '');
  const [height, setHeight] = useState(model?.height_mm?.toString() ?? '');
  const [desc, setDesc] = useState(model?.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const dims = {
        length_mm: length ? parseFloat(length) : undefined,
        width_mm: width ? parseFloat(width) : undefined,
        height_mm: height ? parseFloat(height) : undefined,
      };
      if (model) {
        await updateProductModel(model.id, {
          name, family_id: familyId, product_type: productType, kit_type: kitType,
          description: desc || null, ...dims,
        });
      } else {
        await createProductModel(
          code.trim(), name.trim(), familyId, productType, kitType,
          desc.trim() || undefined, dims,
        );
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={model ? 'تعديل موديل منتج' : 'إنشاء موديل منتج جديد'} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز الموديل" hint="Model Code — فريد">
            <input
              value={code} onChange={e => setCode(e.target.value)}
              disabled={!!model} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="MDL-001"
            />
          </Field>
          <Field label="نوع المنتج" hint="Product Type">
            <input
              value={productType} onChange={e => setProductType(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Cabinet"
            />
          </Field>
        </div>
        <Field label="اسم الموديل">
          <input
            value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="مكبر صوت خشبي 15 إنش"
          />
        </Field>
        <Field label="العائلة">
          <select
            value={familyId} onChange={e => setFamilyId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">اختر العائلة</option>
            {families.filter(f => f.is_active).map(f => (
              <option key={f.id} value={f.id}>{f.name} ({f.family_code})</option>
            ))}
          </select>
        </Field>
        <Field label="نوع الكيت" hint="Kit Type — يحدد قالب التجميع">
          <div className="flex gap-2">
            {KIT_TYPES.map(t => (
              <button
                key={t.value} type="button"
                onClick={() => setKitType(t.value)}
                className={`px-3 py-2 text-sm rounded-lg border transition-colors ${
                  kitType === t.value
                    ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field label="الطول (مم)">
            <input type="number" value={length} onChange={e => setLength(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="العرض (مم)">
            <input type="number" value={width} onChange={e => setWidth(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="الارتفاع (مم)">
            <input type="number" value={height} onChange={e => setHeight(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
        </div>
        <Field label="الوصف">
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="وصف مختصر…" />
        </Field>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !code.trim() || !name.trim() || !familyId}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {model ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Model Detail
// ============================================================

function ModelDetail({ model, onBack }: { model: ModelWithFamily; onBack: () => void }) {
  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader title={model.name} subtitle={`Model ${model.model_code}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DetailCard label="العائلة" value={model.family?.name ?? '—'} sub={model.family?.family_code} />
        <DetailCard label="نوع المنتج" value={model.product_type} />
        <DetailCard label="نوع الكيت" value={model.kit_type} />
        <DetailCard label="الطول" value={model.length_mm ? `${model.length_mm} مم` : '—'} />
        <DetailCard label="العرض" value={model.width_mm ? `${model.width_mm} مم` : '—'} />
        <DetailCard label="الارتفاع" value={model.height_mm ? `${model.height_mm} مم` : '—'} />
      </div>

      {model.description && (
        <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">الوصف</h4>
          <p className="text-sm text-slate-700">{model.description}</p>
        </div>
      )}

      <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700">قوائم المواد (BOM)</h4>
          <Badge color={model.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
            {model.is_active ? 'نشط' : 'غير نشط'}
          </Badge>
        </div>
        <p className="text-xs text-slate-400 mt-1">يمكنك إدارة قوائم المواد لهذا الموديل من صفحة BOM.</p>
      </div>
    </div>
  );
}

function DetailCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium text-slate-500 mb-1">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
      {sub && <p className="text-xs text-slate-400 mt-0.5" dir="ltr">{sub}</p>}
    </div>
  );
}

function Th({ children, onClick, active, dir }: {
  children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir;
}) {
  return (
    <th className="text-right px-4 py-3 font-medium text-slate-600 select-none">
      <button onClick={onClick} className="inline-flex items-center gap-1 hover:text-slate-800">
        {children}
        <ArrowUpDown className={`w-3 h-3 ${active ? 'text-amber-600' : 'text-slate-300'}`} />
        {active && <span className="text-[10px] text-amber-600">{dir === 'asc' ? '▲' : '▼'}</span>}
      </button>
    </th>
  );
}

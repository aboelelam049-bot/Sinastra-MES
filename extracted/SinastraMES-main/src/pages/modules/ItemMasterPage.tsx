import { useState, useEffect, useCallback } from 'react';
import {
  PackageSearch, Plus, Loader2, AlertCircle, RefreshCw,
  Search, Pencil, Power, ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchItems, createItem, updateItem, toggleItemActive,
} from '@/lib/masterDataService';
import type { ItemMaster, ItemCategory } from '@/types';

type SortField = 'item_code' | 'name' | 'category' | 'created_at';
type SortDir = 'asc' | 'desc';

const CATEGORIES: { value: ItemCategory; label: string }[] = [
  { value: 'Length', label: 'Length — أطوال' },
  { value: 'Front', label: 'Front — أمامي' },
  { value: 'Back', label: 'Back — خلفي' },
  { value: 'Raw Board', label: 'Raw Board — لوح خام' },
  { value: 'Other Components', label: 'Other — مكونات أخرى' },
];

const CATEGORY_COLORS: Record<ItemCategory, string> = {
  'Length': 'bg-blue-100 text-blue-700 border-blue-200',
  'Front': 'bg-emerald-100 text-emerald-700 border-emerald-200',
  'Back': 'bg-amber-100 text-amber-700 border-amber-200',
  'Raw Board': 'bg-slate-100 text-slate-700 border-slate-200',
  'Other Components': 'bg-indigo-100 text-indigo-700 border-indigo-200',
};
const BADGE_GREEN = 'bg-emerald-100 text-emerald-700 border-emerald-200';
const BADGE_SLATE = 'bg-slate-100 text-slate-700 border-slate-200';

export function ItemMasterPage() {
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ItemMaster | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ItemMaster | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems(
        search.trim() || undefined,
        categoryFilter || undefined,
        activeOnly,
      );
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, categoryFilter, activeOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, categoryFilter, activeOnly, sortField, sortDir]);

  const sorted = [...items].sort((a, b) => {
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
      await toggleItemActive(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div>
      <PageHeader
        title="بنود الأصناف"
        subtitle="Item Master — الأصناف الخام والمكونات"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            صنف جديد
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
            placeholder="بحث برمز الصنف أو الاسم…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">كل الفئات</option>
          {CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 px-2 py-1 cursor-pointer">
          <input
            type="checkbox" checked={activeOnly}
            onChange={e => setActiveOnly(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
          />
          النشط فقط
        </label>
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
            icon={<PackageSearch className="w-7 h-7" />}
            title="لا توجد أصناف"
            description="أنشئ أول صنف خام أو مكون لاستخدامه في قوائم المواد."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> صنف جديد</Button>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('item_code')} active={sortField === 'item_code'} dir={sortDir}>رمز الصنف</Th>
                  <Th onClick={() => toggleSort('name')} active={sortField === 'name'} dir={sortDir}>الاسم</Th>
                  <Th onClick={() => toggleSort('category')} active={sortField === 'category'} dir={sortDir}>الفئة</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">النوع</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">الأبعاد (مم)</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">الوحدة</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(it => (
                  <tr key={it.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{it.item_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{it.name}</td>
                    <td className="px-4 py-3">
                      <Badge color={CATEGORY_COLORS[it.category]}>{it.category}</Badge>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{it.item_type}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">
                      {[it.length_mm, it.width_mm, it.thickness_mm].map(d => d ?? '?').join('×')}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{it.unit_of_measure}</td>
                    <td className="px-4 py-3">
                      <Badge color={it.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                        {it.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(it)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setToggleTarget(it)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title={it.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
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
        <ItemFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
      {editTarget && (
        <ItemFormModal
          item={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'إلغاء تنشيط الصنف' : 'تنشيط الصنف'}
        message={
          toggleTarget?.is_active
            ? `سيتم إلغاء تنشيط صنف «${toggleTarget.name}». لن يمكن إضافته لقوائم مواد جديدة، لكن المراجع القديمة تبقى محفوظة.`
            : `سيتم إعادة تنشيط صنف «${toggleTarget?.name}».`
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

function ItemFormModal({
  item, onClose, onSaved,
}: {
  item?: ItemMaster;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(item?.item_code ?? '');
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState<ItemCategory>(item?.category ?? 'Length');
  const [itemType, setItemType] = useState(item?.item_type ?? 'Wood');
  const [uom, setUom] = useState(item?.unit_of_measure ?? 'PCS');
  const [length, setLength] = useState(item?.length_mm?.toString() ?? '');
  const [width, setWidth] = useState(item?.width_mm?.toString() ?? '');
  const [thickness, setThickness] = useState(item?.thickness_mm?.toString() ?? '');
  const [desc, setDesc] = useState(item?.description ?? '');
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
        thickness_mm: thickness ? parseFloat(thickness) : undefined,
      };
      if (item) {
        await updateItem(item.id, {
          name, category, item_type: itemType, unit_of_measure: uom,
          ...dims, description: desc || null,
        });
      } else {
        await createItem(
          code.trim(), name.trim(), category, itemType, uom, dims, desc.trim() || undefined,
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
    <Modal open title={item ? 'تعديل صنف' : 'إنشاء صنف جديد'} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز الصنف" hint="Item Code — فريد">
            <input
              value={code} onChange={e => setCode(e.target.value)}
              disabled={!!item} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="ITM-001"
            />
          </Field>
          <Field label="نوع الصنف" hint="Item Type">
            <input
              value={itemType} onChange={e => setItemType(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Wood"
            />
          </Field>
        </div>
        <Field label="اسم الصنف">
          <input
            value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="لوح خشبي MDF 18مم"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الفئة" hint="Category">
            <select
              value={category} onChange={e => setCategory(e.target.value as ItemCategory)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {CATEGORIES.map(c => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="وحدة القياس" hint="Unit of Measure">
            <input
              value={uom} onChange={e => setUom(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="PCS"
            />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="الطول (مم)">
            <input type="number" value={length} onChange={e => setLength(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="العرض (مم)">
            <input type="number" value={width} onChange={e => setWidth(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="السمك (مم)">
            <input type="number" value={thickness} onChange={e => setThickness(e.target.value)}
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
          <Button type="submit" disabled={loading || !code.trim() || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {item ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
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

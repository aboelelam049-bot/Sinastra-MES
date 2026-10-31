import { useState, useEffect, useCallback } from 'react';
import {
  Boxes, Plus, Loader2, AlertCircle, RefreshCw,
  Search, Pencil, Power, ArrowUpDown,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';

const BADGE_GREEN = 'bg-emerald-100 text-emerald-700 border-emerald-200';
const BADGE_SLATE = 'bg-slate-100 text-slate-700 border-slate-200';
const BADGE_AMBER = 'bg-amber-100 text-amber-700 border-amber-200';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import {
  fetchProductFamilies, createProductFamily, updateProductFamily, toggleProductFamilyActive,
} from '@/lib/masterDataService';
import type { ProductFamily } from '@/types';

type SortField = 'family_code' | 'name' | 'created_at';
type SortDir = 'asc' | 'desc';
const PAGE_SIZE = 10;

export function ProductFamiliesPage() {
  const [families, setFamilies] = useState<ProductFamily[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductFamily | null>(null);
  const [toggleTarget, setToggleTarget] = useState<ProductFamily | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchProductFamilies(search.trim() || undefined);
      setFamilies(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, sortField, sortDir]);

  const sorted = [...families].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    const av = String(a[sortField] ?? '');
    const bv = String(b[sortField] ?? '');
    return av.localeCompare(bv, 'ar') * dir;
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const pageRows = sorted.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  }

  async function handleToggle() {
    if (!toggleTarget) return;
    try {
      await toggleProductFamilyActive(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div>
      <PageHeader
        title="عائلات المنتجات"
        subtitle="Product Families — تصنيف رئيسي لموديلات المنتجات"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            عائلة جديدة
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
            placeholder="بحث برمز العائلة أو الاسم…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
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
            icon={<Boxes className="w-7 h-7" />}
            title="لا توجد عائلات منتجات"
            description="أنشئ أول عائلة منتجات لتصنيف الموديلات تحتها."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> عائلة جديدة</Button>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('family_code')} active={sortField === 'family_code'} dir={sortDir}>رمز العائلة</Th>
                  <Th onClick={() => toggleSort('name')} active={sortField === 'name'} dir={sortDir}>الاسم</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">الوصف</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{f.family_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{f.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{f.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={f.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                        {f.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(f)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setToggleTarget(f)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
                          title={f.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
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
        <FamilyFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); load(); }}
        />
      )}
      {editTarget && (
        <FamilyFormModal
          family={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); load(); }}
        />
      )}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'إلغاء تنشيط العائلة' : 'تنشيط العائلة'}
        message={
          toggleTarget?.is_active
            ? `سيتم إلغاء تنشيط عائلة «${toggleTarget.name}». لن يمكن استخدامها في موديلات جديدة، لكن المراجع القديمة تبقى محفوظة.`
            : `سيتم إعادة تنشيط عائلة «${toggleTarget?.name}».`
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
// Form Modal (Create / Edit)
// ============================================================

function FamilyFormModal({
  family, onClose, onSaved,
}: {
  family?: ProductFamily;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(family?.family_code ?? '');
  const [name, setName] = useState(family?.name ?? '');
  const [desc, setDesc] = useState(family?.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (family) {
        await updateProductFamily(family.id, { name, description: desc || null });
      } else {
        await createProductFamily(code.trim(), name.trim(), desc.trim() || undefined);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={family ? 'تعديل عائلة منتج' : 'إنشاء عائلة منتج جديدة'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="رمز العائلة" hint="Family Code — حروف لاتينية فريدة">
          <input
            value={code} onChange={e => setCode(e.target.value)}
            disabled={!!family}
            required
            dir="ltr"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
            placeholder="FAM-001"
          />
        </Field>
        <Field label="الاسم">
          <input
            value={name} onChange={e => setName(e.target.value)}
            required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="عائلة مكبرات الصوت"
          />
        </Field>
        <Field label="الوصف">
          <textarea
            value={desc} onChange={e => setDesc(e.target.value)}
            rows={3}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="وصف مختصر للعائلة…"
          />
        </Field>
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>
        )}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !code.trim() || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {family ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Shared UI helpers
// ============================================================

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

export function Field({ label, hint, children }: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

export function Pagination({ page, pageCount, total, onChange }: {
  page: number; pageCount: number; total: number; onChange: (p: number) => void;
}) {
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-slate-500">
      <span>
        عرض {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} من {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(Math.max(0, page - 1))}
          disabled={page === 0}
          className="px-2.5 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >السابق</button>
        <span className="px-2">{page + 1} / {pageCount}</span>
        <button
          onClick={() => onChange(Math.min(pageCount - 1, page + 1))}
          disabled={page >= pageCount - 1}
          className="px-2.5 py-1 rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50"
        >التالي</button>
      </div>
    </div>
  );
}

export const ITEM_PAGE_SIZE = PAGE_SIZE;

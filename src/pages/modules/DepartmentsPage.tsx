import { useState, useEffect, useCallback } from 'react';
import {
  Building2, Plus, Loader2, AlertCircle, RefreshCw,
  Search, Pencil, Power, ArrowUpDown, ArrowRight, Factory,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchDepartments, createDepartment, updateDepartment, toggleDepartmentActive,
  fetchWorkCenters,
} from '@/lib/machineService';
import type { Department, WorkCenter } from '@/types';

type SortField = 'department_code' | 'name' | 'created_at';
type SortDir = 'asc' | 'desc';

const BADGE_GREEN = 'bg-emerald-100 text-emerald-700 border-emerald-200';
const BADGE_SLATE = 'bg-slate-100 text-slate-700 border-slate-200';

export function DepartmentsPage() {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<Department | null>(null);
  const [toggleTarget, setToggleTarget] = useState<Department | null>(null);
  const [detailTarget, setDetailTarget] = useState<Department | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchDepartments(search.trim() || undefined);
      setDepartments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, sortField, sortDir]);

  const sorted = [...departments].sort((a, b) => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return String(a[sortField] ?? '').localeCompare(String(b[sortField] ?? ''), 'ar') * dir;
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
      await toggleDepartmentActive(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (detailTarget) {
    return (
      <DepartmentDetail
        department={detailTarget}
        onBack={() => { setDetailTarget(null); load(); }}
      />
    );
  }

  return (
    <div>
      <PageHeader
        title="الأقسام"
        subtitle="Departments — الأقسام الإنتاجية التي تحتوي على مراكز العمل"
        action={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />
            قسم جديد
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
            placeholder="بحث برمز القسم أو الاسم…"
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
            icon={<Building2 className="w-7 h-7" />}
            title="لا توجد أقسام"
            description="أنشئ أول قسم إنتاجي لإضافة مراكز العمل والماكينات تحته."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> قسم جديد</Button>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('department_code')} active={sortField === 'department_code'} dir={sortDir}>رمز القسم</Th>
                  <Th onClick={() => toggleSort('name')} active={sortField === 'name'} dir={sortDir}>الاسم</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">الوصف</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailTarget(d)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{d.department_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{d.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 hidden md:table-cell">{d.description ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={d.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                        {d.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(d)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setToggleTarget(d)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={d.is_active ? 'إلغاء التنشيط' : 'تنشيط'}>
                          <Power className="w-4 h-4" />
                        </button>
                        <ArrowRight className="w-4 h-4 text-slate-300" />
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
        <DeptFormModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editTarget && (
        <DeptFormModal dept={editTarget} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'إلغاء تنشيط القسم' : 'تنشيط القسم'}
        message={toggleTarget?.is_active
          ? `سيتم إلغاء تنشيط قسم «${toggleTarget.name}». لن يمكن استخدامه في سجلات جديدة، لكن المراجع القديمة تبقى محفوظة.`
          : `سيتم إعادة تنشيط قسم «${toggleTarget?.name}».`}
        confirmLabel={toggleTarget?.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
        variant={toggleTarget?.is_active ? 'danger' : 'default'}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}

function DeptFormModal({ dept, onClose, onSaved }: { dept?: Department; onClose: () => void; onSaved: () => void }) {
  const [code, setCode] = useState(dept?.department_code ?? '');
  const [name, setName] = useState(dept?.name ?? '');
  const [desc, setDesc] = useState(dept?.description ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (dept) {
        await updateDepartment(dept.id, { name, description: desc || null });
      } else {
        await createDepartment(code.trim(), name.trim(), desc.trim() || undefined);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={dept ? 'تعديل قسم' : 'إنشاء قسم جديد'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="رمز القسم" hint="Department Code — فريد">
          <input value={code} onChange={e => setCode(e.target.value)} disabled={!!dept} required dir="ltr"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
            placeholder="DEPT-001" />
        </Field>
        <Field label="اسم القسم">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="قسم النجارة" />
        </Field>
        <Field label="الوصف">
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="وصف مختصر…" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !code.trim() || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {dept ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

function DepartmentDetail({ department, onBack }: { department: Department; onBack: () => void }) {
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchWorkCenters(undefined, department.id);
        setWorkCenters(data);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, [department.id]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader title={department.name} subtitle={`Department ${department.department_code}`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <DetailCard label="رمز القسم" value={department.department_code} mono />
        <DetailCard label="الحالة" value={department.is_active ? 'نشط' : 'غير نشط'} />
        <DetailCard label="عدد مراكز العمل" value={String(workCenters.length)} />
      </div>

      {department.description && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">الوصف</h4>
          <p className="text-sm text-slate-700">{department.description}</p>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Factory className="w-4 h-4 text-slate-400" /> مراكز العمل التابعة
          </h4>
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-amber-600 animate-spin" />
          </div>
        ) : workCenters.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد مراكز عمل في هذا القسم</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الرمز</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">الوحدة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {workCenters.map(wc => (
                <tr key={wc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{wc.work_center_code}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{wc.name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell" dir="ltr">{wc.default_unit_of_measure}</td>
                  <td className="px-4 py-2.5">
                    <Badge color={wc.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                      {wc.is_active ? 'نشط' : 'غير نشط'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DetailCard({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className={`text-sm font-semibold text-slate-800 ${mono ? 'font-mono' : ''}`} dir={mono ? 'ltr' : undefined}>{value}</p>
    </div>
  );
}

function Th({ children, onClick, active, dir }: { children: React.ReactNode; onClick: () => void; active: boolean; dir: SortDir }) {
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

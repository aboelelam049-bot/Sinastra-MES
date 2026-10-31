import { useState, useEffect, useCallback } from 'react';
import {
  Cog, Plus, Loader2, AlertCircle, RefreshCw,
  Search, Pencil, Power, ArrowUpDown, ArrowRight,
  Zap, History, Clock, Trash2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchMachines, createMachine, updateMachine, toggleMachineActive,
  fetchDepartments, fetchWorkCenters,
  changeMachineStatus, fetchMachineStatusHistory,
  fetchMachineAvailability, createMachineAvailability, deleteMachineAvailability,
} from '@/lib/machineService';
import {
  MACHINE_STATUS_LABELS, MACHINE_STATUS_COLORS,
  AVAILABILITY_LABELS, AVAILABILITY_COLORS,
} from '@/lib/statusLabels';
import type {
  Department, WorkCenter, Machine, MachineStatus,
  MachineStatusHistory, MachineAvailability, AvailabilityType,
} from '@/types';

type MachineWithRelations = Machine & { department: Department | null; work_center: WorkCenter | null };
type SortField = 'machine_code' | 'name' | 'status' | 'created_at';
type SortDir = 'asc' | 'desc';

const BADGE_GREEN = 'bg-emerald-100 text-emerald-700 border-emerald-200';
const BADGE_SLATE = 'bg-slate-100 text-slate-700 border-slate-200';

const STATUS_OPTIONS: MachineStatus[] = ['RUNNING', 'IDLE', 'BREAKDOWN', 'MAINTENANCE', 'OFFLINE'];
const AVAILABILITY_TYPES: AvailabilityType[] = ['SHIFT_SCHEDULE', 'PLANNED_WORKING', 'PLANNED_DOWNTIME', 'MAINTENANCE', 'BREAKDOWN'];
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function MachinesPage() {
  const [machines, setMachines] = useState<MachineWithRelations[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState<MachineWithRelations | null>(null);
  const [toggleTarget, setToggleTarget] = useState<MachineWithRelations | null>(null);
  const [detailTarget, setDetailTarget] = useState<MachineWithRelations | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, depts, wcs] = await Promise.all([
        fetchMachines(search.trim() || undefined, deptFilter || undefined, statusFilter || undefined, activeOnly),
        fetchDepartments(),
        fetchWorkCenters(),
      ]);
      setMachines(data);
      setDepartments(depts);
      setWorkCenters(wcs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search, deptFilter, statusFilter, activeOnly]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search, deptFilter, statusFilter, activeOnly, sortField, sortDir]);

  const sorted = [...machines].sort((a, b) => {
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
      await toggleMachineActive(toggleTarget.id, !toggleTarget.is_active);
      setToggleTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (detailTarget) {
    return <MachineDetail machine={detailTarget} onBack={() => { setDetailTarget(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="الماكينات"
        subtitle="Machines — إدارة الماكينات وحالتها وسجل التشغيل"
        action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> ماكينة جديدة</Button>}
      />

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4 p-3 flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute top-1/2 -translate-y-1/2 right-3" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="بحث برمز الماكينة أو الاسم…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </div>
        <select value={deptFilter} onChange={e => setDeptFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الأقسام</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
          <option value="">كل الحالات</option>
          {STATUS_OPTIONS.map(s => <option key={s} value={s}>{MACHINE_STATUS_LABELS[s]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-slate-600 px-2 py-1 cursor-pointer">
          <input type="checkbox" checked={activeOnly} onChange={e => setActiveOnly(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
          النشط فقط
        </label>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState icon={<Cog className="w-7 h-7" />} title="لا توجد ماكينات"
            description="أنشئ أول ماكينة واربطها بقسم ومركز عمل."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> ماكينة جديدة</Button>} />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <Th onClick={() => toggleSort('machine_code')} active={sortField === 'machine_code'} dir={sortDir}>الرمز</Th>
                  <Th onClick={() => toggleSort('name')} active={sortField === 'name'} dir={sortDir}>الاسم</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">مركز العمل</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden lg:table-cell">النوع</th>
                  <Th onClick={() => toggleSort('status')} active={sortField === 'status'} dir={sortDir}>الحالة</Th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden sm:table-cell">النشاط</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(m => (
                  <tr key={m.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailTarget(m)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{m.machine_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{m.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell">{m.work_center?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden lg:table-cell" dir="ltr">{m.machine_type ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge color={MACHINE_STATUS_COLORS[m.status]} variant="dot">{MACHINE_STATUS_LABELS[m.status]}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <Badge color={m.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
                        {m.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditTarget(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تعديل">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setToggleTarget(m)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title={m.is_active ? 'إلغاء التنشيط' : 'تنشيط'}>
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
        <MachineFormModal departments={departments} workCenters={workCenters}
          onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />
      )}
      {editTarget && (
        <MachineFormModal departments={departments} workCenters={workCenters} machine={editTarget}
          onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); load(); }} />
      )}
      <ConfirmDialog
        open={!!toggleTarget}
        title={toggleTarget?.is_active ? 'إلغاء تنشيط الماكينة' : 'تنشيط الماكينة'}
        message={toggleTarget?.is_active
          ? `سيتم إلغاء تنشيط ماكينة «${toggleTarget.name}». لن يمكن اختيارها لعمليات إنتاج جديدة، لكن السجلات التاريخية تبقى مرتبطة بها.`
          : `سيتم إعادة تنشيط ماكينة «${toggleTarget?.name}».`}
        confirmLabel={toggleTarget?.is_active ? 'إلغاء التنشيط' : 'تنشيط'}
        variant={toggleTarget?.is_active ? 'danger' : 'default'}
        onConfirm={handleToggle}
        onCancel={() => setToggleTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Machine Form Modal
// ============================================================

function MachineFormModal({ departments, workCenters, machine, onClose, onSaved }: {
  departments: Department[];
  workCenters: WorkCenter[];
  machine?: MachineWithRelations;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(machine?.machine_code ?? '');
  const [name, setName] = useState(machine?.name ?? '');
  const [deptId, setDeptId] = useState(machine?.department_id ?? '');
  const [wcId, setWcId] = useState(machine?.work_center_id ?? '');
  const [machineType, setMachineType] = useState(machine?.machine_type ?? '');
  const [manufacturer, setManufacturer] = useState(machine?.manufacturer ?? '');
  const [modelSerial, setModelSerial] = useState(machine?.model_serial ?? '');
  const [capacityValue, setCapacityValue] = useState(machine?.capacity_value?.toString() ?? '');
  const [capacityUnit, setCapacityUnit] = useState(machine?.capacity_unit ?? 'pieces/hour');
  const [availableShifts, setAvailableShifts] = useState(machine?.available_shifts ?? '');
  const [installDate, setInstallDate] = useState(machine?.installation_date ?? '');
  const [maintenanceNotes, setMaintenanceNotes] = useState(machine?.maintenance_notes ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filteredWCs = workCenters.filter(wc => !deptId || wc.department_id === deptId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const fields = {
        name, department_id: deptId || undefined, work_center_id: wcId || undefined,
        machine_type: machineType || undefined, manufacturer: manufacturer || undefined,
        model_serial: modelSerial || undefined,
        capacity_value: capacityValue ? parseFloat(capacityValue) : undefined,
        capacity_unit: capacityUnit || undefined,
        available_shifts: availableShifts || undefined,
        installation_date: installDate || undefined,
        maintenance_notes: maintenanceNotes || undefined,
      };
      if (machine) {
        await updateMachine(machine.id, fields);
      } else {
        await createMachine({ machine_code: code.trim(), ...fields });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={machine ? 'تعديل ماكينة' : 'إنشاء ماكينة جديدة'} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز الماكينة" hint="Machine Code — فريد">
            <input value={code} onChange={e => setCode(e.target.value)} disabled={!!machine} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="MCH-001" />
          </Field>
          <Field label="نوع الماكينة" hint="Machine Type">
            <input value={machineType} onChange={e => setMachineType(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="CNC Router" />
          </Field>
        </div>
        <Field label="اسم الماكينة">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="ماكينة قصة CNC رقم 1" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="القسم">
            <select value={deptId} onChange={e => { setDeptId(e.target.value); setWcId(''); }}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— بدون —</option>
              {departments.filter(d => d.is_active).map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </Field>
          <Field label="مركز العمل">
            <select value={wcId} onChange={e => setWcId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">— بدون —</option>
              {filteredWCs.filter(wc => wc.is_active).map(wc => <option key={wc.id} value={wc.id}>{wc.name} ({wc.work_center_code})</option>)}
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="المُصنّع" hint="Manufacturer — اختياري">
            <input value={manufacturer} onChange={e => setManufacturer(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="موديل / رقم تسلسلي" hint="Model / Serial — اختياري">
            <input value={modelSerial} onChange={e => setModelSerial(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="السعة">
            <input type="number" step="0.01" value={capacityValue} onChange={e => setCapacityValue(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="0" />
          </Field>
          <Field label="وحدة السعة">
            <input value={capacityUnit} onChange={e => setCapacityUnit(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="pieces/hour" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الورديات المتاحة" hint="Available Shifts">
            <input value={availableShifts} onChange={e => setAvailableShifts(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="Morning, Evening" />
          </Field>
          <Field label="تاريخ التركيب" hint="Installation Date — اختياري">
            <input type="date" value={installDate} onChange={e => setInstallDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="ملاحظات الصيانة">
          <textarea value={maintenanceNotes} onChange={e => setMaintenanceNotes(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !code.trim() || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {machine ? 'حفظ التعديلات' : 'إنشاء'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Machine Detail
// ============================================================

function MachineDetail({ machine, onBack }: { machine: MachineWithRelations; onBack: () => void }) {
  const [history, setHistory] = useState<MachineStatusHistory[]>([]);
  const [availability, setAvailability] = useState<MachineAvailability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatusChange, setShowStatusChange] = useState(false);
  const [showAddAvail, setShowAddAvail] = useState(false);
  const [removeAvailTarget, setRemoveAvailTarget] = useState<MachineAvailability | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [hist, avail] = await Promise.all([
        fetchMachineStatusHistory(machine.id),
        fetchMachineAvailability(machine.id),
      ]);
      setHistory(hist);
      setAvailability(avail);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [machine.id]);

  useEffect(() => { load(); }, [load]);

  async function handleRemoveAvail() {
    if (!removeAvailTarget) return;
    try {
      await deleteMachineAvailability(removeAvailTarget.id);
      setRemoveAvailTarget(null);
      load();
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
        <PageHeader title={machine.name} subtitle={`Machine ${machine.machine_code}`} />
      </div>

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Status banner */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge color={MACHINE_STATUS_COLORS[machine.status]} variant="dot">
            {MACHINE_STATUS_LABELS[machine.status]}
          </Badge>
          <Badge color={machine.is_active ? BADGE_GREEN : BADGE_SLATE} variant="dot">
            {machine.is_active ? 'نشط' : 'غير نشط'}
          </Badge>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setShowStatusChange(true)}>
          <Zap className="w-3.5 h-3.5" /> تغيير الحالة
        </Button>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
        <InfoBox label="القسم" value={machine.department?.name ?? '—'} />
        <InfoBox label="مركز العمل" value={machine.work_center?.name ?? '—'} />
        <InfoBox label="نوع الماكينة" value={machine.machine_type ?? '—'} />
        <InfoBox label="المُصنّع" value={machine.manufacturer ?? '—'} />
        <InfoBox label="موديل / رقم تسلسلي" value={machine.model_serial ?? '—'} />
        <InfoBox label="السعة" value={machine.capacity_value ? `${machine.capacity_value} ${machine.capacity_unit ?? ''}` : '—'} />
        <InfoBox label="الورديات" value={machine.available_shifts ?? '—'} />
        <InfoBox label="تاريخ التركيب" value={machine.installation_date ?? '—'} />
      </div>

      {machine.maintenance_notes && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">ملاحظات الصيانة</h4>
          <p className="text-sm text-slate-700">{machine.maintenance_notes}</p>
        </div>
      )}

      {/* Status History */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400" /> سجل تغييرات الحالة
          </h4>
        </div>
        {loading ? (
          <div className="py-6 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
        ) : history.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">لا توجد تغييرات حالة مسجلة</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة السابقة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة الجديدة</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">التاريخ والوقت</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">السبب</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {history.map(h => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5">
                    {h.previous_status ? <Badge color={MACHINE_STATUS_COLORS[h.previous_status as MachineStatus]}>{MACHINE_STATUS_LABELS[h.previous_status as MachineStatus]}</Badge> : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge color={MACHINE_STATUS_COLORS[h.new_status as MachineStatus]}>{MACHINE_STATUS_LABELS[h.new_status as MachineStatus]}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">
                    {new Date(h.changed_at).toLocaleString('en-GB')}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell">{h.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Availability */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-400" /> توافر الماكينة
          </h4>
          <Button size="sm" variant="secondary" onClick={() => setShowAddAvail(true)}>
            <Plus className="w-3.5 h-3.5" /> إضافة
          </Button>
        </div>
        {availability.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-slate-400">لا توجد سجلات توافر مخططة</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">النوع</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">اليوم</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">الوقت</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">ساعات</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">من</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {availability.map(a => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5"><Badge color={AVAILABILITY_COLORS[a.availability_type]}>{AVAILABILITY_LABELS[a.availability_type]}</Badge></td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden sm:table-cell">{a.day_of_week !== null ? DAY_NAMES[a.day_of_week] : '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell" dir="ltr">{a.start_time ?? '—'} - {a.end_time ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell">{a.planned_hours ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden lg:table-cell" dir="ltr">{a.effective_from}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setRemoveAvailTarget(a)} className="p-1 rounded text-red-400 hover:bg-red-50">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showStatusChange && (
        <StatusChangeModal machine={machine}
          onClose={() => setShowStatusChange(false)}
          onChanged={() => { setShowStatusChange(false); load(); onBack(); }} />
      )}
      {showAddAvail && (
        <AddAvailabilityModal machineId={machine.id}
          onClose={() => setShowAddAvail(false)}
          onAdded={() => { setShowAddAvail(false); load(); }} />
      )}
      <ConfirmDialog
        open={!!removeAvailTarget}
        title="حذف سجل التوافر"
        message="سيتم حذف هذا السجل من جدول التوافر."
        confirmLabel="حذف" variant="danger"
        onConfirm={handleRemoveAvail}
        onCancel={() => setRemoveAvailTarget(null)}
      />
    </div>
  );
}

// ============================================================
// Status Change Modal
// ============================================================

function StatusChangeModal({ machine, onClose, onChanged }: {
  machine: MachineWithRelations; onClose: () => void; onChanged: () => void;
}) {
  const [newStatus, setNewStatus] = useState<MachineStatus>(machine.status);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await changeMachineStatus(machine.id, newStatus, reason.trim() || undefined);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="تغيير حالة الماكينة" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">الحالة الحالية:</span>
          <Badge color={MACHINE_STATUS_COLORS[machine.status]} variant="dot">{MACHINE_STATUS_LABELS[machine.status]}</Badge>
        </div>
        <Field label="الحالة الجديدة">
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map(s => (
              <button key={s} type="button" onClick={() => setNewStatus(s)}
                disabled={s === machine.status}
                className={`px-3 py-2 text-xs rounded-lg border transition-colors ${
                  newStatus === s ? 'bg-amber-50 border-amber-300 text-amber-700 font-medium' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300 disabled:opacity-40'
                }`}>
                {MACHINE_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label="السبب / ملاحظات" hint="Reason — اختياري">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="سبب تغيير الحالة…" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || newStatus === machine.status}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
            تأكيد التغيير
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Add Availability Modal
// ============================================================

function AddAvailabilityModal({ machineId, onClose, onAdded }: {
  machineId: string; onClose: () => void; onAdded: () => void;
}) {
  const [type, setType] = useState<AvailabilityType>('SHIFT_SCHEDULE');
  const [dayOfWeek, setDayOfWeek] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [plannedHours, setPlannedHours] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createMachineAvailability({
        machine_id: machineId,
        availability_type: type,
        day_of_week: dayOfWeek !== '' ? parseInt(dayOfWeek) : null,
        start_time: startTime || null,
        end_time: endTime || null,
        effective_from: effectiveFrom,
        planned_hours: plannedHours ? parseFloat(plannedHours) : null,
        notes: notes || null,
      });
      onAdded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة سجل توافر" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="نوع التوافر">
          <select value={type} onChange={e => setType(e.target.value as AvailabilityType)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            {AVAILABILITY_TYPES.map(t => <option key={t} value={t}>{AVAILABILITY_LABELS[t]}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="اليوم" hint="اختياري">
            <select value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
            </select>
          </Field>
          <Field label="ساعات مخططة" hint="Planned Hours — اختياري">
            <input type="number" step="0.5" value={plannedHours} onChange={e => setPlannedHours(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" placeholder="8" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="وقت البداية">
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="وقت النهاية">
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <Field label="ساري من">
          <input type="date" value={effectiveFrom} onChange={e => setEffectiveFrom(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        <Field label="ملاحظات">
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !effectiveFrom}>
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

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800" dir="ltr">{value}</p>
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

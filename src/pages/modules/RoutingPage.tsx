import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  GitBranch, Plus, Loader2, AlertCircle, RefreshCw, Search,
  ArrowRight, Trash2, GitCommit, Zap, Eye, Layers,
  Workflow, ChevronDown, ChevronRight, Pencil,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal, ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Field, Pagination, ITEM_PAGE_SIZE } from './ProductFamiliesPage';
import {
  fetchRoutingTemplates, createRoutingTemplate, updateRoutingTemplate,
  fetchRoutingVersions, createRoutingVersion, activateRoutingVersion, retireRoutingVersion,
  fetchRoutingStages, createRoutingStage, updateRoutingStage, deleteRoutingStage,
  fetchStageTransitions, createStageTransition, deleteStageTransition,
  fetchRoutingItemRules, createRoutingItemRule, deleteRoutingItemRule,
} from '@/lib/routingService';
import { fetchWorkCenters } from '@/lib/machineService';
import { fetchProductModels } from '@/lib/masterDataService';
import type {
  RoutingTemplate, RoutingVersion, RoutingStage, StageTransition,
  RoutingVersionStatus, WorkCenter, ProductModel,
} from '@/types';

const VERSION_STATUS_COLORS: Record<RoutingVersionStatus, string> = {
  DRAFT: 'bg-amber-100 text-amber-700 border-amber-200',
  ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  RETIRED: 'bg-slate-100 text-slate-700 border-slate-200',
};
const VERSION_STATUS_LABELS: Record<RoutingVersionStatus, string> = {
  DRAFT: 'Draft',
  ACTIVE: 'Active',
  RETIRED: 'Retired',
};

export function RoutingPage() {
  const [templates, setTemplates] = useState<RoutingTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [detailTarget, setDetailTarget] = useState<RoutingTemplate | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoutingTemplates(search.trim() || undefined);
      setTemplates(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [search]);

  const pageCount = Math.max(1, Math.ceil(templates.length / ITEM_PAGE_SIZE));
  const pageRows = templates.slice(page * ITEM_PAGE_SIZE, page * ITEM_PAGE_SIZE + ITEM_PAGE_SIZE);

  if (detailTarget) {
    return <RoutingTemplateDetail template={detailTarget} onBack={() => { setDetailTarget(null); load(); }} />;
  }

  return (
    <div>
      <PageHeader
        title="المسارات وسير العمل"
        subtitle="Routing & Workflow Engine — مسارات الإنتاج القابلة للتكوين"
        action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> مسار جديد</Button>}
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
            placeholder="بحث برمز أو اسم المسار…"
            className="w-full pr-9 pl-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
        <Button variant="secondary" onClick={load}><RefreshCw className="w-4 h-4" /> تحديث</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 text-amber-600 animate-spin" /></div>
      ) : templates.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<GitBranch className="w-7 h-7" />}
            title="لا توجد مسارات"
            description="أنشئ مسار إنتاج (Routing Template) لتحديد خطوات العمليات للموديلات وأنواع الأصناف."
            action={<Button onClick={() => setShowCreate(true)}><Plus className="w-4 h-4" /> مسار جديد</Button>}
          />
        </div>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الرمز</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الاسم</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600 hidden md:table-cell">نوع الصنف</th>
                  <th className="text-right px-4 py-3 font-medium text-slate-600">الحالة</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {pageRows.map(t => (
                  <tr key={t.id} className="hover:bg-slate-50 cursor-pointer transition-colors" onClick={() => setDetailTarget(t)}>
                    <td className="px-4 py-3 font-mono text-xs font-medium text-slate-700" dir="ltr">{t.route_code}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{t.name}</td>
                    <td className="px-4 py-3 text-xs text-slate-600 hidden md:table-cell" dir="ltr">{t.item_type_applicability}</td>
                    <td className="px-4 py-3">
                      <Badge color={t.is_active ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-700 border-slate-200'} variant="dot">
                        {t.is_active ? 'نشط' : 'غير نشط'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3"><ArrowRight className="w-4 h-4 text-slate-300" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={pageCount} total={templates.length} onChange={setPage} />
        </>
      )}

      {showCreate && (
        <CreateTemplateModal onClose={() => setShowCreate(false)} onCreated={(t) => { setShowCreate(false); setDetailTarget(t); load(); }} />
      )}
    </div>
  );
}

// ============================================================
// Create Template Modal
// ============================================================

function CreateTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: (t: RoutingTemplate) => void }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [itemType, setItemType] = useState('ALL');
  const [modelApp, setModelApp] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const t = await createRoutingTemplate({
        route_code: code.trim(),
        name: name.trim(),
        description: desc.trim() || undefined,
        item_type_applicability: itemType,
        product_model_applicability: modelApp,
      });
      onCreated(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء مسار جديد" onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز المسار" hint="Route Code — فريد">
            <input value={code} onChange={e => setCode(e.target.value)} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="ROUTE-LENGTHS" />
          </Field>
          <Field label="نوع الصنف" hint="Item Type Applicability">
            <select value={itemType} onChange={e => setItemType(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="ALL">الكل</option>
              <option value="LENGTH">أطوال (Length)</option>
              <option value="FRONT">أوجه (Front)</option>
              <option value="BACK">ظهور (Back)</option>
            </select>
          </Field>
        </div>
        <Field label="اسم المسار">
          <input value={name} onChange={e => setName(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="مسار الأطوال" />
        </Field>
        <Field label="الوصف">
          <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !code.trim() || !name.trim()}>
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
// Routing Template Detail — versions, stages, transitions, rules
// ============================================================

function RoutingTemplateDetail({ template, onBack }: { template: RoutingTemplate; onBack: () => void }) {
  const [tab, setTab] = useState<'versions' | 'rules'>('versions');
  const [versions, setVersions] = useState<RoutingVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateVersion, setShowCreateVersion] = useState(false);
  const [versionDetail, setVersionDetail] = useState<RoutingVersion | null>(null);
  const [activateTarget, setActivateTarget] = useState<RoutingVersion | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRoutingVersions(template.id);
      setVersions(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [template.id]);

  useEffect(() => { load(); }, [load]);

  async function handleActivate() {
    if (!activateTarget) return;
    try {
      await activateRoutingVersion(activateTarget.id);
      setActivateTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  if (versionDetail) {
    return (
      <RoutingVersionDetail
        template={template}
        version={versionDetail}
        onBack={() => { setVersionDetail(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 text-slate-600">
          <ArrowRight className="w-5 h-5 rotate-180" />
        </button>
        <PageHeader title={template.name} subtitle={`Route ${template.route_code}`} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <SummaryBox label="نوع الصنف" value={template.item_type_applicability} />
        <SummaryBox label="الموديلات" value={template.product_model_applicability} />
        <SummaryBox label="عدد الإصدارات" value={String(versions.length)} />
      </div>

      {template.description && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <h4 className="text-xs font-medium text-slate-500 mb-2">الوصف</h4>
          <p className="text-sm text-slate-700">{template.description}</p>
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-4 border-b border-slate-200">
        <TabButton active={tab === 'versions'} onClick={() => setTab('versions')} icon={GitCommit}>
          الإصدارات
        </TabButton>
        <TabButton active={tab === 'rules'} onClick={() => setTab('rules')} icon={Layers}>
          قواعد الأصناف
        </TabButton>
      </div>

      {tab === 'versions' && (
        <>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-slate-700">إصدارات المسار</h4>
            <Button size="sm" onClick={() => setShowCreateVersion(true)}>
              <Plus className="w-3.5 h-3.5" /> إصدار جديد
            </Button>
          </div>
          {loading ? (
            <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
          ) : versions.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
              لا توجد إصدارات. أنشئ إصداراً جديداً لإضافة مراحل العمليات.
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600">الإصدار</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">تاريخ السريان</th>
                    <th className="text-right px-4 py-2.5 font-medium text-slate-600">الحالة</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {versions.map(v => (
                    <tr key={v.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setVersionDetail(v)}>
                      <td className="px-4 py-2.5 font-mono text-xs font-medium text-slate-700">V{v.version_number}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 hidden sm:table-cell" dir="ltr">
                        {v.effective_date ? new Date(v.effective_date).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge color={VERSION_STATUS_COLORS[v.status]} variant="dot">
                          {VERSION_STATUS_LABELS[v.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setVersionDetail(v)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500" title="تفاصيل">
                            <Eye className="w-4 h-4" />
                          </button>
                          {v.status === 'DRAFT' && (
                            <button onClick={() => setActivateTarget(v)} className="p-1.5 rounded-lg hover:bg-emerald-50 text-emerald-600" title="تفعيل">
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
          {showCreateVersion && (
            <CreateVersionModal
              templateId={template.id}
              nextVersion={(versions[0]?.version_number ?? 0) + 1}
              onClose={() => setShowCreateVersion(false)}
              onCreated={(v) => { setShowCreateVersion(false); setVersionDetail(v); load(); }}
            />
          )}
          <ConfirmDialog
            open={!!activateTarget}
            title="تفعيل إصدار المسار"
            message={`سيتم تفعيل الإصدار V${activateTarget?.version_number}. أي إصدار نشط سابق سيُعتزل مع الحفاظ على السجل التاريخي.`}
            confirmLabel="تفعيل"
            onConfirm={handleActivate}
            onCancel={() => setActivateTarget(null)}
          />
        </>
      )}

      {tab === 'rules' && (
        <ItemRulesTab templateId={template.id} />
      )}
    </div>
  );
}

// ============================================================
// Routing Version Detail — stages + transitions + visual flow
// ============================================================

function RoutingVersionDetail({ template, version, onBack }: {
  template: RoutingTemplate;
  version: RoutingVersion;
  onBack: () => void;
}) {
  const [stages, setStages] = useState<(RoutingStage & { work_center: WorkCenter | null })[]>([]);
  const [transitions, setTransitions] = useState<(StageTransition & {
    source: RoutingStage | null;
    destination: RoutingStage;
  })[]>([]);
  const [workCenters, setWorkCenters] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [editStage, setEditStage] = useState<RoutingStage | null>(null);
  const [showAddTransition, setShowAddTransition] = useState(false);
  const [removeStage, setRemoveStage] = useState<RoutingStage | null>(null);
  const [removeTransition, setRemoveTransition] = useState<StageTransition | null>(null);
  const [showFlow, setShowFlow] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [stageData, transData, wcData] = await Promise.all([
        fetchRoutingStages(version.id),
        fetchStageTransitions(version.id),
        fetchWorkCenters(),
      ]);
      setStages(stageData);
      setTransitions(transData);
      setWorkCenters(wcData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [version.id]);

  useEffect(() => { load(); }, [load]);

  const canEdit = version.status === 'DRAFT';

  async function handleRemoveStage() {
    if (!removeStage) return;
    try {
      await deleteRoutingStage(removeStage.id);
      setRemoveStage(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  async function handleRemoveTransition() {
    if (!removeTransition) return;
    try {
      await deleteStageTransition(removeTransition.id);
      setRemoveTransition(null);
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
        <PageHeader
          title={`${template.name} — V${version.version_number}`}
          subtitle={`Route ${template.route_code}`}
        />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <SummaryBox label="الإصدار" value={`V${version.version_number}`} />
        <SummaryBox label="الحالة" value={VERSION_STATUS_LABELS[version.status]} />
        <SummaryBox label="عدد المراحل" value={String(stages.length)} />
        <SummaryBox label="عدد الانتقالات" value={String(transitions.length)} />
      </div>

      {!canEdit && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 mb-4 text-sm text-amber-700">
          هذا الإصدار {VERSION_STATUS_LABELS[version.status]}. التعديل متاح فقط للإصدارات Draft.
        </div>
      )}

      {error && (
        <div className="mb-4 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}

      {/* Visual Flow */}
      {stages.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
          <button
            onClick={() => setShowFlow(s => !s)}
            className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3"
          >
            {showFlow ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Workflow className="w-4 h-4 text-slate-400" /> المخطط الانسيابي
          </button>
          {showFlow && (
            <RoutingFlowDiagram stages={stages} transitions={transitions} />
          )}
        </div>
      )}

      {/* Stages */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <GitCommit className="w-4 h-4 text-slate-400" /> مراحل العمليات
          </h4>
          {canEdit && (
            <Button size="sm" variant="secondary" onClick={() => setShowAddStage(true)}>
              <Plus className="w-3.5 h-3.5" /> إضافة مرحلة
            </Button>
          )}
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
        ) : stages.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد مراحل. أضف المراحل حسب تسلسل العمليات المؤكد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">#</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الرمز</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الاسم</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">مركز العمل</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">نوع المدخل</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden lg:table-cell">نوع المخرج</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden sm:table-cell">جودة</th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {stages.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-xs text-slate-400 font-mono">{s.sequence_number}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700" dir="ltr">{s.stage_code}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{s.stage_name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden md:table-cell">{s.work_center?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell" dir="ltr">{s.input_item_type ?? '—'}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-600 hidden lg:table-cell" dir="ltr">{s.output_item_type ?? '—'}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell">
                    {s.quality_approval_required && (
                      <Badge color="bg-purple-100 text-purple-700 border-purple-200">مطلوب</Badge>
                    )}
                  </td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 justify-end">
                        <button onClick={() => setEditStage(s)} className="p-1 text-slate-500 hover:bg-slate-100 rounded" title="تعديل">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setRemoveStage(s)} className="p-1 text-red-400 hover:bg-red-50 rounded" title="حذف">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Transitions */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
          <h4 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Workflow className="w-4 h-4 text-slate-400" /> انتقالات المراحل
          </h4>
          {canEdit && stages.length >= 2 && (
            <Button size="sm" variant="secondary" onClick={() => setShowAddTransition(true)}>
              <Plus className="w-3.5 h-3.5" /> إضافة انتقال
            </Button>
          )}
        </div>
        {loading ? (
          <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
        ) : transitions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">لا توجد انتقالات. أضف انتقالات لتحديد المسار المسموح بين المراحل.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">من</th>
                <th className="text-center px-2 py-2.5"></th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">إلى</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600 hidden md:table-cell">القواعد</th>
                {canEdit && <th className="px-4 py-2.5"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {transitions.map(t => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-sm text-slate-700">
                    {t.source ? t.source.stage_name : '— (بداية)'}
                  </td>
                  <td className="px-2 py-2.5 text-center text-slate-400"><ArrowRight className="w-4 h-4 inline" /></td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{t.destination.stage_name}</td>
                  <td className="px-4 py-2.5 text-xs text-slate-500 hidden md:table-cell">{t.transition_rules ?? '—'}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <button onClick={() => setRemoveTransition(t)} className="p-1 text-red-400 hover:bg-red-50 rounded">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddStage && (
        <StageModal
          versionId={version.id}
          nextSeq={Math.max(0, ...stages.map(s => s.sequence_number)) + 1}
          workCenters={workCenters}
          onClose={() => setShowAddStage(false)}
          onSaved={() => { setShowAddStage(false); load(); }}
        />
      )}
      {editStage && (
        <StageModal
          versionId={version.id}
          stage={editStage}
          nextSeq={editStage.sequence_number}
          workCenters={workCenters}
          onClose={() => setEditStage(null)}
          onSaved={() => { setEditStage(null); load(); }}
        />
      )}
      {showAddTransition && (
        <TransitionModal
          versionId={version.id}
          stages={stages}
          existingTransitions={transitions}
          onClose={() => setShowAddTransition(false)}
          onSaved={() => { setShowAddTransition(false); load(); }}
        />
      )}
      <ConfirmDialog open={!!removeStage} title="حذف المرحلة" message={`سيتم حذف مرحلة «${removeStage?.stage_name ?? ''}» وكل انتقالاتها.`}
        confirmLabel="حذف" variant="danger" onConfirm={handleRemoveStage} onCancel={() => setRemoveStage(null)} />
      <ConfirmDialog open={!!removeTransition} title="حذف الانتقال" message="سيتم حذف هذا الانتقال."
        confirmLabel="حذف" variant="danger" onConfirm={handleRemoveTransition} onCancel={() => setRemoveTransition(null)} />
    </div>
  );
}

// ============================================================
// Visual Flow Diagram
// ============================================================

function RoutingFlowDiagram({
  stages,
  transitions,
}: {
  stages: (RoutingStage & { work_center: WorkCenter | null })[];
  transitions: (StageTransition & { source: RoutingStage | null; destination: RoutingStage })[];
}) {
  // Group stages by whether they're entry points (no incoming transitions) or not
  const hasIncoming = useMemo(() => {
    const set = new Set<string>();
    transitions.forEach(t => set.add(t.destination_stage_id));
    return set;
  }, [transitions]);

  const entryStages = stages.filter(s => !hasIncoming.has(s.id));

  // Build adjacency list
  const outgoing = useMemo(() => {
    const map = new Map<string | null, string[]>();
    transitions.forEach(t => {
      const key = t.source_stage_id ?? '__null__';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t.destination_stage_id);
    });
    return map;
  }, [transitions]);

  // Render as vertical flow with branches
  const visited = new Set<string>();
  const rows: { stage: RoutingStage; level: number }[] = [];

  function traverse(stageId: string | null, level: number) {
    const nexts = outgoing.get(stageId ?? '__null__') ?? [];
    for (const nextId of nexts) {
      if (visited.has(nextId)) continue;
      visited.add(nextId);
      const stage = stages.find(s => s.id === nextId);
      if (stage) {
        rows.push({ stage, level });
        traverse(nextId, level + 1);
      }
    }
  }

  // Start from entry points (null source) then from stages with no incoming
  traverse(null, 0);
  entryStages.forEach(s => {
    if (!visited.has(s.id)) {
      visited.add(s.id);
      rows.push({ stage: s, level: 0 });
      traverse(s.id, 1);
    }
  });

  if (rows.length === 0 && stages.length > 0) {
    rows.push(...stages.map((s, i) => ({ stage: s, level: i })));
  }

  return (
    <div className="overflow-x-auto">
      <div className="flex flex-col items-center gap-1 py-2 min-w-fit">
        {rows.map(({ stage, level }, idx) => (
          <div key={stage.id} className="flex flex-col items-center">
            {idx > 0 && <div className="w-px h-4 bg-slate-300" />}
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg border-2 shadow-sm transition-all hover:shadow-md"
              style={{ marginRight: `${level * 24}px` }}
            >
              <div className="flex items-center justify-center w-7 h-7 rounded-full bg-slate-800 text-white text-xs font-bold flex-shrink-0">
                {stage.sequence_number}
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-slate-800">{stage.stage_name}</div>
                <div className="font-mono text-[10px] text-slate-400" dir="ltr">{stage.stage_code}</div>
              </div>
              {stage.work_center && (
                <Badge color="bg-blue-50 text-blue-600 border-blue-100">{stage.work_center.name}</Badge>
              )}
              {stage.quality_approval_required && (
                <Badge color="bg-purple-100 text-purple-700 border-purple-200">QA</Badge>
              )}
            </div>
            {idx < rows.length - 1 && <div className="w-px h-3 bg-slate-300" />}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// Stage Modal (create / edit)
// ============================================================

function StageModal({ versionId, stage, nextSeq, workCenters, onClose, onSaved }: {
  versionId: string;
  stage?: RoutingStage;
  nextSeq: number;
  workCenters: WorkCenter[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(stage?.stage_code ?? '');
  const [name, setName] = useState(stage?.stage_name ?? '');
  const [nameEn, setNameEn] = useState(stage?.stage_name_en ?? '');
  const [seq, setSeq] = useState(stage?.sequence_number ?? nextSeq);
  const [wcId, setWcId] = useState(stage?.work_center_id ?? '');
  const [role, setRole] = useState(stage?.responsible_role ?? '');
  const [inputType, setInputType] = useState(stage?.input_item_type ?? '');
  const [outputType, setOutputType] = useState(stage?.output_item_type ?? '');
  const [inputUnit, setInputUnit] = useState(stage?.input_unit ?? '');
  const [outputUnit, setOutputUnit] = useState(stage?.output_unit ?? '');
  const [qaRequired, setQaRequired] = useState(stage?.quality_approval_required ?? false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      if (stage) {
        await updateRoutingStage(stage.id, {
          stage_name: name, stage_name_en: nameEn || null, sequence_number: seq,
          work_center_id: wcId || null, responsible_role: role || null,
          input_item_type: inputType || null, output_item_type: outputType || null,
          input_unit: inputUnit || null, output_unit: outputUnit || null,
          quality_approval_required: qaRequired,
        });
      } else {
        await createRoutingStage({
          routing_version_id: versionId, stage_code: code.trim(), stage_name: name,
          stage_name_en: nameEn || undefined, sequence_number: seq,
          work_center_id: wcId || undefined, responsible_role: role || undefined,
          input_item_type: inputType || undefined, output_item_type: outputType || undefined,
          input_unit: inputUnit || undefined, output_unit: outputUnit || undefined,
          quality_approval_required: qaRequired,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title={stage ? 'تعديل مرحلة' : 'إضافة مرحلة'} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رمز المرحلة" hint="Stage Code">
            <input value={code} onChange={e => setCode(e.target.value)} disabled={!!stage} required dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:bg-slate-50"
              placeholder="CUTTING" />
          </Field>
          <Field label="رقم التسلسل">
            <input type="number" min="1" value={seq} onChange={e => setSeq(parseInt(e.target.value) || 1)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="الاسم (عربي)">
            <input value={name} onChange={e => setName(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="التقطيع الأولي" />
          </Field>
          <Field label="الاسم (إنجليزي)">
            <input value={nameEn} onChange={e => setNameEn(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="Initial Cutting" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="مركز العمل">
            <select value={wcId} onChange={e => setWcId(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              {workCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.name} ({wc.work_center_code})</option>)}
            </select>
          </Field>
          <Field label="الدور المسؤول">
            <select value={role} onChange={e => setRole(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
              <option value="">—</option>
              <option value="SUPERVISOR">مشرف</option>
              <option value="PRODUCTION_ENGINEER">مهندس إنتاج</option>
              <option value="PRODUCTION_MANAGER">مدير إنتاج</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع الصنف المدخل">
            <input value={inputType} onChange={e => setInputType(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="RAW_BOARD" />
          </Field>
          <Field label="نوع الصنف المخرج">
            <input value={outputType} onChange={e => setOutputType(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="LENGTH_STRIP" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="وحدة المدخل">
            <input value={inputUnit} onChange={e => setInputUnit(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="BOARD" />
          </Field>
          <Field label="وحدة المخرج">
            <input value={outputUnit} onChange={e => setOutputUnit(e.target.value)} dir="ltr"
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="STRIP" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" checked={qaRequired} onChange={e => setQaRequired(e.target.checked)}
            className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
          يتطلب اعتماد جودة
        </label>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || (!stage && !code.trim()) || !name.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {stage ? 'حفظ' : 'إضافة'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>إلغاء</Button>
        </div>
      </form>
    </Modal>
  );
}

// ============================================================
// Transition Modal
// ============================================================

function TransitionModal({ versionId, stages, existingTransitions, onClose, onSaved }: {
  versionId: string;
  stages: RoutingStage[];
  existingTransitions: StageTransition[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [rules, setRules] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!destId) { setError('اختر المرحلة الوجهة'); return; }
    if (sourceId === destId) { setError('لا يمكن أن تكون المرحلتان متطابقتين'); return; }
    // Check duplicate
    const dup = existingTransitions.some(t =>
      (t.source_stage_id ?? '') === sourceId && t.destination_stage_id === destId
    );
    if (dup) { setError('هذا الانتقال موجود بالفعل'); return; }
    setLoading(true);
    setError(null);
    try {
      await createStageTransition({
        routing_version_id: versionId,
        source_stage_id: sourceId || null,
        destination_stage_id: destId,
        transition_rules: rules.trim() || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة انتقال بين المراحل" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="المرحلة المصدر" hint="اختياري — اتركه فارغاً للبداية">
          <select value={sourceId} onChange={e => setSourceId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">— (بداية المسار) —</option>
            {stages.map(s => <option key={s.id} value={s.id}>{s.stage_name} ({s.stage_code})</option>)}
          </select>
        </Field>
        <Field label="المرحلة الوجهة">
          <select value={destId} onChange={e => setDestId(e.target.value)} required
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">اختر المرحلة</option>
            {stages.filter(s => s.id !== sourceId).map(s => <option key={s.id} value={s.id}>{s.stage_name} ({s.stage_code})</option>)}
          </select>
        </Field>
        <Field label="قواعد الانتقال" hint="Transition Rules — اختياري">
          <input value={rules} onChange={e => setRules(e.target.value)} dir="ltr"
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
            placeholder="ITEM_TYPE=LENGTH" />
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || !destId}>
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
// Create Version Modal
// ============================================================

function CreateVersionModal({ templateId, nextVersion, onClose, onCreated }: {
  templateId: string;
  nextVersion: number;
  onClose: () => void;
  onCreated: (v: RoutingVersion) => void;
}) {
  const [version, setVersion] = useState(String(nextVersion));
  const [effectiveDate, setEffectiveDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const v = await createRoutingVersion(templateId, parseInt(version), effectiveDate || undefined);
      onCreated(v);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إنشاء إصدار مسار جديد" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="رقم الإصدار">
            <input type="number" min="1" value={version} onChange={e => setVersion(e.target.value)} required
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
          <Field label="تاريخ السريان" hint="اختياري">
            <input type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}
              className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500" />
          </Field>
        </div>
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-700">
          الإصدار يُنشأ بحالة Draft. يمكن تفعيله بعد إضافة المراحل والانتقالات.
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading}>
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
// Item Rules Tab
// ============================================================

function ItemRulesTab({ templateId }: { templateId: string }) {
  const [rules, setRules] = useState<(RoutingItemRule & { template: RoutingTemplate; model: { id: string; model_code: string; name: string } | null })[]>([]);
  const [models, setModels] = useState<ProductModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<RoutingItemRule | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ruleData, modelData] = await Promise.all([
        fetchRoutingItemRules(templateId),
        fetchProductModels(),
      ]);
      setRules(ruleData);
      setModels(modelData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }, [templateId]);

  useEffect(() => { load(); }, [load]);

  async function handleRemove() {
    if (!removeTarget) return;
    try {
      await deleteRoutingItemRule(removeTarget.id);
      setRemoveTarget(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-slate-700">قواعد ربط الأصناف بالمسار</h4>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="w-3.5 h-3.5" /> قاعدة جديدة
        </Button>
      </div>
      {error && (
        <div className="mb-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4" /> {error}
        </div>
      )}
      {loading ? (
        <div className="py-8 flex items-center justify-center"><Loader2 className="w-5 h-5 text-amber-600 animate-spin" /></div>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">
          لا توجد قواعد. أضف قاعدة لربط نوع صنف أو موديل بهذا المسار.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">نوع الصنف</th>
                <th className="text-right px-4 py-2.5 font-medium text-slate-600">الموديل</th>
                <th className="px-4 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rules.map(r => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-sm text-slate-700" dir="ltr">{r.item_type ?? '—'}</td>
                  <td className="px-4 py-2.5 text-sm text-slate-700">{r.model?.name ?? '—'}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => setRemoveTarget(r)} className="p-1 text-red-400 hover:bg-red-50 rounded">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showAdd && (
        <AddRuleModal templateId={templateId} models={models} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      <ConfirmDialog open={!!removeTarget} title="حذف القاعدة" message="سيتم حذف قاعدة الربط."
        confirmLabel="حذف" variant="danger" onConfirm={handleRemove} onCancel={() => setRemoveTarget(null)} />
    </div>
  );
}

function AddRuleModal({ templateId, models, onClose, onSaved }: {
  templateId: string;
  models: ProductModel[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [itemType, setItemType] = useState('');
  const [modelId, setModelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createRoutingItemRule({
        routing_template_id: templateId,
        item_type: itemType || undefined,
        product_model_id: modelId || undefined,
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open title="إضافة قاعدة ربط" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="نوع الصنف" hint="اختياري">
          <select value={itemType} onChange={e => setItemType(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">—</option>
            <option value="LENGTH">أطوال</option>
            <option value="FRONT">أوجه</option>
            <option value="BACK">ظهور</option>
          </select>
        </Field>
        <Field label="الموديل" hint="اختياري">
          <select value={modelId} onChange={e => setModelId(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500">
            <option value="">—</option>
            {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.model_code})</option>)}
          </select>
        </Field>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</div>}
        <div className="flex gap-2 pt-1">
          <Button type="submit" disabled={loading || (!itemType && !modelId)}>
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

function SummaryBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
      <p className="text-xs font-medium text-slate-500 mb-0.5">{label}</p>
      <p className="text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, children }: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
        active ? 'border-amber-600 text-amber-700' : 'border-transparent text-slate-500 hover:text-slate-700'
      }`}
    >
      {icon && <icon className="w-4 h-4" />}
      {children}
    </button>
  );
}

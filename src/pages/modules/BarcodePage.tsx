import { useState } from 'react';
import {
  Barcode as BarcodeIcon, Search, Loader2, Package, ClipboardList,
  Factory, ShieldCheck, Warehouse, Clock, ArrowLeftRight, Printer,
  AlertCircle, CheckCircle2, XCircle,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { lookupPalletByBarcode } from '@/lib/traceabilityService';
import {
  PALLET_STATUS_LABELS, PALLET_STATUS_COLORS,
  BATCH_STATUS_LABELS, BATCH_STATUS_COLORS,
  WO_STATUS_LABELS, WO_STATUS_COLORS,
  INSPECTION_LABELS, INSPECTION_COLORS,
  MOVEMENT_LABELS, MOVEMENT_COLORS,
} from '@/lib/statusLabels';
import type { PalletLookupResult } from '@/types';

export function BarcodePage() {
  const [searchValue, setSearchValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PalletLookupResult | null>(null);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchValue.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const data = await lookupPalletByBarcode(searchValue.trim());
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'حدث خطأ أثناء البحث');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="إدارة الباركود"
        subtitle="Barcode Management — بحث وتتبع البليتات بالباركود"
      />

      {/* Search */}
      <Card className="mb-6">
        <CardBody>
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                value={searchValue}
                onChange={(e) => setSearchValue(e.target.value)}
                placeholder="أدخل قيمة الباركود (مثال: MES-...)"
                className="w-full pr-11 pl-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                dir="ltr"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={loading || !searchValue.trim()}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              بحث
            </Button>
          </form>
          {error && (
            <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Results */}
      {result ? (
        <PalletDetails result={result} />
      ) : !loading && !error ? (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <EmptyState
            icon={<BarcodeIcon className="w-7 h-7" />}
            title="ابحث بالباركود لعرض التفاصيل"
            description="أدخل قيمة الباركود في خانة البحث أعلاه لعرض جميع بيانات البليت: الدفعة الأم، أمر العمل، المنتج، المرحلة الحالية، الكمية، حالة الجودة، وسجل الحركات الكامل."
          />
        </div>
      ) : null}
    </div>
  );
}

function PalletDetails({ result }: { result: PalletLookupResult }) {
  return (
    <div className="space-y-4">
      {/* Barcode + Pallet overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Barcode card */}
        <Card className="lg:col-span-1">
          <CardHeader title="الباركود" subtitle="Barcode" />
          <CardBody>
            <div className="flex flex-col items-center">
              <div className="w-full bg-slate-50 border-2 border-dashed border-slate-300 rounded-lg p-4 text-center">
                <BarcodeIcon className="w-10 h-10 mx-auto text-slate-700 mb-2" />
                <p className="text-xs font-mono font-bold text-slate-800 break-all" dir="ltr">
                  {result.barcode.barcode_value}
                </p>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Badge color="bg-slate-100 text-slate-600 border-slate-200">
                  {result.barcode.status === 'ACTIVE' ? 'نشط' : 'متقاعد'}
                </Badge>
                <Badge color="bg-blue-50 text-blue-600 border-blue-100">
                  طبعت {result.barcode.print_count} مرة
                </Badge>
              </div>
              {result.barcode.printed_at && (
                <p className="text-xs text-slate-400 mt-2">
                  آخر طباعة: {new Date(result.barcode.printed_at).toLocaleString('ar-EG')}
                </p>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Pallet info */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="معلومات البليت"
            subtitle="Pallet Information"
            action={
              <Badge color={PALLET_STATUS_COLORS[result.pallet.status]}>
                {PALLET_STATUS_LABELS[result.pallet.status]}
              </Badge>
            }
          />
          <CardBody>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <InfoItem label="رقم البليت" value={result.pallet.pallet_number} dir="ltr" />
              <InfoItem label="الكمية" value={`${result.pallet.quantity} قطعة`} />
              <InfoItem label="تاريخ الإنشاء" value={new Date(result.pallet.created_at).toLocaleDateString('ar-EG')} />
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Parent Batch + Work Order + Product */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader title="الدفعة الأم" subtitle="Parent Batch" />
          <CardBody>
            <div className="space-y-3">
              <InfoRow icon={<ClipboardList className="w-4 h-4 text-slate-400" />} label="رقم الدفعة" value={result.parent_batch.batch_number} dir="ltr" />
              <InfoRow label="المخطط" value={`${result.parent_batch.planned_quantity}`} />
              <InfoRow label="الفعلي" value={`${result.parent_batch.actual_quantity}`} />
              <InfoRow label="المتاح" value={`${result.parent_batch.available_quantity}`} />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">الحالة</span>
                <Badge color={BATCH_STATUS_COLORS[result.parent_batch.status]}>
                  {BATCH_STATUS_LABELS[result.parent_batch.status]}
                </Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="أمر العمل" subtitle="Work Order" />
          <CardBody>
            <div className="space-y-3">
              <InfoRow icon={<ClipboardList className="w-4 h-4 text-slate-400" />} label="رقم الأمر" value={result.work_order.wo_number} dir="ltr" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">الحالة</span>
                <Badge color={WO_STATUS_COLORS[result.work_order.status]}>
                  {WO_STATUS_LABELS[result.work_order.status]}
                </Badge>
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="المنتج" subtitle="Product" />
          <CardBody>
            <div className="space-y-3">
              <InfoRow icon={<Package className="w-4 h-4 text-slate-400" />} label="كود الصنف" value={result.product.item_code} dir="ltr" />
              <InfoRow label="الاسم" value={result.product.name} />
              {result.product.name_en && <InfoRow label="English" value={result.product.name_en} dir="ltr" />}
              {result.route && <InfoRow label="المسار" value={result.route.name} />}
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Stage + Machine + Quality + Warehouse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader title="المرحلة والماكينة" subtitle="Stage & Machine" />
          <CardBody>
            <div className="space-y-3">
              {result.stage ? (
                <>
                  <InfoRow icon={<Factory className="w-4 h-4 text-slate-400" />} label="المرحلة" value={result.stage.name} />
                  <InfoRow label="Stage Code" value={result.stage.stage_code} dir="ltr" />
                </>
              ) : (
                <p className="text-sm text-slate-400">لا توجد مرحلة محددة</p>
              )}
              {result.machine && (
                <InfoRow icon={<Factory className="w-4 h-4 text-slate-400" />} label="الماكينة" value={result.machine.name} />
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الجودة والمخزن" subtitle="Quality & Warehouse" />
          <CardBody>
            <div className="space-y-3">
              {result.quality ? (
                <>
                  <InfoRow icon={<ShieldCheck className="w-4 h-4 text-slate-400" />} label="بطاقة الجودة" value={result.quality.card_number} dir="ltr" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">نتيجة الفحص</span>
                    <Badge color={INSPECTION_COLORS[result.quality.inspection_result]}>
                      {INSPECTION_LABELS[result.quality.inspection_result]}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {result.quality.physical_card_confirmed ? (
                      <><CheckCircle2 className="w-4 h-4 text-emerald-600" /><span className="text-xs text-emerald-600">تم تأكيد البطاقة المادية</span></>
                    ) : (
                      <><XCircle className="w-4 h-4 text-slate-400" /><span className="text-xs text-slate-500">البطاقة المادية غير مؤكدة</span></>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-slate-400">لم يتم ربط بطاقة جودة بهذا البليت</p>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Warehouse className="w-4 h-4" /> حالة استلام المخزن
                </span>
                <Badge color={result.warehouse_received ? 'bg-cyan-100 text-cyan-700 border-cyan-200' : 'bg-slate-100 text-slate-600 border-slate-200'}>
                  {result.warehouse_received ? 'تم الاستلام' : 'لم يتم الاستلام'}
                </Badge>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      {/* Movement History */}
      <Card>
        <CardHeader title="سجل الحركات" subtitle="Movement History" />
        <CardBody>
          {result.movements.length > 0 ? (
            <div className="space-y-0">
              {result.movements.map((m, idx) => (
                <div key={m.id} className="flex items-start gap-3 py-3 border-b border-slate-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                    {m.movement_type === 'CREATED' && <Clock className="w-4 h-4 text-slate-500" />}
                    {m.movement_type === 'STAGE_TRANSFER' && <ArrowLeftRight className="w-4 h-4 text-blue-500" />}
                    {m.movement_type === 'SPLIT' && <ArrowLeftRight className="w-4 h-4 text-purple-500" />}
                    {m.movement_type === 'QUALITY_INSPECTION' && <ShieldCheck className="w-4 h-4 text-amber-500" />}
                    {m.movement_type === 'WAREHOUSE_RECEIPT' && <Warehouse className="w-4 h-4 text-cyan-500" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge color={MOVEMENT_COLORS[m.movement_type]}>
                        {MOVEMENT_LABELS[m.movement_type]}
                      </Badge>
                      <span className="text-xs text-slate-500">الكمية: {m.quantity}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                      {m.source_stage && <span>من: {m.source_stage} </span>}
                      {m.destination_stage && <span>إلى: {m.destination_stage}</span>}
                    </p>
                    {m.notes && <p className="text-xs text-slate-500 mt-0.5">{m.notes}</p>}
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {new Date(m.timestamp).toLocaleString('ar-EG')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">لا توجد حركات مسجلة</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function InfoItem({ label, value, dir }: { label: string; value: string; dir?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-700 mt-0.5" dir={dir}>{value}</p>
    </div>
  );
}

function InfoRow({ icon, label, value, dir }: { icon?: React.ReactNode; label: string; value: string; dir?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-slate-500 flex items-center gap-1.5">
        {icon}{label}
      </span>
      <span className="text-sm font-medium text-slate-700" dir={dir}>{value}</span>
    </div>
  );
}

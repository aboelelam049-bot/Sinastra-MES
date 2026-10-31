import { PlaceholderPage } from '../PlaceholderPage';
import { ShieldCheck } from 'lucide-react';

export function QualityControlPage() {
  return (
    <PlaceholderPage
      title="مراقبة الجودة"
      subtitle="Quality Control"
      icon={ShieldCheck}
      description="ستتيح هذه الوحدة إدارة فحوصات الجودة: إنشاء معايير الفحص، تسجيل نتائج الفحص، اعتماد أو رفض المنتجات، وتتبع معدلات الجودة."
    />
  );
}

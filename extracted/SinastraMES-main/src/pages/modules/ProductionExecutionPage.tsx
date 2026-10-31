import { PlaceholderPage } from '../PlaceholderPage';
import { PlayCircle } from 'lucide-react';

export function ProductionExecutionPage() {
  return (
    <PlaceholderPage
      title="تنفيذ الإنتاج"
      subtitle="Production Execution"
      icon={PlayCircle}
      description="ستتيح هذه الوحدة تسجيل عمليات الإنتاج الفعلية: بدء/إيقاف العمليات، تسجيل الكميات المنجزة، تتبع الوقت الفعلي، ومراحل التنفيذ."
    />
  );
}

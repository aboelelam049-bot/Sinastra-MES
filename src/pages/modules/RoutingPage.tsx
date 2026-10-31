import { PlaceholderPage } from '../PlaceholderPage';
import { GitBranch } from 'lucide-react';

export function RoutingPage() {
  return (
    <PlaceholderPage
      title="المسارات وسير العمل"
      subtitle="Routing & Workflow"
      icon={GitBranch}
      description="ستتيح هذه الوحدة إنشاء وإدارة مسارات الإنتاج (Production Routes) وخطوات سير العمل القابلة للتكوين لكل منتج."
    />
  );
}

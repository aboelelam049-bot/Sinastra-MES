import { EmptyState } from '@/components/ui/EmptyState';
import { PageHeader } from '@/components/ui/PageHeader';
import { getIcon } from '@/lib/icons';
import type { ElementType } from 'react';

interface PlaceholderPageProps {
  title: string;
  subtitle: string;
  icon: ElementType;
  description: string;
}

export function PlaceholderPage({ title, subtitle, icon: Icon, description }: PlaceholderPageProps) {
  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} />
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <EmptyState
          icon={<Icon className="w-7 h-7" />}
          title="هذه الوحدة قيد التطوير"
          description={description}
        />
      </div>
    </div>
  );
}

// Helper to create a placeholder page from a module key
export function createPlaceholderPage(
  title: string,
  subtitle: string,
  iconName: string,
  description: string,
) {
  const Icon = getIcon(iconName);
  return function GeneratedPlaceholder() {
    return <PlaceholderPage title={title} subtitle={subtitle} icon={Icon} description={description} />;
  };
}

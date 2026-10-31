import { useState } from 'react';
import { Sidebar } from '@/components/layout/Sidebar';
import { TopBar } from '@/components/layout/TopBar';
import { MobileNav } from '@/components/layout/MobileNav';
import { PageRouter } from '@/components/PageRouter';
import { getNavItem } from '@/lib/navigation';
import { MODULE_ACCESS } from '@/lib/roles';
import { EmptyState } from '@/components/ui/EmptyState';
import { ShieldX } from 'lucide-react';
import type { ModuleKey } from '@/types';

interface AppShellProps {
  activeModule: ModuleKey;
  onNavigate: (key: ModuleKey) => void;
  userRole: string;
}

export function AppShell({ activeModule, onNavigate, userRole }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const navItem = getNavItem(activeModule);
  const breadcrumb = ['الرئيسية', navItem?.label ?? ''];
  const allowedModules = MODULE_ACCESS[userRole as keyof typeof MODULE_ACCESS] ?? [];

  const hasAccess = allowedModules.includes(activeModule);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden" dir="rtl">
      <Sidebar
        activeModule={activeModule}
        onNavigate={onNavigate}
        userRole={userRole as never}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed(!collapsed)}
      />

      <MobileNav
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        activeModule={activeModule}
        onNavigate={onNavigate}
        userRole={userRole as never}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          onOpenMobileNav={() => setMobileNavOpen(true)}
          breadcrumb={breadcrumb}
        />

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {hasAccess ? (
            <PageRouter module={activeModule} />
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <EmptyState
                icon={<ShieldX className="w-7 h-7" />}
                title="لا تملك صلاحية الوصول"
                description="هذه الوحدة غير متاحة لدورك الحالي. يرجى التواصل مع مدير النظام إذا كنت تعتقد أن هذا خطأ."
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

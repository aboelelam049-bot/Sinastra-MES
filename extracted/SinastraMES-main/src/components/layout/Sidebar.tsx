import { useState } from 'react';
import { ChevronLeft, Factory } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';
import { MODULE_ACCESS } from '@/lib/roles';
import { getIcon } from '@/lib/icons';
import type { ModuleKey, UserRole } from '@/types';

interface SidebarProps {
  activeModule: ModuleKey;
  onNavigate: (key: ModuleKey) => void;
  userRole: UserRole;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({ activeModule, onNavigate, userRole, collapsed, onToggleCollapse }: SidebarProps) {
  const allowedModules = MODULE_ACCESS[userRole] ?? [];
  const [hovered, setHovered] = useState<string | null>(null);

  return (
    <aside
      className={`hidden lg:flex flex-col bg-slate-900 text-slate-300 transition-all duration-300 ${
        collapsed ? 'w-[68px]' : 'w-[260px]'
      }`}
    >
      {/* Logo */}
      <div className="h-16 flex items-center gap-3 px-4 border-b border-slate-800 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center shrink-0">
          <Factory className="w-5 h-5 text-white" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-sm font-bold text-white whitespace-nowrap">نظام MES</p>
            <p className="text-[10px] text-slate-400 whitespace-nowrap">مصنع مكبرات الصوت</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const isAllowed = allowedModules.includes(item.key);
            if (!isAllowed) return null;

            const Icon = getIcon(item.icon);
            const isActive = activeModule === item.key;
            const showLabel = !collapsed;
            const isHovered = hovered === item.key;

            return (
              <li key={item.key}>
                <button
                  onClick={() => onNavigate(item.key)}
                  onMouseEnter={() => setHovered(item.key)}
                  onMouseLeave={() => setHovered(null)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-amber-600 text-white'
                      : isHovered
                      ? 'bg-slate-800 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={collapsed ? item.label : undefined}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  {showLabel && <span className="truncate text-right flex-1">{item.label}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-slate-800 p-2 shrink-0">
        <button
          onClick={onToggleCollapse}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          <ChevronLeft className={`w-4 h-4 transition-transform ${collapsed ? 'rotate-180' : ''}`} />
          {!collapsed && <span>طي القائمة</span>}
        </button>
      </div>
    </aside>
  );
}

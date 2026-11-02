import { X, Factory } from 'lucide-react';
import { NAV_ITEMS } from '@/lib/navigation';
import { MODULE_ACCESS } from '@/lib/roles';
import { getIcon } from '@/lib/icons';
import { isModuleEnabled, type ModuleSetting } from '@/lib/moduleSettings';
import type { ModuleKey, UserRole } from '@/types';

interface MobileNavProps {
  open: boolean;
  onClose: () => void;
  activeModule: ModuleKey;
  onNavigate: (key: ModuleKey) => void;
  userRole: UserRole;
  moduleSettings?: ModuleSetting[] | null;
}

export function MobileNav({ open, onClose, activeModule, onNavigate, userRole, moduleSettings }: MobileNavProps) {
  const allowedModules = MODULE_ACCESS[userRole] ?? [];

  return (
    <>
      {open && (
        <div className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden" onClick={onClose} />
      )}

      <div
        className={`fixed top-0 right-0 h-full w-[280px] bg-slate-900 text-slate-300 z-50 lg:hidden transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-600 flex items-center justify-center">
              <Factory className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">نظام MES</p>
              <p className="text-[10px] text-slate-400">مصنع مكبرات الصوت</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto py-3 px-2 h-[calc(100%-4rem)]">
          <ul className="space-y-0.5">
            {NAV_ITEMS.map((item) => {
              const isAllowed = allowedModules.includes(item.key);
              if (!isAllowed) return null;
              if (!isModuleEnabled(moduleSettings ?? null, item.key)) return null;

              const Icon = getIcon(item.icon);
              const isActive = activeModule === item.key;

              return (
                <li key={item.key}>
                  <button
                    onClick={() => { onNavigate(item.key); onClose(); }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      isActive ? 'bg-amber-600 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate text-right">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </>
  );
}

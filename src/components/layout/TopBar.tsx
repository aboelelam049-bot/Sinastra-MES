import { useState, useRef, useEffect } from 'react';
import { Bell, Menu, LogOut, ChevronDown, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getRoleLabel, ROLE_COLORS } from '@/lib/roles';

interface TopBarProps {
  onOpenMobileNav: () => void;
  breadcrumb: string[];
}

export function TopBar({ onOpenMobileNav, breadcrumb }: TopBarProps) {
  const { profile, signOut } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-6 shrink-0">
      {/* Mobile menu + Breadcrumb */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onOpenMobileNav}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 text-slate-600"
        >
          <Menu className="w-5 h-5" />
        </button>
        <nav className="flex items-center gap-2 text-sm min-w-0">
          {breadcrumb.map((crumb, idx) => (
            <span key={idx} className="flex items-center gap-2 min-w-0">
              {idx > 0 && <span className="text-slate-300">/</span>}
              <span className={idx === breadcrumb.length - 1 ? 'font-medium text-slate-700 truncate' : 'text-slate-400 truncate'}>
                {crumb}
              </span>
            </span>
          ))}
        </nav>
      </div>

      {/* Right side: notifications + user */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setNotifOpen(!notifOpen)}
            className="relative p-2 rounded-lg hover:bg-slate-100 text-slate-600"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full ring-2 ring-white" />
          </button>
          {notifOpen && (
            <div className="absolute left-0 mt-2 w-72 bg-white rounded-xl border border-slate-200 shadow-lg z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">الإشعارات</p>
              </div>
              <div className="py-6 text-center">
                <p className="text-sm text-slate-400">لا توجد إشعارات حالياً</p>
              </div>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="hidden sm:block text-right">
              <p className="text-xs font-semibold text-slate-700 leading-tight">
                {profile?.full_name || 'مستخدم'}
              </p>
              <p className="text-[10px] text-slate-500 leading-tight">
                {profile ? getRoleLabel(profile.role) : ''}
              </p>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 hidden sm:block" />
          </button>
          {menuOpen && (
            <div className="absolute left-0 mt-2 w-56 bg-white rounded-xl border border-slate-200 shadow-lg z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-700">{profile?.full_name || 'مستخدم'}</p>
                {profile && (
                  <span className={`inline-block mt-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border ${ROLE_COLORS[profile.role]}`}>
                    {getRoleLabel(profile.role)}
                  </span>
                )}
              </div>
              <button
                onClick={() => { setMenuOpen(false); signOut(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 rounded-b-xl transition-colors"
              >
                <LogOut className="w-4 h-4" />
                تسجيل الخروج
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

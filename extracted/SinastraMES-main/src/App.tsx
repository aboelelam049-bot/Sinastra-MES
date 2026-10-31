import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { LoginPage } from '@/pages/LoginPage';
import { AppShell } from '@/components/AppShell';
import { Loader2 } from 'lucide-react';
import type { ModuleKey } from '@/types';

function AppContent() {
  const { user, profile, loading } = useAuth();
  const [activeModule, setActiveModule] = useState<ModuleKey>('dashboard');

  // Reset to dashboard when user changes
  useEffect(() => {
    if (!user) setActiveModule('dashboard');
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  // If profile hasn't loaded yet but user exists, show loader
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">جارٍ تحميل الملف الشخصي...</p>
        </div>
      </div>
    );
  }

  if (!profile.is_active) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4" dir="rtl">
        <div className="max-w-md text-center">
          <h2 className="text-lg font-bold text-slate-800 mb-2">الحساب غير نشط</h2>
          <p className="text-sm text-slate-500">
            تم إيقاف حسابك. يرجى التواصل مع مدير النظام لإعادة تفعيل الحساب.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      activeModule={activeModule}
      onNavigate={setActiveModule}
      userRole={profile.role}
    />
  );
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

export default App;

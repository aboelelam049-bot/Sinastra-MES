import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: string; positive: boolean };
  isPlaceholder?: boolean;
}

export function StatCard({
  label,
  value,
  icon: Icon,
  iconColor = 'text-slate-600',
  iconBg = 'bg-slate-100',
  trend,
  isPlaceholder = false,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-bold text-slate-800 mt-2">
            {isPlaceholder ? '—' : value}
          </p>
          {trend && !isPlaceholder && (
            <p className={`text-xs mt-1.5 font-medium ${trend.positive ? 'text-emerald-600' : 'text-red-500'}`}>
              {trend.value}
            </p>
          )}
          {isPlaceholder && (
            <span className="inline-block mt-2 text-[10px] font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-100">
              بيانات تجريبية
            </span>
          )}
        </div>
        <div className={`w-11 h-11 rounded-lg flex items-center justify-center ${iconBg}`}>
          <Icon className={`w-5.5 h-5.5 ${iconColor}`} size={22} />
        </div>
      </div>
    </div>
  );
}

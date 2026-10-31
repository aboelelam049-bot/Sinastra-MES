import type { ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open, title, message,
  confirmLabel = 'تأكيد', cancelLabel = 'إلغاء',
  variant = 'default',
  onConfirm, onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={onCancel}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <div className="flex items-start gap-3 mb-4">
            {variant === 'danger' && (
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
            )}
            <div>
              <h3 className="text-base font-semibold text-slate-800">{title}</h3>
              <p className="text-sm text-slate-500 mt-1">{message}</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button variant="secondary" size="sm" onClick={onCancel}>{cancelLabel}</Button>
            <Button variant={variant === 'danger' ? 'danger' : 'primary'} size="sm" onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Modal({
  open, title, onClose, children, maxWidth = 'max-w-md',
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: string;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 px-4" onClick={onClose}>
      <div className={`bg-white rounded-2xl shadow-xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto`} onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold text-slate-800">{title}</h3>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

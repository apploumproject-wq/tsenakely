import React from 'react';
import {AlertTriangle, X} from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = true,
  loading = false,
  onConfirm,
  onCancel,
  children,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl bg-white border border-slate-200 p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                danger
                  ? 'bg-red-50 text-red-600'
                  : 'bg-sky-50 text-[#0F294A]'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3
                id="confirm-dialog-title"
                className="text-base font-bold text-slate-900"
              >
                {title}
              </h3>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                {message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[40px] min-w-[40px] -mt-1 -mr-1 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
            aria-label="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {children && <div className="mt-4">{children}</div>}

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className="min-h-[44px] px-4 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-semibold text-white transition-colors cursor-pointer disabled:opacity-50 ${
              danger
                ? 'bg-red-600 hover:bg-red-700'
                : 'bg-[#0F294A] hover:bg-[#163A66]'
            }`}
          >
            {loading ? 'Traitement...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

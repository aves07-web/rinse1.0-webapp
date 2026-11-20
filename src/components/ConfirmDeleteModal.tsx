import { useEffect, useRef } from 'react';
import { AlertTriangle, ShieldAlert, Trash2, X } from 'lucide-react';

export interface DeleteConfirmationRequest {
  itemType: string;
  itemNameOrId: string;
  bodyText: string;
  linkedInfo?: string;
  bulkCount?: number;
  accountingProtected?: boolean;
  confirmLabel?: string;
  alternativeLabel?: string;
  onAlternative?: () => void;
  onConfirmDelete?: () => void;
}

interface ConfirmDeleteModalProps {
  request: DeleteConfirmationRequest | null;
  onCancel: () => void;
}

export function ConfirmDeleteModal({ request, onCancel }: ConfirmDeleteModalProps) {
  const cancelBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!request) return;
    // Focus safe Cancel button by default
    const timer = window.setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 10);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      } else if (e.key === 'Enter') {
        // Enter must NEVER trigger Delete automatically
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl?.dataset.deleteAction === 'confirm') {
          e.preventDefault();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [request, onCancel]);

  if (!request) return null;

  const title = request.accountingProtected
    ? `Cannot Delete ${request.itemType}`
    : request.bulkCount && request.bulkCount > 1
    ? `Delete ${request.bulkCount} items?`
    : `Delete ${request.itemType}?`;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-delete-title"
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 text-slate-900"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const target = e.target as HTMLElement;
            if (target.dataset.deleteAction === 'confirm') {
              e.preventDefault();
            }
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                request.accountingProtected
                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                  : 'bg-red-50 text-red-600 border border-red-200'
              }`}
            >
              {request.accountingProtected ? (
                <ShieldAlert className="w-4 h-4" />
              ) : (
                <AlertTriangle className="w-4 h-4" />
              )}
            </div>
            <div>
              <h3 id="confirm-delete-title" className="text-base font-semibold text-slate-900">
                {title}
              </h3>
              {request.itemNameOrId && (
                <p className="text-xs font-mono text-slate-500 mt-0.5">{request.itemNameOrId}</p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2.5 text-xs leading-relaxed text-slate-700">
          <p>{request.bodyText}</p>
          {request.linkedInfo && (
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 font-medium">
              {request.linkedInfo}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            ref={cancelBtnRef}
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-xl btn-secondary focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
          >
            Cancel
          </button>

          {request.alternativeLabel && request.onAlternative && (
            <button
              type="button"
              onClick={() => {
                request.onAlternative?.();
                onCancel();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-xl btn-primary focus:outline-none focus:ring-2 focus:ring-[#0071E3]"
            >
              {request.alternativeLabel}
            </button>
          )}

          {!request.accountingProtected && request.onConfirmDelete && (
            <button
              type="button"
              data-delete-action="confirm"
              onClick={() => {
                request.onConfirmDelete?.();
                onCancel();
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-danger"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {request.confirmLabel || 'Delete'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useRef } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, X } from 'lucide-react';

export interface ZeroPriceAffectedLine {
  rowKey: string;
  productName: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  issue: 'zero-price' | 'zero-qty';
}

interface ZeroPriceWarningModalProps {
  open: boolean;
  lines: ZeroPriceAffectedLine[];
  currencySymbol: string;
  onGoBackAndFix: () => void;
  onContinue: () => void;
}

export function ZeroPriceWarningModal({
  open,
  lines,
  currencySymbol,
  onGoBackAndFix,
  onContinue,
}: ZeroPriceWarningModalProps) {
  const goBackRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => goBackRef.current?.focus(), 10);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onGoBackAndFix();
      } else if (e.key === 'Enter') {
        // Escape and clicking outside mean Go Back; Enter must not accidentally Continue
        const active = document.activeElement as HTMLElement | null;
        if (active?.dataset.zeroAction === 'continue') {
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, onGoBackAndFix]);

  if (!open) return null;

  const hasZeroQty = lines.some((l) => l.issue === 'zero-qty');
  const zeroPriceCount = lines.filter((l) => l.issue === 'zero-price').length;

  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/35 backdrop-blur-xs"
      onClick={onGoBackAndFix}
      role="dialog"
      aria-modal="true"
      aria-labelledby="zero-price-title"
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl border border-amber-300 shadow-2xl p-6 space-y-4 text-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 id="zero-price-title" className="text-base font-semibold text-slate-900">
                Zero price detected
              </h3>
              <p className="text-xs text-slate-500">
                {zeroPriceCount > 0 && `${zeroPriceCount} zero-price line(s)`}
                {zeroPriceCount > 0 && hasZeroQty ? ' · ' : ''}
                {hasZeroQty && 'Zero-quantity line(s) flagged'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onGoBackAndFix}
            aria-label="Go Back"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-slate-700 leading-relaxed">
          {hasZeroQty
            ? 'Zero-quantity lines cannot be billed, and zero-price items will be billed as free. Please review the affected lines below:'
            : 'These items have a price of 0 and will be billed as free. Do you want to continue?'}
        </p>

        <div className="overflow-x-auto border border-slate-200 rounded-xl">
          <table className="w-full text-left text-xs border-collapse erp-table">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 px-3">Product</th>
                <th className="py-2 px-3">Service</th>
                <th className="py-2 px-3 text-right">Quantity</th>
                <th className="py-2 px-3 text-right">Unit Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 tabular-nums">
              {lines.map((line) => (
                <tr key={line.rowKey}>
                  <td className="py-2 px-3 font-medium text-slate-900">{line.productName}</td>
                  <td className="py-2 px-3 text-slate-700">{line.serviceName}</td>
                  <td
                    className={`py-2 px-3 text-right font-mono ${
                      line.issue === 'zero-qty' ? 'text-red-600 font-bold' : 'text-slate-800'
                    }`}
                  >
                    {line.quantity}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-red-600 font-semibold">
                    {currencySymbol} {line.unitPrice.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-100">
          <button
            ref={goBackRef}
            type="button"
            onClick={onGoBackAndFix}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Go Back and Fix
          </button>

          {!hasZeroQty && (
            <button
              type="button"
              data-zero-action="continue"
              onClick={onContinue}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-600 text-white hover:bg-amber-700"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Yes, Continue
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

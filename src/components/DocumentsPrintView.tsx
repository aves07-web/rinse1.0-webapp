import { useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Pencil,
  Printer,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { ErpState } from '../types/erp';
import { formatMoney } from '../utils/accounting';
import { exportInvoiceToA4Pdf } from '../utils/pdfExport';
import {
  DEFAULT_ID_FORMATS,
  getExistingIdsForType,
  validateCustomSmartId,
} from '../utils/smartId';
import { A4InvoiceDocument } from './A4InvoiceDocument';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';
import { QrCanvas } from './QrCanvas';

interface DocumentsPrintViewProps {
  state: ErpState;
  initialMode?: 'invoice' | 'token';
  initialId?: string;
  canEditIssuedIds?: boolean;
  onRecordPrint: (kind: 'Invoice' | 'Token', id: string) => void;
  onRenameInvoiceId?: (oldId: string, newId: string) => boolean;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
  onGoToAccounting?: () => void;
}

export function DocumentsPrintView({
  state,
  initialMode = 'invoice',
  initialId,
  canEditIssuedIds = false,
  onRecordPrint,
  onRenameInvoiceId,
  onRequestDelete,
  onGoToAccounting,
}: DocumentsPrintViewProps) {
  const sym = state.settings.currencySymbol;
  const [docTab, setDocTab] = useState<'invoice' | 'token'>(initialMode);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(
    initialMode === 'invoice' && initialId ? initialId : state.invoices[0]?.id || ''
  );
  const [selectedOrderId, setSelectedOrderId] = useState(
    initialMode === 'token' && initialId ? initialId : state.orders[0]?.id || ''
  );
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Token Designer Customizations
  const [tokenWidthMm, setTokenWidthMm] = useState(state.settings.tokenWidthMm);
  const [tokenHeightMm, setTokenHeightMm] = useState(state.settings.tokenHeightMm);
  const [showQr, setShowQr] = useState(state.settings.tokenShowQr);
  const [showCustomerId, setShowCustomerId] = useState(true);
  const [showDates, setShowDates] = useState(true);
  const [showSummary, setShowSummary] = useState(true);
  const [customHeader, setCustomHeader] = useState(state.settings.companyName);

  const [editingInvId, setEditingInvId] = useState(false);
  const [renameInvInput, setRenameInvInput] = useState('');
  const [renameInvErr, setRenameInvErr] = useState('');

  const invoice =
    state.invoices.find((inv) => inv.id === selectedInvoiceId) || state.invoices[0] || null;
  const order = state.orders.find((o) => o.id === selectedOrderId) || state.orders[0] || null;

  const handlePrint = (kind: 'Invoice' | 'Token', id: string) => {
    onRecordPrint(kind, id);
    window.print();
  };

  const handleExportPdf = async () => {
    if (!invoice) return;
    setExportingPdf(true);
    try {
      await exportInvoiceToA4Pdf(invoice, state.settings);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="no-print flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Invoices, Work Slips &amp; Token Printer
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            A4 white-background printable invoices with company branding &amp; PDF export, plus customizable compact laundry tokens
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setDocTab('invoice')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              docTab === 'invoice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            A4 Customer Invoice
          </button>
          <button
            onClick={() => setDocTab('token')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              docTab === 'token' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            <Tag className="w-3.5 h-3.5" />
            Small Token &amp; Work Slip
          </button>
        </div>
      </div>

      {docTab === 'invoice' && (
        <div className="space-y-4">
          <div className="no-print liquid-glass rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <label className="text-xs font-medium text-slate-600">Select Invoice:</label>
              <select
                value={invoice?.id || ''}
                onChange={(e) => setSelectedInvoiceId(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-xl bg-white border border-slate-200"
              >
                {state.invoices.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.id} — {inv.customerName} ({formatMoney(inv.grandTotal, sym)})
                  </option>
                ))}
              </select>
              {invoice && (
                <span className="text-xs text-slate-500">
                  Reprints: <strong className="font-mono">{invoice.reprintCount}</strong>
                </span>
              )}
            </div>

            {invoice && (
              <div className="flex flex-wrap items-center gap-2">
                {canEditIssuedIds && onRenameInvoiceId && !editingInvId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingInvId(true);
                      setRenameInvInput(invoice.id);
                      setRenameInvErr('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xl btn-secondary"
                    title="Authorized Invoice ID change (logged to Black Box)"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit ID
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Preview
                </button>

                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-xl btn-secondary disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  {exportingPdf ? 'Generating PDF...' : 'Export PDF'}
                </button>

                <button
                  type="button"
                  onClick={() => handlePrint('Invoice', invoice.id)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>

                {onRequestDelete && (
                  <button
                    type="button"
                    onClick={() =>
                      onRequestDelete({
                        itemType: 'Posted Invoice',
                        itemNameOrId: `${invoice.id} · ${invoice.customerName}`,
                        bodyText: `Posted invoice ${invoice.id} (${formatMoney(
                          invoice.grandTotal,
                          sym
                        )}) cannot be plain-deleted under double-entry accounting rules.`,
                        linkedInfo:
                          'To void or correct a posted invoice, post a reversing journal entry in Accounting so the audit trail stays intact.',
                        accountingProtected: true,
                        alternativeLabel: onGoToAccounting ? 'Go to Accounting Reversals' : undefined,
                        onAlternative: onGoToAccounting,
                      })
                    }
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    title="Delete Invoice (Accounting Protected)"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>

          {editingInvId && invoice && (
            <div className="no-print liquid-glass rounded-2xl p-4 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-700">New Invoice ID:</span>
              <input
                value={renameInvInput}
                maxLength={30}
                onChange={(e) => {
                  setRenameInvInput(e.target.value);
                  setRenameInvErr('');
                }}
                className="px-3 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
              />
              <button
                type="button"
                onClick={() => {
                  const rule = invoice.isCorporate
                    ? state.idFormats?.corporateInvoice || DEFAULT_ID_FORMATS.corporateInvoice
                    : state.idFormats?.retailInvoice || DEFAULT_ID_FORMATS.retailInvoice;
                  const existing = new Set(
                    Array.from(getExistingIdsForType(state, 'retailInvoice')).filter(
                      (x) => x !== invoice.id.toLowerCase()
                    )
                  );
                  const check = validateCustomSmartId(renameInvInput, existing, rule);
                  if (!check.valid) {
                    setRenameInvErr(check.error || 'Invalid Invoice ID');
                    return;
                  }
                  if (onRenameInvoiceId?.(invoice.id, check.cleanId)) {
                    setSelectedInvoiceId(check.cleanId);
                    setEditingInvId(false);
                  }
                }}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg btn-primary"
              >
                Save &amp; Log
              </button>
              <button
                type="button"
                onClick={() => setEditingInvId(false)}
                className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800"
              >
                Cancel
              </button>
              {renameInvErr && <span className="text-xs text-red-600">{renameInvErr}</span>}
            </div>
          )}

          {invoice ? (
            <div className="overflow-x-auto pb-4">
              <A4InvoiceDocument invoice={invoice} settings={state.settings} />
            </div>
          ) : (
            <div className="liquid-glass rounded-2xl p-8 text-center text-sm text-slate-500">
              No invoices available yet.
            </div>
          )}
        </div>
      )}

      {docTab === 'token' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="no-print lg:col-span-5 liquid-glass rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">Token &amp; Work Slip Profile</h2>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Order</label>
              <select
                value={order?.id || ''}
                onChange={(e) => setSelectedOrderId(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {state.orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.id} — {o.customerName} ({o.stage})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Width (mm)</label>
                <input
                  type="number"
                  min={40}
                  max={110}
                  value={tokenWidthMm}
                  onChange={(e) => setTokenWidthMm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Height (mm)</label>
                <input
                  type="number"
                  min={35}
                  max={140}
                  value={tokenHeightMm}
                  onChange={(e) => setTokenHeightMm(Number(e.target.value))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Header Text</label>
              <input
                value={customHeader}
                onChange={(e) => setCustomHeader(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} />
                Include Scannable QR Code
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCustomerId}
                  onChange={(e) => setShowCustomerId(e.target.checked)}
                />
                Show Customer ID
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showDates}
                  onChange={(e) => setShowDates(e.target.checked)}
                />
                Show Receiving &amp; Expected Delivery Dates
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showSummary}
                  onChange={(e) => setShowSummary(e.target.checked)}
                />
                Show Item Summary
              </label>
            </div>

            {order && (
              <button
                onClick={() => handlePrint('Token', order.id)}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl btn-primary"
              >
                <Printer className="w-3.5 h-3.5" />
                Print Compact Token
              </button>
            )}
          </div>

          <div className="lg:col-span-7 flex items-center justify-center p-6 liquid-glass rounded-2xl">
            {order ? (
              <div
                className="print-only-container bg-white border border-slate-300 rounded-lg p-3 text-slate-900 shadow-sm flex flex-col justify-between"
                style={{
                  width: `${Math.max(220, tokenWidthMm * 4.2)}px`,
                  minHeight: `${Math.max(170, tokenHeightMm * 4.2)}px`,
                }}
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-200 pb-2">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wide text-slate-900">
                      {customHeader}
                    </p>
                    <p className="text-sm font-mono font-bold text-[#0071E3]">{order.id}</p>
                  </div>
                  {showQr && (
                    <QrCanvas value={`${order.id}|${order.customerId}|${order.stage}`} size={52} />
                  )}
                </div>

                <div className="py-2 space-y-1 text-[11px]">
                  <p className="font-semibold text-slate-900">
                    {order.customerName}{' '}
                    {showCustomerId && (
                      <span className="font-mono text-slate-500">({order.customerId})</span>
                    )}
                  </p>
                  {showDates && (
                    <p className="text-slate-600 font-mono text-[10px]">
                      In: {new Date(order.createdAt).toLocaleDateString()} · Due:{' '}
                      {new Date(order.expectedDeliveryAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  )}
                  {showSummary && (
                    <div className="pt-1 border-t border-dashed border-slate-200 space-y-0.5">
                      {order.lines.map((l) => (
                        <p key={l.id} className="text-[10px] text-slate-800">
                          {l.quantityOrdered}x {l.productName} ({l.serviceName})
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-1.5 border-t border-slate-200 flex items-center justify-between text-[10px] text-slate-500">
                  <span>{order.deliveryOptionName}</span>
                  <span>{state.settings.tokenCustomFooter}</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Select an order to preview token.</p>
            )}
          </div>
        </div>
      )}

      {/* Full A4 Preview Modal */}
      {previewModalOpen && invoice && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-8 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setPreviewModalOpen(false)}
        >
          <div
            className="w-full max-w-4xl bg-slate-100 rounded-2xl border border-slate-300 shadow-2xl overflow-hidden my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold text-slate-800">
                A4 Print Preview (210 × 297 mm) — {invoice.id}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exportingPdf}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg btn-secondary"
                >
                  <Download className="w-3.5 h-3.5" />
                  Export PDF
                </button>
                <button
                  type="button"
                  onClick={() => handlePrint('Invoice', invoice.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg btn-primary"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="p-4 sm:p-6 overflow-x-auto max-h-[82vh] overflow-y-auto">
              <A4InvoiceDocument invoice={invoice} settings={state.settings} isPreviewFrame />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

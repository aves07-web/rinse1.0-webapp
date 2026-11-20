import { useMemo, useState } from 'react';
import {
  Download,
  Eye,
  FileText,
  Pencil,
  Plus,
  Printer,
  SlidersHorizontal,
  Tag,
  Trash2,
  X,
} from 'lucide-react';
import { ErpState, InvoiceLineSnapshot } from '../types/erp';
import { dateInputToIso, formatMoney, getMoneySourceAccounts, toDateInputValue } from '../utils/accounting';
import { exportInvoiceToA4Pdf } from '../utils/pdfExport';
import {
  DEFAULT_ID_FORMATS,
  generateNextSmartId,
  getExistingIdsForType,
  validateCustomSmartId,
} from '../utils/smartId';
import { A4InvoiceDocument } from './A4InvoiceDocument';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';
import { QrCanvas } from './QrCanvas';

interface DocumentsPrintViewProps {
  state: ErpState;
  isOwner?: boolean;
  initialMode?: 'invoice' | 'token';
  initialId?: string;
  canEditIssuedIds?: boolean;
  onRecordPrint: (kind: 'Invoice' | 'Token', id: string) => void;
  onRenameInvoiceId?: (oldId: string, newId: string) => boolean;
  onOwnerCreateCustomInvoice?: (params: {
    isCorporate: boolean;
    customerId: string;
    issuedAt: string;
    dueDate: string;
    periodCovered?: string;
    paymentTerms: string;
    termsAndConditions: string;
    lines: InvoiceLineSnapshot[];
    discountTotal: number;
    extraCharges: number;
    paidAmount: number;
    paymentAccountCode?: string;
    customInvoiceId?: string;
  }) => void;
  onOwnerCustomizeInvoice?: (
    invoiceId: string,
    updated: {
      issuedAt: string;
      dueDate: string;
      customerName: string;
      customerPhone: string;
      customerAddress: string;
      periodCovered?: string;
      paymentTerms: string;
      termsAndConditions: string;
      lines: InvoiceLineSnapshot[];
      discountTotal: number;
      extraCharges: number;
      paidAmount: number;
      paymentAccountCode?: string;
    }
  ) => void;
  onOwnerDeleteInvoice?: (invoiceId: string) => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
  onGoToAccounting?: () => void;
}

export function DocumentsPrintView({
  state,
  isOwner = false,
  initialMode = 'invoice',
  initialId,
  canEditIssuedIds = false,
  onRecordPrint,
  onRenameInvoiceId,
  onOwnerCreateCustomInvoice,
  onOwnerCustomizeInvoice,
  onOwnerDeleteInvoice,
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

  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultMoneyCode = moneyAccounts[0]?.code || '1010';

  // Owner Customize Invoice Modal State
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [cIssuedAt, setCIssuedAt] = useState('');
  const [cDueDate, setCDueDate] = useState('');
  const [cCustName, setCCustName] = useState('');
  const [cCustPhone, setCCustPhone] = useState('');
  const [cCustAddr, setCCustAddr] = useState('');
  const [cPeriod, setCPeriod] = useState('');
  const [cPayTerms, setCPayTerms] = useState('');
  const [cTermsCond, setCTermsCond] = useState('');
  const [cLines, setCLines] = useState<InvoiceLineSnapshot[]>([]);
  const [cDiscount, setCDiscount] = useState(0);
  const [cExtra, setCExtra] = useState(0);
  const [cPaid, setCPaid] = useState(0);
  const [cPayAcc, setCPayAcc] = useState(defaultMoneyCode);

  // Owner Create Custom Invoice Modal State
  const [newInvModalOpen, setNewInvModalOpen] = useState(false);
  const [nIsCorp, setNIsCorp] = useState(false);
  const [nCustomerId, setNCustomerId] = useState(state.customers[0]?.id || '');
  const [nCustomId, setNCustomId] = useState('');
  const [nIssuedAt, setNIssuedAt] = useState(() => toDateInputValue());
  const [nDueDate, setNDueDate] = useState(() => toDateInputValue());
  const [nPeriod, setNPeriod] = useState('');
  const [nPayTerms, setNPayTerms] = useState('Due on Receipt');
  const [nTermsCond, setNTermsCond] = useState(state.settings.invoiceTerms);
  const [nLines, setNLines] = useState<InvoiceLineSnapshot[]>([
    { productName: 'Shirt', serviceName: 'Wash & Iron', quantity: 1, unitPrice: 100, discount: 0, total: 100 },
  ]);
  const [nDiscount, setNDiscount] = useState(0);
  const [nExtra, setNExtra] = useState(0);
  const [nPaid, setNPaid] = useState(0);
  const [nPayAcc, setNPayAcc] = useState(defaultMoneyCode);

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
                {isOwner && onOwnerCreateCustomInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      setNIsCorp(false);
                      setNCustomerId(state.customers[0]?.id || '');
                      setNCustomId(generateNextSmartId(state, 'retailInvoice').id);
                      setNIssuedAt(toDateInputValue());
                      setNDueDate(toDateInputValue());
                      setNPeriod('');
                      setNPayTerms('Due on Delivery');
                      setNTermsCond(state.settings.invoiceTerms);
                      setNLines([
                        {
                          productName: state.products[0]?.name || 'Garment',
                          serviceName: state.services[0]?.name || 'Laundry',
                          quantity: 1,
                          unitPrice: state.prices[0]?.price || 0,
                          discount: 0,
                          total: state.prices[0]?.price || 0,
                        },
                      ]);
                      setNDiscount(0);
                      setNExtra(0);
                      setNPaid(0);
                      setNPayAcc(defaultMoneyCode);
                      setNewInvModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    New Custom Invoice
                  </button>
                )}

                {isOwner && onOwnerCustomizeInvoice && (
                  <button
                    type="button"
                    onClick={() => {
                      setCIssuedAt(toDateInputValue(invoice.issuedAt));
                      setCDueDate(toDateInputValue(invoice.dueDate));
                      setCCustName(invoice.customerName);
                      setCCustPhone(invoice.customerPhone);
                      setCCustAddr(invoice.customerAddress);
                      setCPeriod(invoice.periodCovered || '');
                      setCPayTerms(invoice.paymentTerms);
                      setCTermsCond(invoice.termsAndConditions);
                      setCLines(invoice.lines.map((l) => ({ ...l })));
                      setCDiscount(invoice.discountTotal);
                      setCExtra(invoice.extraCharges);
                      setCPaid(invoice.paidAmount);
                      setCPayAcc(defaultMoneyCode);
                      setCustModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100"
                    title="Owner Customize Invoice Date, Items, Amounts & Payment"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5" />
                    Customize
                  </button>
                )}

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
                    onClick={() => {
                      if (isOwner && onOwnerDeleteInvoice) {
                        onRequestDelete({
                          itemType: 'Invoice (Owner Override)',
                          itemNameOrId: `${invoice.id} · ${invoice.customerName}`,
                          bodyText: `Permanently delete invoice ${invoice.id} (${formatMoney(
                            invoice.grandTotal,
                            sym
                          )}) and reverse its customer/corporate due balance and Sales journals?`,
                          linkedInfo:
                            'Owner override: Linked Sales journals and customer receivables will be cleanly reversed.',
                          accountingProtected: false,
                          onConfirmDelete: () => onOwnerDeleteInvoice(invoice.id),
                        });
                        return;
                      }
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
                      });
                    }}
                    className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                    title={isOwner ? 'Delete Invoice (Owner Override)' : 'Delete Invoice (Accounting Protected)'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            {!invoice && isOwner && onOwnerCreateCustomInvoice && (
              <button
                type="button"
                onClick={() => {
                  setNIsCorp(false);
                  setNCustomerId(state.customers[0]?.id || '');
                  setNCustomId(generateNextSmartId(state, 'retailInvoice').id);
                  setNIssuedAt(toDateInputValue());
                  setNDueDate(toDateInputValue());
                  setNewInvModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                <Plus className="w-3.5 h-3.5" />
                New Custom Invoice
              </button>
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
      {/* Owner Customize Invoice Modal */}
      {isOwner && custModalOpen && invoice && onOwnerCustomizeInvoice && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setCustModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerCustomizeInvoice(invoice.id, {
                issuedAt: dateInputToIso(cIssuedAt, invoice.issuedAt),
                dueDate: dateInputToIso(cDueDate, invoice.dueDate),
                customerName: cCustName,
                customerPhone: cCustPhone,
                customerAddress: cCustAddr,
                periodCovered: cPeriod || undefined,
                paymentTerms: cPayTerms,
                termsAndConditions: cTermsCond,
                lines: cLines,
                discountTotal: cDiscount,
                extraCharges: cExtra,
                paidAmount: cPaid,
                paymentAccountCode: cPayAcc,
              });
              setCustModalOpen(false);
            }}
            className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Invoice · {invoice.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Owner override: Edit invoice date, due date, lines, discounts, charges &amp; paid amount
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Invoice Billing Date
                </label>
                <input
                  type="date"
                  required
                  value={cIssuedAt}
                  onChange={(e) => setCIssuedAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={cDueDate}
                  onChange={(e) => setCDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Period Covered (Optional)
                </label>
                <input
                  value={cPeriod}
                  onChange={(e) => setCPeriod(e.target.value)}
                  placeholder="e.g., Week 12 / Oct 2025"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Customer Name
                </label>
                <input
                  required
                  value={cCustName}
                  onChange={(e) => setCCustName(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Phone</label>
                <input
                  value={cCustPhone}
                  onChange={(e) => setCCustPhone(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Address</label>
                <input
                  value={cCustAddr}
                  onChange={(e) => setCCustAddr(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Invoice Line Items</span>
                <button
                  type="button"
                  onClick={() =>
                    setCLines((prev) => [
                      ...prev,
                      {
                        productName: state.products[0]?.name || 'Item',
                        serviceName: state.services[0]?.name || 'Laundry',
                        quantity: 1,
                        unitPrice: 0,
                        discount: 0,
                        total: 0,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Line
                </button>
              </div>
              {cLines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Item</label>
                    <input
                      value={line.productName}
                      onChange={(e) =>
                        setCLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, productName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Service</label>
                    <input
                      value={line.serviceName}
                      onChange={(e) =>
                        setCLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, serviceName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) =>
                        setCLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, quantity: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Unit Price</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setCLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, unitPrice: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Disc.</label>
                    <input
                      type="number"
                      min={0}
                      value={line.discount}
                      onChange={(e) =>
                        setCLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, discount: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-1 text-right">
                    {cLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setCLines((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Discount ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={cDiscount}
                  onChange={(e) => setCDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Extra Charges ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={cExtra}
                  onChange={(e) => setCExtra(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Paid Amount ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={cPaid}
                  onChange={(e) => setCPaid(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Payment Account
                </label>
                <select
                  value={cPayAcc}
                  onChange={(e) => setCPayAcc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {moneyAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Payment Terms
                </label>
                <input
                  value={cPayTerms}
                  onChange={(e) => setCPayTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Terms &amp; Conditions
                </label>
                <input
                  value={cTermsCond}
                  onChange={(e) => setCTermsCond(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCustModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                Save Invoice &amp; Sync Ledger
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner New Custom Invoice Modal */}
      {isOwner && newInvModalOpen && onOwnerCreateCustomInvoice && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setNewInvModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              if (!nCustomerId || nLines.length === 0) return;
              onOwnerCreateCustomInvoice({
                isCorporate: nIsCorp,
                customerId: nCustomerId,
                issuedAt: nIssuedAt,
                dueDate: nDueDate,
                periodCovered: nPeriod || undefined,
                paymentTerms: nPayTerms,
                termsAndConditions: nTermsCond,
                lines: nLines,
                discountTotal: nDiscount,
                extraCharges: nExtra,
                paidAmount: nPaid,
                paymentAccountCode: nPayAcc,
                customInvoiceId: nCustomId,
              });
              setSelectedInvoiceId(nCustomId);
              setNewInvModalOpen(false);
            }}
            className="w-full max-w-4xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Create Custom / Backdated Invoice (Owner)
                </h3>
                <p className="text-xs text-slate-500">
                  Add a missed retail or corporate invoice with custom billing date and automatic ledger posting
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNewInvModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Account Type
                </label>
                <select
                  value={nIsCorp ? 'corp' : 'retail'}
                  onChange={(e) => {
                    const corp = e.target.value === 'corp';
                    setNIsCorp(corp);
                    setNCustomerId(
                      corp ? state.corporateCustomers[0]?.id || '' : state.customers[0]?.id || ''
                    );
                    setNCustomId(
                      generateNextSmartId(state, corp ? 'corporateInvoice' : 'retailInvoice').id
                    );
                  }}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  <option value="retail">Retail Customer</option>
                  <option value="corp">Corporate Account</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Customer / Client
                </label>
                <select
                  required
                  value={nCustomerId}
                  onChange={(e) => setNCustomerId(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {(nIsCorp ? state.corporateCustomers : state.customers).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.id} — {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Invoice Number
                </label>
                <input
                  required
                  value={nCustomId}
                  onChange={(e) => setNCustomId(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Billing Date
                </label>
                <input
                  type="date"
                  required
                  value={nIssuedAt}
                  onChange={(e) => setNIssuedAt(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={nDueDate}
                  onChange={(e) => setNDueDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Period Covered
                </label>
                <input
                  value={nPeriod}
                  onChange={(e) => setNPeriod(e.target.value)}
                  placeholder="Optional period label..."
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Payment Terms
                </label>
                <input
                  value={nPayTerms}
                  onChange={(e) => setNPayTerms(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-700">Line Items</span>
                <button
                  type="button"
                  onClick={() =>
                    setNLines((prev) => [
                      ...prev,
                      {
                        productName: state.products[0]?.name || 'Item',
                        serviceName: state.services[0]?.name || 'Laundry',
                        quantity: 1,
                        unitPrice: 0,
                        discount: 0,
                        total: 0,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Line
                </button>
              </div>
              {nLines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end p-2.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Item</label>
                    <input
                      value={line.productName}
                      onChange={(e) =>
                        setNLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, productName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Service</label>
                    <input
                      value={line.serviceName}
                      onChange={(e) =>
                        setNLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, serviceName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) =>
                        setNLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, quantity: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Unit Price</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setNLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, unitPrice: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] text-slate-500 mb-0.5">Disc.</label>
                    <input
                      type="number"
                      min={0}
                      value={line.discount}
                      onChange={(e) =>
                        setNLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, discount: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="md:col-span-1 text-right">
                    {nLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setNLines((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Discount ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={nDiscount}
                  onChange={(e) => setNDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Extra Charges ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={nExtra}
                  onChange={(e) => setNExtra(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Paid Amount ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  value={nPaid}
                  onChange={(e) => setNPaid(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  Payment Account
                </label>
                <select
                  value={nPayAcc}
                  onChange={(e) => setNPayAcc(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {moneyAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setNewInvModalOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                Create Invoice &amp; Post Sales
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

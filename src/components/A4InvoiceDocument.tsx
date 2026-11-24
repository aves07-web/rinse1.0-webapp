import { AppSettings, Invoice } from '../types/erp';
import { formatMoney } from '../utils/accounting';
import { getLogoMaxHeightMm } from '../utils/theme';
import { QrCanvas } from './QrCanvas';

interface A4InvoiceDocumentProps {
  invoice: Invoice;
  settings: AppSettings;
  isPreviewFrame?: boolean;
}

export function A4InvoiceDocument({
  invoice,
  settings,
  isPreviewFrame = false,
}: A4InvoiceDocumentProps) {
  const sym = settings.currencySymbol;
  const logoUrl = invoice.logoSnapshotDataUrl ?? settings.companyLogoDataUrl;
  const logoSize = invoice.logoSizeSnapshot ?? settings.companyLogoSize ?? 'Medium';
  const showBrandName = invoice.showBrandNameSnapshot ?? settings.showBrandNameWithLogo ?? true;
  const brandName = invoice.companyNameSnapshot || settings.companyName;
  const brandAddress = invoice.companyAddressSnapshot || settings.companyAddress;
  const brandPhone = invoice.companyPhoneSnapshot || settings.companyPhone;
  const maxLogoMm = getLogoMaxHeightMm(logoSize);

  return (
    <div
      className={`print-only-container a4-invoice-sheet bg-white text-slate-900 mx-auto ${
        isPreviewFrame ? 'border border-slate-200 shadow-lg rounded-sm' : 'border border-slate-200 shadow-sm'
      }`}
    >
      {/* Header: Logo at far top-left BEFORE business name; thin blue accent divider */}
      <div className="flex flex-wrap justify-between items-start gap-6 pb-4 border-b-2 border-[#0071E3]">
        <div className="flex items-center gap-4 min-w-0 max-w-[62%]">
          {logoUrl && (
            <img
              src={logoUrl}
              alt={`${brandName} logo`}
              style={{ maxHeight: `${maxLogoMm}mm`, width: 'auto', maxWidth: '72mm' }}
              className="object-contain shrink-0 block"
            />
          )}
          <div className="min-w-0">
            {(!logoUrl || showBrandName) && (
              <h2 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">
                {brandName}
              </h2>
            )}
            {brandAddress && <p className="text-xs text-slate-600 mt-1">{brandAddress}</p>}
            {brandPhone && <p className="text-xs text-slate-600">{brandPhone}</p>}
          </div>
        </div>

        <div className="flex items-start gap-3 shrink-0">
          <div className="text-right text-xs space-y-0.5">
            <p className="text-sm font-bold tracking-wider text-[#0071E3] uppercase">Invoice</p>
            <p className="text-sm font-bold text-slate-900 font-mono">{invoice.id}</p>
            {invoice.orderId && (
              <p className="text-slate-600 font-mono">Order: {invoice.orderId}</p>
            )}
            <p className="text-slate-600">
              Issued: {new Date(invoice.issuedAt).toLocaleDateString()}
            </p>
            <p className="text-slate-600">
              Due: {new Date(invoice.dueDate).toLocaleDateString()}
            </p>
          </div>
          <QrCanvas value={`${invoice.id}|${invoice.customerId}|${invoice.grandTotal}`} size={64} />
        </div>
      </div>

      {/* Customer & Billing Details */}
      <div className="grid grid-cols-2 gap-6 py-4 border-b border-slate-200 text-xs">
        <div>
          <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">Billed To</p>
          <p className="text-sm font-semibold text-slate-900 mt-1">{invoice.customerName}</p>
          <p className="text-slate-600 font-mono">{invoice.customerId}</p>
          {invoice.customerPhone && <p className="text-slate-600">{invoice.customerPhone}</p>}
          {invoice.customerAddress && <p className="text-slate-600">{invoice.customerAddress}</p>}
        </div>
        <div className="text-right space-y-1">
          <p className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">
            Billing Details
          </p>
          <p className="text-slate-800">
            Account Type: <strong>{invoice.isCorporate ? 'Corporate' : 'Retail'}</strong>
          </p>
          {invoice.isCorporate && invoice.billingBasis && (
            <p className="text-[#0071E3] font-semibold">
              Billing Basis: {invoice.billingBasis}
            </p>
          )}
          {invoice.periodCovered && (
            <p className="text-slate-700">Period: {invoice.periodCovered}</p>
          )}
          <p className="text-slate-600">Terms: {invoice.paymentTerms}</p>
        </div>
      </div>

      {/* Items Table: repeats header on page break, never splits rows */}
      <table className="w-full text-left text-xs border-collapse my-5 a4-invoice-table">
        <thead>
          <tr className="border-b-2 border-[#0071E3] bg-slate-50 text-slate-700 font-semibold">
            <th className="py-2 px-2">Product</th>
            <th className="py-2 px-2">Service</th>
            <th className="py-2 px-2 text-right">Qty</th>
            <th className="py-2 px-2 text-right">Unit Price</th>
            <th className="py-2 px-2 text-right">Line Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 tabular-nums">
          {invoice.lines.map((line, i) => (
            <tr key={i}>
              <td className="py-2.5 px-2 font-medium text-slate-900">{line.productName}</td>
              <td className="py-2.5 px-2 text-slate-700">{line.serviceName}</td>
              <td className="py-2.5 px-2 text-right font-mono">{line.quantity}</td>
              <td className="py-2.5 px-2 text-right font-mono">
                {formatMoney(line.unitPrice, sym)}
              </td>
              <td className="py-2.5 px-2 text-right font-mono font-semibold">
                {formatMoney(line.total, sym)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals + Terms + Signature Block kept together */}
      <div className="a4-signature-keep">
        <div className="flex justify-end border-t border-slate-200 pt-4">
          <div className="w-72 space-y-1.5 text-xs tabular-nums">
            <div className="flex justify-between items-center px-2.5 py-1 rounded-md bg-violet-50 text-violet-700 font-semibold">
              <span>Subtotal</span>
              <span className="font-mono">{formatMoney(invoice.subtotal, sym)}</span>
            </div>
            {invoice.extraCharges > 0 && (
              <div className="flex justify-between items-center px-2.5 py-0.5 text-slate-600">
                <span>Additional Charges</span>
                <span className="font-mono">{formatMoney(invoice.extraCharges, sym)}</span>
              </div>
            )}
            {Number(invoice.discountTotal) > 0 && (
              <div className="flex justify-between items-center px-2.5 py-1 rounded-md bg-emerald-50 text-emerald-700 font-semibold">
                <span>Discount</span>
                <span className="font-mono">-{formatMoney(invoice.discountTotal, sym)}</span>
              </div>
            )}
            <div className="flex justify-between items-center text-sm font-bold px-2.5 py-1.5 rounded-md bg-blue-50 text-[#0071E3] border-t-2 border-[#0071E3]">
              <span>Grand Total</span>
              <span className="font-mono">{formatMoney(invoice.grandTotal, sym)}</span>
            </div>
            <div className="flex justify-between items-center px-2.5 pt-0.5 text-slate-700">
              <span>Paid Amount</span>
              <span className="font-mono">{formatMoney(invoice.paidAmount, sym)}</span>
            </div>
            <div className="flex justify-between items-center px-2.5 font-semibold text-slate-900">
              <span>Balance Due</span>
              <span className="font-mono">{formatMoney(invoice.dueAmount, sym)}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-200 text-[11px] text-slate-500 space-y-10">
          <div>
            <p className="font-semibold text-slate-700 mb-1">Terms &amp; Conditions</p>
            <p>{invoice.termsAndConditions || settings.invoiceTerms}</p>
          </div>

          <div className="grid grid-cols-2 gap-12 pt-4">
            <div className="border-t border-slate-400 pt-2 text-center text-slate-700 font-medium">
              Customer Signature
            </div>
            <div className="border-t border-slate-400 pt-2 text-center text-slate-700 font-medium">
              Laundry Authority Signature
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

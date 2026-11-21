import { useEffect, useMemo, useState } from 'react';
import {
  Building2,
  FileText,
  Plus,
  Receipt,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  BillingBasis,
  BillingCycle,
  CorporateCustomer,
  CorporateMovement,
  CorporateMovementType,
  ErpState,
  Invoice,
  InvoiceLineSnapshot,
  PaymentSplit,
} from '../types/erp';
import { dateInputToIso, formatMoney, getMoneySourceAccounts, toDateInputValue } from '../utils/accounting';
import { getCorporateBrandColor } from '../utils/migration';
import {
  DEFAULT_ID_FORMATS,
  generateNextSmartId,
  getExistingIdsForType,
  validateCustomSmartId,
} from '../utils/smartId';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';
import { QuickAddMoneyAccountParams, SplitPaymentInput } from './SplitPaymentInput';
import { ZeroPriceAffectedLine, ZeroPriceWarningModal } from './ZeroPriceWarningModal';

interface CorporateViewProps {
  state: ErpState;
  isOwner?: boolean;
  onCreateCorporate: (params: {
    name: string;
    contactPerson: string;
    phone: string;
    address: string;
    billingBasis: BillingBasis;
    billingCycle: BillingCycle;
    cutoffDayOrTime: string;
    copyRetailCatalogueOnce: boolean;
  }) => void;
  onUpdateCorporateBillingBasis: (corpId: string, basis: BillingBasis) => void;
  onOwnerUpdateCorporateProfile?: (
    corpId: string,
    patch: {
      name: string;
      contactPerson: string;
      phone: string;
      address: string;
      billingBasis: BillingBasis;
      billingCycle: BillingCycle;
      cutoffDayOrTime: string;
      discountPct: number;
      notes: string;
      outstandingBalance?: number;
      adjustmentDate?: string;
      adjustmentOffsetCode?: string;
      reason?: string;
    }
  ) => void;
  onAddCorporateProduct: (corpId: string, name: string, type: string) => void;
  onAddCorporateService: (corpId: string, name: string) => void;
  onUpsertCorporatePrice: (corpId: string, productId: string, serviceId: string, price: number) => void;
  onLogCorporateMovement: (params: {
    customOrderId?: string;
    advanceOrderCounterTo?: number;
    corporateId: string;
    event: CorporateMovementType;
    productId: string;
    serviceId: string;
    qty: number;
    reason: string;
    date?: string;
  }) => void;
  onOwnerCustomizeCorporateMovement?: (
    movId: string,
    updated: {
      date: string;
      orderId?: string;
      event: CorporateMovementType;
      productId: string;
      serviceId: string;
      qty: number;
      unitPriceSnapshot: number;
      reason?: string;
    }
  ) => void;
  onOwnerDeleteCorporateMovement?: (movId: string) => void;
  onGenerateCorporateInvoice: (
    corpId: string,
    periodLabel: string,
    options?: {
      customInvoiceId?: string;
      advanceCounterTo?: number;
      issuedAt?: string;
      dueDate?: string;
      customDiscountType?: 'percent' | 'amount';
      customDiscountValue?: number;
      approvedZeroPriceLines?: Array<{ productName: string; serviceName: string; quantity: number }>;
    }
  ) => void;
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
  onCollectCorporatePayment: (
    corpId: string,
    amount: number,
    accountCode: string,
    paymentSplits?: PaymentSplit[]
  ) => void;
  onOpenInvoice: (invoiceId: string) => void;
  onDeleteCorporate?: (corpId: string) => void;
  onDeactivateCorporate?: (corpId: string) => void;
  onDeleteCorporateProduct?: (corpId: string, productId: string) => void;
  onDeleteCorporateService?: (corpId: string, serviceId: string) => void;
  onDeleteCorporatePrice?: (corpId: string, productId: string, serviceId: string) => void;
  onGoToAccounting?: () => void;
  onAddMoneyAccount?: (params: QuickAddMoneyAccountParams) => string | null;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function CorporateView({
  state,
  isOwner = false,
  onCreateCorporate,
  onUpdateCorporateBillingBasis,
  onOwnerUpdateCorporateProfile,
  onAddCorporateProduct,
  onAddCorporateService,
  onUpsertCorporatePrice,
  onLogCorporateMovement,
  onOwnerCustomizeCorporateMovement,
  onOwnerDeleteCorporateMovement,
  onGenerateCorporateInvoice,
  onOwnerCustomizeInvoice,
  onOwnerDeleteInvoice,
  onCollectCorporatePayment,
  onOpenInvoice,
  onDeleteCorporate,
  onDeactivateCorporate,
  onDeleteCorporateProduct,
  onDeleteCorporateService,
  onDeleteCorporatePrice,
  onGoToAccounting,
  onAddMoneyAccount,
  onRequestDelete,
}: CorporateViewProps) {
  const sym = state.settings.currencySymbol;
  const [selectedCorpId, setSelectedCorpId] = useState(state.corporateCustomers[0]?.id || '');
  const [subTab, setSubTab] = useState<'movements' | 'catalogue' | 'billing'>('movements');
  const [showNewCorp, setShowNewCorp] = useState(false);

  // New Corporate Form
  const [cName, setCName] = useState('');
  const [cContact, setCContact] = useState('');
  const [cPhone, setCPhone] = useState('');
  const [cAddress, setCAddress] = useState('');
  const [cBasis, setCBasis] = useState<BillingBasis>('Delivered-wise');
  const [cCycle, setCCycle] = useState<BillingCycle>('Weekly');
  const [cCutoff, setCCutoff] = useState('Sunday 18:00');
  const [copyRetail, setCopyRetail] = useState(false);

  // Movement Log Form
  const [movOrderId, setMovOrderId] = useState(() =>
    generateNextSmartId(state, 'corporateOrder').id
  );
  const [continueCorpOrderNum, setContinueCorpOrderNum] = useState(false);
  const [movOrderErr, setMovOrderErr] = useState('');
  const [movDate, setMovDate] = useState(() => toDateInputValue());
  const [movEvent, setMovEvent] = useState<CorporateMovementType>('Received');
  const [movProdId, setMovProdId] = useState('');
  const [movSrvId, setMovSrvId] = useState('');
  const [movQty, setMovQty] = useState(10);
  const [movReason, setMovReason] = useState('');

  // Private Catalogue Inline Editing
  const [newProdName, setNewProdName] = useState('');
  const [newProdType, setNewProdType] = useState('Commercial Linen');
  const [newSrvName, setNewSrvName] = useState('');
  const [editingPriceCell, setEditingPriceCell] = useState<{
    productId: string;
    serviceId: string;
    value: string;
  } | null>(null);

  // Billing, Invoice Dialog & Payment
  const [periodLabel, setPeriodLabel] = useState(() => {
    const d = new Date();
    return `Period ending ${d.toLocaleDateString()}`;
  });
  const [invoiceDialogOpen, setInvoiceDialogOpen] = useState(false);
  const [invIssueDate, setInvIssueDate] = useState(() => toDateInputValue());
  const [invDueDate, setInvDueDate] = useState(() =>
    toDateInputValue(new Date(Date.now() + 7 * 86400000).toISOString())
  );
  const [customCorpInvId, setCustomCorpInvId] = useState(() =>
    generateNextSmartId(state, 'corporateInvoice').id
  );
  const [continueCorpInvNum, setContinueCorpInvNum] = useState(false);
  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultCorpMoneyCode =
    moneyAccounts.find((a) => a.channel === 'Bank')?.code || moneyAccounts[0]?.code || '1020';
  const [corpInvErr, setCorpInvErr] = useState('');
  const [paySplits, setPaySplits] = useState<PaymentSplit[]>(() => [
    {
      accountCode: defaultCorpMoneyCode,
      accountName: moneyAccounts.find((a) => a.code === defaultCorpMoneyCode)?.name,
      amount: 0,
    },
  ]);
  const [zeroWarningOpen, setZeroWarningOpen] = useState(false);
  const [zeroWarningLines, setZeroWarningLines] = useState<ZeroPriceAffectedLine[]>([]);
  const [approvedCorpZeroLines, setApprovedCorpZeroLines] = useState<
    Array<{ productName: string; serviceName: string; quantity: number }> | undefined
  >(undefined);
  const [highlightedMovementIds, setHighlightedMovementIds] = useState<Set<string>>(new Set());
  const [billingRateError, setBillingRateError] = useState('');
  const [customDiscountType, setCustomDiscountType] = useState<'percent' | 'amount'>('percent');
  const [customDiscountValue, setCustomDiscountValue] = useState<string>(() =>
    String(state.corporateCustomers[0]?.discountPct ?? 0)
  );

  // Owner Customize Corporate Profile & Balance Modal
  const [custCorpOpen, setCustCorpOpen] = useState(false);
  const [ecName, setEcName] = useState('');
  const [ecContact, setEcContact] = useState('');
  const [ecPhone, setEcPhone] = useState('');
  const [ecAddress, setEcAddress] = useState('');
  const [ecBasis, setEcBasis] = useState<BillingBasis>('Delivered-wise');
  const [ecCycle, setEcCycle] = useState<BillingCycle>('Weekly');
  const [ecCutoff, setEcCutoff] = useState('');
  const [ecDiscount, setEcDiscount] = useState(0);
  const [ecNotes, setEcNotes] = useState('');
  const [ecOutstanding, setEcOutstanding] = useState(0);
  const [ecAdjDate, setEcAdjDate] = useState(() => toDateInputValue());
  const [ecAdjOffset, setEcAdjOffset] = useState('3040');
  const [ecAdjReason, setEcAdjReason] = useState('Owner balance adjustment');

  // Owner Customize Corporate Movement Modal
  const [editMovTarget, setEditMovTarget] = useState<CorporateMovement | null>(null);
  const [emDate, setEmDate] = useState('');
  const [emOrderId, setEmOrderId] = useState('');
  const [emEvent, setEmEvent] = useState<CorporateMovementType>('Received');
  const [emProdId, setEmProdId] = useState('');
  const [emSrvId, setEmSrvId] = useState('');
  const [emQty, setEmQty] = useState(1);
  const [emUnitPrice, setEmUnitPrice] = useState(0);
  const [emReason, setEmReason] = useState('');

  // Owner Customize Corporate Invoice Modal
  const [editInvTarget, setEditInvTarget] = useState<Invoice | null>(null);
  const [eiIssuedAt, setEiIssuedAt] = useState('');
  const [eiDueDate, setEiDueDate] = useState('');
  const [eiPeriod, setEiPeriod] = useState('');
  const [eiPayTerms, setEiPayTerms] = useState('');
  const [eiTermsCond, setEiTermsCond] = useState('');
  const [eiLines, setEiLines] = useState<InvoiceLineSnapshot[]>([]);
  const [eiDiscount, setEiDiscount] = useState(0);
  const [eiExtra, setEiExtra] = useState(0);
  const [eiPaid, setEiPaid] = useState(0);
  const [eiPayAcc, setEiPayAcc] = useState(defaultCorpMoneyCode);

  useEffect(() => {
    setMovOrderId(generateNextSmartId(state, 'corporateOrder').id);
    setContinueCorpOrderNum(false);
    setMovOrderErr('');
  }, [state.corporateMovements.length, state.idFormats]);

  useEffect(() => {
    if (invoiceDialogOpen) {
      setCustomCorpInvId(generateNextSmartId(state, 'corporateInvoice').id);
      setContinueCorpInvNum(false);
      setCorpInvErr('');
    }
  }, [invoiceDialogOpen, state.invoices.length, state.idFormats]);

  const corpOrderRule = state.idFormats?.corporateOrder || DEFAULT_ID_FORMATS.corporateOrder;
  const existingCorpOrderIds = getExistingIdsForType(state, 'corporateOrder');
  const movOrderCheck = validateCustomSmartId(movOrderId, existingCorpOrderIds, corpOrderRule);

  const corpInvRule = state.idFormats?.corporateInvoice || DEFAULT_ID_FORMATS.corporateInvoice;
  const existingCorpInvIds = getExistingIdsForType(state, 'corporateInvoice');
  const corpInvCheck = validateCustomSmartId(customCorpInvId, existingCorpInvIds, corpInvRule);

  const activeCorp: CorporateCustomer | null =
    state.corporateCustomers.find((c) => c.id === selectedCorpId) ||
    state.corporateCustomers[0] ||
    null;

  const corpMovements = useMemo(() => {
    if (!activeCorp) return [];
    return state.corporateMovements.filter((m) => m.corporateId === activeCorp.id);
  }, [state.corporateMovements, activeCorp]);

  // Totals by product + service
  const balanceByPair = useMemo(() => {
    if (!activeCorp) return [];
    const map = new Map<
      string,
      {
        productName: string;
        serviceName: string;
        received: number;
        delivered: number;
        pending: number;
        unitPrice: number;
      }
    >();

    for (const m of corpMovements) {
      const key = `${m.productId}::${m.serviceId}`;
      const existing = map.get(key) || {
        productName: m.productName,
        serviceName: m.serviceName,
        received: 0,
        delivered: 0,
        pending: 0,
        unitPrice: m.unitPriceSnapshot,
      };
      if (m.qtyDelta > 0) existing.received += m.qtyDelta;
      if (m.qtyDelta < 0) existing.delivered += Math.abs(m.qtyDelta);
      existing.pending = Math.max(0, existing.received - existing.delivered);
      map.set(key, existing);
    }
    return Array.from(map.values());
  }, [corpMovements, activeCorp]);

  // Calculate unbilled billable movements per customer's billing basis
  const unbilledItems = useMemo(() => {
    if (!activeCorp) return [];
    return corpMovements
      .filter((m) => {
        if (activeCorp.billingBasis === 'Delivered-wise') {
          return m.event === 'Delivered' && Math.abs(m.qtyDelta) > m.billedQty;
        } else {
          return m.event === 'Received' && m.qtyDelta > m.billedQty;
        }
      })
      .map((m) => {
        const totalEligible = Math.abs(m.qtyDelta);
        const unbilledQty = totalEligible - m.billedQty;
        const rate =
          activeCorp.prices.find((p) => p.productId === m.productId && p.serviceId === m.serviceId)
            ?.price ?? m.unitPriceSnapshot;
        return {
          movement: m,
          unbilledQty,
          rate,
          lineTotal: Number((unbilledQty * rate).toFixed(2)),
        };
      });
  }, [corpMovements, activeCorp]);

  const unbilledTotal = unbilledItems.reduce((s, i) => s + i.lineTotal, 0);

  useEffect(() => {
    setCustomDiscountType('percent');
    setCustomDiscountValue(String(activeCorp?.discountPct ?? 0));
  }, [activeCorp?.id, activeCorp?.discountPct]);

  const parsedCustomDiscVal = Math.max(0, Number(customDiscountValue) || 0);
  const corpBillDiscountAmount =
    customDiscountType === 'amount'
      ? Number(Math.min(unbilledTotal, parsedCustomDiscVal).toFixed(2))
      : Number(((unbilledTotal * Math.min(100, parsedCustomDiscVal)) / 100).toFixed(2));
  const corpBillNetTotal = Number(Math.max(0, unbilledTotal - corpBillDiscountAmount).toFixed(2));

  const corpInvoices = activeCorp
    ? state.invoices.filter((inv) => inv.corporateId === activeCorp.id)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Corporate Accounts &amp; Linen Movement
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Strictly isolated private catalogues per client, immutable received/delivered logs, and Received-wise or Delivered-wise billing
          </p>
        </div>

        <button
          onClick={() => setShowNewCorp((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          {showNewCorp ? 'Close Form' : 'New Corporate Account'}
        </button>
      </div>

      {showNewCorp && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!cName.trim()) return;
            onCreateCorporate({
              name: cName.trim(),
              contactPerson: cContact.trim(),
              phone: cPhone.trim(),
              address: cAddress.trim(),
              billingBasis: cBasis,
              billingCycle: cCycle,
              cutoffDayOrTime: cCutoff,
              copyRetailCatalogueOnce: copyRetail,
            });
            setCName('');
            setCContact('');
            setCPhone('');
            setCAddress('');
            setShowNewCorp(false);
          }}
          className="liquid-glass rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Organization Name</label>
            <input
              required
              value={cName}
              onChange={(e) => setCName(e.target.value)}
              placeholder="e.g., Westin Hotel Dhaka"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Contact Person</label>
            <input
              required
              value={cContact}
              onChange={(e) => setCContact(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Phone</label>
            <input
              required
              value={cPhone}
              onChange={(e) => setCPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Billing Basis</label>
            <select
              value={cBasis}
              onChange={(e) => setCBasis(e.target.value as BillingBasis)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            >
              <option value="Delivered-wise">Delivered-wise (bill upon delivery)</option>
              <option value="Received-wise">Received-wise (bill upon receipt)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Billing Cycle</label>
            <select
              value={cCycle}
              onChange={(e) => setCCycle(e.target.value as BillingCycle)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            >
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Monthly">Monthly</option>
              <option value="Fixed-date">Fixed-date</option>
              <option value="Custom">Custom</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Cutoff Schedule</label>
            <input
              value={cCutoff}
              onChange={(e) => setCCutoff(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
          </div>
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              value={cAddress}
              onChange={(e) => setCAddress(e.target.value)}
              placeholder="Facility address..."
              className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={copyRetail}
                onChange={(e) => setCopyRetail(e.target.checked)}
              />
              Copy retail list once as private starting catalogue
            </label>
          </div>
          <div className="text-right">
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
            >
              Create Private Account
            </button>
          </div>
        </form>
      )}

      {/* Corporate Account Switcher + Main Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-4 liquid-glass rounded-2xl overflow-hidden divide-y divide-slate-200/60">
          {state.corporateCustomers.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No corporate accounts yet. Click &ldquo;New Corporate Account&rdquo; to add one.
            </div>
          ) : (
            state.corporateCustomers.map((corp, idx) => {
            const isSelected = activeCorp?.id === corp.id;
            const brandColor = getCorporateBrandColor(idx, corp.brandColor);
            return (
              <button
                key={corp.id}
                onClick={() => {
                  setSelectedCorpId(corp.id);
                  setMovProdId(corp.products[0]?.id || '');
                  setMovSrvId(corp.services[0]?.id || '');
                }}
                className={`w-full text-left p-4 transition-colors ${
                  isSelected ? 'bg-white/95' : 'hover:bg-white/60'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-slate-500">{corp.id}</span>
                  <span className="font-semibold" style={{ color: brandColor }}>
                    {corp.billingBasis}
                  </span>
                </div>
                <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                    style={{ backgroundColor: brandColor }}
                  />
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span className={corp.active === false ? 'line-through text-slate-400' : ''}>
                    {corp.name}
                  </span>
                  {corp.active === false && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                      Inactive
                    </span>
                  )}
                </p>
                <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5 tabular-nums">
                  <span>{corp.billingCycle} · {corp.products.length} private items</span>
                  <span className="font-mono text-slate-900 font-medium">
                    Due {formatMoney(corp.outstandingBalance, sym)}
                  </span>
                </div>
              </button>
            );
          })
          )}
        </div>

        <div className="lg:col-span-8 space-y-6">
          {activeCorp ? (
            <>
              {/* Account Header + Mode Tabs */}
              <div className="liquid-glass rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-700">{activeCorp.id}</span>
                      <span>·</span>
                      <span>{activeCorp.contactPerson}</span>
                      <span>·</span>
                      <span>{activeCorp.billingCycle} ({activeCorp.cutoffDayOrTime})</span>
                    </div>
                    <h2 className="text-xl font-semibold text-slate-900 mt-1">{activeCorp.name}</h2>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="block text-[11px] text-slate-500">Billing Basis</span>
                      <select
                        value={activeCorp.billingBasis}
                        onChange={(e) =>
                          onUpdateCorporateBillingBasis(activeCorp.id, e.target.value as BillingBasis)
                        }
                        className="mt-0.5 px-2.5 py-1 text-xs font-semibold rounded-lg bg-white border border-slate-200 text-[#0071E3]"
                      >
                        <option value="Delivered-wise">Delivered-wise</option>
                        <option value="Received-wise">Received-wise</option>
                      </select>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="block text-[11px] text-slate-500">Balance Due</span>
                      <span className="text-base font-mono font-semibold text-slate-900">
                        {formatMoney(activeCorp.outstandingBalance, sym)}
                      </span>
                    </div>
                    {isOwner && onOwnerUpdateCorporateProfile && (
                      <button
                        type="button"
                        onClick={() => {
                          setEcName(activeCorp.name);
                          setEcContact(activeCorp.contactPerson);
                          setEcPhone(activeCorp.phone);
                          setEcAddress(activeCorp.address);
                          setEcBasis(activeCorp.billingBasis);
                          setEcCycle(activeCorp.billingCycle);
                          setEcCutoff(activeCorp.cutoffDayOrTime);
                          setEcDiscount(activeCorp.discountPct);
                          setEcNotes(activeCorp.notes || '');
                          setEcOutstanding(activeCorp.outstandingBalance);
                          setEcAdjDate(toDateInputValue());
                          setEcAdjOffset('3040');
                          setEcAdjReason('Owner balance adjustment');
                          setCustCorpOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-300 text-amber-800 hover:bg-amber-100"
                        title="Owner Customize Corporate Profile & Balance"
                      >
                        <SlidersHorizontal className="w-3.5 h-3.5" />
                        Customize
                      </button>
                    )}
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          const hasLinked =
                            corpMovements.length > 0 ||
                            corpInvoices.length > 0 ||
                            activeCorp.outstandingBalance > 0;
                          onRequestDelete({
                            itemType: 'Corporate Account',
                            itemNameOrId: `${activeCorp.name} (${activeCorp.id})`,
                            bodyText: hasLinked
                              ? `Corporate account "${activeCorp.name}" has ${corpMovements.length} movement event(s), ${corpInvoices.length} invoice(s), and ${formatMoney(activeCorp.outstandingBalance, sym)} due balance.`
                              : `Permanently delete corporate account "${activeCorp.name}" and its private catalogue?`,
                            linkedInfo: hasLinked
                              ? 'Because ledger history and linen logs exist, deactivating preserves audit integrity while hiding it from new operations.'
                              : undefined,
                            alternativeLabel:
                              activeCorp.active !== false && onDeactivateCorporate
                                ? 'Deactivate Instead'
                                : undefined,
                            onAlternative:
                              activeCorp.active !== false && onDeactivateCorporate
                                ? () => onDeactivateCorporate(activeCorp.id)
                                : undefined,
                            accountingProtected: hasLinked && activeCorp.outstandingBalance > 0,
                            onConfirmDelete:
                              !hasLinked && onDeleteCorporate
                                ? () => onDeleteCorporate(activeCorp.id)
                                : undefined,
                          });
                        }}
                        className="p-2 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title="Delete or Deactivate corporate account"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
                  <button
                    onClick={() => setSubTab('movements')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      subTab === 'movements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Movement Log &amp; Pending
                  </button>
                  <button
                    onClick={() => setSubTab('catalogue')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      subTab === 'catalogue' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Private Catalogue ({activeCorp.products.length})
                  </button>
                  <button
                    onClick={() => setSubTab('billing')}
                    className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                      subTab === 'billing' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    Billing &amp; Statements ({unbilledItems.length} unbilled)
                  </button>
                </div>
              </div>

              {subTab === 'movements' && (
                <div className="space-y-6">
                  {/* Log Movement Form (strictly from activeCorp private catalogue) */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const pId = movProdId || activeCorp.products[0]?.id;
                      const sId = movSrvId || activeCorp.services[0]?.id;
                      if (!pId || !sId || movQty <= 0) return;
                      if (!movOrderCheck.valid) {
                        setMovOrderErr(movOrderCheck.error || 'Invalid Batch / Order ID');
                        return;
                      }
                      onLogCorporateMovement({
                        customOrderId: movOrderCheck.cleanId,
                        advanceOrderCounterTo:
                          continueCorpOrderNum && movOrderCheck.matchedHigherNumber
                            ? movOrderCheck.matchedHigherNumber + 1
                            : undefined,
                        corporateId: activeCorp.id,
                        event: movEvent,
                        productId: pId,
                        serviceId: sId,
                        qty: movQty,
                        reason: movReason.trim() || `${movEvent} batch`,
                        date: movDate,
                      });
                      setMovReason('');
                      setMovOrderErr('');
                    }}
                    className="liquid-glass rounded-2xl p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Record Movement Event (Draws Only From {activeCorp.name} Private Catalogue)
                      </h3>
                      <div className="flex flex-wrap items-center gap-2">
                        <label className="text-[11px] font-medium text-slate-600">Date:</label>
                        <input
                          type="date"
                          value={movDate}
                          onChange={(e) => setMovDate(e.target.value)}
                          className="px-2.5 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                        />
                        <label className="text-[11px] font-medium text-slate-600 ml-1">
                          Batch / Order ID:
                        </label>
                        <input
                          required
                          maxLength={30}
                          value={movOrderId}
                          onChange={(e) => {
                            setMovOrderId(e.target.value);
                            setMovOrderErr('');
                          }}
                          className={`w-36 px-2.5 py-1 text-xs font-mono rounded-lg bg-white border ${
                            !movOrderCheck.valid || movOrderErr
                              ? 'border-red-400'
                              : 'border-slate-200 focus:border-[#0071E3]'
                          }`}
                        />
                        {movOrderCheck.valid && movOrderCheck.matchedHigherNumber && (
                          <label className="inline-flex items-center gap-1 text-[11px] text-[#0071E3] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={continueCorpOrderNum}
                              onChange={(e) => setContinueCorpOrderNum(e.target.checked)}
                            />
                            Continue from {movOrderCheck.matchedHigherNumber + 1}
                          </label>
                        )}
                      </div>
                    </div>
                    {(!movOrderCheck.valid || movOrderErr) && (
                      <p className="text-[11px] text-red-600">{movOrderErr || movOrderCheck.error}</p>
                    )}

                    {activeCorp.products.length === 0 || activeCorp.services.length === 0 ? (
                      <p className="text-xs text-amber-700">
                        Add at least one product and one service in the Private Catalogue tab before logging movements.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                        <div className="md:col-span-2">
                          <label className="block text-[11px] text-slate-500 mb-1">Event</label>
                          <select
                            value={movEvent}
                            onChange={(e) => setMovEvent(e.target.value as CorporateMovementType)}
                            className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                          >
                            <option value="Received">Received (+)</option>
                            <option value="Delivered">Delivered (-)</option>
                            <option value="Returned">Returned (-)</option>
                            <option value="Rewash">Rewash</option>
                            <option value="Damaged">Damaged (-)</option>
                            <option value="Missing">Missing (-)</option>
                            <option value="Adjustment">Adjustment (+)</option>
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-[11px] text-slate-500 mb-1">Private Product</label>
                          <select
                            value={movProdId || activeCorp.products[0]?.id || ''}
                            onChange={(e) => setMovProdId(e.target.value)}
                            className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                          >
                            {activeCorp.products.map((p) => (
                              <option key={p.id} value={p.id}>
                                {p.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-3">
                          <label className="block text-[11px] text-slate-500 mb-1">Private Service</label>
                          <select
                            value={movSrvId || activeCorp.services[0]?.id || ''}
                            onChange={(e) => setMovSrvId(e.target.value)}
                            className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                          >
                            {activeCorp.services.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-1">
                          <label className="block text-[11px] text-slate-500 mb-1">Qty</label>
                          <input
                            type="number"
                            min={1}
                            value={movQty}
                            onChange={(e) => setMovQty(Math.max(1, Number(e.target.value)))}
                            className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                          />
                        </div>
                        <div className="md:col-span-3 flex gap-2">
                          <input
                            type="text"
                            value={movReason}
                            onChange={(e) => setMovReason(e.target.value)}
                            placeholder="Batch note..."
                            className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                          />
                          <button
                            type="submit"
                            className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap"
                          >
                            Post
                          </button>
                        </div>
                      </div>
                    )}
                  </form>

                  {/* Product + Service Physical Balance Summary */}
                  <div className="liquid-glass rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Physical Linen Summary by Product + Service
                    </h3>
                    <table className="w-full text-left text-xs border-collapse erp-table">
                      <thead>
                        <tr className="border-b border-slate-200/70">
                          <th className="py-2 px-2">Product + Service</th>
                          <th className="py-2 px-2 text-right">Total Received</th>
                          <th className="py-2 px-2 text-right">Total Delivered</th>
                          <th className="py-2 px-2 text-right">Current Pending</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 tabular-nums font-mono">
                        {balanceByPair.map((row, i) => (
                          <tr key={i}>
                            <td className="py-2.5 px-2 font-sans font-medium text-slate-900">
                              {row.productName} · {row.serviceName}
                            </td>
                            <td className="py-2.5 px-2 text-right text-slate-700">{row.received}</td>
                            <td className="py-2.5 px-2 text-right text-emerald-700">{row.delivered}</td>
                            <td className="py-2.5 px-2 text-right font-semibold text-[#0071E3]">{row.pending}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Append-Only Movement Log */}
                  <div className="liquid-glass rounded-2xl p-6">
                    <h3 className="text-sm font-semibold text-slate-900 mb-3">
                      Append-Only Movement Log (Immutable Audit Trail)
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse erp-table">
                        <thead>
                          <tr className="border-b border-slate-200/70">
                            <th className="py-2 px-2">Date / Batch</th>
                            <th className="py-2 px-2">Event</th>
                            <th className="py-2 px-2">Item &amp; Service</th>
                            <th className="py-2 px-2 text-right">Qty</th>
                            <th className="py-2 px-2 text-right">Pending After</th>
                            <th className="py-2 px-2 text-right">Billed Status</th>
                            {onRequestDelete && <th className="py-2 px-2 text-right">Action</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/60">
                          {[...corpMovements].reverse().map((m) => (
                            <tr key={m.id}>
                              <td className="py-2.5 px-2 font-mono text-slate-500 whitespace-nowrap">
                                <p>{new Date(m.date).toLocaleDateString()}</p>
                                {m.orderId && (
                                  <p className="text-[10px] text-slate-400">{m.orderId}</p>
                                )}
                              </td>
                              <td className="py-2.5 px-2 font-semibold text-slate-800">
                                {m.event}
                                {m.isOpening && (
                                  <span className="ml-1.5 text-[10px] font-mono text-[#0071E3]">
                                    Opening
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-2">
                                <p className="text-slate-900 font-medium">
                                  {m.productName} · {m.serviceName}
                                </p>
                                {m.reason && <p className="text-[11px] text-slate-500">{m.reason}</p>}
                              </td>
                              <td
                                className={`py-2.5 px-2 text-right font-mono tabular-nums font-semibold ${
                                  m.qtyDelta >= 0 ? 'text-emerald-700' : 'text-[#0071E3]'
                                }`}
                              >
                                {m.qtyDelta > 0 ? `+${m.qtyDelta}` : m.qtyDelta}
                              </td>
                              <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-900">
                                {m.pendingAfter}
                              </td>
                              <td className="py-2.5 px-2 text-right text-slate-600 whitespace-nowrap">
                                {m.billedQty > 0
                                  ? `Billed (${m.billedQty}) ${m.invoiceId || ''}`
                                  : 'Unbilled'}
                              </td>
                              {(onRequestDelete || isOwner) && (
                                <td className="py-2.5 px-2 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1">
                                    {isOwner && onOwnerCustomizeCorporateMovement && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setEditMovTarget(m);
                                          setEmDate(toDateInputValue(m.date));
                                          setEmOrderId(m.orderId || '');
                                          setEmEvent(m.event);
                                          setEmProdId(m.productId);
                                          setEmSrvId(m.serviceId);
                                          setEmQty(Math.abs(m.qtyDelta));
                                          setEmUnitPrice(m.unitPriceSnapshot);
                                          setEmReason(m.reason || '');
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                                        title="Customize movement (Owner)"
                                      >
                                        <SlidersHorizontal className="w-3 h-3" />
                                        Customize
                                      </button>
                                    )}
                                    {onRequestDelete && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (isOwner && onOwnerDeleteCorporateMovement) {
                                            onRequestDelete({
                                              itemType: 'Corporate Movement (Owner Override)',
                                              itemNameOrId: `${m.orderId || m.id} (${m.event} · ${m.productName})`,
                                              bodyText: `Permanently delete this ${m.event} movement (${Math.abs(
                                                m.qtyDelta
                                              )}x ${m.productName}) and recalculate pending linen balances?`,
                                              accountingProtected: false,
                                              onConfirmDelete: () => onOwnerDeleteCorporateMovement(m.id),
                                            });
                                            return;
                                          }
                                          onRequestDelete({
                                            itemType: 'Movement Log Entry',
                                            itemNameOrId: `${m.orderId || m.id} (${m.event} · ${m.productName})`,
                                            bodyText:
                                              'Physical linen movement log entries form an immutable append-only audit trail and cannot be deleted.',
                                            linkedInfo:
                                              'To correct an entry error, post an Adjustment movement event instead so pending counts stay auditable.',
                                            accountingProtected: true,
                                            alternativeLabel: 'Log Adjustment Entry',
                                            onAlternative: () => {
                                              setMovEvent('Adjustment');
                                              setMovProdId(m.productId);
                                              setMovSrvId(m.serviceId);
                                              setMovReason(`Correction for ${m.orderId || m.id}`);
                                            },
                                          });
                                        }}
                                        className="p-1 text-slate-400 hover:text-red-600"
                                        title={
                                          isOwner
                                            ? 'Delete movement (Owner Override)'
                                            : 'Movement entries are audit-protected'
                                        }
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {subTab === 'catalogue' && (
                <div className="liquid-glass rounded-2xl p-6 space-y-5">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      Private Catalogue for {activeCorp.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Changes here apply strictly to {activeCorp.name} and never affect retail or other corporate accounts. Click any price cell to edit inline.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newProdName.trim()) return;
                        onAddCorporateProduct(activeCorp.id, newProdName.trim(), newProdType);
                        setNewProdName('');
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newProdName}
                        onChange={(e) => setNewProdName(e.target.value)}
                        placeholder="New private product..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                      />
                      <input
                        value={newProdType}
                        onChange={(e) => setNewProdType(e.target.value)}
                        placeholder="Type"
                        className="w-28 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0071E3] text-white"
                      >
                        Add Product
                      </button>
                    </form>

                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!newSrvName.trim()) return;
                        onAddCorporateService(activeCorp.id, newSrvName.trim());
                        setNewSrvName('');
                      }}
                      className="flex gap-2"
                    >
                      <input
                        value={newSrvName}
                        onChange={(e) => setNewSrvName(e.target.value)}
                        placeholder="New private service..."
                        className="flex-1 px-3 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                      />
                      <button
                        type="submit"
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
                      >
                        Add Service
                      </button>
                    </form>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse erp-table">
                      <thead>
                        <tr className="border-b border-slate-200/70">
                          <th className="py-2.5 px-3">Product</th>
                          <th className="py-2.5 px-3">Type</th>
                          {activeCorp.services.map((s) => {
                            const usedSrv = corpMovements.some((m) => m.serviceId === s.id);
                            return (
                              <th key={s.id} className="py-2.5 px-3 text-right">
                                <div className="inline-flex items-center justify-end gap-1.5">
                                  <span>{s.name}</span>
                                  {onRequestDelete && onDeleteCorporateService && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        onRequestDelete({
                                          itemType: 'Corporate Service',
                                          itemNameOrId: `${s.name} (${activeCorp.name})`,
                                          bodyText: usedSrv
                                            ? `"${s.name}" is referenced in historical movement logs for ${activeCorp.name}. Removing it removes future price matrix columns.`
                                            : `Delete private service "${s.name}" from ${activeCorp.name}?`,
                                          linkedInfo: usedSrv
                                            ? 'Past movements and issued invoices keep their recorded service names.'
                                            : undefined,
                                          onConfirmDelete: () =>
                                            onDeleteCorporateService(activeCorp.id, s.id),
                                        })
                                      }
                                      className="text-slate-400 hover:text-red-600"
                                      title={`Delete service ${s.name}`}
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                          {onRequestDelete && <th className="py-2.5 px-3 text-right">Action</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60">
                        {activeCorp.products.map((p) => {
                          const usedProd = corpMovements.some((m) => m.productId === p.id);
                          return (
                            <tr key={p.id}>
                              <td className="py-2.5 px-3 font-medium text-slate-900">{p.name}</td>
                              <td className="py-2.5 px-3 text-slate-500">{p.type}</td>
                              {activeCorp.services.map((s) => {
                                const entry = activeCorp.prices.find(
                                  (pr) => pr.productId === p.id && pr.serviceId === s.id
                                );
                                const isEditing =
                                  editingPriceCell?.productId === p.id &&
                                  editingPriceCell?.serviceId === s.id;
                                return (
                                  <td key={s.id} className="py-2.5 px-3 text-right font-mono tabular-nums">
                                    {isEditing ? (
                                      <input
                                        autoFocus
                                        type="number"
                                        min={0}
                                        step="0.5"
                                        value={editingPriceCell.value}
                                        onChange={(e) =>
                                          setEditingPriceCell({
                                            ...editingPriceCell,
                                            value: e.target.value,
                                          })
                                        }
                                        onBlur={() => {
                                          const val = Number(editingPriceCell.value);
                                          if (!Number.isNaN(val) && val >= 0) {
                                            onUpsertCorporatePrice(activeCorp.id, p.id, s.id, val);
                                          }
                                          setEditingPriceCell(null);
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            const val = Number(editingPriceCell.value);
                                            if (!Number.isNaN(val) && val >= 0) {
                                              onUpsertCorporatePrice(activeCorp.id, p.id, s.id, val);
                                            }
                                            setEditingPriceCell(null);
                                          } else if (e.key === 'Escape') {
                                            setEditingPriceCell(null);
                                          }
                                        }}
                                        className="w-20 px-2 py-1 text-right rounded bg-white border border-[#0071E3]"
                                      />
                                    ) : (
                                      <div className="inline-flex items-center justify-end gap-1">
                                        <button
                                          onClick={() =>
                                            setEditingPriceCell({
                                              productId: p.id,
                                              serviceId: s.id,
                                              value: entry ? String(entry.price) : '',
                                            })
                                          }
                                          className="hover:text-[#0071E3]"
                                        >
                                          {entry ? formatMoney(entry.price, sym) : 'Set price'}
                                        </button>
                                        {entry && onRequestDelete && onDeleteCorporatePrice && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              onRequestDelete({
                                                itemType: 'Private Rate',
                                                itemNameOrId: `${p.name} · ${s.name} (${formatMoney(entry.price, sym)})`,
                                                bodyText: `Clear the private rate for "${p.name} · ${s.name}" on ${activeCorp.name}? Future unbilled lines without a rate will trigger a zero-price warning.`,
                                                onConfirmDelete: () =>
                                                  onDeleteCorporatePrice(activeCorp.id, p.id, s.id),
                                              })
                                            }
                                            className="p-0.5 text-slate-300 hover:text-red-600"
                                            title="Clear price"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              {onRequestDelete && (
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      onRequestDelete({
                                        itemType: 'Corporate Product',
                                        itemNameOrId: `${p.name} (${activeCorp.name})`,
                                        bodyText: usedProd
                                          ? `Product "${p.name}" has historical movement records for ${activeCorp.name}. Deleting it hides it from future movements while preserving history.`
                                          : `Delete private product "${p.name}" from ${activeCorp.name}?`,
                                        onConfirmDelete: () =>
                                          onDeleteCorporateProduct?.(activeCorp.id, p.id),
                                      })
                                    }
                                    className="p-1 text-slate-400 hover:text-red-600"
                                    title={`Delete ${p.name}`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {subTab === 'billing' && (
                <div className="space-y-6">
                  <div className="liquid-glass rounded-2xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">
                          Unbilled Eligible Movements ({activeCorp.billingBasis})
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {activeCorp.billingBasis === 'Delivered-wise'
                            ? 'Only physically delivered quantities not yet invoiced are eligible.'
                            : 'Received quantities not yet invoiced are eligible upon receipt.'}{' '}
                          Billed quantities are locked to prevent duplicate billing.
                        </p>
                      </div>
                      <div className="text-right tabular-nums">
                        <span className="text-xs text-slate-500">Billable Total</span>
                        <p className="text-lg font-mono font-semibold text-slate-900">
                          {formatMoney(unbilledTotal, sym)}
                        </p>
                      </div>
                    </div>

                    {billingRateError && (
                      <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 font-medium">
                        {billingRateError}
                      </div>
                    )}

                    {unbilledItems.length === 0 ? (
                      <p className="text-xs text-slate-500 py-4">
                        All eligible {activeCorp.billingBasis.toLowerCase()} movements have been billed.
                      </p>
                    ) : (
                      <>
                        <table className="w-full text-left text-xs border-collapse erp-table">
                          <thead>
                            <tr className="border-b border-slate-200/70">
                              <th className="py-2 px-2">Date &amp; Event</th>
                              <th className="py-2 px-2">Product &amp; Service</th>
                              <th className="py-2 px-2 text-right">Unbilled Qty</th>
                              <th className="py-2 px-2 text-right">Private Rate</th>
                              <th className="py-2 px-2 text-right">Subtotal</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/60 tabular-nums">
                            {unbilledItems.map((item) => {
                              const isHighlighted = highlightedMovementIds.has(item.movement.id);
                              return (
                                <tr
                                  key={item.movement.id}
                                  className={
                                    isHighlighted
                                      ? 'bg-red-50/90 border-l-4 border-l-red-500'
                                      : ''
                                  }
                                >
                                  <td className="py-2.5 px-2 font-mono text-slate-600">
                                    {new Date(item.movement.date).toLocaleDateString()} · {item.movement.event}
                                  </td>
                                  <td className="py-2.5 px-2 font-medium text-slate-900">
                                    {item.movement.productName} · {item.movement.serviceName}
                                  </td>
                                  <td
                                    className={`py-2.5 px-2 text-right font-mono ${
                                      isHighlighted && item.unbilledQty <= 0
                                        ? 'text-red-600 font-bold'
                                        : ''
                                    }`}
                                  >
                                    {item.unbilledQty}
                                  </td>
                                  <td
                                    className={`py-2.5 px-2 text-right font-mono ${
                                      item.rate <= 0
                                        ? 'text-red-600 font-semibold'
                                        : ''
                                    }`}
                                  >
                                    {formatMoney(item.rate, sym)}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-mono font-semibold">
                                    {formatMoney(item.lineTotal, sym)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>

                        <div className="p-4 rounded-xl bg-slate-50/90 border border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs">
                          <div className="space-y-1">
                            <p className="font-semibold text-slate-800">
                              Custom Discount (Applied After Private Rates)
                            </p>
                            <p className="text-[11px] text-slate-500">
                              Any billing user can set a custom percentage or flat discount for this invoice
                              {activeCorp.discountPct > 0
                                ? ` · Contract default: ${activeCorp.discountPct}%`
                                : ''}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-3">
                            <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80">
                              <button
                                type="button"
                                onClick={() => setCustomDiscountType('percent')}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                                  customDiscountType === 'percent'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                % Percent
                              </button>
                              <button
                                type="button"
                                onClick={() => setCustomDiscountType('amount')}
                                className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors ${
                                  customDiscountType === 'amount'
                                    ? 'bg-white text-slate-900 shadow-xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                {sym} Flat
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={0}
                                max={customDiscountType === 'percent' ? 100 : unbilledTotal}
                                step="0.01"
                                value={customDiscountValue}
                                onChange={(e) => setCustomDiscountValue(e.target.value)}
                                aria-label="Custom billing discount"
                                className="w-24 px-2.5 py-1.5 text-xs font-mono text-right rounded-lg bg-white border border-slate-200"
                              />
                              <span className="font-mono text-slate-500">
                                {customDiscountType === 'percent' ? '%' : sym}
                              </span>
                            </div>

                            <div className="text-right font-mono tabular-nums pl-2 border-l border-slate-200">
                              <p className="text-[11px] text-slate-500">
                                Discount: -{formatMoney(corpBillDiscountAmount, sym)}
                              </p>
                              <p className="text-sm font-semibold text-[#0071E3]">
                                Net Total: {formatMoney(corpBillNetTotal, sym)}
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-3 pt-3 border-t border-slate-200/70">
                          <input
                            type="text"
                            value={periodLabel}
                            onChange={(e) => setPeriodLabel(e.target.value)}
                            placeholder="Billing period description..."
                            className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 w-64"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              setBillingRateError('');
                              const negItems = unbilledItems.filter(
                                (it) => Number(it.rate) < 0 || Number.isNaN(it.rate)
                              );
                              if (negItems.length > 0) {
                                setBillingRateError(
                                  'Negative unit prices are not allowed in Private Catalogue. Update highlighted rate(s) before generating an invoice.'
                                );
                                setHighlightedMovementIds(
                                  new Set(negItems.map((it) => it.movement.id))
                                );
                                return;
                              }

                              const flagged: ZeroPriceAffectedLine[] = [];
                              for (const it of unbilledItems) {
                                if (!it.unbilledQty || it.unbilledQty <= 0) {
                                  flagged.push({
                                    rowKey: it.movement.id,
                                    productName: it.movement.productName,
                                    serviceName: it.movement.serviceName,
                                    quantity: it.unbilledQty || 0,
                                    unitPrice: it.rate || 0,
                                    issue: 'zero-qty',
                                  });
                                } else if (!it.rate || it.rate <= 0) {
                                  flagged.push({
                                    rowKey: it.movement.id,
                                    productName: it.movement.productName,
                                    serviceName: it.movement.serviceName,
                                    quantity: it.unbilledQty,
                                    unitPrice: 0,
                                    issue: 'zero-price',
                                  });
                                }
                              }

                              if (flagged.length > 0) {
                                setZeroWarningLines(flagged);
                                setZeroWarningOpen(true);
                                return;
                              }

                              setApprovedCorpZeroLines(undefined);
                              setHighlightedMovementIds(new Set());
                              setInvoiceDialogOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            Generate Corporate Invoice
                          </button>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Corporate Invoices & Payment Collection */}
                  <div className="liquid-glass rounded-2xl p-6 space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-3 border-b border-slate-200/70">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Issued Corporate Invoices &amp; Collections
                      </h3>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const valid = paySplits.filter((s) => Number(s.amount) > 0);
                          const totalAmt = Number(
                            valid.reduce((s, sp) => s + Number(sp.amount || 0), 0).toFixed(2)
                          );
                          if (totalAmt <= 0) return;
                          onCollectCorporatePayment(
                            activeCorp.id,
                            totalAmt,
                            valid[0].accountCode,
                            valid
                          );
                          setPaySplits([
                            {
                              accountCode: defaultCorpMoneyCode,
                              accountName: moneyAccounts.find((a) => a.code === defaultCorpMoneyCode)?.name,
                              amount: 0,
                            },
                          ]);
                        }}
                        className="flex flex-col sm:flex-row sm:items-end gap-2 w-full lg:w-auto lg:min-w-[350px]"
                      >
                        <div className="flex-1">
                          <SplitPaymentInput
                            accounts={state.accounts}
                            currencySymbol={sym}
                            splits={paySplits}
                            onChange={setPaySplits}
                            maxTotal={
                              activeCorp.outstandingBalance > 0
                                ? activeCorp.outstandingBalance
                                : undefined
                            }
                            compact
                            label="Collection Method(s)"
                            onAddMoneyAccount={onAddMoneyAccount}
                          />
                        </div>
                        <button
                          type="submit"
                          className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white whitespace-nowrap self-end"
                        >
                          <Wallet className="w-3.5 h-3.5" />
                          Record Payment
                        </button>
                      </form>
                    </div>

                    {corpInvoices.length === 0 ? (
                      <p className="text-xs text-slate-500">No corporate invoices generated yet.</p>
                    ) : (
                      <div className="divide-y divide-slate-200/60">
                        {corpInvoices.map((inv) => (
                          <div key={inv.id} className="py-3 flex items-center justify-between text-xs">
                            <div>
                              <p className="font-mono font-semibold text-slate-900">
                                {inv.id} · <span className="font-sans text-[#0071E3]">{inv.billingBasis}</span>
                              </p>
                              <p className="text-slate-500 mt-0.5">
                                {inv.periodCovered} · Issued {new Date(inv.issuedAt).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right font-mono tabular-nums">
                                <p className="font-semibold text-slate-900">{formatMoney(inv.grandTotal, sym)}</p>
                                <p className="text-slate-500">Due {formatMoney(inv.dueAmount, sym)}</p>
                              </div>
                              <button
                                onClick={() => onOpenInvoice(inv.id)}
                                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg btn-secondary"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                View / Print
                              </button>
                              {isOwner && onOwnerCustomizeInvoice && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditInvTarget(inv);
                                    setEiIssuedAt(toDateInputValue(inv.issuedAt));
                                    setEiDueDate(toDateInputValue(inv.dueDate));
                                    setEiPeriod(inv.periodCovered || '');
                                    setEiPayTerms(inv.paymentTerms);
                                    setEiTermsCond(inv.termsAndConditions);
                                    setEiLines(inv.lines.map((l) => ({ ...l })));
                                    setEiDiscount(inv.discountTotal);
                                    setEiExtra(inv.extraCharges);
                                    setEiPaid(inv.paidAmount);
                                    setEiPayAcc(defaultCorpMoneyCode);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                                  title="Customize corporate invoice (Owner)"
                                >
                                  <SlidersHorizontal className="w-3.5 h-3.5" />
                                  Customize
                                </button>
                              )}
                              {onRequestDelete && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (isOwner && onOwnerDeleteInvoice) {
                                      onRequestDelete({
                                        itemType: 'Corporate Invoice (Owner Override)',
                                        itemNameOrId: `${inv.id} (${inv.customerName})`,
                                        bodyText: `Permanently delete corporate invoice ${inv.id} (${formatMoney(
                                          inv.grandTotal,
                                          sym
                                        )}), unbill linked movements, and reverse its Sales journal & client due balance?`,
                                        accountingProtected: false,
                                        onConfirmDelete: () => onOwnerDeleteInvoice(inv.id),
                                      });
                                      return;
                                    }
                                    onRequestDelete({
                                      itemType: 'Posted Invoice',
                                      itemNameOrId: `${inv.id} (${inv.customerName})`,
                                      bodyText: `Invoice ${inv.id} (${formatMoney(inv.grandTotal, sym)}) is already posted to the accounting ledger and linked corporate movements.`,
                                      linkedInfo:
                                        'Under double-entry accounting rules, issued invoices cannot be plain-deleted. Reverse the sales journal entry in Accounting instead.',
                                      accountingProtected: true,
                                      alternativeLabel: onGoToAccounting
                                        ? 'Reverse in Accounting'
                                        : undefined,
                                      onAlternative: onGoToAccounting,
                                    });
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                                  title={isOwner ? 'Delete invoice (Owner Override)' : 'Posted invoice protection'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="liquid-glass rounded-2xl p-8 text-center text-sm text-slate-500">
              Select a corporate account to manage private pricing, movements, and billing.
            </div>
          )}
        </div>
      </div>

      {/* Generate Corporate Invoice Modal with Custom Invoice ID */}
      {invoiceDialogOpen && activeCorp && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs"
          onClick={() => setInvoiceDialogOpen(false)}
        >
          <div
            className="w-full max-w-md liquid-glass rounded-2xl p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-200/70">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Generate Corporate Invoice
                </h3>
                <p className="text-xs text-slate-500">
                  {activeCorp.name} · {activeCorp.billingBasis}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInvoiceDialogOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Corporate Invoice ID (Auto-filled, editable)
                </label>
                <input
                  required
                  maxLength={30}
                  value={customCorpInvId}
                  onChange={(e) => {
                    setCustomCorpInvId(e.target.value);
                    setCorpInvErr('');
                  }}
                  placeholder="CINV-0001"
                  className={`w-full px-3 py-2 font-mono rounded-xl bg-white border focus:outline-none ${
                    !corpInvCheck.valid || corpInvErr
                      ? 'border-red-400'
                      : 'border-slate-200 focus:border-[#0071E3]'
                  }`}
                />
                {(!corpInvCheck.valid || corpInvErr) && (
                  <p className="text-[11px] text-red-600 mt-1">{corpInvErr || corpInvCheck.error}</p>
                )}
                {corpInvCheck.valid && corpInvCheck.matchedHigherNumber && (
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-[#0071E3] mt-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={continueCorpInvNum}
                      onChange={(e) => setContinueCorpInvNum(e.target.checked)}
                    />
                    Continue numbering from {corpInvCheck.matchedHigherNumber + 1}
                  </label>
                )}
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Period Covered</label>
                <input
                  value={periodLabel}
                  onChange={(e) => setPeriodLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Invoice Date</label>
                  <input
                    type="date"
                    value={invIssueDate}
                    onChange={(e) => setInvIssueDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={invDueDate}
                    onChange={(e) => setInvDueDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="font-medium text-slate-700">
                    Custom Discount (After Private Rate)
                  </label>
                  <div className="inline-flex p-0.5 rounded-lg bg-slate-200/80">
                    <button
                      type="button"
                      onClick={() => setCustomDiscountType('percent')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                        customDiscountType === 'percent'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick={() => setCustomDiscountType('amount')}
                      className={`px-2 py-0.5 text-[11px] font-semibold rounded-md ${
                        customDiscountType === 'amount'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600'
                      }`}
                    >
                      {sym}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={customDiscountType === 'percent' ? 100 : unbilledTotal}
                    step="0.01"
                    value={customDiscountValue}
                    onChange={(e) => setCustomDiscountValue(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                  <span className="text-slate-500 font-mono shrink-0">
                    {customDiscountType === 'percent' ? '%' : sym}
                  </span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5 tabular-nums">
                <div className="flex items-center justify-between text-slate-600">
                  <span>{unbilledItems.length} unbilled line(s) (Private Rate Subtotal)</span>
                  <span className="font-mono">{formatMoney(unbilledTotal, sym)}</span>
                </div>
                <div className="flex items-center justify-between text-emerald-700">
                  <span>
                    Custom Discount (
                    {customDiscountType === 'percent'
                      ? `${Math.min(100, parsedCustomDiscVal)}%`
                      : 'Flat'}
                    )
                  </span>
                  <span className="font-mono">-{formatMoney(corpBillDiscountAmount, sym)}</span>
                </div>
                <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/70 font-semibold text-slate-900">
                  <span>Final Invoice Total</span>
                  <span className="font-mono text-[#0071E3]">
                    {formatMoney(corpBillNetTotal, sym)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setInvoiceDialogOpen(false)}
                className="px-3.5 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!corpInvCheck.valid) {
                    setCorpInvErr(corpInvCheck.error || 'Invalid Invoice ID');
                    return;
                  }
                  onGenerateCorporateInvoice(activeCorp.id, periodLabel, {
                    customInvoiceId: corpInvCheck.cleanId,
                    advanceCounterTo:
                      continueCorpInvNum && corpInvCheck.matchedHigherNumber
                        ? corpInvCheck.matchedHigherNumber + 1
                        : undefined,
                    issuedAt: invIssueDate,
                    dueDate: invDueDate,
                    customDiscountType,
                    customDiscountValue: parsedCustomDiscVal,
                    approvedZeroPriceLines: approvedCorpZeroLines,
                  });
                  setApprovedCorpZeroLines(undefined);
                  setCustomDiscountType('percent');
                  setCustomDiscountValue(String(activeCorp.discountPct ?? 0));
                  setInvoiceDialogOpen(false);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl btn-primary"
              >
                <Receipt className="w-3.5 h-3.5" />
                Issue Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      <ZeroPriceWarningModal
        open={zeroWarningOpen}
        lines={zeroWarningLines}
        currencySymbol={sym}
        onGoBackAndFix={() => {
          setHighlightedMovementIds(new Set(zeroWarningLines.map((l) => l.rowKey)));
          setZeroWarningOpen(false);
        }}
        onContinue={() => {
          setApprovedCorpZeroLines(
            zeroWarningLines.map((l) => ({
              productName: l.productName,
              serviceName: l.serviceName,
              quantity: l.quantity,
            }))
          );
          setHighlightedMovementIds(new Set());
          setZeroWarningOpen(false);
          setInvoiceDialogOpen(true);
        }}
      />

      {/* Owner Customize Corporate Account & Balance Modal */}
      {isOwner && custCorpOpen && activeCorp && onOwnerUpdateCorporateProfile && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setCustCorpOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerUpdateCorporateProfile(activeCorp.id, {
                name: ecName,
                contactPerson: ecContact,
                phone: ecPhone,
                address: ecAddress,
                billingBasis: ecBasis,
                billingCycle: ecCycle,
                cutoffDayOrTime: ecCutoff,
                discountPct: ecDiscount,
                notes: ecNotes,
                outstandingBalance: ecOutstanding,
                adjustmentDate: ecAdjDate,
                adjustmentOffsetCode: ecAdjOffset,
                reason: ecAdjReason,
              });
              setCustCorpOpen(false);
            }}
            className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 my-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Corporate Account · {activeCorp.id}
                </h3>
                <p className="text-xs text-slate-500">
                  Edit profile, discount, billing rules, or adjust Balance Due anytime (Owner)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCustCorpOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Organization Name</label>
                <input
                  required
                  value={ecName}
                  onChange={(e) => setEcName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Contact Person</label>
                <input
                  value={ecContact}
                  onChange={(e) => setEcContact(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Phone</label>
                <input
                  value={ecPhone}
                  onChange={(e) => setEcPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Discount (%)</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.5"
                  value={ecDiscount}
                  onChange={(e) => setEcDiscount(Number(e.target.value))}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Billing Basis</label>
                <select
                  value={ecBasis}
                  onChange={(e) => setEcBasis(e.target.value as BillingBasis)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                >
                  <option value="Delivered-wise">Delivered-wise</option>
                  <option value="Received-wise">Received-wise</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Billing Cycle</label>
                <select
                  value={ecCycle}
                  onChange={(e) => setEcCycle(e.target.value as BillingCycle)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                >
                  <option value="Daily">Daily</option>
                  <option value="Weekly">Weekly</option>
                  <option value="Monthly">Monthly</option>
                  <option value="Fixed-date">Fixed-date</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className="block font-medium text-slate-600 mb-1">Address &amp; Cutoff</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={ecAddress}
                    onChange={(e) => setEcAddress(e.target.value)}
                    placeholder="Address..."
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200"
                  />
                  <input
                    value={ecCutoff}
                    onChange={(e) => setEcCutoff(e.target.value)}
                    placeholder="Cutoff schedule..."
                    className="px-3 py-2 rounded-xl bg-white border border-slate-200"
                  />
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs">
              <p className="font-semibold text-amber-900">
                Adjust Outstanding Balance (Posts balanced ledger adjustment)
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Balance Due ({sym})
                  </label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={ecOutstanding}
                    onChange={(e) => setEcOutstanding(Math.max(0, Number(e.target.value)))}
                    className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Adjustment Date
                  </label>
                  <input
                    type="date"
                    value={ecAdjDate}
                    onChange={(e) => setEcAdjDate(e.target.value)}
                    className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                    Offset Account
                  </label>
                  <select
                    value={ecAdjOffset}
                    onChange={(e) => setEcAdjOffset(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                  >
                    {state.accounts
                      .filter((a) => a.code !== '1110')
                      .map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <input
                value={ecAdjReason}
                onChange={(e) => setEcAdjReason(e.target.value)}
                placeholder="Reason for adjustment..."
                className="w-full px-3 py-1.5 rounded-lg bg-white border border-slate-200"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCustCorpOpen(false)}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                Save Corporate Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner Customize Corporate Movement Modal */}
      {isOwner && editMovTarget && activeCorp && onOwnerCustomizeCorporateMovement && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setEditMovTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerCustomizeCorporateMovement(editMovTarget.id, {
                date: dateInputToIso(emDate, editMovTarget.date),
                orderId: emOrderId,
                event: emEvent,
                productId: emProdId,
                serviceId: emSrvId,
                qty: emQty,
                unitPriceSnapshot: emUnitPrice,
                reason: emReason,
              });
              setEditMovTarget(null);
            }}
            className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="text-base font-semibold text-slate-900">
                Customize Movement · {editMovTarget.orderId || editMovTarget.id}
              </h3>
              <button
                type="button"
                onClick={() => setEditMovTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Movement Date</label>
                <input
                  type="date"
                  required
                  value={emDate}
                  onChange={(e) => setEmDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Batch / Order ID</label>
                <input
                  value={emOrderId}
                  onChange={(e) => setEmOrderId(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Event</label>
                <select
                  value={emEvent}
                  onChange={(e) => setEmEvent(e.target.value as CorporateMovementType)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                >
                  <option value="Received">Received (+)</option>
                  <option value="Delivered">Delivered (-)</option>
                  <option value="Returned">Returned (-)</option>
                  <option value="Rewash">Rewash</option>
                  <option value="Damaged">Damaged (-)</option>
                  <option value="Missing">Missing (-)</option>
                  <option value="Adjustment">Adjustment (+)</option>
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Quantity</label>
                <input
                  type="number"
                  min={0}
                  value={emQty}
                  onChange={(e) => setEmQty(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Private Product</label>
                <select
                  value={emProdId}
                  onChange={(e) => setEmProdId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                >
                  {activeCorp.products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Private Service</label>
                <select
                  value={emSrvId}
                  onChange={(e) => setEmSrvId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                >
                  {activeCorp.services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Rate ({sym})</label>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={emUnitPrice}
                  onChange={(e) => setEmUnitPrice(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Reason / Note</label>
                <input
                  value={emReason}
                  onChange={(e) => setEmReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditMovTarget(null)}
                className="px-4 py-2 font-medium rounded-xl border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                Save Movement
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner Customize Corporate Invoice Modal */}
      {isOwner && editInvTarget && activeCorp && onOwnerCustomizeInvoice && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setEditInvTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerCustomizeInvoice(editInvTarget.id, {
                issuedAt: dateInputToIso(eiIssuedAt, editInvTarget.issuedAt),
                dueDate: dateInputToIso(eiDueDate, editInvTarget.dueDate),
                customerName: editInvTarget.customerName,
                customerPhone: editInvTarget.customerPhone,
                customerAddress: editInvTarget.customerAddress,
                periodCovered: eiPeriod || undefined,
                paymentTerms: eiPayTerms,
                termsAndConditions: eiTermsCond,
                lines: eiLines,
                discountTotal: eiDiscount,
                extraCharges: eiExtra,
                paidAmount: eiPaid,
                paymentAccountCode: eiPayAcc,
              });
              setEditInvTarget(null);
            }}
            className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4 my-auto text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Corporate Invoice · {editInvTarget.id}
                </h3>
                <p className="text-slate-500">
                  Edit billing date, due date, lines, discounts, charges, and collected amount
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditInvTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Invoice Billing Date</label>
                <input
                  type="date"
                  required
                  value={eiIssuedAt}
                  onChange={(e) => setEiIssuedAt(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Due Date</label>
                <input
                  type="date"
                  required
                  value={eiDueDate}
                  onChange={(e) => setEiDueDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Period Covered</label>
                <input
                  value={eiPeriod}
                  onChange={(e) => setEiPeriod(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Billed Lines</span>
                <button
                  type="button"
                  onClick={() =>
                    setEiLines((prev) => [
                      ...prev,
                      {
                        productName: activeCorp.products[0]?.name || 'Linen',
                        serviceName: activeCorp.services[0]?.name || 'Laundry',
                        quantity: 1,
                        unitPrice: 0,
                        discount: 0,
                        total: 0,
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 font-medium text-[#0071E3] hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Line
                </button>
              </div>
              {eiLines.map((line, i) => (
                <div
                  key={i}
                  className="grid grid-cols-12 gap-2 items-end p-2 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Item</label>
                    <input
                      value={line.productName}
                      onChange={(e) =>
                        setEiLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, productName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1 rounded bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-3">
                    <label className="block text-[10px] text-slate-500">Service</label>
                    <input
                      value={line.serviceName}
                      onChange={(e) =>
                        setEiLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, serviceName: e.target.value } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1 rounded bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-500">Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={line.quantity}
                      onChange={(e) =>
                        setEiLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, quantity: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1 font-mono rounded bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] text-slate-500">Price</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={line.unitPrice}
                      onChange={(e) =>
                        setEiLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, unitPrice: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1 font-mono rounded bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-1">
                    <label className="block text-[10px] text-slate-500">Disc</label>
                    <input
                      type="number"
                      min={0}
                      value={line.discount}
                      onChange={(e) =>
                        setEiLines((prev) =>
                          prev.map((row, idx) =>
                            idx === i ? { ...row, discount: Math.max(0, Number(e.target.value)) } : row
                          )
                        )
                      }
                      className="w-full px-2 py-1 font-mono rounded bg-white border border-slate-200"
                    />
                  </div>
                  <div className="col-span-1 text-right">
                    {eiLines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setEiLines((prev) => prev.filter((_, idx) => idx !== i))}
                        className="p-1 text-red-500 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-200">
              <div>
                <label className="block font-medium text-slate-600 mb-1">Discount ({sym})</label>
                <input
                  type="number"
                  min={0}
                  value={eiDiscount}
                  onChange={(e) => setEiDiscount(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Extra Charges ({sym})</label>
                <input
                  type="number"
                  min={0}
                  value={eiExtra}
                  onChange={(e) => setEiExtra(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Paid Amount ({sym})</label>
                <input
                  type="number"
                  min={0}
                  value={eiPaid}
                  onChange={(e) => setEiPaid(Math.max(0, Number(e.target.value)))}
                  className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block font-medium text-slate-600 mb-1">Payment Account</label>
                <select
                  value={eiPayAcc}
                  onChange={(e) => setEiPayAcc(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
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
                onClick={() => setEditInvTarget(null)}
                className="px-4 py-2 font-medium rounded-xl border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-5 py-2 font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
              >
                Save Invoice &amp; Sync Ledger
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

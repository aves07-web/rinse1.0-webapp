import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react';
import {
  ErpState,
  Order,
  OrderException,
  OrderLine,
  OrderStage,
  PaymentSplit,
} from '../types/erp';
import { formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import {
  DEFAULT_ID_FORMATS,
  generateNextSmartId,
  getExistingIdsForType,
  validateCustomSmartId,
} from '../utils/smartId';
import { getOrderStageBadgeStyle } from '../utils/theme';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';
import { QuickAddMoneyAccountParams, SplitPaymentInput } from './SplitPaymentInput';
import { ZeroPriceAffectedLine, ZeroPriceWarningModal } from './ZeroPriceWarningModal';

interface OrdersViewProps {
  state: ErpState;
  initialOpenCreate?: boolean;
  canEditIssuedIds?: boolean;
  onCreateOrder: (params: {
    customOrderId?: string;
    advanceOrderCounterTo?: number;
    customInvoiceId?: string;
    advanceInvoiceCounterTo?: number;
    customerId: string;
    deliveryOptionId: string;
    physicallyReceived: boolean;
    lines: Array<{
      productId: string;
      serviceId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      saveAsCustomerPrice: boolean;
    }>;
    approvedZeroPriceLines?: Array<{ productName: string; serviceName: string; quantity: number }>;
    orderDiscount: number;
    additionalCharge: number;
    additionalChargeLabel: string;
    addAdditionalToOrder: boolean;
    notes: string;
    initialPaidAmount: number;
    paymentAccountCode: string;
    paymentSplits?: PaymentSplit[];
  }) => void;
  onRenameOrderId?: (oldId: string, newId: string) => boolean;
  onDeleteOrder?: (orderId: string) => void;
  onGoToAccounting?: () => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
  onAdvanceStage: (orderId: string, nextStage: OrderStage, note?: string) => void;
  onPartialDeliver: (orderId: string, deliveries: Record<string, number>) => void;
  onAddException: (
    orderId: string,
    exc: Omit<OrderException, 'id' | 'date' | 'resolved'>
  ) => void;
  onResolveException: (orderId: string, exceptionId: string) => void;
  onCollectOrderPayment: (
    orderId: string,
    amount: number,
    paymentAccountCode: string,
    paymentSplits?: PaymentSplit[]
  ) => void;
  onAddMoneyAccount?: (params: QuickAddMoneyAccountParams) => string | null;
  onOpenDocument: (type: 'invoice' | 'token', id: string) => void;
}

export function OrdersView({
  state,
  initialOpenCreate = false,
  canEditIssuedIds = false,
  onCreateOrder,
  onRenameOrderId,
  onDeleteOrder,
  onGoToAccounting,
  onRequestDelete,
  onAdvanceStage,
  onPartialDeliver,
  onAddException,
  onResolveException,
  onCollectOrderPayment,
  onAddMoneyAccount,
  onOpenDocument,
}: OrdersViewProps) {
  const sym = state.settings.currencySymbol;
  const theme = state.settings.appearanceTheme || 'colorful';
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('ALL');
  const [showCreate, setShowCreate] = useState(initialOpenCreate);
  const [selectedOrderId, setSelectedOrderId] = useState<string>(state.orders[0]?.id || '');

  // New Order Form State
  const [customOrderId, setCustomOrderId] = useState(() =>
    generateNextSmartId(state, 'retailOrder').id
  );
  const [continueOrderNum, setContinueOrderNum] = useState(false);
  const [customInvoiceId, setCustomInvoiceId] = useState(() =>
    generateNextSmartId(state, 'retailInvoice').id
  );
  const [continueInvoiceNum, setContinueInvoiceNum] = useState(false);
  const [idFormError, setIdFormError] = useState('');
  const [zeroWarningLines, setZeroWarningLines] = useState<ZeroPriceAffectedLine[]>([]);
  const [zeroWarningOpen, setZeroWarningOpen] = useState(false);
  const [highlightedLineKeys, setHighlightedLineKeys] = useState<Set<string>>(new Set());

  // Authorized Order ID rename state
  const [editingOrderId, setEditingOrderId] = useState(false);
  const [renameOrderInput, setRenameOrderInput] = useState('');
  const [renameOrderErr, setRenameOrderErr] = useState('');

  useEffect(() => {
    if (showCreate) {
      setCustomOrderId(generateNextSmartId(state, 'retailOrder').id);
      setCustomInvoiceId(generateNextSmartId(state, 'retailInvoice').id);
      setContinueOrderNum(false);
      setContinueInvoiceNum(false);
      setIdFormError('');
    }
  }, [showCreate, state.orders.length, state.invoices.length, state.idFormats]);

  const [customerId, setCustomerId] = useState(state.customers[0]?.id || '');
  const [deliveryOptionId, setDeliveryOptionId] = useState(state.deliveryOptions[0]?.id || 'del-reg');
  const [physicallyReceived, setPhysicallyReceived] = useState(true);
  const [orderDiscount, setOrderDiscount] = useState(0);
  const [additionalCharge, setAdditionalCharge] = useState(0);
  const [additionalChargeLabel, setAdditionalChargeLabel] = useState('Stain / Spot Treatment');
  const [addAdditionalToOrder, setAddAdditionalToOrder] = useState(false);
  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultMoneyAccountCode = moneyAccounts[0]?.code || '1010';
  const [notes, setNotes] = useState('');
  const [initialSplits, setInitialSplits] = useState<PaymentSplit[]>(() => [
    { accountCode: defaultMoneyAccountCode, accountName: moneyAccounts[0]?.name, amount: 0 },
  ]);

  const activeProducts = useMemo(() => state.products.filter((p) => p.active), [state.products]);
  const activeServices = useMemo(() => state.services.filter((s) => s.active), [state.services]);

  useEffect(() => {
    if (!customerId && state.customers.length > 0) {
      const nextCust = state.customers[0].id;
      setCustomerId(nextCust);
      updateDraftContextPrices(nextCust, deliveryOptionId);
    }
  }, [customerId, state.customers]);

  useEffect(() => {
    const firstProd = activeProducts[0]?.id || '';
    const firstSrv = activeServices[0]?.id || '';
    if (!firstProd && !firstSrv) return;
    setDraftLines((prev) => {
      let changed = false;
      const next = prev.map((line) => {
        const nextP = line.productId || firstProd;
        const nextS = line.serviceId || firstSrv;
        if (nextP !== line.productId || nextS !== line.serviceId) {
          changed = true;
          return {
            ...line,
            productId: nextP,
            serviceId: nextS,
            unitPrice: resolveDefaultUnitPrice(customerId, nextP, nextS, deliveryOptionId),
          };
        }
        return line;
      });
      return changed ? next : prev;
    });
  }, [activeProducts, activeServices]);

  const resolveDefaultUnitPrice = (custId: string, prodId: string, srvId: string, delId: string) => {
    const custom = state.customerCustomPrices.find(
      (cp) => cp.customerId === custId && cp.productId === prodId && cp.serviceId === srvId
    );
    const base =
      custom?.price ??
      state.prices.find((p) => p.productId === prodId && p.serviceId === srvId)?.price ??
      0;
    const del = state.deliveryOptions.find((d) => d.id === delId);
    const mult = del ? del.multiplier : 1;
    const flat = del ? del.surchargeFlat : 0;
    return Number((base * mult + flat).toFixed(2));
  };

  const [draftLines, setDraftLines] = useState<
    Array<{
      key: string;
      productId: string;
      serviceId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      saveAsCustomerPrice: boolean;
      isCustomOrDefault: string;
    }>
  >(() => {
    const pId = activeProducts[0]?.id || '';
    const sId = activeServices[0]?.id || '';
    const cust = state.customers[0]?.id || '';
    return [
      {
        key: 'line-1',
        productId: pId,
        serviceId: sId,
        quantity: 2,
        unitPrice: resolveDefaultUnitPrice(cust, pId, sId, 'del-reg'),
        discount: 0,
        saveAsCustomerPrice: false,
        isCustomOrDefault: 'Default rate',
      },
    ];
  });

  // Partial delivery & Exception & Payment inputs
  const [deliverQtyMap, setDeliverQtyMap] = useState<Record<string, number>>({});
  const [excLineId, setExcLineId] = useState('');
  const [excType, setExcType] = useState<OrderException['type']>('Rewash');
  const [excQty, setExcQty] = useState(1);
  const [excReason, setExcReason] = useState('');
  const [collectSplits, setCollectSplits] = useState<PaymentSplit[]>(() => [
    { accountCode: defaultMoneyAccountCode, accountName: moneyAccounts[0]?.name, amount: 0 },
  ]);

  const updateDraftContextPrices = (nextCustId: string, nextDelId: string) => {
    setDraftLines((prev) =>
      prev.map((line) => {
        const hasCustom = state.customerCustomPrices.some(
          (cp) =>
            cp.customerId === nextCustId &&
            cp.productId === line.productId &&
            cp.serviceId === line.serviceId
        );
        return {
          ...line,
          unitPrice: resolveDefaultUnitPrice(nextCustId, line.productId, line.serviceId, nextDelId),
          isCustomOrDefault: hasCustom ? 'Saved customer rate' : 'Retail default',
        };
      })
    );
  };

  const draftTotal = useMemo(() => {
    const lineSum = draftLines.reduce(
      (s, l) => s + Math.max(0, l.quantity * l.unitPrice - l.discount),
      0
    );
    const extra = addAdditionalToOrder ? additionalCharge : 0;
    return Math.max(0, Number((lineSum - orderDiscount + extra).toFixed(2)));
  }, [draftLines, orderDiscount, additionalCharge, addAdditionalToOrder]);

  const filteredOrders = state.orders.filter((o) => {
    const matchesStage = stageFilter === 'ALL' || o.stage === stageFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      o.id.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.customerId.toLowerCase().includes(q);
    return matchesStage && matchesSearch;
  });

  const activeOrder: Order | null =
    state.orders.find((o) => o.id === selectedOrderId) || filteredOrders[0] || null;

  const orderRule = state.idFormats?.retailOrder || DEFAULT_ID_FORMATS.retailOrder;
  const invRule = state.idFormats?.retailInvoice || DEFAULT_ID_FORMATS.retailInvoice;
  const existingOrderIds = getExistingIdsForType(state, 'retailOrder');
  const existingInvoiceIds = getExistingIdsForType(state, 'retailInvoice');
  const orderIdCheck = validateCustomSmartId(customOrderId, existingOrderIds, orderRule);
  const invoiceIdCheck = validateCustomSmartId(customInvoiceId, existingInvoiceIds, invRule);

  const commitOrderSubmission = (
    approvedZeroPriceLines?: Array<{ productName: string; serviceName: string; quantity: number }>
  ) => {
    const validSplits = initialSplits.filter((s) => Number(s.amount) > 0);
    const totalInitialPaid = Number(
      validSplits.reduce((sum, s) => sum + Number(s.amount || 0), 0).toFixed(2)
    );
    const primaryAcc = validSplits[0]?.accountCode || initialSplits[0]?.accountCode || defaultMoneyAccountCode;

    onCreateOrder({
      customOrderId: orderIdCheck.cleanId,
      advanceOrderCounterTo:
        continueOrderNum && orderIdCheck.matchedHigherNumber
          ? orderIdCheck.matchedHigherNumber + 1
          : undefined,
      customInvoiceId: invoiceIdCheck.cleanId,
      advanceInvoiceCounterTo:
        continueInvoiceNum && invoiceIdCheck.matchedHigherNumber
          ? invoiceIdCheck.matchedHigherNumber + 1
          : undefined,
      customerId,
      deliveryOptionId,
      physicallyReceived,
      lines: draftLines.map((l) => ({
        productId: l.productId,
        serviceId: l.serviceId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        saveAsCustomerPrice: l.saveAsCustomerPrice,
      })),
      approvedZeroPriceLines,
      orderDiscount,
      additionalCharge,
      additionalChargeLabel,
      addAdditionalToOrder,
      notes,
      initialPaidAmount: totalInitialPaid,
      paymentAccountCode: primaryAcc,
      paymentSplits: validSplits.length > 0 ? validSplits : undefined,
    });
    setSelectedOrderId(orderIdCheck.cleanId);
    setShowCreate(false);
    setNotes('');
    setOrderDiscount(0);
    setAdditionalCharge(0);
    setInitialSplits([{ accountCode: defaultMoneyAccountCode, accountName: moneyAccounts[0]?.name, amount: 0 }]);
    setIdFormError('');
    setHighlightedLineKeys(new Set());
  };

  const handleSubmitOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId || draftLines.length === 0) return;
    if (!orderIdCheck.valid) {
      setIdFormError(orderIdCheck.error || 'Invalid Order Number');
      return;
    }
    if (!invoiceIdCheck.valid) {
      setIdFormError(invoiceIdCheck.error || 'Invalid Invoice Number');
      return;
    }

    // Reject negative unit prices
    const negativeLines = draftLines.filter((l) => Number(l.unitPrice) < 0 || Number.isNaN(l.unitPrice));
    if (negativeLines.length > 0) {
      setIdFormError('Negative unit prices are not allowed. Fix highlighted line(s) before continuing.');
      setHighlightedLineKeys(new Set(negativeLines.map((l) => l.key)));
      return;
    }

    // Scan for zero-price or zero-quantity lines before generating order + invoice
    const flagged: ZeroPriceAffectedLine[] = [];
    for (const l of draftLines) {
      const prodName = state.products.find((p) => p.id === l.productId)?.name || 'Item';
      const srvName = state.services.find((s) => s.id === l.serviceId)?.name || 'Service';
      if (!l.quantity || l.quantity <= 0) {
        flagged.push({
          rowKey: l.key,
          productName: prodName,
          serviceName: srvName,
          quantity: l.quantity || 0,
          unitPrice: l.unitPrice || 0,
          issue: 'zero-qty',
        });
      } else if (!l.unitPrice || l.unitPrice <= 0) {
        flagged.push({
          rowKey: l.key,
          productName: prodName,
          serviceName: srvName,
          quantity: l.quantity,
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

    commitOrderSubmission();
  };

  const stages: Array<'ALL' | OrderStage> = [
    'ALL',
    'Not yet received',
    'Received',
    'Processing',
    'Ready to deliver',
    'Delivered',
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Retail Order Management &amp; Tracking
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Distinct receipt confirmation, washing stages, partial delivery, rewash exceptions, and invoicing
          </p>
        </div>

        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          {showCreate ? 'Close Intake Form' : 'New Order'}
        </button>
      </div>

      {/* New Order Intake Form */}
      {showCreate && (
        <form onSubmit={handleSubmitOrder} className="liquid-glass rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/70">
            <h2 className="text-base font-semibold text-slate-900">New Retail Order Intake</h2>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={physicallyReceived}
                  onChange={(e) => setPhysicallyReceived(e.target.checked)}
                  className="rounded border-slate-300 text-[#0071E3]"
                />
                Items physically received &amp; counted now
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-white/75 border border-slate-200/80">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Order Number (Auto-filled, editable)
              </label>
              <input
                required
                maxLength={30}
                value={customOrderId}
                onChange={(e) => {
                  setCustomOrderId(e.target.value);
                  setIdFormError('');
                }}
                placeholder="ORD-0001"
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border focus:outline-none ${
                  !orderIdCheck.valid ? 'border-red-400' : 'border-slate-200 focus:border-[#0071E3]'
                }`}
              />
              {!orderIdCheck.valid && (
                <p className="text-[11px] text-red-600 mt-1">{orderIdCheck.error}</p>
              )}
              {orderIdCheck.valid && orderIdCheck.matchedHigherNumber && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[#0071E3] mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continueOrderNum}
                    onChange={(e) => setContinueOrderNum(e.target.checked)}
                  />
                  Continue order numbering from {orderIdCheck.matchedHigherNumber + 1}
                </label>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Retail Invoice Number (Auto-filled, editable)
              </label>
              <input
                required
                maxLength={30}
                value={customInvoiceId}
                onChange={(e) => {
                  setCustomInvoiceId(e.target.value);
                  setIdFormError('');
                }}
                placeholder="INV-0001"
                className={`w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border focus:outline-none ${
                  !invoiceIdCheck.valid ? 'border-red-400' : 'border-slate-200 focus:border-[#0071E3]'
                }`}
              />
              {!invoiceIdCheck.valid && (
                <p className="text-[11px] text-red-600 mt-1">{invoiceIdCheck.error}</p>
              )}
              {invoiceIdCheck.valid && invoiceIdCheck.matchedHigherNumber && (
                <label className="inline-flex items-center gap-1.5 text-[11px] text-[#0071E3] mt-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={continueInvoiceNum}
                    onChange={(e) => setContinueInvoiceNum(e.target.checked)}
                  />
                  Continue invoice numbering from {invoiceIdCheck.matchedHigherNumber + 1}
                </label>
              )}
            </div>

            {idFormError && (
              <p className="md:col-span-2 text-xs font-medium text-red-600">{idFormError}</p>
            )}
          </div>

          {(state.customers.length === 0 || activeProducts.length === 0 || activeServices.length === 0) && (
            <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-800">
              To create a retail order, make sure you have at least one{' '}
              {state.customers.length === 0 ? 'Retail Customer' : ''}
              {state.customers.length === 0 && (activeProducts.length === 0 || activeServices.length === 0)
                ? ', and '
                : ''}
              {activeProducts.length === 0 || activeServices.length === 0
                ? 'Product & Service in Products & Services'
                : ''}
              .
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Retail Customer</label>
              <select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  updateDraftContextPrices(e.target.value, deliveryOptionId);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {state.customers.length === 0 && (
                  <option value="" disabled>
                    No customers added yet
                  </option>
                )}
                {state.customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} — {c.name} ({c.phone})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Delivery Option</label>
              <select
                value={deliveryOptionId}
                onChange={(e) => {
                  setDeliveryOptionId(e.target.value);
                  updateDraftContextPrices(customerId, e.target.value);
                }}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {state.deliveryOptions
                  .filter((d) => d.active)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.targetHours}h · {d.multiplier}x)
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Physical Receipt Status
              </label>
              <div className="px-3 py-2 text-xs rounded-xl bg-white/70 border border-slate-200 font-medium">
                {physicallyReceived ? (
                  <span className="text-emerald-700">Confirmed: Received at Counter</span>
                ) : (
                  <span className="text-amber-700">Recorded as Not Yet Received</span>
                )}
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-600">Order Lines (Pieces)</h3>
              <button
                type="button"
                onClick={() => {
                  const pId = activeProducts[0]?.id || '';
                  const sId = activeServices[0]?.id || '';
                  setDraftLines((prev) => [
                    ...prev,
                    {
                      key: `line-${Date.now()}`,
                      productId: pId,
                      serviceId: sId,
                      quantity: 1,
                      unitPrice: resolveDefaultUnitPrice(customerId, pId, sId, deliveryOptionId),
                      discount: 0,
                      saveAsCustomerPrice: false,
                      isCustomOrDefault: 'Retail default',
                    },
                  ]);
                }}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Line
              </button>
            </div>

            {draftLines.map((line, idx) => {
              const isHighlighted = highlightedLineKeys.has(line.key);
              const prodName = state.products.find((p) => p.id === line.productId)?.name || 'Item';
              const srvName = state.services.find((s) => s.id === line.serviceId)?.name || 'Service';
              return (
              <div
                key={line.key}
                className={`p-3 rounded-xl border grid grid-cols-1 md:grid-cols-12 gap-3 items-end transition-colors ${
                  isHighlighted
                    ? 'bg-red-50/90 border-red-500 ring-2 ring-red-200'
                    : 'bg-white/80 border-slate-200/80'
                }`}
              >
                <div className="md:col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-1">Product</label>
                  <select
                    value={line.productId}
                    onChange={(e) => {
                      const nextP = e.target.value;
                      const nextPrice = resolveDefaultUnitPrice(
                        customerId,
                        nextP,
                        line.serviceId,
                        deliveryOptionId
                      );
                      setDraftLines((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, productId: nextP, unitPrice: nextPrice } : item
                        )
                      );
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    {activeProducts.length === 0 && (
                      <option value="">Select product...</option>
                    )}
                    {activeProducts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] text-slate-500 mb-1">Service</label>
                  <select
                    value={line.serviceId}
                    onChange={(e) => {
                      const nextS = e.target.value;
                      const nextPrice = resolveDefaultUnitPrice(
                        customerId,
                        line.productId,
                        nextS,
                        deliveryOptionId
                      );
                      setDraftLines((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, serviceId: nextS, unitPrice: nextPrice } : item
                        )
                      );
                    }}
                    className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    {activeServices.length === 0 && (
                      <option value="">Select service...</option>
                    )}
                    {activeServices.map((s) => (
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
                    min={0}
                    value={line.quantity}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setDraftLines((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, quantity: val } : item))
                      );
                      setHighlightedLineKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(line.key);
                        return next;
                      });
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border ${
                      isHighlighted && line.quantity <= 0 ? 'border-red-500 text-red-700' : 'border-slate-200'
                    }`}
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Unit ({sym}) · {line.isCustomOrDefault}
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={line.unitPrice}
                    onChange={(e) => {
                      setDraftLines((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, unitPrice: Number(e.target.value) } : item
                        )
                      );
                      setIdFormError('');
                      setHighlightedLineKeys((prev) => {
                        const next = new Set(prev);
                        next.delete(line.key);
                        return next;
                      });
                    }}
                    className={`w-full px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border ${
                      isHighlighted ? 'border-red-500 text-red-700 font-semibold' : 'border-slate-200'
                    }`}
                  />
                </div>

                <div className="md:col-span-2 flex items-center gap-2 pb-1.5">
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={line.saveAsCustomerPrice}
                      onChange={(e) =>
                        setDraftLines((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, saveAsCustomerPrice: e.target.checked } : item
                          )
                        )
                      }
                    />
                    Save rate for customer
                  </label>
                </div>

                <div className="md:col-span-1 text-right pb-1">
                  {draftLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => {
                        const removeLine = () =>
                          setDraftLines((prev) => prev.filter((_, i) => i !== idx));
                        if (onRequestDelete) {
                          onRequestDelete({
                            itemType: 'Order Line',
                            itemNameOrId: `${prodName} · ${srvName}`,
                            bodyText: `Remove ${line.quantity}x ${prodName} (${srvName}) from this draft order?`,
                            onConfirmDelete: removeLine,
                          });
                        } else {
                          removeLine();
                        }
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-600"
                      title="Delete order line"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>

          {/* Discounts, Add-to-Order Extra Charge & Payment */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 pt-3 border-t border-slate-200/70 items-start">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Order Discount ({sym})
              </label>
              <input
                type="number"
                min={0}
                value={orderDiscount}
                onChange={(e) => setOrderDiscount(Number(e.target.value))}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
            </div>

            <div className="md:col-span-4 p-3 rounded-xl bg-white/70 border border-slate-200/80 space-y-2">
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addAdditionalToOrder}
                  onChange={(e) => setAddAdditionalToOrder(e.target.checked)}
                />
                Add to Order: Extra Treatment / Charge
              </label>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  disabled={!addAdditionalToOrder}
                  value={additionalChargeLabel}
                  onChange={(e) => setAdditionalChargeLabel(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200 disabled:opacity-50"
                />
                <input
                  type="number"
                  min={0}
                  disabled={!addAdditionalToOrder}
                  value={additionalCharge}
                  onChange={(e) => setAdditionalCharge(Number(e.target.value))}
                  placeholder={`Amount (${sym})`}
                  className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200 disabled:opacity-50"
                />
              </div>
            </div>

            <div className="md:col-span-6 p-3 rounded-xl bg-white/70 border border-slate-200/80">
              <SplitPaymentInput
                accounts={state.accounts}
                currencySymbol={sym}
                splits={initialSplits}
                onChange={setInitialSplits}
                maxTotal={draftTotal}
                label={`Initial Payment (${sym}) — Single or Split`}
                allowZero
                onAddMoneyAccount={onAddMoneyAccount}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Order notes or special garment care instructions..."
              className="flex-1 min-w-[240px] px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-xs text-slate-500">Order Total</span>
                <p className="text-lg font-mono font-semibold text-slate-900 tabular-nums">
                  {formatMoney(draftTotal, sym)}
                </p>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors whitespace-nowrap"
              >
                Create Order &amp; Sync Calendar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Search & Stage Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order ID or customer..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white/85 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          {stages.map((st) => (
            <button
              key={st}
              onClick={() => setStageFilter(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                stageFilter === st
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'All Stages' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Order Queue + Detail Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5 liquid-glass rounded-2xl overflow-hidden divide-y divide-slate-200/60">
          {filteredOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              No orders match the current filter.
            </div>
          ) : (
            filteredOrders.map((o) => {
              const isSelected = activeOrder?.id === o.id;
              const due = Math.max(0, o.totalAmount - o.paidAmount);
              return (
                <button
                  key={o.id}
                  onClick={() => {
                    setSelectedOrderId(o.id);
                    setDeliverQtyMap({});
                    setExcLineId(o.lines[0]?.id || '');
                  }}
                  className={`w-full text-left p-4 transition-colors ${
                    isSelected ? 'bg-white/95' : 'hover:bg-white/60'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono font-semibold text-slate-900">{o.id}</span>
                    <span className={getOrderStageBadgeStyle(o.stage, theme)}>{o.stage}</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-900 mt-1">{o.customerName}</p>
                  <div className="flex items-center justify-between text-xs text-slate-500 mt-1 tabular-nums">
                    <span>
                      {o.deliveryOptionName} · Due{' '}
                      {new Date(o.expectedDeliveryAt).toLocaleDateString()}
                    </span>
                    <span className="font-mono text-slate-800">
                      {due > 0 ? `Bal ${formatMoney(due, sym)}` : 'Paid'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div className="lg:col-span-7 space-y-6">
          {activeOrder ? (
            <>
              <div className="liquid-glass rounded-2xl p-6 space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200/70">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-800">{activeOrder.id}</span>
                      {canEditIssuedIds && onRenameOrderId && !editingOrderId && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingOrderId(true);
                            setRenameOrderInput(activeOrder.id);
                            setRenameOrderErr('');
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#0071E3] hover:underline"
                          title="Authorized Order ID change (logged to Black Box)"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit ID
                        </button>
                      )}
                      <span>·</span>
                      <span>{activeOrder.deliveryOptionName}</span>
                      <span>·</span>
                      <span
                        className={
                          activeOrder.physicallyReceived
                            ? 'text-emerald-700 font-medium'
                            : 'text-amber-700 font-medium'
                        }
                      >
                        {activeOrder.physicallyReceived ? 'Physically Received' : 'Awaiting Physical Receipt'}
                      </span>
                    </div>
                    {editingOrderId && (
                      <div className="mt-2 p-2.5 rounded-xl bg-white/90 border border-slate-200 flex flex-wrap items-center gap-2">
                        <input
                          value={renameOrderInput}
                          maxLength={30}
                          onChange={(e) => {
                            setRenameOrderInput(e.target.value);
                            setRenameOrderErr('');
                          }}
                          className="px-2.5 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = validateCustomSmartId(
                              renameOrderInput,
                              new Set(
                                Array.from(existingOrderIds).filter(
                                  (x) => x !== activeOrder.id.toLowerCase()
                                )
                              ),
                              orderRule
                            );
                            if (!res.valid) {
                              setRenameOrderErr(res.error || 'Invalid Order ID');
                              return;
                            }
                            if (onRenameOrderId?.(activeOrder.id, res.cleanId)) {
                              setSelectedOrderId(res.cleanId);
                              setEditingOrderId(false);
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#0071E3] text-white"
                        >
                          Save ID
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingOrderId(false)}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        {renameOrderErr && (
                          <span className="text-[11px] text-red-600 w-full">{renameOrderErr}</span>
                        )}
                      </div>
                    )}
                    <h2 className="text-xl font-semibold text-slate-900 mt-1">
                      {activeOrder.customerName}
                    </h2>
                    <p className="text-xs text-slate-500 mt-1 tabular-nums">
                      Expected delivery:{' '}
                      {new Date(activeOrder.expectedDeliveryAt).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {activeOrder.invoiceId && (
                      <button
                        onClick={() => onOpenDocument('invoice', activeOrder.invoiceId!)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl btn-secondary"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Invoice {activeOrder.invoiceId}
                      </button>
                    )}
                    <button
                      onClick={() => onOpenDocument('token', activeOrder.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl btn-secondary"
                    >
                      <Tag className="w-3.5 h-3.5" />
                      Print Token / QR
                    </button>
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          const hasPostedPaymentOrInvoice =
                            activeOrder.paidAmount > 0 || Boolean(activeOrder.invoiceId);
                          if (hasPostedPaymentOrInvoice || activeOrder.isOpening) {
                            onRequestDelete({
                              itemType: 'Posted Order',
                              itemNameOrId: `${activeOrder.id} (${activeOrder.customerName})`,
                              bodyText: `Order ${activeOrder.id} has an issued invoice (${
                                activeOrder.invoiceId || 'N/A'
                              }) or collected payments (${formatMoney(
                                activeOrder.paidAmount,
                                sym
                              )}) posted to the ledger.`,
                              linkedInfo:
                                'Under double-entry accounting rules, posted orders cannot be plain-deleted. Reverse the sales/collection journal entry in Accounting instead.',
                              accountingProtected: true,
                              alternativeLabel: onGoToAccounting
                                ? 'Reverse in Accounting'
                                : undefined,
                              onAlternative: onGoToAccounting,
                            });
                          } else {
                            onRequestDelete({
                              itemType: 'Retail Order',
                              itemNameOrId: `${activeOrder.id} (${activeOrder.customerName})`,
                              bodyText: `Order ${activeOrder.id} for ${activeOrder.customerName} will be permanently deleted. This cannot be undone.`,
                              onConfirmDelete: () => onDeleteOrder?.(activeOrder.id),
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title="Delete order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Stage Transition Controls */}
                <div className="flex flex-wrap items-center gap-2">
                  {!activeOrder.physicallyReceived && (
                    <button
                      onClick={() =>
                        onAdvanceStage(
                          activeOrder.id,
                          'Received',
                          'Physical garment count verified at intake'
                        )
                      }
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
                    >
                      <PackageCheck className="w-3.5 h-3.5" />
                      Confirm Physical Receipt
                    </button>
                  )}
                  {activeOrder.stage === 'Received' && (
                    <button
                      onClick={() => onAdvanceStage(activeOrder.id, 'Processing', 'Loaded into wash batch')}
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
                    >
                      Start Processing
                    </button>
                  )}
                  {activeOrder.stage === 'Processing' && (
                    <button
                      onClick={() =>
                        onAdvanceStage(activeOrder.id, 'Ready to deliver', 'Pressing & QC complete')
                      }
                      className="px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
                    >
                      Mark Ready to Deliver
                    </button>
                  )}
                </div>

                {/* Order Items & Partial Delivery */}
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse erp-table">
                    <thead>
                      <tr className="border-b border-slate-200/70">
                        <th className="py-2 pr-2">Item &amp; Service</th>
                        <th className="py-2 px-2 text-right">Recv</th>
                        <th className="py-2 px-2 text-right">Deliv</th>
                        <th className="py-2 px-2 text-right">Rewash</th>
                        <th className="py-2 px-2 text-right">Pending</th>
                        <th className="py-2 pl-2 text-right">Deliver Now</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {activeOrder.lines.map((line: OrderLine) => {
                        const remaining = Math.max(
                          0,
                          line.quantityReceived - line.quantityDelivered
                        );
                        return (
                          <tr key={line.id}>
                            <td className="py-3 pr-2">
                              <p className="font-semibold text-slate-900">
                                {line.productName} · {line.serviceName}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {line.quantityOrdered} pcs @ {formatMoney(line.unitPrice, sym)}
                              </p>
                            </td>
                            <td className="py-3 px-2 text-right font-mono tabular-nums">
                              {line.quantityReceived}
                            </td>
                            <td className="py-3 px-2 text-right font-mono tabular-nums text-emerald-700 font-medium">
                              {line.quantityDelivered}
                            </td>
                            <td className="py-3 px-2 text-right font-mono tabular-nums text-amber-700">
                              {line.quantityRewash}
                            </td>
                            <td className="py-3 px-2 text-right font-mono tabular-nums font-semibold">
                              {remaining}
                            </td>
                            <td className="py-3 pl-2 text-right">
                              {remaining > 0 && activeOrder.physicallyReceived ? (
                                <input
                                  type="number"
                                  min={0}
                                  max={remaining}
                                  value={deliverQtyMap[line.id] ?? 0}
                                  onChange={(e) =>
                                    setDeliverQtyMap((prev) => ({
                                      ...prev,
                                      [line.id]: Math.min(
                                        remaining,
                                        Math.max(0, Number(e.target.value))
                                      ),
                                    }))
                                  }
                                  className="w-16 px-2 py-1 text-right font-mono rounded-lg bg-white border border-slate-200"
                                />
                              ) : (
                                <span className="text-slate-400">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {activeOrder.physicallyReceived &&
                  activeOrder.lines.some((l) => l.quantityReceived > l.quantityDelivered) && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => {
                          onPartialDeliver(activeOrder.id, deliverQtyMap);
                          setDeliverQtyMap({});
                        }}
                        className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800"
                      >
                        Record Partial / Full Delivery
                      </button>
                    </div>
                  )}

                {/* Order Financial Summary & Payment */}
                <div className="pt-4 border-t border-slate-200/70 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="text-xs space-y-1 tabular-nums">
                    <p className="text-slate-600">
                      Total: <strong className="font-mono text-slate-900">{formatMoney(activeOrder.totalAmount, sym)}</strong>
                      {activeOrder.addAdditionalToOrder && (
                        <span> (includes {activeOrder.additionalChargeLabel}: {formatMoney(activeOrder.additionalCharge, sym)})</span>
                      )}
                    </p>
                    <p className="text-slate-600">
                      Paid: <span className="font-mono text-emerald-700">{formatMoney(activeOrder.paidAmount, sym)}</span> · Due:{' '}
                      <strong className="font-mono text-slate-900">
                        {formatMoney(Math.max(0, activeOrder.totalAmount - activeOrder.paidAmount), sym)}
                      </strong>
                    </p>
                    {activeOrder.paymentSplits && activeOrder.paymentSplits.length > 0 && (
                      <p className="text-[11px] text-slate-500">
                        Channels:{' '}
                        {activeOrder.paymentSplits
                          .map((s) => `${s.accountName || s.accountCode} ${formatMoney(s.amount, sym)}`)
                          .join(' + ')}
                      </p>
                    )}
                  </div>

                  {activeOrder.totalAmount - activeOrder.paidAmount > 0.01 && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const remainingDue = Math.max(
                          0,
                          Number((activeOrder.totalAmount - activeOrder.paidAmount).toFixed(2))
                        );
                        const valid = collectSplits.filter((s) => Number(s.amount) > 0);
                        const totalCollect = Number(
                          valid.reduce((s, sp) => s + Number(sp.amount || 0), 0).toFixed(2)
                        );
                        if (totalCollect <= 0 || totalCollect > remainingDue + 0.01) return;
                        onCollectOrderPayment(
                          activeOrder.id,
                          totalCollect,
                          valid[0].accountCode,
                          valid
                        );
                        setCollectSplits([
                          {
                            accountCode: defaultMoneyAccountCode,
                            accountName: moneyAccounts[0]?.name,
                            amount: 0,
                          },
                        ]);
                      }}
                      className="flex flex-col sm:flex-row sm:items-end gap-2 w-full lg:w-auto lg:min-w-[340px]"
                    >
                      <div className="flex-1">
                        <SplitPaymentInput
                          accounts={state.accounts}
                          currencySymbol={sym}
                          splits={collectSplits}
                          onChange={setCollectSplits}
                          maxTotal={Math.max(
                            0,
                            Number((activeOrder.totalAmount - activeOrder.paidAmount).toFixed(2))
                          )}
                          compact
                          label="After Delivery / Final Payment"
                          onAddMoneyAccount={onAddMoneyAccount}
                        />
                      </div>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap self-end"
                      >
                        Collect
                      </button>
                    </form>
                  )}
                </div>
              </div>

              {/* Rewash & Exception Log + Stage History */}
              <div className="liquid-glass rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900">
                  Rewash, Damage &amp; Exception Log
                </h3>

                {activeOrder.exceptions.length > 0 && (
                  <div className="space-y-2">
                    {activeOrder.exceptions.map((exc) => (
                      <div
                        key={exc.id}
                        className="p-3 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-between gap-3 text-xs"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                            <span className="font-semibold text-slate-900">
                              {exc.type} ({exc.qty}x {exc.productName})
                            </span>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-500 font-mono">
                              {new Date(exc.date).toLocaleDateString()}
                            </span>
                          </div>
                          <p className="text-slate-600 mt-0.5">{exc.reason}</p>
                        </div>
                        {!exc.resolved ? (
                          <button
                            onClick={() => onResolveException(activeOrder.id, exc.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-emerald-600 hover:text-emerald-700 whitespace-nowrap"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Resolve
                          </button>
                        ) : (
                          <span className="text-emerald-700 font-medium">Resolved</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const targetLine =
                      activeOrder.lines.find((l) => l.id === excLineId) || activeOrder.lines[0];
                    if (!targetLine || !excReason.trim()) return;
                    onAddException(activeOrder.id, {
                      type: excType,
                      lineId: targetLine.id,
                      productName: targetLine.productName,
                      serviceName: targetLine.serviceName,
                      qty: excQty,
                      reason: excReason.trim(),
                    });
                    setExcReason('');
                  }}
                  className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-slate-200/70"
                >
                  <select
                    value={excLineId || activeOrder.lines[0]?.id || ''}
                    onChange={(e) => setExcLineId(e.target.value)}
                    className="md:col-span-3 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    {activeOrder.lines.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.productName} ({l.serviceName})
                      </option>
                    ))}
                  </select>
                  <select
                    value={excType}
                    onChange={(e) => setExcType(e.target.value as OrderException['type'])}
                    className="md:col-span-2 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    <option value="Rewash">Rewash</option>
                    <option value="Damaged">Damaged</option>
                    <option value="Missing">Missing</option>
                    <option value="Rejected">Rejected</option>
                    <option value="Returned">Returned</option>
                  </select>
                  <input
                    type="number"
                    min={1}
                    value={excQty}
                    onChange={(e) => setExcQty(Math.max(1, Number(e.target.value)))}
                    className="md:col-span-1 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                  />
                  <input
                    type="text"
                    required
                    value={excReason}
                    onChange={(e) => setExcReason(e.target.value)}
                    placeholder="Reason for exception..."
                    className="md:col-span-4 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  />
                  <button
                    type="submit"
                    className="md:col-span-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700"
                  >
                    Log Event
                  </button>
                </form>

                {/* Stage History */}
                <div className="pt-3 border-t border-slate-200/70">
                  <h4 className="text-xs font-semibold text-slate-500 mb-2">Stage Timeline</h4>
                  <div className="space-y-1.5 text-xs">
                    {activeOrder.stageHistory.map((ev, idx) => (
                      <div key={idx} className="flex items-center justify-between text-slate-600">
                        <span>
                          <strong className="text-slate-800">{ev.stage}</strong>
                          {ev.note ? ` — ${ev.note}` : ''} · {ev.user}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          {new Date(ev.timestamp).toLocaleString([], {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="liquid-glass rounded-2xl p-8 text-center text-sm text-slate-500">
              Select an order to inspect physical tracking, partial delivery, and billing.
            </div>
          )}
        </div>
      </div>

      <ZeroPriceWarningModal
        open={zeroWarningOpen}
        lines={zeroWarningLines}
        currencySymbol={sym}
        onGoBackAndFix={() => {
          setHighlightedLineKeys(new Set(zeroWarningLines.map((l) => l.rowKey)));
          setZeroWarningOpen(false);
        }}
        onContinue={() => {
          const approved = zeroWarningLines.map((l) => ({
            productName: l.productName,
            serviceName: l.serviceName,
            quantity: l.quantity,
          }));
          setZeroWarningOpen(false);
          commitOrderSubmission(approved);
        }}
      />
    </div>
  );
}

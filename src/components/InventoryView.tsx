import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FlaskConical, Plus, Trash2, Truck, Wallet } from 'lucide-react';
import { ChemicalItem, ErpState, StockMovement, Supplier } from '../types/erp';
import { formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface InventoryViewProps {
  state: ErpState;
  onAddChemical: (chem: Omit<ChemicalItem, 'id'>) => void;
  onDeleteChemical?: (chemId: string) => void;
  onDeactivateChemical?: (chemId: string) => void;
  onRecordStockMovement: (params: {
    itemId: string;
    type: StockMovement['type'];
    qty: number;
    unitCost: number;
    reason: string;
    reference: string;
    paymentType?: 'Cash' | 'Bank' | 'Credit';
    paymentAccountCode?: string;
  }) => void;
  onAddSupplier: (supplier: Omit<Supplier, 'id' | 'dueBalance'>) => void;
  onDeleteSupplier?: (supplierId: string) => void;
  onDeactivateSupplier?: (supplierId: string) => void;
  onPaySupplier: (supplierId: string, amount: number, accountCode: string) => void;
  onGoToAccounting?: () => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function InventoryView({
  state,
  onAddChemical,
  onDeleteChemical,
  onDeactivateChemical,
  onRecordStockMovement,
  onAddSupplier,
  onDeleteSupplier,
  onDeactivateSupplier,
  onPaySupplier,
  onGoToAccounting,
  onRequestDelete,
}: InventoryViewProps) {
  const sym = state.settings.currencySymbol;
  const [subTab, setSubTab] = useState<'stock' | 'suppliers' | 'movements'>('stock');

  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultBankOrFirstCode =
    moneyAccounts.find((a) => a.channel === 'Bank')?.code || moneyAccounts[0]?.code || '1020';

  // Stock Movement Form
  const [movItemId, setMovItemId] = useState(state.chemicals[0]?.id || '');
  const [movType, setMovType] = useState<StockMovement['type']>('Consumed');
  const [movQty, setMovQty] = useState(5);
  const [movCost, setMovCost] = useState(state.chemicals[0]?.purchaseCost || 200);
  const [movSettlementCode, setMovSettlementCode] = useState<string>('CREDIT');
  const [movReason, setMovReason] = useState('');
  const [movRef, setMovRef] = useState('');

  // New Chemical Form
  const [showNewChem, setShowNewChem] = useState(false);
  const [chemName, setChemName] = useState('');
  const [chemCat, setChemCat] = useState('Detergent');
  const [chemSupId, setChemSupId] = useState(state.suppliers[0]?.id || '');
  const [chemUnit, setChemUnit] = useState('kg');
  const [chemCost, setChemCost] = useState(200);
  const [chemQty, setChemQty] = useState(0);
  const [chemThreshold, setChemThreshold] = useState(15);
  const [chemBatch, setChemBatch] = useState('BCH-2026-11');
  const [chemExpiry, setChemExpiry] = useState(() =>
    new Date(Date.now() + 180 * 86400000).toISOString().slice(0, 10)
  );

  // Supplier Payment & New Supplier
  const [supName, setSupName] = useState('');
  const [supPhone, setSupPhone] = useState('');
  const [supAddr, setSupAddr] = useState('');
  const [supProducts, setSupProducts] = useState('');
  const [payAmounts, setPayAmounts] = useState<Record<string, string>>({});
  const [payAccounts, setPayAccounts] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!movItemId && state.chemicals.length > 0) {
      setMovItemId(state.chemicals[0].id);
      setMovCost(state.chemicals[0].purchaseCost);
    }
  }, [movItemId, state.chemicals]);

  useEffect(() => {
    if (!chemSupId && state.suppliers.length > 0) {
      setChemSupId(state.suppliers[0].id);
    }
  }, [chemSupId, state.suppliers]);

  const totalValuation = state.chemicals.reduce(
    (s, c) => s + c.currentQty * c.purchaseCost,
    0
  );
  const lowStockCount = state.chemicals.filter((c) => c.currentQty <= c.lowStockThreshold).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Chemical Inventory &amp; Suppliers
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Measured chemical &amp; consumable stock (kg/litre/pack), batch expiry, low-stock alerts, and supplier payables
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setSubTab('stock')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'stock' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Stock ({state.chemicals.length})
          </button>
          <button
            onClick={() => setSubTab('suppliers')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'suppliers' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Suppliers ({state.suppliers.length})
          </button>
          <button
            onClick={() => setSubTab('movements')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'movements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Stock Ledger
          </button>
        </div>
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="liquid-glass rounded-2xl p-4">
          <span className="text-xs text-slate-500">Inventory Asset Valuation</span>
          <p className="text-xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {formatMoney(totalValuation, sym)}
          </p>
        </div>
        <div className="liquid-glass rounded-2xl p-4">
          <span className="text-xs text-slate-500">Low-Stock Alerts</span>
          <p
            className={`text-xl font-mono font-semibold mt-1 tabular-nums ${
              lowStockCount > 0 ? 'text-amber-600' : 'text-emerald-700'
            }`}
          >
            {lowStockCount} item(s)
          </p>
        </div>
        <div className="liquid-glass rounded-2xl p-4">
          <span className="text-xs text-slate-500">Total Supplier Payables</span>
          <p className="text-xl font-mono font-semibold text-slate-900 mt-1 tabular-nums">
            {formatMoney(
              state.suppliers.reduce((s, sup) => s + sup.dueBalance, 0),
              sym
            )}
          </p>
        </div>
      </div>

      {subTab === 'stock' && (
        <div className="space-y-6">
          {/* Stock Receive / Issue / Consume Action Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const target = state.chemicals.find((c) => c.id === movItemId) || state.chemicals[0];
              if (!target || movQty <= 0) return;
              onRecordStockMovement({
                itemId: target.id,
                type: movType,
                qty: movQty,
                unitCost: movCost,
                reason: movReason.trim() || `${movType} operation`,
                reference: movRef.trim() || `REF-${Date.now().toString().slice(-4)}`,
                paymentType:
                  movType === 'Received'
                    ? movSettlementCode === 'CREDIT'
                      ? 'Credit'
                      : moneyAccounts.find((a) => a.code === movSettlementCode)?.channel === 'Cash'
                      ? 'Cash'
                      : 'Bank'
                    : undefined,
                paymentAccountCode: movType === 'Received' ? movSettlementCode : undefined,
              });
              setMovReason('');
              setMovRef('');
            }}
            className="liquid-glass rounded-2xl p-6 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                Record Stock Purchase, Issue, Consumption or Adjustment (Auto-Posts Accounting)
              </h2>
              <button
                type="button"
                onClick={() => setShowNewChem((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline"
              >
                <Plus className="w-3.5 h-3.5" />
                {showNewChem ? 'Hide New Chemical' : 'Add Chemical SKU'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Chemical / Consumable</label>
                <select
                  value={movItemId}
                  onChange={(e) => {
                    setMovItemId(e.target.value);
                    const found = state.chemicals.find((c) => c.id === e.target.value);
                    if (found) setMovCost(found.purchaseCost);
                  }}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.chemicals.length === 0 && (
                    <option value="">No chemicals in stock yet</option>
                  )}
                  {state.chemicals.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.currentQty} {c.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Movement Type</label>
                <select
                  value={movType}
                  onChange={(e) => setMovType(e.target.value as StockMovement['type'])}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  <option value="Received">Received (Purchase)</option>
                  <option value="Consumed">Consumed in Wash</option>
                  <option value="Issued">Issued to Floor</option>
                  <option value="Returned">Returned to Supplier</option>
                  <option value="Damaged">Damaged / Spoiled</option>
                  <option value="Adjusted">Stock Adjustment</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] text-slate-500 mb-1">Qty</label>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  value={movQty}
                  onChange={(e) => setMovQty(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Unit Cost ({sym})</label>
                <input
                  type="number"
                  min={0}
                  value={movCost}
                  onChange={(e) => setMovCost(Number(e.target.value))}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              {movType === 'Received' && (
                <div className="md:col-span-2">
                  <label className="block text-[11px] text-slate-500 mb-1">Settlement</label>
                  <select
                    value={movSettlementCode}
                    onChange={(e) => setMovSettlementCode(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    <option value="CREDIT">Supplier Credit (AP)</option>
                    {moneyAccounts.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        {acc.name} ({acc.channel || 'Asset'})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className={movType === 'Received' ? 'md:col-span-2 flex gap-2' : 'md:col-span-4 flex gap-2'}>
                <input
                  type="text"
                  value={movReason}
                  onChange={(e) => setMovReason(e.target.value)}
                  placeholder="Reason / Batch ref..."
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap"
                >
                  Post
                </button>
              </div>
            </div>
          </form>

          {showNewChem && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!chemName.trim()) return;
                onAddChemical({
                  name: chemName.trim(),
                  category: chemCat,
                  supplierId: chemSupId,
                  unit: chemUnit,
                  purchaseCost: chemCost,
                  currentQty: chemQty,
                  lowStockThreshold: chemThreshold,
                  batchNumber: chemBatch,
                  expiryDate: new Date(chemExpiry).toISOString(),
                });
                setChemName('');
                setShowNewChem(false);
              }}
              className="liquid-glass rounded-2xl p-6 grid grid-cols-2 md:grid-cols-4 gap-3"
            >
              <input
                required
                value={chemName}
                onChange={(e) => setChemName(e.target.value)}
                placeholder="Chemical / Consumable name"
                className="col-span-2 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <input
                value={chemCat}
                onChange={(e) => setChemCat(e.target.value)}
                placeholder="Category (Detergent, Bleach...)"
                className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <select
                value={chemUnit}
                onChange={(e) => setChemUnit(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                <option value="kg">kg</option>
                <option value="litre">litre</option>
                <option value="bottle">bottle</option>
                <option value="pack">pack</option>
              </select>
              <select
                value={chemSupId}
                onChange={(e) => setChemSupId(e.target.value)}
                className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {state.suppliers.length === 0 && (
                  <option value="">No supplier (Optional)</option>
                )}
                {state.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                value={chemCost}
                onChange={(e) => setChemCost(Number(e.target.value))}
                placeholder="Unit cost"
                className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
              <input
                type="number"
                value={chemThreshold}
                onChange={(e) => setChemThreshold(Number(e.target.value))}
                placeholder="Alert threshold"
                className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
              <input
                type="date"
                value={chemExpiry}
                onChange={(e) => setChemExpiry(e.target.value)}
                className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
              <button
                type="submit"
                className="col-span-2 md:col-span-4 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white"
              >
                Save Chemical SKU
              </button>
            </form>
          )}

          {/* Stock Table */}
          <div className="liquid-glass rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse erp-table">
                <thead>
                  <tr className="border-b border-slate-200/80 font-semibold">
                    <th className="py-3 px-4">Chemical / Consumable</th>
                    <th className="py-3 px-4">Category · Batch</th>
                    <th className="py-3 px-4">Expiry</th>
                    <th className="py-3 px-4 text-right">Stock on Hand</th>
                    <th className="py-3 px-4 text-right">Unit Cost</th>
                    <th className="py-3 px-4 text-right">Valuation</th>
                    {onRequestDelete && <th className="py-3 px-4 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60">
                  {state.chemicals.length === 0 && (
                    <tr>
                      <td
                        colSpan={onRequestDelete ? 7 : 6}
                        className="py-8 text-center text-xs text-slate-400"
                      >
                        No chemical SKUs added yet. Click &ldquo;Add Chemical SKU&rdquo; above to add your inventory items.
                      </td>
                    </tr>
                  )}
                  {state.chemicals.map((c) => {
                    const isLow = c.currentQty <= c.lowStockThreshold;
                    const daysToExp = Math.ceil(
                      (new Date(c.expiryDate).getTime() - Date.now()) / 86400000
                    );
                    const expiringSoon = daysToExp <= 30;
                    const hasMovements = state.stockMovements.some((m) => m.itemId === c.id);

                    return (
                      <tr key={c.id} className={c.active === false ? 'opacity-55' : ''}>
                        <td className="py-3 px-4">
                          <p className="font-semibold text-slate-900 flex items-center gap-1.5">
                            <FlaskConical className="w-3.5 h-3.5 text-slate-400" />
                            <span className={c.active === false ? 'line-through text-slate-400' : ''}>
                              {c.name}
                            </span>
                            {c.active === false && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                                Inactive
                              </span>
                            )}
                          </p>
                          {isLow && c.active !== false && (
                            <p className="text-[11px] text-amber-700 font-medium flex items-center gap-1 mt-0.5">
                              <AlertTriangle className="w-3 h-3" />
                              Low stock (below {c.lowStockThreshold} {c.unit})
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-600">
                          {c.category} · <span className="font-mono">{c.batchNumber}</span>
                        </td>
                        <td
                          className={`py-3 px-4 font-mono tabular-nums ${
                            expiringSoon ? 'text-red-600 font-semibold' : 'text-slate-600'
                          }`}
                        >
                          {new Date(c.expiryDate).toLocaleDateString()} ({daysToExp}d)
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {c.currentQty} {c.unit}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600">
                          {formatMoney(c.purchaseCost, sym)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {formatMoney(c.currentQty * c.purchaseCost, sym)}
                        </td>
                        {onRequestDelete && (
                          <td className="py-3 px-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                onRequestDelete({
                                  itemType: 'Stock Item',
                                  itemNameOrId: `${c.name} (${c.batchNumber})`,
                                  bodyText:
                                    hasMovements || c.currentQty > 0
                                      ? `"${c.name}" has ${c.currentQty} ${c.unit} on hand or posted stock ledger movements.`
                                      : `Delete chemical SKU "${c.name}"?`,
                                  linkedInfo:
                                    hasMovements || c.currentQty > 0
                                      ? 'Inventory items with stock history or valuation should be deactivated to preserve asset records.'
                                      : undefined,
                                  alternativeLabel:
                                    c.active !== false && onDeactivateChemical
                                      ? 'Deactivate Instead'
                                      : undefined,
                                  onAlternative:
                                    c.active !== false && onDeactivateChemical
                                      ? () => onDeactivateChemical(c.id)
                                      : undefined,
                                  onConfirmDelete:
                                    !hasMovements && c.currentQty <= 0 && onDeleteChemical
                                      ? () => onDeleteChemical(c.id)
                                      : undefined,
                                })
                              }
                              className="p-1 text-slate-400 hover:text-red-600"
                              title={`Delete or deactivate ${c.name}`}
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
        </div>
      )}

      {subTab === 'suppliers' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-4">
            {state.suppliers.length === 0 && (
              <div className="liquid-glass rounded-2xl p-8 text-center text-xs text-slate-400">
                No suppliers added yet. Use the form on the right to add a supplier.
              </div>
            )}
            {state.suppliers.map((sup) => (
              <div key={sup.id} className="liquid-glass rounded-2xl p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold">{sup.id}</span>
                      <span>·</span>
                      <span>{sup.phone}</span>
                    </div>
                    <h3 className="text-base font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                      <Truck className="w-4 h-4 text-slate-400" />
                      {sup.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {sup.address} · Supplies: {sup.suppliedProducts}
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="text-right tabular-nums">
                      <span className="text-xs text-slate-500">Payable Due</span>
                      <p
                        className={`text-lg font-mono font-semibold ${
                          sup.dueBalance > 0 ? 'text-amber-700' : 'text-emerald-700'
                        }`}
                      >
                        {formatMoney(sup.dueBalance, sym)}
                      </p>
                    </div>
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          const linkedChems = state.chemicals.filter(
                            (ch) => ch.supplierId === sup.id
                          ).length;
                          const hasPayable = sup.dueBalance > 0;
                          onRequestDelete({
                            itemType: 'Supplier',
                            itemNameOrId: `${sup.name} (${sup.id})`,
                            bodyText:
                              hasPayable || linkedChems > 0
                                ? `Supplier "${sup.name}" has ${linkedChems} linked chemical(s) and ${formatMoney(sup.dueBalance, sym)} payable balance.`
                                : `Permanently delete supplier "${sup.name}"?`,
                            linkedInfo:
                              hasPayable || linkedChems > 0
                                ? 'Suppliers with outstanding payables or linked stock items should be deactivated instead of deleted.'
                                : undefined,
                            alternativeLabel:
                              sup.active !== false && onDeactivateSupplier
                                ? 'Deactivate Instead'
                                : undefined,
                            onAlternative:
                              sup.active !== false && onDeactivateSupplier
                                ? () => onDeactivateSupplier(sup.id)
                                : undefined,
                            accountingProtected: hasPayable,
                            onConfirmDelete:
                              !hasPayable && linkedChems === 0 && onDeleteSupplier
                                ? () => onDeleteSupplier(sup.id)
                                : undefined,
                          });
                        }}
                        className="p-1.5 rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title="Delete or Deactivate supplier"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {sup.dueBalance > 0 && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const amt = Number(payAmounts[sup.id] || 0);
                      if (Number.isNaN(amt) || amt <= 0) return;
                      const chosenCode = payAccounts[sup.id] || defaultBankOrFirstCode;
                      onPaySupplier(sup.id, amt, chosenCode);
                      setPayAmounts((prev) => ({ ...prev, [sup.id]: '' }));
                    }}
                    className="pt-3 border-t border-slate-200/70 flex flex-wrap items-center justify-end gap-2"
                  >
                    <select
                      value={payAccounts[sup.id] || defaultBankOrFirstCode}
                      onChange={(e) =>
                        setPayAccounts((prev) => ({ ...prev, [sup.id]: e.target.value }))
                      }
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      {moneyAccounts.map((acc) => (
                        <option key={acc.code} value={acc.code}>
                          {acc.name} ({acc.channel || 'Asset'})
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={1}
                      max={sup.dueBalance}
                      value={payAmounts[sup.id] || ''}
                      onChange={(e) =>
                        setPayAmounts((prev) => ({ ...prev, [sup.id]: e.target.value }))
                      }
                      placeholder={`Pay (${sym})`}
                      className="w-28 px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      Pay Payable
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!supName.trim()) return;
              onAddSupplier({
                name: supName.trim(),
                phone: supPhone.trim(),
                address: supAddr.trim(),
                suppliedProducts: supProducts.trim(),
              });
              setSupName('');
              setSupPhone('');
              setSupAddr('');
              setSupProducts('');
            }}
            className="lg:col-span-5 liquid-glass rounded-2xl p-6 space-y-3"
          >
            <h3 className="text-base font-semibold text-slate-900">Add Chemical / Consumable Supplier</h3>
            <input
              required
              value={supName}
              onChange={(e) => setSupName(e.target.value)}
              placeholder="Supplier company name"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <input
              required
              value={supPhone}
              onChange={(e) => setSupPhone(e.target.value)}
              placeholder="Phone number"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <input
              value={supAddr}
              onChange={(e) => setSupAddr(e.target.value)}
              placeholder="Address"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <input
              value={supProducts}
              onChange={(e) => setSupProducts(e.target.value)}
              placeholder="Supplied chemicals / packaging..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
            <button
              type="submit"
              className="w-full px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white"
            >
              Save Supplier Profile
            </button>
          </form>
        </div>
      )}

      {subTab === 'movements' && (
        <div className="liquid-glass rounded-2xl overflow-hidden">
          <table className="w-full text-left text-xs border-collapse erp-table">
            <thead>
              <tr className="border-b border-slate-200/80 font-semibold">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Item</th>
                <th className="py-3 px-4">Event</th>
                <th className="py-3 px-4">Reference &amp; Reason</th>
                <th className="py-3 px-4 text-right">Qty</th>
                <th className="py-3 px-4 text-right">Value</th>
                {onRequestDelete && <th className="py-3 px-4 text-right">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60">
              {[...state.stockMovements].reverse().map((m) => (
                <tr key={m.id}>
                  <td className="py-2.5 px-4 font-mono text-slate-500">
                    {new Date(m.date).toLocaleDateString()}
                  </td>
                  <td className="py-2.5 px-4 font-medium text-slate-900">{m.itemName}</td>
                  <td className="py-2.5 px-4 font-semibold text-slate-700">{m.type}</td>
                  <td className="py-2.5 px-4 text-slate-600">
                    {m.reference} — {m.reason}
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">{m.qty}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums">
                    {formatMoney(m.qty * m.unitCost, sym)}
                  </td>
                  {onRequestDelete && (
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDelete({
                            itemType: 'Stock Movement',
                            itemNameOrId: `${m.reference} (${m.itemName} · ${m.type})`,
                            bodyText:
                              'Posted stock movements update chemical inventory asset balances and supplier payables in the General Ledger.',
                            linkedInfo:
                              'Cannot plain-delete posted stock movements. Post an opposite Stock Adjustment or reverse the ledger journal entry in Accounting.',
                            accountingProtected: true,
                            alternativeLabel: onGoToAccounting
                              ? 'Reverse in Accounting'
                              : undefined,
                            onAlternative: onGoToAccounting,
                          })
                        }
                        className="p-1 text-slate-400 hover:text-red-600"
                        title="Audit-protected stock ledger entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

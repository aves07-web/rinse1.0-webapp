import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Search, Trash2, UserPlus, Wallet } from 'lucide-react';
import { Customer, CustomerCategory, ErpState, PaymentSplit } from '../types/erp';
import { formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import {
  DEFAULT_ID_FORMATS,
  generateNextSmartId,
  getExistingIdsForType,
  validateCustomSmartId,
} from '../utils/smartId';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';
import { QuickAddMoneyAccountParams, SplitPaymentInput } from './SplitPaymentInput';

interface CustomersViewProps {
  state: ErpState;
  canEditIssuedIds?: boolean;
  onAddCustomer: (
    customer: Omit<Customer, 'id' | 'registeredAt' | 'outstandingBalance' | 'advanceBalance'>,
    options?: { customId?: string; advanceCounterTo?: number }
  ) => void;
  onRenameCustomerId?: (oldId: string, newId: string) => boolean;
  onDeleteCustomer?: (customerId: string) => void;
  onDeactivateCustomer?: (customerId: string) => void;
  onAddCategory: (cat: Omit<CustomerCategory, 'id'>) => void;
  onDeleteCategory?: (catId: string) => void;
  onUpsertCustomPrice: (customerId: string, productId: string, serviceId: string, price: number) => void;
  onDeleteCustomerCustomPrice?: (priceId: string) => void;
  onCollectDueOrAdvance: (params: {
    customerId: string;
    amount: number;
    mode: 'Due Collection' | 'Customer Advance';
    paymentAccountCode: string;
    paymentSplits?: PaymentSplit[];
  }) => void;
  onAddMoneyAccount?: (params: QuickAddMoneyAccountParams) => string | null;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function CustomersView({
  state,
  canEditIssuedIds = false,
  onAddCustomer,
  onRenameCustomerId,
  onDeleteCustomer,
  onDeactivateCustomer,
  onAddCategory,
  onDeleteCategory,
  onUpsertCustomPrice,
  onDeleteCustomerCustomPrice,
  onCollectDueOrAdvance,
  onAddMoneyAccount,
  onRequestDelete,
}: CustomersViewProps) {
  const sym = state.settings.currencySymbol;
  const [search, setSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(state.customers[0]?.id || '');
  const [showNewForm, setShowNewForm] = useState(false);

  // New Customer Form
  const [customId, setCustomId] = useState(() => generateNextSmartId(state, 'customer').id);
  const [continueNumbering, setContinueNumbering] = useState(false);
  const [idError, setIdError] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [address, setAddress] = useState('');
  const [categoryId, setCategoryId] = useState(state.categories[0]?.id || 'cat-std');
  const [notes, setNotes] = useState('');

  // Authorized Issued ID Edit state
  const [editingIdMode, setEditingIdMode] = useState(false);
  const [renameIdInput, setRenameIdInput] = useState('');
  const [renameIdError, setRenameIdError] = useState('');

  useEffect(() => {
    if (showNewForm) {
      setCustomId(generateNextSmartId(state, 'customer').id);
      setIdError('');
      setContinueNumbering(false);
    }
  }, [showNewForm, state.customers.length, state.idFormats]);

  // Custom Price Form
  const [cpProdId, setCpProdId] = useState(state.products[0]?.id || '');
  const [cpSrvId, setCpSrvId] = useState(state.services[0]?.id || '');
  const [cpPrice, setCpPrice] = useState('');

  useEffect(() => {
    const firstProd = state.products.find((p) => p.active)?.id || '';
    const firstSrv = state.services.find((s) => s.active)?.id || '';
    if (!cpProdId && firstProd) setCpProdId(firstProd);
    if (!cpSrvId && firstSrv) setCpSrvId(firstSrv);
  }, [state.products, state.services, cpProdId, cpSrvId]);

  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultMoneyAccountCode = moneyAccounts[0]?.code || '1010';

  // Payment / Advance Form
  const [payMode, setPayMode] = useState<'Due Collection' | 'Customer Advance'>('Due Collection');
  const [paySplits, setPaySplits] = useState<PaymentSplit[]>(() => [
    { accountCode: defaultMoneyAccountCode, accountName: moneyAccounts[0]?.name, amount: 0 },
  ]);

  // New Category inline
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState('#0071E3');

  const filteredCustomers = state.customers.filter((c) => {
    const matchesCat = selectedCategoryFilter === 'ALL' || c.categoryId === selectedCategoryFilter;
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      c.id.toLowerCase().includes(q) ||
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q);
    return matchesCat && matchesSearch;
  });

  const activeCustomer =
    state.customers.find((c) => c.id === selectedCustomerId) || filteredCustomers[0] || null;

  const activeCategory = activeCustomer
    ? state.categories.find((cat) => cat.id === activeCustomer.categoryId)
    : null;

  const customerCustomPrices = activeCustomer
    ? state.customerCustomPrices.filter((cp) => cp.customerId === activeCustomer.id)
    : [];

  const customerOrders = activeCustomer
    ? state.orders.filter((o) => o.customerId === activeCustomer.id)
    : [];

  const customerIdRule = state.idFormats?.customer || DEFAULT_ID_FORMATS.customer;
  const existingCustomerIds = getExistingIdsForType(state, 'customer');
  const idCheck = validateCustomSmartId(customId, existingCustomerIds, customerIdRule);

  const handleCreateCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !phone.trim()) return;
    if (!idCheck.valid) {
      setIdError(idCheck.error || 'Invalid Customer ID');
      return;
    }
    onAddCustomer(
      {
        name: name.trim(),
        phone: phone.trim(),
        altPhone: altPhone.trim() || undefined,
        address: address.trim(),
        categoryId,
        notes: notes.trim(),
      },
      {
        customId: idCheck.cleanId,
        advanceCounterTo:
          continueNumbering && idCheck.matchedHigherNumber
            ? idCheck.matchedHigherNumber + 1
            : undefined,
      }
    );
    setSelectedCustomerId(idCheck.cleanId);
    setName('');
    setPhone('');
    setAltPhone('');
    setAddress('');
    setNotes('');
    setIdError('');
    setContinueNumbering(false);
    setShowNewForm(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Retail Customer Management
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Profiles, configurable color categories, customer-specific prices, and due/advance balances
          </p>
        </div>

        <button
          onClick={() => setShowNewForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors self-start sm:self-auto whitespace-nowrap"
        >
          <UserPlus className="w-3.5 h-3.5" />
          {showNewForm ? 'Close Form' : 'New Customer'}
        </button>
      </div>

      {showNewForm && (
        <form
          onSubmit={handleCreateCustomer}
          className="liquid-glass rounded-2xl p-6 grid grid-cols-1 md:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">
              Customer ID (Auto-filled, editable)
            </label>
            <input
              required
              maxLength={30}
              value={customId}
              onChange={(e) => {
                setCustomId(e.target.value);
                setIdError('');
              }}
              placeholder="CUS-0001"
              className={`w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border focus:outline-none ${
                !idCheck.valid || idError
                  ? 'border-red-400 focus:border-red-500'
                  : 'border-slate-200 focus:border-[#0071E3]'
              }`}
            />
            {(!idCheck.valid || idError) && (
              <p className="text-[11px] text-red-600 mt-1">{idError || idCheck.error}</p>
            )}
            {idCheck.valid && idCheck.matchedHigherNumber && (
              <label className="inline-flex items-center gap-1.5 text-[11px] text-[#0071E3] mt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={continueNumbering}
                  onChange={(e) => setContinueNumbering(e.target.checked)}
                />
                Continue numbering from {idCheck.matchedHigherNumber + 1}
              </label>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Customer Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Primary Phone</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+880 17XX-XXXXXX"
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            >
              {state.categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.defaultDiscountPct}% default discount)
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Alt Phone (Optional)</label>
            <input
              value={altPhone}
              onChange={(e) => setAltPhone(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-700 mb-1">Notes</label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Garment preferences..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
              />
            </div>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap"
            >
              Save Profile
            </button>
          </div>
        </form>
      )}

      {/* Search & Category Filter */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Customer ID, name, or phone..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white/85 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          <button
            onClick={() => setSelectedCategoryFilter('ALL')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              selectedCategoryFilter === 'ALL'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All
          </button>
          {state.categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategoryFilter(cat.id)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                selectedCategoryFilter === cat.id
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Customer Directory */}
        <div className="lg:col-span-5 liquid-glass rounded-2xl overflow-hidden">
          <div className="divide-y divide-slate-200/60">
            {filteredCustomers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No matching retail customers found.
              </div>
            ) : (
              filteredCustomers.map((c) => {
                const cat = state.categories.find((ct) => ct.id === c.categoryId);
                const isSelected = activeCustomer?.id === c.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedCustomerId(c.id)}
                    className={`w-full text-left p-4 transition-colors ${
                      isSelected ? 'bg-white/95' : 'hover:bg-white/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-500">{c.id}</span>
                      <span className="text-xs font-semibold" style={{ color: cat?.color || '#475569' }}>
                        {cat?.name || 'Standard'}
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-slate-900 mt-1 flex items-center gap-1.5">
                      <span className={c.active === false ? 'line-through text-slate-400' : ''}>
                        {c.name}
                      </span>
                      {c.active === false && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                          Inactive
                        </span>
                      )}
                    </p>
                    <div className="flex items-center justify-between text-xs text-slate-500 mt-1 tabular-nums">
                      <span>{c.phone}</span>
                      <span className={c.outstandingBalance > 0 ? 'text-amber-700 font-medium' : ''}>
                        Due {formatMoney(c.outstandingBalance, sym)}
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Quick Category Creator + Removable Categories */}
          <div className="p-4 border-t border-slate-200/70 bg-white/40 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newCatName.trim()) return;
                onAddCategory({
                  name: newCatName.trim(),
                  color: newCatColor,
                  defaultDiscountPct: 0,
                });
                setNewCatName('');
              }}
              className="flex items-center gap-2"
            >
              <input
                type="color"
                value={newCatColor}
                onChange={(e) => setNewCatColor(e.target.value)}
                className="w-7 h-7 rounded border-0 bg-transparent cursor-pointer"
                title="Category label color"
              />
              <input
                type="text"
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                placeholder="New category name..."
                className="flex-1 px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200 focus:outline-none focus:border-[#0071E3]"
              />
              <button
                type="submit"
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
              >
                Add Category
              </button>
            </form>

            {onRequestDelete && onDeleteCategory && state.categories.length > 1 && (
              <div className="flex flex-wrap gap-1.5">
                {state.categories.map((cat) => {
                  const linkedCustCount = state.customers.filter((c) => c.categoryId === cat.id).length;
                  return (
                    <div
                      key={cat.id}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[11px]"
                    >
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium text-slate-700">{cat.name}</span>
                      {cat.id !== 'cat-std' && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDelete({
                              itemType: 'Customer Category',
                              itemNameOrId: cat.name,
                              bodyText:
                                linkedCustCount > 0
                                  ? `Category "${cat.name}" is assigned to ${linkedCustCount} customer(s). Deleting it will reassign them to Standard.`
                                  : `Delete customer category "${cat.name}"?`,
                              linkedInfo:
                                linkedCustCount > 0
                                  ? `${linkedCustCount} customer profile(s) currently use this category.`
                                  : undefined,
                              onConfirmDelete: () => onDeleteCategory(cat.id),
                            })
                          }
                          className="text-slate-400 hover:text-red-600"
                          title={`Delete category ${cat.name}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Active Customer Detail, Custom Prices & Due Collection */}
        <div className="lg:col-span-7 space-y-6">
          {activeCustomer ? (
            <>
              <div className="liquid-glass rounded-2xl p-6">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-200/70">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono font-semibold text-slate-700">{activeCustomer.id}</span>
                      {canEditIssuedIds && onRenameCustomerId && !editingIdMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingIdMode(true);
                            setRenameIdInput(activeCustomer.id);
                            setRenameIdError('');
                          }}
                          className="inline-flex items-center gap-1 text-[11px] text-[#0071E3] hover:underline"
                          title="Authorized ID change (logged to Black Box)"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit ID
                        </button>
                      )}
                      <span>·</span>
                      <span className="font-semibold" style={{ color: activeCategory?.color }}>
                        {activeCategory?.name}
                      </span>
                      <span>·</span>
                      <span>Since {new Date(activeCustomer.registeredAt).toLocaleDateString()}</span>
                    </div>
                    {editingIdMode && (
                      <div className="mt-2 p-2.5 rounded-xl bg-white/90 border border-slate-200 flex flex-wrap items-center gap-2">
                        <input
                          value={renameIdInput}
                          maxLength={30}
                          onChange={(e) => {
                            setRenameIdInput(e.target.value);
                            setRenameIdError('');
                          }}
                          className="px-2.5 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const res = validateCustomSmartId(
                              renameIdInput,
                              new Set(
                                Array.from(existingCustomerIds).filter(
                                  (x) => x !== activeCustomer.id.toLowerCase()
                                )
                              ),
                              customerIdRule
                            );
                            if (!res.valid) {
                              setRenameIdError(res.error || 'Invalid ID');
                              return;
                            }
                            if (onRenameCustomerId?.(activeCustomer.id, res.cleanId)) {
                              setSelectedCustomerId(res.cleanId);
                              setEditingIdMode(false);
                            }
                          }}
                          className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-[#0071E3] text-white"
                        >
                          Save ID
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingIdMode(false)}
                          className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                        >
                          Cancel
                        </button>
                        {renameIdError && (
                          <span className="text-[11px] text-red-600 w-full">{renameIdError}</span>
                        )}
                      </div>
                    )}
                    <h2 className="text-xl font-semibold text-slate-900 mt-1">{activeCustomer.name}</h2>
                    <p className="text-xs text-slate-600 mt-1">
                      {activeCustomer.phone}
                      {activeCustomer.altPhone ? ` / ${activeCustomer.altPhone}` : ''} ·{' '}
                      {activeCustomer.address || 'No address recorded'}
                    </p>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="text-right tabular-nums">
                      <p className="text-xs text-slate-500">Outstanding Due</p>
                      <p className="text-lg font-mono font-semibold text-slate-900">
                        {formatMoney(activeCustomer.outstandingBalance, sym)}
                      </p>
                      <p className="text-xs text-[#0071E3] font-mono mt-0.5">
                        Advance Held: {formatMoney(activeCustomer.advanceBalance, sym)}
                      </p>
                    </div>
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() => {
                          const hasFinancial =
                            activeCustomer.outstandingBalance > 0 || activeCustomer.advanceBalance > 0;
                          const hasOrders = customerOrders.length > 0;
                          onRequestDelete({
                            itemType: 'Retail Customer',
                            itemNameOrId: `${activeCustomer.name} (${activeCustomer.id})`,
                            bodyText:
                              hasOrders || hasFinancial
                                ? `Customer "${activeCustomer.name}" has ${customerOrders.length} order(s), ${formatMoney(activeCustomer.outstandingBalance, sym)} due, and ${formatMoney(activeCustomer.advanceBalance, sym)} advance balance.`
                                : `Permanently delete retail customer "${activeCustomer.name}" (${activeCustomer.id})?`,
                            linkedInfo:
                              hasOrders || hasFinancial
                                ? 'Because ledger balances or order records exist, deactivating is recommended so historical invoices stay valid.'
                                : undefined,
                            alternativeLabel:
                              activeCustomer.active !== false && onDeactivateCustomer
                                ? 'Deactivate Instead'
                                : undefined,
                            onAlternative:
                              activeCustomer.active !== false && onDeactivateCustomer
                                ? () => onDeactivateCustomer(activeCustomer.id)
                                : undefined,
                            accountingProtected: hasFinancial,
                            onConfirmDelete:
                              !hasFinancial && onDeleteCustomer
                                ? () => onDeleteCustomer(activeCustomer.id)
                                : undefined,
                          });
                        }}
                        className="p-2 rounded-xl border border-red-200 bg-white text-red-600 hover:bg-red-50"
                        title="Delete or Deactivate customer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Due Collection / Advance Deposit */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const valid = paySplits.filter((s) => Number(s.amount) > 0);
                    const totalAmt = Number(
                      valid.reduce((s, sp) => s + Number(sp.amount || 0), 0).toFixed(2)
                    );
                    if (totalAmt <= 0) return;
                    onCollectDueOrAdvance({
                      customerId: activeCustomer.id,
                      amount: totalAmt,
                      mode: payMode,
                      paymentAccountCode: valid[0].accountCode,
                      paymentSplits: valid,
                    });
                    setPaySplits([
                      {
                        accountCode: defaultMoneyAccountCode,
                        accountName: moneyAccounts[0]?.name,
                        amount: 0,
                      },
                    ]);
                  }}
                  className="mt-4 flex flex-wrap items-end gap-3"
                >
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 mb-1">Transaction Type</label>
                    <select
                      value={payMode}
                      onChange={(e) =>
                        setPayMode(e.target.value as 'Due Collection' | 'Customer Advance')
                      }
                      className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                    >
                      <option value="Due Collection">Collect Outstanding Due</option>
                      <option value="Customer Advance">Receive Advance Deposit</option>
                    </select>
                  </div>
                  <div className="flex-1 min-w-[260px]">
                    <SplitPaymentInput
                      accounts={state.accounts}
                      currencySymbol={sym}
                      splits={paySplits}
                      onChange={setPaySplits}
                      label="Payment Method(s) & Amount"
                      onAddMoneyAccount={onAddMoneyAccount}
                    />
                  </div>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
                  >
                    <Wallet className="w-3.5 h-3.5" />
                    Post to Ledger
                  </button>
                </form>
              </div>

              {/* Customer-Specific Retail Prices */}
              <div className="liquid-glass rounded-2xl p-6 space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Customer-Specific Retail Prices
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Overrides default retail rates automatically when creating orders for {activeCustomer.name}
                  </p>
                </div>

                {customerCustomPrices.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No custom price overrides saved yet. Default retail matrix prices apply.
                  </p>
                ) : (
                  <table className="w-full text-left text-xs border-collapse erp-table">
                    <thead>
                      <tr className="border-b border-slate-200/70">
                        <th className="py-2 px-2">Product</th>
                        <th className="py-2 px-2">Service</th>
                        <th className="py-2 px-2 text-right">Default</th>
                        <th className="py-2 px-2 text-right">Customer Rate</th>
                        {onRequestDelete && onDeleteCustomerCustomPrice && (
                          <th className="py-2 px-2 text-right">Action</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60">
                      {customerCustomPrices.map((cp) => {
                        const prod = state.products.find((p) => p.id === cp.productId);
                        const srv = state.services.find((s) => s.id === cp.serviceId);
                        const def = state.prices.find(
                          (p) => p.productId === cp.productId && p.serviceId === cp.serviceId
                        );
                        return (
                          <tr key={cp.id}>
                            <td className="py-2.5 px-2 font-medium text-slate-900">{prod?.name}</td>
                            <td className="py-2.5 px-2 text-slate-600">{srv?.name}</td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-400">
                              {def ? formatMoney(def.price, sym) : '—'}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono tabular-nums font-semibold text-[#0071E3]">
                              {formatMoney(cp.price, sym)}
                            </td>
                            {onRequestDelete && onDeleteCustomerCustomPrice && (
                              <td className="py-2.5 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRequestDelete({
                                      itemType: 'Custom Customer Price',
                                      itemNameOrId: `${prod?.name || 'Item'} · ${srv?.name || 'Service'} (${formatMoney(cp.price, sym)})`,
                                      bodyText: `Remove the custom rate override for "${prod?.name || 'Item'} · ${srv?.name || 'Service'}" on ${activeCustomer.name}? Future orders will use the default retail price.`,
                                      onConfirmDelete: () => onDeleteCustomerCustomPrice(cp.id),
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-red-600"
                                  title="Delete custom price override"
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
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const p = Number(cpPrice);
                    if (Number.isNaN(p) || p < 0 || !cpProdId || !cpSrvId) return;
                    onUpsertCustomPrice(activeCustomer.id, cpProdId, cpSrvId, p);
                    setCpPrice('');
                  }}
                  className="pt-3 border-t border-slate-200/70 flex flex-wrap items-end gap-2.5"
                >
                  <select
                    value={cpProdId}
                    onChange={(e) => setCpProdId(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {state.products.filter((p) => p.active).length === 0 && (
                      <option value="">No products yet</option>
                    )}
                    {state.products
                      .filter((p) => p.active)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                  <select
                    value={cpSrvId}
                    onChange={(e) => setCpSrvId(e.target.value)}
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {state.services.filter((s) => s.active).length === 0 && (
                      <option value="">No services yet</option>
                    )}
                    {state.services
                      .filter((s) => s.active)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    step="0.5"
                    value={cpPrice}
                    onChange={(e) => setCpPrice(e.target.value)}
                    placeholder={`Custom (${sym})`}
                    className="w-28 px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-medium rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Save Rate
                  </button>
                </form>
              </div>

              {/* Customer Order History */}
              <div className="liquid-glass rounded-2xl p-6">
                <h3 className="text-base font-semibold text-slate-900 pb-3 border-b border-slate-200/70">
                  Order &amp; Service History ({customerOrders.length})
                </h3>
                {customerOrders.length === 0 ? (
                  <p className="text-xs text-slate-500 mt-3">No retail orders recorded for this customer yet.</p>
                ) : (
                  <div className="divide-y divide-slate-200/60 mt-2">
                    {customerOrders.map((o) => (
                      <div key={o.id} className="py-3 flex items-center justify-between text-xs">
                        <div>
                          <p className="font-mono font-semibold text-slate-900">
                            {o.id} · <span className="font-sans text-[#0071E3]">{o.stage}</span>
                          </p>
                          <p className="text-slate-500 mt-0.5">
                            {o.lines.map((l) => `${l.quantityOrdered}x ${l.productName} (${l.serviceName})`).join(', ')}
                          </p>
                        </div>
                        <div className="text-right font-mono tabular-nums">
                          <p className="font-semibold text-slate-900">{formatMoney(o.totalAmount, sym)}</p>
                          <p className="text-slate-500">Paid {formatMoney(o.paidAmount, sym)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="liquid-glass rounded-2xl p-8 text-center text-sm text-slate-500">
              Select a customer to view profile details and custom pricing.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Lock,
  Plus,
  Printer,
  Save,
  Scale,
  SlidersHorizontal,
  Trash2,
  X,
} from 'lucide-react';
import {
  BillingBasis,
  BillingCycle,
  Customer,
  ErpState,
  JournalEntry,
  JournalLine,
  MoneySourceChannel,
  OpeningBalanceDraft,
  OrderStage,
} from '../types/erp';
import {
  dateInputToIso,
  formatMoney,
  generateNextMoneyAccountCode,
  inferMoneyChannel,
  toDateInputValue,
} from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface OpeningBalanceViewProps {
  state: ErpState;
  isOwner?: boolean;
  canPostAccounting: boolean;
  onSaveDraft: (draft: OpeningBalanceDraft) => void;
  onFinalize: (params: {
    draft: OpeningBalanceDraft;
    balanceWithOpeningEquity: boolean;
  }) => void;
  onOwnerAdjustFinalized?: (params: {
    draft: OpeningBalanceDraft;
    balanceWithOpeningEquity: boolean;
  }) => void;
  onPostAdjustment: (params: {
    date: string;
    debitCode: string;
    creditCode: string;
    amount: number;
    reason: string;
  }) => void;
  onOwnerCustomizeJournal?: (
    entryId: string,
    updated: {
      date: string;
      reference: string;
      description: string;
      category: JournalEntry['category'];
      lines: JournalLine[];
    }
  ) => void;
  onOwnerDeleteJournal?: (entryId: string) => void;
  onInlineAddCustomer: (data: {
    name: string;
    phone: string;
    categoryId: string;
  }) => Customer | null;
  onInlineAddCorporate: (data: {
    name: string;
    contactPerson: string;
    phone: string;
    billingBasis: BillingBasis;
    billingCycle: BillingCycle;
  }) => void;
  onInlineAddSupplier: (data: {
    name: string;
    phone: string;
    suppliedProducts: string;
  }) => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

const STEPS = [
  { id: 1, title: 'As-of Date' },
  { id: 2, title: 'Cash & Bank' },
  { id: 3, title: 'Customer Dues' },
  { id: 4, title: 'Corporate Pending' },
  { id: 5, title: 'Customer Advances' },
  { id: 6, title: 'Supplier Dues' },
  { id: 7, title: 'Chemical Stock' },
  { id: 8, title: 'Loans & Liabilities' },
  { id: 9, title: 'Capital & Assets' },
  { id: 10, title: 'Employees' },
  { id: 11, title: 'Pending Orders' },
  { id: 12, title: 'ID Numbers' },
  { id: 13, title: 'Review & Finalize' },
];

export function OpeningBalanceView({
  state,
  isOwner = false,
  canPostAccounting,
  onSaveDraft,
  onFinalize,
  onOwnerAdjustFinalized,
  onPostAdjustment,
  onOwnerCustomizeJournal,
  onOwnerDeleteJournal,
  onInlineAddCustomer,
  onInlineAddCorporate,
  onInlineAddSupplier,
  onRequestDelete,
}: OpeningBalanceViewProps) {
  const sym = state.settings.currencySymbol;
  const isFinalized = state.openingBalance.status === 'finalized';

  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState<OpeningBalanceDraft>(() => state.openingBalance);
  const [statusMsg, setStatusMsg] = useState('');
  const [confirmAutoBalance, setConfirmAutoBalance] = useState(true);
  const [isEditingFinalized, setIsEditingFinalized] = useState(false);

  // Owner Customize Opening Journal Modal
  const [editJeTarget, setEditJeTarget] = useState<JournalEntry | null>(null);
  const [ejDate, setEjDate] = useState('');
  const [ejRef, setEjRef] = useState('');
  const [ejDesc, setEjDesc] = useState('');
  const [ejCategory, setEjCategory] = useState<JournalEntry['category']>('Opening Adjustment');
  const [ejLines, setEjLines] = useState<JournalLine[]>([]);

  useEffect(() => {
    setDraft(state.openingBalance);
  }, [state.openingBalance]);

  // Inline quick creators & Step 2 account setup counts
  const [newBankName, setNewBankName] = useState('');
  const [newBankChannel, setNewBankChannel] = useState<MoneySourceChannel>('Bank');
  const [newBankBal, setNewBankBal] = useState('');
  const [newBankMaintain, setNewBankMaintain] = useState(true);
  const [newWalletType, setNewWalletType] = useState('');
  const [newWalletChargePct, setNewWalletChargePct] = useState('');
  const [newWalletChargeFlat, setNewWalletChargeFlat] = useState('');

  const [countCashInput, setCountCashInput] = useState(() =>
    state.openingBalance.cashAndBanks.filter(
      (a) => (a.channel || inferMoneyChannel(a.accountName)) === 'Cash'
    ).length
  );
  const [countBankInput, setCountBankInput] = useState(() =>
    state.openingBalance.cashAndBanks.filter(
      (a) => (a.channel || inferMoneyChannel(a.accountName)) === 'Bank'
    ).length
  );
  const [countWalletInput, setCountWalletInput] = useState(() =>
    state.openingBalance.cashAndBanks.filter(
      (a) => (a.channel || inferMoneyChannel(a.accountName)) === 'E-Wallet'
    ).length
  );

  useEffect(() => {
    setCountCashInput(
      draft.cashAndBanks.filter((a) => (a.channel || inferMoneyChannel(a.accountName)) === 'Cash')
        .length
    );
    setCountBankInput(
      draft.cashAndBanks.filter((a) => (a.channel || inferMoneyChannel(a.accountName)) === 'Bank')
        .length
    );
    setCountWalletInput(
      draft.cashAndBanks.filter(
        (a) => (a.channel || inferMoneyChannel(a.accountName)) === 'E-Wallet'
      ).length
    );
  }, [draft.cashAndBanks]);

  const [inlineCustName, setInlineCustName] = useState('');
  const [inlineCustPhone, setInlineCustPhone] = useState('');
  const [inlineCustDue, setInlineCustDue] = useState('');

  const [inlineCorpName, setInlineCorpName] = useState('');
  const [inlineCorpContact, setInlineCorpContact] = useState('');
  const [inlineCorpPhone, setInlineCorpPhone] = useState('');
  const [inlineCorpBasis, setInlineCorpBasis] = useState<BillingBasis>('Delivered-wise');

  const [inlineSupName, setInlineSupName] = useState('');
  const [inlineSupPhone, setInlineSupPhone] = useState('');
  const [inlineSupItems, setInlineSupItems] = useState('');

  // Corporate Pending Item add row
  const [cpCorpId, setCpCorpId] = useState(state.corporateCustomers[0]?.id || '');
  const [cpProdId, setCpProdId] = useState(state.corporateCustomers[0]?.products[0]?.id || '');
  const [cpSrvId, setCpSrvId] = useState(state.corporateCustomers[0]?.services[0]?.id || '');
  const [cpPendingQty, setCpPendingQty] = useState(0);
  const [cpAlreadyRecv, setCpAlreadyRecv] = useState(0);
  const [cpAlreadyDeliv, setCpAlreadyDeliv] = useState(0);
  const [cpAlreadyBilled, setCpAlreadyBilled] = useState(0);

  // Adjustment modal/form (when finalized)
  const [adjDate, setAdjDate] = useState(
    () => state.openingBalance.asOfDate || new Date().toISOString().slice(0, 10)
  );
  const [adjDebit, setAdjDebit] = useState('1010');
  const [adjCredit, setAdjCredit] = useState('3040');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjReason, setAdjReason] = useState('');

  // Calculate Live Balance Check: Assets vs Liabilities + Equity
  const totals = useMemo(() => {
    const cashBank = draft.cashAndBanks.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const retailAR = draft.retailDues.reduce((s, r) => s + (Number(r.amount) || 0), 0);
    const corpAR = draft.corporateDues.reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const stockVal = draft.chemicalStocks.reduce(
      (s, ch) => s + (Number(ch.qty) || 0) * (Number(ch.unitCost) || 0),
      0
    );
    const otherAssets = draft.otherAssets.reduce((s, oa) => s + (Number(oa.value) || 0), 0);
    const empAdvances = draft.employeeBalances.reduce(
      (s, e) => s + (Number(e.advanceGiven) || 0),
      0
    );

    const totalAssets = Number(
      (cashBank + retailAR + corpAR + stockVal + otherAssets + empAdvances).toFixed(2)
    );

    const custAdvances = draft.customerAdvances.reduce(
      (s, c) => s + (Number(c.amount) || 0),
      0
    );
    const supPayables = draft.supplierDues.reduce((s, sp) => s + (Number(sp.amount) || 0), 0);
    const loans = draft.loansAndLiabilities.reduce((s, l) => s + (Number(l.amount) || 0), 0);
    const empSalariesDue = draft.employeeBalances.reduce(
      (s, e) => s + (Number(e.salaryDue) || 0),
      0
    );

    const totalLiabilities = Number(
      (custAdvances + supPayables + loans + empSalariesDue).toFixed(2)
    );

    const ownerCap = Number(draft.ownerCapitalAmount) || 0;
    const difference = Number((totalAssets - (totalLiabilities + ownerCap)).toFixed(2));

    return {
      cashBank,
      retailAR,
      corpAR,
      stockVal,
      otherAssets,
      empAdvances,
      totalAssets,
      custAdvances,
      supPayables,
      loans,
      empSalariesDue,
      totalLiabilities,
      ownerCap,
      difference,
    };
  }, [draft]);

  const activeCpCorp =
    state.corporateCustomers.find((c) => c.id === cpCorpId) || state.corporateCustomers[0];

  // --- LOCKED SUMMARY VIEW AFTER FINALIZATION ---
  if (isFinalized && !isEditingFinalized) {
    const openingJournals = state.journalEntries.filter(
      (j) =>
        j.isOpening ||
        j.category === 'Opening Balance' ||
        j.category === 'Opening Adjustment'
    );

    return (
      <div className="space-y-6">
        <div className="no-print flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
              <Lock className="w-5 h-5 text-[#0071E3]" />
              Opening Balance Summary (Finalized)
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              As-of Date: <strong className="font-mono">{state.openingBalance.asOfDate}</strong> ·
              Finalized{' '}
              {state.openingBalance.finalizedAt
                ? new Date(state.openingBalance.finalizedAt).toLocaleString()
                : ''}{' '}
              · Locked against silent edits
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {isOwner && onOwnerAdjustFinalized && (
              <button
                type="button"
                onClick={() => {
                  setDraft(state.openingBalance);
                  setStep(1);
                  setStatusMsg('');
                  setIsEditingFinalized(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                Customize / Adjust Opening Balance
              </button>
            )}
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
            >
              <Printer className="w-3.5 h-3.5" />
              Print / Export PDF
            </button>
          </div>
        </div>

        <div className="print-only-container liquid-glass rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-200/70">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">
                {state.settings.companyName} — Opening Position Statement
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Opening As-of Date: <span className="font-mono">{state.openingBalance.asOfDate}</span> ·
                Journal Ref: <span className="font-mono">{state.openingBalance.finalizedJournalId || 'JE-OPEN'}</span>
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-4 h-4" />
              Balanced &amp; Locked
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs tabular-nums">
            <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
              <p className="font-semibold text-slate-500">Opening Assets</p>
              <p className="text-xl font-mono font-semibold text-slate-900">
                {formatMoney(totals.totalAssets, sym)}
              </p>
              <p className="text-slate-500">
                Cash/Bank {formatMoney(totals.cashBank, sym)} · Receivables{' '}
                {formatMoney(totals.retailAR + totals.corpAR, sym)}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
              <p className="font-semibold text-slate-500">Opening Liabilities</p>
              <p className="text-xl font-mono font-semibold text-slate-900">
                {formatMoney(totals.totalLiabilities, sym)}
              </p>
              <p className="text-slate-500">
                Suppliers {formatMoney(totals.supPayables, sym)} · Loans {formatMoney(totals.loans, sym)}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 space-y-1.5">
              <p className="font-semibold text-slate-500">Opening Capital &amp; Equity</p>
              <p className="text-xl font-mono font-semibold text-[#0071E3]">
                {formatMoney(totals.ownerCap + totals.difference, sym)}
              </p>
              <p className="text-slate-500">
                Owner Capital {formatMoney(totals.ownerCap, sym)}
                {totals.difference !== 0 && ` · Opening Eq ${formatMoney(totals.difference, sym)}`}
              </p>
            </div>
          </div>

          {/* Audit Trail of Opening & Adjustment Journals */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">
              Posted Opening &amp; Visible Adjustment Entries ({openingJournals.length})
            </h3>
            <div className="divide-y divide-slate-200/60 text-xs">
              {openingJournals.map((je) => (
                <div key={je.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <strong className="font-mono text-slate-900">{je.id}</strong> ·{' '}
                      <span className="font-semibold text-[#0071E3]">{je.category}</span> —{' '}
                      {je.description}
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-slate-500">{je.date.slice(0, 10)}</span>
                      {isOwner && onOwnerCustomizeJournal && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditJeTarget(je);
                            setEjDate(toDateInputValue(je.date));
                            setEjRef(je.reference);
                            setEjDesc(je.description);
                            setEjCategory(je.category);
                            setEjLines(je.lines.map((l) => ({ ...l })));
                          }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold rounded-md bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                          title="Customize journal entry (Owner)"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Customize
                        </button>
                      )}
                      {onRequestDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            isOwner && onOwnerDeleteJournal
                              ? onRequestDelete({
                                  itemType: 'Opening / Adjustment Journal',
                                  itemNameOrId: `${je.id} (${je.category})`,
                                  bodyText: `Permanently delete opening/adjustment journal ${je.id} (${je.description}) and recalculate ledger balances?`,
                                  accountingProtected: false,
                                  onConfirmDelete: () => onOwnerDeleteJournal(je.id),
                                })
                              : onRequestDelete({
                                  itemType: 'Finalized Opening Entry',
                                  itemNameOrId: `${je.id} (${je.category})`,
                                  bodyText:
                                    'Finalized Opening Balance entries are locked in the General Ledger to maintain an unbroken financial baseline.',
                                  linkedInfo:
                                    'Cannot delete a finalized opening entry. Use the "Post Visible Opening Adjustment Entry" form below to make an auditable correction.',
                                  accountingProtected: true,
                                })
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title={
                            isOwner && onOwnerDeleteJournal
                              ? `Delete ${je.id} (Owner)`
                              : 'Opening balance entries are locked'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="pl-3 space-y-0.5 text-[11px] text-slate-600 font-mono">
                    {je.lines.map((l, idx) => (
                      <div key={idx} className="flex justify-between max-w-md">
                        <span>
                          {l.accountCode} {l.accountName}
                        </span>
                        <span>
                          {l.debit > 0
                            ? `Dr ${formatMoney(l.debit, sym)}`
                            : `Cr ${formatMoney(l.credit, sym)}`}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Authorized Visible Adjustment Form */}
        {canPostAccounting && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amt = Number(adjAmount);
              if (Number.isNaN(amt) || amt <= 0 || !adjReason.trim()) return;
              onPostAdjustment({
                date: adjDate,
                debitCode: adjDebit,
                creditCode: adjCredit,
                amount: amt,
                reason: adjReason.trim(),
              });
              setAdjAmount('');
              setAdjReason('');
              setStatusMsg('Visible opening adjustment entry posted and recorded in Black Box.');
            }}
            className="no-print liquid-glass rounded-2xl p-6 space-y-4"
          >
            <div>
              <h3 className="text-base font-semibold text-slate-900">
                Post Visible Opening Adjustment Entry
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Opening balances are locked. Any post-finalization correction is posted as an auditable Opening Adjustment entry (never counted as operational sales or expenses).
              </p>
            </div>

            {statusMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                {statusMsg}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Adjustment Date</label>
                <input
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Debit Account</label>
                <select
                  value={adjDebit}
                  onChange={(e) => setAdjDebit(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Credit Account</label>
                <select
                  value={adjCredit}
                  onChange={(e) => setAdjCredit(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Amount ({sym})</label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white hover:bg-slate-800 whitespace-nowrap"
              >
                Post Adjustment
              </button>
            </div>
            <input
              type="text"
              required
              value={adjReason}
              onChange={(e) => setAdjReason(e.target.value)}
              placeholder="Reason / audit note for adjustment..."
              className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
            />
          </form>
        )}

        {/* Owner Customize Opening / Adjustment Journal Modal */}
        {isOwner && editJeTarget && onOwnerCustomizeJournal && (
          <div
            className="no-print fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
            onClick={() => setEditJeTarget(null)}
          >
            <form
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                const dr = ejLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const cr = ejLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                if (ejLines.length < 2 || Math.abs(dr - cr) > 0.01) return;
                onOwnerCustomizeJournal(editJeTarget.id, {
                  date: dateInputToIso(ejDate, editJeTarget.date),
                  reference: ejRef.trim() || editJeTarget.reference,
                  description: ejDesc.trim() || editJeTarget.description,
                  category: ejCategory,
                  lines: ejLines.map((l) => {
                    const accObj = state.accounts.find((a) => a.code === l.accountCode);
                    return {
                      accountCode: l.accountCode,
                      accountName: accObj?.name || l.accountName,
                      debit: Number(l.debit) || 0,
                      credit: Number(l.credit) || 0,
                    };
                  }),
                });
                setEditJeTarget(null);
              }}
              className="w-full max-w-2xl my-6 rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
            >
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Customize Entry · {editJeTarget.id}
                  </h3>
                  <p className="text-slate-500">
                    Edit date, reference, narration, and balanced debit/credit lines (Owner)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setEditJeTarget(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={ejDate}
                    onChange={(e) => setEjDate(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Category</label>
                  <select
                    value={ejCategory}
                    onChange={(e) => setEjCategory(e.target.value as JournalEntry['category'])}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  >
                    <option value="Opening Balance">Opening Balance</option>
                    <option value="Opening Adjustment">Opening Adjustment</option>
                    <option value="Sudden Adjustment">Sudden Adjustment</option>
                    <option value="Transfer">Transfer</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Reference</label>
                  <input
                    value={ejRef}
                    onChange={(e) => setEjRef(e.target.value)}
                    className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Description</label>
                <input
                  required
                  value={ejDesc}
                  onChange={(e) => setEjDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {ejLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2 rounded-xl bg-slate-50 border border-slate-200/80"
                  >
                    <select
                      value={line.accountCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        const accObj = state.accounts.find((a) => a.code === code);
                        setEjLines((prev) =>
                          prev.map((x, i) =>
                            i === idx
                              ? { ...x, accountCode: code, accountName: accObj?.name || code }
                              : x
                          )
                        );
                      }}
                      className="col-span-6 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                    >
                      {state.accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.debit}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        setEjLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, debit: val, credit: val > 0 ? 0 : x.credit } : x
                          )
                        );
                      }}
                      className="col-span-2 px-2 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.credit}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        setEjLines((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, credit: val, debit: val > 0 ? 0 : x.debit } : x
                          )
                        );
                      }}
                      className="col-span-2 px-2 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                    />
                    <div className="col-span-2 flex justify-end">
                      <button
                        type="button"
                        disabled={ejLines.length <= 2}
                        onClick={() => setEjLines((prev) => prev.filter((_, i) => i !== idx))}
                        className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditJeTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    ejLines.length < 2 ||
                    Math.abs(
                      ejLines.reduce((s, l) => s + (Number(l.debit) || 0), 0) -
                        ejLines.reduce((s, l) => s + (Number(l.credit) || 0), 0)
                    ) > 0.01
                  }
                  className="px-4 py-2 rounded-xl bg-[#0071E3] text-white font-semibold disabled:opacity-40"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  // --- GUIDED 12-STEP + FINAL REVIEW WIZARD ---
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 flex items-center gap-2">
            <Scale className="w-5 h-5 text-[#0071E3]" />
            {isEditingFinalized
              ? 'Customize & Adjust Opening Balance (Owner)'
              : 'Opening Balance Setup Wizard'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {isEditingFinalized
              ? 'Adjust any opening cash, receivables, corporate pending stock, payables, capital, or As-of Date anytime. Ledger balances recalculate cleanly.'
              : 'Migrate an already-running laundry with existing cash, customer dues, corporate pending linen, stock, and capital'}
          </p>
        </div>

        {isEditingFinalized ? (
          <button
            type="button"
            onClick={() => {
              setIsEditingFinalized(false);
              setDraft(state.openingBalance);
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-800 hover:border-red-300 whitespace-nowrap self-start sm:self-auto"
          >
            <X className="w-3.5 h-3.5 text-red-500" />
            Cancel Customization
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              onSaveDraft({ ...draft, status: 'draft' });
              setStatusMsg('Draft saved. You can resume anytime before finalizing.');
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-white border border-slate-200 text-slate-800 hover:border-[#0071E3] whitespace-nowrap self-start sm:self-auto"
          >
            <Save className="w-3.5 h-3.5 text-[#0071E3]" />
            Save as Draft
          </button>
        )}
      </div>

      {isEditingFinalized && (
        <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong>Owner Customization Mode Active:</strong> Step through any section below to update balances, then go to{' '}
            <strong>Step 13 (Review &amp; Finalize)</strong> to apply and recalculate the General Ledger.
          </span>
          <button
            type="button"
            onClick={() => setStep(13)}
            className="px-3 py-1 rounded-lg bg-amber-600 text-white font-semibold hover:bg-amber-700"
          >
            Jump to Step 13 &amp; Apply
          </button>
        </div>
      )}

      {statusMsg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-medium text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" />
          {statusMsg}
        </div>
      )}

      {/* Progress Bar & Step Selector */}
      <div className="liquid-glass rounded-2xl p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-700">
            Step {step} of {STEPS.length}: {STEPS[step - 1].title}
          </span>
          <span className="font-mono text-[#0071E3] font-semibold">
            {Math.round((step / STEPS.length) * 100)}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-slate-200/80 overflow-hidden">
          <div
            className="h-full bg-[#0071E3] transition-all duration-200"
            style={{ width: `${(step / STEPS.length) * 100}%` }}
          />
        </div>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {STEPS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(s.id)}
              className={`px-2.5 py-1 text-[11px] font-medium rounded-lg border transition-colors whitespace-nowrap ${
                step === s.id
                  ? 'bg-[#0071E3] border-[#0071E3] text-white'
                  : 'bg-white/80 border-slate-200 text-slate-600 hover:text-slate-900'
              }`}
            >
              {s.id}. {s.title}
            </button>
          ))}
        </div>
      </div>

      {/* Live Balance Check Strip */}
      <div className="liquid-glass rounded-2xl p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs tabular-nums">
        <div>
          <span className="text-slate-500">Total Assets</span>
          <p className="text-base font-mono font-semibold text-slate-900 mt-0.5">
            {formatMoney(totals.totalAssets, sym)}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Total Liabilities</span>
          <p className="text-base font-mono font-semibold text-slate-900 mt-0.5">
            {formatMoney(totals.totalLiabilities, sym)}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Owner Capital</span>
          <p className="text-base font-mono font-semibold text-slate-900 mt-0.5">
            {formatMoney(totals.ownerCap, sym)}
          </p>
        </div>
        <div>
          <span className="text-slate-500">Balance Difference</span>
          <p
            className={`text-base font-mono font-semibold mt-0.5 ${
              Math.abs(totals.difference) < 0.01 ? 'text-emerald-700' : 'text-amber-700'
            }`}
          >
            {formatMoney(totals.difference, sym)}
          </p>
        </div>
      </div>

      {/* Step Content */}
      <div className="liquid-glass rounded-2xl p-6 space-y-5">
        {step === 1 && (
          <div className="space-y-4 max-w-md">
            <h2 className="text-base font-semibold text-slate-900">
              1. Set Opening "As-of Date"
            </h2>
            <p className="text-xs text-slate-500">
              All opening balances are dated on this day. Transactions before this date are not required—everything starts cleanly from this snapshot.
            </p>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">As-of Date</label>
              <input
                type="date"
                value={draft.asOfDate}
                onChange={(e) => setDraft({ ...draft, asOfDate: e.target.value })}
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  2. Money Accounts Setup (Cash, Bank &amp; Wallet)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tell us how many accounts you have, what you want to maintain in each account, and for wallets, your wallet type and cash-out / withdrawal charge.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    { label: '+ Cash', name: 'Cash in Hand', channel: 'Cash' as MoneySourceChannel },
                    { label: '+ Bank', name: 'Bank Account', channel: 'Bank' as MoneySourceChannel },
                    { label: '+ Wallet', name: 'Wallet', channel: 'E-Wallet' as MoneySourceChannel },
                  ] as const
                ).map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => {
                      const code = generateNextMoneyAccountCode(
                        state.accounts,
                        draft.cashAndBanks.map((c) => c.accountCode)
                      );
                      const countSame = draft.cashAndBanks.filter(
                        (c) => (c.channel || inferMoneyChannel(c.accountName)) === preset.channel
                      ).length;
                      const accountName =
                        countSame > 0 ? `${preset.name} #${countSame + 1}` : preset.name;
                      setDraft((prev) => ({
                        ...prev,
                        cashAndBanks: [
                          ...prev.cashAndBanks,
                          {
                            accountCode: code,
                            accountName,
                            balance: 0,
                            channel: preset.channel,
                            maintain: true,
                            walletType: preset.channel === 'E-Wallet' ? '' : undefined,
                            cashOutChargePercent: preset.channel === 'E-Wallet' ? 0 : undefined,
                            cashOutChargeFlat: preset.channel === 'E-Wallet' ? 0 : undefined,
                          },
                        ],
                      }));
                    }}
                    className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-50 text-[#0071E3] hover:bg-blue-100 border border-blue-200/70 transition-colors"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Question 1: How many accounts do you have? */}
            <div className="p-4 rounded-xl bg-blue-50/55 border border-blue-200/70 space-y-3">
              <div>
                <p className="text-xs font-semibold text-slate-900">
                  How many accounts do you have? (Total:{' '}
                  <span className="font-mono text-[#0071E3]">
                    {countCashInput + countBankInput + countWalletInput}
                  </span>
                  )
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Set how many Cash, Bank, and Wallet accounts your business runs, then click Apply Account Count to configure each account below.
                </p>
              </div>
              <div className="flex flex-wrap items-end gap-3 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Cash Accounts</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={countCashInput}
                    onChange={(e) => setCountCashInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 px-2.5 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Bank Accounts</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={countBankInput}
                    onChange={(e) => setCountBankInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 px-2.5 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-600 mb-1">Wallet Accounts</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    value={countWalletInput}
                    onChange={(e) => setCountWalletInput(Math.max(0, Number(e.target.value) || 0))}
                    className="w-24 px-2.5 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDraft((prev) => {
                      const existing = [...prev.cashAndBanks];
                      const usedCodes = existing.map((x) => x.accountCode);
                      const resizeChannel = (
                        ch: MoneySourceChannel,
                        baseName: string,
                        targetCount: number,
                        defaultCode?: string
                      ) => {
                        const rows = existing.filter(
                          (r) => (r.channel || inferMoneyChannel(r.accountName)) === ch
                        );
                        if (rows.length >= targetCount) {
                          return rows.slice(0, targetCount);
                        }
                        const out = [...rows];
                        while (out.length < targetCount) {
                          const code =
                            defaultCode &&
                            !usedCodes.includes(defaultCode) &&
                            !state.accounts.some((a) => a.code === defaultCode)
                              ? defaultCode
                              : generateNextMoneyAccountCode(state.accounts, usedCodes);
                          usedCodes.push(code);
                          out.push({
                            accountCode: code,
                            accountName: out.length === 0 ? baseName : `${baseName} #${out.length + 1}`,
                            balance: 0,
                            channel: ch,
                            maintain: true,
                            walletType: ch === 'E-Wallet' ? '' : undefined,
                            cashOutChargePercent: ch === 'E-Wallet' ? 0 : undefined,
                            cashOutChargeFlat: ch === 'E-Wallet' ? 0 : undefined,
                          });
                        }
                        return out;
                      };
                      const cashRows = resizeChannel('Cash', 'Cash in Hand', countCashInput, '1010');
                      const bankRows = resizeChannel('Bank', 'Bank Account', countBankInput, '1020');
                      const walletRows = resizeChannel('E-Wallet', 'Wallet', countWalletInput, '1030');
                      const otherRows = existing.filter(
                        (r) => (r.channel || inferMoneyChannel(r.accountName)) === 'Other'
                      );
                      return {
                        ...prev,
                        cashAndBanks: [...cashRows, ...bankRows, ...walletRows, ...otherRows],
                      };
                    });
                  }}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap"
                >
                  Apply Account Count
                </button>
              </div>
            </div>

            {draft.cashAndBanks.length === 0 ? (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800">
                No Cash, Bank, or Wallet accounts configured yet. Enter how many accounts you have above or add one below.
              </div>
            ) : (
              <div className="space-y-2.5">
                <p className="text-xs font-semibold text-slate-700">
                  What do you want to maintain in each account? ({draft.cashAndBanks.length})
                </p>
                {draft.cashAndBanks.map((acc, idx) => {
                  const rowChannel = acc.channel || inferMoneyChannel(acc.accountName);
                  const isWallet = rowChannel === 'E-Wallet';
                  const isMaintained = acc.maintain !== false;
                  return (
                    <div
                      key={acc.accountCode}
                      className={`p-3 rounded-xl border space-y-2.5 ${
                        isMaintained
                          ? 'bg-white/85 border-slate-200/80'
                          : 'bg-slate-50/75 border-slate-200/60 opacity-75'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[240px]">
                          <input
                            value={acc.accountName}
                            onChange={(e) => {
                              const val = e.target.value;
                              setDraft((prev) => ({
                                ...prev,
                                cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                  i === idx ? { ...item, accountName: val } : item
                                ),
                              }));
                            }}
                            placeholder="Account name..."
                            className="px-2.5 py-1.5 text-xs font-semibold text-slate-900 rounded-lg bg-white border border-slate-200 min-w-[160px] flex-1"
                          />
                          <select
                            value={rowChannel}
                            onChange={(e) => {
                              const ch = e.target.value as MoneySourceChannel;
                              setDraft((prev) => ({
                                ...prev,
                                cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                  i === idx
                                    ? {
                                        ...item,
                                        channel: ch,
                                        walletType: ch === 'E-Wallet' ? item.walletType || '' : item.walletType,
                                      }
                                    : item
                                ),
                              }));
                            }}
                            className="px-2 py-1.5 text-[11px] rounded-lg bg-slate-50 border border-slate-200 text-slate-700"
                          >
                            <option value="Cash">Cash</option>
                            <option value="Bank">Bank</option>
                            <option value="E-Wallet">Wallet</option>
                            <option value="Other">Other</option>
                          </select>
                          <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-700 cursor-pointer px-2 py-1 rounded-lg bg-slate-50 border border-slate-200/80">
                            <input
                              type="checkbox"
                              checked={isMaintained}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setDraft((prev) => ({
                                  ...prev,
                                  cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                    i === idx ? { ...item, maintain: checked } : item
                                  ),
                                }));
                              }}
                            />
                            Maintain
                          </label>
                          <span className="text-[11px] font-mono text-slate-400">
                            Code {acc.accountCode}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500">{sym}</span>
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={acc.balance}
                            onChange={(e) => {
                              const val = Number(e.target.value) || 0;
                              setDraft((prev) => ({
                                ...prev,
                                cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                  i === idx ? { ...item, balance: val } : item
                                ),
                              }));
                            }}
                            className="w-36 px-3 py-1.5 text-xs font-mono text-right rounded-lg bg-white border border-slate-200"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const removeRow = () =>
                                setDraft((prev) => ({
                                  ...prev,
                                  cashAndBanks: prev.cashAndBanks.filter((_, i) => i !== idx),
                                }));
                              if (onRequestDelete) {
                                onRequestDelete({
                                  itemType: 'Opening Account Entry',
                                  itemNameOrId: `${acc.accountName} (${acc.accountCode})`,
                                  bodyText: `Remove "${acc.accountName}" (${formatMoney(acc.balance, sym)}) from Cash, Bank & Wallet balances?`,
                                  onConfirmDelete: removeRow,
                                });
                              } else {
                                removeRow();
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                            title={`Delete ${acc.accountName}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {isWallet && (
                        <div className="pt-2 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
                          <div>
                            <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                              Wallet Type (e.g. Mobile / Merchant / Personal)
                            </label>
                            <input
                              type="text"
                              value={acc.walletType || ''}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDraft((prev) => ({
                                  ...prev,
                                  cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                    i === idx ? { ...item, walletType: val } : item
                                  ),
                                }));
                              }}
                              placeholder="Enter your wallet type..."
                              className="w-full px-2.5 py-1 text-xs rounded-lg bg-white border border-slate-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                              Cash-Out / Withdrawal Charge (%)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={acc.cashOutChargePercent ?? ''}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setDraft((prev) => ({
                                  ...prev,
                                  cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                    i === idx ? { ...item, cashOutChargePercent: val } : item
                                  ),
                                }));
                              }}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-medium text-slate-600 mb-0.5">
                              Flat Withdrawal Fee ({sym}, optional)
                            </label>
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              value={acc.cashOutChargeFlat ?? ''}
                              onChange={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                setDraft((prev) => ({
                                  ...prev,
                                  cashAndBanks: prev.cashAndBanks.map((item, i) =>
                                    i === idx ? { ...item, cashOutChargeFlat: val } : item
                                  ),
                                }));
                              }}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1 text-xs font-mono rounded-lg bg-white border border-slate-200"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200/70 space-y-2.5">
              <p className="text-[11px] font-semibold text-slate-600">
                Add Another Custom Account
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Account Name</label>
                  <input
                    value={newBankName}
                    onChange={(e) => {
                      const v = e.target.value;
                      setNewBankName(v);
                      setNewBankChannel(inferMoneyChannel(v, newBankChannel));
                    }}
                    placeholder="Enter account name..."
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 w-56"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Type</label>
                  <select
                    value={newBankChannel}
                    onChange={(e) => setNewBankChannel(e.target.value as MoneySourceChannel)}
                    className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    <option value="Bank">Bank</option>
                    <option value="E-Wallet">Wallet</option>
                    <option value="Cash">Cash</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Balance ({sym})</label>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newBankBal}
                    onChange={(e) => setNewBankBal(e.target.value)}
                    placeholder="0.00"
                    className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200 w-32"
                  />
                </div>
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 pb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newBankMaintain}
                    onChange={(e) => setNewBankMaintain(e.target.checked)}
                  />
                  Maintain in App
                </label>
                {newBankChannel === 'E-Wallet' && (
                  <>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Wallet Type</label>
                      <input
                        value={newWalletType}
                        onChange={(e) => setNewWalletType(e.target.value)}
                        placeholder="Wallet type..."
                        className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 w-40"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Cash-Out Fee (%)
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={newWalletChargePct}
                        onChange={(e) => setNewWalletChargePct(e.target.value)}
                        placeholder="0.00"
                        className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200 w-28"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">
                        Flat Fee ({sym})
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={newWalletChargeFlat}
                        onChange={(e) => setNewWalletChargeFlat(e.target.value)}
                        placeholder="0.00"
                        className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200 w-24"
                      />
                    </div>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (!newBankName.trim()) return;
                    const code = generateNextMoneyAccountCode(
                      state.accounts,
                      draft.cashAndBanks.map((c) => c.accountCode)
                    );
                    setDraft((prev) => ({
                      ...prev,
                      cashAndBanks: [
                        ...prev.cashAndBanks,
                        {
                          accountCode: code,
                          accountName: newBankName.trim(),
                          balance: Number(newBankBal) || 0,
                          channel: newBankChannel,
                          maintain: newBankMaintain,
                          walletType:
                            newBankChannel === 'E-Wallet' ? newWalletType.trim() : undefined,
                          cashOutChargePercent:
                            newBankChannel === 'E-Wallet'
                              ? Math.max(0, Number(newWalletChargePct) || 0)
                              : undefined,
                          cashOutChargeFlat:
                            newBankChannel === 'E-Wallet'
                              ? Math.max(0, Number(newWalletChargeFlat) || 0)
                              : undefined,
                        },
                      ],
                    }));
                    setNewBankName('');
                    setNewBankBal('');
                    setNewBankMaintain(true);
                    setNewWalletType('');
                    setNewWalletChargePct('');
                    setNewWalletChargeFlat('');
                  }}
                  className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Account
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                3. Customer Dues (Opening Receivables)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Enter unpaid balances owed by retail and corporate customers as of {draft.asOfDate}. Add missing customers inline.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Retail Dues */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700">Retail Customer Dues</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {state.customers.map((c) => {
                    const entry = draft.retailDues.find((r) => r.customerId === c.id);
                    const val = entry?.amount ?? 0;
                    return (
                      <div
                        key={c.id}
                        className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{c.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">{c.id}</p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={val}
                          onChange={(e) => {
                            const amt = Math.max(0, Number(e.target.value) || 0);
                            setDraft((prev) => {
                              const rest = prev.retailDues.filter((r) => r.customerId !== c.id);
                              return {
                                ...prev,
                                retailDues:
                                  amt > 0
                                    ? [...rest, { customerId: c.id, customerName: c.name, amount: amt }]
                                    : rest,
                              };
                            });
                          }}
                          className="w-28 px-2.5 py-1 text-right font-mono rounded-lg bg-white border border-slate-200"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">Add Retail Customer Inline</p>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      value={inlineCustName}
                      onChange={(e) => setInlineCustName(e.target.value)}
                      placeholder="Full name"
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      value={inlineCustPhone}
                      onChange={(e) => setInlineCustPhone(e.target.value)}
                      placeholder="Phone"
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      type="number"
                      min={0}
                      value={inlineCustDue}
                      onChange={(e) => setInlineCustDue(e.target.value)}
                      placeholder={`Due (${sym})`}
                      className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!inlineCustName.trim() || !inlineCustPhone.trim()) return;
                      const created = onInlineAddCustomer({
                        name: inlineCustName.trim(),
                        phone: inlineCustPhone.trim(),
                        categoryId: state.categories[0]?.id || 'cat-std',
                      });
                      const due = Math.max(0, Number(inlineCustDue) || 0);
                      if (created && due > 0) {
                        setDraft((prev) => ({
                          ...prev,
                          retailDues: [
                            ...prev.retailDues,
                            { customerId: created.id, customerName: created.name, amount: due },
                          ],
                        }));
                      }
                      setInlineCustName('');
                      setInlineCustPhone('');
                      setInlineCustDue('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0071E3] text-white"
                  >
                    <Plus className="w-3 h-3" />
                    Add Retail Customer
                  </button>
                </div>
              </div>

              {/* Corporate Dues */}
              <div className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-700">Corporate Customer Dues</h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {state.corporateCustomers.map((corp) => {
                    const entry = draft.corporateDues.find((c) => c.corporateId === corp.id);
                    const val = entry?.amount ?? 0;
                    return (
                      <div
                        key={corp.id}
                        className="p-2.5 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 truncate">{corp.name}</p>
                          <p className="text-[11px] font-mono text-slate-500">
                            {corp.id} · {corp.billingBasis}
                          </p>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step="0.5"
                          value={val}
                          onChange={(e) => {
                            const amt = Math.max(0, Number(e.target.value) || 0);
                            setDraft((prev) => {
                              const rest = prev.corporateDues.filter(
                                (r) => r.corporateId !== corp.id
                              );
                              return {
                                ...prev,
                                corporateDues:
                                  amt > 0
                                    ? [...rest, { corporateId: corp.id, corporateName: corp.name, amount: amt }]
                                    : rest,
                              };
                            });
                          }}
                          className="w-28 px-2.5 py-1 text-right font-mono rounded-lg bg-white border border-slate-200"
                        />
                      </div>
                    );
                  })}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-600">
                    Add Corporate Client Inline
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={inlineCorpName}
                      onChange={(e) => setInlineCorpName(e.target.value)}
                      placeholder="Company name"
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      value={inlineCorpContact}
                      onChange={(e) => setInlineCorpContact(e.target.value)}
                      placeholder="Contact person"
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <input
                      value={inlineCorpPhone}
                      onChange={(e) => setInlineCorpPhone(e.target.value)}
                      placeholder="Phone"
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <select
                      value={inlineCorpBasis}
                      onChange={(e) => setInlineCorpBasis(e.target.value as BillingBasis)}
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      <option value="Delivered-wise">Delivered-wise</option>
                      <option value="Received-wise">Received-wise</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!inlineCorpName.trim()) return;
                      onInlineAddCorporate({
                        name: inlineCorpName.trim(),
                        contactPerson: inlineCorpContact.trim() || 'Manager',
                        phone: inlineCorpPhone.trim() || '+880 1700-000000',
                        billingBasis: inlineCorpBasis,
                        billingCycle: 'Weekly',
                      });
                      setInlineCorpName('');
                      setInlineCorpContact('');
                      setInlineCorpPhone('');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
                  >
                    <Plus className="w-3 h-3" />
                    Add Corporate Client
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                4. Corporate Pending Items (Linen Currently at Laundry)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Pick products and services from each corporate client's private catalogue. On finalize, these become initial "Opening" rows of that client's movement log with already-billed amounts marked so earlier quantities are never billed twice.
              </p>
            </div>

            {state.corporateCustomers.length === 0 ? (
              <p className="text-xs text-slate-500">No corporate customers configured yet.</p>
            ) : (
              <>
                <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 grid grid-cols-1 md:grid-cols-8 gap-2.5 items-end">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-500 mb-1">Corporate Client</label>
                    <select
                      value={activeCpCorp?.id || ''}
                      onChange={(e) => {
                        const c = state.corporateCustomers.find((x) => x.id === e.target.value);
                        setCpCorpId(e.target.value);
                        setCpProdId(c?.products[0]?.id || '');
                        setCpSrvId(c?.services[0]?.id || '');
                      }}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      {state.corporateCustomers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Private Product</label>
                    <select
                      value={cpProdId || activeCpCorp?.products[0]?.id || ''}
                      onChange={(e) => setCpProdId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      {(activeCpCorp?.products || []).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Private Service</label>
                    <select
                      value={cpSrvId || activeCpCorp?.services[0]?.id || ''}
                      onChange={(e) => setCpSrvId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      {(activeCpCorp?.services || []).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Pending Qty</label>
                    <input
                      type="number"
                      min={0}
                      value={cpPendingQty}
                      onChange={(e) => setCpPendingQty(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Prior Recv</label>
                    <input
                      type="number"
                      min={0}
                      value={cpAlreadyRecv}
                      onChange={(e) => setCpAlreadyRecv(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Prior Deliv</label>
                    <input
                      type="number"
                      min={0}
                      value={cpAlreadyDeliv}
                      onChange={(e) => setCpAlreadyDeliv(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Billed ({sym})</label>
                    <input
                      type="number"
                      min={0}
                      value={cpAlreadyBilled}
                      onChange={(e) => setCpAlreadyBilled(Math.max(0, Number(e.target.value)))}
                      className="w-full px-2 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      const cId = activeCpCorp?.id;
                      const pId = cpProdId || activeCpCorp?.products[0]?.id;
                      const sId = cpSrvId || activeCpCorp?.services[0]?.id;
                      if (!cId || !pId || !sId) return;
                      setDraft((prev) => ({
                        ...prev,
                        corporatePendingItems: [
                          ...prev.corporatePendingItems,
                          {
                            id: `cpi-${Date.now()}`,
                            corporateId: cId,
                            productId: pId,
                            serviceId: sId,
                            pendingQty: cpPendingQty,
                            alreadyReceivedTotal: cpAlreadyRecv,
                            alreadyDeliveredTotal: cpAlreadyDeliv,
                            alreadyBilledAmount: cpAlreadyBilled,
                          },
                        ],
                      }));
                      setCpPendingQty(0);
                      setCpAlreadyRecv(0);
                      setCpAlreadyDeliv(0);
                      setCpAlreadyBilled(0);
                    }}
                    className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Corporate Pending Row
                  </button>
                </div>

                {draft.corporatePendingItems.length > 0 && (
                  <div className="divide-y divide-slate-200/60 text-xs">
                    {draft.corporatePendingItems.map((item) => {
                      const corp = state.corporateCustomers.find((c) => c.id === item.corporateId);
                      const prod = corp?.products.find((p) => p.id === item.productId);
                      const srv = corp?.services.find((s) => s.id === item.serviceId);
                      return (
                        <div key={item.id} className="py-2.5 flex items-center justify-between gap-2">
                          <div>
                            <p className="font-semibold text-slate-900">
                              {corp?.name} — {prod?.name} ({srv?.name})
                            </p>
                            <p className="text-slate-500 font-mono">
                              Pending: {item.pendingQty} pcs · Prior Recv: {item.alreadyReceivedTotal} ·
                              Prior Deliv: {item.alreadyDeliveredTotal} · Already Billed:{' '}
                              {formatMoney(item.alreadyBilledAmount, sym)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const removeRow = () =>
                                setDraft((prev) => ({
                                  ...prev,
                                  corporatePendingItems: prev.corporatePendingItems.filter(
                                    (x) => x.id !== item.id
                                  ),
                                }));
                              if (onRequestDelete) {
                                onRequestDelete({
                                  itemType: 'Opening Pending Linen Entry',
                                  itemNameOrId: `${corp?.name || 'Corporate'} — ${prod?.name || 'Item'}`,
                                  bodyText: `Remove this corporate pending linen row (${item.pendingQty} pcs) from the opening balance draft?`,
                                  onConfirmDelete: removeRow,
                                });
                              } else {
                                removeRow();
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              5. Customer Advances Held (Liability)
            </h2>
            <p className="text-xs text-slate-500">
              Prepaid advance balances already deposited by retail customers before {draft.asOfDate}.
            </p>
            <div className="space-y-2 max-w-xl">
              {state.customers.map((c) => {
                const entry = draft.customerAdvances.find((a) => a.customerId === c.id);
                return (
                  <div
                    key={c.id}
                    className="p-3 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <span>
                      <strong className="text-slate-900">{c.name}</strong>{' '}
                      <span className="font-mono text-slate-500">({c.id})</span>
                    </span>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={entry?.amount ?? 0}
                      onChange={(e) => {
                        const amt = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => {
                          const rest = prev.customerAdvances.filter((a) => a.customerId !== c.id);
                          return {
                            ...prev,
                            customerAdvances:
                              amt > 0
                                ? [...rest, { customerId: c.id, customerName: c.name, amount: amt }]
                                : rest,
                          };
                        });
                      }}
                      className="w-32 px-2.5 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              6. Supplier Dues (Opening Payables)
            </h2>
            <div className="space-y-2 max-w-xl">
              {state.suppliers.map((sup) => {
                const entry = draft.supplierDues.find((s) => s.supplierId === sup.id);
                return (
                  <div
                    key={sup.id}
                    className="p-3 rounded-xl bg-white/80 border border-slate-200/80 flex items-center justify-between text-xs"
                  >
                    <div>
                      <p className="font-semibold text-slate-900">{sup.name}</p>
                      <p className="text-[11px] text-slate-500">{sup.suppliedProducts}</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={entry?.amount ?? 0}
                      onChange={(e) => {
                        const amt = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => {
                          const rest = prev.supplierDues.filter((s) => s.supplierId !== sup.id);
                          return {
                            ...prev,
                            supplierDues:
                              amt > 0
                                ? [...rest, { supplierId: sup.id, supplierName: sup.name, amount: amt }]
                                : rest,
                          };
                        });
                      }}
                      className="w-32 px-2.5 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                );
              })}
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 max-w-xl space-y-2">
              <p className="text-[11px] font-semibold text-slate-600">Add Supplier Inline</p>
              <div className="grid grid-cols-3 gap-2">
                <input
                  value={inlineSupName}
                  onChange={(e) => setInlineSupName(e.target.value)}
                  placeholder="Supplier name"
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                />
                <input
                  value={inlineSupPhone}
                  onChange={(e) => setInlineSupPhone(e.target.value)}
                  placeholder="Phone"
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                />
                <input
                  value={inlineSupItems}
                  onChange={(e) => setInlineSupItems(e.target.value)}
                  placeholder="Products supplied"
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!inlineSupName.trim()) return;
                  onInlineAddSupplier({
                    name: inlineSupName.trim(),
                    phone: inlineSupPhone.trim(),
                    suppliedProducts: inlineSupItems.trim() || 'Laundry Consumables',
                  });
                  setInlineSupName('');
                  setInlineSupPhone('');
                  setInlineSupItems('');
                }}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
              >
                <Plus className="w-3 h-3" />
                Add Supplier
              </button>
            </div>
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              7. Chemical &amp; Consumable Inventory on Hand
            </h2>
            <div className="space-y-2.5">
              {draft.chemicalStocks.map((ch, idx) => (
                <div
                  key={ch.chemicalId}
                  className="p-3 rounded-xl bg-white/80 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center text-xs"
                >
                  <div className="sm:col-span-5">
                    <p className="font-semibold text-slate-900">{ch.name}</p>
                    <p className="text-[11px] font-mono text-slate-500">Unit: {ch.unit}</p>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[10px] text-slate-500">Qty on Hand</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={ch.qty}
                      onChange={(e) => {
                        const qty = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => ({
                          ...prev,
                          chemicalStocks: prev.chemicalStocks.map((x, i) =>
                            i === idx ? { ...x, qty } : x
                          ),
                        }));
                      }}
                      className="w-full px-2.5 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] text-slate-500">Unit Cost ({sym})</label>
                    <input
                      type="number"
                      min={0}
                      step="0.5"
                      value={ch.unitCost}
                      onChange={(e) => {
                        const unitCost = Math.max(0, Number(e.target.value) || 0);
                        setDraft((prev) => ({
                          ...prev,
                          chemicalStocks: prev.chemicalStocks.map((x, i) =>
                            i === idx ? { ...x, unitCost } : x
                          ),
                        }));
                      }}
                      className="w-full px-2.5 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div className="sm:col-span-2 text-right font-mono font-semibold text-slate-900">
                    {formatMoney(ch.qty * ch.unitCost, sym)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-slate-900">
                8. Business Loans &amp; Other Liabilities
              </h2>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    loansAndLiabilities: [
                      ...prev.loansAndLiabilities,
                      {
                        id: `obl-${Date.now()}`,
                        lenderOrName: 'Equipment / Term Loan',
                        accountCode: '2200',
                        amount: 0,
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Liability
              </button>
            </div>
            <div className="space-y-2.5">
              {draft.loansAndLiabilities.map((l, idx) => (
                <div
                  key={l.id}
                  className="p-3 rounded-xl bg-white/80 border border-slate-200/80 flex flex-wrap items-center gap-3 text-xs"
                >
                  <input
                    value={l.lenderOrName}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        loansAndLiabilities: prev.loansAndLiabilities.map((x, i) =>
                          i === idx ? { ...x, lenderOrName: e.target.value } : x
                        ),
                      }))
                    }
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                  />
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={l.amount}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        loansAndLiabilities: prev.loansAndLiabilities.map((x, i) =>
                          i === idx ? { ...x, amount: Math.max(0, Number(e.target.value) || 0) } : x
                        ),
                      }))
                    }
                    className="w-36 px-2.5 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const removeRow = () =>
                        setDraft((prev) => ({
                          ...prev,
                          loansAndLiabilities: prev.loansAndLiabilities.filter((_, i) => i !== idx),
                        }));
                      if (onRequestDelete) {
                        onRequestDelete({
                          itemType: 'Opening Liability Entry',
                          itemNameOrId: `${l.lenderOrName} (${formatMoney(l.amount, sym)})`,
                          bodyText: `Remove opening liability "${l.lenderOrName}" from the opening balance draft?`,
                          onConfirmDelete: removeRow,
                        });
                      } else {
                        removeRow();
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 9 && (
          <div className="space-y-5">
            <h2 className="text-base font-semibold text-slate-900">
              9. Owner Capital &amp; Fixed Assets (Equipment / Deposits)
            </h2>
            <div className="max-w-sm">
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Owner Capital Investment ({sym})
              </label>
              <input
                type="number"
                min={0}
                step="1"
                value={draft.ownerCapitalAmount}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    ownerCapitalAmount: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
            </div>

            <div className="space-y-2.5 pt-2 border-t border-slate-200/70">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-slate-700">
                  Other Assets (Washers, Dryers, Shop Security Deposit)
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    setDraft((prev) => ({
                      ...prev,
                      otherAssets: [
                        ...prev.otherAssets,
                        { id: `oa-${Date.now()}`, name: 'Industrial Washer / Deposit', value: 0 },
                      ],
                    }))
                  }
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Asset
                </button>
              </div>
              {draft.otherAssets.map((oa, idx) => (
                <div
                  key={oa.id}
                  className="p-3 rounded-xl bg-white/80 border border-slate-200/80 flex items-center gap-3 text-xs"
                >
                  <input
                    value={oa.name}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        otherAssets: prev.otherAssets.map((x, i) =>
                          i === idx ? { ...x, name: e.target.value } : x
                        ),
                      }))
                    }
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                  />
                  <input
                    type="number"
                    min={0}
                    value={oa.value}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        otherAssets: prev.otherAssets.map((x, i) =>
                          i === idx ? { ...x, value: Math.max(0, Number(e.target.value) || 0) } : x
                        ),
                      }))
                    }
                    className="w-36 px-2.5 py-1.5 text-right font-mono rounded-lg bg-white border border-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const removeRow = () =>
                        setDraft((prev) => ({
                          ...prev,
                          otherAssets: prev.otherAssets.filter((_, i) => i !== idx),
                        }));
                      if (onRequestDelete) {
                        onRequestDelete({
                          itemType: 'Opening Asset Entry',
                          itemNameOrId: `${oa.name} (${formatMoney(oa.value, sym)})`,
                          bodyText: `Remove opening fixed asset "${oa.name}" from the opening balance draft?`,
                          onConfirmDelete: removeRow,
                        });
                      } else {
                        removeRow();
                      }
                    }}
                    className="p-1.5 text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              10. Employee Salary Dues &amp; Staff Advances
            </h2>
            <div className="space-y-2.5">
              {draft.employeeBalances.map((emp, idx) => (
                <div
                  key={emp.employeeId}
                  className="p-3 rounded-xl bg-white/80 border border-slate-200/80 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center text-xs"
                >
                  <span className="font-semibold text-slate-900">{emp.name}</span>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Unpaid Salary Due (Liability, {sym})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={emp.salaryDue}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          employeeBalances: prev.employeeBalances.map((x, i) =>
                            i === idx ? { ...x, salaryDue: Math.max(0, Number(e.target.value) || 0) } : x
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500">
                      Advance Given to Staff (Asset, {sym})
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={emp.advanceGiven}
                      onChange={(e) =>
                        setDraft((prev) => ({
                          ...prev,
                          employeeBalances: prev.employeeBalances.map((x, i) =>
                            i === idx
                              ? { ...x, advanceGiven: Math.max(0, Number(e.target.value) || 0) }
                              : x
                          ),
                        }))
                      }
                      className="w-full px-2.5 py-1 font-mono rounded-lg bg-white border border-slate-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 11 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  11. Pending Retail Orders at Counter (Optional)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  In-flight orders tagged as Opening (tracked for stage &amp; delivery without counting as new operational sales).
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    pendingRetailOrders: [
                      ...prev.pendingRetailOrders,
                      {
                        id: `OPN-ORD-${prev.pendingRetailOrders.length + 1}`,
                        customerId: state.customers[0]?.id || '',
                        stage: 'Processing' as OrderStage,
                        pieceCount: 1,
                        estimatedValue: 0,
                        paidAmount: 0,
                      },
                    ],
                  }))
                }
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-900 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Pending Order
              </button>
            </div>

            {draft.pendingRetailOrders.length === 0 ? (
              <p className="text-xs text-slate-500">No pending in-flight retail orders added.</p>
            ) : (
              <div className="space-y-2.5">
                {draft.pendingRetailOrders.map((po, idx) => (
                  <div
                    key={po.id}
                    className="p-3 rounded-xl bg-white/80 border border-slate-200/80 grid grid-cols-1 md:grid-cols-6 gap-2.5 items-end text-xs"
                  >
                    <div>
                      <label className="block text-[10px] text-slate-500">Order #</label>
                      <input
                        value={po.id}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            pendingRetailOrders: prev.pendingRetailOrders.map((x, i) =>
                              i === idx ? { ...x, id: e.target.value } : x
                            ),
                          }))
                        }
                        className="w-full px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] text-slate-500">Customer</label>
                      <select
                        value={po.customerId}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            pendingRetailOrders: prev.pendingRetailOrders.map((x, i) =>
                              i === idx ? { ...x, customerId: e.target.value } : x
                            ),
                          }))
                        }
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200"
                      >
                        {state.customers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Stage</label>
                      <select
                        value={po.stage}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            pendingRetailOrders: prev.pendingRetailOrders.map((x, i) =>
                              i === idx ? { ...x, stage: e.target.value as OrderStage } : x
                            ),
                          }))
                        }
                        className="w-full px-2 py-1 rounded-lg bg-white border border-slate-200"
                      >
                        <option value="Received">Received</option>
                        <option value="Processing">Processing</option>
                        <option value="Ready to deliver">Ready to deliver</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] text-slate-500">Total ({sym})</label>
                      <input
                        type="number"
                        min={0}
                        value={po.estimatedValue}
                        onChange={(e) =>
                          setDraft((prev) => ({
                            ...prev,
                            pendingRetailOrders: prev.pendingRetailOrders.map((x, i) =>
                              i === idx
                                ? { ...x, estimatedValue: Math.max(0, Number(e.target.value) || 0) }
                                : x
                            ),
                          }))
                        }
                        className="w-full px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          const removeRow = () =>
                            setDraft((prev) => ({
                              ...prev,
                              pendingRetailOrders: prev.pendingRetailOrders.filter((_, i) => i !== idx),
                            }));
                          if (onRequestDelete) {
                            onRequestDelete({
                              itemType: 'Opening Pending Order',
                              itemNameOrId: po.id,
                              bodyText: `Remove opening pending order "${po.id}" (${formatMoney(po.estimatedValue, sym)}) from the opening balance draft?`,
                              onConfirmDelete: removeRow,
                            });
                          } else {
                            removeRow();
                          }
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 12 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              12. Smart ID Number Continuation
            </h2>
            <p className="text-xs text-slate-500">
              Enter your last issued number for each sequence (leave 0 to keep current settings). On finalize, new IDs will automatically continue from Last Used + 1.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs">
              {(
                [
                  { key: 'customerLastNum', label: 'Last Retail Customer #' },
                  { key: 'retailOrderLastNum', label: 'Last Retail Order #' },
                  { key: 'corporateOrderLastNum', label: 'Last Corporate Order #' },
                  { key: 'retailInvoiceLastNum', label: 'Last Retail Invoice #' },
                  { key: 'corporateInvoiceLastNum', label: 'Last Corporate Invoice #' },
                ] as const
              ).map((f) => (
                <div key={f.key} className="p-3 rounded-xl bg-white/80 border border-slate-200/80">
                  <label className="block font-medium text-slate-700 mb-1">{f.label}</label>
                  <input
                    type="number"
                    min={0}
                    value={draft.lastIds[f.key]}
                    onChange={(e) =>
                      setDraft((prev) => ({
                        ...prev,
                        lastIds: {
                          ...prev.lastIds,
                          [f.key]: Math.max(0, Number(e.target.value) || 0),
                        },
                      }))
                    }
                    className="w-full px-3 py-1.5 font-mono rounded-lg bg-white border border-slate-200"
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 13 && (
          <div className="space-y-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                13. Final Review &amp; Balance Verification
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Verify Assets = Liabilities + Equity before posting the single Opening Balance Journal dated {draft.asOfDate}.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
              <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 space-y-2 tabular-nums">
                <p className="font-semibold text-slate-800 border-b border-slate-200/70 pb-1.5">
                  Assets Breakdown
                </p>
                <div className="flex justify-between">
                  <span>Cash &amp; Bank Accounts</span>
                  <span className="font-mono">{formatMoney(totals.cashBank, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Retail Receivables (Dues)</span>
                  <span className="font-mono">{formatMoney(totals.retailAR, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Corporate Receivables (Dues)</span>
                  <span className="font-mono">{formatMoney(totals.corpAR, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Chemical Inventory Valuation</span>
                  <span className="font-mono">{formatMoney(totals.stockVal, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Staff Advances Given</span>
                  <span className="font-mono">{formatMoney(totals.empAdvances, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Other Fixed Assets / Deposits</span>
                  <span className="font-mono">{formatMoney(totals.otherAssets, sym)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Assets</span>
                  <span className="font-mono">{formatMoney(totals.totalAssets, sym)}</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-white/80 border border-slate-200/80 space-y-2 tabular-nums">
                <p className="font-semibold text-slate-800 border-b border-slate-200/70 pb-1.5">
                  Liabilities &amp; Equity Breakdown
                </p>
                <div className="flex justify-between">
                  <span>Customer Advances Held</span>
                  <span className="font-mono">{formatMoney(totals.custAdvances, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Supplier Payables</span>
                  <span className="font-mono">{formatMoney(totals.supPayables, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Loans &amp; Liabilities</span>
                  <span className="font-mono">{formatMoney(totals.loans, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Employee Salary Dues</span>
                  <span className="font-mono">{formatMoney(totals.empSalariesDue, sym)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Owner Capital</span>
                  <span className="font-mono">{formatMoney(totals.ownerCap, sym)}</span>
                </div>
                <div className="flex justify-between font-bold text-slate-900 pt-2 border-t border-slate-200">
                  <span>Total Liabilities + Capital</span>
                  <span className="font-mono">
                    {formatMoney(totals.totalLiabilities + totals.ownerCap, sym)}
                  </span>
                </div>
              </div>
            </div>

            {Math.abs(totals.difference) >= 0.01 && (
              <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 space-y-2 text-xs text-amber-900">
                <p className="font-semibold">
                  Balancing Difference Detected: {formatMoney(totals.difference, sym)}
                </p>
                <p>
                  Assets minus (Liabilities + Owner Capital) is non-zero. You may confirm posting the balancing difference into <strong>Opening Balance Equity (3040)</strong> so your trial balance starts perfectly balanced.
                </p>
                <label className="inline-flex items-center gap-2 font-medium cursor-pointer pt-1">
                  <input
                    type="checkbox"
                    checked={confirmAutoBalance}
                    onChange={(e) => setConfirmAutoBalance(e.target.checked)}
                  />
                  Confirm posting {formatMoney(totals.difference, sym)} to Opening Balance Equity (3040)
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2">
              <button
                type="button"
                disabled={Math.abs(totals.difference) >= 0.01 && !confirmAutoBalance}
                onClick={() => {
                  if (isEditingFinalized && onOwnerAdjustFinalized) {
                    onOwnerAdjustFinalized({
                      draft,
                      balanceWithOpeningEquity: confirmAutoBalance,
                    });
                    setIsEditingFinalized(false);
                    setStatusMsg('Opening balance customized and General Ledger recalculated.');
                  } else {
                    onFinalize({
                      draft,
                      balanceWithOpeningEquity: confirmAutoBalance,
                    });
                  }
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isEditingFinalized
                  ? 'Save Adjusted Opening Balance & Recalculate'
                  : 'Finalize & Lock Opening Balance'}
              </button>
            </div>
          </div>
        )}

        {/* Step Navigation Footer */}
        <div className="pt-4 border-t border-slate-200/70 flex items-center justify-between">
          <button
            type="button"
            disabled={step === 1}
            onClick={() => setStep((s) => Math.max(1, s - 1))}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 disabled:opacity-40"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back
          </button>

          {step < STEPS.length && (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
            >
              Next Step
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

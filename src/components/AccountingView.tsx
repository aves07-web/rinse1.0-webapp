import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  MinusCircle,
  Plus,
  PlusCircle,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import {
  Account,
  AccountType,
  ErpState,
  JournalEntry,
  JournalLine,
  MoneySourceChannel,
} from '../types/erp';
import {
  calculateCashOutFee,
  computeFinancialStatements,
  dateInputToIso,
  formatMoney,
  generateNextMoneyAccountCode,
  getMoneySourceAccounts,
  toDateInputValue,
} from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

const JOURNAL_CATEGORIES: JournalEntry['category'][] = [
  'Transfer',
  'Sudden Adjustment',
  'Expense',
  'Sales',
  'Collection',
  'Advance',
  'Purchase',
  'Supplier Payment',
  'Payroll',
  'Owner Draw',
  'Owner Capital',
  'Loan',
  'Opening Adjustment',
];

interface AccountingViewProps {
  state: ErpState;
  isOwner?: boolean;
  initialSubTab?: 'statements' | 'journals' | 'drawCashIn' | 'coa';
  onPostOwnerDraw: (
    amount: number,
    paymentAccountCode: string,
    note: string,
    date?: string
  ) => void;
  onPostCashIn: (params: {
    inflowType: 'Owner Capital' | 'Loan Received' | 'Other Inflow';
    amount: number;
    toAccountCode: string;
    note: string;
    date?: string;
  }) => void;
  onPostTransfer: (
    fromCode: string,
    toCode: string,
    amount: number,
    note: string,
    date?: string
  ) => void;
  onPostManualJournal: (params: {
    description: string;
    reference: string;
    category: JournalEntry['category'];
    debitCode: string;
    creditCode: string;
    amount: number;
    date?: string;
  }) => void;
  onPostSuddenAdjustment?: (params: {
    accountCode: string;
    direction: 'Add' | 'Deduct';
    amount: number;
    offsetAccountCode: string;
    reason: string;
    date?: string;
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
  onOwnerAdjustAccountBalance?: (params: {
    accountCode: string;
    targetBalance: number;
    offsetAccountCode: string;
    date: string;
    reason: string;
  }) => void;
  onOwnerUpdateAccount?: (
    accountCode: string,
    patch: {
      name: string;
      channel?: MoneySourceChannel;
      walletType?: string;
      cashOutChargePercent?: number;
      cashOutChargeFlat?: number;
      active?: boolean;
    }
  ) => void;
  onReverseJournal: (entryId: string) => void;
  onAddAccount: (
    code: string,
    name: string,
    type: AccountType,
    channel?: MoneySourceChannel,
    walletOptions?: {
      walletType?: string;
      cashOutChargePercent?: number;
      cashOutChargeFlat?: number;
    }
  ) => void;
  onDeleteAccount?: (code: string) => void;
  onDeactivateAccount?: (code: string) => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function AccountingView({
  state,
  isOwner = false,
  initialSubTab,
  onPostOwnerDraw,
  onPostCashIn,
  onPostTransfer,
  onPostManualJournal,
  onPostSuddenAdjustment,
  onOwnerCustomizeJournal,
  onOwnerDeleteJournal,
  onOwnerAdjustAccountBalance,
  onOwnerUpdateAccount,
  onReverseJournal,
  onAddAccount,
  onDeleteAccount,
  onDeactivateAccount,
  onRequestDelete,
}: AccountingViewProps) {
  const sym = state.settings.currencySymbol;
  const statements = computeFinancialStatements(state.accounts);
  const [subTab, setSubTab] = useState<'statements' | 'journals' | 'drawCashIn' | 'coa'>(
    initialSubTab || 'statements'
  );

  useEffect(() => {
    if (initialSubTab) {
      setSubTab(initialSubTab);
    }
  }, [initialSubTab]);

  const cashBankAccounts = useMemo(
    () => getMoneySourceAccounts(state.accounts),
    [state.accounts]
  );
  const defaultMoneyCode = cashBankAccounts[0]?.code || '1010';
  const secondMoneyCode = cashBankAccounts[1]?.code || defaultMoneyCode;

  // Owner Draw
  const [drawAmount, setDrawAmount] = useState('');
  const [drawAcc, setDrawAcc] = useState(defaultMoneyCode);
  const [drawDate, setDrawDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [drawNote, setDrawNote] = useState('');

  // Cash In
  const [cashInType, setCashInType] = useState<'Owner Capital' | 'Loan Received' | 'Other Inflow'>(
    'Owner Capital'
  );
  const [cashInAmount, setCashInAmount] = useState('');
  const [cashInAcc, setCashInAcc] = useState(secondMoneyCode);
  const [cashInDate, setCashInDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cashInNote, setCashInNote] = useState('');

  // Account Transfer
  const [xferFrom, setXferFrom] = useState(defaultMoneyCode);
  const [xferTo, setXferTo] = useState(secondMoneyCode);
  const [xferAmount, setXferAmount] = useState('');
  const [xferDate, setXferDate] = useState(() => new Date().toISOString().slice(0, 10));

  // Sudden Money Add / Deduct (Sheet Adjustment)
  const [suddenAcc, setSuddenAcc] = useState(defaultMoneyCode);
  const [suddenDirection, setSuddenDirection] = useState<'Add' | 'Deduct'>('Add');
  const [suddenAmount, setSuddenAmount] = useState('');
  const [suddenOffsetCode, setSuddenOffsetCode] = useState('4090');
  const [suddenDate, setSuddenDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [suddenReason, setSuddenReason] = useState('');

  // Manual Journal
  const [jeDesc, setJeDesc] = useState('');
  const [jeRef, setJeRef] = useState('');
  const [jeDate, setJeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [jeCategory, setJeCategory] = useState<JournalEntry['category']>('Transfer');
  const [jeDebit, setJeDebit] = useState(state.accounts[0]?.code || defaultMoneyCode);
  const [jeCredit, setJeCredit] = useState(
    state.accounts.find((a) => a.code === '4010')?.code || state.accounts[0]?.code || '4010'
  );
  const [jeAmount, setJeAmount] = useState('');

  // Owner Customize Journal Modal
  const [editJeTarget, setEditJeTarget] = useState<JournalEntry | null>(null);
  const [ejDate, setEjDate] = useState('');
  const [ejRef, setEjRef] = useState('');
  const [ejDesc, setEjDesc] = useState('');
  const [ejCategory, setEjCategory] = useState<JournalEntry['category']>('Transfer');
  const [ejLines, setEjLines] = useState<JournalLine[]>([]);

  // Owner Customize Account & Balance Modal
  const [editAccTarget, setEditAccTarget] = useState<Account | null>(null);
  const [eaName, setEaName] = useState('');
  const [eaChannel, setEaChannel] = useState<MoneySourceChannel>('Other');
  const [eaWalletType, setEaWalletType] = useState('');
  const [eaChargePct, setEaChargePct] = useState('');
  const [eaChargeFlat, setEaChargeFlat] = useState('');
  const [eaActive, setEaActive] = useState(true);
  const [eaTargetBalance, setEaTargetBalance] = useState('');
  const [eaOffsetCode, setEaOffsetCode] = useState('3030');
  const [eaAdjDate, setEaAdjDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [eaAdjReason, setEaAdjReason] = useState('');

  const openCustomizeJournal = (je: JournalEntry) => {
    setEditJeTarget(je);
    setEjDate(toDateInputValue(je.date));
    setEjRef(je.reference);
    setEjDesc(je.description);
    setEjCategory(je.category);
    setEjLines(je.lines.map((l) => ({ ...l })));
  };

  const openCustomizeAccount = (acc: Account) => {
    setEditAccTarget(acc);
    setEaName(acc.name);
    setEaChannel(acc.channel || 'Other');
    setEaWalletType(acc.walletType || '');
    setEaChargePct(String(acc.cashOutChargePercent ?? ''));
    setEaChargeFlat(String(acc.cashOutChargeFlat ?? ''));
    setEaActive(acc.active !== false);
    setEaTargetBalance(String(acc.balance));
    const fallbackOffset =
      state.accounts.find((a) => a.code === '3040' && a.code !== acc.code)?.code ||
      state.accounts.find((a) => a.code === '3030' && a.code !== acc.code)?.code ||
      state.accounts.find((a) => a.code !== acc.code)?.code ||
      '3030';
    setEaOffsetCode(fallbackOffset);
    setEaAdjDate(new Date().toISOString().slice(0, 10));
    setEaAdjReason('');
  };

  // New Account
  const [newAccCode, setNewAccCode] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccType, setNewAccType] = useState<AccountType>('Asset');
  const [newAccChannel, setNewAccChannel] = useState<MoneySourceChannel>('E-Wallet');
  const [newAccWalletType, setNewAccWalletType] = useState('');
  const [newAccChargePct, setNewAccChargePct] = useState('');
  const [newAccChargeFlat, setNewAccChargeFlat] = useState('');

  const resolvedDrawAcc = cashBankAccounts.some((a) => a.code === drawAcc)
    ? drawAcc
    : defaultMoneyCode;
  const resolvedCashInAcc = cashBankAccounts.some((a) => a.code === cashInAcc)
    ? cashInAcc
    : secondMoneyCode;
  const resolvedXferFrom = cashBankAccounts.some((a) => a.code === xferFrom)
    ? xferFrom
    : defaultMoneyCode;
  const resolvedXferTo = cashBankAccounts.some((a) => a.code === xferTo)
    ? xferTo
    : secondMoneyCode;
  const resolvedSuddenAcc = cashBankAccounts.some((a) => a.code === suddenAcc)
    ? suddenAcc
    : defaultMoneyCode;

  const totalLiquidFunds = cashBankAccounts.reduce((s, a) => s + a.balance, 0);
  const suddenOffsetOptions = useMemo(() => {
    const preferredOrder = ['4090', '3010', '3030', '5080', '5090', '3020', '5050'];
    const nonMoney = state.accounts.filter(
      (a) => a.active !== false && a.code !== resolvedSuddenAcc
    );
    return [...nonMoney].sort((a, b) => {
      const ia = preferredOrder.indexOf(a.code);
      const ib = preferredOrder.indexOf(b.code);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.code.localeCompare(b.code);
    });
  }, [state.accounts, resolvedSuddenAcc]);

  const resolvedSuddenOffset = suddenOffsetOptions.some((a) => a.code === suddenOffsetCode)
    ? suddenOffsetCode
    : suddenOffsetOptions[0]?.code || '4090';

  const selectedSuddenAccountObj = cashBankAccounts.find((a) => a.code === resolvedSuddenAcc);
  const suddenParsedAmt = Number(suddenAmount) || 0;
  const suddenPreviewAfter =
    (selectedSuddenAccountObj?.balance || 0) +
    (suddenDirection === 'Add' ? suddenParsedAmt : -suddenParsedAmt);

  const recentSuddenJournals = useMemo(
    () => state.journalEntries.filter((j) => j.category === 'Sudden Adjustment').slice(0, 8),
    [state.journalEntries]
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Accrual Double-Entry Accounting
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Balanced debits &amp; credits, Owner Draw equity separation, Cash In classification, Financial Statements &amp; Reversals
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setSubTab('statements')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'statements' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Statements &amp; Trial Balance
          </button>
          <button
            onClick={() => setSubTab('journals')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'journals' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Journal &amp; Reversals ({state.journalEntries.length})
          </button>
          <button
            onClick={() => setSubTab('drawCashIn')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'drawCashIn' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Cash, Draw &amp; Sudden Adj.
          </button>
          <button
            onClick={() => setSubTab('coa')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'coa' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Chart of Accounts
          </button>
        </div>
      </div>

      {subTab === 'statements' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Profit & Loss Statement */}
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <div className="pb-3 border-b border-slate-200/70">
                <h2 className="text-base font-semibold text-slate-900">
                  Profit &amp; Loss Statement (Accrual)
                </h2>
                <p className="text-xs text-slate-500">
                  Owner Draw &amp; Loan inflows are strictly excluded from Operating P&amp;L
                </p>
              </div>

              <div className="space-y-2 text-xs">
                <p className="font-semibold text-slate-500">Operating Revenue</p>
                {statements.revenues.map((a) => (
                  <div key={a.code} className="flex justify-between">
                    <span className="text-slate-700">
                      {a.code} · {a.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatMoney(a.balance, sym)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200/70 font-semibold text-slate-900">
                  <span>Total Revenue</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(statements.totalRevenue, sym)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 text-xs pt-2">
                <p className="font-semibold text-slate-500">Operating Expenses</p>
                {statements.expenses.map((a) => (
                  <div key={a.code} className="flex justify-between">
                    <span className="text-slate-700">
                      {a.code} · {a.name}
                    </span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {formatMoney(a.balance, sym)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between pt-2 border-t border-slate-200/70 font-semibold text-slate-900">
                  <span>Total Operating Expenses</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(statements.totalExpense, sym)}
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-300 flex justify-between items-center text-sm font-semibold">
                <span className="text-slate-900">Net Operating Profit</span>
                <span
                  className={`font-mono tabular-nums ${
                    statements.netProfit >= 0 ? 'text-emerald-700' : 'text-red-600'
                  }`}
                >
                  {formatMoney(statements.netProfit, sym)}
                </span>
              </div>
            </div>

            {/* Balance Sheet */}
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <div className="pb-3 border-b border-slate-200/70 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-900">Balance Sheet</h2>
                  <p className="text-xs text-slate-500">Assets = Liabilities + Equity</p>
                </div>
                <span className="text-xs font-mono font-semibold text-emerald-700">
                  Diff: {formatMoney(statements.balanceSheetDiff, sym)}
                </span>
              </div>

              <div className="space-y-1.5 text-xs">
                <p className="font-semibold text-slate-500">Assets</p>
                {statements.assets.map((a) => (
                  <div key={a.code} className="flex justify-between">
                    <span className="text-slate-700">
                      {a.code} · {a.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(a.balance, sym)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-slate-200/70 font-semibold">
                  <span>Total Assets</span>
                  <span className="font-mono tabular-nums">{formatMoney(statements.totalAssets, sym)}</span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-2">
                <p className="font-semibold text-slate-500">Liabilities</p>
                {statements.liabilities.map((a) => (
                  <div key={a.code} className="flex justify-between">
                    <span className="text-slate-700">
                      {a.code} · {a.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(a.balance, sym)}</span>
                  </div>
                ))}
                <div className="flex justify-between pt-1.5 border-t border-slate-200/70 font-semibold">
                  <span>Total Liabilities</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(statements.totalLiabilities, sym)}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs pt-2">
                <p className="font-semibold text-slate-500">Equity (incl. Current Net Profit)</p>
                {statements.equityAccounts.map((a) => (
                  <div key={a.code} className="flex justify-between">
                    <span className="text-slate-700">
                      {a.code} · {a.name}
                    </span>
                    <span className="font-mono tabular-nums">{formatMoney(a.balance, sym)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-emerald-700">
                  <span>Current Period Net Profit</span>
                  <span className="font-mono tabular-nums">{formatMoney(statements.netProfit, sym)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-200/70 font-semibold">
                  <span>Total Liabilities + Equity</span>
                  <span className="font-mono tabular-nums">
                    {formatMoney(statements.totalLiabilities + statements.totalEquityWithProfit, sym)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Trial Balance */}
          <div className="liquid-glass rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-900 mb-3">Trial Balance</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse erp-table">
                <thead>
                  <tr className="border-b border-slate-200/80">
                    <th className="py-2 px-2">Code</th>
                    <th className="py-2 px-2">Account</th>
                    <th className="py-2 px-2">Type</th>
                    <th className="py-2 px-2 text-right">Debit</th>
                    <th className="py-2 px-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 tabular-nums">
                  {statements.trialBalance.map((row) => (
                    <tr key={row.code}>
                      <td className="py-2 font-mono text-slate-500">{row.code}</td>
                      <td className="py-2 font-medium text-slate-900">{row.name}</td>
                      <td className="py-2 text-slate-500">{row.type}</td>
                      <td className="py-2 text-right font-mono">
                        {row.debit > 0 ? formatMoney(row.debit, sym) : '—'}
                      </td>
                      <td className="py-2 text-right font-mono">
                        {row.credit > 0 ? formatMoney(row.credit, sym) : '—'}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td colSpan={3} className="py-2.5">
                      Trial Balance Totals
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {formatMoney(statements.trialDebitTotal, sym)}
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {formatMoney(statements.trialCreditTotal, sym)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'journals' && (
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const amt = Number(jeAmount);
              if (!jeDesc.trim() || Number.isNaN(amt) || amt <= 0 || jeDebit === jeCredit) return;
              onPostManualJournal({
                description: jeDesc.trim(),
                reference: jeRef.trim() || `MAN-${Date.now().toString().slice(-4)}`,
                category: jeCategory,
                debitCode: jeDebit,
                creditCode: jeCredit,
                amount: amt,
                date: jeDate,
              });
              setJeDesc('');
              setJeRef('');
              setJeAmount('');
            }}
            className="liquid-glass rounded-2xl p-6 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Entry Date</label>
                <input
                  type="date"
                  value={jeDate}
                  onChange={(e) => setJeDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Category</label>
                <select
                  value={jeCategory}
                  onChange={(e) => setJeCategory(e.target.value as JournalEntry['category'])}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {JOURNAL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Debit Account</label>
                <select
                  value={jeDebit}
                  onChange={(e) => setJeDebit(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] text-slate-500 mb-1">Credit Account</label>
                <select
                  value={jeCredit}
                  onChange={(e) => setJeCredit(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.accounts.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} · {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] text-slate-500 mb-1">Amount ({sym})</label>
                <input
                  type="number"
                  min={0.5}
                  step="0.5"
                  required
                  value={jeAmount}
                  onChange={(e) => setJeAmount(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-3">
                <input
                  value={jeRef}
                  onChange={(e) => setJeRef(e.target.value)}
                  placeholder="Reference (optional)"
                  className="w-full px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="md:col-span-9 flex gap-2">
                <input
                  required
                  value={jeDesc}
                  onChange={(e) => setJeDesc(e.target.value)}
                  placeholder="Journal narration / adjusting entry description..."
                  className="flex-1 min-w-0 px-2.5 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white whitespace-nowrap"
                >
                  Post Journal
                </button>
              </div>
            </div>
          </form>

          <div className="liquid-glass rounded-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900">
              General Journal (Posted Entries Are Corrected by Auditable Reversal Only)
            </h2>
            <div className="space-y-3">
              {state.journalEntries.map((je) => (
                <div key={je.id} className="p-4 rounded-xl bg-white/80 border border-slate-200/80">
                  <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200/60 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-slate-900">{je.id}</span>
                      <span>·</span>
                      <span className="font-semibold text-[#0071E3]">{je.category}</span>
                      <span>·</span>
                      <span className="font-mono text-slate-500">
                        {new Date(je.date).toLocaleDateString()}
                      </span>
                      <span>·</span>
                      <span className="text-slate-600">Ref: {je.reference}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {!je.reversedByEntryId && je.category !== 'Reversal' ? (
                        <button
                          onClick={() => onReverseJournal(je.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:text-amber-700 hover:border-amber-300"
                        >
                          <RotateCcw className="w-3 h-3" />
                          Reverse Entry
                        </button>
                      ) : (
                        <span className="text-[11px] font-medium text-slate-500">
                          {je.reversedByEntryId
                            ? `Reversed by ${je.reversedByEntryId}`
                            : `Reversal of ${je.reversesEntryId}`}
                        </span>
                      )}
                      {isOwner && onOwnerCustomizeJournal && (
                        <button
                          type="button"
                          onClick={() => openCustomizeJournal(je)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
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
                                  itemType: 'Posted Journal Entry',
                                  itemNameOrId: `${je.id} (${je.category})`,
                                  bodyText: `Permanently delete journal entry ${je.id} (${je.description}) and recalculate all account balances?`,
                                  accountingProtected: false,
                                  onConfirmDelete: () => onOwnerDeleteJournal(je.id),
                                })
                              : onRequestDelete({
                                  itemType: 'Posted Journal Entry',
                                  itemNameOrId: `${je.id} (${je.category})`,
                                  bodyText: `Journal entry ${je.id} (${je.description}) is posted to the double-entry General Ledger.`,
                                  linkedInfo:
                                    'Double-entry audit rules forbid plain deletion of posted journals. Post a balanced reversal entry instead.',
                                  accountingProtected: true,
                                  alternativeLabel:
                                    !je.reversedByEntryId && je.category !== 'Reversal'
                                      ? 'Reverse Entry Instead'
                                      : undefined,
                                  onAlternative:
                                    !je.reversedByEntryId && je.category !== 'Reversal'
                                      ? () => onReverseJournal(je.id)
                                      : undefined,
                                })
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title={
                            isOwner && onOwnerDeleteJournal
                              ? `Delete journal ${je.id} (Owner)`
                              : 'Journal entries are audit-protected'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs font-medium text-slate-800 mt-2">{je.description}</p>
                  <div className="mt-2 space-y-1 text-xs font-mono tabular-nums">
                    {je.lines.map((l, i) => (
                      <div key={i} className="flex justify-between text-slate-600">
                        <span className={l.credit > 0 ? 'pl-4' : ''}>
                          {l.accountCode} · {l.accountName}
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
      )}

      {subTab === 'drawCashIn' && (
        <div className="space-y-6">
          {/* Active Money Sources Live Liquidity Cards */}
          <div className="liquid-glass rounded-2xl p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#0071E3]" />
                <h2 className="text-sm font-semibold text-slate-900">
                  Live Money Sources (Cash, Bank &amp; E-Wallets)
                </h2>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-900">
                Total Liquid Funds: {formatMoney(totalLiquidFunds, sym)}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {cashBankAccounts.map((acc) => (
                <div
                  key={acc.code}
                  className="p-3 rounded-xl bg-white/85 border border-slate-200/80 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 truncate">{acc.name}</p>
                    <p className="text-[11px] font-mono text-slate-500">
                      {acc.code} · {acc.channel || 'Asset'}
                      {acc.channel === 'E-Wallet' && acc.walletType ? ` (${acc.walletType})` : ''}
                      {acc.channel === 'E-Wallet' && (acc.cashOutChargePercent || 0) > 0
                        ? ` · Fee ${acc.cashOutChargePercent}%`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      className={`text-sm font-mono font-semibold tabular-nums ${
                        acc.balance < 0 ? 'text-red-600' : 'text-[#0071E3]'
                      }`}
                    >
                      {formatMoney(acc.balance, sym)}
                    </span>
                    {isOwner && (onOwnerUpdateAccount || onOwnerAdjustAccountBalance) && (
                      <button
                        type="button"
                        onClick={() => openCustomizeAccount(acc)}
                        className="p-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                        title={`Customize or adjust ${acc.name} balance (Owner)`}
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sudden Add / Deduct Money Adjustment (Sheet of Accounts) */}
          {onPostSuddenAdjustment && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(suddenAmount);
                if (
                  !suddenReason.trim() ||
                  Number.isNaN(amt) ||
                  amt <= 0 ||
                  resolvedSuddenAcc === resolvedSuddenOffset
                ) {
                  return;
                }
                onPostSuddenAdjustment({
                  accountCode: resolvedSuddenAcc,
                  direction: suddenDirection,
                  amount: amt,
                  offsetAccountCode: resolvedSuddenOffset,
                  reason: suddenReason.trim(),
                  date: suddenDate,
                });
                setSuddenAmount('');
                setSuddenReason('');
              }}
              className="liquid-glass rounded-2xl p-6 space-y-4 border border-blue-200/70"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">
                    Sudden Add / Deduct Money (Sheet Adjustment)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immediately add or deduct funds from any Cash drawer, Bank account, or Wallet with a mandatory audit reason. Posts a balanced double-entry journal.
                  </p>
                </div>
                <div className="inline-flex p-1 rounded-xl bg-slate-200/70">
                  <button
                    type="button"
                    onClick={() => {
                      setSuddenDirection('Add');
                      if (suddenOffsetCode === '5080' || suddenOffsetCode === '5090') {
                        setSuddenOffsetCode('4090');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      suddenDirection === 'Add'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    Sudden Add (+)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSuddenDirection('Deduct');
                      if (suddenOffsetCode === '4090') {
                        setSuddenOffsetCode('5080');
                      }
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                      suddenDirection === 'Deduct'
                        ? 'bg-red-600 text-white shadow-xs'
                        : 'text-slate-600'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    Sudden Deduct (-)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Money Source (Cash / Bank / Wallet)
                  </label>
                  <select
                    value={resolvedSuddenAcc}
                    onChange={(e) => setSuddenAcc(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {cashBankAccounts.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.name} ({a.channel || 'Asset'}) · {formatMoney(a.balance, sym)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-3">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Reason Account in Sheet (Offset)
                  </label>
                  <select
                    value={resolvedSuddenOffset}
                    onChange={(e) => setSuddenOffsetCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {suddenOffsetOptions.map((a) => (
                      <option key={a.code} value={a.code}>
                        {a.code} · {a.name} ({a.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Amount ({sym})
                  </label>
                  <input
                    type="number"
                    required
                    min={0.01}
                    step="0.01"
                    value={suddenAmount}
                    onChange={(e) => setSuddenAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={suddenDate}
                    onChange={(e) => setSuddenDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>

                <div className="md:col-span-2">
                  <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200/80 text-[11px] tabular-nums">
                    <span className="text-slate-500 block">Balance Preview</span>
                    <span className="font-mono font-semibold text-slate-900">
                      {formatMoney(selectedSuddenAccountObj?.balance || 0, sym)} →{' '}
                      <span
                        className={
                          suddenDirection === 'Add' ? 'text-emerald-700' : 'text-red-600'
                        }
                      >
                        {formatMoney(suddenPreviewAfter, sym)}
                      </span>
                    </span>
                  </div>
                </div>
              </div>

              {selectedSuddenAccountObj?.channel === 'E-Wallet' &&
                ((selectedSuddenAccountObj.cashOutChargePercent || 0) > 0 ||
                  (selectedSuddenAccountObj.cashOutChargeFlat || 0) > 0) && (
                  <p className="text-[11px] text-slate-600">
                    Configured wallet cash-out fee ({selectedSuddenAccountObj.walletType || 'Wallet'}
                    ):{' '}
                    <span className="font-mono font-semibold">
                      {selectedSuddenAccountObj.cashOutChargePercent || 0}%
                      {(selectedSuddenAccountObj.cashOutChargeFlat || 0) > 0
                        ? ` + ${formatMoney(selectedSuddenAccountObj.cashOutChargeFlat || 0, sym)}`
                        : ''}
                    </span>
                    {suddenParsedAmt > 0 && (
                      <span>
                        {' '}
                        · Calculated fee on {formatMoney(suddenParsedAmt, sym)}:{' '}
                        <strong className="font-mono">
                          {formatMoney(calculateCashOutFee(selectedSuddenAccountObj, suddenParsedAmt), sym)}
                        </strong>
                      </span>
                    )}
                  </p>
                )}

              <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
                <input
                  required
                  value={suddenReason}
                  onChange={(e) => setSuddenReason(e.target.value)}
                  placeholder="Mandatory reason (e.g. wallet cash-out fee, drawer surplus found, bank fee, urgent cash adjustment)..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
                <button
                  type="submit"
                  className={`px-5 py-2 text-xs font-semibold rounded-xl text-white whitespace-nowrap ${
                    suddenDirection === 'Add'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-red-600 hover:bg-red-700'
                  }`}
                >
                  {suddenDirection === 'Add' ? 'Post Sudden Addition' : 'Post Sudden Deduction'}
                </button>
              </div>

              {recentSuddenJournals.length > 0 && (
                <div className="pt-3 border-t border-slate-200/70 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Recent Sudden Money Adjustments
                  </p>
                  <div className="divide-y divide-slate-200/60 text-xs">
                    {recentSuddenJournals.map((j) => {
                      const amt = j.lines.reduce((s, l) => s + l.debit, 0);
                      return (
                        <div key={j.id} className="py-1.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <span className="font-mono font-semibold text-slate-800 mr-2">
                              {j.id}
                            </span>
                            <span className="text-slate-700">{j.description}</span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 font-mono tabular-nums">
                            <span className="text-slate-500">
                              {new Date(j.date).toLocaleDateString()}
                            </span>
                            <span className="font-semibold text-slate-900">
                              {formatMoney(amt, sym)}
                            </span>
                            {isOwner && onOwnerCustomizeJournal && (
                              <button
                                type="button"
                                onClick={() => openCustomizeJournal(j)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-sans font-semibold rounded-md bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                                title="Customize sudden adjustment (Owner)"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Customize
                              </button>
                            )}
                            {isOwner && onOwnerDeleteJournal && onRequestDelete && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestDelete({
                                    itemType: 'Sudden Adjustment Entry',
                                    itemNameOrId: `${j.id} (${formatMoney(amt, sym)})`,
                                    bodyText: `Delete sudden adjustment ${j.id} (${j.description}) and recalculate ledger balances?`,
                                    accountingProtected: false,
                                    onConfirmDelete: () => onOwnerDeleteJournal(j.id),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                                title="Delete sudden adjustment (Owner)"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Owner Draw */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(drawAmount);
                if (Number.isNaN(amt) || amt <= 0) return;
                onPostOwnerDraw(
                  amt,
                  resolvedDrawAcc,
                  drawNote.trim() || 'Owner personal withdrawal',
                  drawDate
                );
                setDrawAmount('');
                setDrawNote('');
              }}
              className="liquid-glass rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-900">Owner Draw</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Reduces Cash/Bank/Wallet and Owner Equity (3020). Never treated as an operating expense.
                </p>
              </div>
              <select
                value={resolvedDrawAcc}
                onChange={(e) => setDrawAcc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    From: {a.name} ({formatMoney(a.balance, sym)})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  required
                  min={1}
                  value={drawAmount}
                  onChange={(e) => setDrawAmount(e.target.value)}
                  placeholder={`Amount (${sym})`}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
                <input
                  type="date"
                  value={drawDate}
                  onChange={(e) => setDrawDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <input
                value={drawNote}
                onChange={(e) => setDrawNote(e.target.value)}
                placeholder="Withdrawal note..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <button
                type="submit"
                className="w-full px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white"
              >
                Record Owner Draw
              </button>
            </form>

            {/* Cash In */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(cashInAmount);
                if (Number.isNaN(amt) || amt <= 0) return;
                onPostCashIn({
                  inflowType: cashInType,
                  amount: amt,
                  toAccountCode: resolvedCashInAcc,
                  note: cashInNote.trim() || cashInType,
                  date: cashInDate,
                });
                setCashInAmount('');
                setCashInNote('');
              }}
              className="liquid-glass rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-900">Cash In (Capital / Loan)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Classifies Owner Capital as Equity and Loans as Liability — never misclassified as Sales Revenue.
                </p>
              </div>
              <select
                value={cashInType}
                onChange={(e) =>
                  setCashInType(
                    e.target.value as 'Owner Capital' | 'Loan Received' | 'Other Inflow'
                  )
                }
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                <option value="Owner Capital">Owner Capital / Investment (Equity)</option>
                <option value="Loan Received">Business Loan Received (Liability)</option>
                <option value="Other Inflow">Other Non-Sales Inflow (Retained Earnings)</option>
              </select>
              <select
                value={resolvedCashInAcc}
                onChange={(e) => setCashInAcc(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    Into: {a.name} ({a.channel || 'Asset'})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  required
                  min={1}
                  value={cashInAmount}
                  onChange={(e) => setCashInAmount(e.target.value)}
                  placeholder={`Amount (${sym})`}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
                <input
                  type="date"
                  value={cashInDate}
                  onChange={(e) => setCashInDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <input
                value={cashInNote}
                onChange={(e) => setCashInNote(e.target.value)}
                placeholder="Source / lender details..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <button
                type="submit"
                className="w-full px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white"
              >
                Post Cash In
              </button>
            </form>

            {/* Cash / Bank / Wallet Transfer */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(xferAmount);
                if (Number.isNaN(amt) || amt <= 0 || resolvedXferFrom === resolvedXferTo) return;
                onPostTransfer(
                  resolvedXferFrom,
                  resolvedXferTo,
                  amt,
                  'Internal cash/bank/wallet account transfer',
                  xferDate
                );
                setXferAmount('');
              }}
              className="liquid-glass rounded-2xl p-6 space-y-4"
            >
              <div>
                <h3 className="text-base font-semibold text-slate-900">Account Transfer</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Move funds between Cash, Bank accounts, and Wallets with a balanced ledger entry.
                </p>
              </div>
              <select
                value={resolvedXferFrom}
                onChange={(e) => setXferFrom(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    From: {a.name} ({formatMoney(a.balance, sym)})
                  </option>
                ))}
              </select>
              <select
                value={resolvedXferTo}
                onChange={(e) => setXferTo(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                {cashBankAccounts.map((a) => (
                  <option key={a.code} value={a.code}>
                    To: {a.name} ({a.channel || 'Asset'})
                  </option>
                ))}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="number"
                  required
                  min={1}
                  value={xferAmount}
                  onChange={(e) => setXferAmount(e.target.value)}
                  placeholder={`Amount (${sym})`}
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
                <input
                  type="date"
                  value={xferDate}
                  onChange={(e) => setXferDate(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              {(() => {
                const fromObj = cashBankAccounts.find((a) => a.code === resolvedXferFrom);
                const xferParsed = Number(xferAmount) || 0;
                const estFee = calculateCashOutFee(fromObj, xferParsed);
                if (!fromObj || fromObj.channel !== 'E-Wallet' || ((fromObj.cashOutChargePercent || 0) <= 0 && (fromObj.cashOutChargeFlat || 0) <= 0)) {
                  return null;
                }
                return (
                  <p className="text-[11px] text-slate-600">
                    Wallet withdrawal fee ({fromObj.cashOutChargePercent || 0}%):{' '}
                    <span className="font-mono font-semibold">{formatMoney(estFee, sym)}</span>
                  </p>
                );
              })()}
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Transfer Funds
              </button>
            </form>
          </div>
        </div>
      )}

      {subTab === 'coa' && (
        <div className="space-y-6">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newAccCode.trim() || !newAccName.trim()) return;
              onAddAccount(
                newAccCode.trim(),
                newAccName.trim(),
                newAccType,
                newAccType === 'Asset' ? newAccChannel : undefined,
                newAccType === 'Asset' && newAccChannel === 'E-Wallet'
                  ? {
                      walletType: newAccWalletType.trim() || undefined,
                      cashOutChargePercent: Math.max(0, Number(newAccChargePct) || 0),
                      cashOutChargeFlat: Math.max(0, Number(newAccChargeFlat) || 0),
                    }
                  : undefined
              );
              setNewAccCode('');
              setNewAccName('');
              setNewAccWalletType('');
              setNewAccChargePct('');
              setNewAccChargeFlat('');
            }}
            className="liquid-glass rounded-2xl p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-slate-800">
                Add Custom Account or Payment Method (Cash / Bank / Wallet)
              </span>
              <button
                type="button"
                onClick={() => {
                  setNewAccType('Asset');
                  setNewAccCode(generateNextMoneyAccountCode(state.accounts));
                }}
                className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-blue-50 text-[#0071E3] hover:bg-blue-100"
              >
                + Auto-Fill Next Money Code (10xx)
              </button>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <input
                required
                value={newAccCode}
                onChange={(e) => setNewAccCode(e.target.value)}
                placeholder="Code (e.g. 1035 or 5060)"
                className="w-40 px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
              />
              <input
                required
                value={newAccName}
                onChange={(e) => setNewAccName(e.target.value)}
                placeholder="Account name..."
                className="flex-1 min-w-[200px] px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <select
                value={newAccType}
                onChange={(e) => setNewAccType(e.target.value as AccountType)}
                className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              >
                <option value="Asset">Asset</option>
                <option value="Liability">Liability</option>
                <option value="Equity">Equity</option>
                <option value="Revenue">Revenue</option>
                <option value="Expense">Expense</option>
              </select>
              {newAccType === 'Asset' && (
                <select
                  value={newAccChannel}
                  onChange={(e) => setNewAccChannel(e.target.value as MoneySourceChannel)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  <option value="Cash">Channel: Cash</option>
                  <option value="Bank">Channel: Bank</option>
                  <option value="E-Wallet">Channel: Wallet</option>
                  <option value="Other">Non-Cash Asset</option>
                </select>
              )}
              {newAccType === 'Asset' && newAccChannel === 'E-Wallet' && (
                <>
                  <input
                    value={newAccWalletType}
                    onChange={(e) => setNewAccWalletType(e.target.value)}
                    placeholder="Wallet type..."
                    className="w-36 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newAccChargePct}
                    onChange={(e) => setNewAccChargePct(e.target.value)}
                    placeholder="Cash-out %"
                    className="w-24 px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={newAccChargeFlat}
                    onChange={(e) => setNewAccChargeFlat(e.target.value)}
                    placeholder={`Flat ${sym}`}
                    className="w-24 px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </>
              )}
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Account
              </button>
            </div>
          </form>

          <div className="liquid-glass rounded-2xl overflow-hidden">
            <table className="w-full text-left text-xs border-collapse erp-table">
              <thead>
                <tr className="border-b border-slate-200/80 font-semibold">
                  <th className="py-3 px-4">Code</th>
                  <th className="py-3 px-4">Account Name</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4 text-right">Current Balance</th>
                  {(onRequestDelete || (isOwner && (onOwnerUpdateAccount || onOwnerAdjustAccountBalance))) && (
                    <th className="py-3 px-4 text-right">Action</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 tabular-nums">
                {state.accounts.map((acc: Account) => {
                  const hasJournals = state.journalEntries.some((j) =>
                    j.lines.some((l) => l.accountCode === acc.code)
                  );
                  const isZeroBalance = Math.abs(acc.balance) < 0.009;
                  const canHardDelete = !hasJournals && isZeroBalance && Boolean(onDeleteAccount);
                  const isCoreSystem = [
                    '1100',
                    '1110',
                    '1200',
                    '2010',
                    '2100',
                    '3010',
                    '3020',
                    '3030',
                    '4010',
                    '4020',
                  ].includes(acc.code);
                  return (
                    <tr key={acc.code} className={acc.active === false ? 'opacity-60' : ''}>
                      <td className="py-2.5 px-4 font-mono text-slate-500">{acc.code}</td>
                      <td className="py-2.5 px-4 font-medium text-slate-900">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                          <span>{acc.name}</span>
                          {acc.channel && acc.channel !== 'Other' && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-[#0071E3] font-medium">
                              {acc.channel}
                            </span>
                          )}
                          {acc.active === false && (
                            <span className="px-1.5 py-0.5 text-[10px] rounded bg-slate-200 text-slate-600 font-medium">
                              Inactive
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-slate-600">{acc.type}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-semibold text-slate-900">
                        {formatMoney(acc.balance, sym)}
                      </td>
                      {(onRequestDelete || (isOwner && (onOwnerUpdateAccount || onOwnerAdjustAccountBalance))) && (
                        <td className="py-2.5 px-4 text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {isOwner && (onOwnerUpdateAccount || onOwnerAdjustAccountBalance) && (
                              <button
                                type="button"
                                onClick={() => openCustomizeAccount(acc)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100"
                                title="Customize account or adjust balance (Owner)"
                              >
                                <SlidersHorizontal className="w-3 h-3" />
                                Customize
                              </button>
                            )}
                            {onRequestDelete && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestDelete({
                                    itemType: 'Chart of Accounts Entry',
                                    itemNameOrId: `${acc.code} · ${acc.name}`,
                                    bodyText: canHardDelete
                                      ? `Delete unused account "${acc.code} · ${acc.name}"? It has zero balance and no journal history.`
                                      : `Ledger account ${acc.code} (${acc.name}) has balance ${formatMoney(acc.balance, sym)} or historical journal entries.`,
                                    linkedInfo: canHardDelete
                                      ? undefined
                                      : 'Accounts with ledger history stay protected to keep Trial Balance & historical journals accurate. You can deactivate non-core payment accounts to hide them from new forms.',
                                    accountingProtected: !canHardDelete,
                                    onConfirmDelete: canHardDelete
                                      ? () => onDeleteAccount?.(acc.code)
                                      : undefined,
                                    alternativeLabel:
                                      !canHardDelete &&
                                      !isCoreSystem &&
                                      acc.active !== false &&
                                      onDeactivateAccount
                                        ? 'Deactivate Payment Account'
                                        : undefined,
                                    onAlternative:
                                      !canHardDelete &&
                                      !isCoreSystem &&
                                      acc.active !== false &&
                                      onDeactivateAccount
                                        ? () => onDeactivateAccount(acc.code)
                                        : undefined,
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                                title={
                                  canHardDelete
                                    ? 'Delete unused account'
                                    : 'Deactivate or inspect ledger protection'
                                }
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
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

      {/* Owner Customize Journal Entry Modal */}
      {isOwner && editJeTarget && onOwnerCustomizeJournal && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
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
                  Customize Journal Entry · {editJeTarget.id}
                </h3>
                <p className="text-slate-500">
                  Edit date, category, reference, narration, and balanced debit/credit lines (Owner)
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
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Journal Date
                </label>
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
                  {JOURNAL_CATEGORIES.concat(['Reversal', 'Opening Balance']).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Reference
                </label>
                <input
                  value={ejRef}
                  onChange={(e) => setEjRef(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Description / Narration
              </label>
              <input
                required
                value={ejDesc}
                onChange={(e) => setEjDesc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-700">Debit &amp; Credit Lines</span>
                <button
                  type="button"
                  onClick={() => {
                    const fallbackAcc = state.accounts[0];
                    setEjLines((prev) => [
                      ...prev,
                      {
                        accountCode: fallbackAcc?.code || '1010',
                        accountName: fallbackAcc?.name || 'Cash in Hand',
                        debit: 0,
                        credit: 0,
                      },
                    ]);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 font-medium"
                >
                  <Plus className="w-3 h-3" />
                  Add Line
                </button>
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
                      placeholder="Debit"
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
                      placeholder="Credit"
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
              {(() => {
                const totalDr = ejLines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
                const totalCr = ejLines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
                const diff = Number((totalDr - totalCr).toFixed(2));
                const balanced = Math.abs(diff) <= 0.01 && totalDr > 0;
                return (
                  <div
                    className={`p-2.5 rounded-xl flex flex-wrap items-center justify-between font-mono text-xs ${
                      balanced
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : 'bg-red-50 text-red-700 border border-red-200'
                    }`}
                  >
                    <span>
                      Dr: {formatMoney(totalDr, sym)} | Cr: {formatMoney(totalCr, sym)}
                    </span>
                    <span className="font-semibold">
                      {balanced ? 'Balanced' : `Out of balance by ${formatMoney(Math.abs(diff), sym)}`}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
              {onOwnerDeleteJournal ? (
                <button
                  type="button"
                  onClick={() => {
                    const id = editJeTarget.id;
                    setEditJeTarget(null);
                    onOwnerDeleteJournal(id);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Journal
                </button>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-2">
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
                  Save Journal Changes
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Owner Customize Account & Adjust Balance Modal */}
      {isOwner && editAccTarget && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-slate-900/45 backdrop-blur-xs overflow-y-auto"
          onClick={() => setEditAccTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl my-6 rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-5 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Account · {editAccTarget.code} ({editAccTarget.type})
                </h3>
                <p className="text-slate-500">
                  Current Ledger Balance:{' '}
                  <strong className="font-mono text-slate-900">
                    {formatMoney(editAccTarget.balance, sym)}
                  </strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditAccTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {onOwnerUpdateAccount && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  onOwnerUpdateAccount(editAccTarget.code, {
                    name: eaName.trim() || editAccTarget.name,
                    channel: editAccTarget.type === 'Asset' ? eaChannel : undefined,
                    walletType:
                      editAccTarget.type === 'Asset' && eaChannel === 'E-Wallet'
                        ? eaWalletType.trim()
                        : undefined,
                    cashOutChargePercent:
                      editAccTarget.type === 'Asset' && eaChannel === 'E-Wallet'
                        ? Math.max(0, Number(eaChargePct) || 0)
                        : undefined,
                    cashOutChargeFlat:
                      editAccTarget.type === 'Asset' && eaChannel === 'E-Wallet'
                        ? Math.max(0, Number(eaChargeFlat) || 0)
                        : undefined,
                    active: eaActive,
                  });
                  setEditAccTarget(null);
                }}
                className="space-y-3 pb-4 border-b border-slate-200"
              >
                <p className="font-semibold text-slate-800">Account Profile &amp; Settings</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">Account Name</label>
                    <input
                      required
                      value={eaName}
                      onChange={(e) => setEaName(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  {editAccTarget.type === 'Asset' && (
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Channel</label>
                      <select
                        value={eaChannel}
                        onChange={(e) => setEaChannel(e.target.value as MoneySourceChannel)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                      >
                        <option value="Cash">Cash</option>
                        <option value="Bank">Bank</option>
                        <option value="E-Wallet">E-Wallet</option>
                        <option value="Other">Non-Cash Asset</option>
                      </select>
                    </div>
                  )}
                </div>

                {editAccTarget.type === 'Asset' && eaChannel === 'E-Wallet' && (
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Wallet Type</label>
                      <input
                        value={eaWalletType}
                        onChange={(e) => setEaWalletType(e.target.value)}
                        placeholder="Merchant / Personal"
                        className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Cash-out %</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={eaChargePct}
                        onChange={(e) => setEaChargePct(e.target.value)}
                        className="w-full px-2.5 py-1.5 font-mono rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-slate-500 mb-1">Flat Fee ({sym})</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={eaChargeFlat}
                        onChange={(e) => setEaChargeFlat(e.target.value)}
                        className="w-full px-2.5 py-1.5 font-mono rounded-xl border border-slate-200 bg-white"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-1">
                  <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={eaActive}
                      onChange={(e) => setEaActive(e.target.checked)}
                    />
                    Active in selection dropdowns
                  </label>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold"
                  >
                    Save Account Info
                  </button>
                </div>
              </form>
            )}

            {onOwnerAdjustAccountBalance && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const target = Number(eaTargetBalance);
                  if (Number.isNaN(target) || eaOffsetCode === editAccTarget.code) return;
                  onOwnerAdjustAccountBalance({
                    accountCode: editAccTarget.code,
                    targetBalance: target,
                    offsetAccountCode: eaOffsetCode,
                    date: eaAdjDate,
                    reason: eaAdjReason.trim() || 'Owner direct balance adjustment',
                  });
                  setEditAccTarget(null);
                }}
                className="space-y-3"
              >
                <div>
                  <p className="font-semibold text-slate-800">
                    Adjust Account Balance Anytime (Balanced Entry)
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Sets {editAccTarget.code} · {editAccTarget.name} to the exact target balance via a balanced adjusting journal.
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Target Balance ({sym})
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={eaTargetBalance}
                      onChange={(e) => setEaTargetBalance(e.target.value)}
                      className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Adjustment Date
                    </label>
                    <input
                      type="date"
                      required
                      value={eaAdjDate}
                      onChange={(e) => setEaAdjDate(e.target.value)}
                      className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-500 mb-1">
                      Offset Account
                    </label>
                    <select
                      value={eaOffsetCode}
                      onChange={(e) => setEaOffsetCode(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                    >
                      {state.accounts
                        .filter((a) => a.code !== editAccTarget.code)
                        .map((a) => (
                          <option key={a.code} value={a.code}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                  <input
                    value={eaAdjReason}
                    onChange={(e) => setEaAdjReason(e.target.value)}
                    placeholder="Reason for balance adjustment..."
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-[#0071E3] text-white font-semibold whitespace-nowrap"
                  >
                    Apply Target Balance
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

import {
  Account,
  AccountType,
  BlackBoxEvent,
  JournalEntry,
  JournalLine,
  MoneySourceChannel,
  PaymentSplit,
  UserRole,
} from '../types/erp';

export function formatMoney(amount: number, symbol = 'Tk'): string {
  const abs = Math.abs(amount);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return amount < 0 ? `-${symbol} ${formatted}` : `${symbol} ${formatted}`;
}

export function inferMoneyChannel(name: string, fallback?: MoneySourceChannel): MoneySourceChannel {
  const n = name.toLowerCase();
  if (
    n.includes('bkash') ||
    n.includes('nagad') ||
    n.includes('rocket') ||
    n.includes('upay') ||
    n.includes('wallet') ||
    n.includes('mobile') ||
    n.includes('mfs') ||
    n.includes('cellfin') ||
    n.includes('tap')
  ) {
    return 'E-Wallet';
  }
  if (n.includes('cash') || n.includes('drawer') || n.includes('petty') || n.includes('till')) {
    return 'Cash';
  }
  if (
    n.includes('bank') ||
    n.includes('brac') ||
    n.includes('city') ||
    n.includes('dbbl') ||
    n.includes('islami') ||
    n.includes('prime') ||
    n.includes('ebl') ||
    n.includes('card') ||
    n.includes('pos')
  ) {
    return 'Bank';
  }
  return fallback || 'Other';
}

export function isMoneySourceAccount(acc: Account): boolean {
  if (acc.type !== 'Asset' || acc.active === false) return false;
  return acc.code.startsWith('10') || acc.channel !== undefined;
}

export function getMoneySourceAccounts(accounts: Account[]): Account[] {
  return accounts
    .filter(isMoneySourceAccount)
    .sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
}

export function generateNextMoneyAccountCode(
  accounts: Account[],
  extraCodes: string[] = []
): string {
  const used = new Set([
    ...accounts.map((a) => a.code.trim()),
    ...extraCodes.map((c) => c.trim()),
  ]);
  let candidate = 1031;
  while (used.has(String(candidate))) {
    candidate += 1;
  }
  return String(candidate);
}

export function calculateCashOutFee(account: Account | undefined, amount: number): number {
  if (!account || amount <= 0) return 0;
  const pct = Number(account.cashOutChargePercent) || 0;
  const flat = Number(account.cashOutChargeFlat) || 0;
  if (pct <= 0 && flat <= 0) return 0;
  return Number(((amount * pct) / 100 + flat).toFixed(2));
}

export function normalizePaymentSplits(params: {
  accounts: Account[];
  paymentSplits?: Array<{ accountCode: string; amount: number }>;
  fallbackAccountCode?: string;
  fallbackAmount?: number;
  capTotal?: number;
}): PaymentSplit[] {
  const moneyAccounts = getMoneySourceAccounts(params.accounts);
  const rawList =
    params.paymentSplits && params.paymentSplits.length > 0
      ? params.paymentSplits
      : params.fallbackAccountCode && (params.fallbackAmount || 0) > 0
      ? [{ accountCode: params.fallbackAccountCode, amount: params.fallbackAmount || 0 }]
      : [];

  const merged = new Map<string, number>();
  for (const row of rawList) {
    const amt = Number(row.amount);
    if (Number.isNaN(amt) || amt <= 0) continue;
    const acc =
      params.accounts.find((a) => a.code === row.accountCode) ||
      moneyAccounts[0];
    if (!acc) continue;
    merged.set(acc.code, Number(((merged.get(acc.code) || 0) + amt).toFixed(2)));
  }

  let result: PaymentSplit[] = Array.from(merged.entries()).map(([code, amount]) => {
    const acc = params.accounts.find((a) => a.code === code);
    return {
      accountCode: code,
      accountName: acc?.name || code,
      amount,
    };
  });

  if (typeof params.capTotal === 'number' && params.capTotal >= 0) {
    let remaining = Number(params.capTotal.toFixed(2));
    const capped: PaymentSplit[] = [];
    for (const item of result) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, item.amount);
      if (take > 0) {
        capped.push({ ...item, amount: Number(take.toFixed(2)) });
        remaining = Number((remaining - take).toFixed(2));
      }
    }
    result = capped;
  }

  return result;
}

export function isDebitNormal(type: AccountType): boolean {
  return type === 'Asset' || type === 'Expense';
}

export function applyJournalToAccounts(accounts: Account[], entry: JournalEntry): Account[] {
  const totalDebit = entry.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.009) {
    throw new Error(`Unbalanced journal entry ${entry.id}: Debit ${totalDebit} != Credit ${totalCredit}`);
  }

  return accounts.map((acc) => {
    const matching = entry.lines.filter((l) => l.accountCode === acc.code);
    if (matching.length === 0) return acc;

    let delta = 0;
    for (const line of matching) {
      if (isDebitNormal(acc.type)) {
        delta += line.debit - line.credit;
      } else {
        delta += line.credit - line.debit;
      }
    }
    return {
      ...acc,
      balance: Number((acc.balance + delta).toFixed(2)),
    };
  });
}

export function recalculateAccountBalancesFromJournals(
  accounts: Account[],
  journalEntries: JournalEntry[]
): Account[] {
  const balances = new Map<string, number>();
  for (const acc of accounts) {
    balances.set(acc.code, 0);
  }
  const typeMap = new Map<string, AccountType>(accounts.map((a) => [a.code, a.type]));
  for (const entry of journalEntries) {
    for (const line of entry.lines) {
      const accType = typeMap.get(line.accountCode);
      if (!accType) continue;
      const cur = balances.get(line.accountCode) || 0;
      const delta = isDebitNormal(accType)
        ? line.debit - line.credit
        : line.credit - line.debit;
      balances.set(line.accountCode, Number((cur + delta).toFixed(2)));
    }
  }
  return accounts.map((acc) => ({
    ...acc,
    balance: balances.get(acc.code) ?? 0,
  }));
}

export function toDateInputValue(isoStr?: string): string {
  if (!isoStr) return new Date().toISOString().slice(0, 10);
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function dateInputToIso(dateStr?: string, fallbackIso?: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return fallbackIso || new Date().toISOString();
  }
  return `${dateStr}T12:00:00.000Z`;
}

export function buildJournalEntry(params: {
  id: string;
  date: string;
  reference: string;
  description: string;
  category: JournalEntry['category'];
  lines: JournalLine[];
  createdBy: string;
  reversesEntryId?: string;
}): JournalEntry {
  const totalDebit = Number(params.lines.reduce((s, l) => s + l.debit, 0).toFixed(2));
  const totalCredit = Number(params.lines.reduce((s, l) => s + l.credit, 0).toFixed(2));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Journal entry must balance. Debit (${totalDebit}) != Credit (${totalCredit})`);
  }
  return {
    id: params.id,
    date: params.date,
    reference: params.reference,
    description: params.description,
    category: params.category,
    lines: params.lines.map((l) => ({
      ...l,
      debit: Number(l.debit.toFixed(2)),
      credit: Number(l.credit.toFixed(2)),
    })),
    createdBy: params.createdBy,
    reversesEntryId: params.reversesEntryId,
  };
}

export function computeSimpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0; i < input.length; i++) {
    const ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).toUpperCase();
  return combined.padStart(12, '0');
}

export function createBlackBoxEvent(
  prevEvents: BlackBoxEvent[],
  params: {
    user: string;
    role: UserRole;
    action: string;
    module: string;
    recordId: string;
    summary: string;
    beforeValue?: unknown;
    afterValue?: unknown;
  }
): BlackBoxEvent {
  const prevHash = prevEvents.length > 0 ? prevEvents[0].integrityHash : 'GENESIS00000';
  const timestamp = new Date().toISOString();
  const id = `BB-${String(prevEvents.length + 1001)}`;
  const payload = `${prevHash}|${id}|${timestamp}|${params.user}|${params.action}|${params.recordId}|${params.summary}`;
  return {
    id,
    timestamp,
    user: params.user,
    role: params.role,
    action: params.action,
    module: params.module,
    recordId: params.recordId,
    summary: params.summary,
    beforeValue: params.beforeValue,
    afterValue: params.afterValue,
    integrityHash: computeSimpleHash(payload),
  };
}

export function computeFinancialStatements(accounts: Account[]) {
  const assets = accounts.filter((a) => a.type === 'Asset');
  const liabilities = accounts.filter((a) => a.type === 'Liability');
  const equityAccounts = accounts.filter((a) => a.type === 'Equity');
  const revenues = accounts.filter((a) => a.type === 'Revenue');
  const expenses = accounts.filter((a) => a.type === 'Expense');

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0);
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0);
  const totalRevenue = revenues.reduce((s, a) => s + a.balance, 0);
  const totalExpense = expenses.reduce((s, a) => s + a.balance, 0);
  const netProfit = totalRevenue - totalExpense;
  const totalEquityBase = equityAccounts.reduce((s, a) => s + a.balance, 0);
  const totalEquityWithProfit = totalEquityBase + netProfit;

  const trialBalance = accounts.map((a) => {
    const debitNormal = isDebitNormal(a.type);
    const debit = debitNormal
      ? a.balance >= 0
        ? a.balance
        : 0
      : a.balance < 0
      ? Math.abs(a.balance)
      : 0;
    const credit = !debitNormal
      ? a.balance >= 0
        ? a.balance
        : 0
      : a.balance < 0
      ? Math.abs(a.balance)
      : 0;
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      debit: Number(debit.toFixed(2)),
      credit: Number(credit.toFixed(2)),
    };
  });

  const trialDebitTotal = trialBalance.reduce((s, r) => s + r.debit, 0);
  const trialCreditTotal = trialBalance.reduce((s, r) => s + r.credit, 0);

  return {
    assets,
    liabilities,
    equityAccounts,
    revenues,
    expenses,
    totalAssets: Number(totalAssets.toFixed(2)),
    totalLiabilities: Number(totalLiabilities.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    totalExpense: Number(totalExpense.toFixed(2)),
    netProfit: Number(netProfit.toFixed(2)),
    totalEquityWithProfit: Number(totalEquityWithProfit.toFixed(2)),
    balanceSheetDiff: Number((totalAssets - (totalLiabilities + totalEquityWithProfit)).toFixed(2)),
    trialBalance,
    trialDebitTotal: Number(trialDebitTotal.toFixed(2)),
    trialCreditTotal: Number(trialCreditTotal.toFixed(2)),
  };
}

import { useMemo, useState } from 'react';
import { ArrowUpRight, BarChart3, BookOpen, Download, Scale, Wallet } from 'lucide-react';
import { ErpState, NavSection } from '../types/erp';
import {
  computeFinancialStatements,
  formatMoney,
  getMoneySourceAccounts,
} from '../utils/accounting';

interface ReportsViewProps {
  state: ErpState;
  canAccessBlackBox?: boolean;
  canExportReports?: boolean;
  onNavigate?: (
    section: NavSection,
    options?: { accountingTab?: 'statements' | 'journals' | 'drawCashIn' | 'coa' }
  ) => void;
}

type ReportGroup =
  | 'Financial'
  | 'Customer'
  | 'Corporate'
  | 'Inventory'
  | 'Operations'
  | 'Staff'
  | 'Audit';

export function ReportsView({
  state,
  canAccessBlackBox = false,
  canExportReports = true,
  onNavigate,
}: ReportsViewProps) {
  const sym = state.settings.currencySymbol;
  const [group, setGroup] = useState<ReportGroup>('Financial');
  const [rangePreset, setRangePreset] = useState<'Daily' | 'Weekly' | 'Monthly' | 'Yearly' | 'All'>(
    'Monthly'
  );
  const [fromDate, setFromDate] = useState(() =>
    new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  );
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));

  const statements = computeFinancialStatements(state.accounts);

  const inRange = (iso: string) => {
    if (rangePreset === 'All') return true;
    const d = iso.slice(0, 10);
    return d >= fromDate && d <= toDate;
  };

  const applyPreset = (preset: typeof rangePreset) => {
    setRangePreset(preset);
    const today = new Date();
    const toStr = today.toISOString().slice(0, 10);
    setToDate(toStr);
    if (preset === 'Daily') setFromDate(toStr);
    else if (preset === 'Weekly') setFromDate(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
    else if (preset === 'Monthly') setFromDate(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
    else if (preset === 'Yearly') setFromDate(new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10));
  };

  const exportCsv = (filename: string, headers: string[], rows: Array<Array<string | number>>) => {
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const revenueBreakdown = useMemo(() => {
    const maxVal = Math.max(1, ...statements.revenues.map((r) => r.balance));
    return statements.revenues.map((r) => ({
      label: r.name,
      value: r.balance,
      pct: Math.round((r.balance / maxVal) * 100),
    }));
  }, [statements.revenues]);

  const expenseBreakdown = useMemo(() => {
    const maxVal = Math.max(1, ...statements.expenses.map((e) => e.balance));
    return statements.expenses.map((e) => ({
      label: e.name,
      value: e.balance,
      pct: Math.round((e.balance / maxVal) * 100),
    }));
  }, [statements.expenses]);

  const filteredOrders = state.orders.filter((o) => !o.isOpening && inRange(o.createdAt));
  const filteredAudit = canAccessBlackBox ? state.blackBox.filter((b) => inRange(b.timestamp)) : [];

  const moneySourceReport = useMemo(() => {
    const moneyAccounts = getMoneySourceAccounts(state.accounts);
    const inRangeJournals = state.journalEntries.filter((j) => inRange(j.date));
    return moneyAccounts.map((acc) => {
      let inflow = 0;
      let outflow = 0;
      for (const je of inRangeJournals) {
        for (const line of je.lines) {
          if (line.accountCode !== acc.code) continue;
          inflow += line.debit;
          outflow += line.credit;
        }
      }
      return {
        ...acc,
        inflow: Number(inflow.toFixed(2)),
        outflow: Number(outflow.toFixed(2)),
        netFlow: Number((inflow - outflow).toFixed(2)),
      };
    });
  }, [state.accounts, state.journalEntries, rangePreset, fromDate, toDate]);

  const suddenAdjustmentsInRange = useMemo(
    () =>
      state.journalEntries.filter(
        (j) => j.category === 'Sudden Adjustment' && inRange(j.date)
      ),
    [state.journalEntries, rangePreset, fromDate, toDate]
  );

  const groups: ReportGroup[] = canAccessBlackBox
    ? ['Financial', 'Customer', 'Corporate', 'Inventory', 'Operations', 'Staff', 'Audit']
    : ['Financial', 'Customer', 'Corporate', 'Inventory', 'Operations', 'Staff'];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Reports &amp; Business Analytics
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Date-based financial, customer, corporate, inventory, operations, and staff analytics
          </p>
        </div>

        {canExportReports && (
          <button
            onClick={() => {
              if (group === 'Financial') {
                exportCsv(
                  'financial-trial-balance.csv',
                  ['Code', 'Account', 'Type', 'Debit', 'Credit'],
                  statements.trialBalance.map((t) => [t.code, t.name, t.type, t.debit, t.credit])
                );
              } else if (group === 'Customer') {
                exportCsv(
                  'customer-balances.csv',
                  ['ID', 'Name', 'Phone', 'Outstanding', 'Advance'],
                  state.customers.map((c) => [c.id, c.name, c.phone, c.outstandingBalance, c.advanceBalance])
                );
              } else if (group === 'Inventory') {
                exportCsv(
                  'chemical-inventory.csv',
                  ['ID', 'Name', 'Qty', 'Unit', 'Cost', 'Valuation'],
                  state.chemicals.map((c) => [
                    c.id,
                    c.name,
                    c.currentQty,
                    c.unit,
                    c.purchaseCost,
                    c.currentQty * c.purchaseCost,
                  ])
                );
              } else {
                exportCsv(
                  'operations-orders.csv',
                  ['Order ID', 'Customer', 'Stage', 'Total', 'Paid'],
                  filteredOrders.map((o) => [o.id, o.customerName, o.stage, o.totalAmount, o.paidAmount])
                );
              }
            }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3] self-start sm:self-auto"
          >
            <Download className="w-3.5 h-3.5" />
            Export {group} CSV
          </button>
        )}
      </div>

      {/* Controls: Report Group + Date Presets */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          {groups.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                group === g ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {g}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {(['Daily', 'Weekly', 'Monthly', 'Yearly', 'All'] as const).map((p) => (
            <button
              key={p}
              onClick={() => applyPreset(p)}
              className={`px-2.5 py-1.5 rounded-lg border transition-colors ${
                rangePreset === p
                  ? 'bg-[#0071E3] border-[#0071E3] text-white'
                  : 'bg-white border-slate-200 text-slate-600'
              }`}
            >
              {p}
            </button>
          ))}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setRangePreset('All');
              setFromDate(e.target.value);
            }}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setRangePreset('All');
              setToDate(e.target.value);
            }}
            className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-mono"
          />
        </div>
      </div>

      {/* Cross-Module Money Management Navigation Bar */}
      {onNavigate && (
        <div className="liquid-glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <Wallet className="w-4 h-4 text-[#0071E3]" />
            <span className="font-medium text-slate-800">Money Management Hub:</span>
            <span>Synced live with Accounting, Charts &amp; Opening Balances</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('accounting', { accountingTab: 'statements' })}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Accounting Ledger
            </button>
            <button
              type="button"
              onClick={() => onNavigate('accounting', { accountingTab: 'drawCashIn' })}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-50 border border-blue-200 text-[#0071E3] hover:bg-blue-100"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Sudden Add / Deduct
            </button>
            <button
              type="button"
              onClick={() => onNavigate('analytics')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Analytics Charts
            </button>
            <button
              type="button"
              onClick={() => onNavigate('opening-balance')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
            >
              <Scale className="w-3.5 h-3.5" />
              Opening Balance
            </button>
          </div>
        </div>
      )}

      {group === 'Financial' && (
        <div className="space-y-6">
          {/* Money Sources & Payment Channels Ledger Summary */}
          <div className="liquid-glass rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Money Sources &amp; Payment Channels (Cash, Bank, E-Wallets)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Period inflows &amp; outflows across all Cash, Bank, Wallet &amp; custom accounts
                </p>
              </div>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('accounting', { accountingTab: 'drawCashIn' })}
                  className="text-xs font-medium text-[#0071E3] hover:underline"
                >
                  Adjust / Transfer Money →
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse erp-table">
                <thead>
                  <tr className="border-b border-slate-200/80 text-slate-500">
                    <th className="py-2">Code</th>
                    <th className="py-2">Money Source</th>
                    <th className="py-2">Channel</th>
                    <th className="py-2 text-right">Period Inflow (+)</th>
                    <th className="py-2 text-right">Period Outflow (-)</th>
                    <th className="py-2 text-right">Period Net</th>
                    <th className="py-2 text-right">Current Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 tabular-nums">
                  {moneySourceReport.map((m) => (
                    <tr key={m.code}>
                      <td className="py-2.5 font-mono text-slate-500">{m.code}</td>
                      <td className="py-2.5 font-medium text-slate-900">{m.name}</td>
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 text-[10px] rounded bg-blue-50 text-[#0071E3] font-medium">
                          {m.channel || 'Asset'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-emerald-700">
                        +{formatMoney(m.inflow, sym)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-red-600">
                        -{formatMoney(m.outflow, sym)}
                      </td>
                      <td
                        className={`py-2.5 text-right font-mono font-semibold ${
                          m.netFlow >= 0 ? 'text-emerald-700' : 'text-red-600'
                        }`}
                      >
                        {m.netFlow >= 0 ? '+' : ''}
                        {formatMoney(m.netFlow, sym)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900">
                        {formatMoney(m.balance, sym)}
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-slate-300 font-semibold text-slate-900">
                    <td colSpan={3} className="py-2.5">
                      Total Across All Money Sources ({moneySourceReport.length})
                    </td>
                    <td className="py-2.5 text-right font-mono text-emerald-700">
                      +{formatMoney(moneySourceReport.reduce((s, m) => s + m.inflow, 0), sym)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-red-600">
                      -{formatMoney(moneySourceReport.reduce((s, m) => s + m.outflow, 0), sym)}
                    </td>
                    <td className="py-2.5 text-right font-mono">
                      {formatMoney(moneySourceReport.reduce((s, m) => s + m.netFlow, 0), sym)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[#0071E3]">
                      {formatMoney(moneySourceReport.reduce((s, m) => s + m.balance, 0), sym)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Revenue Mix (Bar Comparison)</h2>
              <div className="space-y-3">
                {revenueBreakdown.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 font-medium">{item.label}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(item.value, sym)}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#0071E3]"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-6 space-y-4">
              <h2 className="text-base font-semibold text-slate-900">Operating Expense Breakdown</h2>
              <div className="space-y-3">
                {expenseBreakdown.map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-slate-700 font-medium">{item.label}</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(item.value, sym)}
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-slate-200/70 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-slate-700"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sudden Money Adjustments in Selected Range */}
          <div className="liquid-glass rounded-2xl p-6 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">
                Sudden Money Additions &amp; Deductions ({suddenAdjustmentsInRange.length})
              </h2>
              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('accounting', { accountingTab: 'drawCashIn' })}
                  className="text-xs font-medium text-[#0071E3] hover:underline"
                >
                  Post New Sudden Adjustment →
                </button>
              )}
            </div>
            {suddenAdjustmentsInRange.length === 0 ? (
              <p className="text-xs text-slate-500">
                No sudden money adjustments recorded in this date range.
              </p>
            ) : (
              <div className="divide-y divide-slate-200/60 text-xs">
                {suddenAdjustmentsInRange.map((j) => {
                  const amt = j.lines.reduce((s, l) => s + l.debit, 0);
                  return (
                    <div key={j.id} className="py-2 flex items-center justify-between gap-4">
                      <div>
                        <span className="font-mono font-semibold text-slate-900 mr-2">{j.id}</span>
                        <span className="text-slate-700">{j.description}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                        <span className="text-slate-500">
                          {new Date(j.date).toLocaleDateString()}
                        </span>
                        <span className="font-semibold text-slate-900">
                          {formatMoney(amt, sym)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {group === 'Customer' && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Customer Statement &amp; Dues</h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500">
                <th className="py-2">Customer</th>
                <th className="py-2">Orders</th>
                <th className="py-2 text-right">Billed</th>
                <th className="py-2 text-right">Outstanding Due</th>
                <th className="py-2 text-right">Advance Held</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {state.customers.map((c) => {
                const orders = state.orders.filter((o) => o.customerId === c.id);
                const total = orders.reduce((s, o) => s + o.totalAmount, 0);
                return (
                  <tr key={c.id}>
                    <td className="py-2.5 font-medium text-slate-900">
                      {c.id} · {c.name}
                    </td>
                    <td className="py-2.5 font-mono">{orders.length}</td>
                    <td className="py-2.5 text-right font-mono">{formatMoney(total, sym)}</td>
                    <td className="py-2.5 text-right font-mono text-amber-700">
                      {formatMoney(c.outstandingBalance, sym)}
                    </td>
                    <td className="py-2.5 text-right font-mono text-[#0071E3]">
                      {formatMoney(c.advanceBalance, sym)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {group === 'Corporate' && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Corporate Movement &amp; Billing Summary
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500">
                <th className="py-2">Corporate Client</th>
                <th className="py-2">Billing Basis</th>
                <th className="py-2 text-right">Received Pcs</th>
                <th className="py-2 text-right">Delivered Pcs</th>
                <th className="py-2 text-right">Pending Pcs</th>
                <th className="py-2 text-right">Due Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {state.corporateCustomers.map((corp) => {
                const moves = state.corporateMovements.filter((m) => m.corporateId === corp.id);
                const recv = moves.filter((m) => m.qtyDelta > 0).reduce((s, m) => s + m.qtyDelta, 0);
                const deliv = moves
                  .filter((m) => m.qtyDelta < 0)
                  .reduce((s, m) => s + Math.abs(m.qtyDelta), 0);
                return (
                  <tr key={corp.id}>
                    <td className="py-2.5 font-medium text-slate-900">{corp.name}</td>
                    <td className="py-2.5 text-[#0071E3] font-medium">{corp.billingBasis}</td>
                    <td className="py-2.5 text-right font-mono">{recv}</td>
                    <td className="py-2.5 text-right font-mono">{deliv}</td>
                    <td className="py-2.5 text-right font-mono font-semibold">{Math.max(0, recv - deliv)}</td>
                    <td className="py-2.5 text-right font-mono">{formatMoney(corp.outstandingBalance, sym)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {group === 'Inventory' && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Chemical Stock Valuation &amp; Low-Stock Report
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500">
                <th className="py-2">Item</th>
                <th className="py-2">Batch</th>
                <th className="py-2 text-right">On Hand</th>
                <th className="py-2 text-right">Threshold</th>
                <th className="py-2 text-right">Valuation</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {state.chemicals.map((c) => (
                <tr key={c.id}>
                  <td className="py-2.5 font-medium text-slate-900">{c.name}</td>
                  <td className="py-2.5 font-mono text-slate-500">{c.batchNumber}</td>
                  <td className="py-2.5 text-right font-mono">
                    {c.currentQty} {c.unit}
                  </td>
                  <td className="py-2.5 text-right font-mono">
                    {c.lowStockThreshold} {c.unit}
                  </td>
                  <td className="py-2.5 text-right font-mono font-semibold">
                    {formatMoney(c.currentQty * c.purchaseCost, sym)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {group === 'Operations' && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Orders by Stage &amp; Exception Performance ({filteredOrders.length} in range)
          </h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500">
                <th className="py-2">Order</th>
                <th className="py-2">Customer</th>
                <th className="py-2">Stage</th>
                <th className="py-2">Exceptions</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {filteredOrders.map((o) => (
                <tr key={o.id}>
                  <td className="py-2.5 font-mono font-semibold text-slate-900">{o.id}</td>
                  <td className="py-2.5">{o.customerName}</td>
                  <td className="py-2.5 font-medium text-[#0071E3]">{o.stage}</td>
                  <td className="py-2.5 text-slate-600">{o.exceptions.length}</td>
                  <td className="py-2.5 text-right font-mono">{formatMoney(o.totalAmount, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {group === 'Staff' && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">Staff Payroll &amp; Advances</h2>
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 text-slate-500">
                <th className="py-2">Employee</th>
                <th className="py-2">Pay Structure</th>
                <th className="py-2 text-right">Base Rate</th>
                <th className="py-2 text-right">Advance Balance</th>
                <th className="py-2 text-right">Salary Due</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200/60 tabular-nums">
              {state.employees.map((e) => (
                <tr key={e.id}>
                  <td className="py-2.5 font-medium text-slate-900">{e.name}</td>
                  <td className="py-2.5 text-slate-600">{e.payType}</td>
                  <td className="py-2.5 text-right font-mono">{formatMoney(e.baseRate, sym)}</td>
                  <td className="py-2.5 text-right font-mono text-amber-700">
                    {formatMoney(e.advanceBalance, sym)}
                  </td>
                  <td className="py-2.5 text-right font-mono">{formatMoney(e.salaryDue, sym)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {group === 'Audit' && canAccessBlackBox && (
        <div className="liquid-glass rounded-2xl p-6">
          <h2 className="text-base font-semibold text-slate-900 mb-4">
            Audit Exception Summary ({filteredAudit.length} events)
          </h2>
          <div className="divide-y divide-slate-200/60 text-xs">
            {filteredAudit.map((ev) => (
              <div key={ev.id} className="py-2.5 flex justify-between gap-4">
                <span>
                  <strong className="font-mono">{ev.id}</strong> · {ev.action} — {ev.summary}
                </span>
                <span className="font-mono text-slate-500 whitespace-nowrap">
                  {new Date(ev.timestamp).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

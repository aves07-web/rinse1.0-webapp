import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  PackageCheck,
  Plus,
  Scale,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { ErpState } from '../types/erp';
import { computeFinancialStatements, formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import { getCorporateBrandColor } from '../utils/migration';
import { getOrderStageBadgeStyle } from '../utils/theme';

interface DashboardViewProps {
  state: ErpState;
  onNavigate: (section: string) => void;
  onNewOrder: () => void;
  onCompleteTask: (taskId: string) => void;
}

export function DashboardView({
  state,
  onNavigate,
  onNewOrder,
  onCompleteTask,
}: DashboardViewProps) {
  const sym = state.settings.currencySymbol;
  const theme = state.settings.appearanceTheme || 'colorful';
  const statements = computeFinancialStatements(state.accounts);

  const pendingOrders = state.orders.filter((o) => o.stage !== 'Delivered');
  const readyOrders = state.orders.filter((o) => o.stage === 'Ready to deliver');
  const notReceivedOrders = state.orders.filter((o) => !o.physicallyReceived);

  const operationalOrders = state.orders.filter((o) => !o.isOpening);
  const totalRetailSales = operationalOrders.reduce((s, o) => s + o.totalAmount, 0);
  const totalCollections = operationalOrders.reduce((s, o) => s + o.paidAmount, 0);
  const totalExpenses = state.expenses
    .filter((e) => !e.isOpening)
    .reduce((s, e) => s + e.amount, 0);

  const moneyAccounts = getMoneySourceAccounts(state.accounts);
  const cashAndBank = moneyAccounts.reduce((s, a) => s + a.balance, 0);

  const retailAR = state.accounts.find((a) => a.code === '1100')?.balance || 0;
  const corpAR = state.accounts.find((a) => a.code === '1110')?.balance || 0;

  const lowStockChemicals = state.chemicals.filter((c) => c.currentQty <= c.lowStockThreshold);
  const upcomingTasks = [...state.tasks]
    .filter((t) => t.status !== 'Completed')
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
    .slice(0, 5);

  const corporatePendingSummary = state.corporateCustomers.map((corp) => {
    const moves = state.corporateMovements.filter((m) => m.corporateId === corp.id);
    const totalReceived = moves
      .filter((m) => m.qtyDelta > 0)
      .reduce((s, m) => s + m.qtyDelta, 0);
    const totalDelivered = moves
      .filter((m) => m.qtyDelta < 0)
      .reduce((s, m) => s + Math.abs(m.qtyDelta), 0);
    return {
      corp,
      totalReceived,
      totalDelivered,
      pending: Math.max(0, totalReceived - totalDelivered),
    };
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 text-balance">
            Operations &amp; Financial Overview
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {state.settings.companyName} · {pendingOrders.length} active retail orders ·{' '}
            {upcomingTasks.length} scheduled tasks due
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => onNavigate('analytics')}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-white/80 border border-slate-200/80 text-slate-700 hover:bg-white hover:border-[#0071E3] hover:text-[#0071E3] transition-colors whitespace-nowrap"
          >
            <TrendingUp className="w-3.5 h-3.5 text-[#0071E3]" />
            Open Analytics
          </button>
          <button
            onClick={() => onNavigate('tasks')}
            className="px-4 py-2 text-xs font-medium rounded-xl bg-white/80 border border-slate-200/80 text-slate-700 hover:bg-white transition-colors whitespace-nowrap"
          >
            Open Task Calendar
          </button>
          <button
            onClick={onNewOrder}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl btn-primary transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            New Retail Order
          </button>
        </div>
      </div>

      {state.openingBalance?.status === 'draft' && (
        <div className="liquid-glass rounded-2xl px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="inline-flex items-center gap-2 text-slate-700">
            <Scale className="w-4 h-4 text-[#0071E3]" />
            Opening Balance setup is saved as a draft (as of {state.openingBalance.asOfDate}).
          </span>
          <button
            onClick={() => onNavigate('opening-balance')}
            className="font-semibold text-[#0071E3] hover:underline whitespace-nowrap"
          >
            Resume &amp; Finalize Opening Balance
          </button>
        </div>
      )}

      {/* 4-Column KPI Drill-Down Strip with Controlled Color Accents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('orders')}
          className={`text-left rounded-2xl p-5 border-l-4 transition-all group shadow-xs ${
            theme === 'calm'
              ? 'bg-sky-50/45 border border-sky-200/70 border-l-sky-500 hover:bg-sky-50/75'
              : theme === 'classic-blue'
              ? 'bg-blue-50/60 border border-blue-200/80 border-l-blue-600 hover:bg-blue-50'
              : 'bg-blue-50/75 border border-blue-200/80 border-l-[#0071E3] hover:bg-blue-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-blue-900">
              <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#0071E3] flex items-center justify-center">
                <ClipboardList className="w-3.5 h-3.5" />
              </span>
              Active Retail Orders
            </span>
            <ArrowUpRight className="w-4 h-4 text-blue-400 group-hover:text-[#0071E3] transition-colors" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2.5 tabular-nums font-mono">
            {pendingOrders.length}
          </p>
          <p className="text-xs text-slate-600 mt-1.5">
            {readyOrders.length} ready to deliver · {notReceivedOrders.length} awaiting receipt
          </p>
        </button>

        <button
          onClick={() => onNavigate('accounting')}
          className={`text-left rounded-2xl p-5 border-l-4 transition-all group shadow-xs ${
            theme === 'calm'
              ? 'bg-emerald-50/45 border border-emerald-200/70 border-l-emerald-500 hover:bg-emerald-50/75'
              : theme === 'classic-blue'
              ? 'bg-sky-50/60 border border-sky-200/80 border-l-sky-600 hover:bg-sky-50'
              : 'bg-emerald-50/75 border border-emerald-200/80 border-l-emerald-600 hover:bg-emerald-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-950">
              <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                <Wallet className="w-3.5 h-3.5" />
              </span>
              Cash &amp; Collections
            </span>
            <ArrowUpRight className="w-4 h-4 text-emerald-400 group-hover:text-emerald-700 transition-colors" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2.5 tabular-nums font-mono">
            {formatMoney(cashAndBank, sym)}
          </p>
          <p className="text-xs text-slate-600 mt-1.5 tabular-nums">
            Receivables due: {formatMoney(retailAR + corpAR, sym)}
          </p>
        </button>

        <button
          onClick={() => onNavigate('reports')}
          className={`text-left rounded-2xl p-5 border-l-4 transition-all group shadow-xs ${
            theme === 'calm'
              ? 'bg-amber-50/40 border border-amber-200/70 border-l-amber-500 hover:bg-amber-50/70'
              : theme === 'classic-blue'
              ? 'bg-indigo-50/55 border border-indigo-200/80 border-l-indigo-600 hover:bg-indigo-50'
              : 'bg-orange-50/75 border border-orange-200/80 border-l-orange-500 hover:bg-orange-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-orange-950">
              <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center">
                <TrendingUp className="w-3.5 h-3.5" />
              </span>
              Profit &amp; Expenses
            </span>
            <ArrowUpRight className="w-4 h-4 text-orange-400 group-hover:text-orange-600 transition-colors" />
          </div>
          <p className="text-2xl font-semibold text-emerald-700 mt-2.5 tabular-nums font-mono">
            {formatMoney(statements.netProfit, sym)}
          </p>
          <p className="text-xs text-slate-600 mt-1.5 tabular-nums">
            Rev {formatMoney(statements.totalRevenue, sym)} · Exp {formatMoney(statements.totalExpense, sym)}
          </p>
        </button>

        <button
          onClick={() => onNavigate('inventory')}
          className={`text-left rounded-2xl p-5 border-l-4 transition-all group shadow-xs ${
            theme === 'calm'
              ? 'bg-purple-50/40 border border-purple-200/70 border-l-purple-500 hover:bg-purple-50/70'
              : theme === 'classic-blue'
              ? 'bg-slate-50/75 border border-slate-200/80 border-l-blue-700 hover:bg-slate-100/80'
              : 'bg-purple-50/75 border border-purple-200/80 border-l-purple-600 hover:bg-purple-50'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-2 text-xs font-semibold text-purple-950">
              <span
                className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                  lowStockChemicals.length > 0
                    ? 'bg-red-100 text-red-600'
                    : 'bg-purple-100 text-purple-700'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </span>
              Billing &amp; Alerts
            </span>
            <ArrowUpRight className="w-4 h-4 text-purple-400 group-hover:text-purple-700 transition-colors" />
          </div>
          <p className="text-2xl font-semibold text-slate-900 mt-2.5 tabular-nums font-mono">
            {formatMoney(totalRetailSales, sym)}
          </p>
          <p className="text-xs mt-1.5">
            <span className={lowStockChemicals.length > 0 ? 'text-red-600 font-semibold' : 'text-slate-600'}>
              {lowStockChemicals.length} low-stock chemical alert(s)
            </span>
          </p>
        </button>
      </div>

      {/* Main 2-Column Analytical & Task Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Tasks + Active Orders */}
        <div className="lg:col-span-7 space-y-6">
          <div className="liquid-glass rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Scheduled Tasks &amp; Delivery Deadlines</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Synchronized with Calendar API feed and automated reminder rules
                </p>
              </div>
              <button
                onClick={() => onNavigate('tasks')}
                className="text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap"
              >
                View Full Calendar
              </button>
            </div>

            {upcomingTasks.length === 0 ? (
              <div className="py-8 text-center">
                <CalendarClock className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm text-slate-600">No pending scheduled tasks.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/60 mt-2">
                {upcomingTasks.map((task) => {
                  const isUrgent = task.priority === 'Urgent' || task.priority === 'High';
                  return (
                    <div key={task.id} className="py-3.5 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className={isUrgent ? 'text-amber-600 font-semibold' : 'text-slate-600 font-medium'}>
                            {task.priority}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{task.category}</span>
                          <span aria-hidden="true">·</span>
                          <span className="tabular-nums font-mono">
                            {new Date(task.dueAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-slate-900 mt-1">{task.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{task.description}</p>
                      </div>
                      <button
                        onClick={() => onCompleteTask(task.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3] transition-colors whitespace-nowrap shrink-0"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Complete
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="liquid-glass rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Active Retail Order Queue</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Physical receipt, washing stage, and partial delivery status
                </p>
              </div>
              <button
                onClick={() => onNavigate('orders')}
                className="text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap"
              >
                Manage Orders
              </button>
            </div>

            <div className="overflow-x-auto mt-2">
              <table className="w-full text-left border-collapse erp-table">
                <thead>
                  <tr className="border-b border-slate-200/70 text-[11px] font-semibold">
                    <th className="py-2.5 px-3">Order</th>
                    <th className="py-2.5 px-3">Customer</th>
                    <th className="py-2.5 px-3">Stage</th>
                    <th className="py-2.5 px-3">Delivery</th>
                    <th className="py-2.5 px-3 text-right">Due</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200/60 text-xs">
                  {state.orders.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-6 text-center text-xs text-slate-400">
                        No retail orders yet. Click &ldquo;New Retail Order&rdquo; to start.
                      </td>
                    </tr>
                  ) : (
                    state.orders.slice(0, 6).map((o) => {
                      const due = Math.max(0, o.totalAmount - o.paidAmount);
                      return (
                        <tr key={o.id}>
                          <td className="py-3 px-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                            {o.id}
                          </td>
                          <td className="py-3 px-3 text-slate-700">{o.customerName}</td>
                          <td className="py-3 px-3">
                            <span className={getOrderStageBadgeStyle(o.stage, theme)}>{o.stage}</span>
                          </td>
                          <td className="py-3 px-3 text-slate-500 whitespace-nowrap">{o.deliveryOptionName}</td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                            {formatMoney(due, sym)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 5 Columns: Corporate Linen Summary + Financial Position */}
        <div className="lg:col-span-5 space-y-6">
          <div className="liquid-glass rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Corporate Linen Balances</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Private catalogues &amp; physical movement tracking
                </p>
              </div>
              <button
                onClick={() => onNavigate('corporate')}
                className="text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap"
              >
                Open Corporate
              </button>
            </div>

            <div className="divide-y divide-slate-200/60 mt-2">
              {corporatePendingSummary.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">
                  No corporate accounts added yet.
                </p>
              ) : (
                corporatePendingSummary.map(({ corp, totalReceived, totalDelivered, pending }, idx) => {
                  const brandColor = getCorporateBrandColor(idx, corp.brandColor);
                  return (
                    <div key={corp.id} className="py-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0 inline-block"
                            style={{ backgroundColor: brandColor }}
                          />
                          {corp.name}
                        </p>
                        <span className="text-xs font-medium" style={{ color: brandColor }}>
                          {corp.billingBasis}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs text-slate-500 mt-1.5 tabular-nums">
                        <span>
                          Recv {totalReceived} · Deliv {totalDelivered} ·{' '}
                          <strong className="text-slate-800">{pending} pcs pending</strong>
                        </span>
                        <span className="font-mono text-slate-900 font-medium">
                          Due {formatMoney(corp.outstandingBalance, sym)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="liquid-glass rounded-2xl p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900">Double-Entry Balance Check</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Live Trial Balance &amp; Operating Position
                </p>
              </div>
              <button
                onClick={() => onNavigate('accounting')}
                className="text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap"
              >
                Ledger
              </button>
            </div>

            <div className="space-y-3 mt-4 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Total Assets</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {formatMoney(statements.totalAssets, sym)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Total Liabilities</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  {formatMoney(statements.totalLiabilities, sym)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Total Equity (incl. Net Profit)</span>
                <span className="font-mono tabular-nums font-medium text-slate-800">
                  {formatMoney(statements.totalEquityWithProfit, sym)}
                </span>
              </div>
              <div className="pt-3 border-t border-slate-200/70 flex items-center justify-between">
                <span className="text-slate-600">Ledger Collections / Logged Expenses</span>
                <span className="font-mono tabular-nums text-slate-700">
                  {formatMoney(totalCollections, sym)} / {formatMoney(totalExpenses, sym)}
                </span>
              </div>
              <div className="flex items-center justify-between text-emerald-700 font-medium">
                <span className="inline-flex items-center gap-1.5">
                  <PackageCheck className="w-3.5 h-3.5" />
                  Balance Sheet Variance
                </span>
                <span className="font-mono tabular-nums">{formatMoney(statements.balanceSheetDiff, sym)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import * as echarts from 'echarts';
import {
  ArrowUpRight,
  BarChart2,
  BookOpen,
  CandlestickChart,
  Download,
  FileSpreadsheet,
  Filter,
  PieChart as PieChartIcon,
  Wallet,
  X,
} from 'lucide-react';
import { CorporateCustomer, ErpState, NavSection } from '../types/erp';
import { formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import { getCorporateBrandColor } from '../utils/migration';

interface AnalyticsViewProps {
  state: ErpState;
  canExportReports?: boolean;
  onNavigate?: (
    section: NavSection,
    options?: { accountingTab?: 'statements' | 'journals' | 'drawCashIn' | 'coa' }
  ) => void;
}

type GroupingMode = 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
type DatePreset = 'Today' | 'Weekly' | 'Monthly' | 'Yearly' | 'Custom';
type HistogramTab = 'orderValue' | 'dailySales' | 'itemsPerOrder' | 'hourOfDay';

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getBucketKey(isoDate: string, mode: GroupingMode): string {
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return isoDate.slice(0, 10);
  if (mode === 'Daily') return toDateStr(d);
  if (mode === 'Weekly') {
    const copy = new Date(d);
    const day = copy.getDay();
    const diff = copy.getDate() - day + (day === 0 ? -6 : 1);
    copy.setDate(diff);
    return `Wk ${toDateStr(copy)}`;
  }
  if (mode === 'Monthly') {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }
  return String(d.getFullYear());
}

function generatePeriodKeys(fromDate: string, toDate: string, mode: GroupingMode): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  const start = new Date(`${fromDate}T00:00:00`);
  const end = new Date(`${toDate}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return keys;

  const cursor = new Date(start);
  let guard = 0;
  while (cursor <= end && guard < 1500) {
    const k = getBucketKey(cursor.toISOString(), mode);
    if (!seen.has(k)) {
      seen.add(k);
      keys.push(k);
    }
    cursor.setDate(cursor.getDate() + 1);
    guard += 1;
  }
  return keys;
}

function downloadCsv(filename: string, headers: string[], rows: Array<Array<string | number>>) {
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
}

interface EChartBoxProps {
  option: echarts.EChartsOption;
  height?: number;
  onInit?: (instance: echarts.ECharts) => void;
  onChartClick?: (params: unknown) => void;
}

function EChartBox({ option, height = 310, onInit, onChartClick }: EChartBoxProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let chart: echarts.ECharts | null = null;
    let ro: ResizeObserver | null = null;
    try {
      chart = echarts.init(el);
      chartRef.current = chart;
      onInit?.(chart);

      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
          chart?.resize();
        });
        ro.observe(el);
      }
    } catch (err) {
      console.error('Chart initialization failed:', err);
    }

    return () => {
      ro?.disconnect();
      chart?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || !onChartClick) return;
    chart.off('click');
    chart.on('click', (params) => onChartClick(params));
    return () => {
      chart.off('click');
    };
  }, [onChartClick]);

  return <div ref={containerRef} style={{ width: '100%', height: `${height}px` }} />;
}

export function AnalyticsView({
  state,
  canExportReports = true,
  onNavigate,
}: AnalyticsViewProps) {
  const sym = state.settings.currencySymbol;
  const moneySources = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const totalLiquidity = moneySources.reduce((s, a) => s + a.balance, 0);
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const defaultFromStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return toDateStr(d);
  }, []);

  const [preset, setPreset] = useState<DatePreset>('Monthly');
  const [fromDate, setFromDate] = useState(defaultFromStr);
  const [toDate, setToDate] = useState(todayStr);
  const [grouping, setGrouping] = useState<GroupingMode>('Weekly');
  const [customerScope, setCustomerScope] = useState<string>('ALL'); // 'ALL' | 'RETAIL' | corp.id

  const [showCashVolume, setShowCashVolume] = useState(true);
  const [histTab, setHistTab] = useState<HistogramTab>('orderValue');
  const [histBinCount, setHistBinCount] = useState<number>(6);
  const [histBinStep, setHistBinStep] = useState<string>('');
  const [drillSlice, setDrillSlice] = useState<{
    key: string;
    label: string;
    isRetail: boolean;
    corp?: CorporateCustomer;
  } | null>(null);

  // Chart refs for PNG export
  const salesPieRef = useRef<echarts.ECharts | null>(null);
  const expensePieRef = useRef<echarts.ECharts | null>(null);
  const cashCandleRef = useRef<echarts.ECharts | null>(null);
  const arCandleRef = useRef<echarts.ECharts | null>(null);
  const histChartRef = useRef<echarts.ECharts | null>(null);

  const exportPng = (chart: echarts.ECharts | null, filename: string) => {
    if (!chart) return;
    const dataUrl = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff',
    });
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    a.click();
  };

  const applyPreset = (p: DatePreset) => {
    setPreset(p);
    const now = new Date();
    const to = toDateStr(now);
    setToDate(to);
    if (p === 'Today') {
      setFromDate(to);
      setGrouping('Daily');
    } else if (p === 'Weekly') {
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      setFromDate(toDateStr(start));
      setGrouping('Daily');
    } else if (p === 'Monthly') {
      const start = new Date(now);
      start.setDate(start.getDate() - 30);
      setFromDate(toDateStr(start));
      setGrouping('Weekly');
    } else if (p === 'Yearly') {
      const start = new Date(now);
      start.setDate(start.getDate() - 365);
      setFromDate(toDateStr(start));
      setGrouping('Monthly');
    }
  };

  const isInRange = (iso: string) => {
    const d = iso.slice(0, 10);
    return d >= fromDate && d <= toDate;
  };

  // Strictly exclude Opening Balance / Opening Adjustment records from Sales & Expense analytics
  const operationalOrders = useMemo(
    () => state.orders.filter((o) => !o.isOpening && isInRange(o.createdAt)),
    [state.orders, fromDate, toDate]
  );

  const operationalMovements = useMemo(
    () => state.corporateMovements.filter((m) => !m.isOpening && isInRange(m.date)),
    [state.corporateMovements, fromDate, toDate]
  );

  const operationalExpenses = useMemo(
    () => state.expenses.filter((e) => !e.isOpening && isInRange(e.date)),
    [state.expenses, fromDate, toDate]
  );

  // --- CHART 1: SALES SHARE PIE/DONUT ---
  const salesShareData = useMemo(() => {
    const slices: Array<{
      key: string;
      name: string;
      value: number;
      color: string;
      isRetail: boolean;
      corp?: CorporateCustomer;
    }> = [];

    if (customerScope === 'ALL' || customerScope === 'RETAIL') {
      const retailTotal = operationalOrders.reduce((s, o) => s + o.totalAmount, 0);
      if (retailTotal > 0) {
        slices.push({
          key: 'RETAIL',
          name: 'Retail Customers',
          value: Number(retailTotal.toFixed(2)),
          color: '#0F172A',
          isRetail: true,
        });
      }
    }

    state.corporateCustomers.forEach((corp, idx) => {
      if (customerScope !== 'ALL' && customerScope !== corp.id) return;
      const corpColor = getCorporateBrandColor(idx, corp.brandColor);
      const discFactor = 1 - (corp.discountPct || 0) / 100;
      const corpTotal = operationalMovements
        .filter((m) => {
          if (m.corporateId !== corp.id) return false;
          return corp.billingBasis === 'Delivered-wise'
            ? m.event === 'Delivered'
            : m.event === 'Received';
        })
        .reduce((sum, m) => {
          const rate =
            corp.prices.find((p) => p.productId === m.productId && p.serviceId === m.serviceId)
              ?.price ?? m.unitPriceSnapshot;
          return sum + Math.abs(m.qtyDelta) * rate * discFactor;
        }, 0);

      if (corpTotal > 0) {
        slices.push({
          key: corp.id,
          name: corp.name,
          value: Number(corpTotal.toFixed(2)),
          color: corpColor,
          isRetail: false,
          corp,
        });
      }
    });

    return slices;
  }, [operationalOrders, operationalMovements, state.corporateCustomers, customerScope]);

  const totalSalesShare = useMemo(
    () => salesShareData.reduce((s, d) => s + d.value, 0),
    [salesShareData]
  );

  const salesPieOption = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          return `<div style="font-weight:600;margin-bottom:2px">${p.name}</div>
                  <div>Sales: <b>${formatMoney(p.value, sym)}</b> (${p.percent}%)</div>
                  <div style="font-size:11px;color:#64748b;margin-top:2px">Click slice to inspect period orders</div>`;
        },
      },
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: { color: '#334155', fontSize: 11 },
        formatter: (name: string) => {
          const item = salesShareData.find((d) => d.name === name);
          if (!item || totalSalesShare <= 0) return name;
          const pct = ((item.value / totalSalesShare) * 100).toFixed(1);
          return `${name} (${sym} ${item.value.toLocaleString()} · ${pct}%)`;
        },
      },
      series: [
        {
          name: 'Sales Share',
          type: 'pie',
          radius: ['44%', '70%'],
          center: ['50%', '43%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 6, borderColor: '#ffffff', borderWidth: 2 },
          label: {
            show: true,
            formatter: '{d}%',
            fontSize: 11,
            color: '#334155',
          },
          data: salesShareData.map((d) => ({
            value: d.value,
            name: d.name,
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [salesShareData, totalSalesShare, sym]
  );

  // Drill-down orders/movements when slice clicked
  const drillRecords = useMemo(() => {
    if (!drillSlice) return [];
    if (drillSlice.isRetail) {
      return operationalOrders.map((o) => ({
        id: o.id,
        date: o.createdAt,
        title: o.customerName,
        detail: `${o.lines.reduce((s, l) => s + l.quantityOrdered, 0)} pcs · ${o.stage}`,
        amount: o.totalAmount,
      }));
    }
    const corp = drillSlice.corp;
    if (!corp) return [];
    const discFactor = 1 - (corp.discountPct || 0) / 100;
    return operationalMovements
      .filter((m) => {
        if (m.corporateId !== corp.id) return false;
        return corp.billingBasis === 'Delivered-wise'
          ? m.event === 'Delivered'
          : m.event === 'Received';
      })
      .map((m) => {
        const rate =
          corp.prices.find((p) => p.productId === m.productId && p.serviceId === m.serviceId)
            ?.price ?? m.unitPriceSnapshot;
        return {
          id: m.orderId || m.id,
          date: m.date,
          title: `${m.productName} · ${m.serviceName}`,
          detail: `${m.event} ${Math.abs(m.qtyDelta)} pcs`,
          amount: Number((Math.abs(m.qtyDelta) * rate * discFactor).toFixed(2)),
        };
      });
  }, [drillSlice, operationalOrders, operationalMovements]);

  // --- CHART 2: EXPENSE CATEGORY PIE ---
  const expensePieData = useMemo(() => {
    const map = new Map<string, number>();

    // Operating expenses (exclude opening)
    for (const exp of operationalExpenses) {
      if (exp.category === 'Owner Draw') continue;
      map.set(exp.category, (map.get(exp.category) || 0) + exp.amount);
    }

    // Chemical consumptions / issues (exclude opening)
    for (const sm of state.stockMovements) {
      if (!isInRange(sm.date)) continue;
      if (sm.type === 'Consumed' || sm.type === 'Issued' || sm.type === 'Damaged') {
        const cost = Number((sm.qty * sm.unitCost).toFixed(2));
        if (cost > 0) {
          map.set('Chemicals', (map.get('Chemicals') || 0) + cost);
        }
      }
    }

    // Staff salaries / payroll (exclude advances & owner draw)
    for (const pr of state.payrollRecords) {
      if (!isInRange(pr.date)) continue;
      if (pr.type !== 'Advance' && pr.netPaid > 0) {
        map.set('Staff Salaries', (map.get('Staff Salaries') || 0) + pr.netPaid);
      }
    }

    const palette = [
      '#0071E3',
      '#0D9488',
      '#7C3AED',
      '#D97706',
      '#2563EB',
      '#059669',
      '#DB2777',
      '#475569',
      '#EA580C',
    ];
    return Array.from(map.entries())
      .map(([name, value], i) => ({
        name,
        value: Number(value.toFixed(2)),
        color: palette[i % palette.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [operationalExpenses, state.stockMovements, state.payrollRecords, fromDate, toDate]);

  const totalExpensePie = useMemo(
    () => expensePieData.reduce((s, d) => s + d.value, 0),
    [expensePieData]
  );

  const expensePieOption = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'item',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const p = params as { name: string; value: number; percent: number };
          return `<div style="font-weight:600;margin-bottom:2px">${p.name}</div>
                  <div>Spend: <b>${formatMoney(p.value, sym)}</b> (${p.percent}%)</div>`;
        },
      },
      legend: {
        bottom: 0,
        type: 'scroll',
        textStyle: { color: '#334155', fontSize: 11 },
        formatter: (name: string) => {
          const item = expensePieData.find((d) => d.name === name);
          if (!item || totalExpensePie <= 0) return name;
          const pct = ((item.value / totalExpensePie) * 100).toFixed(1);
          return `${name} (${sym} ${item.value.toLocaleString()} · ${pct}%)`;
        },
      },
      series: [
        {
          name: 'Expenses',
          type: 'pie',
          radius: ['42%', '70%'],
          center: ['50%', '43%'],
          itemStyle: { borderRadius: 6, borderColor: '#ffffff', borderWidth: 2 },
          label: { show: true, formatter: '{d}%', fontSize: 11, color: '#334155' },
          data: expensePieData.map((d) => ({
            value: d.value,
            name: d.name,
            itemStyle: { color: d.color },
          })),
        },
      ],
    }),
    [expensePieData, totalExpensePie, sym]
  );

  // --- CHART 3: CASH FLOW CANDLESTICK (All Active & Historical Money Sources OHLC) ---
  const cashCandleSeries = useMemo(() => {
    const cashCodes = new Set(
      state.accounts
        .filter((a) => a.type === 'Asset' && (a.code === '1010' || a.code === '1020' || a.code.startsWith('10') || Boolean(a.channel && a.channel !== 'Other')))
        .map((a) => a.code)
    );

    const sortedJournals = [...state.journalEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    let running = 0;
    const periodMap = new Map<
      string,
      { open: number; high: number; low: number; close: number; cashIn: number; cashOut: number }
    >();

    // Determine initial starting balance before fromDate
    for (const je of sortedJournals) {
      const jeDate = je.date.slice(0, 10);
      let delta = 0;
      let cashIn = 0;
      let cashOut = 0;
      for (const l of je.lines) {
        if (!cashCodes.has(l.accountCode)) continue;
        delta += l.debit - l.credit;
        if (!je.isOpening && je.category !== 'Opening Balance' && je.category !== 'Opening Adjustment') {
          cashIn += l.debit;
          cashOut += l.credit;
        }
      }
      if (Math.abs(delta) < 0.001 && cashIn === 0 && cashOut === 0) continue;

      if (jeDate < fromDate) {
        running = Number((running + delta).toFixed(2));
        continue;
      }
      if (jeDate > toDate) continue;

      const key = getBucketKey(je.date, grouping);
      const existing = periodMap.get(key) || {
        open: running,
        high: running,
        low: running,
        close: running,
        cashIn: 0,
        cashOut: 0,
      };
      running = Number((running + delta).toFixed(2));
      existing.high = Math.max(existing.high, running);
      existing.low = Math.min(existing.low, running);
      existing.close = running;
      existing.cashIn = Number((existing.cashIn + cashIn).toFixed(2));
      existing.cashOut = Number((existing.cashOut + cashOut).toFixed(2));
      periodMap.set(key, existing);
    }

    const keys = generatePeriodKeys(fromDate, toDate, grouping);
    const result: Array<{
      label: string;
      open: number;
      close: number;
      low: number;
      high: number;
      cashIn: number;
      cashOut: number;
      net: number;
    }> = [];

    // Re-compute carry-forward starting balance accurately for empty periods
    let carry = 0;
    for (const je of sortedJournals) {
      if (je.date.slice(0, 10) >= fromDate) break;
      for (const l of je.lines) {
        if (cashCodes.has(l.accountCode)) {
          carry += l.debit - l.credit;
        }
      }
    }
    carry = Number(carry.toFixed(2));

    for (const k of keys) {
      const hit = periodMap.get(k);
      if (hit) {
        carry = hit.close;
        result.push({
          label: k,
          ...hit,
          net: Number((hit.cashIn - hit.cashOut).toFixed(2)),
        });
      } else {
        result.push({
          label: k,
          open: carry,
          high: carry,
          low: carry,
          close: carry,
          cashIn: 0,
          cashOut: 0,
          net: 0,
        });
      }
    }
    return result;
  }, [state.accounts, state.journalEntries, fromDate, toDate, grouping]);

  const cashCandleOption = useMemo<echarts.EChartsOption>(() => {
    const categories = cashCandleSeries.map((d) => d.label);
    const kData = cashCandleSeries.map((d) => ({
      value: [d.open, d.close, d.low, d.high],
      itemStyle: {
        color: d.close >= d.open ? '#16A34A' : '#DC2626',
        color0: d.close >= d.open ? '#16A34A' : '#DC2626',
        borderColor: d.close >= d.open ? '#16A34A' : '#DC2626',
        borderColor0: d.close >= d.open ? '#16A34A' : '#DC2626',
      },
    }));

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const list = params as Array<{ dataIndex: number }>;
          const idx = list?.[0]?.dataIndex ?? 0;
          const row = cashCandleSeries[idx];
          if (!row) return '';
          const netColor = row.net >= 0 ? '#16A34A' : '#DC2626';
          return `<div style="font-weight:600;margin-bottom:4px">${row.label}</div>
                  <div>Open: <b>${formatMoney(row.open, sym)}</b></div>
                  <div>High: <b>${formatMoney(row.high, sym)}</b></div>
                  <div>Low: <b>${formatMoney(row.low, sym)}</b></div>
                  <div>Close: <b>${formatMoney(row.close, sym)}</b></div>
                  <hr style="margin:4px 0;border-color:#e2e8f0"/>
                  <div style="color:#16A34A">Cash In: +${formatMoney(row.cashIn, sym)}</div>
                  <div style="color:#DC2626">Cash Out: -${formatMoney(row.cashOut, sym)}</div>
                  <div style="color:${netColor};font-weight:600">Net: ${row.net >= 0 ? '+' : ''}${formatMoney(row.net, sym)}</div>`;
        },
      },
      grid: showCashVolume
        ? [
            { left: 68, right: 20, top: 20, height: '56%' },
            { left: 68, right: 20, top: '76%', height: '16%' },
          ]
        : [{ left: 68, right: 20, top: 20, bottom: 32 }],
      xAxis: showCashVolume
        ? [
            { type: 'category', data: categories, axisLine: { lineStyle: { color: '#cbd5e1' } }, axisLabel: { show: false } },
            { type: 'category', gridIndex: 1, data: categories, axisLabel: { color: '#64748b', fontSize: 10 } },
          ]
        : [{ type: 'category', data: categories, axisLabel: { color: '#64748b', fontSize: 10 } }],
      yAxis: showCashVolume
        ? [
            { scale: true, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#64748b', fontSize: 10 } },
            { scale: true, gridIndex: 1, splitNumber: 2, axisLabel: { show: false }, splitLine: { show: false } },
          ]
        : [{ scale: true, splitLine: { lineStyle: { color: '#f1f5f9' } }, axisLabel: { color: '#64748b', fontSize: 10 } }],
      series: [
        {
          name: 'Cash + Bank',
          type: 'candlestick',
          data: kData,
        },
        ...(showCashVolume
          ? [
              {
                name: 'Cash In',
                type: 'bar' as const,
                xAxisIndex: 1,
                yAxisIndex: 1,
                itemStyle: { color: 'rgba(22, 163, 74, 0.7)' },
                data: cashCandleSeries.map((d) => d.cashIn),
              },
              {
                name: 'Cash Out',
                type: 'bar' as const,
                xAxisIndex: 1,
                yAxisIndex: 1,
                itemStyle: { color: 'rgba(220, 38, 38, 0.7)' },
                data: cashCandleSeries.map((d) => d.cashOut),
              },
            ]
          : []),
      ],
    };
  }, [cashCandleSeries, showCashVolume, sym]);

  // --- CHART 4: SALES CREDIT/DEBIT (RECEIVABLES / DUES) CANDLESTICK ---
  const arCandleSeries = useMemo(() => {
    const corpInvoicesSet = new Set<string>();
    let targetCorp: CorporateCustomer | undefined;
    if (customerScope !== 'ALL' && customerScope !== 'RETAIL') {
      targetCorp = state.corporateCustomers.find((c) => c.id === customerScope);
      state.invoices
        .filter((inv) => inv.corporateId === customerScope)
        .forEach((inv) => corpInvoicesSet.add(inv.id));
    }

    const sortedJournals = [...state.journalEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    const matchesScope = (je: ErpState['journalEntries'][number], accountCode: string) => {
      if (customerScope === 'ALL') {
        return accountCode === '1100' || accountCode === '1110';
      }
      if (customerScope === 'RETAIL') {
        return accountCode === '1100';
      }
      if (accountCode !== '1110') return false;
      if (!targetCorp) return false;
      return (
        je.reference === targetCorp.id ||
        corpInvoicesSet.has(je.reference) ||
        je.description.toLowerCase().includes(targetCorp.name.toLowerCase()) ||
        je.description.includes(targetCorp.id)
      );
    };

    let running = 0;
    let carry = 0;
    const periodMap = new Map<
      string,
      { open: number; high: number; low: number; close: number; billed: number; collected: number }
    >();

    for (const je of sortedJournals) {
      const jeDate = je.date.slice(0, 10);
      let delta = 0;
      let billed = 0;
      let collected = 0;
      for (const l of je.lines) {
        if (!matchesScope(je, l.accountCode)) continue;
        delta += l.debit - l.credit;
        if (!je.isOpening && je.category !== 'Opening Balance' && je.category !== 'Opening Adjustment') {
          billed += l.debit;
          collected += l.credit;
        }
      }
      if (Math.abs(delta) < 0.001 && billed === 0 && collected === 0) continue;

      if (jeDate < fromDate) {
        running = Number((running + delta).toFixed(2));
        carry = running;
        continue;
      }
      if (jeDate > toDate) continue;

      const key = getBucketKey(je.date, grouping);
      const existing = periodMap.get(key) || {
        open: running,
        high: running,
        low: running,
        close: running,
        billed: 0,
        collected: 0,
      };
      running = Number((running + delta).toFixed(2));
      existing.high = Math.max(existing.high, running);
      existing.low = Math.min(existing.low, running);
      existing.close = running;
      existing.billed = Number((existing.billed + billed).toFixed(2));
      existing.collected = Number((existing.collected + collected).toFixed(2));
      periodMap.set(key, existing);
    }

    const keys = generatePeriodKeys(fromDate, toDate, grouping);
    const result: Array<{
      label: string;
      open: number;
      close: number;
      low: number;
      high: number;
      billed: number;
      collected: number;
      net: number;
    }> = [];

    for (const k of keys) {
      const hit = periodMap.get(k);
      if (hit) {
        carry = hit.close;
        result.push({
          label: k,
          ...hit,
          net: Number((hit.billed - hit.collected).toFixed(2)),
        });
      } else {
        result.push({
          label: k,
          open: carry,
          high: carry,
          low: carry,
          close: carry,
          billed: 0,
          collected: 0,
          net: 0,
        });
      }
    }
    return result;
  }, [state.journalEntries, state.corporateCustomers, state.invoices, customerScope, fromDate, toDate, grouping]);

  const arCandleOption = useMemo<echarts.EChartsOption>(() => {
    const categories = arCandleSeries.map((d) => d.label);
    // Green (#16A34A) when dues decrease or stay flat (close <= open), Red (#DC2626) when dues increase (close > open)
    const kData = arCandleSeries.map((d) => {
      const isFavorable = d.close <= d.open;
      const color = isFavorable ? '#16A34A' : '#DC2626';
      return {
        value: [d.open, d.close, d.low, d.high],
        itemStyle: {
          color,
          color0: color,
          borderColor: color,
          borderColor0: color,
        },
      };
    });

    return {
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'cross' },
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const list = params as Array<{ dataIndex: number }>;
          const idx = list?.[0]?.dataIndex ?? 0;
          const row = arCandleSeries[idx];
          if (!row) return '';
          return `<div style="font-weight:600;margin-bottom:4px">${row.label}</div>
                  <div>Open Dues: <b>${formatMoney(row.open, sym)}</b></div>
                  <div>High Dues: <b>${formatMoney(row.high, sym)}</b></div>
                  <div>Low Dues: <b>${formatMoney(row.low, sym)}</b></div>
                  <div>Close Dues: <b>${formatMoney(row.close, sym)}</b></div>
                  <hr style="margin:4px 0;border-color:#e2e8f0"/>
                  <div style="color:#DC2626">Billed / Added Dues: +${formatMoney(row.billed, sym)}</div>
                  <div style="color:#16A34A">Collected: -${formatMoney(row.collected, sym)}</div>
                  <div style="font-weight:600">Net Change: ${row.net >= 0 ? '+' : ''}${formatMoney(row.net, sym)}</div>`;
        },
      },
      grid: { left: 68, right: 20, top: 20, bottom: 32 },
      xAxis: { type: 'category', data: categories, axisLabel: { color: '#64748b', fontSize: 10 } },
      yAxis: {
        scale: true,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      series: [{ name: 'Customer Dues', type: 'candlestick', data: kData }],
    };
  }, [arCandleSeries, sym]);

  // --- CHART 5: TABBED SALES HISTOGRAMS ---
  const histogramData = useMemo(() => {
    // Prepare scoped operational values
    const scopedCorp =
      customerScope !== 'ALL' && customerScope !== 'RETAIL'
        ? state.corporateCustomers.find((c) => c.id === customerScope)
        : undefined;

    const orderValues: number[] = [];
    const itemsPerOrder: number[] = [];
    const dailyTotals = new Map<string, number>();
    const hourCounts = Array.from({ length: 24 }, () => 0);
    const orderHours: number[] = [];

    if (customerScope === 'ALL' || customerScope === 'RETAIL') {
      for (const o of operationalOrders) {
        orderValues.push(o.totalAmount);
        const pcs = o.lines.reduce((s, l) => s + l.quantityOrdered, 0);
        itemsPerOrder.push(pcs);
        const dayKey = o.createdAt.slice(0, 10);
        dailyTotals.set(dayKey, (dailyTotals.get(dayKey) || 0) + o.totalAmount);
        const hr = new Date(o.createdAt).getHours();
        if (!Number.isNaN(hr) && hr >= 0 && hr < 24) {
          hourCounts[hr] += 1;
          orderHours.push(hr);
        }
      }
    }

    if (customerScope === 'ALL' || scopedCorp) {
      for (const m of operationalMovements) {
        if (scopedCorp && m.corporateId !== scopedCorp.id) continue;
        const corp = state.corporateCustomers.find((c) => c.id === m.corporateId);
        if (!corp) continue;
        const eligible =
          corp.billingBasis === 'Delivered-wise' ? m.event === 'Delivered' : m.event === 'Received';
        if (!eligible) continue;
        const qty = Math.abs(m.qtyDelta);
        const rate =
          corp.prices.find((p) => p.productId === m.productId && p.serviceId === m.serviceId)
            ?.price ?? m.unitPriceSnapshot;
        const amt = Number((qty * rate * (1 - (corp.discountPct || 0) / 100)).toFixed(2));
        orderValues.push(amt);
        itemsPerOrder.push(qty);
        const dayKey = m.date.slice(0, 10);
        dailyTotals.set(dayKey, (dailyTotals.get(dayKey) || 0) + amt);
        const hr = new Date(m.date).getHours();
        if (!Number.isNaN(hr) && hr >= 0 && hr < 24) {
          hourCounts[hr] += 1;
          orderHours.push(hr);
        }
      }
    }

    const computeStats = (arr: number[]) => {
      if (arr.length === 0) return { mean: 0, median: 0 };
      const sorted = [...arr].sort((a, b) => a - b);
      const mean = sorted.reduce((s, n) => s + n, 0) / sorted.length;
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
      return { mean: Number(mean.toFixed(2)), median: Number(median.toFixed(2)) };
    };

    if (histTab === 'hourOfDay') {
      const bins = hourCounts.map((count, hr) => ({
        label: `${String(hr).padStart(2, '0')}:00`,
        count,
      }));
      const stats = computeStats(orderHours);
      return {
        bins,
        stats,
        unitLabel: 'hr',
        sampleCount: orderHours.length,
      };
    }

    const sourceValues =
      histTab === 'orderValue'
        ? orderValues
        : histTab === 'dailySales'
        ? Array.from(dailyTotals.values())
        : itemsPerOrder;

    const stats = computeStats(sourceValues);
    if (sourceValues.length === 0) {
      return { bins: [], stats, unitLabel: histTab === 'itemsPerOrder' ? 'pcs' : sym, sampleCount: 0 };
    }

    const minVal = Math.min(...sourceValues);
    const maxVal = Math.max(...sourceValues);
    const parsedStep = Number(histBinStep);
    const useCustomStep = !Number.isNaN(parsedStep) && parsedStep > 0;
    const bins: Array<{ label: string; count: number }> = [];

    if (useCustomStep) {
      const start = Math.floor(minVal / parsedStep) * parsedStep;
      const end = Math.max(start + parsedStep, Math.ceil((maxVal + 0.001) / parsedStep) * parsedStep);
      const numBins = Math.min(24, Math.max(1, Math.ceil((end - start) / parsedStep)));
      for (let i = 0; i < numBins; i++) {
        const lo = start + i * parsedStep;
        const hi = lo + parsedStep;
        const count = sourceValues.filter((v) =>
          i === numBins - 1 ? v >= lo && v <= hi : v >= lo && v < hi
        ).length;
        bins.push({ label: `${Math.round(lo)}–${Math.round(hi)}`, count });
      }
    } else {
      const count = Math.max(3, Math.min(16, histBinCount || 6));
      const span = Math.max(1, maxVal - minVal);
      const step = Math.max(1, Math.ceil(span / count));
      const start = Math.floor(minVal);
      for (let i = 0; i < count; i++) {
        const lo = start + i * step;
        const hi = lo + step;
        const c = sourceValues.filter((v) =>
          i === count - 1 ? v >= lo : v >= lo && v < hi
        ).length;
        bins.push({ label: `${Math.round(lo)}–${Math.round(hi)}`, count: c });
      }
    }

    return {
      bins,
      stats,
      unitLabel: histTab === 'itemsPerOrder' ? 'pcs' : sym,
      sampleCount: sourceValues.length,
    };
  }, [
    histTab,
    histBinCount,
    histBinStep,
    operationalOrders,
    operationalMovements,
    state.corporateCustomers,
    customerScope,
    sym,
  ]);

  const histogramOption = useMemo<echarts.EChartsOption>(
    () => ({
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255,255,255,0.96)',
        borderColor: '#e2e8f0',
        textStyle: { color: '#0f172a', fontSize: 12 },
        formatter: (params: unknown) => {
          const arr = params as Array<{ name: string; value: number }>;
          const item = arr?.[0];
          if (!item) return '';
          return `<div style="font-weight:600">${item.name}</div><div>Count: <b>${item.value}</b></div>`;
        },
      },
      grid: { left: 48, right: 20, top: 20, bottom: 42 },
      xAxis: {
        type: 'category',
        data: histogramData.bins.map((b) => b.label),
        axisLabel: { color: '#64748b', fontSize: 10, rotate: histTab === 'hourOfDay' ? 35 : 0 },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        splitLine: { lineStyle: { color: '#f1f5f9' } },
        axisLabel: { color: '#64748b', fontSize: 10 },
      },
      series: [
        {
          name: 'Frequency',
          type: 'bar',
          barWidth: '82%',
          itemStyle: { color: '#0071E3', borderRadius: [5, 5, 0, 0] },
          data: histogramData.bins.map((b) => b.count),
        },
      ],
    }),
    [histogramData, histTab]
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Analytics &amp; Financial Charts
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Interactive sales share, expense breakdown, cash &amp; receivables candlesticks, and distribution histograms (opening balances excluded from operational sales/expenses)
          </p>
        </div>

        {onNavigate && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
            >
              <BarChart2 className="w-3.5 h-3.5" />
              Financial Reports
            </button>
            <button
              type="button"
              onClick={() => onNavigate('accounting', { accountingTab: 'statements' })}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
            >
              <BookOpen className="w-3.5 h-3.5" />
              Accounting Ledger
            </button>
            <button
              type="button"
              onClick={() => onNavigate('accounting', { accountingTab: 'drawCashIn' })}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-xl bg-blue-50 border border-blue-200 text-[#0071E3] hover:bg-blue-100"
            >
              <ArrowUpRight className="w-3.5 h-3.5" />
              Sudden Add / Deduct
            </button>
          </div>
        )}
      </div>

      {/* Live Liquid Money Sources Breakdown */}
      <div className="liquid-glass rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
            <Wallet className="w-4 h-4 text-[#0071E3]" />
            <span>Money Sources Liquidity (Cash, Bank &amp; E-Wallets)</span>
          </div>
          <span className="text-xs font-mono font-semibold text-[#0071E3]">
            Total Liquidity: {formatMoney(totalLiquidity, sym)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          {moneySources.map((acc) => (
            <div
              key={acc.code}
              className="px-3 py-2 rounded-xl bg-white/85 border border-slate-200/80 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-900 truncate">{acc.name}</p>
                <p className="text-[10px] font-mono text-slate-500">
                  {acc.code} · {acc.channel || 'Asset'}
                </p>
              </div>
              <span className="text-xs font-mono font-semibold text-slate-900 tabular-nums shrink-0">
                {formatMoney(acc.balance, sym)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Shared Top Global Filter Bar */}
      <div className="liquid-glass rounded-2xl p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 pr-1">
            <Filter className="w-3.5 h-3.5 text-[#0071E3]" />
            Range:
          </span>
          {(['Today', 'Weekly', 'Monthly', 'Yearly'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => applyPreset(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors whitespace-nowrap ${
                preset === p
                  ? 'bg-[#0071E3] border-[#0071E3] text-white'
                  : 'bg-white border-slate-200 text-slate-700 hover:border-[#0071E3]'
              }`}
            >
              {p}
            </button>
          ))}
          <input
            type="date"
            value={fromDate}
            onChange={(e) => {
              setPreset('Custom');
              setFromDate(e.target.value);
            }}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
          />
          <span className="text-xs text-slate-400">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => {
              setPreset('Custom');
              setToDate(e.target.value);
            }}
            className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
            {(['Daily', 'Weekly', 'Monthly', 'Yearly'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGrouping(g)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                  grouping === g ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <select
            value={customerScope}
            onChange={(e) => {
              setCustomerScope(e.target.value);
              setDrillSlice(null);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-800"
          >
            <option value="ALL">All Customers (Retail + Corporate)</option>
            <option value="RETAIL">Retail Customers Only</option>
            {state.corporateCustomers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.billingBasis})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 1: Chart 1 (Sales Share Pie) + Chart 2 (Expense Category Pie) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <div className="liquid-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-[#0071E3]" />
                Sales Share (Corporate vs Retail)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Corporate reflects Delivered-wise or Received-wise basis · Click any slice to inspect orders
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => exportPng(salesPieRef.current, 'sales-share.png')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                PNG
              </button>
              {canExportReports && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'sales-share.csv',
                      ['Segment', 'Amount', 'Share %'],
                      salesShareData.map((d) => [
                        d.name,
                        d.value,
                        totalSalesShare > 0 ? ((d.value / totalSalesShare) * 100).toFixed(2) : 0,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
          </div>

          {salesShareData.length === 0 ? (
            <div className="h-[310px] flex items-center justify-center text-xs text-slate-500">
              No operational sales recorded in {fromDate} to {toDate}.
            </div>
          ) : (
            <EChartBox
              option={salesPieOption}
              height={310}
              onInit={(inst) => {
                salesPieRef.current = inst;
              }}
              onChartClick={(params) => {
                const p = params as { name?: string };
                const found = salesShareData.find((s) => s.name === p?.name);
                if (found) {
                  setDrillSlice({
                    key: found.key,
                    label: found.name,
                    isRetail: found.isRetail,
                    corp: found.corp,
                  });
                }
              }}
            />
          )}

          {drillSlice && (
            <div className="pt-3 border-t border-slate-200/70 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-800">
                  Drill-down: {drillSlice.label} ({drillRecords.length} entries)
                </p>
                <button
                  type="button"
                  onClick={() => setDrillSlice(null)}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="Close drill-down"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="max-h-40 overflow-y-auto divide-y divide-slate-200/60 text-xs">
                {drillRecords.map((rec, idx) => (
                  <div key={`${rec.id}-${idx}`} className="py-1.5 flex items-center justify-between gap-2">
                    <span className="truncate">
                      <span className="font-mono font-semibold text-slate-700">{rec.id}</span> ·{' '}
                      {rec.title} <span className="text-slate-500">({rec.detail})</span>
                    </span>
                    <span className="font-mono font-semibold text-slate-900 whitespace-nowrap">
                      {formatMoney(rec.amount, sym)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chart 2: Expense Category Pie */}
        <div className="liquid-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <PieChartIcon className="w-4 h-4 text-[#0071E3]" />
                Expense Breakdown by Category
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Includes operating expenses, chemicals used &amp; staff payroll · Excludes Owner Draw &amp; Opening Balance
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => exportPng(expensePieRef.current, 'expense-breakdown.png')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                PNG
              </button>
              {canExportReports && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'expense-breakdown.csv',
                      ['Category', 'Amount', 'Share %'],
                      expensePieData.map((d) => [
                        d.name,
                        d.value,
                        totalExpensePie > 0 ? ((d.value / totalExpensePie) * 100).toFixed(2) : 0,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] whitespace-nowrap"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
          </div>

          {expensePieData.length === 0 ? (
            <div className="h-[310px] flex items-center justify-center text-xs text-slate-500">
              No operating expenses logged in {fromDate} to {toDate}.
            </div>
          ) : (
            <EChartBox
              option={expensePieOption}
              height={310}
              onInit={(inst) => {
                expensePieRef.current = inst;
              }}
            />
          )}
        </div>
      </div>

      {/* Row 2: Chart 3 (Cash Flow Candlestick) + Chart 4 (Receivables / Dues Candlestick) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
        {/* Chart 3: Cash Flow Candlestick */}
        <div className="liquid-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <CandlestickChart className="w-4 h-4 text-[#0071E3]" />
                Cash Flow Candlestick (Cash + Bank OHLC)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Green = net inflow (close ≥ open) · Red = net outflow (close &lt; open) · Starting from opening balance
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCashVolume}
                  onChange={(e) => setShowCashVolume(e.target.checked)}
                />
                In/Out Bars
              </label>
              <button
                type="button"
                onClick={() => exportPng(cashCandleRef.current, 'cash-flow-candlestick.png')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
              >
                <Download className="w-3 h-3" />
                PNG
              </button>
              {canExportReports && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'cash-flow-ohlc.csv',
                      ['Period', 'Open', 'High', 'Low', 'Close', 'Cash In', 'Cash Out', 'Net'],
                      cashCandleSeries.map((r) => [
                        r.label,
                        r.open,
                        r.high,
                        r.low,
                        r.close,
                        r.cashIn,
                        r.cashOut,
                        r.net,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
          </div>

          {cashCandleSeries.length === 0 ? (
            <div className="h-[340px] flex items-center justify-center text-xs text-slate-500">
              Select a valid date range to view Cash + Bank balance candles.
            </div>
          ) : (
            <EChartBox
              option={cashCandleOption}
              height={340}
              onInit={(inst) => {
                cashCandleRef.current = inst;
              }}
            />
          )}
        </div>

        {/* Chart 4: Sales Credit/Debit Candlestick */}
        <div className="liquid-glass rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <CandlestickChart className="w-4 h-4 text-[#0071E3]" />
                Sales Credit / Debit Candlestick (Customer Dues OHLC)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Green = dues collected/reduced (close ≤ open) · Red = new credit dues added (close &gt; open)
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => exportPng(arCandleRef.current, 'receivables-candlestick.png')}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
              >
                <Download className="w-3 h-3" />
                PNG
              </button>
              {canExportReports && (
                <button
                  type="button"
                  onClick={() =>
                    downloadCsv(
                      'receivables-ohlc.csv',
                      ['Period', 'Open Dues', 'High Dues', 'Low Dues', 'Close Dues', 'Billed', 'Collected', 'Net'],
                      arCandleSeries.map((r) => [
                        r.label,
                        r.open,
                        r.high,
                        r.low,
                        r.close,
                        r.billed,
                        r.collected,
                        r.net,
                      ])
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
                >
                  <FileSpreadsheet className="w-3 h-3" />
                  CSV
                </button>
              )}
            </div>
          </div>

          {arCandleSeries.length === 0 ? (
            <div className="h-[340px] flex items-center justify-center text-xs text-slate-500">
              Select a valid date range to view Receivables balance candles.
            </div>
          ) : (
            <EChartBox
              option={arCandleOption}
              height={340}
              onInit={(inst) => {
                arCandleRef.current = inst;
              }}
            />
          )}
        </div>
      </div>

      {/* Row 3: Chart 5 (Tabbed Sales Histograms) */}
      <div className="liquid-glass rounded-2xl p-6 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-[#0071E3]" />
              Sales Distribution Histograms
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Analyze order ticket size, daily revenue spread, basket size, and peak intake hours
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {histTab !== 'hourOfDay' && (
              <div className="flex items-center gap-2 text-xs">
                <label className="text-slate-500">Bins:</label>
                <input
                  type="number"
                  min={3}
                  max={16}
                  value={histBinCount}
                  onChange={(e) => {
                    setHistBinStep('');
                    setHistBinCount(Math.max(3, Math.min(16, Number(e.target.value) || 6)));
                  }}
                  className="w-14 px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                />
                <label className="text-slate-500">or Step:</label>
                <input
                  type="number"
                  min={1}
                  placeholder="Auto"
                  value={histBinStep}
                  onChange={(e) => setHistBinStep(e.target.value)}
                  className="w-20 px-2 py-1 font-mono rounded-lg bg-white border border-slate-200"
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => exportPng(histChartRef.current, `sales-histogram-${histTab}.png`)}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
            >
              <Download className="w-3 h-3" />
              PNG
            </button>
            {canExportReports && (
              <button
                type="button"
                onClick={() =>
                  downloadCsv(
                    `sales-histogram-${histTab}.csv`,
                    ['Bucket', 'Count'],
                    histogramData.bins.map((b) => [b.label, b.count])
                  )
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3]"
              >
                <FileSpreadsheet className="w-3 h-3" />
                CSV
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl w-fit">
          {(
            [
              { id: 'orderValue', label: 'Order Value Distribution' },
              { id: 'dailySales', label: 'Daily Sales Distribution' },
              { id: 'itemsPerOrder', label: 'Items Per Order' },
              { id: 'hourOfDay', label: 'Orders by Hour of Day' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setHistTab(t.id);
                setHistBinStep('');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                histTab === t.id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {histogramData.sampleCount === 0 ? (
          <div className="h-[290px] flex items-center justify-center text-xs text-slate-500">
            No operational orders or corporate movements found in {fromDate} to {toDate}.
          </div>
        ) : (
          <EChartBox
            option={histogramOption}
            height={290}
            onInit={(inst) => {
              histChartRef.current = inst;
            }}
          />
        )}

        {/* Mean & Median Stats */}
        <div className="pt-3 border-t border-slate-200/70 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3 rounded-xl bg-white/75 border border-slate-200/70">
            <span className="text-slate-500">Samples Analyzed</span>
            <p className="text-base font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
              {histogramData.sampleCount}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/75 border border-slate-200/70">
            <span className="text-slate-500">Mean (Average)</span>
            <p className="text-base font-mono font-semibold text-[#0071E3] mt-0.5 tabular-nums">
              {histTab === 'hourOfDay'
                ? `${Math.round(histogramData.stats.mean)}:00`
                : histTab === 'itemsPerOrder'
                ? `${histogramData.stats.mean} pcs`
                : formatMoney(histogramData.stats.mean, sym)}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/75 border border-slate-200/70">
            <span className="text-slate-500">Median (Middle Value)</span>
            <p className="text-base font-mono font-semibold text-slate-900 mt-0.5 tabular-nums">
              {histTab === 'hourOfDay'
                ? `${Math.round(histogramData.stats.median)}:00`
                : histTab === 'itemsPerOrder'
                ? `${histogramData.stats.median} pcs`
                : formatMoney(histogramData.stats.median, sym)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

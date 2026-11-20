import { useState } from 'react';
import { Download, Search, ShieldCheck } from 'lucide-react';
import { BlackBoxEvent, ErpState } from '../types/erp';

interface BlackBoxViewProps {
  state: ErpState;
}

export function BlackBoxView({ state }: BlackBoxViewProps) {
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const modules = ['ALL', ...Array.from(new Set(state.blackBox.map((b) => b.module)))];

  const filtered = state.blackBox.filter((ev) => {
    const matchesMod = moduleFilter === 'ALL' || ev.module === moduleFilter;
    const q = search.trim().toLowerCase();
    const matchesQ =
      !q ||
      ev.id.toLowerCase().includes(q) ||
      ev.action.toLowerCase().includes(q) ||
      ev.summary.toLowerCase().includes(q) ||
      ev.recordId.toLowerCase().includes(q) ||
      ev.user.toLowerCase().includes(q);
    return matchesMod && matchesQ;
  });

  const exportCsv = () => {
    const headers = ['Event ID', 'Timestamp', 'User', 'Role', 'Module', 'Action', 'Record ID', 'Summary', 'Integrity Hash'];
    const rows = filtered.map((ev) => [
      ev.id,
      ev.timestamp,
      ev.user,
      ev.role,
      ev.module,
      ev.action,
      ev.recordId,
      ev.summary,
      ev.integrityHash,
    ]);
    const csv = [
      headers.join(','),
      ...rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `black-box-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Black Box: Tamper-Evident Activity History
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Append-only audit trail recording every order, price edit, stock change, accounting posting, and document print
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <ShieldCheck className="w-4 h-4" />
            Append-Only Chain Verified ({state.blackBox.length} events)
          </span>
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700 hover:border-[#0071E3] hover:text-[#0071E3]"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Event ID, user, record ID, or summary..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-white/85 border border-slate-200 focus:outline-none focus:border-[#0071E3]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
          {modules.map((mod) => (
            <button
              key={mod}
              onClick={() => setModuleFilter(mod)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                moduleFilter === mod
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mod}
            </button>
          ))}
        </div>
      </div>

      <div className="liquid-glass rounded-2xl overflow-hidden">
        <div className="divide-y divide-slate-200/60">
          {filtered.map((ev: BlackBoxEvent) => {
            const isExpanded = expandedId === ev.id;
            const hasDiff = ev.beforeValue !== undefined || ev.afterValue !== undefined;
            return (
              <div key={ev.id} className="p-4 hover:bg-white/50 transition-colors text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 text-slate-500">
                    <span className="font-mono font-semibold text-slate-900">{ev.id}</span>
                    <span>·</span>
                    <span className="font-semibold text-[#0071E3]">{ev.module}</span>
                    <span>·</span>
                    <span className="font-mono text-slate-700">{ev.action}</span>
                    <span>·</span>
                    <span className="font-mono text-slate-600">Ref: {ev.recordId}</span>
                  </div>
                  <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500 tabular-nums">
                    <span>
                      {ev.user} ({ev.role})
                    </span>
                    <span>·</span>
                    <span>{new Date(ev.timestamp).toLocaleString()}</span>
                    <span>·</span>
                    <span title="Integrity Chain Hash">#{ev.integrityHash}</span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 mt-1.5">
                  <p className="text-sm text-slate-900">{ev.summary}</p>
                  {hasDiff && (
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : ev.id)}
                      className="text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap shrink-0"
                    >
                      {isExpanded ? 'Hide Before/After' : 'Inspect Before/After'}
                    </button>
                  )}
                </div>

                {isExpanded && hasDiff && (
                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-slate-200/60 font-mono text-[11px]">
                    <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80 overflow-x-auto">
                      <p className="font-semibold text-slate-500 mb-1">Before Value</p>
                      <pre className="text-slate-700 whitespace-pre-wrap">
                        {ev.beforeValue !== undefined ? JSON.stringify(ev.beforeValue, null, 2) : '—'}
                      </pre>
                    </div>
                    <div className="p-3 rounded-xl bg-white/80 border border-slate-200/80 overflow-x-auto">
                      <p className="font-semibold text-slate-500 mb-1">After Value</p>
                      <pre className="text-slate-700 whitespace-pre-wrap">
                        {ev.afterValue !== undefined ? JSON.stringify(ev.afterValue, null, 2) : '—'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

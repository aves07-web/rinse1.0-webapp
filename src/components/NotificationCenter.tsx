import { Bell, CheckCheck, ExternalLink, X } from 'lucide-react';
import { NotificationItem, NotificationRule } from '../types/erp';

interface NotificationCenterProps {
  open: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  rules: NotificationRule[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onNavigate: (section: string) => void;
  onToggleRule: (ruleId: string) => void;
  onRunScan: () => void;
  browserPermission: NotificationPermission | 'unsupported';
  onRequestBrowserPermission: () => void;
}

export function NotificationCenter({
  open,
  onClose,
  notifications,
  rules,
  onMarkRead,
  onMarkAllRead,
  onNavigate,
  onToggleRule,
  onRunScan,
  browserPermission,
  onRequestBrowserPermission,
}: NotificationCenterProps) {
  if (!open) return null;

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/20 backdrop-blur-xs">
      <div
        className="w-full max-w-md h-full liquid-glass border-l border-white/90 flex flex-col overflow-hidden"
        role="dialog"
        aria-label="Automated Notifications Center"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200/70">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Automated Notifications</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {unreadCount} unread · {rules.filter((r) => r.enabled).length} active automation rules
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-900 hover:bg-slate-200/50 transition-colors"
            aria-label="Close notifications"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-slate-200/60 flex items-center justify-between gap-2 bg-white/40">
          <div className="flex items-center gap-2">
            <button
              onClick={onRunScan}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#0071E3] text-white hover:bg-[#0077ED] transition-colors whitespace-nowrap"
            >
              Run Rule Scan
            </button>
            {browserPermission === 'default' && (
              <button
                onClick={onRequestBrowserPermission}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap"
              >
                Enable Desktop Alerts
              </button>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              onClick={onMarkAllRead}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#0071E3] hover:underline whitespace-nowrap"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all read
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-slate-500">Recent Alerts</h3>
            {notifications.length === 0 ? (
              <div className="p-6 text-center rounded-2xl bg-white/60 border border-slate-200/70">
                <Bell className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">All operational alerts clear</p>
                <p className="text-xs text-slate-500 mt-1">
                  Automated checks run continuously for deliveries, stock thresholds, and billing cutoffs.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((n) => {
                  const severityLabel =
                    n.severity === 'urgent'
                      ? 'Urgent'
                      : n.severity === 'warning'
                      ? 'Attention'
                      : n.severity === 'success'
                      ? 'Completed'
                      : 'Notice';
                  const severityColor =
                    n.severity === 'urgent'
                      ? 'text-red-600'
                      : n.severity === 'warning'
                      ? 'text-amber-600'
                      : n.severity === 'success'
                      ? 'text-emerald-600'
                      : 'text-[#0071E3]';

                  return (
                    <div
                      key={n.id}
                      className={`p-3.5 rounded-2xl border transition-colors ${
                        n.read
                          ? 'bg-white/45 border-slate-200/60'
                          : 'bg-white/90 border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs">
                          <span className={`font-semibold ${severityColor}`}>{severityLabel}</span>
                          <span className="text-slate-300">·</span>
                          <span className="text-slate-500 tabular-nums">
                            {new Date(n.createdAt).toLocaleString([], {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        {!n.read && (
                          <button
                            onClick={() => onMarkRead(n.id)}
                            className="text-xs text-[#0071E3] hover:underline whitespace-nowrap"
                          >
                            Dismiss
                          </button>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-slate-900 mt-1">{n.title}</p>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">{n.message}</p>
                      {n.linkedSection && (
                        <button
                          onClick={() => {
                            onNavigate(n.linkedSection!);
                            onClose();
                          }}
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#0071E3] hover:underline"
                        >
                          Open {n.linkedSection}
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3 pt-2 border-t border-slate-200/70">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-slate-500">Automation Rules</h3>
              <span className="text-xs text-slate-400">
                Desktop API: {browserPermission === 'granted' ? 'Active' : browserPermission}
              </span>
            </div>
            <div className="space-y-2">
              {rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-3 rounded-xl bg-white/60 border border-slate-200/70"
                >
                  <div className="min-w-0 pr-3">
                    <p className="text-xs font-semibold text-slate-800 truncate">{rule.name}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {rule.leadMinutes > 0
                        ? `Triggers ${Math.round(rule.leadMinutes / 60)}h before deadline`
                        : 'Triggers immediately when threshold met'}
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleRule(rule.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      rule.enabled
                        ? 'bg-[#0071E3] text-white'
                        : 'bg-slate-200/80 text-slate-600 hover:bg-slate-300/70'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Paused'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

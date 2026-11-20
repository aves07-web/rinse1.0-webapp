import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  CalendarClock,
  CheckCircle2,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  Plus,
  Printer,
  Scale,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Tag,
  TrendingUp,
  Users,
  WalletCards,
  X,
} from 'lucide-react';
import { AccountingView } from './components/AccountingView';
import { AnalyticsView } from './components/AnalyticsView';
import { BlackBoxView } from './components/BlackBoxView';
import { CatalogueView } from './components/CatalogueView';
import { ConfirmDeleteModal, DeleteConfirmationRequest } from './components/ConfirmDeleteModal';
import { CorporateView } from './components/CorporateView';
import { CustomersView } from './components/CustomersView';
import { DashboardView } from './components/DashboardView';
import { DocumentsPrintView } from './components/DocumentsPrintView';
import { EmployeesExpensesView } from './components/EmployeesExpensesView';
import { InventoryView } from './components/InventoryView';
import { LoginView } from './components/LoginView';
import { NotificationCenter } from './components/NotificationCenter';
import { OpeningBalanceView } from './components/OpeningBalanceView';
import { OrdersView } from './components/OrdersView';
import { ReportsView } from './components/ReportsView';
import { SettingsView } from './components/SettingsView';
import { QuickAddMoneyAccountParams } from './components/SplitPaymentInput';
import { TasksCalendarView } from './components/TasksCalendarView';
import { INITIAL_ERP_STATE } from './data/seedData';
import {
  Account,
  AccountType,
  AppSettings,
  BillingBasis,
  BillingCycle,
  ChemicalItem,
  CorporateCustomer,
  CorporateMovement,
  CorporateMovementType,
  Customer,
  CustomerCategory,
  DeliveryOption,
  Employee,
  ErpState,
  GitHubSyncStatus,
  IdFormatKey,
  IdFormatRule,
  Invoice,
  JournalEntry,
  JournalLine,
  MoneySourceChannel,
  NavSection,
  NotificationItem,
  OnlinePresenceUser,
  OpeningBalanceDraft,
  Order,
  OrderException,
  OrderStage,
  PaymentSplit,
  PayrollRecord,
  Product,
  RoleActionPermissions,
  ScheduledTask,
  Service,
  StockMovement,
  Supplier,
  UserAccount,
  UserRole,
} from './types/erp';
import {
  applyJournalToAccounts,
  buildJournalEntry,
  createBlackBoxEvent,
  generateNextMoneyAccountCode,
  inferMoneyChannel,
  isMoneySourceAccount,
  normalizePaymentSplits,
} from './utils/accounting';
import { getCorporateBrandColor, migrateErpState } from './utils/migration';
import {
  DEFAULT_ID_FORMATS,
  generateNextSmartId,
  getExistingIdsForType,
} from './utils/smartId';

import rinseLogo from './assets/images/rinse_logo_1795028808300.jpg';

const SESSION_USER_KEY = 'atelier_linen_user_id';

function safeSessionGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(key, value);
    }
  } catch {
    // ignore when storage is blocked in third-party iframe
  }
}

function safeSessionRemove(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.sessionStorage.removeItem(key);
    }
  } catch {
    // ignore when storage is blocked in third-party iframe
  }
}

function safeNotificationPermission(): NotificationPermission | 'unsupported' {
  try {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
  } catch {
    // ignore restricted environment
  }
  return 'unsupported';
}

export default function App() {
  const [state, setState] = useState<ErpState>(INITIAL_ERP_STATE);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(() =>
    safeSessionGet(SESSION_USER_KEY)
  );
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [accountingInitialTab, setAccountingInitialTab] = useState<
    'statements' | 'journals' | 'drawCashIn' | 'coa'
  >('statements');
  const [permissionError, setPermissionError] = useState<string>('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [quickSearchOpen, setQuickSearchOpen] = useState(false);
  const [quickSearchQuery, setQuickSearchQuery] = useState('');
  const [openOrderIntakeFlag, setOpenOrderIntakeFlag] = useState(false);
  const [docViewTarget, setDocViewTarget] = useState<{ mode: 'invoice' | 'token'; id?: string }>({
    mode: 'invoice',
  });
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission | 'unsupported'>(
    () => safeNotificationPermission()
  );

  // Safe Undo / Redo stacks for non-posted edits (Catalogue & Tasks)
  const [undoStack, setUndoStack] = useState<ErpState[]>([]);
  const [redoStack, setRedoStack] = useState<ErpState[]>([]);

  // Centralized Delete Confirmation Modal & Toast Feedback
  const [deleteRequest, setDeleteRequest] = useState<DeleteConfirmationRequest | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToastMsg(msg);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const currentUser = useMemo(() => {
    if (!currentUserId) return null;
    return state.users.find((u) => u.id === currentUserId && u.active) || null;
  }, [currentUserId, state.users]);

  const currentUserRole: UserRole = currentUser?.role ?? 'Floor Operator';
  const activeUserName = currentUser ? `${currentUser.displayName} (${currentUser.id})` : 'Guest';

  const activePerms = useMemo(() => {
    const perms =
      state.rolePermissions?.[currentUserRole] ||
      INITIAL_ERP_STATE.rolePermissions[currentUserRole];
    return perms;
  }, [state.rolePermissions, currentUserRole]);

  const allowedSections = useMemo<NavSection[]>(() => {
    if (!currentUser) return [];
    if (currentUser.role === 'Owner') {
      return [
        'dashboard',
        'analytics',
        'tasks',
        'orders',
        'customers',
        'corporate',
        'catalogue',
        'inventory',
        'accounting',
        'opening-balance',
        'employees',
        'documents',
        'reports',
        'blackbox',
        'settings',
      ];
    }
    // Strictly hide Black Box from every non-Owner role
    return activePerms.visibleSections.filter((s) => s !== 'blackbox');
  }, [currentUser, activePerms]);

  useEffect(() => {
    if (currentUser && allowedSections.length > 0 && !allowedSections.includes(activeSection)) {
      setActiveSection(allowedSections[0]);
    }
  }, [currentUser, allowedSections, activeSection]);

  // Multi-user WebSocket real-time sync & presence state
  const clientIdRef = useRef<string>(
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const syncedRevisionRef = useRef<number>(1);
  const isRemoteUpdateRef = useRef<boolean>(false);
  const wsRef = useRef<WebSocket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlinePresenceUser[]>([]);
  const [githubStatus, setGithubStatus] = useState<GitHubSyncStatus | null>(null);
  const [backendMode, setBackendMode] = useState<'unknown' | 'server' | 'static'>('unknown');

  const STATIC_STATE_KEY = 'rinse_static_erp_state_v2';

  const refreshGitHubStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/github/status');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = (await res.json()) as GitHubSyncStatus;
        setGithubStatus(data);
      }
    } catch {
      // ignore offline or static host
    }
  }, []);

  // Load persisted state from server on mount (or localStorage on static hosts like GitHub Pages)
  useEffect(() => {
    let active = true;
    fetch('/api/state')
      .then(async (res) => {
        const ct = res.headers.get('content-type') || '';
        if (!res.ok || !ct.includes('application/json')) {
          throw new Error('Static host or backend unavailable');
        }
        return (await res.json()) as Partial<ErpState>;
      })
      .then((data) => {
        if (!active) return;
        setBackendMode('server');
        if (data && data.settings && Array.isArray(data.accounts)) {
          const migrated = migrateErpState(data);
          isRemoteUpdateRef.current = true;
          syncedRevisionRef.current = migrated.syncRevision ?? 1;
          setState(migrated);
        }
        refreshGitHubStatus();
      })
      .catch(() => {
        if (!active) return;
        setBackendMode('static');
        try {
          const raw = window.localStorage.getItem(STATIC_STATE_KEY);
          if (raw) {
            const parsed = JSON.parse(raw) as Partial<ErpState>;
            if (parsed && parsed.settings && Array.isArray(parsed.accounts)) {
              isRemoteUpdateRef.current = true;
              setState(migrateErpState(parsed));
            }
          }
        } catch {
          // ignore blocked storage
        }
      })
      .finally(() => {
        if (active) setLoadedFromServer(true);
      });
    return () => {
      active = false;
    };
  }, [refreshGitHubStatus]);

  // Connect WebSocket for live multi-user sync across connected browsers
  const currentUserRef = useRef(currentUser);
  useEffect(() => {
    currentUserRef.current = currentUser;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'presence:identify',
          clientId: clientIdRef.current,
          userId: currentUser?.id,
          displayName: currentUser?.displayName,
          role: currentUser?.role,
        })
      );
    }
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined' || backendMode !== 'server') return;
    let closedByEffect = false;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connectWs = () => {
      if (closedByEffect) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        return;
      }
      wsRef.current = ws;

      ws.onopen = () => {
        attempt = 0;
        const user = currentUserRef.current;
        ws.send(
          JSON.stringify({
            type: 'presence:identify',
            clientId: clientIdRef.current,
            userId: user?.id,
            displayName: user?.displayName,
            role: user?.role,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as {
            type?: string;
            revision?: number;
            originClientId?: string;
            state?: Partial<ErpState>;
            onlineUsers?: OnlinePresenceUser[];
            githubStatus?: GitHubSyncStatus;
            status?: GitHubSyncStatus;
          };

          if (msg.type === 'sync:init' || msg.type === 'state:updated') {
            if (msg.originClientId && msg.originClientId === clientIdRef.current) {
              if (typeof msg.revision === 'number') {
                syncedRevisionRef.current = msg.revision;
              }
              return;
            }
            if (msg.state && msg.state.settings && Array.isArray(msg.state.accounts)) {
              const incomingRev = msg.revision ?? msg.state.syncRevision ?? 1;
              if (msg.type === 'sync:init' && incomingRev < syncedRevisionRef.current) {
                return;
              }
              const migrated = migrateErpState(msg.state);
              isRemoteUpdateRef.current = true;
              syncedRevisionRef.current = incomingRev;
              setState(migrated);
              setLoadedFromServer(true);
            }
            if (msg.onlineUsers) setOnlineUsers(msg.onlineUsers);
            if (msg.githubStatus) setGithubStatus(msg.githubStatus);
          } else if (msg.type === 'presence:update' && msg.onlineUsers) {
            setOnlineUsers(msg.onlineUsers);
          } else if (msg.type === 'github:status' && msg.status) {
            setGithubStatus(msg.status);
          }
        } catch {
          // ignore malformed ws message
        }
      };

      ws.onclose = () => {
        if (closedByEffect) return;
        const delayMs = Math.min(10000, 1000 * Math.pow(1.5, Math.min(attempt, 6)));
        attempt += 1;
        reconnectTimer = window.setTimeout(connectWs, delayMs);
      };
    };

    connectWs();

    return () => {
      closedByEffect = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          // ignore
        }
        wsRef.current = null;
      }
    };
  }, [backendMode]);

  // Persist state atomically to server (or localStorage on static hosts) when modified locally
  const saveTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!loadedFromServer) return;
    if (isRemoteUpdateRef.current) {
      isRemoteUpdateRef.current = false;
      return;
    }
    if (backendMode === 'static') {
      try {
        window.localStorage.setItem(STATIC_STATE_KEY, JSON.stringify(state));
      } catch {
        // ignore storage quota/blocked
      }
      return;
    }
    if (backendMode !== 'server') return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            state,
            baseRevision: syncedRevisionRef.current,
            updatedBy: activeUserName,
            clientId: clientIdRef.current,
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { revision?: number };
          if (typeof data.revision === 'number') {
            syncedRevisionRef.current = data.revision;
          }
        } else if (res.status === 409) {
          const conflict = (await res.json()) as {
            currentRevision?: number;
            latestState?: Partial<ErpState>;
          };
          if (conflict.latestState && conflict.latestState.settings) {
            isRemoteUpdateRef.current = true;
            syncedRevisionRef.current = conflict.currentRevision ?? syncedRevisionRef.current;
            setState(migrateErpState(conflict.latestState));
            showToast('Another team member saved a newer update. Synced to latest shared data.');
          }
        }
      } catch {
        // ignore network hiccup
      }
    }, 250);
    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [state, loadedFromServer, backendMode, activeUserName, showToast]);

  const commitState = useCallback(
    (updater: (prev: ErpState) => ErpState, recordUndo = false) => {
      setState((prev) => {
        if (recordUndo) {
          setUndoStack((u) => [prev, ...u.slice(0, 14)]);
          setRedoStack([]);
        }
        return updater(prev);
      });
    },
    []
  );

  // Automated Notification Rules Scanner
  const runAutomatedRuleScan = useCallback(() => {
    setState((prev) => {
      const generated: NotificationItem[] = [];
      const nowMs = Date.now();

      const ruleEnabled = (type: ErpState['notificationRules'][number]['triggerType']) =>
        prev.notificationRules.find((r) => r.triggerType === type)?.enabled ?? false;

      if (ruleEnabled('LowChemicalStock')) {
        for (const chem of prev.chemicals) {
          if (chem.currentQty <= chem.lowStockThreshold) {
            const exists = prev.notifications.some(
              (n) => !n.read && n.linkedRecordId === chem.id && n.ruleId === 'rule-stock'
            );
            if (!exists) {
              generated.push({
                id: `NOTIF-${nowMs}-${chem.id}`,
                title: `Low Stock Alert: ${chem.name}`,
                message: `Current quantity is ${chem.currentQty} ${chem.unit} (threshold: ${chem.lowStockThreshold} ${chem.unit}).`,
                severity: 'warning',
                createdAt: new Date().toISOString(),
                read: false,
                ruleId: 'rule-stock',
                linkedSection: 'inventory',
                linkedRecordId: chem.id,
              });
            }
          }
        }
      }

      if (ruleEnabled('OrderDeliveryApproaching')) {
        const rule = prev.notificationRules.find((r) => r.triggerType === 'OrderDeliveryApproaching');
        const leadMs = (rule?.leadMinutes ?? 240) * 60000;
        for (const ord of prev.orders) {
          if (ord.stage === 'Delivered') continue;
          const dueMs = new Date(ord.expectedDeliveryAt).getTime();
          if (dueMs > nowMs && dueMs - nowMs <= leadMs) {
            const exists = prev.notifications.some(
              (n) => !n.read && n.linkedRecordId === ord.id && n.ruleId === 'rule-delivery'
            );
            if (!exists) {
              generated.push({
                id: `NOTIF-${nowMs}-${ord.id}`,
                title: `Delivery Approaching: ${ord.id}`,
                message: `${ord.customerName} (${ord.deliveryOptionName}) due at ${new Date(
                  ord.expectedDeliveryAt
                ).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`,
                severity: 'urgent',
                createdAt: new Date().toISOString(),
                read: false,
                ruleId: 'rule-delivery',
                linkedSection: 'orders',
                linkedRecordId: ord.id,
              });
            }
          }
        }
      }

      if (ruleEnabled('OrderOverdue')) {
        for (const ord of prev.orders) {
          if (ord.stage === 'Delivered') continue;
          if (new Date(ord.expectedDeliveryAt).getTime() < nowMs) {
            const exists = prev.notifications.some(
              (n) => !n.read && n.linkedRecordId === ord.id && n.ruleId === 'rule-overdue'
            );
            if (!exists) {
              generated.push({
                id: `NOTIF-${nowMs}-OVR-${ord.id}`,
                title: `Order Overdue: ${ord.id}`,
                message: `${ord.customerName} missed expected delivery time (${ord.stage}).`,
                severity: 'urgent',
                createdAt: new Date().toISOString(),
                read: false,
                ruleId: 'rule-overdue',
                linkedSection: 'orders',
                linkedRecordId: ord.id,
              });
            }
          }
        }
      }

      if (generated.length === 0) return prev;

      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification(generated[0].title, { body: generated[0].message });
        } catch {
          // ignore browser notification restrictions
        }
      }

      return {
        ...prev,
        notifications: [...generated, ...prev.notifications],
      };
    });
  }, []);

  // Periodic automated rule check every 60 seconds
  useEffect(() => {
    const id = window.setInterval(() => {
      runAutomatedRuleScan();
    }, 60000);
    return () => window.clearInterval(id);
  }, [runAutomatedRuleScan]);

  // Global keyboard shortcuts (Ctrl+K, Alt+N, Ctrl+Z, Ctrl+Shift+Z)
  useEffect(() => {
    if (!currentUser) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setQuickSearchOpen((v) => !v);
      } else if (e.altKey && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        if (
          allowedSections.includes('orders') &&
          (currentUser.role === 'Owner' || activePerms.actions.canCreateOrders)
        ) {
          setOpenOrderIntakeFlag(true);
          setActiveSection('orders');
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (undoStack.length > 0) {
          e.preventDefault();
          const prevSnap = undoStack[0];
          setRedoStack((r) => [state, ...r]);
          setUndoStack((u) => u.slice(1));
          setState(prevSnap);
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && e.shiftKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (redoStack.length > 0) {
          e.preventDefault();
          const nextSnap = redoStack[0];
          setUndoStack((u) => [state, ...u]);
          setRedoStack((r) => r.slice(1));
          setState(nextSnap);
        }
      } else if (e.key === 'Escape') {
        setQuickSearchOpen(false);
        setNotificationsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack, redoStack, state, currentUser, allowedSections, activePerms]);

  const requestBrowserPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const perm = await Notification.requestPermission();
    setBrowserPermission(perm);
  };

  const requireAction = useCallback(
    (allowed: boolean, actionLabel: string) => {
      if (currentUser?.role === 'Owner' || allowed) return true;
      setPermissionError(
        `Action restricted: "${currentUser?.role || 'Current role'}" does not have permission to ${actionLabel}.`
      );
      window.setTimeout(() => setPermissionError(''), 4500);
      return false;
    },
    [currentUser]
  );

  // --- AUTHENTICATION & OWNER RBAC HANDLERS ---

  const handleLoginSuccess = (user: UserAccount) => {
    safeSessionSet(SESSION_USER_KEY, user.id);
    setCurrentUserId(user.id);
    setPermissionError('');
    const rolePerms =
      state.rolePermissions?.[user.role] || INITIAL_ERP_STATE.rolePermissions[user.role];
    const permittedSections =
      user.role === 'Owner'
        ? (['dashboard'] as NavSection[])
        : rolePerms.visibleSections.filter((s) => s !== 'blackbox');
    setActiveSection(permittedSections.includes('dashboard') ? 'dashboard' : permittedSections[0] || 'dashboard');
    commitState((prev) => {
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: `${user.displayName} (${user.id})`,
        role: user.role,
        action: 'USER_LOGIN',
        module: 'Auth',
        recordId: user.id,
        summary: `${user.displayName} signed in as ${user.role}`,
      });
      return { ...prev, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleLogout = () => {
    if (currentUser) {
      commitState((prev) => {
        const bb = createBlackBoxEvent(prev.blackBox, {
          user: activeUserName,
          role: currentUser.role,
          action: 'USER_LOGOUT',
          module: 'Auth',
          recordId: currentUser.id,
          summary: `${currentUser.displayName} signed out`,
        });
        return { ...prev, blackBox: [bb, ...prev.blackBox] };
      });
    }
    safeSessionRemove(SESSION_USER_KEY);
    setCurrentUserId(null);
    setMobileMenuOpen(false);
    setQuickSearchOpen(false);
    setNotificationsOpen(false);
    setPermissionError('');
  };

  const handleCreateUser = (user: Omit<UserAccount, 'createdAt' | 'active'>) => {
    if (currentUser?.role !== 'Owner') return;
    commitState((prev) => {
      if (prev.users.some((u) => u.id.toLowerCase() === user.id.toLowerCase())) return prev;
      const newUser: UserAccount = {
        ...user,
        id: user.id.trim().toLowerCase(),
        active: true,
        createdAt: new Date().toISOString(),
      };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'USER_ACCOUNT_CREATED',
        module: 'Security',
        recordId: newUser.id,
        summary: `Owner created login "${newUser.id}" for role ${newUser.role}`,
      });
      return { ...prev, users: [...prev.users, newUser], blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleUpdateUser = (id: string, patch: Partial<UserAccount>) => {
    if (currentUser?.role !== 'Owner') return;
    commitState((prev) => {
      const target = prev.users.find((u) => u.id === id);
      if (!target) return prev;
      const safePatch = id === 'owner' ? { ...patch, active: true, role: 'Owner' as UserRole } : patch;
      const nextUsers = prev.users.map((u) => (u.id === id ? { ...u, ...safePatch } : u));
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'USER_ACCOUNT_UPDATED',
        module: 'Security',
        recordId: id,
        summary: `Owner updated account "${id}" (${Object.keys(safePatch).join(', ')})`,
      });
      return { ...prev, users: nextUsers, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleToggleRoleSection = (role: Exclude<UserRole, 'Owner'>, section: NavSection) => {
    if (currentUser?.role !== 'Owner' || section === 'blackbox') return;
    commitState((prev) => {
      const currentList = prev.rolePermissions[role].visibleSections.filter((s) => s !== 'blackbox');
      const exists = currentList.includes(section);
      const nextList = exists
        ? currentList.filter((s) => s !== section)
        : [...currentList, section];
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ROLE_VISIBILITY_UPDATED',
        module: 'Security',
        recordId: role,
        summary: `${exists ? 'Hidden' : 'Enabled'} "${section}" page for role ${role}`,
      });
      return {
        ...prev,
        rolePermissions: {
          ...prev.rolePermissions,
          [role]: { ...prev.rolePermissions[role], visibleSections: nextList },
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleToggleRoleAction = (
    role: Exclude<UserRole, 'Owner'>,
    action: keyof RoleActionPermissions
  ) => {
    if (currentUser?.role !== 'Owner') return;
    commitState((prev) => {
      const currentVal = prev.rolePermissions[role].actions[action];
      const nextVal = !currentVal;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ROLE_CAPABILITY_UPDATED',
        module: 'Security',
        recordId: `${role}:${action}`,
        summary: `${nextVal ? 'Granted' : 'Revoked'} ${action} for role ${role}`,
      });
      return {
        ...prev,
        rolePermissions: {
          ...prev.rolePermissions,
          [role]: {
            ...prev.rolePermissions[role],
            actions: { ...prev.rolePermissions[role].actions, [action]: nextVal },
          },
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- DOMAIN ACTION HANDLERS ---

  const handleAddProduct = (name: string, type: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'edit catalogue products')) return;
    commitState((prev) => {
      const prod: Product = { id: `prod-${Date.now()}`, name, type, active: true };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'PRODUCT_CREATED',
        module: 'Catalogue',
        recordId: prod.id,
        summary: `Added retail product ${name} (${type})`,
        afterValue: prod,
      });
      return { ...prev, products: [...prev.products, prod], blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleUpdateProduct = (id: string, patch: Partial<Product>) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'edit catalogue products')) return;
    commitState((prev) => {
      const before = prev.products.find((p) => p.id === id);
      const nextProducts = prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p));
      const after = nextProducts.find((p) => p.id === id);
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'PRODUCT_UPDATED',
        module: 'Catalogue',
        recordId: id,
        summary: `Edited retail product ${before?.name || id}`,
        beforeValue: before,
        afterValue: after,
      });
      return { ...prev, products: nextProducts, blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleAddService = (name: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'edit catalogue services')) return;
    commitState((prev) => {
      const srv: Service = { id: `srv-${Date.now()}`, name, active: true };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SERVICE_CREATED',
        module: 'Catalogue',
        recordId: srv.id,
        summary: `Added retail service ${name}`,
        afterValue: srv,
      });
      return { ...prev, services: [...prev.services, srv], blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleUpdateService = (id: string, patch: Partial<Service>) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'edit catalogue services')) return;
    commitState((prev) => {
      const before = prev.services.find((s) => s.id === id);
      const nextServices = prev.services.map((s) => (s.id === id ? { ...s, ...patch } : s));
      const after = nextServices.find((s) => s.id === id);
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SERVICE_UPDATED',
        module: 'Catalogue',
        recordId: id,
        summary: `Updated retail service ${before?.name || id}`,
        beforeValue: before,
        afterValue: after,
      });
      return { ...prev, services: nextServices, blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleUpsertPrice = (productId: string, serviceId: string, price: number) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'modify pricing matrix')) return;
    commitState((prev) => {
      const existing = prev.prices.find(
        (p) => p.productId === productId && p.serviceId === serviceId
      );
      const prodName = prev.products.find((p) => p.id === productId)?.name || productId;
      const srvName = prev.services.find((s) => s.id === serviceId)?.name || serviceId;
      const nextPrices = existing
        ? prev.prices.map((p) => (p.id === existing.id ? { ...p, price } : p))
        : [...prev.prices, { id: `p-${Date.now()}`, productId, serviceId, price }];
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'RETAIL_PRICE_EDITED',
        module: 'Catalogue',
        recordId: `${productId}:${serviceId}`,
        summary: `Updated ${prodName} + ${srvName} price to ${prev.settings.currencySymbol} ${price}`,
        beforeValue: existing?.price ?? null,
        afterValue: price,
      });
      return { ...prev, prices: nextPrices, blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleUpdateIdFormat = (key: IdFormatKey, patch: Partial<IdFormatRule>) => {
    if (
      !requireAction(
        currentUser?.role === 'Owner' || activePerms.actions.canPostAccounting,
        'configure ID formats'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const currentRule = prev.idFormats?.[key] || DEFAULT_ID_FORMATS[key];
      const nextRule: IdFormatRule = { ...currentRule, ...patch };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ID_FORMAT_UPDATED',
        module: 'Settings',
        recordId: key,
        summary: `Updated ID format for ${nextRule.label} (${nextRule.prefix}${nextRule.separator}..., next #${nextRule.nextNumber})`,
        beforeValue: currentRule,
        afterValue: nextRule,
      });
      return {
        ...prev,
        idFormats: {
          ...DEFAULT_ID_FORMATS,
          ...(prev.idFormats || {}),
          [key]: nextRule,
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleRenameIssuedId = (
    kind: 'customer' | 'order' | 'invoice',
    oldId: string,
    newId: string
  ): boolean => {
    if (
      !requireAction(
        currentUser?.role === 'Owner' || activePerms.actions.canPostAccounting,
        'rename issued IDs'
      )
    ) {
      return false;
    }
    const cleanNew = newId.trim();
    if (!cleanNew || cleanNew === oldId) return false;
    commitState((prev) => {
      let nextCustomers = prev.customers;
      let nextOrders = prev.orders;
      let nextInvoices = prev.invoices;
      let nextCustomPrices = prev.customerCustomPrices;
      let nextMovements = prev.corporateMovements;
      let nextTasks = prev.tasks;
      let nextJournals = prev.journalEntries;

      if (kind === 'customer') {
        if (prev.customers.some((c) => c.id.toLowerCase() === cleanNew.toLowerCase())) return prev;
        nextCustomers = prev.customers.map((c) => (c.id === oldId ? { ...c, id: cleanNew } : c));
        nextOrders = prev.orders.map((o) =>
          o.customerId === oldId ? { ...o, customerId: cleanNew } : o
        );
        nextInvoices = prev.invoices.map((inv) =>
          inv.customerId === oldId ? { ...inv, customerId: cleanNew } : inv
        );
        nextCustomPrices = prev.customerCustomPrices.map((cp) =>
          cp.customerId === oldId ? { ...cp, customerId: cleanNew } : cp
        );
        nextJournals = prev.journalEntries.map((j) =>
          j.reference === oldId ? { ...j, reference: cleanNew } : j
        );
      } else if (kind === 'order') {
        if (prev.orders.some((o) => o.id.toLowerCase() === cleanNew.toLowerCase())) return prev;
        nextOrders = prev.orders.map((o) => (o.id === oldId ? { ...o, id: cleanNew } : o));
        nextInvoices = prev.invoices.map((inv) =>
          inv.orderId === oldId ? { ...inv, orderId: cleanNew } : inv
        );
        nextMovements = prev.corporateMovements.map((m) =>
          m.orderId === oldId ? { ...m, orderId: cleanNew } : m
        );
        nextTasks = prev.tasks.map((t) =>
          t.linkedRecordId === oldId
            ? { ...t, linkedRecordId: cleanNew, title: t.title.replace(oldId, cleanNew) }
            : t
        );
        nextJournals = prev.journalEntries.map((j) =>
          j.reference === oldId ? { ...j, reference: cleanNew } : j
        );
      } else if (kind === 'invoice') {
        if (prev.invoices.some((i) => i.id.toLowerCase() === cleanNew.toLowerCase())) return prev;
        nextInvoices = prev.invoices.map((inv) =>
          inv.id === oldId ? { ...inv, id: cleanNew } : inv
        );
        nextOrders = prev.orders.map((o) =>
          o.invoiceId === oldId ? { ...o, invoiceId: cleanNew } : o
        );
        nextMovements = prev.corporateMovements.map((m) =>
          m.invoiceId === oldId ? { ...m, invoiceId: cleanNew } : m
        );
        nextJournals = prev.journalEntries.map((j) =>
          j.reference === oldId ? { ...j, reference: cleanNew } : j
        );
      }

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ID_CHANGED',
        module: kind === 'customer' ? 'Customers' : kind === 'order' ? 'Orders' : 'Documents',
        recordId: cleanNew,
        summary: `Authorized ${kind} ID change from "${oldId}" to "${cleanNew}"`,
        beforeValue: { id: oldId },
        afterValue: { id: cleanNew },
      });

      return {
        ...prev,
        customers: nextCustomers,
        orders: nextOrders,
        invoices: nextInvoices,
        customerCustomPrices: nextCustomPrices,
        corporateMovements: nextMovements,
        tasks: nextTasks,
        journalEntries: nextJournals,
        blackBox: [bb, ...prev.blackBox],
      };
    });
    return true;
  };

  const handleAddCustomer = (
    data: Omit<Customer, 'id' | 'registeredAt' | 'outstandingBalance' | 'advanceBalance'>,
    options?: { customId?: string; advanceCounterTo?: number }
  ) => {
    if (
      !requireAction(
        activePerms.actions.canCreateOrders || activePerms.actions.canCollectPayments,
        'create customers'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const generated = generateNextSmartId(prev, 'customer');
      const existing = getExistingIdsForType(prev, 'customer');
      const requested = options?.customId?.trim();
      const id = requested && !existing.has(requested.toLowerCase()) ? requested : generated.id;

      const currentRule = prev.idFormats?.customer || DEFAULT_ID_FORMATS.customer;
      const nextCounter = Math.max(
        currentRule.nextNumber,
        id === generated.id ? generated.nextCounter : currentRule.nextNumber,
        options?.advanceCounterTo ?? 0
      );

      const newCust: Customer = {
        ...data,
        id,
        registeredAt: new Date().toISOString(),
        outstandingBalance: 0,
        advanceBalance: 0,
      };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CUSTOMER_CREATED',
        module: 'Customers',
        recordId: id,
        summary: `Created retail customer ${newCust.name} (${id})`,
        afterValue: newCust,
      });
      return {
        ...prev,
        idFormats: {
          ...DEFAULT_ID_FORMATS,
          ...(prev.idFormats || {}),
          customer: { ...currentRule, nextNumber: nextCounter },
        },
        customers: [newCust, ...prev.customers],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleAddCategory = (cat: Omit<CustomerCategory, 'id'>) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'add customer categories')) return;
    commitState((prev) => ({
      ...prev,
      categories: [...prev.categories, { ...cat, id: `cat-${Date.now()}` }],
    }));
  };

  const handleUpsertCustomerCustomPrice = (
    customerId: string,
    productId: string,
    serviceId: string,
    price: number
  ) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'set customer custom prices')) return;
    commitState((prev) => {
      const existing = prev.customerCustomPrices.find(
        (cp) => cp.customerId === customerId && cp.productId === productId && cp.serviceId === serviceId
      );
      const next = existing
        ? prev.customerCustomPrices.map((cp) => (cp.id === existing.id ? { ...cp, price } : cp))
        : [
            ...prev.customerCustomPrices,
            { id: `cp-${Date.now()}`, customerId, productId, serviceId, price },
          ];
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CUSTOMER_CUSTOM_PRICE',
        module: 'Customers',
        recordId: customerId,
        summary: `Set customer-specific rate ${prev.settings.currencySymbol} ${price} for ${customerId}`,
        beforeValue: existing?.price ?? null,
        afterValue: price,
      });
      return { ...prev, customerCustomPrices: next, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleCollectDueOrAdvance = (params: {
    customerId: string;
    amount: number;
    mode: 'Due Collection' | 'Customer Advance';
    paymentAccountCode: string;
    paymentSplits?: Array<{ accountCode: string; amount: number }>;
  }) => {
    if (!requireAction(activePerms.actions.canCollectPayments, 'collect customer payments')) return;
    commitState((prev) => {
      const cust = prev.customers.find((c) => c.id === params.customerId);
      if (!cust) return prev;
      const splits = normalizePaymentSplits({
        accounts: prev.accounts,
        paymentSplits: params.paymentSplits,
        fallbackAccountCode: params.paymentAccountCode,
        fallbackAmount: params.amount,
      });
      const totalCollected = Number(splits.reduce((s, x) => s + x.amount, 0).toFixed(2));
      if (totalCollected <= 0) return prev;

      const creditCode = params.mode === 'Due Collection' ? '1100' : '2100';
      const creditAcc = prev.accounts.find((a) => a.code === creditCode);
      if (!creditAcc) return prev;

      const splitNote = splits.map((s) => `${s.accountName}: ${s.amount}`).join(', ');
      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: cust.id,
        description: `${params.mode} from ${cust.name} (${splitNote})`,
        category: params.mode === 'Due Collection' ? 'Collection' : 'Advance',
        createdBy: activeUserName,
        lines: [
          ...splits.map((s) => ({
            accountCode: s.accountCode,
            accountName: s.accountName || s.accountCode,
            debit: s.amount,
            credit: 0,
          })),
          { accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: totalCollected },
        ],
      });

      const nextAccounts = applyJournalToAccounts(prev.accounts, je);
      const nextCustomers = prev.customers.map((c) =>
        c.id === cust.id
          ? {
              ...c,
              outstandingBalance:
                params.mode === 'Due Collection'
                  ? Math.max(0, Number((c.outstandingBalance - totalCollected).toFixed(2)))
                  : c.outstandingBalance,
              advanceBalance:
                params.mode === 'Customer Advance'
                  ? Number((c.advanceBalance + totalCollected).toFixed(2))
                  : c.advanceBalance,
            }
          : c
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: params.mode === 'Due Collection' ? 'DUE_COLLECTED' : 'ADVANCE_RECEIVED',
        module: 'Customers',
        recordId: cust.id,
        summary: `${params.mode} ${prev.settings.currencySymbol} ${totalCollected} for ${cust.name} (${splitNote})`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: nextAccounts,
        customers: nextCustomers,
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleCreateOrder = (params: {
    customOrderId?: string;
    advanceOrderCounterTo?: number;
    customInvoiceId?: string;
    advanceInvoiceCounterTo?: number;
    customerId: string;
    deliveryOptionId: string;
    physicallyReceived: boolean;
    lines: Array<{
      productId: string;
      serviceId: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      saveAsCustomerPrice: boolean;
    }>;
    approvedZeroPriceLines?: Array<{ productName: string; serviceName: string; quantity: number }>;
    orderDiscount: number;
    additionalCharge: number;
    additionalChargeLabel: string;
    addAdditionalToOrder: boolean;
    notes: string;
    initialPaidAmount: number;
    paymentAccountCode: string;
    paymentSplits?: Array<{ accountCode: string; amount: number }>;
  }) => {
    if (!requireAction(activePerms.actions.canCreateOrders, 'create retail orders')) return;
    commitState((prev) => {
      const cust = prev.customers.find((c) => c.id === params.customerId);
      const del = prev.deliveryOptions.find((d) => d.id === params.deliveryOptionId);
      if (!cust || !del) return prev;

      const genOrder = generateNextSmartId(prev, 'retailOrder');
      const existingOrd = getExistingIdsForType(prev, 'retailOrder');
      const reqOrderId = params.customOrderId?.trim();
      const orderId =
        reqOrderId && !existingOrd.has(reqOrderId.toLowerCase()) ? reqOrderId : genOrder.id;

      const genInv = generateNextSmartId(prev, 'retailInvoice');
      const existingInv = getExistingIdsForType(prev, 'retailInvoice');
      const reqInvId = params.customInvoiceId?.trim();
      const invoiceId =
        reqInvId && !existingInv.has(reqInvId.toLowerCase()) ? reqInvId : genInv.id;

      const ordRule = prev.idFormats?.retailOrder || DEFAULT_ID_FORMATS.retailOrder;
      const invRule = prev.idFormats?.retailInvoice || DEFAULT_ID_FORMATS.retailInvoice;
      const nextOrdCounter = Math.max(
        ordRule.nextNumber,
        orderId === genOrder.id ? genOrder.nextCounter : ordRule.nextNumber,
        params.advanceOrderCounterTo ?? 0
      );
      const nextInvCounter = Math.max(
        invRule.nextNumber,
        invoiceId === genInv.id ? genInv.nextCounter : invRule.nextNumber,
        params.advanceInvoiceCounterTo ?? 0
      );

      const createdAt = new Date().toISOString();
      const expectedDeliveryAt = new Date(Date.now() + del.targetHours * 3600000).toISOString();

      let nextCustomPrices = [...prev.customerCustomPrices];
      const orderLines = params.lines.map((l, idx) => {
        const prod = prev.products.find((p) => p.id === l.productId);
        const srv = prev.services.find((s) => s.id === l.serviceId);
        if (l.saveAsCustomerPrice) {
          const baseUnit = Number((l.unitPrice / Math.max(0.1, del.multiplier)).toFixed(2));
          const existingIdx = nextCustomPrices.findIndex(
            (cp) =>
              cp.customerId === cust.id &&
              cp.productId === l.productId &&
              cp.serviceId === l.serviceId
          );
          if (existingIdx >= 0) {
            nextCustomPrices[existingIdx] = { ...nextCustomPrices[existingIdx], price: baseUnit };
          } else {
            nextCustomPrices.push({
              id: `cp-${Date.now()}-${idx}`,
              customerId: cust.id,
              productId: l.productId,
              serviceId: l.serviceId,
              price: baseUnit,
            });
          }
        }
        return {
          id: `ol-${Date.now()}-${idx}`,
          productId: l.productId,
          productName: prod?.name || 'Item',
          serviceId: l.serviceId,
          serviceName: srv?.name || 'Service',
          quantityOrdered: l.quantity,
          quantityReceived: params.physicallyReceived ? l.quantity : 0,
          quantityDelivered: 0,
          quantityRewash: 0,
          unitPrice: l.unitPrice,
          discount: l.discount,
        };
      });

      const subtotal = orderLines.reduce(
        (s, l) => s + Math.max(0, l.quantityOrdered * l.unitPrice - l.discount),
        0
      );
      const extra = params.addAdditionalToOrder ? params.additionalCharge : 0;
      const totalAmount = Math.max(0, Number((subtotal - params.orderDiscount + extra).toFixed(2)));
      const normalizedSplits = normalizePaymentSplits({
        accounts: prev.accounts,
        paymentSplits: params.paymentSplits,
        fallbackAccountCode: params.paymentAccountCode,
        fallbackAmount: params.initialPaidAmount,
        capTotal: totalAmount,
      });
      const paidAmount = Number(
        normalizedSplits.reduce((s, sp) => s + sp.amount, 0).toFixed(2)
      );
      const dueAmount = Number((totalAmount - paidAmount).toFixed(2));

      const stage: OrderStage = params.physicallyReceived ? 'Received' : 'Not yet received';
      const newOrder: Order = {
        id: orderId,
        customerId: cust.id,
        customerName: cust.name,
        createdAt,
        expectedDeliveryAt,
        deliveryOptionId: del.id,
        deliveryOptionName: del.name,
        stage,
        physicallyReceived: params.physicallyReceived,
        stageHistory: [
          { stage: 'New order', timestamp: createdAt, user: activeUserName },
          {
            stage,
            timestamp: createdAt,
            user: activeUserName,
            note: params.physicallyReceived
              ? 'Items verified at intake'
              : 'Awaiting physical arrival',
          },
        ],
        lines: orderLines,
        exceptions: [],
        orderDiscount: params.orderDiscount,
        additionalCharge: params.additionalCharge,
        additionalChargeLabel: params.additionalChargeLabel,
        addAdditionalToOrder: params.addAdditionalToOrder,
        totalAmount,
        paidAmount,
        paymentSplits: normalizedSplits.length > 0 ? normalizedSplits : undefined,
        notes: params.notes,
        invoiceId,
      };

      const newInvoice: Invoice = {
        id: invoiceId,
        orderId,
        customerId: cust.id,
        customerName: cust.name,
        customerPhone: cust.phone,
        customerAddress: cust.address,
        isCorporate: false,
        issuedAt: createdAt,
        dueDate: expectedDeliveryAt,
        lines: orderLines.map((l) => ({
          productName: l.productName,
          serviceName: l.serviceName,
          quantity: l.quantityOrdered,
          unitPrice: l.unitPrice,
          discount: l.discount,
          total: Number((l.quantityOrdered * l.unitPrice - l.discount).toFixed(2)),
        })),
        subtotal,
        discountTotal: params.orderDiscount,
        extraCharges: extra,
        grandTotal: totalAmount,
        paidAmount,
        dueAmount,
        paymentTerms: 'Due on Delivery',
        termsAndConditions: prev.settings.invoiceTerms,
        reprintCount: 0,
        logoSnapshotDataUrl: prev.settings.companyLogoDataUrl,
        logoSizeSnapshot: prev.settings.companyLogoSize || 'Medium',
        showBrandNameSnapshot: prev.settings.showBrandNameWithLogo ?? true,
        companyNameSnapshot: prev.settings.companyName,
        companyAddressSnapshot: prev.settings.companyAddress,
        companyPhoneSnapshot: prev.settings.companyPhone,
      };

      // Double-entry Journal Posting (supports multi-method split payments)
      const arAcc = prev.accounts.find((a) => a.code === '1100');
      const revAcc = prev.accounts.find((a) => a.code === '4010');
      const jeLines = [];
      for (const sp of normalizedSplits) {
        if (sp.amount > 0) {
          jeLines.push({
            accountCode: sp.accountCode,
            accountName: sp.accountName || sp.accountCode,
            debit: sp.amount,
            credit: 0,
          });
        }
      }
      if (dueAmount > 0 && arAcc) {
        jeLines.push({ accountCode: arAcc.code, accountName: arAcc.name, debit: dueAmount, credit: 0 });
      }
      if (revAcc && totalAmount > 0) {
        jeLines.push({ accountCode: revAcc.code, accountName: revAcc.name, debit: 0, credit: totalAmount });
      }

      let nextAccounts = prev.accounts;
      let nextJournals = prev.journalEntries;
      if (jeLines.length >= 2) {
        const splitDesc =
          normalizedSplits.length > 0
            ? ` · Paid via ${normalizedSplits.map((s) => `${s.accountName} ${s.amount}`).join(' + ')}`
            : '';
        const je = buildJournalEntry({
          id: `JE-${1001 + prev.journalEntries.length}`,
          date: createdAt,
          reference: orderId,
          description: `Retail order ${orderId} (${cust.name})${splitDesc}`,
          category: 'Sales',
          createdBy: activeUserName,
          lines: jeLines,
        });
        nextAccounts = applyJournalToAccounts(prev.accounts, je);
        nextJournals = [je, ...prev.journalEntries];
      }

      const nextCustomers = prev.customers.map((c) =>
        c.id === cust.id
          ? { ...c, outstandingBalance: Number((c.outstandingBalance + dueAmount).toFixed(2)) }
          : c
      );

      // Automatically create a synchronized Calendar Task for delivery deadline
      const deliveryTask: ScheduledTask = {
        id: `TSK-${101 + prev.tasks.length}`,
        title: `Deliver ${orderId} (${cust.name} — ${del.name})`,
        description: orderLines.map((l) => `${l.quantityOrdered}x ${l.productName} (${l.serviceName})`).join(', '),
        category: 'Order Delivery',
        priority: del.targetHours <= 12 ? 'Urgent' : del.targetHours <= 24 ? 'High' : 'Normal',
        status: 'Pending',
        dueAt: expectedDeliveryAt,
        reminderMinutesBefore: del.targetHours <= 12 ? 60 : 120,
        linkedRecordId: orderId,
        assignee: activeUserName || 'Owner',
        autoGenerated: true,
      };

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ORDER_CREATED',
        module: 'Orders',
        recordId: orderId,
        summary: `Created order ${orderId} for ${cust.name} (${prev.settings.currencySymbol} ${totalAmount}, ${stage})`,
        afterValue: newOrder,
      });

      let nextBlackBox = [bb, ...prev.blackBox];
      if (params.approvedZeroPriceLines && params.approvedZeroPriceLines.length > 0) {
        const zpBb = createBlackBoxEvent(nextBlackBox, {
          user: activeUserName,
          role: currentUserRole,
          action: 'ZERO_PRICE_INVOICE_APPROVED',
          module: 'Orders',
          recordId: invoiceId,
          summary: `User confirmed zero-price invoice ${invoiceId} (${params.approvedZeroPriceLines.length} zero-price/zero-qty lines)`,
          afterValue: params.approvedZeroPriceLines,
        });
        nextBlackBox = [zpBb, ...nextBlackBox];
      }

      return {
        ...prev,
        idFormats: {
          ...DEFAULT_ID_FORMATS,
          ...(prev.idFormats || {}),
          retailOrder: { ...ordRule, nextNumber: nextOrdCounter },
          retailInvoice: { ...invRule, nextNumber: nextInvCounter },
        },
        customerCustomPrices: nextCustomPrices,
        orders: [newOrder, ...prev.orders],
        invoices: [newInvoice, ...prev.invoices],
        accounts: nextAccounts,
        journalEntries: nextJournals,
        customers: nextCustomers,
        tasks: [deliveryTask, ...prev.tasks],
        blackBox: nextBlackBox,
      };
    });
  };

  const handleAdvanceOrderStage = (orderId: string, nextStage: OrderStage, note?: string) => {
    commitState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;
      const timestamp = new Date().toISOString();
      const nextOrders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const confirmedReceipt = nextStage === 'Received' ? true : o.physicallyReceived;
        const updatedLines =
          nextStage === 'Received'
            ? o.lines.map((l) => ({ ...l, quantityReceived: l.quantityOrdered }))
            : o.lines;
        return {
          ...o,
          stage: nextStage,
          physicallyReceived: confirmedReceipt,
          lines: updatedLines,
          stageHistory: [...o.stageHistory, { stage: nextStage, timestamp, user: activeUserName, note }],
        };
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ORDER_STAGE_CHANGED',
        module: 'Orders',
        recordId: orderId,
        summary: `Order ${orderId} moved from ${target.stage} to ${nextStage}`,
        beforeValue: target.stage,
        afterValue: nextStage,
      });

      return { ...prev, orders: nextOrders, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handlePartialDeliver = (orderId: string, deliveries: Record<string, number>) => {
    commitState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      if (!target) return prev;
      const timestamp = new Date().toISOString();
      const updatedLines = target.lines.map((line) => {
        const addQty = deliveries[line.id] || 0;
        const nextDelivered = Math.min(line.quantityReceived, line.quantityDelivered + addQty);
        return { ...line, quantityDelivered: nextDelivered };
      });
      const allDelivered = updatedLines.every((l) => l.quantityDelivered >= l.quantityReceived);
      const nextStage: OrderStage = allDelivered ? 'Delivered' : target.stage;

      const nextOrders = prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              lines: updatedLines,
              stage: nextStage,
              stageHistory: [
                ...o.stageHistory,
                {
                  stage: nextStage,
                  timestamp,
                  user: activeUserName,
                  note: allDelivered ? 'Full delivery completed' : 'Partial delivery recorded',
                },
              ],
            }
          : o
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: allDelivered ? 'ORDER_DELIVERED' : 'ORDER_PARTIAL_DELIVERY',
        module: 'Orders',
        recordId: orderId,
        summary: `${allDelivered ? 'Full' : 'Partial'} delivery logged for ${orderId}`,
        beforeValue: target.lines,
        afterValue: updatedLines,
      });

      return { ...prev, orders: nextOrders, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleAddOrderException = (
    orderId: string,
    exc: Omit<OrderException, 'id' | 'date' | 'resolved'>
  ) => {
    commitState((prev) => {
      const newExc: OrderException = {
        ...exc,
        id: `EXC-${Date.now()}`,
        date: new Date().toISOString(),
        resolved: false,
      };
      const nextOrders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const updatedLines =
          exc.type === 'Rewash'
            ? o.lines.map((l) =>
                l.id === exc.lineId ? { ...l, quantityRewash: l.quantityRewash + exc.qty } : l
              )
            : o.lines;
        return { ...o, lines: updatedLines, exceptions: [...o.exceptions, newExc] };
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: `ORDER_EXCEPTION_${exc.type.toUpperCase()}`,
        module: 'Orders',
        recordId: orderId,
        summary: `Logged ${exc.type} (${exc.qty}x ${exc.productName}) on ${orderId}: ${exc.reason}`,
        afterValue: newExc,
      });

      return { ...prev, orders: nextOrders, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleResolveOrderException = (orderId: string, exceptionId: string) => {
    commitState((prev) => {
      const nextOrders = prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              exceptions: o.exceptions.map((e) =>
                e.id === exceptionId ? { ...e, resolved: true } : e
              ),
            }
          : o
      );
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ORDER_EXCEPTION_RESOLVED',
        module: 'Orders',
        recordId: orderId,
        summary: `Resolved exception ${exceptionId} on ${orderId}`,
      });
      return { ...prev, orders: nextOrders, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleCollectOrderPayment = (
    orderId: string,
    amount: number,
    paymentAccountCode: string,
    paymentSplits?: Array<{ accountCode: string; amount: number }>
  ) => {
    if (!requireAction(activePerms.actions.canCollectPayments, 'collect order payments')) return;
    commitState((prev) => {
      const ord = prev.orders.find((o) => o.id === orderId);
      const arAcc = prev.accounts.find((a) => a.code === '1100');
      if (!ord || !arAcc) return prev;

      const remainingDue = Math.max(0, Number((ord.totalAmount - ord.paidAmount).toFixed(2)));
      const splits = normalizePaymentSplits({
        accounts: prev.accounts,
        paymentSplits,
        fallbackAccountCode: paymentAccountCode,
        fallbackAmount: amount,
        capTotal: remainingDue,
      });
      const applied = Number(splits.reduce((s, sp) => s + sp.amount, 0).toFixed(2));
      if (applied <= 0) return prev;

      const splitNote = splits.map((s) => `${s.accountName}: ${s.amount}`).join(', ');
      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: ord.id,
        description: `Payment collection for ${ord.id} (${ord.customerName}) · ${splitNote}`,
        category: 'Collection',
        createdBy: activeUserName,
        lines: [
          ...splits.map((sp) => ({
            accountCode: sp.accountCode,
            accountName: sp.accountName || sp.accountCode,
            debit: sp.amount,
            credit: 0,
          })),
          { accountCode: arAcc.code, accountName: arAcc.name, debit: 0, credit: applied },
        ],
      });

      const nextAccounts = applyJournalToAccounts(prev.accounts, je);
      const nextOrders = prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              paidAmount: Number((o.paidAmount + applied).toFixed(2)),
              paymentSplits: [...(o.paymentSplits || []), ...splits],
            }
          : o
      );
      const nextInvoices = prev.invoices.map((inv) =>
        inv.orderId === orderId
          ? {
              ...inv,
              paidAmount: Number((inv.paidAmount + applied).toFixed(2)),
              dueAmount: Math.max(0, Number((inv.dueAmount - applied).toFixed(2))),
            }
          : inv
      );
      const nextCustomers = prev.customers.map((c) =>
        c.id === ord.customerId
          ? {
              ...c,
              outstandingBalance: Math.max(0, Number((c.outstandingBalance - applied).toFixed(2))),
            }
          : c
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ORDER_PAYMENT_COLLECTED',
        module: 'Orders',
        recordId: orderId,
        summary: `Collected ${prev.settings.currencySymbol} ${applied} for ${orderId} (${splitNote})`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: nextAccounts,
        journalEntries: [je, ...prev.journalEntries],
        orders: nextOrders,
        invoices: nextInvoices,
        customers: nextCustomers,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- CORPORATE HANDLERS ---

  const handleCreateCorporate = (params: {
    name: string;
    contactPerson: string;
    phone: string;
    address: string;
    billingBasis: BillingBasis;
    billingCycle: BillingCycle;
    cutoffDayOrTime: string;
    copyRetailCatalogueOnce: boolean;
  }) => {
    if (!requireAction(activePerms.actions.canManageCorporate, 'create corporate accounts')) return;
    commitState((prev) => {
      const id = `CORP-${2001 + prev.corporateCustomers.length}`;
      const products = params.copyRetailCatalogueOnce
        ? prev.products.filter((p) => p.active).map((p) => ({ ...p, id: `${id}-${p.id}` }))
        : [];
      const services = params.copyRetailCatalogueOnce
        ? prev.services.filter((s) => s.active).map((s) => ({ ...s, id: `${id}-${s.id}` }))
        : [];
      const prices = params.copyRetailCatalogueOnce
        ? prev.prices.map((pr, idx) => ({
            id: `${id}-pr-${idx}`,
            productId: `${id}-${pr.productId}`,
            serviceId: `${id}-${pr.serviceId}`,
            price: pr.price,
          }))
        : [];

      const newCorp: CorporateCustomer = {
        id,
        name: params.name,
        contactPerson: params.contactPerson,
        phone: params.phone,
        address: params.address,
        billingBasis: params.billingBasis,
        billingCycle: params.billingCycle,
        cutoffDayOrTime: params.cutoffDayOrTime,
        discountPct: 0,
        outstandingBalance: 0,
        advanceBalance: 0,
        registeredAt: new Date().toISOString(),
        notes: '',
        brandColor: getCorporateBrandColor(prev.corporateCustomers.length),
        products,
        services,
        prices,
      };

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORPORATE_ACCOUNT_CREATED',
        module: 'Corporate',
        recordId: id,
        summary: `Created corporate account ${params.name} (${params.billingBasis})`,
        afterValue: { id, billingBasis: params.billingBasis, copiedRetail: params.copyRetailCatalogueOnce },
      });

      return {
        ...prev,
        corporateCustomers: [...prev.corporateCustomers, newCorp],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleUpdateCorporateBillingBasis = (corpId: string, basis: BillingBasis) => {
    if (!requireAction(activePerms.actions.canManageCorporate, 'update corporate billing basis')) return;
    commitState((prev) => {
      const target = prev.corporateCustomers.find((c) => c.id === corpId);
      const nextCorps = prev.corporateCustomers.map((c) =>
        c.id === corpId ? { ...c, billingBasis: basis } : c
      );
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_BILLING_BASIS_CHANGED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Changed ${target?.name} billing basis to ${basis}`,
        beforeValue: target?.billingBasis,
        afterValue: basis,
      });
      return { ...prev, corporateCustomers: nextCorps, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleAddCorporateProduct = (corpId: string, name: string, type: string) => {
    if (
      !requireAction(
        activePerms.actions.canManageCorporate || activePerms.actions.canOverridePrices,
        'edit corporate catalogue'
      )
    ) {
      return;
    }
    commitState((prev) => ({
      ...prev,
      corporateCustomers: prev.corporateCustomers.map((c) =>
        c.id === corpId
          ? {
              ...c,
              products: [...c.products, { id: `${corpId}-p-${Date.now()}`, name, type, active: true }],
            }
          : c
      ),
    }));
  };

  const handleAddCorporateService = (corpId: string, name: string) => {
    if (
      !requireAction(
        activePerms.actions.canManageCorporate || activePerms.actions.canOverridePrices,
        'edit corporate catalogue'
      )
    ) {
      return;
    }
    commitState((prev) => ({
      ...prev,
      corporateCustomers: prev.corporateCustomers.map((c) =>
        c.id === corpId
          ? {
              ...c,
              services: [...c.services, { id: `${corpId}-s-${Date.now()}`, name, active: true }],
            }
          : c
      ),
    }));
  };

  const handleUpsertCorporatePrice = (
    corpId: string,
    productId: string,
    serviceId: string,
    price: number
  ) => {
    if (!requireAction(activePerms.actions.canOverridePrices || activePerms.actions.canManageCorporate, 'edit corporate pricing')) return;
    commitState((prev) => {
      const nextCorps = prev.corporateCustomers.map((c) => {
        if (c.id !== corpId) return c;
        const existing = c.prices.find((p) => p.productId === productId && p.serviceId === serviceId);
        const nextPrices = existing
          ? c.prices.map((p) => (p.id === existing.id ? { ...p, price } : p))
          : [...c.prices, { id: `cpr-${Date.now()}`, productId, serviceId, price }];
        return { ...c, prices: nextPrices };
      });
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_PRICE_UPDATED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Updated private rate in ${corpId} to ${prev.settings.currencySymbol} ${price}`,
        afterValue: { productId, serviceId, price },
      });
      return { ...prev, corporateCustomers: nextCorps, blackBox: [bb, ...prev.blackBox] };
    });
  };

  const handleLogCorporateMovement = (params: {
    customOrderId?: string;
    advanceOrderCounterTo?: number;
    corporateId: string;
    event: CorporateMovementType;
    productId: string;
    serviceId: string;
    qty: number;
    reason: string;
  }) => {
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === params.corporateId);
      if (!corp) return prev;
      const prod = corp.products.find((p) => p.id === params.productId);
      const srv = corp.services.find((s) => s.id === params.serviceId);
      if (!prod || !srv) return prev;

      const price =
        corp.prices.find((p) => p.productId === prod.id && p.serviceId === srv.id)?.price ?? 0;

      const isInbound = params.event === 'Received' || params.event === 'Adjustment';
      const isNeutral = params.event === 'Rewash';
      const qtyDelta = isNeutral ? 0 : isInbound ? params.qty : -params.qty;

      const priorPending = prev.corporateMovements
        .filter(
          (m) =>
            m.corporateId === corp.id &&
            m.productId === prod.id &&
            m.serviceId === srv.id
        )
        .reduce((s, m) => s + m.qtyDelta, 0);

      const genCorpOrd = generateNextSmartId(prev, 'corporateOrder');
      const existingCorpOrd = getExistingIdsForType(prev, 'corporateOrder');
      const reqOrderId = params.customOrderId?.trim();
      const orderId =
        reqOrderId && !existingCorpOrd.has(reqOrderId.toLowerCase()) ? reqOrderId : genCorpOrd.id;

      const corpOrdRule = prev.idFormats?.corporateOrder || DEFAULT_ID_FORMATS.corporateOrder;
      const nextCounter = Math.max(
        corpOrdRule.nextNumber,
        orderId === genCorpOrd.id ? genCorpOrd.nextCounter : corpOrdRule.nextNumber,
        params.advanceOrderCounterTo ?? 0
      );

      const newMov: CorporateMovement = {
        id: `CMOV-${101 + prev.corporateMovements.length}`,
        orderId,
        corporateId: corp.id,
        date: new Date().toISOString(),
        event: params.event,
        productId: prod.id,
        productName: prod.name,
        serviceId: srv.id,
        serviceName: srv.name,
        qtyDelta,
        pendingAfter: Math.max(0, priorPending + qtyDelta),
        unitPriceSnapshot: price,
        billedQty: 0,
        reason: params.reason,
        user: activeUserName,
      };

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: `CORP_MOVEMENT_${params.event.toUpperCase()}`,
        module: 'Corporate',
        recordId: orderId,
        summary: `${corp.name} (${orderId}): ${params.event} ${params.qty} ${prod.name} (${srv.name}). Pending: ${newMov.pendingAfter}`,
        afterValue: newMov,
      });

      return {
        ...prev,
        idFormats: {
          ...DEFAULT_ID_FORMATS,
          ...(prev.idFormats || {}),
          corporateOrder: { ...corpOrdRule, nextNumber: nextCounter },
        },
        corporateMovements: [...prev.corporateMovements, newMov],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleGenerateCorporateInvoice = (
    corpId: string,
    periodLabel: string,
    options?: {
      customInvoiceId?: string;
      advanceCounterTo?: number;
      approvedZeroPriceLines?: Array<{ productName: string; serviceName: string; quantity: number }>;
    }
  ) => {
    if (!requireAction(activePerms.actions.canManageCorporate, 'generate corporate invoices')) return;
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === corpId);
      if (!corp) return prev;

      const eligibleMovements = prev.corporateMovements.filter((m) => {
        if (m.corporateId !== corpId || m.isOpening) return false;
        return corp.billingBasis === 'Delivered-wise'
          ? m.event === 'Delivered' && Math.abs(m.qtyDelta) > m.billedQty
          : m.event === 'Received' && m.qtyDelta > m.billedQty;
      });
      if (eligibleMovements.length === 0) return prev;

      const genCorpInv = generateNextSmartId(prev, 'corporateInvoice');
      const existingInv = getExistingIdsForType(prev, 'corporateInvoice');
      const reqInvId = options?.customInvoiceId?.trim();
      const invoiceId =
        reqInvId && !existingInv.has(reqInvId.toLowerCase()) ? reqInvId : genCorpInv.id;

      const corpInvRule = prev.idFormats?.corporateInvoice || DEFAULT_ID_FORMATS.corporateInvoice;
      const nextInvCounter = Math.max(
        corpInvRule.nextNumber,
        invoiceId === genCorpInv.id ? genCorpInv.nextCounter : corpInvRule.nextNumber,
        options?.advanceCounterTo ?? 0
      );

      const issuedAt = new Date().toISOString();
      const dueDate = new Date(Date.now() + 7 * 86400000).toISOString();

      const lines = eligibleMovements.map((m) => {
        const qty = Math.abs(m.qtyDelta) - m.billedQty;
        const rate =
          corp.prices.find((p) => p.productId === m.productId && p.serviceId === m.serviceId)
            ?.price ?? m.unitPriceSnapshot;
        return {
          productName: m.productName,
          serviceName: m.serviceName,
          quantity: qty,
          unitPrice: rate,
          discount: 0,
          total: Number((qty * rate).toFixed(2)),
        };
      });

      const subtotal = lines.reduce((s, l) => s + l.total, 0);
      const discountTotal = Number(((subtotal * corp.discountPct) / 100).toFixed(2));
      const grandTotal = Number((subtotal - discountTotal).toFixed(2));

      const newInvoice: Invoice = {
        id: invoiceId,
        corporateId: corp.id,
        customerId: corp.id,
        customerName: corp.name,
        customerPhone: corp.phone,
        customerAddress: corp.address,
        isCorporate: true,
        billingBasis: corp.billingBasis,
        periodCovered: periodLabel,
        issuedAt,
        dueDate,
        lines,
        subtotal,
        discountTotal,
        extraCharges: 0,
        grandTotal,
        paidAmount: 0,
        dueAmount: grandTotal,
        paymentTerms: 'Net 7 Days',
        termsAndConditions: `Corporate ${corp.billingBasis} statement for ${periodLabel}.`,
        reprintCount: 0,
        logoSnapshotDataUrl: prev.settings.companyLogoDataUrl,
        logoSizeSnapshot: prev.settings.companyLogoSize || 'Medium',
        showBrandNameSnapshot: prev.settings.showBrandNameWithLogo ?? true,
        companyNameSnapshot: prev.settings.companyName,
        companyAddressSnapshot: prev.settings.companyAddress,
        companyPhoneSnapshot: prev.settings.companyPhone,
      };

      const eligibleIds = new Set(eligibleMovements.map((m) => m.id));
      const nextMovements = prev.corporateMovements.map((m) =>
        eligibleIds.has(m.id)
          ? { ...m, billedQty: Math.abs(m.qtyDelta), invoiceId }
          : m
      );

      const arAcc = prev.accounts.find((a) => a.code === '1110');
      const revAcc = prev.accounts.find((a) => a.code === '4020');
      let nextAccounts = prev.accounts;
      let nextJournals = prev.journalEntries;

      if (arAcc && revAcc && grandTotal > 0) {
        const je = buildJournalEntry({
          id: `JE-${1001 + prev.journalEntries.length}`,
          date: issuedAt,
          reference: invoiceId,
          description: `Corporate ${corp.billingBasis} invoice ${invoiceId} (${corp.name})`,
          category: 'Sales',
          createdBy: activeUserName,
          lines: [
            { accountCode: arAcc.code, accountName: arAcc.name, debit: grandTotal, credit: 0 },
            { accountCode: revAcc.code, accountName: revAcc.name, debit: 0, credit: grandTotal },
          ],
        });
        nextAccounts = applyJournalToAccounts(prev.accounts, je);
        nextJournals = [je, ...prev.journalEntries];
      }

      const nextCorps = prev.corporateCustomers.map((c) =>
        c.id === corpId
          ? { ...c, outstandingBalance: Number((c.outstandingBalance + grandTotal).toFixed(2)) }
          : c
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_INVOICE_GENERATED',
        module: 'Corporate',
        recordId: invoiceId,
        summary: `Generated ${corp.billingBasis} invoice ${invoiceId} for ${corp.name} (${prev.settings.currencySymbol} ${grandTotal})`,
        afterValue: newInvoice,
      });

      let nextBlackBox = [bb, ...prev.blackBox];
      if (options?.approvedZeroPriceLines && options.approvedZeroPriceLines.length > 0) {
        const zpBb = createBlackBoxEvent(nextBlackBox, {
          user: activeUserName,
          role: currentUserRole,
          action: 'ZERO_PRICE_INVOICE_APPROVED',
          module: 'Corporate',
          recordId: invoiceId,
          summary: `User confirmed zero-price corporate invoice ${invoiceId} (${options.approvedZeroPriceLines.length} zero-price/zero-qty lines)`,
          afterValue: options.approvedZeroPriceLines,
        });
        nextBlackBox = [zpBb, ...nextBlackBox];
      }

      return {
        ...prev,
        idFormats: {
          ...DEFAULT_ID_FORMATS,
          ...(prev.idFormats || {}),
          corporateInvoice: {
            ...corpInvRule,
            nextNumber: nextInvCounter,
          },
        },
        corporateMovements: nextMovements,
        invoices: [newInvoice, ...prev.invoices],
        accounts: nextAccounts,
        journalEntries: nextJournals,
        corporateCustomers: nextCorps,
        blackBox: nextBlackBox,
      };
    });
  };

  const handleCollectCorporatePayment = (
    corpId: string,
    amount: number,
    accountCode: string,
    paymentSplits?: Array<{ accountCode: string; amount: number }>
  ) => {
    if (!requireAction(activePerms.actions.canCollectPayments, 'collect corporate payments')) return;
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === corpId);
      const arAcc = prev.accounts.find((a) => a.code === '1110');
      if (!corp || !arAcc) return prev;

      const splits = normalizePaymentSplits({
        accounts: prev.accounts,
        paymentSplits,
        fallbackAccountCode: accountCode,
        fallbackAmount: amount,
      });
      const totalPaid = Number(splits.reduce((s, sp) => s + sp.amount, 0).toFixed(2));
      if (totalPaid <= 0) return prev;

      const splitNote = splits.map((s) => `${s.accountName}: ${s.amount}`).join(', ');
      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: corp.id,
        description: `Corporate payment received from ${corp.name} (${splitNote})`,
        category: 'Collection',
        createdBy: activeUserName,
        lines: [
          ...splits.map((sp) => ({
            accountCode: sp.accountCode,
            accountName: sp.accountName || sp.accountCode,
            debit: sp.amount,
            credit: 0,
          })),
          { accountCode: arAcc.code, accountName: arAcc.name, debit: 0, credit: totalPaid },
        ],
      });

      const nextAccounts = applyJournalToAccounts(prev.accounts, je);
      const nextCorps = prev.corporateCustomers.map((c) =>
        c.id === corpId
          ? { ...c, outstandingBalance: Math.max(0, Number((c.outstandingBalance - totalPaid).toFixed(2))) }
          : c
      );

      let remainingToApply = totalPaid;
      const nextInvoices = prev.invoices.map((inv) => {
        if (inv.corporateId !== corpId || inv.dueAmount <= 0 || remainingToApply <= 0) return inv;
        const apply = Math.min(remainingToApply, inv.dueAmount);
        remainingToApply -= apply;
        return {
          ...inv,
          paidAmount: Number((inv.paidAmount + apply).toFixed(2)),
          dueAmount: Number((inv.dueAmount - apply).toFixed(2)),
        };
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_PAYMENT_COLLECTED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Collected ${prev.settings.currencySymbol} ${totalPaid} from ${corp.name} (${splitNote})`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: nextAccounts,
        journalEntries: [je, ...prev.journalEntries],
        corporateCustomers: nextCorps,
        invoices: nextInvoices,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- INVENTORY & SUPPLIERS ---

  const handleAddChemical = (chem: Omit<ChemicalItem, 'id'>) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'add chemical inventory items')) return;
    commitState((prev) => ({
      ...prev,
      chemicals: [...prev.chemicals, { ...chem, id: `CHEM-${10 + prev.chemicals.length}` }],
    }));
  };

  const handleRecordStockMovement = (params: {
    itemId: string;
    type: StockMovement['type'];
    qty: number;
    unitCost: number;
    reason: string;
    reference: string;
    paymentType?: 'Cash' | 'Bank' | 'Credit';
    paymentAccountCode?: string;
  }) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'record chemical stock movements')) return;
    commitState((prev) => {
      const chem = prev.chemicals.find((c) => c.id === params.itemId);
      if (!chem) return prev;
      const isAdd = params.type === 'Received';
      const delta = isAdd ? params.qty : -params.qty;
      const nextQty = Math.max(0, Number((chem.currentQty + delta).toFixed(2)));
      const value = Number((params.qty * params.unitCost).toFixed(2));

      const mov: StockMovement = {
        id: `SMOV-${10 + prev.stockMovements.length}`,
        itemId: chem.id,
        itemName: chem.name,
        date: new Date().toISOString(),
        type: params.type,
        qty: params.qty,
        unitCost: params.unitCost,
        reason: params.reason,
        reference: params.reference,
        paymentType: params.paymentType,
        paymentAccountCode: params.paymentAccountCode,
      };

      let nextAccounts = prev.accounts;
      let nextJournals = prev.journalEntries;
      let nextSuppliers = prev.suppliers;

      const invAcc = prev.accounts.find((a) => a.code === '1200');
      const chemExpAcc = prev.accounts.find((a) => a.code === '5010');
      const apAcc = prev.accounts.find((a) => a.code === '2010');

      if (params.type === 'Received' && invAcc && value > 0) {
        const isCredit =
          params.paymentAccountCode === 'CREDIT' ||
          (!params.paymentAccountCode && params.paymentType === 'Credit');
        const resolvedAccountCode =
          params.paymentAccountCode && params.paymentAccountCode !== 'CREDIT'
            ? params.paymentAccountCode
            : params.paymentType === 'Cash'
            ? '1010'
            : params.paymentType === 'Bank'
            ? '1020'
            : undefined;
        const creditAcc = isCredit
          ? apAcc
          : prev.accounts.find((a) => a.code === resolvedAccountCode) || apAcc;
        if (creditAcc) {
          const je = buildJournalEntry({
            id: `JE-${1001 + prev.journalEntries.length}`,
            date: mov.date,
            reference: mov.reference,
            description: `Chemical purchase: ${params.qty} ${chem.unit} ${chem.name} (${creditAcc.name})`,
            category: 'Purchase',
            createdBy: activeUserName,
            lines: [
              { accountCode: invAcc.code, accountName: invAcc.name, debit: value, credit: 0 },
              { accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: value },
            ],
          });
          nextAccounts = applyJournalToAccounts(prev.accounts, je);
          nextJournals = [je, ...prev.journalEntries];
          if (creditAcc.code === '2010') {
            nextSuppliers = prev.suppliers.map((s) =>
              s.id === chem.supplierId
                ? { ...s, dueBalance: Number((s.dueBalance + value).toFixed(2)) }
                : s
            );
          }
        }
      } else if ((params.type === 'Consumed' || params.type === 'Issued' || params.type === 'Damaged') && invAcc && chemExpAcc && value > 0) {
        const je = buildJournalEntry({
          id: `JE-${1001 + prev.journalEntries.length}`,
          date: mov.date,
          reference: mov.reference,
          description: `Chemical ${params.type.toLowerCase()}: ${params.qty} ${chem.unit} ${chem.name}`,
          category: 'Expense',
          createdBy: activeUserName,
          lines: [
            { accountCode: chemExpAcc.code, accountName: chemExpAcc.name, debit: value, credit: 0 },
            { accountCode: invAcc.code, accountName: invAcc.name, debit: 0, credit: value },
          ],
        });
        nextAccounts = applyJournalToAccounts(prev.accounts, je);
        nextJournals = [je, ...prev.journalEntries];
      }

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: `STOCK_${params.type.toUpperCase()}`,
        module: 'Inventory',
        recordId: chem.id,
        summary: `${params.type} ${params.qty} ${chem.unit} of ${chem.name}. Remaining: ${nextQty}`,
        beforeValue: chem.currentQty,
        afterValue: nextQty,
      });

      return {
        ...prev,
        chemicals: prev.chemicals.map((c) => (c.id === chem.id ? { ...c, currentQty: nextQty } : c)),
        stockMovements: [...prev.stockMovements, mov],
        accounts: nextAccounts,
        journalEntries: nextJournals,
        suppliers: nextSuppliers,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleAddSupplier = (sup: Omit<Supplier, 'id' | 'dueBalance'>) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'add suppliers')) return;
    commitState((prev) => ({
      ...prev,
      suppliers: [
        ...prev.suppliers,
        { ...sup, id: `SUP-${10 + prev.suppliers.length}`, dueBalance: 0 },
      ],
    }));
  };

  const handlePaySupplier = (supplierId: string, amount: number, accountCode: string) => {
    if (!requireAction(activePerms.actions.canAdjustInventory || activePerms.actions.canPostAccounting, 'pay suppliers')) return;
    commitState((prev) => {
      const sup = prev.suppliers.find((s) => s.id === supplierId);
      const payAcc = prev.accounts.find((a) => a.code === accountCode);
      const apAcc = prev.accounts.find((a) => a.code === '2010');
      if (!sup || !payAcc || !apAcc) return prev;

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: sup.id,
        description: `Supplier payment to ${sup.name}`,
        category: 'Supplier Payment',
        createdBy: activeUserName,
        lines: [
          { accountCode: apAcc.code, accountName: apAcc.name, debit: amount, credit: 0 },
          { accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: amount },
        ],
      });

      const nextAccounts = applyJournalToAccounts(prev.accounts, je);
      const nextSuppliers = prev.suppliers.map((s) =>
        s.id === supplierId
          ? { ...s, dueBalance: Math.max(0, Number((s.dueBalance - amount).toFixed(2))) }
          : s
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SUPPLIER_PAID',
        module: 'Inventory',
        recordId: sup.id,
        summary: `Paid ${prev.settings.currencySymbol} ${amount} to supplier ${sup.name}`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: nextAccounts,
        journalEntries: [je, ...prev.journalEntries],
        suppliers: nextSuppliers,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- ACCOUNTING HANDLERS ---

  const handlePostOwnerDraw = (amount: number, paymentAccountCode: string, note: string) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post owner draw entries')) return;
    commitState((prev) => {
      const drawAcc = prev.accounts.find((a) => a.code === '3020');
      const payAcc = prev.accounts.find((a) => a.code === paymentAccountCode);
      if (!drawAcc || !payAcc) return prev;

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: `DRAW-${Date.now().toString().slice(-4)}`,
        description: `Owner Draw: ${note}`,
        category: 'Owner Draw',
        createdBy: activeUserName,
        lines: [
          { accountCode: drawAcc.code, accountName: drawAcc.name, debit: amount, credit: 0 },
          { accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: amount },
        ],
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'OWNER_DRAW',
        module: 'Accounting',
        recordId: je.id,
        summary: `Posted Owner Draw ${prev.settings.currencySymbol} ${amount} from ${payAcc.name}`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handlePostCashIn = (params: {
    inflowType: 'Owner Capital' | 'Loan Received' | 'Other Inflow';
    amount: number;
    toAccountCode: string;
    note: string;
  }) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post cash inflow entries')) return;
    commitState((prev) => {
      const toAcc = prev.accounts.find((a) => a.code === params.toAccountCode);
      const creditCode =
        params.inflowType === 'Owner Capital'
          ? '3010'
          : params.inflowType === 'Loan Received'
          ? '2200'
          : '3030';
      const creditAcc = prev.accounts.find((a) => a.code === creditCode);
      if (!toAcc || !creditAcc) return prev;

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: `IN-${Date.now().toString().slice(-4)}`,
        description: `${params.inflowType}: ${params.note}`,
        category: params.inflowType === 'Loan Received' ? 'Loan' : 'Owner Capital',
        createdBy: activeUserName,
        lines: [
          { accountCode: toAcc.code, accountName: toAcc.name, debit: params.amount, credit: 0 },
          { accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: params.amount },
        ],
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CASH_IN_POSTED',
        module: 'Accounting',
        recordId: je.id,
        summary: `Posted ${params.inflowType} ${prev.settings.currencySymbol} ${params.amount} into ${toAcc.name}`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handlePostTransfer = (fromCode: string, toCode: string, amount: number, note: string) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post internal account transfers')) return;
    commitState((prev) => {
      const fromAcc = prev.accounts.find((a) => a.code === fromCode);
      const toAcc = prev.accounts.find((a) => a.code === toCode);
      if (!fromAcc || !toAcc) return prev;

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: `XFER-${Date.now().toString().slice(-4)}`,
        description: note,
        category: 'Transfer',
        createdBy: activeUserName,
        lines: [
          { accountCode: toAcc.code, accountName: toAcc.name, debit: amount, credit: 0 },
          { accountCode: fromAcc.code, accountName: fromAcc.name, debit: 0, credit: amount },
        ],
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
      };
    });
  };

  const handlePostManualJournal = (params: {
    description: string;
    reference: string;
    category: JournalEntry['category'];
    debitCode: string;
    creditCode: string;
    amount: number;
  }) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post manual journals')) return;
    commitState((prev) => {
      const dr = prev.accounts.find((a) => a.code === params.debitCode);
      const cr = prev.accounts.find((a) => a.code === params.creditCode);
      if (!dr || !cr) return prev;

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: new Date().toISOString(),
        reference: params.reference,
        description: params.description,
        category: params.category,
        createdBy: activeUserName,
        lines: [
          { accountCode: dr.code, accountName: dr.name, debit: params.amount, credit: 0 },
          { accountCode: cr.code, accountName: cr.name, debit: 0, credit: params.amount },
        ],
      });

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'MANUAL_JOURNAL_POSTED',
        module: 'Accounting',
        recordId: je.id,
        summary: `Manual journal ${je.id}: Dr ${dr.name} / Cr ${cr.name} (${prev.settings.currencySymbol} ${params.amount})`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleReverseJournal = (entryId: string) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'reverse journal entries')) return;
    commitState((prev) => {
      const orig = prev.journalEntries.find((j) => j.id === entryId);
      if (!orig || orig.reversedByEntryId) return prev;

      const revId = `JE-${1001 + prev.journalEntries.length}`;
      const reversal = buildJournalEntry({
        id: revId,
        date: new Date().toISOString(),
        reference: `REV-${orig.id}`,
        description: `Auditable reversal of ${orig.id}: ${orig.description}`,
        category: 'Reversal',
        createdBy: activeUserName,
        reversesEntryId: orig.id,
        lines: orig.lines.map((l) => ({
          accountCode: l.accountCode,
          accountName: l.accountName,
          debit: l.credit,
          credit: l.debit,
        })),
      });

      const nextJournals = [
        reversal,
        ...prev.journalEntries.map((j) => (j.id === orig.id ? { ...j, reversedByEntryId: revId } : j)),
      ];

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'JOURNAL_REVERSED',
        module: 'Accounting',
        recordId: orig.id,
        summary: `Reversed journal ${orig.id} via auditable entry ${revId}`,
        beforeValue: orig,
        afterValue: reversal,
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, reversal),
        journalEntries: nextJournals,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handleAddAccount = (
    code: string,
    name: string,
    type: AccountType,
    channel?: MoneySourceChannel,
    walletOptions?: {
      walletType?: string;
      cashOutChargePercent?: number;
      cashOutChargeFlat?: number;
    }
  ) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'create ledger accounts')) return;
    commitState((prev) => {
      const cleanCode = code.trim();
      const cleanName = name.trim();
      if (!cleanCode || !cleanName || prev.accounts.some((a) => a.code === cleanCode)) return prev;
      const inferredChannel =
        type === 'Asset' && (cleanCode.startsWith('10') || channel)
          ? channel || inferMoneyChannel(cleanName)
          : undefined;
      const isWallet = inferredChannel === 'E-Wallet';
      const newAcc: Account = {
        code: cleanCode,
        name: cleanName,
        type,
        balance: 0,
        channel: inferredChannel,
        walletType: isWallet ? walletOptions?.walletType?.trim() || undefined : undefined,
        cashOutChargePercent: isWallet
          ? Math.max(0, Number(walletOptions?.cashOutChargePercent) || 0)
          : undefined,
        cashOutChargeFlat: isWallet
          ? Math.max(0, Number(walletOptions?.cashOutChargeFlat) || 0)
          : undefined,
        active: true,
      };
      const nextDraftCashBanks =
        prev.openingBalance.status !== 'finalized' && isMoneySourceAccount(newAcc)
          ? prev.openingBalance.cashAndBanks.some((c) => c.accountCode === cleanCode)
            ? prev.openingBalance.cashAndBanks
            : [
                ...prev.openingBalance.cashAndBanks,
                {
                  accountCode: cleanCode,
                  accountName: cleanName,
                  balance: 0,
                  channel: inferredChannel,
                  maintain: true,
                  walletType: newAcc.walletType,
                  cashOutChargePercent: newAcc.cashOutChargePercent,
                  cashOutChargeFlat: newAcc.cashOutChargeFlat,
                },
              ]
          : prev.openingBalance.cashAndBanks;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ACCOUNT_CREATED',
        module: 'Accounting',
        recordId: cleanCode,
        summary: `Added ledger account ${cleanCode} · ${cleanName} (${type})`,
        afterValue: newAcc,
      });
      return {
        ...prev,
        accounts: [...prev.accounts, newAcc],
        openingBalance: {
          ...prev.openingBalance,
          cashAndBanks: nextDraftCashBanks,
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast(`Added account ${name.trim()}.`);
  };

  const handleDeleteAccount = (accountCode: string) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'delete ledger accounts')) return;
    commitState((prev) => {
      const target = prev.accounts.find((a) => a.code === accountCode);
      if (!target) return prev;
      const hasJournals = prev.journalEntries.some((j) =>
        j.lines.some((l) => l.accountCode === accountCode)
      );
      if (hasJournals || Math.abs(target.balance) > 0.009) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ACCOUNT_DELETED',
        module: 'Accounting',
        recordId: accountCode,
        summary: `Deleted unused ledger account ${accountCode} · ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        accounts: prev.accounts.filter((a) => a.code !== accountCode),
        openingBalance: {
          ...prev.openingBalance,
          cashAndBanks: prev.openingBalance.cashAndBanks.filter(
            (cb) => cb.accountCode !== accountCode
          ),
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Account removed.');
  };

  const handleDeactivateAccount = (accountCode: string) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'deactivate ledger accounts')) return;
    commitState((prev) => ({
      ...prev,
      accounts: prev.accounts.map((a) =>
        a.code === accountCode ? { ...a, active: false } : a
      ),
    }));
    showToast('Account marked inactive for new transactions.');
  };

  const handleQuickAddMoneyAccount = (params: QuickAddMoneyAccountParams): string | null => {
    const canAdd =
      activePerms.actions.canCollectPayments ||
      activePerms.actions.canPostAccounting ||
      activePerms.actions.canCreateOrders;
    if (!requireAction(canAdd, 'add payment methods')) return null;

    const cleanName = params.name.trim();
    if (!cleanName) return null;

    const newCode = generateNextMoneyAccountCode(state.accounts);
    const isWallet = params.channel === 'E-Wallet';
    const walletType = isWallet ? params.walletType?.trim() || undefined : undefined;
    const cashOutChargePercent = isWallet
      ? Math.max(0, Number(params.cashOutChargePercent) || 0)
      : undefined;
    const cashOutChargeFlat = isWallet
      ? Math.max(0, Number(params.cashOutChargeFlat) || 0)
      : undefined;

    commitState((prev) => {
      const code = prev.accounts.some((a) => a.code === newCode)
        ? generateNextMoneyAccountCode(prev.accounts)
        : newCode;
      const newAcc: Account = {
        code,
        name: cleanName,
        type: 'Asset',
        balance: 0,
        channel: params.channel,
        walletType,
        cashOutChargePercent,
        cashOutChargeFlat,
        active: true,
      };
      const nextDraftCashBanks =
        prev.openingBalance.status !== 'finalized'
          ? [
              ...prev.openingBalance.cashAndBanks,
              {
                accountCode: code,
                accountName: cleanName,
                balance: 0,
                channel: params.channel,
                maintain: true,
                walletType,
                cashOutChargePercent,
                cashOutChargeFlat,
              },
            ]
          : prev.openingBalance.cashAndBanks;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ACCOUNT_CREATED',
        module: 'Accounting',
        recordId: code,
        summary: `Quick-added custom payment method ${code} · ${cleanName} (${params.channel})`,
        afterValue: newAcc,
      });
      return {
        ...prev,
        accounts: [...prev.accounts, newAcc],
        openingBalance: {
          ...prev.openingBalance,
          cashAndBanks: nextDraftCashBanks,
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });

    showToast(`Added payment method "${cleanName}".`);
    return newCode;
  };

  const handlePostSuddenMoneyAdjustment = (params: {
    accountCode: string;
    direction: 'Add' | 'Deduct';
    amount: number;
    offsetAccountCode: string;
    reason: string;
    date?: string;
  }) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post sudden money adjustments')) return;
    const cleanReason = params.reason.trim();
    const amt = Number(params.amount);
    if (!cleanReason || Number.isNaN(amt) || amt <= 0) return;

    let toastText = '';
    commitState((prev) => {
      const moneyAcc = prev.accounts.find((a) => a.code === params.accountCode);
      const offsetAcc = prev.accounts.find((a) => a.code === params.offsetAccountCode);
      if (!moneyAcc || !offsetAcc || moneyAcc.code === offsetAcc.code) return prev;

      const beforeBal = moneyAcc.balance;
      const isAdd = params.direction === 'Add';
      const jeDate = params.date
        ? `${params.date}T12:00:00.000Z`
        : new Date().toISOString();

      const je = buildJournalEntry({
        id: `JE-ADJ-${1001 + prev.journalEntries.length}`,
        date: jeDate,
        reference: isAdd ? 'SUDDEN-ADD' : 'SUDDEN-DEDUCT',
        description: `Sudden ${isAdd ? 'Add' : 'Deduct'} (${moneyAcc.name} ↔ ${offsetAcc.name}): ${cleanReason}`,
        category: 'Sudden Adjustment',
        createdBy: activeUserName,
        lines: isAdd
          ? [
              { accountCode: moneyAcc.code, accountName: moneyAcc.name, debit: amt, credit: 0 },
              { accountCode: offsetAcc.code, accountName: offsetAcc.name, debit: 0, credit: amt },
            ]
          : [
              { accountCode: offsetAcc.code, accountName: offsetAcc.name, debit: amt, credit: 0 },
              { accountCode: moneyAcc.code, accountName: moneyAcc.name, debit: 0, credit: amt },
            ],
      });

      const nextAccounts = applyJournalToAccounts(prev.accounts, je);
      const afterBal = nextAccounts.find((a) => a.code === moneyAcc.code)?.balance ?? beforeBal;

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: isAdd ? 'SUDDEN_MONEY_ADDED' : 'SUDDEN_MONEY_DEDUCTED',
        module: 'Accounting',
        recordId: je.id,
        summary: `Sudden ${isAdd ? '+' : '-'}${prev.settings.currencySymbol} ${amt} on ${moneyAcc.name} (${offsetAcc.name}): ${cleanReason}`,
        beforeValue: { accountCode: moneyAcc.code, balance: beforeBal },
        afterValue: { accountCode: moneyAcc.code, balance: afterBal, reason: cleanReason, journalId: je.id },
      });

      toastText = `Posted sudden ${isAdd ? 'addition' : 'deduction'} on ${moneyAcc.name}: ${prev.settings.currencySymbol} ${amt}`;
      return {
        ...prev,
        accounts: nextAccounts,
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
    if (toastText) showToast(toastText);
  };

  // --- EMPLOYEES & EXPENSES ---

  const handleAddEmployee = (emp: Omit<Employee, 'id' | 'advanceBalance' | 'salaryDue' | 'active'>) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'add staff records')) return;
    commitState((prev) => ({
      ...prev,
      employees: [
        ...prev.employees,
        {
          ...emp,
          id: `EMP-0${prev.employees.length + 1}`,
          advanceBalance: 0,
          salaryDue: 0,
          active: true,
        },
      ],
    }));
  };

  const handlePostPayroll = (params: {
    employeeId: string;
    type: PayrollRecord['type'];
    grossAmount: number;
    deductionAmount: number;
    paymentAccountCode: string;
    note: string;
  }) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'process payroll')) return;
    commitState((prev) => {
      const emp = prev.employees.find((e) => e.id === params.employeeId);
      const payAcc = prev.accounts.find((a) => a.code === params.paymentAccountCode);
      const salaryExpAcc = prev.accounts.find((a) => a.code === '5020');
      if (!emp || !payAcc || !salaryExpAcc) return prev;

      const netPaid = Math.max(0, Number((params.grossAmount - params.deductionAmount).toFixed(2)));
      const rec: PayrollRecord = {
        id: `PAY-${201 + prev.payrollRecords.length}`,
        employeeId: emp.id,
        employeeName: emp.name,
        date: new Date().toISOString(),
        type: params.type,
        grossAmount: params.grossAmount,
        deductionAmount: params.deductionAmount,
        netPaid,
        paymentAccountCode: params.paymentAccountCode,
        note: params.note,
      };

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date: rec.date,
        reference: rec.id,
        description: `Payroll (${params.type}): ${emp.name}`,
        category: 'Payroll',
        createdBy: activeUserName,
        lines: [
          { accountCode: salaryExpAcc.code, accountName: salaryExpAcc.name, debit: netPaid, credit: 0 },
          { accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: netPaid },
        ],
      });

      const nextEmployees = prev.employees.map((e) =>
        e.id === emp.id
          ? {
              ...e,
              advanceBalance:
                params.type === 'Advance'
                  ? e.advanceBalance + netPaid
                  : Math.max(0, e.advanceBalance - params.deductionAmount),
            }
          : e
      );

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'PAYROLL_POSTED',
        module: 'Employees',
        recordId: rec.id,
        summary: `Posted ${params.type} ${prev.settings.currencySymbol} ${netPaid} for ${emp.name}`,
        afterValue: rec,
      });

      return {
        ...prev,
        employees: nextEmployees,
        payrollRecords: [rec, ...prev.payrollRecords],
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handlePostExpense = (params: {
    category: string;
    amount: number;
    paymentAccountCode: string;
    description: string;
    reference: string;
    recurring: boolean;
    recurrenceCycle?: 'Weekly' | 'Monthly';
  }) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'record operating expenses')) return;
    commitState((prev) => {
      const payAcc = prev.accounts.find((a) => a.code === params.paymentAccountCode);
      const expCode =
        params.category === 'Electricity' ||
        params.category === 'Water' ||
        params.category === 'Gas' ||
        params.category === 'Rent' ||
        params.category === 'Internet'
          ? '5030'
          : params.category === 'Maintenance' || params.category === 'Transport'
          ? '5040'
          : '5050';
      const expAcc = prev.accounts.find((a) => a.code === expCode);
      if (!payAcc || !expAcc) return prev;

      const date = new Date().toISOString();
      const nextDueDate = params.recurring
        ? new Date(
            Date.now() + (params.recurrenceCycle === 'Weekly' ? 7 : 30) * 86400000
          ).toISOString()
        : undefined;

      const expId = `EXP-${401 + prev.expenses.length}`;
      const newExp = {
        id: expId,
        date,
        category: params.category,
        amount: params.amount,
        paymentAccountCode: params.paymentAccountCode,
        description: params.description,
        reference: params.reference,
        recurring: params.recurring,
        recurrenceCycle: params.recurrenceCycle,
        nextDueDate,
      };

      const je = buildJournalEntry({
        id: `JE-${1001 + prev.journalEntries.length}`,
        date,
        reference: params.reference,
        description: `Expense (${params.category}): ${params.description}`,
        category: 'Expense',
        createdBy: activeUserName,
        lines: [
          { accountCode: expAcc.code, accountName: expAcc.name, debit: params.amount, credit: 0 },
          { accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: params.amount },
        ],
      });

      const nextTasks = [...prev.tasks];
      if (params.recurring && nextDueDate) {
        nextTasks.unshift({
          id: `TSK-${101 + prev.tasks.length}`,
          title: `Recurring ${params.category} Expense Due`,
          description: params.description,
          category: 'Expense Due',
          priority: 'Normal',
          status: 'Pending',
          dueAt: nextDueDate,
          reminderMinutesBefore: 1440,
          linkedRecordId: expId,
          assignee: 'Owner',
          autoGenerated: true,
        });
      }

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'EXPENSE_POSTED',
        module: 'Expenses',
        recordId: expId,
        summary: `Posted ${params.category} expense ${prev.settings.currencySymbol} ${params.amount}`,
        afterValue: newExp,
      });

      return {
        ...prev,
        expenses: [newExp, ...prev.expenses],
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        tasks: nextTasks,
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- TASKS & NOTIFICATIONS ---

  const handleAddTask = (task: Omit<ScheduledTask, 'id'>) => {
    if (!requireAction(activePerms.actions.canManageTasks, 'schedule tasks')) return;
    commitState((prev) => {
      const created: ScheduledTask = { ...task, id: `TSK-${101 + prev.tasks.length}` };
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'TASK_SCHEDULED',
        module: 'Tasks & Calendar',
        recordId: created.id,
        summary: `Scheduled task: ${created.title}`,
        afterValue: created,
      });
      return { ...prev, tasks: [created, ...prev.tasks], blackBox: [bb, ...prev.blackBox] };
    }, true);
  };

  const handleToggleTaskStatus = (taskId: string) => {
    if (!requireAction(activePerms.actions.canManageTasks, 'update task status')) return;
    commitState((prev) => ({
      ...prev,
      tasks: prev.tasks.map((t) =>
        t.id === taskId ? { ...t, status: t.status === 'Completed' ? 'Pending' : 'Completed' } : t
      ),
    }), true);
  };

  const handleDeleteTask = (taskId: string) => {
    if (!requireAction(activePerms.actions.canManageTasks, 'delete tasks')) return;
    commitState((prev) => {
      const target = prev.tasks.find((t) => t.id === taskId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'TASK_DELETED',
        module: 'Tasks & Calendar',
        recordId: taskId,
        summary: `Deleted task "${target.title}"`,
        beforeValue: target,
      });
      return {
        ...prev,
        tasks: prev.tasks.filter((t) => t.id !== taskId),
        blackBox: [bb, ...prev.blackBox],
      };
    }, true);
    showToast('Task deleted');
  };

  const handleBulkDeleteTasks = (taskIds: string[]) => {
    if (!requireAction(activePerms.actions.canManageTasks, 'delete tasks')) return;
    if (taskIds.length === 0) return;
    const idSet = new Set(taskIds);
    commitState((prev) => {
      const removed = prev.tasks.filter((t) => idSet.has(t.id));
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'TASKS_BULK_DELETED',
        module: 'Tasks & Calendar',
        recordId: `${removed.length} tasks`,
        summary: `Bulk deleted ${removed.length} scheduled tasks`,
        beforeValue: removed.map((r) => r.id),
      });
      return {
        ...prev,
        tasks: prev.tasks.filter((t) => !idSet.has(t.id)),
        blackBox: [bb, ...prev.blackBox],
      };
    }, true);
    showToast(`Deleted ${taskIds.length} items`);
  };

  // --- DELETE & DEACTIVATE HANDLERS (ALL AUDITED IN BLACK BOX) ---

  const handleDeleteProduct = (id: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'delete retail products')) return;
    commitState((prev) => {
      const target = prev.products.find((p) => p.id === id);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'PRODUCT_DELETED',
        module: 'Catalogue',
        recordId: id,
        summary: `Deleted retail product ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        products: prev.products.filter((p) => p.id !== id),
        prices: prev.prices.filter((pr) => pr.productId !== id),
        customerCustomPrices: prev.customerCustomPrices.filter((cp) => cp.productId !== id),
        blackBox: [bb, ...prev.blackBox],
      };
    }, true);
    showToast('Product deleted');
  };

  const handleDeleteService = (id: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'delete retail services')) return;
    commitState((prev) => {
      const target = prev.services.find((s) => s.id === id);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SERVICE_DELETED',
        module: 'Catalogue',
        recordId: id,
        summary: `Deleted retail service ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        services: prev.services.filter((s) => s.id !== id),
        prices: prev.prices.filter((pr) => pr.serviceId !== id),
        customerCustomPrices: prev.customerCustomPrices.filter((cp) => cp.serviceId !== id),
        blackBox: [bb, ...prev.blackBox],
      };
    }, true);
    showToast('Service deleted');
  };

  const handleDeletePrice = (productId: string, serviceId: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'clear pricing matrix entries')) return;
    commitState((prev) => {
      const existing = prev.prices.find(
        (p) => p.productId === productId && p.serviceId === serviceId
      );
      if (!existing) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'RETAIL_PRICE_DELETED',
        module: 'Catalogue',
        recordId: `${productId}:${serviceId}`,
        summary: `Cleared retail price (${prev.settings.currencySymbol} ${existing.price})`,
        beforeValue: existing,
      });
      return {
        ...prev,
        prices: prev.prices.filter((p) => p.id !== existing.id),
        blackBox: [bb, ...prev.blackBox],
      };
    }, true);
    showToast('Price entry cleared');
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (
      !requireAction(
        activePerms.actions.canCreateOrders || activePerms.actions.canCollectPayments,
        'delete retail customers'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const target = prev.customers.find((c) => c.id === customerId);
      if (!target) return prev;
      const hasLinked =
        prev.orders.some((o) => o.customerId === customerId) ||
        prev.invoices.some((i) => i.customerId === customerId) ||
        target.outstandingBalance > 0 ||
        target.advanceBalance > 0;
      if (hasLinked) return prev;

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CUSTOMER_DELETED',
        module: 'Customers',
        recordId: customerId,
        summary: `Deleted retail customer ${target.name} (${customerId})`,
        beforeValue: target,
      });
      return {
        ...prev,
        customers: prev.customers.filter((c) => c.id !== customerId),
        customerCustomPrices: prev.customerCustomPrices.filter((cp) => cp.customerId !== customerId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Customer deleted');
  };

  const handleDeactivateCustomer = (customerId: string) => {
    if (
      !requireAction(
        activePerms.actions.canCreateOrders || activePerms.actions.canCollectPayments,
        'deactivate retail customers'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const target = prev.customers.find((c) => c.id === customerId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CUSTOMER_DEACTIVATED',
        module: 'Customers',
        recordId: customerId,
        summary: `Marked retail customer ${target.name} (${customerId}) as inactive`,
        beforeValue: target,
      });
      return {
        ...prev,
        customers: prev.customers.map((c) => (c.id === customerId ? { ...c, active: false } : c)),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Customer marked inactive');
  };

  const handleDeleteCategory = (catId: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'delete customer categories')) return;
    commitState((prev) => {
      const target = prev.categories.find((c) => c.id === catId);
      if (!target || prev.categories.length <= 1) return prev;
      const fallbackCatId = prev.categories.find((c) => c.id !== catId)?.id || 'cat-regular';
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CATEGORY_DELETED',
        module: 'Customers',
        recordId: catId,
        summary: `Deleted customer category ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        categories: prev.categories.filter((c) => c.id !== catId),
        customers: prev.customers.map((cu) =>
          cu.categoryId === catId ? { ...cu, categoryId: fallbackCatId } : cu
        ),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Category deleted');
  };

  const handleDeleteCustomerCustomPrice = (priceId: string) => {
    if (!requireAction(activePerms.actions.canOverridePrices, 'remove customer custom prices')) return;
    commitState((prev) => {
      const target = prev.customerCustomPrices.find((p) => p.id === priceId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CUSTOMER_CUSTOM_PRICE_DELETED',
        module: 'Customers',
        recordId: target.customerId,
        summary: `Removed custom price (${prev.settings.currencySymbol} ${target.price}) for customer ${target.customerId}`,
        beforeValue: target,
      });
      return {
        ...prev,
        customerCustomPrices: prev.customerCustomPrices.filter((p) => p.id !== priceId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Custom price removed');
  };

  const handleDeleteOrder = (orderId: string) => {
    if (!requireAction(activePerms.actions.canCreateOrders, 'delete retail orders')) return;
    commitState((prev) => {
      const ord = prev.orders.find((o) => o.id === orderId);
      if (!ord || ord.paidAmount > 0 || Boolean(ord.invoiceId) || ord.isOpening) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'ORDER_DELETED',
        module: 'Orders',
        recordId: orderId,
        summary: `Deleted unposted retail order ${orderId} (${ord.customerName})`,
        beforeValue: ord,
      });
      return {
        ...prev,
        orders: prev.orders.filter((o) => o.id !== orderId),
        tasks: prev.tasks.filter((t) => !(t.autoGenerated && t.linkedRecordId === orderId)),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast(`Order ${orderId} deleted`);
  };

  const handleDeleteCorporate = (corpId: string) => {
    if (!requireAction(activePerms.actions.canManageCorporate, 'delete corporate accounts')) return;
    commitState((prev) => {
      const target = prev.corporateCustomers.find((c) => c.id === corpId);
      if (!target) return prev;
      const hasLinked =
        prev.corporateMovements.some((m) => m.corporateId === corpId) ||
        prev.invoices.some((i) => i.corporateId === corpId) ||
        target.outstandingBalance > 0 ||
        target.advanceBalance > 0;
      if (hasLinked) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORPORATE_DELETED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Deleted corporate account ${target.name} (${corpId})`,
        beforeValue: target,
      });
      return {
        ...prev,
        corporateCustomers: prev.corporateCustomers.filter((c) => c.id !== corpId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Corporate account deleted');
  };

  const handleDeactivateCorporate = (corpId: string) => {
    if (!requireAction(activePerms.actions.canManageCorporate, 'deactivate corporate accounts')) return;
    commitState((prev) => {
      const target = prev.corporateCustomers.find((c) => c.id === corpId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORPORATE_DEACTIVATED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Deactivated corporate account ${target.name} (${corpId})`,
        beforeValue: target,
      });
      return {
        ...prev,
        corporateCustomers: prev.corporateCustomers.map((c) =>
          c.id === corpId ? { ...c, active: false } : c
        ),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Corporate account deactivated');
  };

  const handleDeleteCorporateProduct = (corpId: string, productId: string) => {
    if (
      !requireAction(
        activePerms.actions.canManageCorporate || activePerms.actions.canOverridePrices,
        'delete corporate catalogue items'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === corpId);
      const prod = corp?.products.find((p) => p.id === productId);
      if (!corp || !prod) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_PRODUCT_DELETED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Deleted product "${prod.name}" from ${corp.name} private catalogue`,
        beforeValue: prod,
      });
      return {
        ...prev,
        corporateCustomers: prev.corporateCustomers.map((c) =>
          c.id === corpId
            ? {
                ...c,
                products: c.products.filter((p) => p.id !== productId),
                prices: c.prices.filter((pr) => pr.productId !== productId),
              }
            : c
        ),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Corporate item deleted');
  };

  const handleDeleteCorporateService = (corpId: string, serviceId: string) => {
    if (
      !requireAction(
        activePerms.actions.canManageCorporate || activePerms.actions.canOverridePrices,
        'delete corporate services'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === corpId);
      const srv = corp?.services.find((s) => s.id === serviceId);
      if (!corp || !srv) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_SERVICE_DELETED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Deleted service "${srv.name}" from ${corp.name} private catalogue`,
        beforeValue: srv,
      });
      return {
        ...prev,
        corporateCustomers: prev.corporateCustomers.map((c) =>
          c.id === corpId
            ? {
                ...c,
                services: c.services.filter((s) => s.id !== serviceId),
                prices: c.prices.filter((pr) => pr.serviceId !== serviceId),
              }
            : c
        ),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Corporate service deleted');
  };

  const handleDeleteCorporatePrice = (corpId: string, productId: string, serviceId: string) => {
    if (
      !requireAction(
        activePerms.actions.canManageCorporate || activePerms.actions.canOverridePrices,
        'clear corporate price entries'
      )
    ) {
      return;
    }
    commitState((prev) => {
      const corp = prev.corporateCustomers.find((c) => c.id === corpId);
      const existing = corp?.prices.find(
        (pr) => pr.productId === productId && pr.serviceId === serviceId
      );
      if (!corp || !existing) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CORP_PRICE_DELETED',
        module: 'Corporate',
        recordId: corpId,
        summary: `Cleared custom rate in ${corp.name} (${prev.settings.currencySymbol} ${existing.price})`,
        beforeValue: existing,
      });
      return {
        ...prev,
        corporateCustomers: prev.corporateCustomers.map((c) =>
          c.id === corpId ? { ...c, prices: c.prices.filter((pr) => pr.id !== existing.id) } : c
        ),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Corporate price cleared');
  };

  const handleDeleteChemical = (chemId: string) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'delete chemical items')) return;
    commitState((prev) => {
      const target = prev.chemicals.find((c) => c.id === chemId);
      if (!target) return prev;
      const hasMovements = prev.stockMovements.some((m) => m.itemId === chemId);
      if (hasMovements) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CHEMICAL_DELETED',
        module: 'Inventory',
        recordId: chemId,
        summary: `Deleted chemical item ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        chemicals: prev.chemicals.filter((c) => c.id !== chemId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Chemical item deleted');
  };

  const handleDeactivateChemical = (chemId: string) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'deactivate chemical items')) return;
    commitState((prev) => {
      const target = prev.chemicals.find((c) => c.id === chemId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'CHEMICAL_DEACTIVATED',
        module: 'Inventory',
        recordId: chemId,
        summary: `Marked chemical ${target.name} inactive`,
        beforeValue: target,
      });
      return {
        ...prev,
        chemicals: prev.chemicals.map((c) => (c.id === chemId ? { ...c, active: false } : c)),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Chemical marked inactive');
  };

  const handleDeleteSupplier = (supplierId: string) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'delete suppliers')) return;
    commitState((prev) => {
      const target = prev.suppliers.find((s) => s.id === supplierId);
      if (!target || target.dueBalance > 0) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SUPPLIER_DELETED',
        module: 'Inventory',
        recordId: supplierId,
        summary: `Deleted supplier ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        suppliers: prev.suppliers.filter((s) => s.id !== supplierId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Supplier deleted');
  };

  const handleDeactivateSupplier = (supplierId: string) => {
    if (!requireAction(activePerms.actions.canAdjustInventory, 'deactivate suppliers')) return;
    commitState((prev) => {
      const target = prev.suppliers.find((s) => s.id === supplierId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'SUPPLIER_DEACTIVATED',
        module: 'Inventory',
        recordId: supplierId,
        summary: `Marked supplier ${target.name} inactive`,
        beforeValue: target,
      });
      return {
        ...prev,
        suppliers: prev.suppliers.map((s) => (s.id === supplierId ? { ...s, active: false } : s)),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Supplier marked inactive');
  };

  const handleDeleteEmployee = (empId: string) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'delete staff records')) return;
    commitState((prev) => {
      const target = prev.employees.find((e) => e.id === empId);
      if (!target) return prev;
      const hasPayroll = prev.payrollRecords.some((r) => r.employeeId === empId);
      if (hasPayroll || target.advanceBalance > 0 || target.salaryDue > 0) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'EMPLOYEE_DELETED',
        module: 'Employees',
        recordId: empId,
        summary: `Deleted employee record ${target.name}`,
        beforeValue: target,
      });
      return {
        ...prev,
        employees: prev.employees.filter((e) => e.id !== empId),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Staff record deleted');
  };

  const handleDeactivateEmployee = (empId: string) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'deactivate staff records')) return;
    commitState((prev) => {
      const target = prev.employees.find((e) => e.id === empId);
      if (!target) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'EMPLOYEE_DEACTIVATED',
        module: 'Employees',
        recordId: empId,
        summary: `Marked employee ${target.name} inactive`,
        beforeValue: target,
      });
      return {
        ...prev,
        employees: prev.employees.map((e) => (e.id === empId ? { ...e, active: false } : e)),
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Staff member marked inactive');
  };

  const handleDeleteExpenseCategory = (category: string) => {
    if (!requireAction(activePerms.actions.canManagePayrollExpenses, 'delete expense categories')) return;
    commitState((prev) => {
      if (prev.settings.expenseCategories.length <= 1) return prev;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'EXPENSE_CATEGORY_DELETED',
        module: 'Expenses',
        recordId: category,
        summary: `Removed expense category "${category}"`,
        beforeValue: category,
      });
      return {
        ...prev,
        settings: {
          ...prev.settings,
          expenseCategories: prev.settings.expenseCategories.filter((c) => c !== category),
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Expense category deleted');
  };

  const handleRemoveCompanyLogo = () => {
    commitState((prev) => {
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'COMPANY_LOGO_REMOVED',
        module: 'Settings',
        recordId: 'company-logo',
        summary: `Removed uploaded company logo from Branding settings`,
      });
      return {
        ...prev,
        settings: {
          ...prev.settings,
          companyLogoDataUrl: undefined,
          companyLogoMimeType: undefined,
        },
        blackBox: [bb, ...prev.blackBox],
      };
    });
    showToast('Company logo removed');
  };

  const handleRecordPrint = (kind: 'Invoice' | 'Token', id: string) => {
    commitState((prev) => {
      const nextInvoices =
        kind === 'Invoice'
          ? prev.invoices.map((inv) =>
              inv.id === id ? { ...inv, reprintCount: inv.reprintCount + 1 } : inv
            )
          : prev.invoices;
      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: `${kind.toUpperCase()}_PRINTED`,
        module: 'Documents',
        recordId: id,
        summary: `Printed ${kind} for ${id}`,
      });
      return { ...prev, invoices: nextInvoices, blackBox: [bb, ...prev.blackBox] };
    });
  };

  // --- OPENING BALANCE HANDLERS ---

  const handleSaveOpeningDraft = (draft: OpeningBalanceDraft) => {
    commitState((prev) => {
      let nextAccounts = [...prev.accounts];
      // Sync newly added Step 2 accounts into COA immediately so they are selectable app-wide
      for (const cb of draft.cashAndBanks) {
        const existingIdx = nextAccounts.findIndex((a) => a.code === cb.accountCode);
        const channel = cb.channel || inferMoneyChannel(cb.accountName);
        const isWallet = channel === 'E-Wallet';
        const isActive = cb.maintain !== false;
        const walletType = isWallet ? cb.walletType?.trim() || undefined : undefined;
        const cashOutChargePercent = isWallet
          ? Math.max(0, Number(cb.cashOutChargePercent) || 0)
          : undefined;
        const cashOutChargeFlat = isWallet
          ? Math.max(0, Number(cb.cashOutChargeFlat) || 0)
          : undefined;
        if (existingIdx >= 0) {
          nextAccounts[existingIdx] = {
            ...nextAccounts[existingIdx],
            name: cb.accountName,
            channel,
            active: isActive,
            walletType,
            cashOutChargePercent,
            cashOutChargeFlat,
          };
        } else {
          nextAccounts.push({
            code: cb.accountCode,
            name: cb.accountName,
            type: 'Asset',
            balance: 0,
            channel,
            active: isActive,
            walletType,
            cashOutChargePercent,
            cashOutChargeFlat,
          });
        }
      }

      // If user removed an unused zero-balance 10xx money account row in Step 2, keep COA in sync
      if (prev.openingBalance.status !== 'finalized') {
        const draftCodes = new Set(draft.cashAndBanks.map((cb) => cb.accountCode));
        nextAccounts = nextAccounts.filter((acc) => {
          if (!isMoneySourceAccount(acc)) return true;
          if (draftCodes.has(acc.code)) return true;
          const usedInJournal = prev.journalEntries.some((j) =>
            j.lines.some((l) => l.accountCode === acc.code)
          );
          if (usedInJournal || Math.abs(acc.balance) > 0.009) return true;
          return false;
        });
      }

      return {
        ...prev,
        accounts: nextAccounts,
        openingBalance: { ...draft, status: 'draft' },
      };
    });
  };

  const handleFinalizeOpeningBalance = (params: {
    draft: OpeningBalanceDraft;
    balanceWithOpeningEquity: boolean;
  }) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'finalize opening balances')) return;
    const { draft } = params;
    commitState((prev) => {
      if (prev.openingBalance.status === 'finalized') return prev;
      const asOfIso = `${draft.asOfDate}T08:00:00.000Z`;
      const journalId = `JE-OPEN-${1001 + prev.journalEntries.length}`;

      // Sync Step 2 Cash / Bank / E-Wallet accounts with Chart of Accounts
      const draftCodes = new Set(draft.cashAndBanks.map((cb) => cb.accountCode));
      const nextAccounts: Account[] = prev.accounts.filter((acc) => {
        if (!isMoneySourceAccount(acc) || draftCodes.has(acc.code)) return true;
        const usedInJournal = prev.journalEntries.some((j) =>
          j.lines.some((l) => l.accountCode === acc.code)
        );
        return usedInJournal || Math.abs(acc.balance) > 0.009;
      });
      for (const cb of draft.cashAndBanks) {
        const channel = cb.channel || inferMoneyChannel(cb.accountName);
        const isWallet = channel === 'E-Wallet';
        const isActive = cb.maintain !== false;
        const walletType = isWallet ? cb.walletType?.trim() || undefined : undefined;
        const cashOutChargePercent = isWallet
          ? Math.max(0, Number(cb.cashOutChargePercent) || 0)
          : undefined;
        const cashOutChargeFlat = isWallet
          ? Math.max(0, Number(cb.cashOutChargeFlat) || 0)
          : undefined;
        const idx = nextAccounts.findIndex((a) => a.code === cb.accountCode);
        if (idx >= 0) {
          nextAccounts[idx] = {
            ...nextAccounts[idx],
            name: cb.accountName,
            channel,
            active: isActive,
            walletType,
            cashOutChargePercent,
            cashOutChargeFlat,
          };
        } else {
          nextAccounts.push({
            code: cb.accountCode,
            name: cb.accountName,
            type: 'Asset',
            balance: 0,
            channel,
            active: isActive,
            walletType,
            cashOutChargePercent,
            cashOutChargeFlat,
          });
        }
      }

      const lines: JournalLine[] = [];
      let totalDebit = 0;
      let totalCredit = 0;

      const pushLine = (code: string, fallbackName: string, debit: number, credit: number) => {
        if (debit <= 0 && credit <= 0) return;
        const acc = nextAccounts.find((a) => a.code === code);
        lines.push({
          accountCode: code,
          accountName: acc?.name || fallbackName,
          debit: Number(debit.toFixed(2)),
          credit: Number(credit.toFixed(2)),
        });
        totalDebit += debit;
        totalCredit += credit;
      };

      // Debit Assets
      for (const cb of draft.cashAndBanks) {
        if (cb.balance > 0) pushLine(cb.accountCode, cb.accountName, cb.balance, 0);
      }
      const retailArTotal = draft.retailDues.reduce((s, r) => s + r.amount, 0);
      if (retailArTotal > 0) pushLine('1100', 'Accounts Receivable - Retail', retailArTotal, 0);

      const corpArTotal = draft.corporateDues.reduce((s, c) => s + c.amount, 0);
      if (corpArTotal > 0) pushLine('1110', 'Accounts Receivable - Corporate', corpArTotal, 0);

      const stockVal = draft.chemicalStocks.reduce((s, ch) => s + ch.qty * ch.unitCost, 0);
      if (stockVal > 0) pushLine('1200', 'Chemical & Consumables Inventory', stockVal, 0);

      const otherAssetsVal = draft.otherAssets.reduce((s, oa) => s + oa.value, 0);
      if (otherAssetsVal > 0) pushLine('1300', 'Machinery, Equipment & Deposits', otherAssetsVal, 0);

      const staffAdvVal = draft.employeeBalances.reduce((s, e) => s + e.advanceGiven, 0);
      if (staffAdvVal > 0) pushLine('1400', 'Staff Advances Receivable', staffAdvVal, 0);

      // Credit Liabilities & Owner Capital
      const custAdvVal = draft.customerAdvances.reduce((s, c) => s + c.amount, 0);
      if (custAdvVal > 0) pushLine('2100', 'Customer Advances', 0, custAdvVal);

      const supDueVal = draft.supplierDues.reduce((s, sp) => s + sp.amount, 0);
      if (supDueVal > 0) pushLine('2010', 'Accounts Payable - Suppliers', 0, supDueVal);

      const loansVal = draft.loansAndLiabilities.reduce((s, l) => s + l.amount, 0);
      if (loansVal > 0) pushLine('2200', 'Business Loans Payable', 0, loansVal);

      const empSalDueVal = draft.employeeBalances.reduce((s, e) => s + e.salaryDue, 0);
      if (empSalDueVal > 0) pushLine('2300', 'Salaries & Wages Payable', 0, empSalDueVal);

      if (draft.ownerCapitalAmount > 0) {
        pushLine('3010', 'Owner Capital', 0, draft.ownerCapitalAmount);
      }

      // Balancing Entry -> Opening Balance Equity (3040)
      const diff = Number((totalDebit - totalCredit).toFixed(2));
      if (Math.abs(diff) >= 0.01) {
        if (diff > 0) {
          pushLine('3040', 'Opening Balance Equity', 0, diff);
        } else {
          pushLine('3040', 'Opening Balance Equity', Math.abs(diff), 0);
        }
      }

      let updatedAccounts = nextAccounts;
      let nextJournals = prev.journalEntries;
      if (lines.length >= 2) {
        const openingEntry: JournalEntry = {
          ...buildJournalEntry({
            id: journalId,
            date: asOfIso,
            reference: 'OPEN-BAL',
            description: `Opening Balances & Capital as of ${draft.asOfDate}`,
            category: 'Opening Balance',
            createdBy: activeUserName,
            lines,
          }),
          isOpening: true,
        };
        updatedAccounts = applyJournalToAccounts(nextAccounts, openingEntry);
        nextJournals = [openingEntry, ...prev.journalEntries];
      }

      // Apply Opening Customer Dues & Advances
      const nextCustomers = prev.customers.map((c) => {
        const due = draft.retailDues.find((d) => d.customerId === c.id)?.amount || 0;
        const adv = draft.customerAdvances.find((a) => a.customerId === c.id)?.amount || 0;
        return {
          ...c,
          outstandingBalance: Number((c.outstandingBalance + due).toFixed(2)),
          advanceBalance: Number((c.advanceBalance + adv).toFixed(2)),
        };
      });

      const nextCorps = prev.corporateCustomers.map((corp) => {
        const due = draft.corporateDues.find((d) => d.corporateId === corp.id)?.amount || 0;
        return {
          ...corp,
          outstandingBalance: Number((corp.outstandingBalance + due).toFixed(2)),
        };
      });

      // Corporate Pending Items -> Opening rows in Corporate Movement Log
      const openingCorpMovements: CorporateMovement[] = [];
      draft.corporatePendingItems.forEach((item, idx) => {
        const corp = prev.corporateCustomers.find((c) => c.id === item.corporateId);
        const prod = corp?.products.find((p) => p.id === item.productId);
        const srv = corp?.services.find((s) => s.id === item.serviceId);
        if (!corp || !prod || !srv) return;
        const rate =
          corp.prices.find((p) => p.productId === prod.id && p.serviceId === srv.id)?.price ?? 0;

        if (item.alreadyReceivedTotal > 0 || item.alreadyDeliveredTotal > 0 || item.pendingQty > 0) {
          const netPending = item.pendingQty;
          openingCorpMovements.push({
            id: `CMOV-OPEN-${Date.now()}-${idx}`,
            orderId: `OPEN-${idx + 1}`,
            corporateId: corp.id,
            date: asOfIso,
            event: 'Received',
            productId: prod.id,
            productName: prod.name,
            serviceId: srv.id,
            serviceName: srv.name,
            qtyDelta: netPending,
            pendingAfter: netPending,
            unitPriceSnapshot: rate,
            billedQty: netPending, // Tagged billed so earlier quantities are never re-billed
            reason: `Opening balance (Prior Recv: ${item.alreadyReceivedTotal}, Prior Deliv: ${item.alreadyDeliveredTotal}, Already Billed: ${prev.settings.currencySymbol} ${item.alreadyBilledAmount})`,
            user: activeUserName,
            isOpening: true,
          });
        }
      });

      const nextSuppliers = prev.suppliers.map((sup) => {
        const due = draft.supplierDues.find((d) => d.supplierId === sup.id)?.amount || 0;
        return {
          ...sup,
          dueBalance: Number((sup.dueBalance + due).toFixed(2)),
        };
      });

      const nextChemicals = prev.chemicals.map((ch) => {
        const entry = draft.chemicalStocks.find((s) => s.chemicalId === ch.id);
        return entry
          ? { ...ch, currentQty: entry.qty, purchaseCost: entry.unitCost }
          : ch;
      });

      const nextEmployees = prev.employees.map((e) => {
        const eb = draft.employeeBalances.find((x) => x.employeeId === e.id);
        return eb
          ? {
              ...e,
              salaryDue: Number((e.salaryDue + eb.salaryDue).toFixed(2)),
              advanceBalance: Number((e.advanceBalance + eb.advanceGiven).toFixed(2)),
            }
          : e;
      });

      // Optional pending retail orders tagged isOpening: true
      const openingOrders: Order[] = draft.pendingRetailOrders.map((po, idx) => {
        const cust = prev.customers.find((c) => c.id === po.customerId);
        return {
          id: po.id || `OPEN-ORD-${idx + 1}`,
          customerId: po.customerId,
          customerName: cust?.name || 'Retail Customer',
          createdAt: asOfIso,
          expectedDeliveryAt: asOfIso,
          deliveryOptionId: prev.deliveryOptions[0]?.id || 'del-reg',
          deliveryOptionName: prev.deliveryOptions[0]?.name || 'Regular',
          stage: po.stage,
          physicallyReceived: true,
          stageHistory: [
            { stage: po.stage, timestamp: asOfIso, user: activeUserName, note: 'Opening pending order' },
          ],
          lines: [
            {
              id: `open-ol-${idx}`,
              productId: prev.products[0]?.id || 'prod-shirt',
              productName: 'Opening Pending Items',
              serviceId: prev.services[0]?.id || 'srv-wash',
              serviceName: 'Laundry',
              quantityOrdered: po.pieceCount,
              quantityReceived: po.pieceCount,
              quantityDelivered: 0,
              quantityRewash: 0,
              unitPrice: po.pieceCount > 0 ? Number((po.estimatedValue / po.pieceCount).toFixed(2)) : 0,
              discount: 0,
            },
          ],
          exceptions: [],
          orderDiscount: 0,
          additionalCharge: 0,
          addAdditionalToOrder: false,
          totalAmount: po.estimatedValue,
          paidAmount: po.paidAmount,
          notes: 'Opening pending order (excluded from operational sales)',
          isOpening: true,
        };
      });

      // Sync ID continuation numbers into idFormats
      const baseFormats = prev.idFormats || DEFAULT_ID_FORMATS;
      const nextIdFormats = {
        ...baseFormats,
        customer: {
          ...baseFormats.customer,
          nextNumber: Math.max(baseFormats.customer.nextNumber, (draft.lastIds.customerLastNum || 0) + 1),
        },
        retailOrder: {
          ...baseFormats.retailOrder,
          nextNumber: Math.max(baseFormats.retailOrder.nextNumber, (draft.lastIds.retailOrderLastNum || 0) + 1),
        },
        corporateOrder: {
          ...baseFormats.corporateOrder,
          nextNumber: Math.max(baseFormats.corporateOrder.nextNumber, (draft.lastIds.corporateOrderLastNum || 0) + 1),
        },
        retailInvoice: {
          ...baseFormats.retailInvoice,
          nextNumber: Math.max(baseFormats.retailInvoice.nextNumber, (draft.lastIds.retailInvoiceLastNum || 0) + 1),
        },
        corporateInvoice: {
          ...baseFormats.corporateInvoice,
          nextNumber: Math.max(baseFormats.corporateInvoice.nextNumber, (draft.lastIds.corporateInvoiceLastNum || 0) + 1),
        },
      };

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'OPENING_BALANCE_FINALIZED',
        module: 'Opening Balance',
        recordId: journalId,
        summary: `Finalized & locked Opening Balance as of ${draft.asOfDate}`,
        afterValue: draft,
      });

      return {
        ...prev,
        idFormats: nextIdFormats,
        openingBalance: {
          ...draft,
          status: 'finalized',
          finalizedAt: new Date().toISOString(),
          finalizedJournalId: journalId,
        },
        accounts: updatedAccounts,
        journalEntries: nextJournals,
        customers: nextCustomers,
        corporateCustomers: nextCorps,
        corporateMovements: [...openingCorpMovements, ...prev.corporateMovements],
        suppliers: nextSuppliers,
        chemicals: nextChemicals,
        employees: nextEmployees,
        orders: [...openingOrders, ...prev.orders],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  const handlePostOpeningAdjustment = (params: {
    date: string;
    debitCode: string;
    creditCode: string;
    amount: number;
    reason: string;
  }) => {
    if (!requireAction(activePerms.actions.canPostAccounting, 'post opening adjustments')) return;
    commitState((prev) => {
      const dr = prev.accounts.find((a) => a.code === params.debitCode);
      const cr = prev.accounts.find((a) => a.code === params.creditCode);
      if (!dr || !cr || params.amount <= 0) return prev;

      const je: JournalEntry = {
        ...buildJournalEntry({
          id: `JE-ADJ-${1001 + prev.journalEntries.length}`,
          date: `${params.date}T12:00:00.000Z`,
          reference: 'OPEN-ADJ',
          description: `Opening Adjustment: ${params.reason}`,
          category: 'Opening Adjustment',
          createdBy: activeUserName,
          lines: [
            { accountCode: dr.code, accountName: dr.name, debit: params.amount, credit: 0 },
            { accountCode: cr.code, accountName: cr.name, debit: 0, credit: params.amount },
          ],
        }),
        isOpening: true,
      };

      const bb = createBlackBoxEvent(prev.blackBox, {
        user: activeUserName,
        role: currentUserRole,
        action: 'OPENING_ADJUSTMENT_POSTED',
        module: 'Opening Balance',
        recordId: je.id,
        summary: `Posted Opening Adjustment (${prev.settings.currencySymbol} ${params.amount}): ${params.reason}`,
        afterValue: je,
      });

      return {
        ...prev,
        accounts: applyJournalToAccounts(prev.accounts, je),
        journalEntries: [je, ...prev.journalEntries],
        blackBox: [bb, ...prev.blackBox],
      };
    });
  };

  // --- NAVIGATION & QUICK SEARCH ---

  const allNavItems: Array<{
    id: NavSection;
    label: string;
    icon: typeof LayoutDashboard;
    iconColor: string;
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, iconColor: 'text-sky-300' },
    { id: 'analytics', label: 'Analytics & Charts', icon: TrendingUp, iconColor: 'text-indigo-300' },
    { id: 'tasks', label: 'Tasks & Calendar', icon: CalendarClock, iconColor: 'text-amber-300' },
    { id: 'orders', label: 'Retail Orders', icon: Package, iconColor: 'text-cyan-300' },
    { id: 'customers', label: 'Customers', icon: Users, iconColor: 'text-emerald-300' },
    { id: 'corporate', label: 'Corporate Accounts', icon: Building2, iconColor: 'text-violet-300' },
    { id: 'catalogue', label: 'Products & Services', icon: Tag, iconColor: 'text-pink-300' },
    { id: 'inventory', label: 'Chemicals & Suppliers', icon: FlaskConical, iconColor: 'text-teal-300' },
    { id: 'accounting', label: 'Accounting', icon: BookOpen, iconColor: 'text-lime-300' },
    { id: 'opening-balance', label: 'Opening Balance', icon: Scale, iconColor: 'text-orange-300' },
    { id: 'employees', label: 'Staff & Expenses', icon: WalletCards, iconColor: 'text-rose-300' },
    { id: 'documents', label: 'Invoices & Tokens', icon: Printer, iconColor: 'text-blue-200' },
    { id: 'reports', label: 'Reports', icon: BarChart3, iconColor: 'text-purple-300' },
    { id: 'blackbox', label: 'Black Box', icon: ShieldCheck, iconColor: 'text-red-300' },
    { id: 'settings', label: 'Settings', icon: Settings, iconColor: 'text-slate-300' },
  ];

  // Strictly hide Black Box for ALL roles except Owner
  const navItems = allNavItems.filter(
    (item) =>
      allowedSections.includes(item.id) &&
      (item.id !== 'blackbox' || currentUser?.role === 'Owner')
  );

  const unreadNotifCount = state.notifications.filter((n) => !n.read).length;

  const searchResults = useMemo(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: Array<{ label: string; sub: string; section: NavSection }> = [];
    if (allowedSections.includes('orders')) {
      for (const o of state.orders) {
        if (o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q)) {
          results.push({ label: `${o.id} — ${o.customerName}`, sub: `Order · ${o.stage}`, section: 'orders' });
        }
      }
    }
    if (allowedSections.includes('customers')) {
      for (const c of state.customers) {
        if (c.name.toLowerCase().includes(q) || c.id.toLowerCase().includes(q) || c.phone.includes(q)) {
          results.push({ label: `${c.name} (${c.id})`, sub: `Customer · ${c.phone}`, section: 'customers' });
        }
      }
    }
    if (allowedSections.includes('corporate')) {
      for (const corp of state.corporateCustomers) {
        if (corp.name.toLowerCase().includes(q)) {
          results.push({
            label: `${corp.name}`,
            sub: `Corporate · ${corp.billingBasis}`,
            section: 'corporate',
          });
        }
      }
    }
    if (allowedSections.includes('tasks')) {
      for (const t of state.tasks) {
        if (t.title.toLowerCase().includes(q)) {
          results.push({ label: t.title, sub: `Task · ${t.status}`, section: 'tasks' });
        }
      }
    }
    return results.slice(0, 8);
  }, [
    quickSearchQuery,
    allowedSections,
    state.orders,
    state.customers,
    state.corporateCustomers,
    state.tasks,
  ]);

  const currentNavLabel = navItems.find((n) => n.id === activeSection)?.label || 'Dashboard';

  // Require login when no active user session exists
  if (!currentUser) {
    return (
      <LoginView
        companyName={state.settings.companyName}
        companyTagline={state.settings.companyTagline}
        users={state.users}
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  const canCreateOrders =
    allowedSections.includes('orders') &&
    (currentUser.role === 'Owner' || activePerms.actions.canCreateOrders);

  const activeTheme = state.settings.appearanceTheme || 'colorful';

  return (
    <div data-theme={activeTheme} className="min-h-screen flex flex-col lg:flex-row text-[#1D1D1F]">
      {/* Desktop Deep-Blue Gradient Sidebar */}
      <aside className="no-print hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 p-4 z-30">
        <div className="erp-sidebar rounded-3xl h-full flex flex-col overflow-hidden text-white">
          <div className="px-5 pt-6 pb-4 border-b border-white/15 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white p-1 shrink-0 overflow-hidden shadow-xs">
                <img
                  src={rinseLogo}
                  alt="Rinse logo"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold tracking-tight text-white whitespace-nowrap truncate">
                  Rinse
                </p>
                <p className="text-[11px] text-blue-200/80 mt-0.5 truncate">
                  {state.settings.companyName && state.settings.companyName !== 'Rinse'
                    ? `${state.settings.companyName} · ${state.settings.currencyCode}`
                    : `${state.settings.currencyCode} · Laundry ERP`}
                </p>
              </div>
            </div>
            <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white truncate">
                  {currentUser.displayName}
                </p>
                <p className="text-[11px] text-sky-300 font-medium truncate">
                  {currentUser.role} · <span className="font-mono text-blue-200/80">{currentUser.id}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={handleLogout}
                title="Sign out"
                aria-label="Sign out"
                className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-red-500/30 transition-colors shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5" aria-label="Primary Navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium transition-all whitespace-nowrap ${
                    isActive
                      ? 'bg-[#0071E3] text-white shadow-md shadow-blue-950/30 ring-1 ring-white/25'
                      : 'text-slate-100/85 hover:bg-white/12 hover:text-white'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-white' : item.iconColor
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>

          {canCreateOrders && (
            <div className="p-3 border-t border-white/15">
              <button
                onClick={() => {
                  setOpenOrderIntakeFlag(true);
                  setActiveSection('orders');
                }}
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-xs font-semibold rounded-xl bg-white text-[#0f2947] hover:bg-blue-50 transition-colors shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                New Retail Order
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden flex bg-slate-900/35 backdrop-blur-xs">
          <div className="w-72 h-full erp-sidebar p-4 flex flex-col text-white">
            <div className="pb-4 border-b border-white/15 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white p-0.5 shrink-0 overflow-hidden">
                    <img
                      src={rinseLogo}
                      alt="Rinse logo"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <span className="text-base font-bold text-white truncate">Rinse</span>
                </div>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-2 rounded-xl text-blue-200 hover:text-white"
                  aria-label="Close navigation"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-2.5 rounded-xl bg-white/10 border border-white/15 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-white truncate">
                    {currentUser.displayName}
                  </p>
                  <p className="text-[11px] text-sky-300 font-medium truncate">
                    {currentUser.role} · <span className="font-mono text-blue-200/80">{currentUser.id}</span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium text-white bg-red-500/80 hover:bg-red-600 shrink-0"
                >
                  <LogOut className="w-3 h-3" />
                  Sign out
                </button>
              </div>
            </div>
            <nav className="flex-1 overflow-y-auto py-3 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveSection(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-medium ${
                      isActive
                        ? 'bg-[#0071E3] text-white ring-1 ring-white/25'
                        : 'text-slate-100/85 hover:bg-white/12 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : item.iconColor}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0">
        {/* Top Bar (3-zone contract: Breadcrumb — Quick Search — Actions) */}
        <header className="no-print sticky top-0 z-20 px-4 sm:px-8 pt-4">
          <div className="liquid-glass rounded-2xl px-4 sm:px-5 h-14 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <button
                onClick={() => setMobileMenuOpen(true)}
                className="lg:hidden p-2 -ml-1 rounded-xl text-slate-600 hover:bg-white/80"
                aria-label="Open menu"
              >
                <Menu className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 text-xs truncate">
                <span className="text-slate-400 hidden sm:inline">Workspace</span>
                <span className="text-slate-300 hidden sm:inline">/</span>
                <span className="font-semibold text-slate-900 truncate">{currentNavLabel}</span>
              </div>
            </div>

            <button
              onClick={() => setQuickSearchOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white/70 border border-slate-200/80 text-xs text-slate-500 hover:bg-white transition-colors w-64 justify-between"
            >
              <span className="inline-flex items-center gap-2">
                <Search className="w-3.5 h-3.5 text-slate-400" />
                Search orders, clients, tasks...
              </span>
              <kbd className="font-mono text-[10px] text-slate-400">Ctrl K</kbd>
            </button>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setNotificationsOpen(true)}
                className="relative inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-xs font-medium text-slate-700 hover:bg-white transition-colors whitespace-nowrap"
              >
                <Bell className="w-3.5 h-3.5 text-[#0071E3]" />
                <span className="hidden sm:inline">Alerts</span>
                {unreadNotifCount > 0 && (
                  <span className="font-mono font-semibold text-[#0071E3] tabular-nums">
                    {unreadNotifCount}
                  </span>
                )}
              </button>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/80 border border-slate-200/80 text-xs font-medium text-slate-700 hover:text-red-600 hover:border-red-200 transition-colors whitespace-nowrap"
                title="Switch Account / Sign Out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Switch Account</span>
              </button>
            </div>
          </div>
        </header>

        {/* Permission Restriction Banner */}
        {permissionError && (
          <div className="no-print px-4 sm:px-8 pt-3 max-w-[1440px] w-full mx-auto">
            <div
              role="alert"
              className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs font-medium text-amber-800 flex items-center justify-between gap-3"
            >
              <span className="inline-flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                {permissionError}
              </span>
              <button
                onClick={() => setPermissionError('')}
                className="text-amber-700 hover:text-amber-900"
                aria-label="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Main Viewport */}
        <main className="flex-1 px-4 sm:px-8 py-6 max-w-[1440px] w-full mx-auto">
          {activeSection === 'dashboard' && allowedSections.includes('dashboard') && (
            <DashboardView
              state={state}
              onNavigate={(sec) => {
                if (allowedSections.includes(sec as NavSection)) {
                  setActiveSection(sec as NavSection);
                } else {
                  requireAction(false, `view ${sec}`);
                }
              }}
              onNewOrder={() => {
                if (!requireAction(canCreateOrders, 'create retail orders')) return;
                setOpenOrderIntakeFlag(true);
                setActiveSection('orders');
              }}
              onCompleteTask={handleToggleTaskStatus}
            />
          )}

          {activeSection === 'analytics' && allowedSections.includes('analytics') && (
            <AnalyticsView
              state={state}
              canExportReports={
                currentUser.role === 'Owner' || activePerms.actions.canExportReports
              }
              onNavigate={(sec, opts) => {
                if (!allowedSections.includes(sec)) {
                  requireAction(false, `open ${sec}`);
                  return;
                }
                if (sec === 'accounting' && opts?.accountingTab) {
                  setAccountingInitialTab(opts.accountingTab);
                }
                setActiveSection(sec);
              }}
            />
          )}

          {activeSection === 'tasks' && allowedSections.includes('tasks') && (
            <TasksCalendarView
              state={state}
              onAddTask={handleAddTask}
              onToggleTaskStatus={handleToggleTaskStatus}
              onDeleteTask={handleDeleteTask}
              onBulkDeleteTasks={handleBulkDeleteTasks}
              onRequestDelete={setDeleteRequest}
              onToggleRule={(ruleId) => {
                if (!requireAction(activePerms.actions.canManageTasks, 'change notification rules')) {
                  return;
                }
                commitState((prev) => ({
                  ...prev,
                  notificationRules: prev.notificationRules.map((r) =>
                    r.id === ruleId ? { ...r, enabled: !r.enabled } : r
                  ),
                }));
              }}
              onRunAutomatedScan={runAutomatedRuleScan}
              browserPermission={browserPermission}
              onRequestBrowserPermission={requestBrowserPermission}
            />
          )}

          {activeSection === 'orders' && allowedSections.includes('orders') && (
            <OrdersView
              state={state}
              initialOpenCreate={openOrderIntakeFlag && canCreateOrders}
              canEditIssuedIds={
                currentUser.role === 'Owner' || activePerms.actions.canPostAccounting
              }
              onCreateOrder={(params) => {
                setOpenOrderIntakeFlag(false);
                handleCreateOrder(params);
              }}
              onRenameOrderId={(oldId, newId) => handleRenameIssuedId('order', oldId, newId)}
              onDeleteOrder={handleDeleteOrder}
              onGoToAccounting={() => setActiveSection('accounting')}
              onRequestDelete={setDeleteRequest}
              onAdvanceStage={handleAdvanceOrderStage}
              onPartialDeliver={handlePartialDeliver}
              onAddException={handleAddOrderException}
              onResolveException={handleResolveOrderException}
              onCollectOrderPayment={handleCollectOrderPayment}
              onAddMoneyAccount={handleQuickAddMoneyAccount}
              onOpenDocument={(mode, id) => {
                if (!allowedSections.includes('documents')) {
                  requireAction(false, 'view documents');
                  return;
                }
                setDocViewTarget({ mode, id });
                setActiveSection('documents');
              }}
            />
          )}

          {activeSection === 'customers' && allowedSections.includes('customers') && (
            <CustomersView
              state={state}
              canEditIssuedIds={
                currentUser.role === 'Owner' || activePerms.actions.canPostAccounting
              }
              onAddCustomer={handleAddCustomer}
              onRenameCustomerId={(oldId, newId) => handleRenameIssuedId('customer', oldId, newId)}
              onDeleteCustomer={handleDeleteCustomer}
              onDeactivateCustomer={handleDeactivateCustomer}
              onAddCategory={handleAddCategory}
              onDeleteCategory={handleDeleteCategory}
              onUpsertCustomPrice={handleUpsertCustomerCustomPrice}
              onDeleteCustomerCustomPrice={handleDeleteCustomerCustomPrice}
              onCollectDueOrAdvance={handleCollectDueOrAdvance}
              onAddMoneyAccount={handleQuickAddMoneyAccount}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'corporate' && allowedSections.includes('corporate') && (
            <CorporateView
              state={state}
              onCreateCorporate={handleCreateCorporate}
              onUpdateCorporateBillingBasis={handleUpdateCorporateBillingBasis}
              onAddCorporateProduct={handleAddCorporateProduct}
              onAddCorporateService={handleAddCorporateService}
              onUpsertCorporatePrice={handleUpsertCorporatePrice}
              onLogCorporateMovement={handleLogCorporateMovement}
              onGenerateCorporateInvoice={handleGenerateCorporateInvoice}
              onCollectCorporatePayment={handleCollectCorporatePayment}
              onOpenInvoice={(invId) => {
                if (!allowedSections.includes('documents')) {
                  requireAction(false, 'view documents');
                  return;
                }
                setDocViewTarget({ mode: 'invoice', id: invId });
                setActiveSection('documents');
              }}
              onDeleteCorporate={handleDeleteCorporate}
              onDeactivateCorporate={handleDeactivateCorporate}
              onDeleteCorporateProduct={handleDeleteCorporateProduct}
              onDeleteCorporateService={handleDeleteCorporateService}
              onDeleteCorporatePrice={handleDeleteCorporatePrice}
              onGoToAccounting={() => setActiveSection('accounting')}
              onAddMoneyAccount={handleQuickAddMoneyAccount}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'catalogue' && allowedSections.includes('catalogue') && (
            <CatalogueView
              state={state}
              onAddProduct={handleAddProduct}
              onUpdateProduct={handleUpdateProduct}
              onDeleteProduct={handleDeleteProduct}
              onAddService={handleAddService}
              onUpdateService={handleUpdateService}
              onDeleteService={handleDeleteService}
              onUpsertPrice={handleUpsertPrice}
              onDeletePrice={handleDeletePrice}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'inventory' && allowedSections.includes('inventory') && (
            <InventoryView
              state={state}
              onAddChemical={handleAddChemical}
              onDeleteChemical={handleDeleteChemical}
              onDeactivateChemical={handleDeactivateChemical}
              onRecordStockMovement={handleRecordStockMovement}
              onAddSupplier={handleAddSupplier}
              onDeleteSupplier={handleDeleteSupplier}
              onDeactivateSupplier={handleDeactivateSupplier}
              onPaySupplier={handlePaySupplier}
              onGoToAccounting={() => setActiveSection('accounting')}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'accounting' && allowedSections.includes('accounting') && (
            <AccountingView
              state={state}
              initialSubTab={accountingInitialTab}
              onPostOwnerDraw={handlePostOwnerDraw}
              onPostCashIn={handlePostCashIn}
              onPostTransfer={handlePostTransfer}
              onPostManualJournal={handlePostManualJournal}
              onPostSuddenAdjustment={handlePostSuddenMoneyAdjustment}
              onReverseJournal={handleReverseJournal}
              onAddAccount={handleAddAccount}
              onDeleteAccount={handleDeleteAccount}
              onDeactivateAccount={handleDeactivateAccount}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'opening-balance' && allowedSections.includes('opening-balance') && (
            <OpeningBalanceView
              state={state}
              canPostAccounting={
                currentUser.role === 'Owner' || activePerms.actions.canPostAccounting
              }
              onSaveDraft={handleSaveOpeningDraft}
              onFinalize={handleFinalizeOpeningBalance}
              onPostAdjustment={handlePostOpeningAdjustment}
              onInlineAddCustomer={(data) => {
                const next = generateNextSmartId(state, 'customer');
                handleAddCustomer(
                  {
                    name: data.name,
                    phone: data.phone,
                    address: '',
                    categoryId: data.categoryId,
                    notes: 'Added via Opening Balance',
                  },
                  { customId: next.id }
                );
                return {
                  id: next.id,
                  name: data.name,
                  phone: data.phone,
                  address: '',
                  categoryId: data.categoryId,
                  registeredAt: new Date().toISOString(),
                  notes: '',
                  outstandingBalance: 0,
                  advanceBalance: 0,
                };
              }}
              onInlineAddCorporate={(data) => {
                handleCreateCorporate({
                  name: data.name,
                  contactPerson: data.contactPerson,
                  phone: data.phone,
                  address: '',
                  billingBasis: data.billingBasis,
                  billingCycle: data.billingCycle,
                  cutoffDayOrTime: 'Sunday 18:00',
                  copyRetailCatalogueOnce: true,
                });
              }}
              onInlineAddSupplier={(data) => {
                handleAddSupplier({
                  name: data.name,
                  phone: data.phone,
                  address: '',
                  suppliedProducts: data.suppliedProducts,
                });
              }}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'employees' && allowedSections.includes('employees') && (
            <EmployeesExpensesView
              state={state}
              onAddEmployee={handleAddEmployee}
              onDeleteEmployee={handleDeleteEmployee}
              onDeactivateEmployee={handleDeactivateEmployee}
              onPostPayroll={handlePostPayroll}
              onPostExpense={handlePostExpense}
              onAddExpenseCategory={(cat) => {
                if (
                  !requireAction(
                    activePerms.actions.canManagePayrollExpenses,
                    'add expense categories'
                  )
                ) {
                  return;
                }
                commitState((prev) => ({
                  ...prev,
                  settings: {
                    ...prev.settings,
                    expenseCategories: Array.from(new Set([...prev.settings.expenseCategories, cat])),
                  },
                }));
              }}
              onDeleteExpenseCategory={handleDeleteExpenseCategory}
              onGoToAccounting={() => setActiveSection('accounting')}
              onRequestDelete={setDeleteRequest}
            />
          )}

          {activeSection === 'documents' && allowedSections.includes('documents') && (
            <DocumentsPrintView
              state={state}
              initialMode={docViewTarget.mode}
              initialId={docViewTarget.id}
              canEditIssuedIds={
                currentUser.role === 'Owner' || activePerms.actions.canPostAccounting
              }
              onRecordPrint={handleRecordPrint}
              onRenameInvoiceId={(oldId, newId) => handleRenameIssuedId('invoice', oldId, newId)}
              onRequestDelete={setDeleteRequest}
              onGoToAccounting={() => setActiveSection('accounting')}
            />
          )}

          {activeSection === 'reports' && allowedSections.includes('reports') && (
            <ReportsView
              state={state}
              canAccessBlackBox={currentUser.role === 'Owner'}
              canExportReports={
                currentUser.role === 'Owner' || activePerms.actions.canExportReports
              }
              onNavigate={(sec, opts) => {
                if (!allowedSections.includes(sec)) {
                  requireAction(false, `open ${sec}`);
                  return;
                }
                if (sec === 'accounting' && opts?.accountingTab) {
                  setAccountingInitialTab(opts.accountingTab);
                }
                setActiveSection(sec);
              }}
            />
          )}

          {/* Strictly Owner-Only Black Box Render Enforcement */}
          {activeSection === 'blackbox' && currentUser.role === 'Owner' && (
            <BlackBoxView state={state} />
          )}

          {activeSection === 'settings' && allowedSections.includes('settings') && (
            <SettingsView
              state={state}
              currentUserRole={currentUserRole}
              onUpdateSettings={(patch: Partial<AppSettings>) =>
                commitState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
              }
              onRemoveLogo={handleRemoveCompanyLogo}
              onUpdateIdFormat={handleUpdateIdFormat}
              onUpdateDeliveryOption={(id: string, patch: Partial<DeliveryOption>) =>
                commitState((prev) => ({
                  ...prev,
                  deliveryOptions: prev.deliveryOptions.map((d) =>
                    d.id === id ? { ...d, ...patch } : d
                  ),
                }))
              }
              onTriggerBackup={async () => {
                if (!requireAction(activePerms.actions.canManageBackups, 'trigger system backups')) {
                  return;
                }
                const res = await fetch('/api/backup', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(state),
                });
                if (res.ok) {
                  const data = await res.json();
                  commitState((prev) => ({
                    ...prev,
                    settings: { ...prev.settings, lastBackupAt: data.lastBackupAt },
                  }));
                }
              }}
              onRestoreState={async (restored: ErpState) => {
                if (!requireAction(activePerms.actions.canManageBackups, 'restore system backups')) {
                  return;
                }
                const migrated = migrateErpState(restored);
                await fetch('/api/restore', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ state: migrated }),
                });
                setState(migrated);
              }}
              onCreateUser={handleCreateUser}
              onUpdateUser={handleUpdateUser}
              onToggleRoleSection={handleToggleRoleSection}
              onToggleRoleAction={handleToggleRoleAction}
              onRequestDelete={setDeleteRequest}
              onlineUsers={onlineUsers}
              githubStatus={githubStatus}
              onRefreshGitHubStatus={refreshGitHubStatus}
              onApplyPulledState={(pulledState) => {
                const migrated = migrateErpState(pulledState);
                isRemoteUpdateRef.current = true;
                if (typeof migrated.syncRevision === 'number') {
                  syncedRevisionRef.current = migrated.syncRevision;
                }
                setState(migrated);
              }}
            />
          )}
        </main>
      </div>

      {/* Notification Center Slide-Over */}
      <NotificationCenter
        open={notificationsOpen}
        onClose={() => setNotificationsOpen(false)}
        notifications={state.notifications}
        rules={state.notificationRules}
        onMarkRead={(id) =>
          commitState((prev) => ({
            ...prev,
            notifications: prev.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          }))
        }
        onMarkAllRead={() =>
          commitState((prev) => ({
            ...prev,
            notifications: prev.notifications.map((n) => ({ ...n, read: true })),
          }))
        }
        onNavigate={(sec) => {
          if (allowedSections.includes(sec as NavSection)) {
            setActiveSection(sec as NavSection);
          }
        }}
        onToggleRule={(ruleId) => {
          if (!requireAction(activePerms.actions.canManageTasks, 'toggle notification rules')) {
            return;
          }
          commitState((prev) => ({
            ...prev,
            notificationRules: prev.notificationRules.map((r) =>
              r.id === ruleId ? { ...r, enabled: !r.enabled } : r
            ),
          }));
        }}
        onRunScan={runAutomatedRuleScan}
        browserPermission={browserPermission}
        onRequestBrowserPermission={requestBrowserPermission}
      />

      {/* Quick Global Search Modal (Ctrl+K) */}
      {quickSearchOpen && (
        <div
          className="no-print fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/20 backdrop-blur-xs"
          onClick={() => setQuickSearchOpen(false)}
        >
          <div
            className="w-full max-w-lg liquid-glass rounded-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200/70">
              <Search className="w-4 h-4 text-slate-400" />
              <input
                autoFocus
                value={quickSearchQuery}
                onChange={(e) => setQuickSearchQuery(e.target.value)}
                placeholder="Jump to order ID, customer, corporate client, or task..."
                className="flex-1 text-sm bg-transparent focus:outline-none"
              />
              <button
                onClick={() => setQuickSearchOpen(false)}
                className="text-xs text-slate-400 hover:text-slate-700"
              >
                Esc
              </button>
            </div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-200/60">
              {searchResults.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {quickSearchQuery
                    ? 'No matching records found.'
                    : `Type to search across accessible orders, customers, and tasks.`}
                </div>
              ) : (
                searchResults.map((res, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveSection(res.section);
                      setQuickSearchOpen(false);
                      setQuickSearchQuery('');
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-white/70 flex items-center justify-between text-xs"
                  >
                    <span className="font-medium text-slate-900">{res.label}</span>
                    <span className="text-slate-500">{res.sub}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* First-Launch Opening Balance Prompt (when DB has empty balances) */}
      {loadedFromServer &&
        allowedSections.includes('opening-balance') &&
        state.openingBalance?.status === 'not_started' &&
        !state.openingBalancePromptDismissed &&
        state.orders.length === 0 &&
        state.journalEntries.length === 0 &&
        activeSection !== 'opening-balance' && (
          <div className="no-print fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/30 backdrop-blur-xs">
            <div className="w-full max-w-md liquid-glass rounded-2xl p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <Scale className="w-5 h-5 text-[#0071E3]" />
                <h3 className="text-base font-semibold text-slate-900">
                  Start With Opening Balances?
                </h3>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                If your laundry business is already running, enter your existing cash, bank, customer dues, corporate pending linen, and capital in the Opening Balance wizard.
              </p>
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() =>
                    commitState((prev) => ({ ...prev, openingBalancePromptDismissed: true }))
                  }
                  className="px-3.5 py-2 text-xs font-medium rounded-xl bg-white border border-slate-200 text-slate-700"
                >
                  Skip for now
                </button>
                <button
                  type="button"
                  onClick={() => {
                    commitState((prev) => ({ ...prev, openingBalancePromptDismissed: true }));
                    setActiveSection('opening-balance');
                  }}
                  className="px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
                >
                  Open Opening Balance
                </button>
              </div>
            </div>
          </div>
        )}
      {/* Centralized Delete Confirmation Popup */}
      <ConfirmDeleteModal
        request={deleteRequest}
        onCancel={() => setDeleteRequest(null)}
      />

      {/* Toast Feedback Banner */}
      {toastMsg && (
        <div
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-medium shadow-xl flex items-center gap-2 border border-slate-700"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMsg}</span>
        </div>
      )}
    </div>
  );
}

import type { ErpState } from '../types/erp';
import { recalculateAccountBalancesFromJournals } from '../utils/accounting';
import { migrateErpState } from '../utils/migration';
import {
  computeBusinessStateHash,
  computeSectionHashes,
  STATIC_STATE_KEY,
} from './firestoreSync';

export const OFFLINE_WORKING_STATE_KEY = 'rinse_offline_working_state_v1';
export const PENDING_SYNC_QUEUE_KEY = 'rinse_pending_sync_queue_v1';
const MAX_QUEUE_LENGTH = 120;

export type CloudSyncUiState =
  | 'synced'
  | 'pending'
  | 'paused'
  | 'unauthorized'
  | 'offline_local';

export interface PendingSyncOperation {
  id: string;
  actionLabel: string;
  targetCollection: 'rinse_state';
  targetDocIds: string[];
  payloadHash: string;
  sectionHashes: Record<string, string>;
  timestamp: string;
  retryCount: number;
  status: 'pending' | 'syncing' | 'paused';
  lastError?: string;
}

export interface OfflineWorkingSnapshot {
  state: ErpState;
  savedAt: string;
  baselineRevision: number;
  baselineBusinessJson: string;
  baselineSectionHashes: Record<string, string>;
}

function safeLocalGet(key: string): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  } catch {
    // ignore storage quota or blocked storage
  }
}

function safeLocalRemove(key: string): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

export function loadPendingQueue(): PendingSyncOperation[] {
  const raw = safeLocalGet(PENDING_SYNC_QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingSyncOperation =>
        Boolean(item && typeof item === 'object' && typeof item.id === 'string')
    );
  } catch {
    return [];
  }
}

export function savePendingQueue(queue: PendingSyncOperation[]): void {
  if (queue.length === 0) {
    safeLocalRemove(PENDING_SYNC_QUEUE_KEY);
    return;
  }
  const trimmed =
    queue.length > MAX_QUEUE_LENGTH ? queue.slice(queue.length - MAX_QUEUE_LENGTH) : queue;
  safeLocalSet(PENDING_SYNC_QUEUE_KEY, JSON.stringify(trimmed));
}

export function loadOfflineSnapshot(): OfflineWorkingSnapshot | null {
  const raw = safeLocalGet(OFFLINE_WORKING_STATE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<OfflineWorkingSnapshot>;
      if (parsed && parsed.state && parsed.state.settings && Array.isArray(parsed.state.accounts)) {
        const migrated = migrateErpState(parsed.state);
        return {
          state: migrated,
          savedAt: typeof parsed.savedAt === 'string' ? parsed.savedAt : new Date().toISOString(),
          baselineRevision:
            typeof parsed.baselineRevision === 'number'
              ? parsed.baselineRevision
              : migrated.syncRevision ?? 1,
          baselineBusinessJson:
            typeof parsed.baselineBusinessJson === 'string'
              ? parsed.baselineBusinessJson
              : computeBusinessStateHash(migrated),
          baselineSectionHashes:
            parsed.baselineSectionHashes && typeof parsed.baselineSectionHashes === 'object'
              ? parsed.baselineSectionHashes
              : computeSectionHashes(migrated),
        };
      }
    } catch {
      // fall through to legacy static state key
    }
  }

  const legacyRaw = safeLocalGet(STATIC_STATE_KEY);
  if (!legacyRaw) return null;
  try {
    const parsedState = JSON.parse(legacyRaw) as Partial<ErpState>;
    if (parsedState && parsedState.settings && Array.isArray(parsedState.accounts)) {
      const migrated = migrateErpState(parsedState);
      return {
        state: migrated,
        savedAt: migrated.lastUpdatedAt || new Date().toISOString(),
        baselineRevision: migrated.syncRevision ?? 1,
        baselineBusinessJson: '',
        baselineSectionHashes: {},
      };
    }
  } catch {
    // ignore malformed storage
  }
  return null;
}

export function saveOfflineSnapshot(snapshot: OfflineWorkingSnapshot): void {
  safeLocalSet(OFFLINE_WORKING_STATE_KEY, JSON.stringify(snapshot));
  // Keep legacy backup mirror synchronized so offline browser reloads never lose edits
  safeLocalSet(STATIC_STATE_KEY, JSON.stringify(snapshot.state));
}

function docIdsToActionLabel(docIds: string[]): string {
  const sections = new Set(docIds.map((id) => id.split('__')[0]));
  const labels: string[] = [];
  if (sections.has('orders')) labels.push('Orders');
  if (sections.has('invoices')) labels.push('Invoices');
  if (sections.has('corporate')) labels.push('Corporate & Rewash');
  if (sections.has('customers')) labels.push('Customers');
  if (sections.has('employees')) labels.push('Staff, Fines & Expenses');
  if (sections.has('accounting')) labels.push('Accounting');
  if (sections.has('inventory')) labels.push('Inventory');
  if (sections.has('catalogue')) labels.push('Catalogue');
  if (sections.has('tasks')) labels.push('Tasks');
  if (sections.has('settings')) labels.push('Settings');
  if (sections.has('security')) labels.push('Team & Permissions');
  if (labels.length === 0) return 'Workspace Update';
  if (labels.length <= 2) return labels.join(' & ');
  return `${labels[0]}, ${labels[1]} +${labels.length - 2}`;
}

export function findChangedDocIds(
  prevHashes: Record<string, string>,
  nextHashes: Record<string, string>
): string[] {
  const keys = Array.from(new Set([...Object.keys(prevHashes), ...Object.keys(nextHashes)]));
  return keys.filter((docId) => {
    if (docId.startsWith('blackbox')) return false;
    return prevHashes[docId] !== nextHashes[docId];
  });
}

/**
 * Immediately saves the latest working state to local browser storage and records
 * a pending outbox operation whenever business state changed.
 */
export function saveLocalAndQueueSync(params: {
  prevState: ErpState;
  nextState: ErpState;
  baselineRevision: number;
  baselineBusinessJson: string;
  baselineSectionHashes: Record<string, string>;
}): {
  queued: boolean;
  queue: PendingSyncOperation[];
  nextHash: string;
} {
  const { prevState, nextState, baselineRevision, baselineBusinessJson, baselineSectionHashes } =
    params;

  const prevHashes = computeSectionHashes(prevState);
  const nextHashes = computeSectionHashes(nextState);
  const nextHash = computeBusinessStateHash(nextState);
  const changedDocIds = findChangedDocIds(prevHashes, nextHashes);
  const nowIso = new Date().toISOString();

  saveOfflineSnapshot({
    state: nextState,
    savedAt: nowIso,
    baselineRevision,
    baselineBusinessJson,
    baselineSectionHashes,
  });

  const existingQueue = loadPendingQueue();
  if (changedDocIds.length === 0 && computeBusinessStateHash(prevState) === nextHash) {
    return { queued: false, queue: existingQueue, nextHash };
  }

  const targetDocs = changedDocIds.length > 0 ? changedDocIds : ['meta'];
  const changedSectionHashes: Record<string, string> = {};
  for (const docId of targetDocs) {
    if (nextHashes[docId]) {
      changedSectionHashes[docId] = nextHashes[docId];
    }
  }

  const op: PendingSyncOperation = {
    id: `op-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    actionLabel: docIdsToActionLabel(targetDocs),
    targetCollection: 'rinse_state',
    targetDocIds: targetDocs,
    payloadHash: nextHash,
    sectionHashes: changedSectionHashes,
    timestamp: nowIso,
    retryCount: 0,
    status: 'pending',
  };

  const nextQueue = [...existingQueue, op];
  savePendingQueue(nextQueue);
  return { queued: true, queue: nextQueue, nextHash };
}

export function markQueueStatus(
  status: 'pending' | 'syncing' | 'paused',
  opts?: { incrementRetry?: boolean; errorMessage?: string }
): PendingSyncOperation[] {
  const current = loadPendingQueue();
  if (current.length === 0) return [];
  const next = current.map((op) => ({
    ...op,
    status,
    retryCount: opts?.incrementRetry ? op.retryCount + 1 : op.retryCount,
    lastError: opts?.errorMessage !== undefined ? opts.errorMessage : op.lastError,
  }));
  savePendingQueue(next);
  return next;
}

export function clearConfirmedQueue(params: {
  confirmedState: ErpState;
  confirmedRevision: number;
  confirmedBusinessJson: string;
  confirmedSectionHashes: Record<string, string>;
}): PendingSyncOperation[] {
  savePendingQueue([]);
  saveOfflineSnapshot({
    state: params.confirmedState,
    savedAt: new Date().toISOString(),
    baselineRevision: params.confirmedRevision,
    baselineBusinessJson: params.confirmedBusinessJson,
    baselineSectionHashes: params.confirmedSectionHashes,
  });
  return [];
}

/**
 * Exponential backoff with deterministic bounded jitter to prevent tight-loop retries.
 */
export function computeNextRetryDelayMs(retryCount: number, isQuotaError: boolean): number {
  const attempt = Math.max(0, Math.min(retryCount, 6));
  const jitter = Math.floor(Math.random() * 1500);
  if (isQuotaError) {
    return Math.min(900_000, 60_000 * Math.pow(2, Math.min(attempt, 4))) + jitter;
  }
  return Math.min(300_000, 5_000 * Math.pow(2, attempt)) + jitter;
}

export async function withWriteTimeout<T>(promise: Promise<T>, timeoutMs = 12_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error('Firestore write timeout — backend did not respond in time.'));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function getRecordTimestampMs(item: unknown): number {
  if (!item || typeof item !== 'object') return 0;
  const rec = item as Record<string, unknown>;
  const raw =
    (typeof rec.updatedAt === 'string' && rec.updatedAt) ||
    (typeof rec.waivedAt === 'string' && rec.waivedAt) ||
    (typeof rec.loggedDate === 'string' && rec.loggedDate) ||
    (typeof rec.createdAt === 'string' && rec.createdAt) ||
    (typeof rec.date === 'string' && rec.date) ||
    '';
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

/**
 * Record-level timestamp-aware merge for arrays of keyed records (`id` or `code`).
 */
function mergeKeyedArrays<T>(
  remoteArr: T[],
  localArr: T[],
  getKey: (item: T) => string
): T[] {
  const byKey = new Map<string, { item: T; source: 'remote' | 'local'; ts: number }>();

  for (const r of remoteArr) {
    const k = getKey(r);
    if (!k) continue;
    byKey.set(k, { item: r, source: 'remote', ts: getRecordTimestampMs(r) });
  }

  for (const l of localArr) {
    const k = getKey(l);
    if (!k) continue;
    const existing = byKey.get(k);
    if (!existing) {
      byKey.set(k, { item: l, source: 'local', ts: getRecordTimestampMs(l) });
    } else {
      const localTs = getRecordTimestampMs(l);
      // Prefer whichever record has a strictly newer timestamp; if equal/missing timestamps, prefer local pending change
      if (localTs >= existing.ts) {
        byKey.set(k, { item: l, source: 'local', ts: localTs });
      }
    }
  }

  return Array.from(byKey.values()).map((entry) => entry.item);
}

/**
 * Safe 3-way merge when reconnecting with pending local browser edits.
 * Ensures remote updates made by another device in untouched sections are preserved,
 * and concurrent edits within the same section merge cleanly by record ID & timestamp.
 */
export function mergeRemoteWithOfflineLocal(params: {
  remoteState: ErpState;
  remoteSectionHashes: Record<string, string>;
  localState: ErpState;
  baselineSectionHashes: Record<string, string>;
  pendingOps: PendingSyncOperation[];
}): {
  mergedState: ErpState;
  hadRemoteChanges: boolean;
  conflictedSections: string[];
} {
  const { remoteState, remoteSectionHashes, localState, baselineSectionHashes, pendingOps } = params;
  if (pendingOps.length === 0) {
    return { mergedState: remoteState, hadRemoteChanges: true, conflictedSections: [] };
  }

  const localHashes = computeSectionHashes(localState);
  const localDirtySections = new Set<string>();

  for (const op of pendingOps) {
    for (const docId of op.targetDocIds) {
      localDirtySections.add(docId.split('__')[0]);
    }
  }

  const hasBaseline = Object.keys(baselineSectionHashes).length > 0;
  if (hasBaseline) {
    for (const [docId, hash] of Object.entries(localHashes)) {
      if (docId.startsWith('blackbox')) continue;
      if (baselineSectionHashes[docId] !== hash) {
        localDirtySections.add(docId.split('__')[0]);
      }
    }
  }

  const remoteChangedSections = new Set<string>();
  for (const [docId, hash] of Object.entries(remoteSectionHashes)) {
    if (docId.startsWith('blackbox')) continue;
    if (!hasBaseline || baselineSectionHashes[docId] !== hash) {
      remoteChangedSections.add(docId.split('__')[0]);
    }
  }

  const conflictedSections: string[] = [];
  const merged: ErpState = { ...remoteState };

  const resolveSection = (sec: string): 'remote' | 'local' | 'both' => {
    const localChanged = localDirtySections.has(sec);
    const remoteChanged = remoteChangedSections.has(sec);
    if (localChanged && remoteChanged && hasBaseline) {
      conflictedSections.push(sec);
      return 'both';
    }
    if (localChanged) return 'local';
    return 'remote';
  };

  // settings
  const settingsMode = resolveSection('settings');
  if (settingsMode === 'local') {
    merged.settings = localState.settings;
    merged.idFormats = localState.idFormats;
    merged.openingBalance = localState.openingBalance;
  } else if (settingsMode === 'both') {
    merged.settings = {
      ...remoteState.settings,
      ...localState.settings,
      expenseCategories: Array.from(
        new Set([...remoteState.settings.expenseCategories, ...localState.settings.expenseCategories])
      ),
      staffRoles: Array.from(
        new Set([...(remoteState.settings.staffRoles || []), ...(localState.settings.staffRoles || [])])
      ),
      quantityDiscountRules: mergeKeyedArrays(
        remoteState.settings.quantityDiscountRules || [],
        localState.settings.quantityDiscountRules || [],
        (r) => r.id
      ),
    };
  }

  // security
  if (resolveSection('security') === 'local') {
    merged.users = localState.users;
    merged.rolePermissions = localState.rolePermissions;
  } else if (conflictedSections.includes('security')) {
    merged.users = mergeKeyedArrays(remoteState.users, localState.users, (u) => u.id);
    merged.rolePermissions = localState.rolePermissions;
  }

  // catalogue
  const catMode = resolveSection('catalogue');
  if (catMode === 'local') {
    merged.categories = localState.categories;
    merged.products = localState.products;
    merged.services = localState.services;
    merged.prices = localState.prices;
    merged.customerCustomPrices = localState.customerCustomPrices;
    merged.deliveryOptions = localState.deliveryOptions;
  } else if (catMode === 'both') {
    merged.categories = mergeKeyedArrays(remoteState.categories, localState.categories, (c) => c.id);
    merged.products = mergeKeyedArrays(remoteState.products, localState.products, (p) => p.id);
    merged.services = mergeKeyedArrays(remoteState.services, localState.services, (s) => s.id);
    merged.prices = mergeKeyedArrays(
      remoteState.prices,
      localState.prices,
      (p) => `${p.productId}::${p.serviceId}`
    );
    merged.customerCustomPrices = mergeKeyedArrays(
      remoteState.customerCustomPrices,
      localState.customerCustomPrices,
      (p) => `${p.customerId}::${p.productId}::${p.serviceId}`
    );
    merged.deliveryOptions = mergeKeyedArrays(
      remoteState.deliveryOptions,
      localState.deliveryOptions,
      (d) => d.id
    );
  }

  // customers
  const custMode = resolveSection('customers');
  if (custMode === 'local') {
    merged.customers = localState.customers;
  } else if (custMode === 'both') {
    merged.customers = mergeKeyedArrays(remoteState.customers, localState.customers, (c) => c.id);
  }

  // corporate
  const corpMode = resolveSection('corporate');
  if (corpMode === 'local') {
    merged.corporateCustomers = localState.corporateCustomers;
    merged.corporateMovements = localState.corporateMovements;
    merged.corporateRewashRecords = localState.corporateRewashRecords;
  } else if (corpMode === 'both') {
    merged.corporateCustomers = mergeKeyedArrays(
      remoteState.corporateCustomers,
      localState.corporateCustomers,
      (c) => c.id
    );
    merged.corporateMovements = mergeKeyedArrays(
      remoteState.corporateMovements,
      localState.corporateMovements,
      (m) => m.id
    );
    merged.corporateRewashRecords = mergeKeyedArrays(
      remoteState.corporateRewashRecords || [],
      localState.corporateRewashRecords || [],
      (r) => r.id
    );
  }

  // orders
  const ordMode = resolveSection('orders');
  if (ordMode === 'local') {
    merged.orders = localState.orders;
  } else if (ordMode === 'both') {
    merged.orders = mergeKeyedArrays(remoteState.orders, localState.orders, (o) => o.id);
  }

  // invoices
  const invMode = resolveSection('invoices');
  if (invMode === 'local') {
    merged.invoices = localState.invoices;
  } else if (invMode === 'both') {
    merged.invoices = mergeKeyedArrays(remoteState.invoices, localState.invoices, (i) => i.id);
  }

  // accounting
  const accMode = resolveSection('accounting');
  if (accMode === 'local') {
    merged.accounts = localState.accounts;
    merged.journalEntries = localState.journalEntries;
  } else if (accMode === 'both') {
    merged.journalEntries = mergeKeyedArrays(
      remoteState.journalEntries,
      localState.journalEntries,
      (j) => j.id
    );
    const mergedAccountsBase = mergeKeyedArrays(
      remoteState.accounts,
      localState.accounts,
      (a) => a.code
    );
    merged.accounts = recalculateAccountBalancesFromJournals(
      mergedAccountsBase,
      merged.journalEntries
    );
  }

  // inventory
  const inventoryMode = resolveSection('inventory');
  if (inventoryMode === 'local') {
    merged.suppliers = localState.suppliers;
    merged.chemicals = localState.chemicals;
    merged.stockMovements = localState.stockMovements;
  } else if (inventoryMode === 'both') {
    merged.suppliers = mergeKeyedArrays(remoteState.suppliers, localState.suppliers, (s) => s.id);
    merged.chemicals = mergeKeyedArrays(remoteState.chemicals, localState.chemicals, (c) => c.id);
    merged.stockMovements = mergeKeyedArrays(
      remoteState.stockMovements,
      localState.stockMovements,
      (m) => m.id
    );
  }

  // employees (staff, fines, payroll, expenses)
  const empMode = resolveSection('employees');
  if (empMode === 'local') {
    merged.employees = localState.employees;
    merged.staffFines = localState.staffFines;
    merged.payrollRecords = localState.payrollRecords;
    merged.expenses = localState.expenses;
  } else if (empMode === 'both') {
    merged.employees = mergeKeyedArrays(remoteState.employees, localState.employees, (e) => e.id);
    merged.staffFines = mergeKeyedArrays(
      remoteState.staffFines || [],
      localState.staffFines || [],
      (f) => f.id
    );
    merged.payrollRecords = mergeKeyedArrays(
      remoteState.payrollRecords,
      localState.payrollRecords,
      (p) => p.id
    );
    merged.expenses = mergeKeyedArrays(remoteState.expenses, localState.expenses, (e) => e.id);
  }

  // tasks
  const tasksMode = resolveSection('tasks');
  if (tasksMode === 'local') {
    merged.tasks = localState.tasks;
    merged.notificationRules = localState.notificationRules;
  } else if (tasksMode === 'both') {
    merged.tasks = mergeKeyedArrays(remoteState.tasks, localState.tasks, (t) => t.id);
  }

  // blackBox audit log union (kept newest-first)
  merged.blackBox = mergeKeyedArrays(remoteState.blackBox, localState.blackBox, (b) => b.id);

  // Preserve remote syncRevision as base for the next write
  merged.syncRevision = remoteState.syncRevision;

  return {
    mergedState: migrateErpState(merged),
    hadRemoteChanges: remoteChangedSections.size > 0,
    conflictedSections,
  };
}

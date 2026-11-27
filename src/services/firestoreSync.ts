import type { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  BOOTSTRAPPED_ADMIN_EMAIL,
  db,
  handleFirestoreError,
  OperationType,
} from '../firebase';
import { INITIAL_ERP_STATE } from '../data/seedData';
import type { ErpState } from '../types/erp';
import { migrateErpState } from '../utils/migration';

export const STATIC_STATE_KEY = 'rinse_static_erp_state_v2';
export const FIRESTORE_MIGRATED_KEY = 'rinse_firestore_migrated';
export const RINSE_STATE_COLLECTION = 'rinse_state';

const WORKSPACE_CONFIG_COLLECTION = 'workspace_config';
const WORKSPACE_PRIMARY_DOC = 'primary';
const ADMINS_COLLECTION = 'admins';
const USERS_COLLECTION = 'users';
const INVITES_COLLECTION = 'workspace_invites';

const MAX_SECTION_BYTES = 350_000;
const MAX_BATCH_OPS = 400;

export type RinseSectionName =
  | 'meta'
  | 'settings'
  | 'security'
  | 'catalogue'
  | 'customers'
  | 'corporate'
  | 'orders'
  | 'invoices'
  | 'accounting'
  | 'inventory'
  | 'employees'
  | 'tasks'
  | 'blackbox';

const ALL_SECTIONS: RinseSectionName[] = [
  'meta',
  'settings',
  'security',
  'catalogue',
  'customers',
  'corporate',
  'orders',
  'invoices',
  'accounting',
  'inventory',
  'employees',
  'tasks',
  'blackbox',
];

export interface WorkspaceContext {
  ownerUid: string;
  memberUids: string[];
  isAdmin: boolean;
  isBootstrappedAdmin: boolean;
}

export interface WorkspaceInviteRecord {
  email: string;
  invitedByUid: string;
  roleNote: string;
}

export interface RemoteStateSnapshot {
  state: ErpState;
  syncRevision: number;
  originClientId: string;
  docIds: string[];
  sectionHashes: Record<string, string>;
  businessJson: string;
  fromCache?: boolean;
}

function normalizeId(raw: string): string {
  const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 128);
  return cleaned || 'client_default';
}

export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return value;
}

/**
 * Checks whether localStorage state contains actual business records rather than
 * an untouched empty/default shell. Never uploads demo/default seed data.
 */
export function hasRealBusinessRecords(raw: Partial<ErpState> | null | undefined): boolean {
  if (!raw || typeof raw !== 'object') return false;

  if (
    (Array.isArray(raw.orders) && raw.orders.length > 0) ||
    (Array.isArray(raw.customers) && raw.customers.length > 0) ||
    (Array.isArray(raw.corporateCustomers) && raw.corporateCustomers.length > 0) ||
    (Array.isArray(raw.corporateMovements) && raw.corporateMovements.length > 0) ||
    (Array.isArray(raw.corporateRewashRecords) && raw.corporateRewashRecords.length > 0) ||
    (Array.isArray(raw.products) && raw.products.length > 0) ||
    (Array.isArray(raw.services) && raw.services.length > 0) ||
    (Array.isArray(raw.prices) && raw.prices.length > 0) ||
    (Array.isArray(raw.customerCustomPrices) && raw.customerCustomPrices.length > 0) ||
    (Array.isArray(raw.suppliers) && raw.suppliers.length > 0) ||
    (Array.isArray(raw.chemicals) && raw.chemicals.length > 0) ||
    (Array.isArray(raw.stockMovements) && raw.stockMovements.length > 0) ||
    (Array.isArray(raw.journalEntries) && raw.journalEntries.length > 0) ||
    (Array.isArray(raw.employees) && raw.employees.length > 0) ||
    (Array.isArray(raw.payrollRecords) && raw.payrollRecords.length > 0) ||
    (Array.isArray(raw.staffFines) && raw.staffFines.length > 0) ||
    (Array.isArray(raw.expenses) && raw.expenses.length > 0) ||
    (Array.isArray(raw.invoices) && raw.invoices.length > 0) ||
    (Array.isArray(raw.tasks) && raw.tasks.length > 0) ||
    (Array.isArray(raw.notifications) && raw.notifications.length > 0)
  ) {
    return true;
  }

  if (Array.isArray(raw.categories) && raw.categories.length > INITIAL_ERP_STATE.categories.length) {
    return true;
  }

  if (Array.isArray(raw.blackBox) && raw.blackBox.some((b) => b.module !== 'Auth')) {
    return true;
  }

  if (raw.openingBalance) {
    if (raw.openingBalance.status && raw.openingBalance.status !== 'not_started') {
      return true;
    }
    if ((raw.openingBalance.ownerCapitalAmount || 0) !== 0) {
      return true;
    }
    if (
      Array.isArray(raw.openingBalance.cashAndBanks) &&
      raw.openingBalance.cashAndBanks.some((c) => Number(c.balance || 0) !== 0)
    ) {
      return true;
    }
  }

  if (Array.isArray(raw.accounts)) {
    const hasNonZeroBalance = raw.accounts.some((a) => Number(a.balance || 0) !== 0);
    const hasCustomAccounts = raw.accounts.some(
      (a) => !INITIAL_ERP_STATE.accounts.some((seedAcc) => seedAcc.code === a.code)
    );
    if (hasNonZeroBalance || hasCustomAccounts) {
      return true;
    }
  }

  if (raw.settings) {
    if (
      (raw.settings.companyName && raw.settings.companyName !== INITIAL_ERP_STATE.settings.companyName) ||
      Boolean(raw.settings.companyAddress?.trim()) ||
      Boolean(raw.settings.companyPhone?.trim()) ||
      Boolean(raw.settings.companyLogoDataUrl)
    ) {
      return true;
    }
  }

  if (Array.isArray(raw.users)) {
    const defaultIds = new Set(INITIAL_ERP_STATE.users.map((u) => u.id.toLowerCase()));
    const hasCustomUsers =
      raw.users.length > INITIAL_ERP_STATE.users.length ||
      raw.users.some((u) => !defaultIds.has(u.id.toLowerCase()) && u.id.toLowerCase() !== 'owner');
    if (hasCustomUsers) {
      return true;
    }
  }

  return false;
}

function estimateBytes(obj: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
  } catch {
    return 0;
  }
}

function splitArrayByBytes<T>(items: T[], maxBytes: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = 2;

  for (const item of items) {
    const itemBytes = estimateBytes(item) + 2;
    if (current.length > 0 && currentBytes + itemBytes > maxBytes) {
      chunks.push(current);
      current = [item];
      currentBytes = itemBytes + 2;
    } else {
      current.push(item);
      currentBytes += itemBytes;
    }
  }
  if (current.length > 0) {
    chunks.push(current);
  }
  return chunks.length > 0 ? chunks : [[]];
}

interface SerializedSectionDoc {
  docId: string;
  section: RinseSectionName;
  chunkIndex: number;
  totalChunks: number;
  payload: Record<string, unknown>;
}

function serializeErpStateToSections(state: ErpState): SerializedSectionDoc[] {
  const clean = stripUndefinedDeep(state);
  const docs: SerializedSectionDoc[] = [];

  // 1. meta
  docs.push({
    docId: 'meta',
    section: 'meta',
    chunkIndex: 0,
    totalChunks: 1,
    payload: {
      schemaVersion: clean.schemaVersion ?? 2,
      lastUpdatedAt: clean.lastUpdatedAt || new Date().toISOString(),
      lastUpdatedBy: clean.lastUpdatedBy || 'User',
      openingBalancePromptDismissed: Boolean(clean.openingBalancePromptDismissed),
    },
  });

  // 2. settings (guard oversized inline data URLs so doc stays well under 1MB)
  const settingsCopy = { ...clean.settings };
  if (settingsCopy.companyLogoDataUrl && estimateBytes(settingsCopy.companyLogoDataUrl) > 450_000) {
    delete settingsCopy.companyLogoDataUrl;
    delete settingsCopy.companyLogoMimeType;
  }
  docs.push({
    docId: 'settings',
    section: 'settings',
    chunkIndex: 0,
    totalChunks: 1,
    payload: {
      settings: settingsCopy,
      idFormats: clean.idFormats,
      openingBalance: clean.openingBalance,
    },
  });

  // 3. security
  docs.push({
    docId: 'security',
    section: 'security',
    chunkIndex: 0,
    totalChunks: 1,
    payload: {
      users: clean.users,
      rolePermissions: clean.rolePermissions,
    },
  });

  // 4. catalogue
  docs.push({
    docId: 'catalogue',
    section: 'catalogue',
    chunkIndex: 0,
    totalChunks: 1,
    payload: {
      categories: clean.categories,
      products: clean.products,
      services: clean.services,
      prices: clean.prices,
      customerCustomPrices: clean.customerCustomPrices,
      deliveryOptions: clean.deliveryOptions,
    },
  });

  // 5. customers (chunkable)
  const customerChunks = splitArrayByBytes(clean.customers, MAX_SECTION_BYTES);
  customerChunks.forEach((items, idx) => {
    docs.push({
      docId: idx === 0 ? 'customers' : `customers__${idx}`,
      section: 'customers',
      chunkIndex: idx,
      totalChunks: customerChunks.length,
      payload: { items },
    });
  });

  // 6. corporate (chunk corporateMovements if large)
  const corpMovementChunks = splitArrayByBytes(clean.corporateMovements, MAX_SECTION_BYTES);
  corpMovementChunks.forEach((movements, idx) => {
    docs.push({
      docId: idx === 0 ? 'corporate' : `corporate__${idx}`,
      section: 'corporate',
      chunkIndex: idx,
      totalChunks: corpMovementChunks.length,
      payload:
        idx === 0
          ? {
              corporateCustomers: clean.corporateCustomers,
              corporateRewashRecords: clean.corporateRewashRecords || [],
              corporateMovements: movements,
            }
          : { corporateMovements: movements },
    });
  });

  // 7. orders (chunkable)
  const orderChunks = splitArrayByBytes(clean.orders, MAX_SECTION_BYTES);
  orderChunks.forEach((items, idx) => {
    docs.push({
      docId: idx === 0 ? 'orders' : `orders__${idx}`,
      section: 'orders',
      chunkIndex: idx,
      totalChunks: orderChunks.length,
      payload: { items },
    });
  });

  // 8. invoices (chunkable, guard giant inline logo snapshots)
  const sanitizedInvoices = clean.invoices.map((inv) => {
    if (inv.logoSnapshotDataUrl && estimateBytes(inv.logoSnapshotDataUrl) > 150_000) {
      const rest = { ...inv };
      delete rest.logoSnapshotDataUrl;
      return rest;
    }
    return inv;
  });
  const invoiceChunks = splitArrayByBytes(sanitizedInvoices, MAX_SECTION_BYTES);
  invoiceChunks.forEach((items, idx) => {
    docs.push({
      docId: idx === 0 ? 'invoices' : `invoices__${idx}`,
      section: 'invoices',
      chunkIndex: idx,
      totalChunks: invoiceChunks.length,
      payload: { items },
    });
  });

  // 9. accounting (chunk journalEntries)
  const journalChunks = splitArrayByBytes(clean.journalEntries, MAX_SECTION_BYTES);
  journalChunks.forEach((entries, idx) => {
    docs.push({
      docId: idx === 0 ? 'accounting' : `accounting__${idx}`,
      section: 'accounting',
      chunkIndex: idx,
      totalChunks: journalChunks.length,
      payload:
        idx === 0
          ? {
              accounts: clean.accounts,
              journalEntries: entries,
            }
          : { journalEntries: entries },
    });
  });

  // 10. inventory (chunk stockMovements)
  const stockChunks = splitArrayByBytes(clean.stockMovements, MAX_SECTION_BYTES);
  stockChunks.forEach((movements, idx) => {
    docs.push({
      docId: idx === 0 ? 'inventory' : `inventory__${idx}`,
      section: 'inventory',
      chunkIndex: idx,
      totalChunks: stockChunks.length,
      payload:
        idx === 0
          ? {
              suppliers: clean.suppliers,
              chemicals: clean.chemicals,
              stockMovements: movements,
            }
          : { stockMovements: movements },
    });
  });

  // 11. employees (chunk payrollRecords)
  const payrollChunks = splitArrayByBytes(clean.payrollRecords, MAX_SECTION_BYTES);
  payrollChunks.forEach((records, idx) => {
    docs.push({
      docId: idx === 0 ? 'employees' : `employees__${idx}`,
      section: 'employees',
      chunkIndex: idx,
      totalChunks: payrollChunks.length,
      payload:
        idx === 0
          ? {
              employees: clean.employees,
              payrollRecords: records,
              staffFines: clean.staffFines || [],
              expenses: clean.expenses,
            }
          : { payrollRecords: records },
    });
  });

  // 12. tasks (chunk notifications if large)
  const notificationChunks = splitArrayByBytes(clean.notifications, MAX_SECTION_BYTES);
  notificationChunks.forEach((notifs, idx) => {
    docs.push({
      docId: idx === 0 ? 'tasks' : `tasks__${idx}`,
      section: 'tasks',
      chunkIndex: idx,
      totalChunks: notificationChunks.length,
      payload:
        idx === 0
          ? {
              tasks: clean.tasks,
              notifications: notifs,
              notificationRules: clean.notificationRules,
            }
          : { notifications: notifs },
    });
  });

  // 13. blackbox (chunkable)
  const blackBoxChunks = splitArrayByBytes(clean.blackBox, MAX_SECTION_BYTES);
  blackBoxChunks.forEach((items, idx) => {
    docs.push({
      docId: idx === 0 ? 'blackbox' : `blackbox__${idx}`,
      section: 'blackbox',
      chunkIndex: idx,
      totalChunks: blackBoxChunks.length,
      payload: { items },
    });
  });

  return docs;
}

const HASH_EXCLUDED_KEYS = new Set([
  'lastUpdatedAt',
  'lastUpdatedBy',
  'syncRevision',
  'alerts',
  'notifications',
  'lastBackupAt',
  'autoBackup',
  'autoBackupEnabled',
  'auditLogs',
  'blackBox',
]);

function stripHashExcludedKeys(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripHashExcludedKeys(item));
  }
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (HASH_EXCLUDED_KEYS.has(key)) continue;
    out[key] = stripHashExcludedKeys(val);
  }
  return out;
}

function normalizeSectionPayloadForHash(
  section: RinseSectionName,
  payload: Record<string, unknown>
): Record<string, unknown> {
  if (section === 'blackbox') {
    return {};
  }
  return stripHashExcludedKeys(payload) as Record<string, unknown>;
}

export function serializeStateSectionHashes(state: ErpState): {
  docs: SerializedSectionDoc[];
  sectionHashes: Record<string, string>;
  businessJson: string;
} {
  const docs = serializeErpStateToSections(state);
  const sectionHashes: Record<string, string> = {};
  const entries: Array<[string, string]> = [];

  for (const d of docs) {
    const normalizedPayload = normalizeSectionPayloadForHash(d.section, d.payload);
    const hashJson = JSON.stringify(normalizedPayload);
    sectionHashes[d.docId] = hashJson;
    if (d.section === 'blackbox') continue;
    if (d.section === 'tasks' && d.chunkIndex > 0) continue;
    entries.push([d.docId, hashJson]);
  }

  entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return {
    docs,
    sectionHashes,
    businessJson: JSON.stringify(entries),
  };
}

export function computeBusinessStateHash(state: ErpState): string {
  return serializeStateSectionHashes(state).businessJson;
}

export function computeSectionHashes(state: ErpState): Record<string, string> {
  return serializeStateSectionHashes(state).sectionHashes;
}

function assembleErpStateFromDocs(
  rawDocs: Array<{ id: string; data: Record<string, unknown> }>
): RemoteStateSnapshot | null {
  if (rawDocs.length === 0) return null;

  const bySection = new Map<RinseSectionName, Array<{ chunkIndex: number; payload: Record<string, unknown> }>>();
  let maxRevision = 1;
  let metaOriginClientId = '';
  const docIds: string[] = [];

  for (const d of rawDocs) {
    docIds.push(d.id);
    const data = d.data;
    const section = data.section as RinseSectionName | undefined;
    if (!section || !ALL_SECTIONS.includes(section)) continue;
    const chunkIndex = typeof data.chunkIndex === 'number' ? data.chunkIndex : 0;
    const payload = (data.payload as Record<string, unknown>) || {};
    const rev = typeof data.syncRevision === 'number' ? data.syncRevision : 1;
    if (rev >= maxRevision) {
      maxRevision = rev;
      if (section === 'meta' && typeof data.originClientId === 'string') {
        metaOriginClientId = data.originClientId;
      } else if (!metaOriginClientId && typeof data.originClientId === 'string') {
        metaOriginClientId = data.originClientId;
      }
    }
    const list = bySection.get(section) || [];
    list.push({ chunkIndex, payload });
    bySection.set(section, list);
  }

  for (const list of bySection.values()) {
    list.sort((a, b) => a.chunkIndex - b.chunkIndex);
  }

  const partial: Partial<ErpState> = {
    syncRevision: maxRevision,
  };

  const metaChunks = bySection.get('meta');
  if (metaChunks && metaChunks[0]) {
    const p = metaChunks[0].payload;
    if (typeof p.schemaVersion === 'number') partial.schemaVersion = p.schemaVersion;
    if (typeof p.lastUpdatedAt === 'string') partial.lastUpdatedAt = p.lastUpdatedAt;
    if (typeof p.lastUpdatedBy === 'string') partial.lastUpdatedBy = p.lastUpdatedBy;
    if (typeof p.openingBalancePromptDismissed === 'boolean') {
      partial.openingBalancePromptDismissed = p.openingBalancePromptDismissed;
    }
  }

  const settingsChunks = bySection.get('settings');
  if (settingsChunks && settingsChunks[0]) {
    const p = settingsChunks[0].payload;
    if (p.settings) partial.settings = p.settings as ErpState['settings'];
    if (p.idFormats) partial.idFormats = p.idFormats as ErpState['idFormats'];
    if (p.openingBalance) partial.openingBalance = p.openingBalance as ErpState['openingBalance'];
  }

  const securityChunks = bySection.get('security');
  if (securityChunks && securityChunks[0]) {
    const p = securityChunks[0].payload;
    if (Array.isArray(p.users)) partial.users = p.users as ErpState['users'];
    if (p.rolePermissions) partial.rolePermissions = p.rolePermissions as ErpState['rolePermissions'];
  }

  const catalogueChunks = bySection.get('catalogue');
  if (catalogueChunks && catalogueChunks[0]) {
    const p = catalogueChunks[0].payload;
    if (Array.isArray(p.categories)) partial.categories = p.categories as ErpState['categories'];
    if (Array.isArray(p.products)) partial.products = p.products as ErpState['products'];
    if (Array.isArray(p.services)) partial.services = p.services as ErpState['services'];
    if (Array.isArray(p.prices)) partial.prices = p.prices as ErpState['prices'];
    if (Array.isArray(p.customerCustomPrices)) {
      partial.customerCustomPrices = p.customerCustomPrices as ErpState['customerCustomPrices'];
    }
    if (Array.isArray(p.deliveryOptions)) {
      partial.deliveryOptions = p.deliveryOptions as ErpState['deliveryOptions'];
    }
  }

  const customerChunks = bySection.get('customers');
  if (customerChunks) {
    partial.customers = customerChunks.flatMap((c) =>
      Array.isArray(c.payload.items) ? (c.payload.items as ErpState['customers']) : []
    );
  }

  const corpChunks = bySection.get('corporate');
  if (corpChunks) {
    if (corpChunks[0]) {
      if (Array.isArray(corpChunks[0].payload.corporateCustomers)) {
        partial.corporateCustomers = corpChunks[0].payload.corporateCustomers as ErpState['corporateCustomers'];
      }
      if (Array.isArray(corpChunks[0].payload.corporateRewashRecords)) {
        partial.corporateRewashRecords = corpChunks[0].payload.corporateRewashRecords as ErpState['corporateRewashRecords'];
      }
    }
    partial.corporateMovements = corpChunks.flatMap((c) =>
      Array.isArray(c.payload.corporateMovements)
        ? (c.payload.corporateMovements as ErpState['corporateMovements'])
        : []
    );
  }

  const orderChunks = bySection.get('orders');
  if (orderChunks) {
    partial.orders = orderChunks.flatMap((c) =>
      Array.isArray(c.payload.items) ? (c.payload.items as ErpState['orders']) : []
    );
  }

  const invoiceChunks = bySection.get('invoices');
  if (invoiceChunks) {
    partial.invoices = invoiceChunks.flatMap((c) =>
      Array.isArray(c.payload.items) ? (c.payload.items as ErpState['invoices']) : []
    );
  }

  const accountingChunks = bySection.get('accounting');
  if (accountingChunks) {
    if (accountingChunks[0] && Array.isArray(accountingChunks[0].payload.accounts)) {
      partial.accounts = accountingChunks[0].payload.accounts as ErpState['accounts'];
    }
    partial.journalEntries = accountingChunks.flatMap((c) =>
      Array.isArray(c.payload.journalEntries)
        ? (c.payload.journalEntries as ErpState['journalEntries'])
        : []
    );
  }

  const inventoryChunks = bySection.get('inventory');
  if (inventoryChunks) {
    if (inventoryChunks[0]) {
      if (Array.isArray(inventoryChunks[0].payload.suppliers)) {
        partial.suppliers = inventoryChunks[0].payload.suppliers as ErpState['suppliers'];
      }
      if (Array.isArray(inventoryChunks[0].payload.chemicals)) {
        partial.chemicals = inventoryChunks[0].payload.chemicals as ErpState['chemicals'];
      }
    }
    partial.stockMovements = inventoryChunks.flatMap((c) =>
      Array.isArray(c.payload.stockMovements)
        ? (c.payload.stockMovements as ErpState['stockMovements'])
        : []
    );
  }

  const employeeChunks = bySection.get('employees');
  if (employeeChunks) {
    if (employeeChunks[0]) {
      if (Array.isArray(employeeChunks[0].payload.employees)) {
        partial.employees = employeeChunks[0].payload.employees as ErpState['employees'];
      }
      if (Array.isArray(employeeChunks[0].payload.staffFines)) {
        partial.staffFines = employeeChunks[0].payload.staffFines as ErpState['staffFines'];
      }
      if (Array.isArray(employeeChunks[0].payload.expenses)) {
        partial.expenses = employeeChunks[0].payload.expenses as ErpState['expenses'];
      }
    }
    partial.payrollRecords = employeeChunks.flatMap((c) =>
      Array.isArray(c.payload.payrollRecords)
        ? (c.payload.payrollRecords as ErpState['payrollRecords'])
        : []
    );
  }

  const taskChunks = bySection.get('tasks');
  if (taskChunks) {
    if (taskChunks[0]) {
      if (Array.isArray(taskChunks[0].payload.tasks)) {
        partial.tasks = taskChunks[0].payload.tasks as ErpState['tasks'];
      }
      if (Array.isArray(taskChunks[0].payload.notificationRules)) {
        partial.notificationRules = taskChunks[0].payload
          .notificationRules as ErpState['notificationRules'];
      }
    }
    partial.notifications = taskChunks.flatMap((c) =>
      Array.isArray(c.payload.notifications)
        ? (c.payload.notifications as ErpState['notifications'])
        : []
    );
  }

  const blackBoxChunks = bySection.get('blackbox');
  if (blackBoxChunks) {
    partial.blackBox = blackBoxChunks.flatMap((c) =>
      Array.isArray(c.payload.items) ? (c.payload.items as ErpState['blackBox']) : []
    );
  }

  // Ensure settings & accounts exist before running migrateErpState
  const hydratedInput: Partial<ErpState> = {
    ...INITIAL_ERP_STATE,
    ...partial,
    settings: partial.settings || INITIAL_ERP_STATE.settings,
    accounts: partial.accounts || INITIAL_ERP_STATE.accounts,
  };

  const finalState = migrateErpState(hydratedInput);
  const { sectionHashes, businessJson } = serializeStateSectionHashes(finalState);

  return {
    state: finalState,
    syncRevision: maxRevision,
    originClientId: metaOriginClientId,
    docIds,
    sectionHashes,
    businessJson,
  };
}

/**
 * Ensures the signed-in Google user has a profile document and checks / initializes
 * workspace access without ever writing demo ERP records.
 */
export async function ensureWorkspaceAccess(
  user: User
): Promise<{ authorized: true; context: WorkspaceContext } | { authorized: false; reason: string }> {
  const email = (user.email || '').trim().toLowerCase();
  if (!user.emailVerified || !email) {
    return {
      authorized: false,
      reason: 'A verified Google email address is required for cloud sync.',
    };
  }

  const isBootstrappedAdmin = email === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase();
  const userDocPath = `${USERS_COLLECTION}/${user.uid}`;

  // 1. Upsert private user profile only when fields actually changed (avoids startup write quota burn)
  try {
    const userRef = doc(db, USERS_COLLECTION, user.uid);
    const userSnap = await getDoc(userRef);
    const nextDisplayName = (user.displayName || email.split('@')[0] || 'User').slice(0, 120);
    const nextPhotoUrl = user.photoURL ? user.photoURL.slice(0, 1000) : '';
    if (!userSnap.exists()) {
      await setDoc(userRef, {
        uid: user.uid,
        email,
        displayName: nextDisplayName,
        ...(nextPhotoUrl ? { photoURL: nextPhotoUrl } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingProfile = userSnap.data();
      const profileChanged =
        existingProfile.email !== email ||
        existingProfile.displayName !== nextDisplayName ||
        (existingProfile.photoURL || '') !== nextPhotoUrl;
      if (profileChanged) {
        await updateDoc(userRef, {
          email,
          displayName: nextDisplayName,
          ...(nextPhotoUrl ? { photoURL: nextPhotoUrl } : {}),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userDocPath);
  }

  // 2. Check or atomically bootstrap workspace_config/primary + admins/{uid}
  const wsPath = `${WORKSPACE_CONFIG_COLLECTION}/${WORKSPACE_PRIMARY_DOC}`;
  let wsData: {
    ownerUid: string;
    memberUids: string[];
  } | null = null;

  try {
    const wsRef = doc(db, WORKSPACE_CONFIG_COLLECTION, WORKSPACE_PRIMARY_DOC);
    const wsSnap = await getDoc(wsRef);

    if (!wsSnap.exists()) {
      // Atomic first-owner bootstrap (workspace_config/primary + admins/{uid})
      const batch = writeBatch(db);
      batch.set(wsRef, {
        workspaceId: WORKSPACE_PRIMARY_DOC,
        ownerUid: user.uid,
        ownerEmail: email,
        memberUids: [user.uid],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const adminRef = doc(db, ADMINS_COLLECTION, user.uid);
      batch.set(adminRef, {
        uid: user.uid,
        email,
        grantedBy: user.uid,
        createdAt: serverTimestamp(),
      });
      await batch.commit();
      return {
        authorized: true,
        context: {
          ownerUid: user.uid,
          memberUids: [user.uid],
          isAdmin: true,
          isBootstrappedAdmin,
        },
      };
    }

    const rawWs = wsSnap.data();
    wsData = {
      ownerUid: String(rawWs.ownerUid || ''),
      memberUids: Array.isArray(rawWs.memberUids) ? rawWs.memberUids.map(String) : [],
    };
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code === 'permission-denied') {
      return {
        authorized: false,
        reason: `Signed in as ${email}. This Google account is not yet authorized on this Rinse workspace. Ask the Business Owner to add "${email}" in Settings -> Cloud Team Access.`,
      };
    }
    handleFirestoreError(err, OperationType.GET, wsPath);
  }

  if (!wsData) {
    return {
      authorized: false,
      reason: 'Unable to load workspace configuration.',
    };
  }

  let isAdmin = isBootstrappedAdmin || wsData.ownerUid === user.uid;
  if (!isAdmin) {
    try {
      const adminSnap = await getDoc(doc(db, ADMINS_COLLECTION, user.uid));
      isAdmin = adminSnap.exists();
    } catch {
      isAdmin = false;
    }
  }

  let memberUids = Array.from(new Set(wsData.memberUids.filter(Boolean)));
  const alreadyMember = memberUids.includes(user.uid) || wsData.ownerUid === user.uid;

  if (!alreadyMember) {
    // Check if invited (or bootstrapped admin)
    let invited = isBootstrappedAdmin;
    if (!invited) {
      try {
        const inviteSnap = await getDoc(doc(db, INVITES_COLLECTION, email));
        invited = inviteSnap.exists();
      } catch {
        invited = false;
      }
    }

    if (!invited) {
      return {
        authorized: false,
        reason: `Signed in as ${email}. Ask the Business Owner to authorize "${email}" in Settings -> Cloud Team Access.`,
      };
    }

    // Enroll UID into workspace_config/primary and existing rinse_state docs
    memberUids = Array.from(new Set([...memberUids, user.uid])).slice(0, 50);
    try {
      await updateDoc(doc(db, WORKSPACE_CONFIG_COLLECTION, WORKSPACE_PRIMARY_DOC), {
        memberUids,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, wsPath);
    }

    // Also update memberUids on known base rinse_state docs (if they exist) so onSnapshot query sees them
    try {
      const enrollBatch = writeBatch(db);
      let pendingOps = 0;
      for (const sec of ALL_SECTIONS) {
        const ref = doc(db, RINSE_STATE_COLLECTION, sec);
        const snap = await getDoc(ref);
        if (snap.exists()) {
          const d = snap.data();
          const currentMembers = Array.isArray(d.memberUids) ? d.memberUids.map(String) : [];
          if (!currentMembers.includes(user.uid)) {
            enrollBatch.update(ref, {
              memberUids: Array.from(new Set([...currentMembers, user.uid])).slice(0, 50),
              updatedByUid: user.uid,
              updatedAt: serverTimestamp(),
            });
            pendingOps += 1;
          }
          const totalChunks = typeof d.totalChunks === 'number' ? d.totalChunks : 1;
          for (let i = 1; i < totalChunks; i += 1) {
            const chunkRef = doc(db, RINSE_STATE_COLLECTION, `${sec}__${i}`);
            const chunkSnap = await getDoc(chunkRef);
            if (chunkSnap.exists()) {
              const cd = chunkSnap.data();
              const cm = Array.isArray(cd.memberUids) ? cd.memberUids.map(String) : [];
              if (!cm.includes(user.uid)) {
                enrollBatch.update(chunkRef, {
                  memberUids: Array.from(new Set([...cm, user.uid])).slice(0, 50),
                  updatedByUid: user.uid,
                  updatedAt: serverTimestamp(),
                });
                pendingOps += 1;
              }
            }
          }
        }
      }
      if (pendingOps > 0) {
        await enrollBatch.commit();
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, RINSE_STATE_COLLECTION);
    }
  }

  return {
    authorized: true,
    context: {
      ownerUid: wsData.ownerUid,
      memberUids: memberUids.length > 0 ? memberUids : [wsData.ownerUid || user.uid],
      isAdmin,
      isBootstrappedAdmin,
    },
  };
}

/**
 * Atomically writes only the changed partitioned rinse_state documents via writeBatch.
 * Enforces a strict revision guard (rejects if remote syncRevision >= target or > localBaseRevision)
 * and a business-hash kill-switch (never writes unless computeBusinessStateHash differs from lastSyncedJson).
 * Cleans up any previously known overflow chunk documents that are no longer needed.
 */
export async function saveStateToFirestoreBatch(params: {
  state: ErpState;
  user: User;
  workspace: WorkspaceContext;
  syncRevision: number;
  localBaseRevision?: number;
  remoteSyncRevision?: number;
  originClientId: string;
  knownDocIds?: string[];
  lastSyncedDocs?: Record<string, string>;
  lastSyncedJson?: string;
  forceAll?: boolean;
}): Promise<{
  docIds: string[];
  sectionHashes: Record<string, string>;
  businessJson: string;
  writtenCount: number;
  abortedReason?: 'unchanged-hash' | 'not-synced-yet' | 'stale-revision';
  remoteRevision?: number;
}> {
  const {
    state,
    user,
    workspace,
    syncRevision,
    localBaseRevision,
    remoteSyncRevision,
    originClientId,
    knownDocIds = [],
    lastSyncedDocs,
    lastSyncedJson,
    forceAll = false,
  } = params;
  const { docs: serializedDocs, sectionHashes, businessJson } = serializeStateSectionHashes(state);

  // Kill-switch #1: never allow a write unless business state hash differs from lastSyncedJsonRef
  if (!forceAll) {
    if (!lastSyncedJson) {
      return {
        docIds: knownDocIds,
        sectionHashes: lastSyncedDocs || sectionHashes,
        businessJson,
        writtenCount: 0,
        abortedReason: 'not-synced-yet',
      };
    }
    if (businessJson === lastSyncedJson) {
      return {
        docIds: knownDocIds,
        sectionHashes: lastSyncedDocs || sectionHashes,
        businessJson,
        writtenCount: 0,
        abortedReason: 'unchanged-hash',
      };
    }
  }

  const safeRevision = Math.max(1, Math.trunc(syncRevision));
  const effectiveBaseRev =
    typeof localBaseRevision === 'number' ? Math.trunc(localBaseRevision) : safeRevision - 1;

  // Kill-switch #2a: abort immediately if known incoming remote syncRevision is >= candidate revision or > localBaseRevision
  if (
    typeof remoteSyncRevision === 'number' &&
    (remoteSyncRevision >= safeRevision ||
      (typeof localBaseRevision === 'number' && remoteSyncRevision > effectiveBaseRev))
  ) {
    return {
      docIds: knownDocIds,
      sectionHashes: lastSyncedDocs || sectionHashes,
      businessJson,
      writtenCount: 0,
      abortedReason: 'stale-revision',
      remoteRevision: remoteSyncRevision,
    };
  }

  // Kill-switch #2b: verify live remote meta.syncRevision before committing writeBatch so stale cached tabs cannot overwrite newer state
  try {
    const metaRef = doc(db, RINSE_STATE_COLLECTION, 'meta');
    let metaSnap;
    try {
      metaSnap = await getDocFromServer(metaRef);
    } catch (metaErr) {
      const errText = (metaErr instanceof Error ? metaErr.message : String(metaErr)).toLowerCase();
      if (errText.includes('resource-exhausted') || errText.includes('quota exceeded')) {
        handleFirestoreError(metaErr, OperationType.GET, `${RINSE_STATE_COLLECTION}/meta`);
      }
      metaSnap = await getDoc(metaRef);
    }
    if (metaSnap.exists()) {
      const liveRemoteRev = Number(metaSnap.data()?.syncRevision ?? 1);
      if (
        liveRemoteRev >= safeRevision ||
        (typeof localBaseRevision === 'number' && liveRemoteRev > effectiveBaseRev)
      ) {
        return {
          docIds: knownDocIds,
          sectionHashes: lastSyncedDocs || sectionHashes,
          businessJson,
          writtenCount: 0,
          abortedReason: 'stale-revision',
          remoteRevision: liveRemoteRev,
        };
      }
    }
  } catch (outerMetaErr) {
    const errText = (outerMetaErr instanceof Error ? outerMetaErr.message : String(outerMetaErr)).toLowerCase();
    if (errText.includes('resource-exhausted') || errText.includes('quota exceeded')) {
      throw outerMetaErr;
    }
    // Allow fallback when offline or if meta lookup cannot reach cache/server; rules & queued checks still guard
  }

  const nextDocIds = serializedDocs.map((d) => d.docId);
  const nextDocIdSet = new Set(nextDocIds);
  const staleDocIds = knownDocIds.filter((id) => !nextDocIdSet.has(id));

  const docsToWrite = serializedDocs.filter(
    (item) => forceAll || !lastSyncedDocs || lastSyncedDocs[item.docId] !== sectionHashes[item.docId]
  );

  if (docsToWrite.length === 0 && staleDocIds.length === 0) {
    return {
      docIds: nextDocIds,
      sectionHashes,
      businessJson,
      writtenCount: 0,
      abortedReason: 'unchanged-hash',
    };
  }

  const safeMemberUids = Array.from(
    new Set([workspace.ownerUid, ...workspace.memberUids, user.uid].filter(Boolean))
  ).slice(0, 50);
  const safeOriginId = normalizeId(originClientId);

  type BatchOp =
    | { kind: 'set'; docId: string; data: Record<string, unknown> }
    | { kind: 'delete'; docId: string };

  const ops: BatchOp[] = docsToWrite.map((item) => ({
    kind: 'set',
    docId: item.docId,
    data: {
      section: item.section,
      chunkIndex: Math.trunc(item.chunkIndex),
      totalChunks: Math.trunc(item.totalChunks),
      ownerUid: workspace.ownerUid,
      memberUids: safeMemberUids,
      payload: item.payload,
      syncRevision: safeRevision,
      originClientId: safeOriginId,
      updatedByUid: user.uid,
      updatedAt: serverTimestamp(),
    },
  }));

  for (const staleId of staleDocIds) {
    ops.push({ kind: 'delete', docId: staleId });
  }

  try {
    for (let i = 0; i < ops.length; i += MAX_BATCH_OPS) {
      const slice = ops.slice(i, i + MAX_BATCH_OPS);
      const batch = writeBatch(db);
      for (const op of slice) {
        const ref = doc(db, RINSE_STATE_COLLECTION, op.docId);
        if (op.kind === 'set') {
          batch.set(ref, op.data);
        } else {
          batch.delete(ref);
        }
      }
      await batch.commit();
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, RINSE_STATE_COLLECTION);
  }

  return {
    docIds: nextDocIds,
    sectionHashes,
    businessJson,
    writtenCount: ops.length,
  };
}

/**
 * Startup localStorage -> Firestore migration.
 * Checks localStorage for existing real business records first:
 * if localStorage has real records and rinse_firestore_migrated !== "true",
 * uploads those records to Firestore rinse_state via writeBatch and sets
 * rinse_firestore_migrated = "true" while leaving the original localStorage
 * backup completely untouched.
 */
export async function migrateLocalStorageToFirestoreIfNeeded(params: {
  user: User;
  workspace: WorkspaceContext;
  originClientId: string;
}): Promise<{
  migrated: boolean;
  state?: ErpState;
  docIds?: string[];
  sectionHashes?: Record<string, string>;
  businessJson?: string;
  syncRevision?: number;
}> {
  if (typeof window === 'undefined') return { migrated: false };

  let alreadyMigrated = false;
  let rawJson: string | null = null;
  try {
    alreadyMigrated = window.localStorage.getItem(FIRESTORE_MIGRATED_KEY) === 'true';
    rawJson = window.localStorage.getItem(STATIC_STATE_KEY);
  } catch {
    return { migrated: false };
  }

  if (alreadyMigrated || !rawJson) {
    return { migrated: false };
  }

  let parsed: Partial<ErpState> | null = null;
  try {
    parsed = JSON.parse(rawJson) as Partial<ErpState>;
  } catch {
    return { migrated: false };
  }

  if (!hasRealBusinessRecords(parsed)) {
    return { migrated: false };
  }

  const migratedState = migrateErpState(parsed);
  const nextRevision = Math.max(1, Math.trunc(migratedState.syncRevision ?? 1));
  const stateToUpload: ErpState = {
    ...migratedState,
    syncRevision: nextRevision,
    lastUpdatedAt: migratedState.lastUpdatedAt || new Date().toISOString(),
    lastUpdatedBy: migratedState.lastUpdatedBy || 'LocalStorage Migration',
  };

  const batchResult = await saveStateToFirestoreBatch({
    state: stateToUpload,
    user: params.user,
    workspace: params.workspace,
    syncRevision: nextRevision,
    localBaseRevision: 0,
    originClientId: params.originClientId,
    forceAll: true,
  });

  try {
    // Mark migration complete while leaving STATIC_STATE_KEY untouched as backup
    window.localStorage.setItem(FIRESTORE_MIGRATED_KEY, 'true');
  } catch {
    // ignore storage restriction
  }

  if (batchResult.abortedReason === 'stale-revision') {
    return { migrated: false };
  }

  return {
    migrated: true,
    state: stateToUpload,
    docIds: batchResult.docIds,
    sectionHashes: batchResult.sectionHashes,
    businessJson: batchResult.businessJson,
    syncRevision: nextRevision,
  };
}

/**
 * Subscribes to rinse_state via modular onSnapshot for live multi-user sync.
 * Never seeds demo or default data if Firestore is empty.
 */
export function subscribeRinseState(params: {
  user: User;
  workspace: WorkspaceContext;
  onSnapshotState: (snapshot: RemoteStateSnapshot) => void;
  onEmpty: () => void;
  onError: (err: Error) => void;
}): Unsubscribe {
  const { user, workspace, onSnapshotState, onEmpty, onError } = params;
  const colRef = collection(db, RINSE_STATE_COLLECTION);
  const q = workspace.isBootstrappedAdmin
    ? colRef
    : query(colRef, where('memberUids', 'array-contains', user.uid));

  return onSnapshot(
    q,
    (querySnapshot) => {
      if (querySnapshot.empty) {
        onEmpty();
        return;
      }
      const rawDocs = querySnapshot.docs.map((d) => ({
        id: d.id,
        data: d.data() as Record<string, unknown>,
      }));
      const assembled = assembleErpStateFromDocs(rawDocs);
      if (!assembled) {
        onEmpty();
        return;
      }
      onSnapshotState({
        ...assembled,
        fromCache: querySnapshot.metadata.fromCache,
      });
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, RINSE_STATE_COLLECTION);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  );
}

export async function listWorkspaceInvites(user: User, isBootstrappedAdmin: boolean): Promise<WorkspaceInviteRecord[]> {
  try {
    const q = isBootstrappedAdmin
      ? collection(db, INVITES_COLLECTION)
      : query(collection(db, INVITES_COLLECTION), where('invitedByUid', '==', user.uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => {
      const data = d.data();
      return {
        email: String(data.email || d.id),
        invitedByUid: String(data.invitedByUid || ''),
        roleNote: String(data.roleNote || ''),
      };
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, INVITES_COLLECTION);
  }
}

export async function inviteTeamEmail(params: {
  email: string;
  roleNote: string;
  invitedByUser: User;
}): Promise<void> {
  const normalized = params.email.trim().toLowerCase();
  const path = `${INVITES_COLLECTION}/${normalized}`;
  try {
    await setDoc(doc(db, INVITES_COLLECTION, normalized), {
      email: normalized,
      invitedByUid: params.invitedByUser.uid,
      roleNote: params.roleNote.trim().slice(0, 80) || 'Staff',
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function revokeTeamInvite(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const path = `${INVITES_COLLECTION}/${normalized}`;
  try {
    await deleteDoc(doc(db, INVITES_COLLECTION, normalized));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

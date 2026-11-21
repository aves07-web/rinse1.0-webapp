import {
  collection,
  deleteDoc,
  doc,
  getDocsFromServer,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { INITIAL_ERP_STATE } from '../data/seedData';
import { db, handleFirestoreError, OperationType, type FirestoreErrorInfo } from '../firebase';
import { ErpState, OnlinePresenceUser, UserRole } from '../types/erp';
import { migrateErpState } from './migration';

export const RINSE_STATE_COLLECTION = 'rinse_state';
export const RINSE_PRESENCE_COLLECTION = 'rinse_presence';

const MAX_SAFE_DOC_BYTES = 820_000; // Leave headroom under Firestore's 1,048,576 byte limit

export type ErpSliceId =
  | 'meta'
  | 'config'
  | 'catalogue'
  | 'opening_balance'
  | 'customers'
  | 'orders'
  | 'corporate'
  | 'inventory'
  | 'accounting'
  | 'invoices'
  | 'operations'
  | 'audit';

export const ALL_SLICE_IDS: ErpSliceId[] = [
  'meta',
  'config',
  'catalogue',
  'opening_balance',
  'customers',
  'orders',
  'corporate',
  'inventory',
  'accounting',
  'invoices',
  'operations',
  'audit',
];

/**
 * Recursively strips `undefined` object keys and normalizes non-finite numbers
 * so Firestore never rejects a document payload.
 */
export function sanitizeForFirestore<T>(value: T): T {
  if (value === undefined || value === null) {
    return null as T;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : sanitizeForFirestore(item))) as T;
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val !== undefined) {
        out[key] = sanitizeForFirestore(val);
      }
    }
    return out as T;
  }
  return value;
}

export interface SerializedSlice {
  data: Record<string, unknown>;
  json: string;
}

export function extractSlicePayloads(state: ErpState): Record<ErpSliceId, SerializedSlice> {
  const build = (raw: Record<string, unknown>): SerializedSlice => {
    const sanitized = sanitizeForFirestore(raw);
    return {
      data: sanitized,
      json: JSON.stringify(sanitized),
    };
  };

  // Size-guard invoices: if duplicated base64 logo snapshots push invoices near 1 MiB,
  // drop redundant logo snapshots on older invoices (A4InvoiceDocument falls back to settings logo).
  let invoices = state.invoices;
  let invoicesSlice = build({ invoices });
  if (invoicesSlice.json.length > MAX_SAFE_DOC_BYTES && invoices.length > 5) {
    invoices = invoices.map((inv, idx) =>
      idx < 5
        ? inv
        : {
            ...inv,
            logoSnapshotDataUrl: undefined,
          }
    );
    invoicesSlice = build({ invoices });
  }

  // Size-guard blackBox audit log so it always remains well below 1 MiB
  let blackBox = state.blackBox;
  let auditSlice = build({ blackBox });
  while (auditSlice.json.length > MAX_SAFE_DOC_BYTES && blackBox.length > 50) {
    blackBox = blackBox.slice(0, Math.floor(blackBox.length * 0.75));
    auditSlice = build({ blackBox });
  }

  return {
    meta: build({
      schemaVersion: state.schemaVersion ?? 2,
      syncRevision: state.syncRevision ?? 1,
      lastUpdatedAt: state.lastUpdatedAt ?? new Date().toISOString(),
      lastUpdatedBy: state.lastUpdatedBy ?? 'System',
      openingBalancePromptDismissed: state.openingBalancePromptDismissed ?? false,
    }),
    config: build({
      settings: state.settings,
      idFormats: state.idFormats,
      users: state.users,
      rolePermissions: state.rolePermissions,
      deliveryOptions: state.deliveryOptions,
      categories: state.categories,
      notificationRules: state.notificationRules,
    }),
    catalogue: build({
      products: state.products,
      services: state.services,
      prices: state.prices,
      customerCustomPrices: state.customerCustomPrices,
    }),
    opening_balance: build({
      openingBalance: state.openingBalance,
    }),
    customers: build({
      customers: state.customers,
    }),
    orders: build({
      orders: state.orders,
    }),
    corporate: build({
      corporateCustomers: state.corporateCustomers,
      corporateMovements: state.corporateMovements,
    }),
    inventory: build({
      suppliers: state.suppliers,
      chemicals: state.chemicals,
      stockMovements: state.stockMovements,
    }),
    accounting: build({
      accounts: state.accounts,
      journalEntries: state.journalEntries,
    }),
    invoices: invoicesSlice,
    operations: build({
      employees: state.employees,
      payrollRecords: state.payrollRecords,
      expenses: state.expenses,
      tasks: state.tasks,
      notifications: state.notifications,
    }),
    audit: auditSlice,
  };
}

function stripFirestoreEnvelope(rawDoc: Record<string, unknown>): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawDoc)) {
    if (k === 'originClientId' || k === 'updatedAt') continue;
    cleaned[k] = v;
  }
  return cleaned;
}

export async function writeErpStateSlicesToFirestore(params: {
  state: ErpState;
  lastSyncedJson: Partial<Record<ErpSliceId, string>>;
  baseRevision?: number;
  clientId: string;
  updatedBy: string;
  forceAll?: boolean;
  onBeforeCommit?: (pendingSliceJson: Partial<Record<ErpSliceId, string>>) => void;
}): Promise<{
  committed: boolean;
  revision: number;
  updatedSliceJson: Partial<Record<ErpSliceId, string>>;
}> {
  const {
    state,
    lastSyncedJson,
    baseRevision = 1,
    clientId,
    updatedBy,
    forceAll = false,
    onBeforeCommit,
  } = params;
  const nowIso = new Date().toISOString();
  const nextRevision = Math.max(1, Math.max(state.syncRevision ?? 1, baseRevision) + 1);

  const candidateState: ErpState = {
    ...state,
    syncRevision: nextRevision,
    lastUpdatedAt: nowIso,
    lastUpdatedBy: updatedBy,
  };

  const payloads = extractSlicePayloads(candidateState);
  const dirtySlices: ErpSliceId[] = [];

  for (const sliceId of ALL_SLICE_IDS) {
    if (sliceId === 'meta') continue;
    if (forceAll || payloads[sliceId].json !== lastSyncedJson[sliceId]) {
      dirtySlices.push(sliceId);
    }
  }

  // If no domain slice changed and not forced, check if meta fields (e.g. prompt dismissed) changed
  const prevMeta = lastSyncedJson.meta;
  const metaOnlyBase = extractSlicePayloads(state).meta;
  if (dirtySlices.length === 0 && !forceAll && metaOnlyBase.json === prevMeta) {
    return { committed: false, revision: state.syncRevision ?? 1, updatedSliceJson: {} };
  }

  dirtySlices.push('meta');

  const batch = writeBatch(db);
  const updatedSliceJson: Partial<Record<ErpSliceId, string>> = {};

  for (const sliceId of dirtySlices) {
    const ref = doc(db, RINSE_STATE_COLLECTION, sliceId);
    batch.set(ref, {
      ...payloads[sliceId].data,
      originClientId: clientId,
      updatedAt: serverTimestamp(),
    });
    updatedSliceJson[sliceId] = payloads[sliceId].json;
  }

  onBeforeCommit?.(updatedSliceJson);

  try {
    await batch.commit();
    return {
      committed: true,
      revision: nextRevision,
      updatedSliceJson,
    };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, RINSE_STATE_COLLECTION);
    throw error;
  }
}

export async function seedFirestoreIfEmpty(params: {
  seedState: ErpState;
  clientId: string;
  updatedBy: string;
}): Promise<{
  seeded: boolean;
  sliceJson: Partial<Record<ErpSliceId, string>>;
}> {
  const colRef = collection(db, RINSE_STATE_COLLECTION);
  try {
    const serverSnap = await getDocsFromServer(colRef);
    if (!serverSnap.empty) {
      return { seeded: false, sliceJson: {} };
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, RINSE_STATE_COLLECTION);
    throw error;
  }

  const migrated = migrateErpState(params.seedState);
  const result = await writeErpStateSlicesToFirestore({
    state: migrated,
    lastSyncedJson: {},
    clientId: params.clientId,
    updatedBy: params.updatedBy,
    forceAll: true,
  });

  return {
    seeded: result.committed,
    sliceJson: result.updatedSliceJson,
  };
}

export interface SubscribeErpOptions {
  clientId: string;
  getLastSyncedJson: () => Partial<Record<ErpSliceId, string>>;
  onRemoteState: (
    nextState: ErpState,
    sliceJson: Partial<Record<ErpSliceId, string>>,
    meta: { fromCache: boolean; updatedBy?: string }
  ) => void;
  onEmptyDatabase: () => void;
  onError: (info: FirestoreErrorInfo) => void;
}

export function subscribeToErpState(options: SubscribeErpOptions): Unsubscribe {
  const colRef = collection(db, RINSE_STATE_COLLECTION);

  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        if (!snapshot.metadata.fromCache) {
          options.onEmptyDatabase();
        }
        return;
      }

      // Skip purely local optimistic pending echoes created by this exact tab
      if (snapshot.metadata.hasPendingWrites) {
        const changes = snapshot.docChanges();
        const allFromSelf =
          changes.length > 0 &&
          changes.every((chg) => chg.doc.data()?.originClientId === options.clientId);
        if (allFromSelf) {
          return;
        }
      }

      const mergedRaw: Record<string, unknown> = {};
      const incomingSliceJson: Partial<Record<ErpSliceId, string>> = {};
      const lastSynced = options.getLastSyncedJson();
      let hasRemoteDiff = false;
      let updatedBy: string | undefined;

      for (const docSnap of snapshot.docs) {
        const sliceId = docSnap.id as ErpSliceId;
        const rawData = docSnap.data() as Record<string, unknown>;
        const cleanData = stripFirestoreEnvelope(rawData);
        const json = JSON.stringify(sanitizeForFirestore(cleanData));

        if (ALL_SLICE_IDS.includes(sliceId)) {
          incomingSliceJson[sliceId] = json;
          if (lastSynced[sliceId] !== json) {
            hasRemoteDiff = true;
          }
        }
        if (sliceId === 'meta' && typeof cleanData.lastUpdatedBy === 'string') {
          updatedBy = cleanData.lastUpdatedBy;
        }
        Object.assign(mergedRaw, cleanData);
      }

      if (!hasRemoteDiff && Object.keys(lastSynced).length > 0) {
        return;
      }

      const migrated = migrateErpState(mergedRaw as Partial<ErpState>);
      // Ensure we always store canonical slice JSON back so our next local diff won't spuriously re-write
      const canonicalPayloads = extractSlicePayloads(migrated);
      const syncedMap: Partial<Record<ErpSliceId, string>> = {};
      for (const sliceId of ALL_SLICE_IDS) {
        syncedMap[sliceId] = incomingSliceJson[sliceId] ?? canonicalPayloads[sliceId].json;
      }

      options.onRemoteState(migrated, syncedMap, {
        fromCache: snapshot.metadata.fromCache,
        updatedBy,
      });
    },
    (error) => {
      const info = handleFirestoreError(error, OperationType.LIST, RINSE_STATE_COLLECTION);
      options.onError(info);
    }
  );
}

export async function publishPresenceToFirestore(params: {
  clientId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  connectedAt: string;
}): Promise<void> {
  try {
    const batch = writeBatch(db);
    const ref = doc(db, RINSE_PRESENCE_COLLECTION, params.clientId);
    batch.set(ref, {
      clientId: params.clientId,
      userId: params.userId,
      displayName: params.displayName,
      role: params.role,
      connectedAt: params.connectedAt,
      lastSeenMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch {
    // Presence is best-effort and must never disrupt ERP operations
  }
}

export async function removePresenceFromFirestore(clientId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, RINSE_PRESENCE_COLLECTION, clientId));
  } catch {
    // Best-effort cleanup
  }
}

export function subscribeToPresence(
  onUsers: (users: OnlinePresenceUser[]) => void
): Unsubscribe {
  const colRef = collection(db, RINSE_PRESENCE_COLLECTION);
  return onSnapshot(
    colRef,
    (snapshot) => {
      const cutoffMs = Date.now() - 3 * 60 * 1000; // active within last 3 minutes
      const users: OnlinePresenceUser[] = [];
      for (const docSnap of snapshot.docs) {
        const d = docSnap.data() as Partial<OnlinePresenceUser> & { lastSeenMs?: number };
        if (!d.clientId || !d.displayName || !d.role) continue;
        if (typeof d.lastSeenMs === 'number' && d.lastSeenMs < cutoffMs) continue;
        users.push({
          clientId: d.clientId,
          userId: d.userId || d.clientId,
          displayName: d.displayName,
          role: d.role,
          connectedAt: d.connectedAt || new Date().toISOString(),
        });
      }
      onUsers(users);
    },
    () => {
      // Presence subscription errors are non-fatal
    }
  );
}

export function getInitialSeedCandidate(): ErpState {
  return migrateErpState(INITIAL_ERP_STATE);
}

import {
  ErpState,
  IdDateToken,
  IdFormatKey,
  IdFormatRule,
} from '../types/erp';

export const DEFAULT_ID_FORMATS: Record<IdFormatKey, IdFormatRule> = {
  customer: {
    key: 'customer',
    label: 'Retail Customer ID',
    prefix: 'CUS',
    separator: '-',
    padding: 4,
    nextNumber: 1,
    dateToken: 'NONE',
  },
  retailOrder: {
    key: 'retailOrder',
    label: 'Retail Order Number',
    prefix: 'ORD',
    separator: '-',
    padding: 4,
    nextNumber: 1,
    dateToken: 'NONE',
  },
  corporateOrder: {
    key: 'corporateOrder',
    label: 'Corporate Order / Batch ID',
    prefix: 'CORD',
    separator: '-',
    padding: 4,
    nextNumber: 1,
    dateToken: 'NONE',
  },
  retailInvoice: {
    key: 'retailInvoice',
    label: 'Retail Invoice Number',
    prefix: 'INV',
    separator: '-',
    padding: 4,
    nextNumber: 1,
    dateToken: 'NONE',
  },
  corporateInvoice: {
    key: 'corporateInvoice',
    label: 'Corporate Invoice ID',
    prefix: 'CINV',
    separator: '-',
    padding: 4,
    nextNumber: 1,
    dateToken: 'NONE',
  },
};

export function formatDateToken(token: IdDateToken, date = new Date()): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, '0');
  if (token === 'YYYY') return year;
  if (token === 'YYYY-MM') return `${year}-${month}`;
  if (token === 'YYMM') return `${year.slice(-2)}${month}`;
  return '';
}

export function formatSmartId(rule: IdFormatRule, num: number, date = new Date()): string {
  const safePrefix = (rule.prefix || '').trim();
  const sep = rule.separator ?? '-';
  const pad = Math.max(1, Math.min(8, Number(rule.padding) || 4));
  const paddedNum = String(Math.max(1, Math.floor(num))).padStart(pad, '0');
  const datePart = formatDateToken(rule.dateToken || 'NONE', date);

  const segments: string[] = [];
  if (safePrefix) segments.push(safePrefix);
  if (datePart) segments.push(datePart);
  segments.push(paddedNum);

  return segments.join(sep);
}

export function getExistingIdsForType(state: ErpState, key: IdFormatKey): Set<string> {
  const set = new Set<string>();
  if (key === 'customer') {
    state.customers.forEach((c) => set.add(c.id.toLowerCase()));
    state.corporateCustomers.forEach((c) => set.add(c.id.toLowerCase()));
  } else if (key === 'retailOrder' || key === 'corporateOrder') {
    state.orders.forEach((o) => set.add(o.id.toLowerCase()));
    state.corporateMovements.forEach((m) => {
      if (m.orderId) set.add(m.orderId.toLowerCase());
    });
  } else if (key === 'retailInvoice' || key === 'corporateInvoice') {
    state.invoices.forEach((inv) => set.add(inv.id.toLowerCase()));
  }
  return set;
}

export function generateNextSmartId(
  state: ErpState,
  key: IdFormatKey,
  date = new Date()
): { id: string; usedNumber: number; nextCounter: number } {
  const rule = state.idFormats?.[key] || DEFAULT_ID_FORMATS[key];
  const existing = getExistingIdsForType(state, key);
  let num = Math.max(1, Math.floor(rule.nextNumber || 1));
  let candidate = formatSmartId(rule, num, date);
  let guard = 0;
  while (existing.has(candidate.toLowerCase()) && guard < 10000) {
    num += 1;
    candidate = formatSmartId(rule, num, date);
    guard += 1;
  }
  return {
    id: candidate,
    usedNumber: num,
    nextCounter: num + 1,
  };
}

export interface CustomIdValidationResult {
  valid: boolean;
  cleanId: string;
  error?: string;
  matchedHigherNumber?: number;
}

export function validateCustomSmartId(
  rawInput: string,
  existingIds: Set<string>,
  rule: IdFormatRule,
  date = new Date()
): CustomIdValidationResult {
  const cleanId = rawInput.trim();
  if (!cleanId) {
    return { valid: false, cleanId, error: 'ID cannot be empty.' };
  }
  if (cleanId.length > 30) {
    return {
      valid: false,
      cleanId,
      error: 'ID must be at most 30 characters.',
    };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9\-_/]*$/.test(cleanId)) {
    return {
      valid: false,
      cleanId,
      error: 'Use only letters, numbers, "-", "_", or "/" (no spaces or special symbols).',
    };
  }
  if (existingIds.has(cleanId.toLowerCase())) {
    return {
      valid: false,
      cleanId,
      error: `Duplicate ID: "${cleanId}" is already in use.`,
    };
  }

  // Detect if the custom ID matches the configured pattern with a higher number
  const safePrefix = (rule.prefix || '').trim();
  const sep = rule.separator ?? '-';
  const datePart = formatDateToken(rule.dateToken || 'NONE', date);
  const baseSegments: string[] = [];
  if (safePrefix) baseSegments.push(safePrefix);
  if (datePart) baseSegments.push(datePart);
  const expectedStart = baseSegments.length > 0 ? `${baseSegments.join(sep)}${sep}` : '';

  let matchedHigherNumber: number | undefined;
  if (
    expectedStart &&
    cleanId.toUpperCase().startsWith(expectedStart.toUpperCase())
  ) {
    const tail = cleanId.slice(expectedStart.length);
    if (/^\d+$/.test(tail)) {
      const parsed = Number.parseInt(tail, 10);
      if (parsed >= rule.nextNumber) {
        matchedHigherNumber = parsed;
      }
    }
  } else if (!expectedStart && /^\d+$/.test(cleanId)) {
    const parsed = Number.parseInt(cleanId, 10);
    if (parsed >= rule.nextNumber) {
      matchedHigherNumber = parsed;
    }
  }

  return { valid: true, cleanId, matchedHigherNumber };
}

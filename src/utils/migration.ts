import { INITIAL_ERP_STATE } from '../data/seedData';
import { ErpState, NavSection, OpeningBalanceDraft } from '../types/erp';
import { inferMoneyChannel, isMoneySourceAccount } from './accounting';
import { DEFAULT_ID_FORMATS } from './smartId';

export const CORPORATE_BRAND_PALETTE = [
  '#0071E3', // Apple Blue
  '#7C3AED', // Indigo Violet
  '#0D9488', // Deep Teal
  '#D97706', // Warm Amber
  '#DB2777', // Berry Rose
  '#2563EB', // Cobalt
  '#059669', // Emerald
  '#EA580C', // Burnt Orange
];

export function getCorporateBrandColor(index: number, savedColor?: string): string {
  if (savedColor) return savedColor;
  return CORPORATE_BRAND_PALETTE[Math.abs(index) % CORPORATE_BRAND_PALETTE.length];
}

export function createDefaultOpeningBalanceDraft(base?: Partial<ErpState>): OpeningBalanceDraft {
  const today = new Date().toISOString().slice(0, 10);
  const accounts = base?.accounts || INITIAL_ERP_STATE.accounts;
  const customers = base?.customers || [];
  const corporateCustomers = base?.corporateCustomers || [];
  const suppliers = base?.suppliers || [];
  const chemicals = base?.chemicals || [];
  const employees = base?.employees || [];

  return {
    asOfDate: today,
    status: 'not_started',
    cashAndBanks: accounts
      .filter(isMoneySourceAccount)
      .map((a) => ({
        accountCode: a.code,
        accountName: a.name,
        balance: 0,
        channel: a.channel || inferMoneyChannel(a.name),
        maintain: a.active !== false,
        walletType: a.walletType || '',
        cashOutChargePercent: a.cashOutChargePercent || 0,
        cashOutChargeFlat: a.cashOutChargeFlat || 0,
      })),
    retailDues: customers
      .filter((c) => c.outstandingBalance > 0)
      .map((c) => ({ customerId: c.id, customerName: c.name, amount: c.outstandingBalance })),
    corporateDues: corporateCustomers
      .filter((c) => c.outstandingBalance > 0)
      .map((c) => ({ corporateId: c.id, corporateName: c.name, amount: c.outstandingBalance })),
    corporatePendingItems: [],
    customerAdvances: customers
      .filter((c) => c.advanceBalance > 0)
      .map((c) => ({ customerId: c.id, customerName: c.name, amount: c.advanceBalance })),
    supplierDues: suppliers
      .filter((s) => s.dueBalance > 0)
      .map((s) => ({ supplierId: s.id, supplierName: s.name, amount: s.dueBalance })),
    chemicalStocks: chemicals.map((ch) => ({
      chemicalId: ch.id,
      name: ch.name,
      unit: ch.unit,
      qty: ch.currentQty,
      unitCost: ch.purchaseCost,
    })),
    loansAndLiabilities: [],
    otherAssets: [],
    ownerCapitalAmount: 0,
    employeeBalances: employees.map((e) => ({
      employeeId: e.id,
      name: e.name,
      salaryDue: e.salaryDue,
      advanceGiven: e.advanceBalance,
    })),
    pendingRetailOrders: [],
    lastIds: {
      customerLastNum: 0,
      retailOrderLastNum: 0,
      corporateOrderLastNum: 0,
      retailInvoiceLastNum: 0,
      corporateInvoiceLastNum: 0,
    },
  };
}

export function migrateErpState(raw: Partial<ErpState> | null | undefined): ErpState {
  if (!raw || !raw.settings || !Array.isArray(raw.accounts)) {
    return INITIAL_ERP_STATE;
  }

  const migratedCorp = (raw.corporateCustomers || INITIAL_ERP_STATE.corporateCustomers).map(
    (corp, idx) => ({
      ...corp,
      brandColor: getCorporateBrandColor(idx, corp.brandColor),
    })
  );

  const migratedRolePerms = {
    ...INITIAL_ERP_STATE.rolePermissions,
    ...(raw.rolePermissions || {}),
  };

  // Ensure Owner always has all sections including analytics & opening-balance
  const ownerSections = new Set<NavSection>(
    migratedRolePerms.Owner?.visibleSections || INITIAL_ERP_STATE.rolePermissions.Owner.visibleSections
  );
  ownerSections.add('analytics');
  ownerSections.add('opening-balance');
  migratedRolePerms.Owner = {
    ...INITIAL_ERP_STATE.rolePermissions.Owner,
    ...(migratedRolePerms.Owner || {}),
    visibleSections: Array.from(ownerSections),
  };

  // For v1 databases upgrading to v2, give Manager access to Analytics & Opening Balance automatically
  if (!raw.schemaVersion || raw.schemaVersion < 2) {
    const mgrSections = new Set<NavSection>(
      (migratedRolePerms.Manager?.visibleSections || []).filter((s) => s !== 'blackbox')
    );
    mgrSections.add('analytics');
    mgrSections.add('opening-balance');
    migratedRolePerms.Manager = {
      ...INITIAL_ERP_STATE.rolePermissions.Manager,
      ...(migratedRolePerms.Manager || {}),
      visibleSections: Array.from(mgrSections),
    };
  }

  // Ensure standard equipment/other asset, opening equity & sudden adjustment offset accounts exist
  const accounts = raw.accounts.map((acc) =>
    acc.type === 'Asset' && (acc.code.startsWith('10') || acc.channel)
      ? { ...acc, channel: acc.channel || inferMoneyChannel(acc.name) }
      : acc
  );
  if (!accounts.some((a) => a.code === '1300')) {
    accounts.push({
      code: '1300',
      name: 'Machinery, Equipment & Deposits',
      type: 'Asset',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '1400')) {
    accounts.push({
      code: '1400',
      name: 'Staff Advances Receivable',
      type: 'Asset',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '2300')) {
    accounts.push({
      code: '2300',
      name: 'Salaries & Wages Payable',
      type: 'Liability',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '3040')) {
    accounts.push({
      code: '3040',
      name: 'Opening Balance Equity',
      type: 'Equity',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '4090')) {
    accounts.push({
      code: '4090',
      name: 'Other / Sudden Inflows',
      type: 'Revenue',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '5080')) {
    accounts.push({
      code: '5080',
      name: 'Cash Shortage & Write-off',
      type: 'Expense',
      balance: 0,
      isSystem: true,
    });
  }
  if (!accounts.some((a) => a.code === '5090')) {
    accounts.push({
      code: '5090',
      name: 'Bank, Wallet & Sudden Charges',
      type: 'Expense',
      balance: 0,
      isSystem: true,
    });
  }

  return {
    ...INITIAL_ERP_STATE,
    ...raw,
    schemaVersion: 2,
    settings: {
      ...INITIAL_ERP_STATE.settings,
      ...raw.settings,
      companyLogoSize: raw.settings.companyLogoSize || 'Medium',
      showBrandNameWithLogo: raw.settings.showBrandNameWithLogo ?? true,
      appearanceTheme: raw.settings.appearanceTheme || 'colorful',
    },
    idFormats: {
      ...DEFAULT_ID_FORMATS,
      ...(raw.idFormats || {}),
    },
    openingBalance: raw.openingBalance
      ? {
          ...createDefaultOpeningBalanceDraft(raw),
          ...raw.openingBalance,
        }
      : createDefaultOpeningBalanceDraft(raw),
    users: raw.users && raw.users.length > 0 ? raw.users : INITIAL_ERP_STATE.users,
    rolePermissions: migratedRolePerms,
    corporateCustomers: migratedCorp,
    accounts,
  };
}

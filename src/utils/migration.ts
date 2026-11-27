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

  const arr = <T,>(val: T[] | undefined | null, fallback: T[]): T[] =>
    Array.isArray(val) ? val : fallback;

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
      expenseCategories: arr(
        raw.settings.expenseCategories,
        INITIAL_ERP_STATE.settings.expenseCategories
      ),
      staffRoles: arr(
        raw.settings.staffRoles,
        INITIAL_ERP_STATE.settings.staffRoles || []
      ),
      quantityDiscountRules: arr(
        raw.settings.quantityDiscountRules,
        INITIAL_ERP_STATE.settings.quantityDiscountRules || []
      ),
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
    categories: arr(raw.categories, INITIAL_ERP_STATE.categories),
    customers: arr(raw.customers, INITIAL_ERP_STATE.customers),
    products: arr(raw.products, INITIAL_ERP_STATE.products),
    services: arr(raw.services, INITIAL_ERP_STATE.services),
    prices: arr(raw.prices, INITIAL_ERP_STATE.prices),
    customerCustomPrices: arr(raw.customerCustomPrices, INITIAL_ERP_STATE.customerCustomPrices),
    deliveryOptions: arr(raw.deliveryOptions, INITIAL_ERP_STATE.deliveryOptions),
    orders: arr(raw.orders, INITIAL_ERP_STATE.orders),
    corporateCustomers: migratedCorp,
    corporateMovements: arr(raw.corporateMovements, INITIAL_ERP_STATE.corporateMovements),
    corporateRewashRecords: arr(
      raw.corporateRewashRecords,
      INITIAL_ERP_STATE.corporateRewashRecords
    ),
    suppliers: arr(raw.suppliers, INITIAL_ERP_STATE.suppliers),
    chemicals: arr(raw.chemicals, INITIAL_ERP_STATE.chemicals),
    stockMovements: arr(raw.stockMovements, INITIAL_ERP_STATE.stockMovements),
    accounts,
    journalEntries: arr(raw.journalEntries, INITIAL_ERP_STATE.journalEntries),
    employees: arr(raw.employees, INITIAL_ERP_STATE.employees),
    payrollRecords: arr(raw.payrollRecords, INITIAL_ERP_STATE.payrollRecords),
    staffFines: arr(raw.staffFines, INITIAL_ERP_STATE.staffFines),
    expenses: arr(raw.expenses, INITIAL_ERP_STATE.expenses),
    invoices: arr(raw.invoices, INITIAL_ERP_STATE.invoices),
    tasks: arr(raw.tasks, INITIAL_ERP_STATE.tasks),
    notifications: arr(raw.notifications, INITIAL_ERP_STATE.notifications),
    notificationRules: arr(raw.notificationRules, INITIAL_ERP_STATE.notificationRules),
    blackBox: arr(raw.blackBox, INITIAL_ERP_STATE.blackBox),
    users: (() => {
      const rawUsers = arr(raw.users, []);
      if (rawUsers.length === 0) return INITIAL_ERP_STATE.users;
      return rawUsers.map((u) =>
        u.role === 'Owner' && u.id.toLowerCase() === 'owner' && u.password === 'owner123'
          ? { ...u, id: 'Ankonbabu', password: 'Alpha995' }
          : u
      );
    })(),
    rolePermissions: migratedRolePerms,
  };
}

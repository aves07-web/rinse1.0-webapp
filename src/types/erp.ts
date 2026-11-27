export type UserRole = 'Owner' | 'Manager' | 'Counter Staff' | 'Floor Operator';

export type OrderStage =
  | 'New order'
  | 'Not yet received'
  | 'Received'
  | 'Processing'
  | 'Ready to deliver'
  | 'Delivered';

export type BillingBasis = 'Received-wise' | 'Delivered-wise';
export type BillingCycle = 'Daily' | 'Weekly' | 'Monthly' | 'Fixed-date' | 'Custom';

export interface CustomerCategory {
  id: string;
  name: string;
  color: string;
  defaultDiscountPct: number;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  altPhone?: string;
  address: string;
  email?: string;
  categoryId: string;
  registeredAt: string;
  notes: string;
  outstandingBalance: number;
  advanceBalance: number;
  active?: boolean;
}

export interface Product {
  id: string;
  name: string;
  type: string;
  active: boolean;
}

export interface Service {
  id: string;
  name: string;
  active: boolean;
}

export interface PriceEntry {
  id: string;
  productId: string;
  serviceId: string;
  price: number;
}

export interface CustomerCustomPrice {
  id: string;
  customerId: string;
  productId: string;
  serviceId: string;
  price: number;
}

export interface DeliveryOption {
  id: string;
  name: string;
  targetHours: number;
  multiplier: number;
  surchargeFlat: number;
  active: boolean;
}

export interface OrderStageEvent {
  stage: OrderStage;
  timestamp: string;
  user: string;
  note?: string;
}

export interface OrderException {
  id: string;
  type: 'Rewash' | 'Damaged' | 'Missing' | 'Rejected' | 'Returned';
  lineId: string;
  productName: string;
  serviceName: string;
  qty: number;
  reason: string;
  date: string;
  resolved: boolean;
}

export interface OrderLine {
  id: string;
  productId: string;
  productName: string;
  serviceId: string;
  serviceName: string;
  quantityOrdered: number;
  quantityReceived: number;
  quantityDelivered: number;
  quantityRewash: number;
  unitPrice: number;
  discount: number;
  isExtraCharge?: boolean;
  includeInOrderTotal?: boolean;
}

export type MoneySourceChannel = 'Cash' | 'Bank' | 'E-Wallet' | 'Other';

export interface PaymentSplit {
  accountCode: string;
  accountName?: string;
  amount: number;
}

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  createdAt: string;
  expectedDeliveryAt: string;
  deliveryOptionId: string;
  deliveryOptionName: string;
  stage: OrderStage;
  physicallyReceived: boolean;
  stageHistory: OrderStageEvent[];
  lines: OrderLine[];
  exceptions: OrderException[];
  orderDiscount: number;
  additionalCharge: number;
  additionalChargeLabel?: string;
  addAdditionalToOrder: boolean;
  totalAmount: number;
  paidAmount: number;
  paymentSplits?: PaymentSplit[];
  notes: string;
  invoiceId?: string;
  isOpening?: boolean;
}

export interface CorporateCustomer {
  id: string;
  name: string;
  contactPerson: string;
  phone: string;
  address: string;
  billingBasis: BillingBasis;
  billingCycle: BillingCycle;
  cutoffDayOrTime: string;
  discountPct: number;
  outstandingBalance: number;
  advanceBalance: number;
  registeredAt: string;
  notes: string;
  brandColor?: string;
  active?: boolean;
  products: Product[];
  services: Service[];
  prices: PriceEntry[];
}

export type CorporateMovementType =
  | 'Received'
  | 'Delivered'
  | 'Returned'
  | 'Rewash'
  | 'Damaged'
  | 'Missing'
  | 'Adjustment';

export interface CorporateMovement {
  id: string;
  orderId?: string;
  corporateId: string;
  date: string;
  event: CorporateMovementType;
  productId: string;
  productName: string;
  serviceId: string;
  serviceName: string;
  qtyDelta: number; // + for received/adjustment+, - for delivered/returned
  pendingAfter: number;
  unitPriceSnapshot: number;
  billedQty: number;
  reason?: string;
  invoiceId?: string;
  user: string;
  isOpening?: boolean;
}

export type RewashStatus = 'Pending' | 'In Rewash' | 'Completed';

export interface CorporateRewashRecord {
  id: string;
  corporateId: string;
  itemName: string;
  category?: string;
  serviceName?: string;
  quantity: number;
  originalOrderRef?: string;
  originalInvoiceRef?: string;
  reason: string;
  loggedDate: string;
  status: RewashStatus;
  loggedBy: string;
  updatedAt?: string;
}

export interface Supplier {
  id: string;
  name: string;
  phone: string;
  address: string;
  suppliedProducts: string;
  dueBalance: number;
  active?: boolean;
}

export interface ChemicalItem {
  id: string;
  name: string;
  category: string;
  supplierId: string;
  unit: string; // kg, litre, bottle, pack
  purchaseCost: number;
  currentQty: number;
  lowStockThreshold: number;
  batchNumber: string;
  expiryDate: string;
  active?: boolean;
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  date: string;
  type: 'Received' | 'Issued' | 'Consumed' | 'Returned' | 'Damaged' | 'Adjusted';
  qty: number;
  unitCost: number;
  reason: string;
  reference: string;
  paymentType?: 'Cash' | 'Bank' | 'Credit';
  paymentAccountCode?: string;
}

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  balance: number; // natural sign: positive = normal balance
  isSystem?: boolean;
  channel?: MoneySourceChannel;
  walletType?: string;
  cashOutChargePercent?: number;
  cashOutChargeFlat?: number;
  active?: boolean;
}

export interface JournalLine {
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  date: string;
  reference: string;
  description: string;
  category:
    | 'Sales'
    | 'Collection'
    | 'Advance'
    | 'Purchase'
    | 'Supplier Payment'
    | 'Expense'
    | 'Payroll'
    | 'Owner Draw'
    | 'Owner Capital'
    | 'Loan'
    | 'Transfer'
    | 'Sudden Adjustment'
    | 'Reversal'
    | 'Opening Balance'
    | 'Opening Adjustment';
  lines: JournalLine[];
  reversedByEntryId?: string;
  reversesEntryId?: string;
  createdBy: string;
  isOpening?: boolean;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  phone: string;
  payType: 'Monthly Salary' | 'Daily Wage';
  baseRate: number;
  customPayTerms?: string;
  advanceBalance: number;
  salaryDue: number;
  active: boolean;
}

export interface StaffFineRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  amount: number;
  reason: string;
  date: string;
  createdBy: string;
  status: 'Active' | 'Waived';
  waivedReason?: string;
  waivedAt?: string;
}

export interface PayrollRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;
  type: 'Salary' | 'Wage' | 'Overtime' | 'Bonus' | 'Advance' | 'Deduction';
  grossAmount: number;
  deductionAmount: number;
  netPaid: number;
  paymentAccountCode: string;
  note: string;
}

export interface ExpenseRecord {
  id: string;
  date: string;
  category: string;
  amount: number;
  paymentAccountCode: string;
  description: string;
  reference: string;
  recurring: boolean;
  recurrenceCycle?: 'Weekly' | 'Monthly';
  nextDueDate?: string;
  isOpening?: boolean;
}

export interface InvoiceLineSnapshot {
  productName: string;
  serviceName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
}

export interface Invoice {
  id: string;
  orderId?: string;
  corporateId?: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  isCorporate: boolean;
  billingBasis?: BillingBasis;
  periodCovered?: string;
  issuedAt: string;
  dueDate: string;
  lines: InvoiceLineSnapshot[];
  subtotal: number;
  discountTotal: number;
  extraCharges: number;
  grandTotal: number;
  paidAmount: number;
  dueAmount: number;
  paymentTerms: string;
  paymentMode?: string;
  termsAndConditions: string;
  reprintCount: number;
  updatedAt?: string;
  isOpening?: boolean;
  logoSnapshotDataUrl?: string;
  logoSizeSnapshot?: LogoSizePreset;
  showBrandNameSnapshot?: boolean;
  companyNameSnapshot?: string;
  companyAddressSnapshot?: string;
  companyPhoneSnapshot?: string;
}

export interface ScheduledTask {
  id: string;
  title: string;
  description: string;
  category: 'Order Delivery' | 'Washing Cycle' | 'Corporate Billing' | 'Inventory Alert' | 'Expense Due' | 'Payroll' | 'General';
  priority: 'Low' | 'Normal' | 'High' | 'Urgent';
  status: 'Pending' | 'In Progress' | 'Completed';
  dueAt: string; // ISO string
  reminderMinutesBefore: number;
  linkedRecordId?: string;
  assignee: string;
  autoGenerated?: boolean;
  notified?: boolean;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent' | 'success';
  createdAt: string;
  read: boolean;
  ruleId?: string;
  linkedSection?: string;
  linkedRecordId?: string;
}

export interface NotificationRule {
  id: string;
  name: string;
  triggerType:
    | 'OrderDeliveryApproaching'
    | 'OrderOverdue'
    | 'LowChemicalStock'
    | 'ChemicalExpiringSoon'
    | 'CorporateBillingCutoff'
    | 'RecurringExpenseDue';
  leadMinutes: number;
  enabled: boolean;
  browserAlert: boolean;
}

export interface BlackBoxEvent {
  id: string;
  timestamp: string;
  user: string;
  role: UserRole;
  action: string;
  module: string;
  recordId: string;
  summary: string;
  beforeValue?: unknown;
  afterValue?: unknown;
  integrityHash: string;
}

export type LogoSizePreset = 'Small' | 'Medium' | 'Large';
export type AppearanceTheme = 'classic-blue' | 'colorful' | 'calm';

export interface QuantityDiscountRule {
  id: string;
  name: string;
  minQuantity: number;
  discountType: 'percent' | 'amount';
  discountValue: number;
  productCategory?: string;
  active: boolean;
}

export interface AppSettings {
  companyName: string;
  companyTagline: string;
  companyAddress: string;
  companyPhone: string;
  companyLogoDataUrl?: string;
  companyLogoMimeType?: string;
  companyLogoSize?: LogoSizePreset;
  showBrandNameWithLogo?: boolean;
  appearanceTheme?: AppearanceTheme;
  currencyCode: string;
  currencySymbol: string;
  customerIdPrefix: string;
  orderIdPrefix: string;
  invoiceTerms: string;
  tokenWidthMm: number;
  tokenHeightMm: number;
  tokenShowQr: boolean;
  tokenCustomFooter: string;
  expenseCategories: string[];
  staffRoles?: string[];
  quantityDiscountRules?: QuantityDiscountRule[];
  lanModeEnabled: boolean;
  autoBackupEnabled: boolean;
  lastBackupAt?: string;
}

export type NavSection =
  | 'dashboard'
  | 'analytics'
  | 'tasks'
  | 'orders'
  | 'customers'
  | 'corporate'
  | 'catalogue'
  | 'inventory'
  | 'accounting'
  | 'opening-balance'
  | 'employees'
  | 'documents'
  | 'reports'
  | 'blackbox'
  | 'settings';

export type IdFormatKey =
  | 'customer'
  | 'retailOrder'
  | 'corporateOrder'
  | 'retailInvoice'
  | 'corporateInvoice';

export type IdSeparator = '-' | '/' | '';
export type IdDateToken = 'NONE' | 'YYYY' | 'YYYY-MM' | 'YYMM';

export interface IdFormatRule {
  key: IdFormatKey;
  label: string;
  prefix: string;
  separator: IdSeparator;
  padding: number;
  nextNumber: number;
  dateToken: IdDateToken;
}

export interface OpeningBalanceDraft {
  asOfDate: string;
  status: 'not_started' | 'draft' | 'finalized';
  finalizedAt?: string;
  finalizedJournalId?: string;
  cashAndBanks: Array<{
    accountCode: string;
    accountName: string;
    balance: number;
    channel?: MoneySourceChannel;
    maintain?: boolean;
    walletType?: string;
    cashOutChargePercent?: number;
    cashOutChargeFlat?: number;
  }>;
  retailDues: Array<{ customerId: string; customerName: string; amount: number }>;
  corporateDues: Array<{ corporateId: string; corporateName: string; amount: number }>;
  corporatePendingItems: Array<{
    id: string;
    corporateId: string;
    productId: string;
    serviceId: string;
    pendingQty: number;
    alreadyReceivedTotal: number;
    alreadyDeliveredTotal: number;
    alreadyBilledAmount: number;
  }>;
  customerAdvances: Array<{ customerId: string; customerName: string; amount: number }>;
  supplierDues: Array<{ supplierId: string; supplierName: string; amount: number }>;
  chemicalStocks: Array<{
    chemicalId: string;
    name: string;
    unit: string;
    qty: number;
    unitCost: number;
  }>;
  loansAndLiabilities: Array<{
    id: string;
    lenderOrName: string;
    accountCode: string;
    amount: number;
  }>;
  otherAssets: Array<{ id: string; name: string; value: number }>;
  ownerCapitalAmount: number;
  employeeBalances: Array<{
    employeeId: string;
    name: string;
    salaryDue: number;
    advanceGiven: number;
  }>;
  pendingRetailOrders: Array<{
    id: string;
    customerId: string;
    stage: OrderStage;
    pieceCount: number;
    estimatedValue: number;
    paidAmount: number;
  }>;
  lastIds: {
    customerLastNum: number;
    retailOrderLastNum: number;
    corporateOrderLastNum: number;
    retailInvoiceLastNum: number;
    corporateInvoiceLastNum: number;
  };
}

export interface UserAccount {
  id: string;
  displayName: string;
  password: string;
  role: UserRole;
  active: boolean;
  createdAt: string;
}

export interface RoleActionPermissions {
  canCreateOrders: boolean;
  canOverridePrices: boolean;
  canCollectPayments: boolean;
  canManageCorporate: boolean;
  canAdjustInventory: boolean;
  canPostAccounting: boolean;
  canManagePayrollExpenses: boolean;
  canManageTasks: boolean;
  canExportReports: boolean;
  canManageBackups: boolean;
}

export interface RolePermissionConfig {
  visibleSections: NavSection[];
  actions: RoleActionPermissions;
}

export interface OnlinePresenceUser {
  clientId: string;
  userId: string;
  displayName: string;
  role: UserRole;
  connectedAt: string;
}

export interface GitHubSyncStatus {
  oauthConfigured: boolean;
  envTokenConfigured: boolean;
  connected: boolean;
  githubUser?: {
    login: string;
    avatarUrl?: string;
    name?: string;
  };
  repoFullName?: string;
  repoPrivate?: boolean;
  branch: string;
  filePath: string;
  autoSync: boolean;
  syncing: boolean;
  lastSyncedAt?: string;
  lastSyncDirection?: 'push' | 'pull';
  lastCommitSha?: string;
  lastError?: string;
  callbackUrl: string;
}

export interface ErpState {
  schemaVersion?: number;
  syncRevision?: number;
  lastUpdatedAt?: string;
  lastUpdatedBy?: string;
  settings: AppSettings;
  idFormats: Record<IdFormatKey, IdFormatRule>;
  openingBalance: OpeningBalanceDraft;
  openingBalancePromptDismissed?: boolean;
  users: UserAccount[];
  rolePermissions: Record<UserRole, RolePermissionConfig>;
  categories: CustomerCategory[];
  customers: Customer[];
  products: Product[];
  services: Service[];
  prices: PriceEntry[];
  customerCustomPrices: CustomerCustomPrice[];
  deliveryOptions: DeliveryOption[];
  orders: Order[];
  corporateCustomers: CorporateCustomer[];
  corporateMovements: CorporateMovement[];
  corporateRewashRecords: CorporateRewashRecord[];
  suppliers: Supplier[];
  chemicals: ChemicalItem[];
  stockMovements: StockMovement[];
  accounts: Account[];
  journalEntries: JournalEntry[];
  employees: Employee[];
  payrollRecords: PayrollRecord[];
  staffFines: StaffFineRecord[];
  expenses: ExpenseRecord[];
  invoices: Invoice[];
  tasks: ScheduledTask[];
  notifications: NotificationItem[];
  notificationRules: NotificationRule[];
  blackBox: BlackBoxEvent[];
}

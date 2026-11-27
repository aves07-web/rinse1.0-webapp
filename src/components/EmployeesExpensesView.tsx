import { useEffect, useMemo, useState } from 'react';
import {
  Gavel,
  Pencil,
  Plus,
  Receipt,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { Employee, ErpState, ExpenseRecord, PayrollRecord, StaffFineRecord } from '../types/erp';
import { formatMoney, getMoneySourceAccounts, toDateInputValue } from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface EmployeesExpensesViewProps {
  state: ErpState;
  isOwner?: boolean;
  onAddEmployee: (emp: Omit<Employee, 'id' | 'advanceBalance' | 'salaryDue' | 'active'>) => void;
  onUpdateEmployee?: (
    empId: string,
    patch: Partial<
      Pick<Employee, 'name' | 'role' | 'phone' | 'payType' | 'baseRate' | 'customPayTerms' | 'active' | 'salaryDue'>
    >
  ) => void;
  onDeleteEmployee?: (empId: string) => void;
  onDeactivateEmployee?: (empId: string) => void;
  onAddStaffRole?: (roleName: string) => void;
  onRenameStaffRole?: (oldRole: string, newRole: string) => void;
  onDeleteStaffRole?: (roleName: string) => void;
  onApplyStaffFine?: (params: {
    employeeId: string;
    amount: number;
    reason: string;
    date?: string;
  }) => void;
  onToggleStaffFineStatus?: (fineId: string, waivedReason?: string) => void;
  onDeleteStaffFine?: (fineId: string) => void;
  onPostPayroll: (params: {
    employeeId: string;
    type: PayrollRecord['type'];
    grossAmount: number;
    deductionAmount: number;
    paymentAccountCode: string;
    note: string;
    date?: string;
  }) => void;
  onOwnerCustomizePayroll?: (
    recId: string,
    updated: {
      date: string;
      type: PayrollRecord['type'];
      grossAmount: number;
      deductionAmount: number;
      paymentAccountCode: string;
      note: string;
    }
  ) => void;
  onOwnerDeletePayroll?: (recId: string) => void;
  onPostExpense: (params: {
    category: string;
    amount: number;
    paymentAccountCode: string;
    description: string;
    reference: string;
    recurring: boolean;
    recurrenceCycle?: 'Weekly' | 'Monthly';
    date?: string;
  }) => void;
  onOwnerCustomizeExpense?: (
    expId: string,
    updated: {
      date: string;
      category: string;
      amount: number;
      paymentAccountCode: string;
      description: string;
      reference: string;
      recurring: boolean;
      recurrenceCycle?: 'Weekly' | 'Monthly';
    }
  ) => void;
  onOwnerDeleteExpense?: (expId: string) => void;
  onAddExpenseCategory: (category: string) => void;
  onRenameExpenseCategory?: (oldCategory: string, newCategory: string) => void;
  onDeleteExpenseCategory?: (category: string) => void;
  onGoToAccounting?: () => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function EmployeesExpensesView({
  state,
  isOwner = false,
  onAddEmployee,
  onUpdateEmployee,
  onDeleteEmployee,
  onDeactivateEmployee,
  onAddStaffRole,
  onRenameStaffRole,
  onDeleteStaffRole,
  onApplyStaffFine,
  onToggleStaffFineStatus,
  onDeleteStaffFine,
  onPostPayroll,
  onOwnerCustomizePayroll,
  onOwnerDeletePayroll,
  onPostExpense,
  onOwnerCustomizeExpense,
  onOwnerDeleteExpense,
  onAddExpenseCategory,
  onRenameExpenseCategory,
  onDeleteExpenseCategory,
  onGoToAccounting,
  onRequestDelete,
}: EmployeesExpensesViewProps) {
  const sym = state.settings.currencySymbol;
  const [subTab, setSubTab] = useState<'employees' | 'expenses'>('employees');

  const moneyAccounts = useMemo(() => getMoneySourceAccounts(state.accounts), [state.accounts]);
  const defaultPayrollCode =
    moneyAccounts.find((a) => a.channel === 'Bank')?.code || moneyAccounts[0]?.code || '1020';
  const defaultExpenseCode =
    moneyAccounts.find((a) => a.channel === 'Cash')?.code || moneyAccounts[0]?.code || '1010';

  // Payroll Form
  const [empId, setEmpId] = useState(state.employees[0]?.id || '');
  const [payType, setPayType] = useState<PayrollRecord['type']>('Salary');
  const [gross, setGross] = useState('');
  const [deduction, setDeduction] = useState('0');
  const [payAcc, setPayAcc] = useState(defaultPayrollCode);
  const [payDate, setPayDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [payNote, setPayNote] = useState('');

  // New Employee Form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpPayType, setNewEmpPayType] = useState<'Monthly Salary' | 'Daily Wage'>('Monthly Salary');
  const [newEmpRate, setNewEmpRate] = useState('');
  const [newEmpCustomTerms, setNewEmpCustomTerms] = useState('');

  // Custom Staff Roles Manager
  const [newRoleInput, setNewRoleInput] = useState('');
  const [editingRole, setEditingRole] = useState<string | null>(null);
  const [editingRoleValue, setEditingRoleValue] = useState('');

  // Instant Salary Fine Modal + Audit Log Filter
  const [fineModalOpen, setFineModalOpen] = useState(false);
  const [fineEmpId, setFineEmpId] = useState(state.employees[0]?.id || '');
  const [fineAmount, setFineAmount] = useState('');
  const [fineDate, setFineDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fineReason, setFineReason] = useState('');
  const [fineEmpFilter, setFineEmpFilter] = useState('ALL');
  const [fineStatusFilter, setFineStatusFilter] = useState<'ALL' | 'Active' | 'Waived'>('ALL');

  // Edit Staff Profile Modal
  const [editEmpTarget, setEditEmpTarget] = useState<Employee | null>(null);
  const [eeEmpName, setEeEmpName] = useState('');
  const [eeEmpRole, setEeEmpRole] = useState('');
  const [eeEmpPhone, setEeEmpPhone] = useState('');
  const [eeEmpPayType, setEeEmpPayType] = useState<'Monthly Salary' | 'Daily Wage'>('Monthly Salary');
  const [eeEmpRate, setEeEmpRate] = useState('');
  const [eeEmpTerms, setEeEmpTerms] = useState('');
  const [eeEmpSalaryDue, setEeEmpSalaryDue] = useState('0');
  const [eeEmpActive, setEeEmpActive] = useState(true);

  // Expense Form & Filters
  const [expCategory, setExpCategory] = useState(state.settings.expenseCategories[0] || 'Electricity');
  const [expAmount, setExpAmount] = useState('');
  const [expAcc, setExpAcc] = useState(defaultExpenseCode);
  const [expDate, setExpDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expDesc, setExpDesc] = useState('');
  const [expRef, setExpRef] = useState('');
  const [expRecurring, setExpRecurring] = useState(false);
  const [expCycle, setExpCycle] = useState<'Weekly' | 'Monthly'>('Monthly');
  const [newExpCategory, setNewExpCategory] = useState('');
  const [expSearch, setExpSearch] = useState('');
  const [expCatFilter, setExpCatFilter] = useState('ALL');
  const [editingExpCat, setEditingExpCat] = useState<string | null>(null);
  const [editingExpCatValue, setEditingExpCatValue] = useState('');

  // Owner Customize Payroll Modal
  const [editPayrollTarget, setEditPayrollTarget] = useState<PayrollRecord | null>(null);
  const [epDate, setEpDate] = useState('');
  const [epType, setEpType] = useState<PayrollRecord['type']>('Salary');
  const [epGross, setEpGross] = useState('');
  const [epDeduction, setEpDeduction] = useState('0');
  const [epAcc, setEpAcc] = useState(defaultPayrollCode);
  const [epNote, setEpNote] = useState('');

  // Owner Customize Expense Modal
  const [editExpenseTarget, setEditExpenseTarget] = useState<ExpenseRecord | null>(null);
  const [eeDate, setEeDate] = useState('');
  const [eeCategory, setEeCategory] = useState('');
  const [eeAmount, setEeAmount] = useState('');
  const [eeAcc, setEeAcc] = useState(defaultExpenseCode);
  const [eeRef, setEeRef] = useState('');
  const [eeDesc, setEeDesc] = useState('');
  const [eeRecurring, setEeRecurring] = useState(false);
  const [eeCycle, setEeCycle] = useState<'Weekly' | 'Monthly'>('Monthly');

  const resolvedPayAcc = moneyAccounts.some((a) => a.code === payAcc) ? payAcc : defaultPayrollCode;
  const resolvedExpAcc = moneyAccounts.some((a) => a.code === expAcc) ? expAcc : defaultExpenseCode;

  const staffFines = useMemo<StaffFineRecord[]>(() => state.staffFines || [], [state.staffFines]);

  const staffRoles = useMemo(() => {
    const base =
      state.settings.staffRoles && state.settings.staffRoles.length > 0
        ? state.settings.staffRoles
        : ['Washer', 'Presser', 'Rider', 'Supervisor', 'Counter Staff'];
    return Array.from(new Set([...base, ...state.employees.map((e) => e.role).filter(Boolean)]));
  }, [state.settings.staffRoles, state.employees]);

  const activeFinesByEmpId = useMemo(() => {
    const map: Record<string, number> = {};
    for (const fine of staffFines) {
      if (fine.status === 'Active') {
        map[fine.employeeId] = Number(((map[fine.employeeId] || 0) + fine.amount).toFixed(2));
      }
    }
    return map;
  }, [staffFines]);

  const staffSummary = useMemo(() => {
    let activeStaffCount = 0;
    let totalBasePayroll = 0;
    let totalAdvances = 0;
    let totalActiveFines = 0;
    let totalNetPayable = 0;

    for (const emp of state.employees) {
      const fine = activeFinesByEmpId[emp.id] || 0;
      totalActiveFines += fine;
      totalAdvances += emp.advanceBalance;
      if (emp.active) {
        activeStaffCount += 1;
        totalBasePayroll += emp.baseRate;
        totalNetPayable += Math.max(0, emp.baseRate + emp.salaryDue - emp.advanceBalance - fine);
      }
    }

    return {
      activeStaffCount,
      totalBasePayroll: Number(totalBasePayroll.toFixed(2)),
      totalAdvances: Number(totalAdvances.toFixed(2)),
      totalActiveFines: Number(totalActiveFines.toFixed(2)),
      totalNetPayable: Number(totalNetPayable.toFixed(2)),
    };
  }, [state.employees, activeFinesByEmpId]);

  const selectedEmp = useMemo(
    () => state.employees.find((e) => e.id === empId) || null,
    [state.employees, empId]
  );
  const selectedEmpActiveFine = selectedEmp ? activeFinesByEmpId[selectedEmp.id] || 0 : 0;
  const selectedEmpEstNet = selectedEmp
    ? Math.max(0, selectedEmp.baseRate + selectedEmp.salaryDue - selectedEmp.advanceBalance - selectedEmpActiveFine)
    : 0;

  const filteredFines = useMemo(() => {
    return staffFines.filter((fine) => {
      if (fineEmpFilter !== 'ALL' && fine.employeeId !== fineEmpFilter) return false;
      if (fineStatusFilter !== 'ALL' && fine.status !== fineStatusFilter) return false;
      return true;
    });
  }, [staffFines, fineEmpFilter, fineStatusFilter]);

  const filteredExpenses = useMemo(() => {
    const q = expSearch.trim().toLowerCase();
    return state.expenses.filter((exp) => {
      if (expCatFilter !== 'ALL' && exp.category !== expCatFilter) return false;
      if (!q) return true;
      return (
        exp.description.toLowerCase().includes(q) ||
        exp.category.toLowerCase().includes(q) ||
        exp.reference.toLowerCase().includes(q)
      );
    });
  }, [state.expenses, expSearch, expCatFilter]);

  const filteredExpensesTotal = useMemo(
    () => Number(filteredExpenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)),
    [filteredExpenses]
  );

  useEffect(() => {
    if (!empId && state.employees.length > 0) {
      setEmpId(state.employees[0].id);
    }
    if (!fineEmpId && state.employees.length > 0) {
      setFineEmpId(state.employees[0].id);
    }
  }, [empId, fineEmpId, state.employees]);

  const openFineModalFor = (targetEmpId?: string) => {
    setFineEmpId(targetEmpId || empId || state.employees[0]?.id || '');
    setFineAmount('');
    setFineReason('');
    setFineDate(new Date().toISOString().slice(0, 10));
    setFineModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Employees, Payroll &amp; Business Expenses
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Owner-led staff roster, custom roles &amp; pay terms, instant salary fines, and operating expense controls
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {subTab === 'employees' && onApplyStaffFine && state.employees.length > 0 && (
            <button
              type="button"
              onClick={() => openFineModalFor()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
            >
              <Gavel className="w-3.5 h-3.5" />
              Apply Instant Fine
            </button>
          )}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl">
            <button
              onClick={() => setSubTab('employees')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'employees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Staff &amp; Payroll ({state.employees.length})
            </button>
            <button
              onClick={() => setSubTab('expenses')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                subTab === 'expenses' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
              }`}
            >
              Operating Expenses ({state.expenses.length})
            </button>
          </div>
        </div>
      </div>

      {subTab === 'employees' && (
        <div className="space-y-6">
          {/* Summary KPI Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Active Staff</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
                {staffSummary.activeStaffCount}
                <span className="text-xs font-normal text-slate-400 ml-1">
                  / {state.employees.length}
                </span>
              </p>
            </div>
            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Base Rate Total</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-slate-900 mt-1">
                {formatMoney(staffSummary.totalBasePayroll, sym)}
              </p>
            </div>
            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Staff Advances</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-amber-700 mt-1">
                {formatMoney(staffSummary.totalAdvances, sym)}
              </p>
            </div>
            <div className="liquid-glass rounded-2xl p-4">
              <p className="text-[11px] font-medium text-slate-500">Active Fines</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-rose-700 mt-1">
                {formatMoney(staffSummary.totalActiveFines, sym)}
              </p>
            </div>
            <div className="liquid-glass rounded-2xl p-4 col-span-2 sm:col-span-1">
              <p className="text-[11px] font-medium text-slate-500">Est. Net Payable</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-[#0071E3] mt-1">
                {formatMoney(staffSummary.totalNetPayable, sym)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Post Payroll / Advance */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const g = Number(gross);
                const d = Number(deduction || 0);
                if (!empId || Number.isNaN(g) || g <= 0) return;
                onPostPayroll({
                  employeeId: empId,
                  type: payType,
                  grossAmount: g,
                  deductionAmount: d,
                  paymentAccountCode: resolvedPayAcc,
                  note: payNote.trim() || `${payType} disbursement`,
                  date: payDate,
                });
                setGross('');
                setDeduction('0');
                setPayNote('');
              }}
              className="lg:col-span-7 liquid-glass rounded-2xl p-6 space-y-4"
            >
              <h2 className="text-base font-semibold text-slate-900">
                Process Salary, Wage, Overtime, Bonus or Advance
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Employee</label>
                  <select
                    value={empId}
                    onChange={(e) => setEmpId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {state.employees.length === 0 && (
                      <option value="">No employees added yet</option>
                    )}
                    {state.employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.payType})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Payroll Type</label>
                  <select
                    value={payType}
                    onChange={(e) => setPayType(e.target.value as PayrollRecord['type'])}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    <option value="Salary">Monthly Salary</option>
                    <option value="Wage">Daily Wage</option>
                    <option value="Overtime">Overtime</option>
                    <option value="Bonus">Bonus</option>
                    <option value="Advance">Staff Advance</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Payment Account</label>
                  <select
                    value={resolvedPayAcc}
                    onChange={(e) => setPayAcc(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  >
                    {moneyAccounts.map((acc) => (
                      <option key={acc.code} value={acc.code}>
                        {acc.name} ({acc.channel || 'Asset'})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {selectedEmp && (
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                  <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums">
                    <span>
                      Base: <strong className="text-slate-900">{formatMoney(selectedEmp.baseRate, sym)}</strong>
                    </span>
                    <span>
                      Due: <strong className="text-slate-900">{formatMoney(selectedEmp.salaryDue, sym)}</strong>
                    </span>
                    <span>
                      Adv: <strong className="text-amber-700">{formatMoney(selectedEmp.advanceBalance, sym)}</strong>
                    </span>
                    <span>
                      Fines: <strong className="text-rose-700">{formatMoney(selectedEmpActiveFine, sym)}</strong>
                    </span>
                    <span>
                      Est. Net: <strong className="text-[#0071E3]">{formatMoney(selectedEmpEstNet, sym)}</strong>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedEmpActiveFine > 0 && (
                      <button
                        type="button"
                        onClick={() => setDeduction(String(selectedEmpActiveFine))}
                        className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium hover:bg-rose-100 whitespace-nowrap shrink-0"
                      >
                        Prefill Fines ({formatMoney(selectedEmpActiveFine, sym)})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setGross(String(selectedEmp.baseRate))}
                      className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-medium hover:bg-slate-100 whitespace-nowrap shrink-0"
                    >
                      Use Base Rate
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Payroll Date</label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Gross Amount ({sym})</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={gross}
                    onChange={(e) => setGross(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Advance / Fine Ded. ({sym})
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={deduction}
                    onChange={(e) => setDeduction(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Note</label>
                  <input
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    placeholder="Period / days worked..."
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED] whitespace-nowrap shrink-0"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  Post Payroll &amp; Ledger Entry
                </button>
              </div>
            </form>

            {/* Add Employee */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newEmpName.trim()) return;
                onAddEmployee({
                  name: newEmpName.trim(),
                  role: newEmpRole.trim() || 'Laundry Staff',
                  phone: newEmpPhone.trim(),
                  payType: newEmpPayType,
                  baseRate: Number(newEmpRate) || 12000,
                  customPayTerms: newEmpCustomTerms.trim() || undefined,
                });
                setNewEmpName('');
                setNewEmpRole('');
                setNewEmpPhone('');
                setNewEmpRate('');
                setNewEmpCustomTerms('');
              }}
              className="lg:col-span-5 liquid-glass rounded-2xl p-6 space-y-3"
            >
              <h2 className="text-base font-semibold text-slate-900">Add Staff Profile</h2>
              <input
                required
                value={newEmpName}
                onChange={(e) => setNewEmpName(e.target.value)}
                placeholder="Employee full name"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <input
                    list="rinse-staff-roles"
                    value={newEmpRole}
                    onChange={(e) => setNewEmpRole(e.target.value)}
                    placeholder="Role (pick or type custom)"
                    className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  />
                  <datalist id="rinse-staff-roles">
                    {staffRoles.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
                <input
                  value={newEmpPhone}
                  onChange={(e) => setNewEmpPhone(e.target.value)}
                  placeholder="Phone"
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newEmpPayType}
                  onChange={(e) =>
                    setNewEmpPayType(e.target.value as 'Monthly Salary' | 'Daily Wage')
                  }
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  <option value="Monthly Salary">Monthly Salary</option>
                  <option value="Daily Wage">Daily Wage</option>
                </select>
                <input
                  type="number"
                  required
                  value={newEmpRate}
                  onChange={(e) => setNewEmpRate(e.target.value)}
                  placeholder={`Rate (${sym})`}
                  className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
              </div>
              <input
                value={newEmpCustomTerms}
                onChange={(e) => setNewEmpCustomTerms(e.target.value)}
                placeholder="Custom pay terms (e.g., 26 days/mo, 1.5x OT, weekly payout)"
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                Save Employee
              </button>
            </form>
          </div>

          {/* Staff Table + Payroll History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <div className="liquid-glass rounded-2xl p-6">
              <div className="flex items-center justify-between gap-2 mb-3">
                <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-400" />
                  Staff Roster &amp; Running Balance
                </h3>
                <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                  {state.employees.length} profiles
                </span>
              </div>
              <div className="divide-y divide-slate-200/60 text-xs">
                {state.employees.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No staff profiles added yet. Use &ldquo;Add Staff Profile&rdquo; to register employees.
                  </p>
                )}
                {state.employees.map((emp) => {
                  const hasPayroll = state.payrollRecords.some((pr) => pr.employeeId === emp.id);
                  const empActiveFines = activeFinesByEmpId[emp.id] || 0;
                  const netPayable = Math.max(
                    0,
                    emp.baseRate + emp.salaryDue - emp.advanceBalance - empActiveFines
                  );
                  const hasBalance = emp.salaryDue > 0 || emp.advanceBalance > 0 || empActiveFines > 0;
                  return (
                    <div key={emp.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 flex flex-wrap items-center gap-1.5">
                          <span className={!emp.active ? 'line-through text-slate-400' : ''}>
                            {emp.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-medium text-slate-700">
                            {emp.role}
                          </span>
                          {!emp.active && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                              Inactive
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {emp.payType} ({formatMoney(emp.baseRate, sym)})
                          {emp.phone ? ` · ${emp.phone}` : ''}
                        </p>
                        {emp.customPayTerms && (
                          <p className="text-[11px] text-slate-600 mt-0.5">
                            Terms: {emp.customPayTerms}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="text-right font-mono tabular-nums space-y-0.5">
                          <p className="text-slate-900">
                            Net Est: <span className="font-semibold text-[#0071E3]">{formatMoney(netPayable, sym)}</span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Due: {formatMoney(emp.salaryDue, sym)} · Adv: <span className="text-amber-700">{formatMoney(emp.advanceBalance, sym)}</span>
                          </p>
                          {empActiveFines > 0 && (
                            <p className="text-[11px] text-rose-700 font-medium">
                              Fines: -{formatMoney(empActiveFines, sym)}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {onApplyStaffFine && (
                            <button
                              type="button"
                              onClick={() => openFineModalFor(emp.id)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 whitespace-nowrap shrink-0"
                              title={`Apply fine or deduction to ${emp.name}`}
                            >
                              <Gavel className="w-3 h-3" />
                              Fine
                            </button>
                          )}
                          {onUpdateEmployee && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditEmpTarget(emp);
                                setEeEmpName(emp.name);
                                setEeEmpRole(emp.role);
                                setEeEmpPhone(emp.phone);
                                setEeEmpPayType(emp.payType);
                                setEeEmpRate(String(emp.baseRate));
                                setEeEmpTerms(emp.customPayTerms || '');
                                setEeEmpSalaryDue(String(emp.salaryDue));
                                setEeEmpActive(emp.active);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                              title={`Edit profile & pay terms for ${emp.name}`}
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onRequestDelete && (
                            <button
                              type="button"
                              onClick={() =>
                                onRequestDelete({
                                  itemType: 'Employee',
                                  itemNameOrId: `${emp.name} (${emp.role})`,
                                  bodyText:
                                    hasPayroll || hasBalance
                                      ? `"${emp.name}" has posted payroll entries, fines, or staff advance/salary balances.`
                                      : `Delete staff profile "${emp.name}"?`,
                                  linkedInfo:
                                    hasPayroll || hasBalance
                                      ? 'Staff members with payroll or accounting balances should be deactivated instead of deleted.'
                                      : undefined,
                                  alternativeLabel:
                                    emp.active && onDeactivateEmployee
                                      ? 'Deactivate Instead'
                                      : undefined,
                                  onAlternative:
                                    emp.active && onDeactivateEmployee
                                      ? () => onDeactivateEmployee(emp.id)
                                      : undefined,
                                  accountingProtected: hasBalance,
                                  onConfirmDelete:
                                    !hasPayroll && !hasBalance && onDeleteEmployee
                                      ? () => onDeleteEmployee(emp.id)
                                      : undefined,
                                })
                              }
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                              title={`Delete or deactivate ${emp.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="liquid-glass rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Payroll Ledger History</h3>
              <div className="divide-y divide-slate-200/60 text-xs">
                {state.payrollRecords.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No payroll entries recorded yet.
                  </p>
                )}
                {state.payrollRecords.map((pr) => (
                  <div key={pr.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {pr.employeeName} · <span className="text-[#0071E3]">{pr.type}</span>
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {new Date(pr.date).toLocaleDateString()} — {pr.note}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {formatMoney(pr.netPaid, sym)}
                      </span>
                      {isOwner && onOwnerCustomizePayroll && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditPayrollTarget(pr);
                            setEpDate(toDateInputValue(pr.date));
                            setEpType(pr.type);
                            setEpGross(String(pr.grossAmount));
                            setEpDeduction(String(pr.deductionAmount));
                            setEpAcc(pr.paymentAccountCode || defaultPayrollCode);
                            setEpNote(pr.note);
                          }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 whitespace-nowrap shrink-0"
                          title="Customize payroll entry (Owner)"
                        >
                          <SlidersHorizontal className="w-3 h-3" />
                          Customize
                        </button>
                      )}
                      {onRequestDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            isOwner && onOwnerDeletePayroll
                              ? onRequestDelete({
                                  itemType: 'Payroll Entry',
                                  itemNameOrId: `${pr.employeeName} · ${pr.type} (${formatMoney(pr.netPaid, sym)})`,
                                  bodyText: `Permanently delete payroll record ${pr.id} for ${pr.employeeName} and recalculate ledger balances?`,
                                  accountingProtected: false,
                                  onConfirmDelete: () => onOwnerDeletePayroll(pr.id),
                                })
                              : onRequestDelete({
                                  itemType: 'Payroll Entry',
                                  itemNameOrId: `${pr.employeeName} · ${pr.type} (${formatMoney(pr.netPaid, sym)})`,
                                  bodyText:
                                    'Posted payroll disbursements are recorded directly in the General Ledger.',
                                  linkedInfo:
                                    'Cannot plain-delete posted payroll records. Reverse the corresponding journal entry in Accounting to adjust balances.',
                                  accountingProtected: true,
                                  alternativeLabel: onGoToAccounting
                                    ? 'Reverse in Accounting'
                                    : undefined,
                                  onAlternative: onGoToAccounting,
                                })
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title={
                            isOwner && onOwnerDeletePayroll
                              ? 'Delete payroll entry (Owner)'
                              : 'Audit-protected payroll entry'
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Instant Fines Audit Log + Custom Staff Roles */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 liquid-glass rounded-2xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                    <Gavel className="w-4 h-4 text-rose-600" />
                    Salary Fines &amp; Deductions Audit Log
                  </h3>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Timestamped fine records for staff balance reconciliation and dispute checks
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={fineEmpFilter}
                    onChange={(e) => setFineEmpFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    <option value="ALL">All Staff</option>
                    {state.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={fineStatusFilter}
                    onChange={(e) => setFineStatusFilter(e.target.value as 'ALL' | 'Active' | 'Waived')}
                    className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    <option value="ALL">All Status</option>
                    <option value="Active">Active</option>
                    <option value="Waived">Waived</option>
                  </select>
                </div>
              </div>

              <div className="divide-y divide-slate-200/60 text-xs">
                {filteredFines.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No salary fines or deductions match the current filter.
                  </p>
                )}
                {filteredFines.map((fine) => (
                  <div key={fine.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-semibold text-slate-900">{fine.employeeName}</span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                            fine.status === 'Active'
                              ? 'bg-rose-50 border-rose-200 text-rose-700'
                              : 'bg-slate-100 border-slate-200 text-slate-600'
                          }`}
                        >
                          {fine.status}
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">{fine.id}</span>
                      </div>
                      <p className="text-slate-700 mt-1">{fine.reason}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {new Date(fine.date).toLocaleString()} · Logged by {fine.createdBy}
                        {fine.status === 'Waived' && fine.waivedReason
                          ? ` · Waived (${fine.waivedReason})`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`font-mono tabular-nums font-semibold ${
                          fine.status === 'Active' ? 'text-rose-700' : 'line-through text-slate-400'
                        }`}
                      >
                        -{formatMoney(fine.amount, sym)}
                      </span>
                      {onToggleStaffFineStatus && (
                        <button
                          type="button"
                          onClick={() => onToggleStaffFineStatus(fine.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                          title={fine.status === 'Active' ? 'Waive this fine' : 'Restore fine as active'}
                        >
                          <RotateCcw className="w-3 h-3" />
                          {fine.status === 'Active' ? 'Waive' : 'Restore'}
                        </button>
                      )}
                      {onRequestDelete && onDeleteStaffFine && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDelete({
                              itemType: 'Salary Fine Record',
                              itemNameOrId: `${fine.employeeName} · -${formatMoney(fine.amount, sym)}`,
                              bodyText: `Permanently remove fine record ${fine.id} ("${fine.reason}")?`,
                              accountingProtected: false,
                              onConfirmDelete: () => onDeleteStaffFine(fine.id),
                            })
                          }
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="Delete fine record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Custom Staff Roles Manager */}
            <div className="lg:col-span-5 liquid-glass rounded-2xl p-6 space-y-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Custom Staff Roles</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Create, rename, or remove custom staff roles used across your roster
                </p>
              </div>

              {onAddStaffRole && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newRoleInput.trim()) return;
                    onAddStaffRole(newRoleInput.trim());
                    setNewRoleInput('');
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    value={newRoleInput}
                    onChange={(e) => setNewRoleInput(e.target.value)}
                    placeholder="New role (e.g., Spotter, Night Rider)"
                    className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                  />
                  <button
                    type="submit"
                    className="px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white whitespace-nowrap shrink-0"
                  >
                    Add Role
                  </button>
                </form>
              )}

              <div className="divide-y divide-slate-200/60 text-xs">
                {staffRoles.map((roleName) => {
                  const assignedCount = state.employees.filter((e) => e.role === roleName).length;
                  const isEditing = editingRole === roleName;
                  return (
                    <div key={roleName} className="py-2.5 flex items-center justify-between gap-2">
                      {isEditing ? (
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (onRenameStaffRole && editingRoleValue.trim()) {
                              onRenameStaffRole(roleName, editingRoleValue.trim());
                            }
                            setEditingRole(null);
                          }}
                          className="flex-1 flex items-center gap-2"
                        >
                          <input
                            autoFocus
                            value={editingRoleValue}
                            onChange={(e) => setEditingRoleValue(e.target.value)}
                            className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-white border border-slate-300"
                          />
                          <button
                            type="submit"
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#0071E3] text-white whitespace-nowrap shrink-0"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingRole(null)}
                            className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600"
                          >
                            Cancel
                          </button>
                        </form>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800">{roleName}</span>
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              ({assignedCount})
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            {onRenameStaffRole && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingRole(roleName);
                                  setEditingRoleValue(roleName);
                                }}
                                className="p-1 text-slate-400 hover:text-slate-700"
                                title={`Rename ${roleName}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                            {onRequestDelete && onDeleteStaffRole && (
                              <button
                                type="button"
                                onClick={() =>
                                  onRequestDelete({
                                    itemType: 'Staff Role',
                                    itemNameOrId: roleName,
                                    bodyText:
                                      assignedCount > 0
                                        ? `Role "${roleName}" is currently assigned to ${assignedCount} staff profile(s). Removing it from presets keeps existing staff tags intact.`
                                        : `Remove staff role "${roleName}"?`,
                                    onConfirmDelete: () => onDeleteStaffRole(roleName),
                                  })
                                }
                                className="p-1 text-slate-400 hover:text-red-600"
                                title={`Delete ${roleName}`}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 liquid-glass rounded-2xl p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/70">
              <div>
                <h2 className="text-base font-semibold text-slate-900">
                  Recorded Business Expenses
                </h2>
                <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                  {filteredExpenses.length} entries · Total: {formatMoney(filteredExpensesTotal, sym)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    value={expSearch}
                    onChange={(e) => setExpSearch(e.target.value)}
                    placeholder="Search bill or ref..."
                    className="pl-7 pr-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200 w-40"
                  />
                </div>
                <select
                  value={expCatFilter}
                  onChange={(e) => setExpCatFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                >
                  <option value="ALL">All Categories</option>
                  {state.settings.expenseCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="divide-y divide-slate-200/60 mt-2 text-xs">
              {filteredExpenses.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  {state.expenses.length === 0
                    ? 'No business expenses recorded yet.'
                    : 'No expenses match your search or category filter.'}
                </p>
              )}
              {filteredExpenses.map((exp) => (
                <div key={exp.id} className="py-3.5 flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2 text-slate-500">
                      <span className="font-semibold text-slate-800">{exp.category}</span>
                      <span>·</span>
                      <span className="font-mono">{new Date(exp.date).toLocaleDateString()}</span>
                      <span>·</span>
                      <span className="font-mono">{exp.reference}</span>
                      {exp.recurring && (
                        <>
                          <span>·</span>
                          <span className="text-[#0071E3] font-medium">
                            Recurring ({exp.recurrenceCycle})
                          </span>
                        </>
                      )}
                    </div>
                    <p className="text-slate-700 mt-1">{exp.description}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {formatMoney(exp.amount, sym)}
                    </span>
                    {isOwner && onOwnerCustomizeExpense && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditExpenseTarget(exp);
                          setEeDate(toDateInputValue(exp.date));
                          setEeCategory(exp.category);
                          setEeAmount(String(exp.amount));
                          setEeAcc(exp.paymentAccountCode || defaultExpenseCode);
                          setEeRef(exp.reference);
                          setEeDesc(exp.description);
                          setEeRecurring(Boolean(exp.recurring));
                          setEeCycle(exp.recurrenceCycle || 'Monthly');
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-semibold rounded-lg bg-amber-50 border border-amber-200 text-amber-800 hover:bg-amber-100 whitespace-nowrap shrink-0"
                        title="Customize expense (Owner)"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                        Customize
                      </button>
                    )}
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() =>
                          isOwner && onOwnerDeleteExpense
                            ? onRequestDelete({
                                itemType: 'Posted Expense',
                                itemNameOrId: `${exp.reference} · ${exp.category} (${formatMoney(exp.amount, sym)})`,
                                bodyText: `Permanently delete expense ${exp.id} (${exp.description}) and recalculate ledger balances?`,
                                accountingProtected: false,
                                onConfirmDelete: () => onOwnerDeleteExpense(exp.id),
                              })
                            : onRequestDelete({
                                itemType: 'Posted Expense',
                                itemNameOrId: `${exp.reference} · ${exp.category} (${formatMoney(exp.amount, sym)})`,
                                bodyText:
                                  'Operating expenses are posted to double-entry expense and cash/bank accounts.',
                                linkedInfo:
                                  'Under accounting rules, posted expenses cannot be plain-deleted. Reverse the expense journal entry in Accounting instead.',
                                accountingProtected: true,
                                alternativeLabel: onGoToAccounting
                                  ? 'Reverse in Accounting'
                                  : undefined,
                                onAlternative: onGoToAccounting,
                              })
                        }
                        className="p-1 text-slate-400 hover:text-red-600"
                        title={
                          isOwner && onOwnerDeleteExpense
                            ? 'Delete expense (Owner)'
                            : 'Audit-protected expense'
                        }
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-5 space-y-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const amt = Number(expAmount);
                if (Number.isNaN(amt) || amt <= 0) return;
                onPostExpense({
                  category: expCategory,
                  amount: amt,
                  paymentAccountCode: resolvedExpAcc,
                  description: expDesc.trim() || `${expCategory} expense`,
                  reference: expRef.trim() || `EXP-${Date.now().toString().slice(-4)}`,
                  recurring: expRecurring,
                  recurrenceCycle: expRecurring ? expCycle : undefined,
                  date: expDate,
                });
                setExpAmount('');
                setExpDesc('');
                setExpRef('');
              }}
              className="liquid-glass rounded-2xl p-6 space-y-3"
            >
              <h2 className="text-base font-semibold text-slate-900">Record Operating Expense</h2>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={expCategory}
                  onChange={(e) => setExpCategory(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {state.settings.expenseCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <select
                  value={resolvedExpAcc}
                  onChange={(e) => setExpAcc(e.target.value)}
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                >
                  {moneyAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name} ({acc.channel || 'Asset'})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="date"
                  value={expDate}
                  onChange={(e) => setExpDate(e.target.value)}
                  className="px-2.5 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
                <input
                  type="number"
                  required
                  min={1}
                  value={expAmount}
                  onChange={(e) => setExpAmount(e.target.value)}
                  placeholder={`Amount (${sym})`}
                  className="px-3 py-2 text-xs font-mono rounded-xl bg-white border border-slate-200"
                />
                <input
                  value={expRef}
                  onChange={(e) => setExpRef(e.target.value)}
                  placeholder="Bill / Voucher ref"
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
              </div>
              <input
                required
                value={expDesc}
                onChange={(e) => setExpDesc(e.target.value)}
                placeholder="Description..."
                className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
              />
              <div className="flex items-center justify-between gap-2 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={expRecurring}
                    onChange={(e) => setExpRecurring(e.target.checked)}
                  />
                  Recurring (adds Calendar Task)
                </label>
                {expRecurring && (
                  <select
                    value={expCycle}
                    onChange={(e) => setExpCycle(e.target.value as 'Weekly' | 'Monthly')}
                    className="px-2 py-1 text-xs rounded-lg bg-white border border-slate-200"
                  >
                    <option value="Monthly">Monthly</option>
                    <option value="Weekly">Weekly</option>
                  </select>
                )}
              </div>
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white"
              >
                <Receipt className="w-3.5 h-3.5" />
                Post Expense to Ledger
              </button>
            </form>

            <div className="liquid-glass rounded-2xl p-4 space-y-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newExpCategory.trim()) return;
                  onAddExpenseCategory(newExpCategory.trim());
                  setNewExpCategory('');
                }}
                className="flex items-center gap-2"
              >
                <input
                  value={newExpCategory}
                  onChange={(e) => setNewExpCategory(e.target.value)}
                  placeholder="Custom expense category..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
                <button
                  type="submit"
                  className="px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white whitespace-nowrap shrink-0"
                >
                  Add Category
                </button>
              </form>

              {state.settings.expenseCategories.length > 0 && (
                <div className="divide-y divide-slate-200/60 text-xs">
                  {state.settings.expenseCategories.map((cat) => {
                    const usedCount = state.expenses.filter((e) => e.category === cat).length;
                    const isEditingCat = editingExpCat === cat;
                    return (
                      <div key={cat} className="py-2 flex items-center justify-between gap-2">
                        {isEditingCat ? (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (onRenameExpenseCategory && editingExpCatValue.trim()) {
                                onRenameExpenseCategory(cat, editingExpCatValue.trim());
                                if (expCategory === cat) {
                                  setExpCategory(editingExpCatValue.trim());
                                }
                              }
                              setEditingExpCat(null);
                            }}
                            className="flex-1 flex items-center gap-2"
                          >
                            <input
                              autoFocus
                              value={editingExpCatValue}
                              onChange={(e) => setEditingExpCatValue(e.target.value)}
                              className="flex-1 px-2.5 py-1 text-xs rounded-lg bg-white border border-slate-300"
                            />
                            <button
                              type="submit"
                              className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#0071E3] text-white whitespace-nowrap shrink-0"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingExpCat(null)}
                              className="px-2 py-1 text-[11px] rounded-lg border border-slate-200 text-slate-600"
                            >
                              Cancel
                            </button>
                          </form>
                        ) : (
                          <>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-slate-800">{cat}</span>
                              <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                                ({usedCount})
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              {onRenameExpenseCategory && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingExpCat(cat);
                                    setEditingExpCatValue(cat);
                                  }}
                                  className="p-1 text-slate-400 hover:text-slate-700"
                                  title={`Rename ${cat}`}
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                              {onRequestDelete && onDeleteExpenseCategory && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onRequestDelete({
                                      itemType: 'Expense Category',
                                      itemNameOrId: cat,
                                      bodyText:
                                        usedCount > 0
                                          ? `Category "${cat}" is used on ${usedCount} recorded expense(s). Removing it hides it from new expense entries while preserving past bills.`
                                          : `Delete expense category "${cat}"?`,
                                      linkedInfo:
                                        usedCount > 0 ? `Used in ${usedCount} recorded expense(s).` : undefined,
                                      onConfirmDelete: () => onDeleteExpenseCategory(cat),
                                    })
                                  }
                                  className="p-1 text-slate-400 hover:text-red-600"
                                  title={`Remove ${cat}`}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Owner Customize Payroll Modal */}
      {isOwner && editPayrollTarget && onOwnerCustomizePayroll && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setEditPayrollTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerCustomizePayroll(editPayrollTarget.id, {
                date: epDate,
                type: epType,
                grossAmount: Math.max(0, Number(epGross) || 0),
                deductionAmount: Math.max(0, Number(epDeduction) || 0),
                paymentAccountCode: epAcc,
                note: epNote.trim() || `${epType} disbursement`,
              });
              setEditPayrollTarget(null);
            }}
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Payroll · {editPayrollTarget.employeeName}
                </h3>
                <p className="text-slate-500">{editPayrollTarget.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditPayrollTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Payroll Date
                </label>
                <input
                  type="date"
                  required
                  value={epDate}
                  onChange={(e) => setEpDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Type</label>
                <select
                  value={epType}
                  onChange={(e) => setEpType(e.target.value as PayrollRecord['type'])}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Salary">Monthly Salary</option>
                  <option value="Wage">Daily Wage</option>
                  <option value="Overtime">Overtime</option>
                  <option value="Bonus">Bonus</option>
                  <option value="Advance">Staff Advance</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Gross Amount ({sym})
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={epGross}
                  onChange={(e) => setEpGross(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Deduction ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={epDeduction}
                  onChange={(e) => setEpDeduction(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Payment Account
              </label>
              <select
                value={epAcc}
                onChange={(e) => setEpAcc(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                {moneyAccounts.map((acc) => (
                  <option key={acc.code} value={acc.code}>
                    {acc.name} ({acc.channel || 'Asset'})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Note</label>
              <input
                value={epNote}
                onChange={(e) => setEpNote(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditPayrollTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0071E3] text-white font-semibold"
              >
                Save Payroll Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Owner Customize Expense Modal */}
      {isOwner && editExpenseTarget && onOwnerCustomizeExpense && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setEditExpenseTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onOwnerCustomizeExpense(editExpenseTarget.id, {
                date: eeDate,
                category: eeCategory,
                amount: Math.max(0, Number(eeAmount) || 0),
                paymentAccountCode: eeAcc,
                description: eeDesc.trim() || `${eeCategory} expense`,
                reference: eeRef.trim() || editExpenseTarget.reference,
                recurring: eeRecurring,
                recurrenceCycle: eeRecurring ? eeCycle : undefined,
              });
              setEditExpenseTarget(null);
            }}
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Customize Expense · {editExpenseTarget.id}
                </h3>
                <p className="text-slate-500">
                  Edit date, category, amount, payment source, and recurring schedule (Owner)
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditExpenseTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Expense Date
                </label>
                <input
                  type="date"
                  required
                  value={eeDate}
                  onChange={(e) => setEeDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Category
                </label>
                <select
                  value={eeCategory}
                  onChange={(e) => setEeCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {Array.from(
                    new Set([...state.settings.expenseCategories, editExpenseTarget.category])
                  ).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Amount ({sym})
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={eeAmount}
                  onChange={(e) => setEeAmount(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Payment Account
                </label>
                <select
                  value={eeAcc}
                  onChange={(e) => setEeAcc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  {moneyAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name} ({acc.channel || 'Asset'})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Bill / Voucher Reference
                </label>
                <input
                  value={eeRef}
                  onChange={(e) => setEeRef(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Description
                </label>
                <input
                  required
                  value={eeDesc}
                  onChange={(e) => setEeDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eeRecurring}
                  onChange={(e) => setEeRecurring(e.target.checked)}
                />
                Recurring (Calendar reminder)
              </label>
              {eeRecurring && (
                <select
                  value={eeCycle}
                  onChange={(e) => setEeCycle(e.target.value as 'Weekly' | 'Monthly')}
                  className="px-2.5 py-1.5 rounded-lg bg-white border border-slate-200"
                >
                  <option value="Monthly">Monthly</option>
                  <option value="Weekly">Weekly</option>
                </select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditExpenseTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0071E3] text-white font-semibold"
              >
                Save Expense Changes
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Apply Instant Salary Fine Modal */}
      {fineModalOpen && onApplyStaffFine && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setFineModalOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              const amt = Number(fineAmount);
              if (!fineEmpId || Number.isNaN(amt) || amt <= 0 || !fineReason.trim()) return;
              onApplyStaffFine({
                employeeId: fineEmpId,
                amount: amt,
                reason: fineReason.trim(),
                date: fineDate,
              });
              setFineModalOpen(false);
            }}
            className="w-full max-w-md rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900 flex items-center gap-1.5">
                  <Gavel className="w-4 h-4 text-rose-600" />
                  Apply Instant Salary Fine
                </h3>
                <p className="text-slate-500">
                  Immediately updates active deductions and staff net balance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFineModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Staff Member
              </label>
              <select
                required
                value={fineEmpId}
                onChange={(e) => setFineEmpId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              >
                {state.employees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name} ({emp.role})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Fine Amount ({sym})
                </label>
                <input
                  type="number"
                  required
                  min={0.01}
                  step="0.01"
                  value={fineAmount}
                  onChange={(e) => setFineAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={fineDate}
                  onChange={(e) => setFineDate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Reason / Incident Note
              </label>
              <input
                required
                value={fineReason}
                onChange={(e) => setFineReason(e.target.value)}
                placeholder="e.g., Late arrival, garment damage, unapproved absence..."
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setFineModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold hover:bg-rose-700"
              >
                Apply Salary Fine
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Customize Staff Profile Modal */}
      {editEmpTarget && onUpdateEmployee && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/45 backdrop-blur-xs"
          onClick={() => setEditEmpTarget(null)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={(e) => {
              e.preventDefault();
              onUpdateEmployee(editEmpTarget.id, {
                name: eeEmpName.trim() || editEmpTarget.name,
                role: eeEmpRole.trim() || editEmpTarget.role,
                phone: eeEmpPhone.trim(),
                payType: eeEmpPayType,
                baseRate: Math.max(0, Number(eeEmpRate) || 0),
                customPayTerms: eeEmpTerms.trim() || undefined,
                salaryDue: Math.max(0, Number(eeEmpSalaryDue) || 0),
                active: eeEmpActive,
              });
              setEditEmpTarget(null);
            }}
            className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl p-6 space-y-4 text-xs"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Edit Staff Profile · {editEmpTarget.name}
                </h3>
                <p className="text-slate-500">
                  Customize role, pay rate, custom pay terms, and active status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditEmpTarget(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Full Name</label>
                <input
                  required
                  value={eeEmpName}
                  onChange={(e) => setEeEmpName(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Role</label>
                <input
                  list="rinse-staff-roles"
                  required
                  value={eeEmpRole}
                  onChange={(e) => setEeEmpRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Phone</label>
                <input
                  value={eeEmpPhone}
                  onChange={(e) => setEeEmpPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Pay Type</label>
                <select
                  value={eeEmpPayType}
                  onChange={(e) =>
                    setEeEmpPayType(e.target.value as 'Monthly Salary' | 'Daily Wage')
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
                >
                  <option value="Monthly Salary">Monthly Salary</option>
                  <option value="Daily Wage">Daily Wage</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Base Rate ({sym})
                </label>
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={eeEmpRate}
                  onChange={(e) => setEeEmpRate(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">
                  Salary Due ({sym})
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={eeEmpSalaryDue}
                  onChange={(e) => setEeEmpSalaryDue(e.target.value)}
                  className="w-full px-3 py-2 font-mono rounded-xl border border-slate-200 bg-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">
                Custom Pay Terms
              </label>
              <input
                value={eeEmpTerms}
                onChange={(e) => setEeEmpTerms(e.target.value)}
                placeholder="e.g., 26 shifts/mo, overtime Tk 120/hr, weekly Sunday off"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white"
              />
            </div>

            <label className="inline-flex items-center gap-2 text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={eeEmpActive}
                onChange={(e) => setEeEmpActive(e.target.checked)}
              />
              Active employee on payroll roster
            </label>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setEditEmpTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-[#0071E3] text-white font-semibold"
              >
                Save Staff Profile
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

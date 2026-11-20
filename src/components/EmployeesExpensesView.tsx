import { useEffect, useMemo, useState } from 'react';
import { Plus, Receipt, Trash2, Users, Wallet } from 'lucide-react';
import { Employee, ErpState, PayrollRecord } from '../types/erp';
import { formatMoney, getMoneySourceAccounts } from '../utils/accounting';
import { DeleteConfirmationRequest } from './ConfirmDeleteModal';

interface EmployeesExpensesViewProps {
  state: ErpState;
  onAddEmployee: (emp: Omit<Employee, 'id' | 'advanceBalance' | 'salaryDue' | 'active'>) => void;
  onDeleteEmployee?: (empId: string) => void;
  onDeactivateEmployee?: (empId: string) => void;
  onPostPayroll: (params: {
    employeeId: string;
    type: PayrollRecord['type'];
    grossAmount: number;
    deductionAmount: number;
    paymentAccountCode: string;
    note: string;
  }) => void;
  onPostExpense: (params: {
    category: string;
    amount: number;
    paymentAccountCode: string;
    description: string;
    reference: string;
    recurring: boolean;
    recurrenceCycle?: 'Weekly' | 'Monthly';
  }) => void;
  onAddExpenseCategory: (category: string) => void;
  onDeleteExpenseCategory?: (category: string) => void;
  onGoToAccounting?: () => void;
  onRequestDelete?: (req: DeleteConfirmationRequest) => void;
}

export function EmployeesExpensesView({
  state,
  onAddEmployee,
  onDeleteEmployee,
  onDeactivateEmployee,
  onPostPayroll,
  onPostExpense,
  onAddExpenseCategory,
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
  const [payNote, setPayNote] = useState('');

  // New Employee Form
  const [newEmpName, setNewEmpName] = useState('');
  const [newEmpRole, setNewEmpRole] = useState('');
  const [newEmpPhone, setNewEmpPhone] = useState('');
  const [newEmpPayType, setNewEmpPayType] = useState<'Monthly Salary' | 'Daily Wage'>('Monthly Salary');
  const [newEmpRate, setNewEmpRate] = useState('');

  // Expense Form
  const [expCategory, setExpCategory] = useState(state.settings.expenseCategories[0] || 'Electricity');
  const [expAmount, setExpAmount] = useState('');
  const [expAcc, setExpAcc] = useState(defaultExpenseCode);
  const [expDesc, setExpDesc] = useState('');
  const [expRef, setExpRef] = useState('');
  const [expRecurring, setExpRecurring] = useState(false);
  const [expCycle, setExpCycle] = useState<'Weekly' | 'Monthly'>('Monthly');
  const [newExpCategory, setNewExpCategory] = useState('');

  const resolvedPayAcc = moneyAccounts.some((a) => a.code === payAcc) ? payAcc : defaultPayrollCode;
  const resolvedExpAcc = moneyAccounts.some((a) => a.code === expAcc) ? expAcc : defaultExpenseCode;

  useEffect(() => {
    if (!empId && state.employees.length > 0) {
      setEmpId(state.employees[0].id);
    }
  }, [empId, state.employees]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Employees, Payroll &amp; Business Expenses
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Staff salary, daily wages, overtime, advances, custom expense categories, and recurring bill reminders
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-xl self-start sm:self-auto">
          <button
            onClick={() => setSubTab('employees')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'employees' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Staff &amp; Payroll ({state.employees.length})
          </button>
          <button
            onClick={() => setSubTab('expenses')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              subTab === 'expenses' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
            }`}
          >
            Operating Expenses ({state.expenses.length})
          </button>
        </div>
      </div>

      {subTab === 'employees' && (
        <div className="space-y-6">
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

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
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
                    Advance / Deduction ({sym})
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
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-[#0071E3] text-white hover:bg-[#0077ED]"
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
                });
                setNewEmpName('');
                setNewEmpRole('');
                setNewEmpPhone('');
                setNewEmpRate('');
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
                <input
                  value={newEmpRole}
                  onChange={(e) => setNewEmpRole(e.target.value)}
                  placeholder="Role (Washer, Rider...)"
                  className="px-3 py-2 text-xs rounded-xl bg-white border border-slate-200"
                />
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
              <button
                type="submit"
                className="w-full inline-flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 text-white"
              >
                <Plus className="w-3.5 h-3.5" />
                Save Employee
              </button>
            </form>
          </div>

          {/* Staff Table + Payroll History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="liquid-glass rounded-2xl p-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-400" />
                Active Employees
              </h3>
              <div className="divide-y divide-slate-200/60 text-xs">
                {state.employees.length === 0 && (
                  <p className="py-6 text-center text-xs text-slate-400">
                    No staff profiles added yet. Use &ldquo;Add Staff Profile&rdquo; to register employees.
                  </p>
                )}
                {state.employees.map((emp) => {
                  const hasPayroll = state.payrollRecords.some((pr) => pr.employeeId === emp.id);
                  const hasBalance = emp.salaryDue > 0 || emp.advanceBalance > 0;
                  return (
                    <div key={emp.id} className="py-3 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">
                          <span className={!emp.active ? 'line-through text-slate-400' : ''}>
                            {emp.name}
                          </span>{' '}
                          · <span className="font-normal text-slate-500">{emp.role}</span>
                          {!emp.active && (
                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                              Inactive
                            </span>
                          )}
                        </p>
                        <p className="text-slate-500 mt-0.5">
                          {emp.payType} ({formatMoney(emp.baseRate, sym)}) · {emp.phone}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right font-mono tabular-nums">
                          <p className="text-slate-900">Due: {formatMoney(emp.salaryDue, sym)}</p>
                          <p className="text-amber-700">Adv: {formatMoney(emp.advanceBalance, sym)}</p>
                        </div>
                        {onRequestDelete && (
                          <button
                            type="button"
                            onClick={() =>
                              onRequestDelete({
                                itemType: 'Employee',
                                itemNameOrId: `${emp.name} (${emp.role})`,
                                bodyText:
                                  hasPayroll || hasBalance
                                    ? `"${emp.name}" has posted payroll entries or staff advance/salary balances.`
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
                            className="p-1 text-slate-400 hover:text-red-600"
                            title={`Delete or deactivate ${emp.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
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
                      {onRequestDelete && (
                        <button
                          type="button"
                          onClick={() =>
                            onRequestDelete({
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
                          title="Audit-protected payroll entry"
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
        </div>
      )}

      {subTab === 'expenses' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 liquid-glass rounded-2xl p-6">
            <h2 className="text-base font-semibold text-slate-900 pb-3 border-b border-slate-200/70">
              Recorded Business Expenses
            </h2>
            <div className="divide-y divide-slate-200/60 mt-2 text-xs">
              {state.expenses.length === 0 && (
                <p className="py-6 text-center text-xs text-slate-400">
                  No business expenses recorded yet.
                </p>
              )}
              {state.expenses.map((exp) => (
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
                    {onRequestDelete && (
                      <button
                        type="button"
                        onClick={() =>
                          onRequestDelete({
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
                        title="Audit-protected expense"
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
              <div className="grid grid-cols-2 gap-2">
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
                  className="px-3.5 py-2 text-xs font-medium rounded-xl bg-slate-900 text-white whitespace-nowrap"
                >
                  Add Category
                </button>
              </form>

              {onRequestDelete && onDeleteExpenseCategory && state.settings.expenseCategories.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {state.settings.expenseCategories.map((cat) => {
                    const usedCount = state.expenses.filter((e) => e.category === cat).length;
                    return (
                      <div
                        key={cat}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/80 border border-slate-200 text-[11px] text-slate-700"
                      >
                        <span>{cat}</span>
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
                          className="text-slate-400 hover:text-red-600"
                          title={`Remove ${cat}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

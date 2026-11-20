import { useState } from 'react';
import { Plus, Split, Trash2, X } from 'lucide-react';
import { Account, MoneySourceChannel, PaymentSplit } from '../types/erp';
import { calculateCashOutFee, formatMoney, getMoneySourceAccounts } from '../utils/accounting';

export interface QuickAddMoneyAccountParams {
  name: string;
  channel: MoneySourceChannel;
  walletType?: string;
  cashOutChargePercent?: number;
  cashOutChargeFlat?: number;
}

interface SplitPaymentInputProps {
  accounts: Account[];
  currencySymbol: string;
  splits: PaymentSplit[];
  onChange: (nextSplits: PaymentSplit[]) => void;
  onAddMoneyAccount?: (params: QuickAddMoneyAccountParams) => string | null;
  maxTotal?: number;
  label?: string;
  compact?: boolean;
  allowZero?: boolean;
}

export function SplitPaymentInput({
  accounts,
  currencySymbol,
  splits,
  onChange,
  onAddMoneyAccount,
  maxTotal,
  label,
  compact = false,
  allowZero = false,
}: SplitPaymentInputProps) {
  const moneyAccounts = getMoneySourceAccounts(accounts);
  const totalEntered = Number(
    splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0).toFixed(2)
  );
  const exceedsMax = typeof maxTotal === 'number' && totalEntered > maxTotal + 0.01;

  // Inline custom payment method creator state (never nested <form>)
  const [customRowIdx, setCustomRowIdx] = useState<number | null>(null);
  const [customName, setCustomName] = useState('');
  const [customChannel, setCustomChannel] = useState<MoneySourceChannel>('E-Wallet');
  const [customWalletType, setCustomWalletType] = useState('');
  const [customChargePct, setCustomChargePct] = useState('');
  const [customChargeFlat, setCustomChargeFlat] = useState('');
  const [customError, setCustomError] = useState('');

  const getChannelTag = (acc: Account) => {
    if (acc.channel === 'E-Wallet') {
      return acc.walletType?.trim() ? `Wallet · ${acc.walletType.trim()}` : 'Wallet';
    }
    if (acc.channel && acc.channel !== 'Other') return acc.channel;
    return 'Asset';
  };

  const addSplitRow = () => {
    const usedCodes = new Set(splits.map((s) => s.accountCode));
    const nextAcc =
      moneyAccounts.find((a) => !usedCodes.has(a.code)) || moneyAccounts[0];
    if (!nextAcc) return;
    const remaining =
      typeof maxTotal === 'number'
        ? Math.max(0, Number((maxTotal - totalEntered).toFixed(2)))
        : 0;
    onChange([
      ...splits,
      {
        accountCode: nextAcc.code,
        accountName: nextAcc.name,
        amount: remaining > 0 ? remaining : 0,
      },
    ]);
  };

  const updateRow = (idx: number, patch: Partial<PaymentSplit>) => {
    const next = splits.map((row, i) => {
      if (i !== idx) return row;
      const merged = { ...row, ...patch };
      if (patch.accountCode) {
        const acc = moneyAccounts.find((a) => a.code === patch.accountCode);
        if (acc) merged.accountName = acc.name;
      }
      return merged;
    });
    onChange(next);
  };

  const removeRow = (idx: number) => {
    if (customRowIdx === idx) {
      setCustomRowIdx(null);
      setCustomError('');
    }
    if (splits.length <= 1) {
      onChange([{ ...splits[0], amount: 0 }]);
      return;
    }
    onChange(splits.filter((_, i) => i !== idx));
  };

  const fillRemaining = (idx: number) => {
    if (typeof maxTotal !== 'number') return;
    const others = splits.reduce(
      (sum, s, i) => (i === idx ? sum : sum + (Number(s.amount) || 0)),
      0
    );
    const rem = Math.max(0, Number((maxTotal - others).toFixed(2)));
    updateRow(idx, { amount: rem });
  };

  const openCustomCreator = (idx: number) => {
    setCustomRowIdx(idx);
    setCustomName('');
    setCustomChannel('E-Wallet');
    setCustomWalletType('');
    setCustomChargePct('');
    setCustomChargeFlat('');
    setCustomError('');
  };

  const handleSaveCustomMethod = () => {
    if (!onAddMoneyAccount || customRowIdx === null) return;
    const cleanName = customName.trim();
    if (!cleanName) {
      setCustomError('Please enter a payment method name.');
      return;
    }
    const pct = Math.max(0, Number(customChargePct) || 0);
    const flat = Math.max(0, Number(customChargeFlat) || 0);
    const createdCode = onAddMoneyAccount({
      name: cleanName,
      channel: customChannel,
      walletType: customChannel === 'E-Wallet' ? customWalletType.trim() : undefined,
      cashOutChargePercent: customChannel === 'E-Wallet' ? pct : undefined,
      cashOutChargeFlat: customChannel === 'E-Wallet' ? flat : undefined,
    });
    if (!createdCode) {
      setCustomError('Unable to create payment method. Check permissions or try a different name.');
      return;
    }
    const next = splits.map((row, i) =>
      i === customRowIdx
        ? { ...row, accountCode: createdCode, accountName: cleanName }
        : row
    );
    onChange(next);
    setCustomRowIdx(null);
    setCustomError('');
  };

  if (moneyAccounts.length === 0) {
    return (
      <div className="space-y-2">
        <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span>No active Cash, Bank, or Wallet account found.</span>
          {onAddMoneyAccount && customRowIdx === null && (
            <button
              type="button"
              onClick={() => openCustomCreator(0)}
              className="px-2 py-0.5 rounded bg-white border border-amber-300 text-amber-800 font-semibold hover:bg-amber-100 whitespace-nowrap"
            >
              + Add Custom Method
            </button>
          )}
        </div>
        {customRowIdx !== null && onAddMoneyAccount && (
          <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200/80 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-800">Add Custom Payment Method</span>
              <button
                type="button"
                onClick={() => setCustomRowIdx(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                type="text"
                value={customName}
                onChange={(e) => {
                  setCustomName(e.target.value);
                  setCustomError('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleSaveCustomMethod();
                  }
                }}
                placeholder="Method / Account name..."
                className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
              />
              <select
                value={customChannel}
                onChange={(e) => setCustomChannel(e.target.value as MoneySourceChannel)}
                className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
              >
                <option value="Cash">Cash</option>
                <option value="Bank">Bank</option>
                <option value="E-Wallet">Wallet</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {customChannel === 'E-Wallet' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  type="text"
                  value={customWalletType}
                  onChange={(e) => setCustomWalletType(e.target.value)}
                  placeholder="Wallet type..."
                  className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customChargePct}
                  onChange={(e) => setCustomChargePct(e.target.value)}
                  placeholder="Cash-out fee (%)"
                  className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={customChargeFlat}
                  onChange={(e) => setCustomChargeFlat(e.target.value)}
                  placeholder={`Flat fee (${currencySymbol})`}
                  className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                />
              </div>
            )}
            {customError && <p className="text-[11px] text-red-600">{customError}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCustomRowIdx(null)}
                className="px-2.5 py-1 text-[11px] rounded-lg bg-white border border-slate-200 text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveCustomMethod}
                className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-[#0071E3] text-white"
              >
                Add &amp; Select Method
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2'}>
      {(label || splits.length > 1 || typeof maxTotal === 'number') && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {label && <span className="text-xs font-medium text-slate-700">{label}</span>}
          <div className="flex items-center gap-2 text-[11px] ml-auto">
            {splits.length > 1 && (
              <span
                className={`font-mono tabular-nums font-semibold ${
                  exceedsMax ? 'text-red-600' : 'text-slate-600'
                }`}
              >
                Split Total: {formatMoney(totalEntered, currencySymbol)}
                {typeof maxTotal === 'number' ? ` / ${formatMoney(maxTotal, currencySymbol)}` : ''}
              </span>
            )}
            <button
              type="button"
              onClick={addSplitRow}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 text-[#0071E3] hover:bg-blue-100 font-medium transition-colors"
              title="Add another payment method (Cash, Bank, Wallet, or Custom)"
            >
              <Split className="w-3 h-3" />
              {splits.length > 1 ? '+ Method' : '+ Split Payment'}
            </button>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        {splits.map((row, idx) => {
          const validAccount = moneyAccounts.some((a) => a.code === row.accountCode)
            ? row.accountCode
            : moneyAccounts[0].code;
          const selectedAccObj = moneyAccounts.find((a) => a.code === validAccount);
          const cashOutFee = calculateCashOutFee(selectedAccObj, Number(row.amount) || 0);
          const hasWalletFeeConfig =
            selectedAccObj?.channel === 'E-Wallet' &&
            ((selectedAccObj.cashOutChargePercent || 0) > 0 ||
              (selectedAccObj.cashOutChargeFlat || 0) > 0);

          return (
            <div key={idx} className="space-y-1.5">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5">
                <select
                  value={validAccount}
                  onChange={(e) => {
                    if (e.target.value === '__CUSTOM__') {
                      openCustomCreator(idx);
                      return;
                    }
                    updateRow(idx, { accountCode: e.target.value });
                  }}
                  className={`${
                    compact ? 'px-2 py-1.5 text-xs rounded-lg' : 'px-2.5 py-2 text-xs rounded-xl'
                  } bg-white border border-slate-200 min-w-[140px] flex-1`}
                >
                  {moneyAccounts.map((acc) => (
                    <option key={acc.code} value={acc.code}>
                      {acc.name} ({getChannelTag(acc)})
                    </option>
                  ))}
                  {onAddMoneyAccount && (
                    <option value="__CUSTOM__">+ Custom (Add New Method)...</option>
                  )}
                </select>

                <input
                  type="number"
                  min={allowZero ? 0 : 0.01}
                  step="0.01"
                  value={row.amount || ''}
                  onChange={(e) =>
                    updateRow(idx, {
                      amount: e.target.value === '' ? 0 : Math.max(0, Number(e.target.value)),
                    })
                  }
                  placeholder={`Amt (${currencySymbol})`}
                  className={`${
                    compact
                      ? 'w-24 px-2 py-1.5 text-xs rounded-lg'
                      : 'w-28 px-2.5 py-2 text-xs rounded-xl'
                  } font-mono text-right bg-white border ${
                    exceedsMax ? 'border-red-400' : 'border-slate-200'
                  }`}
                />

                {typeof maxTotal === 'number' && maxTotal > 0 && splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => fillRemaining(idx)}
                    className="px-2 py-1 text-[10px] font-medium rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 whitespace-nowrap"
                    title="Fill remaining balance into this method"
                  >
                    Fill
                  </button>
                )}

                {splits.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(idx)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                    title="Remove payment method"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}

                {splits.length === 1 && !label && typeof maxTotal !== 'number' && (
                  <button
                    type="button"
                    onClick={addSplitRow}
                    className="inline-flex items-center gap-0.5 px-2 py-1.5 text-[11px] font-medium rounded-lg bg-blue-50 text-[#0071E3] hover:bg-blue-100 whitespace-nowrap"
                    title="Split across multiple payment methods"
                  >
                    <Plus className="w-3 h-3" />
                    Split
                  </button>
                )}
              </div>

              {hasWalletFeeConfig && (
                <p className="text-[11px] text-slate-500 pl-1 tabular-nums">
                  {selectedAccObj?.walletType ? `${selectedAccObj.walletType} · ` : ''}
                  Cash-out / withdrawal charge:{' '}
                  <span className="font-mono font-medium text-slate-700">
                    {selectedAccObj?.cashOutChargePercent || 0}%
                    {(selectedAccObj?.cashOutChargeFlat || 0) > 0
                      ? ` + ${formatMoney(selectedAccObj?.cashOutChargeFlat || 0, currencySymbol)}`
                      : ''}
                  </span>
                  {cashOutFee > 0 && (
                    <span> · Est. fee on this amount: {formatMoney(cashOutFee, currencySymbol)}</span>
                  )}
                </p>
              )}

              {customRowIdx === idx && onAddMoneyAccount && (
                <div className="p-2.5 rounded-xl bg-blue-50/75 border border-blue-200/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800">
                      Add Custom Payment Method
                    </span>
                    <button
                      type="button"
                      onClick={() => setCustomRowIdx(null)}
                      className="text-slate-400 hover:text-slate-700"
                      aria-label="Close custom payment creator"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={customName}
                      onChange={(e) => {
                        setCustomName(e.target.value);
                        setCustomError('');
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSaveCustomMethod();
                        }
                      }}
                      placeholder="Method / Account name..."
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    />
                    <select
                      value={customChannel}
                      onChange={(e) => setCustomChannel(e.target.value as MoneySourceChannel)}
                      className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                    >
                      <option value="Cash">Cash</option>
                      <option value="Bank">Bank</option>
                      <option value="E-Wallet">Wallet</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  {customChannel === 'E-Wallet' && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={customWalletType}
                        onChange={(e) => setCustomWalletType(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveCustomMethod();
                          }
                        }}
                        placeholder="Wallet type (e.g. Mobile Wallet)"
                        className="px-2.5 py-1.5 text-xs rounded-lg bg-white border border-slate-200"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={customChargePct}
                        onChange={(e) => setCustomChargePct(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveCustomMethod();
                          }
                        }}
                        placeholder="Cash-out charge (%)"
                        className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                      />
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={customChargeFlat}
                        onChange={(e) => setCustomChargeFlat(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleSaveCustomMethod();
                          }
                        }}
                        placeholder={`Flat charge (${currencySymbol})`}
                        className="px-2.5 py-1.5 text-xs font-mono rounded-lg bg-white border border-slate-200"
                      />
                    </div>
                  )}
                  {customError && <p className="text-[11px] text-red-600">{customError}</p>}
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setCustomRowIdx(null)}
                      className="px-2.5 py-1 text-[11px] rounded-lg bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveCustomMethod}
                      className="px-3 py-1 text-[11px] font-semibold rounded-lg bg-[#0071E3] text-white hover:bg-[#0077ED]"
                    >
                      Add Method
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {exceedsMax && (
        <p className="text-[11px] text-red-600 font-medium">
          Combined split payments ({formatMoney(totalEntered, currencySymbol)}) exceed maximum allowed (
          {formatMoney(maxTotal!, currencySymbol)}).
        </p>
      )}
    </div>
  );
}

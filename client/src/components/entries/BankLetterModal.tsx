import { useEffect, useState } from 'react';
import { DateInput } from '@/components/ui/DateInput';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SelectDropdown } from '@/components/ui/SelectDropdown';
import { useToast } from '@/context/ToastContext';
import { BANK_LETTER_INFO, generateBankLetter, type LetterAccount, type LetterBankKey } from '@/utils/bankLetter';

const BANK_OPTIONS: { label: string; value: LetterBankKey }[] = [
  { label: 'SBI PPL Account',                        value: 'sbi_ppl' },
  { label: 'Canara Bank – PD Account',           value: 'can_bank_pd' },
  { label: 'Canara Bank – Scholar Account',      value: 'can_bank_scholar' },
  { label: 'Canara Bank – Both Accounts',        value: 'can_bank_both' },
];

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOfYearIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

interface BankLetterModalProps {
  initialBankKey: LetterBankKey;
  onClose: () => void;
}

export function BankLetterModal({ initialBankKey, onClose }: BankLetterModalProps) {
  const { addToast } = useToast();
  const [bankKey, setBankKey] = useState<LetterBankKey>(initialBankKey);
  const [accounts, setAccounts] = useState<LetterAccount[]>(
    () => BANK_LETTER_INFO[initialBankKey].defaultAccounts.map((a) => ({ ...a }))
  );
  const [fromDate, setFromDate] = useState(firstOfYearIso());
  const [toDate, setToDate] = useState(todayIso());

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleBankChange = (value: string) => {
    const key = value as LetterBankKey;
    setBankKey(key);
    setAccounts(BANK_LETTER_INFO[key].defaultAccounts.map((a) => ({ ...a })));
  };

  const handleAccountNoChange = (index: number, value: string) => {
    setAccounts((prev) => prev.map((a, i) => (i === index ? { ...a, no: value } : a)));
  };

  const handleGenerate = () => {
    if (accounts.some((a) => !a.no.trim())) { addToast('Enter all account numbers', 'error'); return; }
    if (!fromDate || !toDate) { addToast('Enter both From and To dates', 'error'); return; }
    if (fromDate > toDate) { addToast('From date must be before To date', 'error'); return; }
    generateBankLetter({ bankKey, accounts, fromDate, toDate });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-sm font-semibold text-slate-800">
          Request Bank Statement Letter
        </h2>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600">Bank Account</label>
            <SelectDropdown
              value={bankKey}
              onChange={handleBankChange}
              options={BANK_OPTIONS}
              triggerCls="flex w-full items-center justify-between gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            />
          </div>

          {accounts.length > 1 ? (
            <div className="flex flex-col gap-3">
              {accounts.map((acc, i) => (
                <Input
                  key={i}
                  label={`Account No — ${acc.label}`}
                  value={acc.no}
                  onChange={(e) => handleAccountNoChange(i, e.target.value)}
                  placeholder="Enter account number"
                />
              ))}
            </div>
          ) : (
            <Input
              label="Account No"
              value={accounts[0]?.no ?? ''}
              onChange={(e) => handleAccountNoChange(0, e.target.value)}
              placeholder="Enter account number"
            />
          )}

          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Period From" value={fromDate} onChange={setFromDate} />
            <DateInput label="Period To" value={toDate} onChange={setToDate} />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate}>Generate Letter</Button>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { Input } from '@/components/ui/Input';
import { DateInput } from '@/components/ui/DateInput';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { SuggestDropdown } from '@/components/ui/SuggestDropdown';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import { apiCreatePendingBill, apiGetPendingBills } from '@/api/pendingBills';
import { toProperCase } from '@smp-cashbook/shared';
import { usePendingBills } from '@/hooks/usePendingBills';
import type { PendingBill, PendingBillFormData } from '@smp-cashbook/shared';

const EMPTY_FORM: PendingBillFormData = {
  date: '',
  bank: '',
  chqNoOrCash: '',
  amount: '',
  headOfAccount: '',
  firmName: '',
  billNumber: '',
  billDate: '',
  particulars: '',
  remarks: '',
};

interface FormErrors {
  date?: string;
  amount?: string;
  headOfAccount?: string;
  firmName?: string;
  billNumber?: string;
  billDate?: string;
}

const SUGGEST_CAP = 6;

/** Case-insensitive substring match over a field, deduped, capped, current-year-first with previous-year fallback */
function buildSuggestions(query: string, current: PendingBill[], prev: PendingBill[], field: keyof PendingBill): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const bill of current) {
    const val = String(bill[field] ?? '');
    if (val && !seen.has(val) && val.toLowerCase().includes(q)) {
      seen.add(val);
      result.push(val);
      if (result.length === SUGGEST_CAP) return result;
    }
  }
  for (const bill of prev) {
    const val = String(bill[field] ?? '');
    if (val && !seen.has(val) && val.toLowerCase().includes(q)) {
      seen.add(val);
      result.push(val);
      if (result.length === SUGGEST_CAP) return result;
    }
  }
  return result;
}

export function PendingBillForm() {
  const { settings } = useSettings();
  const { addToast } = useToast();
  const [form, setForm] = useState<PendingBillFormData>(EMPTY_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const { bills } = usePendingBills(settings.activeFinancialYear, settings.activeCashBookType);

  // ── Previous-year bills for suggestion fallback ────────────────────────────
  const [prevBills, setPrevBills] = useState<PendingBill[]>([]);
  const previousFYs = useMemo(
    () => settings.financialYears.filter((fy) => fy !== settings.activeFinancialYear),
    [settings.financialYears, settings.activeFinancialYear]
  );

  useEffect(() => {
    if (previousFYs.length === 0) { setPrevBills([]); return; }
    const types = settings.activeCashBookType === 'Both'
      ? ['Aided', 'Un-Aided']
      : [settings.activeCashBookType];
    let cancelled = false;
    Promise.all(
      previousFYs.flatMap((fy) => types.map((type) => apiGetPendingBills(fy, type)))
    ).then((results) => {
      if (!cancelled) setPrevBills(results.flat());
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [previousFYs, settings.activeCashBookType]);

  const set = (field: keyof PendingBillFormData, value: string) =>
    setForm((f) => ({ ...f, [field]: value }));

  // ── Autocomplete: Bank, Head of Account, Firm Name, Particulars ────────────
  const [bankOpen, setBankOpen]           = useState(false);
  const [hoaOpen, setHoaOpen]             = useState(false);
  const [firmOpen, setFirmOpen]           = useState(false);
  const [particularsOpen, setParticularsOpen] = useState(false);

  const bankSuggestions        = useMemo(() => buildSuggestions(form.bank, bills, prevBills, 'bank'), [form.bank, bills, prevBills]);
  const hoaSuggestions         = useMemo(() => buildSuggestions(form.headOfAccount, bills, prevBills, 'headOfAccount'), [form.headOfAccount, bills, prevBills]);
  const firmSuggestions        = useMemo(() => buildSuggestions(form.firmName, bills, prevBills, 'firmName'), [form.firmName, bills, prevBills]);
  const particularsSuggestions = useMemo(() => buildSuggestions(form.particulars, bills, prevBills, 'particulars'), [form.particulars, bills, prevBills]);

  const selectBank        = (v: string) => { set('bank', v); setBankOpen(false); };
  const selectHoa         = (v: string) => { set('headOfAccount', v); setHoaOpen(false); };
  const selectFirm        = (v: string) => { set('firmName', v); setFirmOpen(false); };
  const selectParticulars = (v: string) => { set('particulars', v); setParticularsOpen(false); };

  const validate = (): boolean => {
    const e: FormErrors = {};
    if (!form.date) e.date = 'Date is required';
    if (!form.amount || isNaN(Number(form.amount)) || Number(form.amount) <= 0)
      e.amount = 'Amount must be a positive number';
    if (!form.headOfAccount.trim()) e.headOfAccount = 'Head of Account is required';
    if (!form.firmName.trim()) e.firmName = 'Firm Name is required';
    if (!form.billNumber.trim()) e.billNumber = 'Bill Number is required';
    if (!form.billDate) e.billDate = 'Bill Date is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (settings.activeCashBookType === 'Both') {
      addToast('Switch to Aided or Un-Aided to add pending bills', 'error');
      return;
    }
    setSubmitting(true);
    try {
      await apiCreatePendingBill({
        date: form.date,
        bank: form.bank ? toProperCase(form.bank.trim()) : '',
        chqNoOrCash: form.chqNoOrCash.trim(),
        amount: Number(form.amount),
        headOfAccount: toProperCase(form.headOfAccount.trim()),
        firmName: toProperCase(form.firmName.trim()),
        billNumber: form.billNumber.trim(),
        billDate: form.billDate,
        particulars: form.particulars ? toProperCase(form.particulars.trim()) : '',
        remarks: form.remarks.trim(),
        status: 'Pending',
        financialYear: settings.activeFinancialYear,
        cashBookType: settings.activeCashBookType,
      });
      addToast('Pending bill added successfully', 'success');
      setForm(EMPTY_FORM);
      setErrors({});
      setTimeout(() => { dateRef.current?.focus(); dateRef.current?.select(); }, 0);
    } catch (err: unknown) {
      addToast(err instanceof Error ? err.message : 'Failed to save bill', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">

      {/* Row 1: Date + Bank + Chq No/Cash + Amount */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <DateInput
          ref={dateRef}
          label="Date"
          id="bill-date"
          value={form.date}
          onChange={(iso) => set('date', iso)}
          error={errors.date}
        />
        <div className="relative">
          <Input
            label="Bank"
            id="bill-bank"
            type="text"
            placeholder="E.g. Canara Bank"
            value={form.bank}
            onChange={(e) => { set('bank', toProperCase(e.target.value)); setBankOpen(true); }}
            onFocus={() => setBankOpen(true)}
            onBlur={() => setBankOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setBankOpen(false); return; }
              if (e.key === 'Tab' && bankOpen && bankSuggestions.length > 0) {
                e.preventDefault(); selectBank(bankSuggestions[0]);
              }
            }}
            autoComplete="off"
          />
          {bankOpen && <SuggestDropdown suggestions={bankSuggestions} onSelect={selectBank} />}
        </div>
        <Input
          label="Chq No / Cash"
          id="bill-chq"
          type="text"
          placeholder="E.g. Cash, Neft, 001234"
          value={form.chqNoOrCash}
          onChange={(e) => set('chqNoOrCash', e.target.value)}
          autoComplete="off"
        />
        <Input
          label="Amount (₹)"
          id="bill-amount"
          type="number"
          min="0.01"
          step="0.01"
          placeholder="0.00"
          value={form.amount}
          onChange={(e) => set('amount', e.target.value)}
          error={errors.amount}
        />
      </div>

      {/* Row 2: Head of Account + Firm Name + Bill Number + Bill Date */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="relative">
          <Input
            label="Head of Account"
            id="bill-hoa"
            type="text"
            placeholder="E.g. Stationery"
            value={form.headOfAccount}
            onChange={(e) => { set('headOfAccount', toProperCase(e.target.value)); setHoaOpen(true); }}
            onFocus={() => setHoaOpen(true)}
            onBlur={() => setHoaOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setHoaOpen(false); return; }
              if (e.key === 'Tab' && hoaOpen && hoaSuggestions.length > 0) {
                e.preventDefault(); selectHoa(hoaSuggestions[0]);
              }
            }}
            error={errors.headOfAccount}
            autoComplete="off"
          />
          {hoaOpen && <SuggestDropdown suggestions={hoaSuggestions} onSelect={selectHoa} />}
        </div>
        <div className="relative">
          <Input
            label="Firm Name"
            id="bill-firm"
            type="text"
            placeholder="E.g. Sri Sai Traders"
            value={form.firmName}
            onChange={(e) => { set('firmName', toProperCase(e.target.value)); setFirmOpen(true); }}
            onFocus={() => setFirmOpen(true)}
            onBlur={() => setFirmOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setFirmOpen(false); return; }
              if (e.key === 'Tab' && firmOpen && firmSuggestions.length > 0) {
                e.preventDefault(); selectFirm(firmSuggestions[0]);
              }
            }}
            error={errors.firmName}
            autoComplete="off"
          />
          {firmOpen && <SuggestDropdown suggestions={firmSuggestions} onSelect={selectFirm} />}
        </div>
        <Input
          label="Bill Number"
          id="bill-number"
          type="text"
          placeholder="E.g. INV-2026-114"
          value={form.billNumber}
          onChange={(e) => set('billNumber', e.target.value)}
          error={errors.billNumber}
          autoComplete="off"
        />
        <DateInput
          label="Bill Date"
          id="bill-bill-date"
          value={form.billDate}
          onChange={(iso) => set('billDate', iso)}
          error={errors.billDate}
        />
      </div>

      {/* Particulars + Remarks + Submit */}
      <div className="flex gap-4 items-end">
        <div className="flex-1 relative">
          <Textarea
            label="Particulars"
            id="bill-particulars"
            placeholder=""
            value={form.particulars}
            onChange={(e) => { set('particulars', toProperCase(e.target.value)); setParticularsOpen(true); }}
            onFocus={() => setParticularsOpen(true)}
            onBlur={() => setParticularsOpen(false)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setParticularsOpen(false); return; }
              if (e.key === 'Tab' && particularsOpen && particularsSuggestions.length > 0) {
                e.preventDefault(); selectParticulars(particularsSuggestions[0]); return;
              }
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); }
            }}
          />
          {particularsOpen && <SuggestDropdown suggestions={particularsSuggestions} onSelect={selectParticulars} />}
        </div>
        <div className="flex-1">
          <Textarea
            label="Remarks"
            id="bill-remarks"
            placeholder=""
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); formRef.current?.requestSubmit(); }
            }}
          />
        </div>
        <div className="shrink-0 self-end flex flex-col items-stretch gap-4">
          <Button type="submit" loading={submitting} className="h-[38px] px-8">
            Add Bill
          </Button>
          <button
            type="button"
            onClick={() => { setForm(EMPTY_FORM); setErrors({}); }}
            className="h-[28px] rounded-md border border-dashed border-slate-300 bg-white px-4 text-xs font-medium text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

    </form>
  );
}

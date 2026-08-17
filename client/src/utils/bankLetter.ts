import { INSTITUTE_LOGO_B64 } from './instituteLogo';

export type LetterBankKey = 'sbi_ppl' | 'can_bank_pd' | 'can_bank_scholar' | 'can_bank_both';

export const COLLEGE_EMAIL = 'smp308ppl@gmail.com';

export interface LetterAccount {
  /** Short label shown alongside the number when a letter lists more than one account, e.g. "PD Account" */
  label: string;
  no: string;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Format today's date as "15 March 2025" */
function formatToday(): string {
  const d = new Date();
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Format an ISO "YYYY-MM-DD" date as "15 March 2025" */
function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface BankLetterInfo {
  bankName: string;
  branchName: string;
  branchAddress: string;
  defaultAccounts: LetterAccount[];
}

export const BANK_LETTER_INFO: Record<LetterBankKey, BankLetterInfo> = {
  sbi_ppl: {
    bankName: 'State Bank of India',
    branchName: 'Sagar Branch',
    branchAddress: 'Sagar – 577 401, Shimoga Dist., Karnataka',
    defaultAccounts: [{ label: 'SBI PPL Account', no: '64049891981' }],
  },
  can_bank_pd: {
    bankName: 'Canara Bank',
    branchName: 'Sagar Branch',
    branchAddress: 'Sagar – 577 401, Shimoga Dist., Karnataka',
    defaultAccounts: [{ label: 'PD Account', no: '0574101037946' }],
  },
  can_bank_scholar: {
    bankName: 'Canara Bank',
    branchName: 'Sagar Branch',
    branchAddress: 'Sagar – 577 401, Shimoga Dist., Karnataka',
    defaultAccounts: [{ label: 'Scholar Account', no: '0574101009717' }],
  },
  can_bank_both: {
    bankName: 'Canara Bank',
    branchName: 'Sagar Branch',
    branchAddress: 'Sagar – 577 401, Shimoga Dist., Karnataka',
    defaultAccounts: [
      { label: 'PD Account', no: '0574101037946' },
      { label: 'Scholar Account', no: '0574101009717' },
    ],
  },
};

export interface BankLetterData {
  bankKey: LetterBankKey;
  accounts: LetterAccount[];
  /** ISO "YYYY-MM-DD" */
  fromDate: string;
  /** ISO "YYYY-MM-DD" */
  toDate: string;
}

/** "0574101037946" (single) or "0574101037946 (PD Account) and 0574101009717 (Scholar Account)" (multiple) */
function formatAccountsWithLabels(accounts: LetterAccount[]): string {
  if (accounts.length === 1) return esc(accounts[0].no.trim());
  const parts = accounts.map((a) => `${esc(a.no.trim())} (${esc(a.label)})`);
  return parts.length === 2
    ? parts.join(' and ')
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** "0574101037946" (single) or "0574101037946, 0574101009717" (multiple) — for the subject line */
function formatAccountNumbers(accounts: LetterAccount[]): string {
  return accounts.map((a) => esc(a.no.trim())).join(', ');
}

export function buildBankLetterHTML(data: BankLetterData): string {
  const info = BANK_LETTER_INFO[data.bankKey];
  const today = formatToday();
  const accountsList = formatAccountsWithLabels(data.accounts);
  const accountNumbers = formatAccountNumbers(data.accounts);
  const isPlural = data.accounts.length > 1;
  const fromDate = esc(formatIsoDate(data.fromDate));
  const toDate = esc(formatIsoDate(data.toDate));
  const refNumber = `SMP/ACCOUNTS/${new Date().getFullYear()}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Bank Statement Request &#8211; ${esc(info.bankName)}</title>
<style>
  @page { size: A4 portrait; margin: 8mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Times New Roman', Times, serif;
    font-size: 12pt;
    color: #000;
    background: #fff;
  }
  @media screen {
    html { background: #94a3b8; min-height: 100%; padding: 24px 0; }
    body { max-width: 210mm; margin: 0 auto; background: #fff; box-shadow: 0 4px 24px rgba(0,0,0,0.22); border-radius: 4px; }
  }

  .page {
    min-height: calc(297mm - 16mm);
    display: flex;
    flex-direction: column;
  }

  .header {
    display: flex;
    align-items: flex-start;
    gap: 10pt;
    padding: 10pt 14pt 10pt;
    border-bottom: 4pt double #000;
  }
  .header-text {
    flex: 1;
    text-align: center;
  }
  .college-name {
    font-size: 20pt;
    font-weight: bold;
    letter-spacing: 0.6pt;
    margin-bottom: 3pt;
    white-space: nowrap;
  }
  .college-tagline {
    font-size: 8.5pt;
    margin-bottom: 4pt;
  }
  .college-instcode {
    font-size: 12pt;
    font-weight: bold;
    margin-bottom: 3pt;
  }
  .college-address {
    font-size: 10pt;
    margin-bottom: 2pt;
  }
  .college-contact {
    font-size: 10pt;
  }
  .seal-header {
    flex-shrink: 0;
    width: 72pt;
    height: 72pt;
    object-fit: contain;
  }

  .ref-row {
    display: flex;
    justify-content: space-between;
    padding: 7pt 18pt 6pt;
    font-size: 11pt;
  }

  .body {
    padding: 20pt 28pt 0;
  }

  .letter-title {
    text-align: center;
    font-size: 14pt;
    font-weight: bold;
    text-decoration: underline;
    margin-bottom: 22pt;
  }

  .addr-block {
    font-size: 12pt;
    line-height: 1.7;
    margin-bottom: 26pt;
  }

  .subject-row {
    font-size: 12pt;
    margin-bottom: 24pt;
  }

  .salutation {
    font-size: 12pt;
    margin-bottom: 20pt;
  }

  .letter-para {
    font-size: 12.5pt;
    line-height: 2.0;
    text-align: justify;
    text-indent: 36pt;
    margin-bottom: 16pt;
  }
  .hl {
    font-weight: bold;
  }

  .closing {
    font-size: 12pt;
    margin-top: 8pt;
    margin-bottom: 4pt;
  }

  .seal-circle {
    width: 80pt;
    height: 80pt;
    border: 1.5pt dashed #999;
    border-radius: 50%;
    margin: 0 0 8pt;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 7pt;
    color: #aaa;
    letter-spacing: 1pt;
  }

  .sig-section {
    margin-top: 40pt;
    padding-bottom: 22pt;
  }
  .footer-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .footer-left {
    font-size: 11.5pt;
    line-height: 1.8;
  }
  .sig-block {
    text-align: center;
    min-width: 170pt;
  }
  .sig-space {
    height: 38pt;
  }
  .sig-line {
    border-top: 1pt solid #000;
    margin-bottom: 5pt;
  }
  .sig-title {
    font-size: 13pt;
    font-weight: bold;
  }

  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
<div class="page">

  <!-- Header -->
  <div class="header">
    <div style="flex-shrink:0;width:72pt"></div>
    <div class="header-text">
      <div class="college-name">SANJAY MEMORIAL POLYTECHNIC</div>
      <div class="college-tagline">(Approved by A.I.C.T.E., New&#8209;Delhi, and running with Grant&#8209;in&#8209;aid of State Govt. of Karnataka)</div>
      <div class="college-instcode">[Inst. Code: 308]</div>
      <div class="college-address">Ikkeri Road, Sagar &#8211; 577 401, Shimoga Dist., Karnataka.</div>
      <div class="college-contact">Phone: 9449685992</div>
    </div>
    <img class="seal-header" src="${INSTITUTE_LOGO_B64}" alt="Institute Crest" />
  </div>

  <!-- Ref / Date -->
  <div class="ref-row">
    <span>Ref: ${esc(refNumber)}</span>
    <span>Date: ${today}</span>
  </div>

  <!-- Letter body -->
  <div class="body">

    <div class="addr-block">
      To,<br/>
      Manager,<br/>
      ${esc(info.bankName)},<br/>
      ${esc(info.branchName)}, ${esc(info.branchAddress)}
    </div>

    <div class="subject-row">
      <strong>Subject:</strong> Request for issue of Bank Statement${isPlural ? 's' : ''} &#8211;
      Account No${isPlural ? 's' : ''}. <span class="hl">${accountNumbers}</span>
    </div>

    <div class="salutation">Sir / Madam,</div>

    <p class="letter-para">
      We are maintaining ${isPlural ? 'accounts' : 'an account'} bearing Account No${isPlural ? 's' : ''}.
      <span class="hl">${accountsList}</span> with your branch in the name of this institution.
      We request you to kindly issue / provide the statement${isPlural ? 's' : ''} of the said
      account${isPlural ? 's' : ''}, for the period from <span class="hl">${fromDate}</span> to
      <span class="hl">${toDate}</span>, for our office and audit records.
    </p>

    <p class="letter-para">
      Kindly arrange to email the statement${isPlural ? 's' : ''} to our official email ID
      <span class="hl">${esc(COLLEGE_EMAIL)}</span>, or hand over the same at the earliest.
      This is for official purposes only.
    </p>

    <div class="closing">Thanking you,</div>

    <!-- Signature -->
    <div class="sig-section">
      <div class="footer-row">

        <div class="footer-left">
          <div class="seal-circle">SEAL</div>
          <div><strong>Place:</strong>&nbsp; Sagar</div>
        </div>

        <div class="sig-block">
          <div class="sig-space"></div>
          <div class="sig-line"></div>
          <div class="sig-title">Principal</div>
        </div>

      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}

export function generateBankLetter(data: BankLetterData): void {
  const base = buildBankLetterHTML(data);
  const html = base.replace('</body>', `<script>
  window.onload = function () {
    window.print();
    window.addEventListener('afterprint', function () { window.close(); });
  };
</script>\n</body>`);
  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (win) {
    win.addEventListener('afterprint', () => URL.revokeObjectURL(url));
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

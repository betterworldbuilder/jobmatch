import crypto from 'node:crypto';

/* The only payment provider implemented in v1: manual VietQR/bank-transfer
 * confirmation reviewed by an admin. Deliberately thin and self-contained so
 * a future automated provider (e.g. Stripe) can implement the same shape
 * (methodIds + instructions()) without reworking the subscription/payment
 * model above it — see PLAN "Known limitations". */

export const MANUAL_METHOD_IDS = ['vietqr', 'bank_transfer', 'international_bank_transfer', 'usdt_trc20', 'sepa_transfer'];

/* USDT (founder, 2026-11-24, option "SARL only"): paid to JobsMatchNow SARL's wallet, ONLY by customers outside
 * Vietnam (crypto is not a lawful means of payment there). Confirmed by an admin after checking the transaction
 * hash on the blockchain, like a bank transfer. Off until the SARL wallet address is set (admin or env). */
export const USDT_METHOD = 'usdt_trc20';
export const isVietnam = (country) => /^(viet ?nam|vn)$/i.test(String(country || '').trim());
/** The company's country: the profile's country, else the last part of "headquarters" ("Paris, France" → France). */
export function companyCountry(recruiter) {
  if (recruiter?.country) return String(recruiter.country).trim();
  const hq = String(recruiter?.headquarters || '').split(',').map((s) => s.trim()).filter(Boolean);
  return hq.length > 1 ? hq[hq.length - 1] : '';
}

/* JobsMatchNow SARL's own bank account (founder, 2026-11-24): SEPA transfers from the EU and international wires. */
export const BANK_INSTRUCTION_FIELDS = ['bankAccountName', 'bankName', 'bankAccountNumber', 'bankSwift', 'vietQrImageUrl', 'supportEmail', 'usdtTrc20Address',
  'sarlAccountName', 'sarlBankName', 'sarlIban', 'sarlBic'];

/** Bank/VietQR instructions shown on the billing page — admin-editable
 * (db.siteSettings.bankInstructions, set from the admin dashboard) with env
 * vars as a fallback default for whichever fields haven't been set there yet.
 * Never stores more of the recruiter's own banking info than the reference
 * fields they type in themselves. */
export function paymentInstructions(db) {
  const stored = db?.siteSettings?.bankInstructions || {};
  return {
    bankAccountName: stored.bankAccountName || process.env.BILLING_BANK_ACCOUNT_NAME || '',
    bankName: stored.bankName || process.env.BILLING_BANK_NAME || '',
    bankAccountNumber: stored.bankAccountNumber || process.env.BILLING_BANK_ACCOUNT_NUMBER || '',
    bankSwift: stored.bankSwift || process.env.BILLING_BANK_SWIFT || '',
    vietQrImageUrl: stored.vietQrImageUrl || process.env.BILLING_VIETQR_IMAGE_URL || '',
    supportEmail: stored.supportEmail || process.env.BILLING_SUPPORT_EMAIL || '',
    usdtTrc20Address: stored.usdtTrc20Address || process.env.BILLING_USDT_TRC20_ADDRESS || '',
    sarlAccountName: stored.sarlAccountName || process.env.BILLING_SARL_ACCOUNT_NAME || '',
    sarlBankName: stored.sarlBankName || process.env.BILLING_SARL_BANK_NAME || '',
    sarlIban: stored.sarlIban || process.env.BILLING_SARL_IBAN || '',
    sarlBic: stored.sarlBic || process.env.BILLING_SARL_BIC || '',
  };
}

/** IBAN: 2 letters, 2 digits, then up to 30 letters/digits (spaces allowed), with the mod-97 checksum. */
export function isIban(s) {
  const v = String(s || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const moved = v.slice(4) + v.slice(0, 4);
  const digits = moved.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

/** A TRON (TRC-20) address: starts with T, 34 base58 characters. */
export const isTrc20Address = (s) => /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(String(s || ''));
/** A TRON transaction id: 64 hex characters. */
export const isTronTxHash = (s) => /^[0-9a-fA-F]{64}$/.test(String(s || ''));

/** `INV-YYYYMM-XXXXXX`: human-readable, not sequential/guessable (the suffix
 * is random), collision-checked against existing payments before use. */
export function generateInvoiceNumber(db) {
  const now = new Date();
  const prefix = `INV-${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}-`;
  let invoiceNumber;
  do {
    invoiceNumber = `${prefix}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  } while ((db.payments || []).some((payment) => payment.invoiceNumber === invoiceNumber));
  return invoiceNumber;
}

/** A short reference the recruiter is asked to put in their transfer memo, so
 * an admin can match an incoming bank transfer back to this payment record. */
export function generateTransferReference(db) {
  let reference;
  do {
    reference = `JMN${crypto.randomBytes(5).toString('base64url').replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`;
  } while ((db.payments || []).some((payment) => payment.paymentReference === reference));
  return reference;
}

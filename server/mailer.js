/**
 * Pluggable mailer. Sends via SMTP when SMTP_HOST/SMTP_USER are configured;
 * otherwise logs the message to the server console (dev mode) so flows are
 * testable without an email provider — same optional-integration pattern as
 * SSO and the Claude API.
 *
 * JobFinder (2026-11-25): `replyTo` (set only when a candidate agreed to share their email) and the provider's
 * message id as evidence that the message was accepted. Tests install a fake sender, so no real email ever leaves.
 */
export function mailerConfigured() {
  return Boolean(testSender) || Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
}

let testSender = null;
/** Tests only: replace the SMTP transport with a function ({to, subject, text, replyTo}) => {messageId} | throws. */
export function __setTestSender(fn) { testSender = fn; }

export async function sendMail({ to, subject, text, html, replyTo, fromName }) {
  if (testSender) {
    const info = await testSender({ to, subject, text, html, replyTo, fromName });
    return { delivered: true, messageId: info?.messageId };
  }
  if (!mailerConfigured()) {
    // Mail bodies carry live sign-in links (reset, verify) — never put them in production logs.
    if (process.env.NODE_ENV === 'production') console.log(`[mailer:off] not sent → ${to} (${subject})`);
    else console.log(`[mailer:dev] → ${to}\n  subject: ${subject}\n  ${text}`);
    return { delivered: false, dev: true };
  }
  const nodemailer = await import('nodemailer');
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  // fromName (e.g. "JobMatcher at JobsMatchNow") keeps the configured sending address and only changes the display name.
  const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER;
  const from = fromName ? `"${String(fromName).replace(/["\r\n]/g, '')}" <${(String(fromAddress).match(/<([^>]+)>/)?.[1] || fromAddress).trim()}>` : fromAddress;
  const info = await transport.sendMail({ from, to, subject, text, html, ...(replyTo ? { replyTo } : {}) });
  return { delivered: true, messageId: info?.messageId };
}

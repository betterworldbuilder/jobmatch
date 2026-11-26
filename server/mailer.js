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

/**
 * Mail channels (founder, 2026-11-26). "outreach" = cold emails + follow-ups to recruiters; it uses its own sender when
 * OUTREACH_SMTP_HOST / OUTREACH_SMTP_USER / OUTREACH_SMTP_PASS / OUTREACH_FROM are set (e.g. Resend on the subdomain
 * mail.jobsmatchnow.com), so cold-email reputation never touches the main domain or account emails. Falls back to the
 * default SMTP_* sender until it is configured. Every other email (verify, reset, billing) keeps SMTP_*.
 */
export function smtpConfig(channel) {
  const o = channel === 'outreach' && process.env.OUTREACH_SMTP_HOST && process.env.OUTREACH_SMTP_USER;
  const p = o ? 'OUTREACH_SMTP_' : 'SMTP_';
  return {
    host: process.env[`${p}HOST`], port: Number(process.env[`${p}PORT`] || 587), secure: process.env[`${p}SECURE`] === 'true',
    user: process.env[`${p}USER`], pass: process.env[`${p}PASS`],
    from: (o ? process.env.OUTREACH_FROM : process.env.SMTP_FROM) || process.env[`${p}USER`], channel: o ? 'outreach' : 'default',
  };
}

let testSender = null;
/** Tests only: replace the SMTP transport with a function ({to, subject, text, replyTo}) => {messageId} | throws. */
export function __setTestSender(fn) { testSender = fn; }

export async function sendMail({ to, subject, text, html, replyTo, fromName, channel, unsubscribeUrl }) {
  if (testSender) {
    const info = await testSender({ to, subject, text, html, replyTo, fromName, channel, unsubscribeUrl });
    return { delivered: true, messageId: info?.messageId };
  }
  if (!mailerConfigured()) {
    // Mail bodies carry live sign-in links (reset, verify) — never put them in production logs.
    if (process.env.NODE_ENV === 'production') console.log(`[mailer:off] not sent → ${to} (${subject})`);
    else console.log(`[mailer:dev] → ${to}\n  subject: ${subject}\n  ${text}`);
    return { delivered: false, dev: true };
  }
  const nodemailer = await import('nodemailer');
  const cfg = smtpConfig(channel);
  const transport = nodemailer.createTransport({ host: cfg.host, port: cfg.port, secure: cfg.secure, auth: { user: cfg.user, pass: cfg.pass } });
  // fromName (e.g. "JobMatcher at JobsMatchNow") keeps the configured sending address and only changes the display name.
  const fromAddress = cfg.from;
  const from = fromName ? `"${String(fromName).replace(/["\r\n]/g, '')}" <${(String(fromAddress).match(/<([^>]+)>/)?.[1] || fromAddress).trim()}>` : fromAddress;
  // Bulk-sender rules (Gmail / Outlook): outreach carries a one-click unsubscribe header.
  const headers = unsubscribeUrl ? { 'List-Unsubscribe': `<${unsubscribeUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } : undefined;
  const info = await transport.sendMail({ from, to, subject, text, html, ...(replyTo ? { replyTo } : {}), ...(headers ? { headers } : {}) });
  // Evidence without personal data: which channel accepted it and the provider's message id.
  if (channel === 'outreach') console.log(`[mailer] outreach accepted via ${cfg.channel} sender (${String(info?.messageId || '').slice(0, 60)})`);
  return { delivered: true, messageId: info?.messageId };
}

/** URL safety for job links (2026-11-25): validate pasted links and refuse server-side requests to local, private or
 *  otherwise restricted network destinations. Used by job-link-import.js and the JobFinder routes. */
import dns from 'node:dns';
import net from 'node:net';
import { ValidationError } from './matching.js';

const MAX_URL = 2048;

/** True for addresses a server must never call: loopback, private, link-local, CGNAT, multicast, reserved. */
export function isRestrictedIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  if (v === 6) {
    const s = ip.toLowerCase();
    if (s === '::' || s === '::1') return true;
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isRestrictedIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(s)) return true; // mapped IPv4 in hex form: refuse
    return /^f[cd]/.test(s) || /^fe[89ab]/.test(s) || /^ff/.test(s) || s.startsWith('64:ff9b:') || s.startsWith('2001:db8');
  }
  return true; // not an IP at all: treat as unsafe
}

/** Validate a pasted job link. Returns the parsed URL or throws a ValidationError with a safe message. */
export function validateJobUrl(raw) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) throw new ValidationError('url', 'Paste a job link');
  if (value.length > MAX_URL) throw new ValidationError('url', 'That link is too long');
  let url;
  try { url = new URL(value); } catch { throw new ValidationError('url', 'That is not a valid link'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ValidationError('url', 'Links must start with http:// or https://');
  if (url.username || url.password) throw new ValidationError('url', 'Links with a user name or password are not accepted');
  if (url.port && !['80', '443'].includes(url.port)) throw new ValidationError('url', 'Links to unusual ports are not accepted');
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (net.isIP(host)) {
    if (isRestrictedIp(host)) throw new ValidationError('url', 'Links to local or private network addresses are not accepted');
  } else if (!host.includes('.') || host === 'localhost' || /\.(localhost|local|internal|intranet|lan|home|corp|test|invalid)$/.test(host)) {
    throw new ValidationError('url', 'Links to local or private network addresses are not accepted');
  }
  return url;
}

/** Resolve a host and refuse it if any address is restricted (defence in depth before every server-side request). */
export async function assertPublicHost(hostname, lookup = dns.promises.lookup) {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => isRestrictedIp(a.address))) {
    const e = new Error('Restricted network destination'); e.code = 'RESTRICTED_HOST'; throw e;
  }
}

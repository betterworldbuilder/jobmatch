import type { SalaryRange } from '../types';

/** "USD 40,000–60,000", or "From USD 40,000" when a role gives only a minimum (salary optional, 2026-11-25). */
export function salaryRangeText(r: SalaryRange): string {
  const n = (v: number) => v.toLocaleString('en-US');
  return r.max != null ? `${r.currency} ${n(r.min)}–${n(r.max)}` : `From ${r.currency} ${n(r.min)}`;
}

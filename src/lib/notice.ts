// A short confirmation shown at the bottom of the screen (phone and desktop), e.g. right after applying to an imported
// role: "The recruiter has been contacted" (founder, 2026-11-26). Plain DOM so any screen can call it.
export function showNotice(text: string, ms = 6500) {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.jm-notice').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'jm-notice';
  el.setAttribute('role', 'status');
  el.textContent = text;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
  window.setTimeout(() => el.remove(), ms);
}

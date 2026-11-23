// Pages inside a swipe card (founder, 2026-11-22): thin progress bars at the top (tap one to jump), the page
// name ("Who I am · 2/9"), ‹ › on the card edges, and on the photo page tap left / right to go back / next.
// Dragging the card is still Pass / Like (the card handles that); taps here only change the page.
import { ChevronLeft, ChevronRight } from 'lucide-react';

// `demo` (founder, 2026-11-23): every card that belongs to a demo account carries a DEMO ACCOUNT stamp under the
// page name, on every page, so nobody mistakes a demo role or candidate for a real one.
export function SwipePager({ pages, page, onPage, tapZones = false, demo = false }: { pages: string[]; page: number; onPage: (p: number) => void; tapZones?: boolean; demo?: boolean }) {
  const go = (p: number) => onPage(Math.max(0, Math.min(pages.length - 1, p)));
  const stop = (e: React.PointerEvent) => e.stopPropagation(); // a tap here never starts a card drag
  return <>
    <div className="sp-top" onPointerDownCapture={stop}>
      <div className="sp-bars" role="tablist" aria-label="Profile pages">
        {pages.map((label, i) => <button key={label} type="button" role="tab" aria-selected={i === page} aria-label={label} className={i < page ? 'done' : i === page ? 'on' : ''} onClick={() => go(i)}><i /></button>)}
      </div>
      <p className="sp-label" aria-live="polite">{pages[page]} <span>· {page + 1}/{pages.length}</span></p>
      {demo && <p className="sp-demo" title="Demo account — not a real person or opening">Demo account</p>}
    </div>
    {tapZones && <>
      <button type="button" className="sp-zone left" aria-label="Previous page" onClick={() => go(page - 1)} />
      <button type="button" className="sp-zone right" aria-label="Next page" onClick={() => go(page + 1)} />
    </>}
    {page > 0 && <button type="button" className="sp-arrow left" onPointerDownCapture={stop} onClick={() => go(page - 1)} aria-label={`Previous: ${pages[page - 1]}`}><ChevronLeft size={18} /></button>}
    {page < pages.length - 1 && <button type="button" className="sp-arrow right" onPointerDownCapture={stop} onClick={() => go(page + 1)} aria-label={`Next: ${pages[page + 1]}`}><ChevronRight size={18} /></button>}
  </>;
}

/** Keyboard paging for a deck (↓ / PageDown next, PageUp previous; ← → ↑ stay Pass / Like / Forward). */
export function pageKey(key: string): 1 | -1 | 0 {
  if (key === 'ArrowDown' || key === 'PageDown') return 1;
  if (key === 'PageUp') return -1;
  return 0;
}

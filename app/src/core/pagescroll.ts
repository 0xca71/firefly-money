/* =====================================================================
   The page scrolls inside #view > .pg (the page's content, below the title row), not in the window: the title row
   stays put and the content fades out under its edge (money.css). The code that reads or drives the page scroll
   (pull to refresh, the title bar, the tab bar fold, back to top…) was written against the window, so these make
   scrollY, scrollTo, scrollBy and the window's scroll event follow .pg instead. Without a .pg (sign-in, an error
   screen) they fall through to the window as before.
   ===================================================================== */
const pg = () => document.querySelector<HTMLElement>('#view > .pg');
const win = { scrollTo: window.scrollTo.bind(window), scrollBy: window.scrollBy.bind(window) };
const top = () => { const p = pg(); return p ? p.scrollTop : document.scrollingElement ? document.scrollingElement.scrollTop : 0; };
for (const k of ['scrollY', 'pageYOffset']) Object.defineProperty(window, k, { configurable: true, get: top });
window.scrollTo = ((a?: number | ScrollToOptions, b?: number) => {
  const p = pg();
  if (!p) return typeof a === 'object' ? win.scrollTo(a) : win.scrollTo(a ?? 0, b ?? 0);
  if (typeof a === 'object') p.scrollTo(a); else p.scrollTo(a ?? 0, b ?? 0);
}) as typeof window.scrollTo;
window.scrollBy = ((a?: number | ScrollToOptions, b?: number) => {
  const p = pg();
  if (!p) return typeof a === 'object' ? win.scrollBy(a) : win.scrollBy(a ?? 0, b ?? 0);
  if (typeof a === 'object') p.scrollBy(a); else p.scrollBy(a ?? 0, b ?? 0);
}) as typeof window.scrollBy;
// scroll doesn't bubble: catch it on the way down and tell the window's listeners
document.addEventListener('scroll', e => {
  const t = e.target as Element | null;
  if (t && t.nodeType === 1 && t.matches('#view > .pg')) window.dispatchEvent(new Event('scroll'));
}, { capture: true, passive: true });

/* A page's markup goes into #view as [title row, .pg]: everything after the title row scrolls. */
export function paged(f: DocumentFragment): DocumentFragment {
  const head = f.firstElementChild && f.firstElementChild.classList.contains('head') ? f.firstElementChild : null;
  const body = document.createElement('div'); body.className = 'pg';
  [...f.childNodes].forEach(n => { if (n !== head) body.appendChild(n); });
  f.appendChild(body);
  return f;
}
export function pagedHtml(markup: unknown): DocumentFragment {
  const t = document.createElement('template'); t.innerHTML = String(markup);
  return paged(t.content);
}

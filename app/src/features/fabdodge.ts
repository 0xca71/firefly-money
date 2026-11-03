import { el } from '../core/base';

/* ================= The floating + button steps aside when it sits on text =================
   It stays put while the page moves (scrolling is untouched). Once everything has been still for a moment, if the button
   is covering some words, numbers or a control, it slides to the edge and leaves a lip showing; the first tap or the
   pointer coming near brings it back, and the next tap adds the transaction. */
const PEEK = 40;   // how far .fab.peek slides right (keep in step with money.css)
// Where the button sits when at rest. Measuring it while slid aside made the answer flip: the shifted box no longer
// covers the text, so it came back, then covered it again and slid away, over and over, forever
const rect = (r: Range | Element) => {
  const b = r.getBoundingClientRect();
  return r instanceof Element && r.classList.contains('peek') ? new DOMRect(b.left - PEEK, b.top, b.width, b.height) : b;
};
// Whether anything readable is under the button: an element in the stack there with text of its own that reaches the button's area
export function covers(fab: DOMRect, stack: Element[]) {
  const hit = (a: DOMRect, b: DOMRect) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  return stack.some(e => {
    if (e === document.body || e === document.documentElement || e.closest('#fab')) return false;
    if (/^(INPUT|SELECT|TEXTAREA|IMG|CANVAS)$/.test(e.tagName)) return true;
    for (const n of e.childNodes) {
      if (n.nodeType !== 3 || !(n.textContent || '').trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      if ([...r.getClientRects()].some(t => hit(t, fab))) return true;
    }
    return false;
  });
}
(function init() {
  const fab = el('fab'); let timer = 0, near = false;
  const settle = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const r = rect(fab), visible = !fab.hidden && r.width > 0 && getComputedStyle(fab).visibility !== 'hidden';
      if (!visible || near || document.activeElement === fab) return fab.classList.remove('peek');
      const stack: Element[] = [];
      for (const fx of [.15, .5, .85]) for (const fy of [.15, .5, .85]) stack.push(...document.elementsFromPoint(r.left + r.width * fx, r.top + r.height * fy));
      fab.classList.toggle('peek', covers(r, [...new Set(stack)].filter(e => e !== fab)));
    }, 900);
  };
  // The first tap on a stepped-aside button only brings it back
  fab.addEventListener('click', e => { if (fab.classList.contains('peek')) { e.stopImmediatePropagation(); e.preventDefault(); fab.classList.remove('peek'); settle(); } }, true);
  addEventListener('pointermove', e => {
    if (e.pointerType === 'touch') return;
    const r = rect(fab), d = Math.hypot(Math.max(r.left - e.clientX, 0, e.clientX - r.right), Math.max(r.top - e.clientY, 0, e.clientY - r.bottom));
    const n = d < 90; if (n === near) return;
    near = n; if (n) fab.classList.remove('peek'); else settle();
  }, { passive: true });
  fab.addEventListener('focus', () => fab.classList.remove('peek'));
  addEventListener('scroll', () => { fab.classList.remove('peek'); settle(); }, { passive: true });
  addEventListener('resize', settle);
  document.addEventListener('close', settle, true);     // a dialog or sheet closing
  addEventListener('hashchange', () => { fab.classList.remove('peek'); settle(); });
  new MutationObserver(settle).observe(el('view'), { childList: true, subtree: true });
  new MutationObserver(settle).observe(fab, { attributes: true, attributeFilter: ['class', 'hidden'] });
  settle();
})();

import { reduceMotion } from './polish';

/* Segmented controls and tab rows slide a pill from the old choice to the new one instead of jumping. Pages redraw these
   controls, so each one's last pill rectangle is remembered by a key and the new pill glides in from there (transform
   only). First sight of a control, a different layout, or reduced motion: it simply appears in place. */
type R = { x: number; y: number; w: number; h: number };
const mem = new Map<string, R>();

const SEGS = '#view .seg, #view .tabs';
function key(c: HTMLElement, all: Element[], n: number) {
  return location.hash.split('?')[0] + '|' + all.indexOf(c) + '|' + c.className + '|' + n;
}
// Fractional pixels, so the pill lines up with the button exactly (offsetLeft and friends are rounded)
function rectOf(b: HTMLElement, c: HTMLElement): R {
  const a = b.getBoundingClientRect(), o = c.getBoundingClientRect();
  return { x: a.left - o.left - c.clientLeft + c.scrollLeft, y: a.top - o.top - c.clientTop + c.scrollTop, w: a.width, h: a.height };
}

// All the controls are read first and written after, so the page is laid out once however many there are (reading
// one after writing the one before made the browser lay it out again for each, and this runs on every redraw)
let snap = false;
function scan() {
  const all = Array.from(document.querySelectorAll<HTMLElement>(SEGS));
  type Job = { c: HTMLElement, on: HTMLElement, k: string, r: R, v: R | null, fresh: boolean };
  const jobs: Job[] = [];
  all.forEach(c => {
    const on = c.querySelector<HTMLElement>(':scope > :is(button, a).on');
    if (!on || !c.offsetWidth) return;
    const p = c.querySelector<HTMLElement>(':scope > .opill');
    const n = c.querySelectorAll(':scope > :is(button, a)').length;
    jobs.push({ c, on, k: key(c, all, n), r: rectOf(on, c), v: p && p.getAnimations().length ? rectOf(p, c) : null, fresh: !p });
  });
  jobs.forEach(({ c, k, r, v, fresh }) => {
    let p = c.querySelector<HTMLElement>(':scope > .opill');
    if (!p) { p = document.createElement('i'); p.className = 'opill'; p.setAttribute('aria-hidden', 'true'); c.prepend(p); c.classList.add('pilled'); }
    // Pressed again mid-glide: start from where the pill is drawn right now, not from where it was heading
    let prev = mem.get(k);
    if (!fresh && v) {
      prev = { x: v.x, y: v.y, w: v.w, h: r.h };
      p.getAnimations().forEach(a => a.cancel());
    }
    // Segments and tab rows alike: a filled chip exactly behind the active choice
    p.style.cssText = 'left:' + r.x + 'px;top:' + r.y + 'px;width:' + r.w + 'px;height:' + r.h + 'px';
    if (snap) p.getAnimations().forEach(a => a.cancel());
    else if (prev && !reduceMotion && (prev.x !== r.x || prev.y !== r.y || prev.w !== r.w)) {
      p.animate([{ transform: 'translate(' + (prev.x - r.x) + 'px,' + (prev.y - r.y) + 'px) scale(' + prev.w / r.w + ',1)' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
    mem.set(k, r);
  });
}

let queued = 0;
function later() { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; snap = true; scan(); snap = false; }); }
const view = document.getElementById('view');
if (view) {
  // Only a change to a control (its buttons, which one is on) or a new control arriving matters. Everything else that
  // happens in the page (an amount rolling, a chart redrawing) is ignored: it used to rescan every control each time.
  const control = (n: Node) => n.nodeType === 1 && ((n as Element).matches(SEGS) || !!(n as Element).querySelector(SEGS));
  const inControl = (n: Node) => { const e = n.nodeType === 1 ? n as Element : n.parentElement; return !!e && !!e.closest('.seg, .tabs'); };
  new MutationObserver(ms => {
    if (!ms.some(m => m.type === 'attributes' ? inControl(m.target) : inControl(m.target) ? !Array.from(m.addedNodes).every(n => (n as HTMLElement).classList && (n as HTMLElement).classList.contains('opill')) : Array.from(m.addedNodes).some(control))) return;
    scan();       // in the same microtask as the redraw, so the new control never paints a frame without its pill
  }).observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  // A resize, a theme switch or a late font moves the buttons without touching the controls: put the pill back, no glide
  window.addEventListener('resize', later);
  new MutationObserver(later).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-scene', 'style', 'class'] });
  if (document.fonts) document.fonts.ready.then(later);
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(later), watch = () => document.querySelectorAll(SEGS).forEach(c => ro.observe(c));
    watch(); new MutationObserver(watch).observe(view, { childList: true, subtree: true });
  }
  later();
}

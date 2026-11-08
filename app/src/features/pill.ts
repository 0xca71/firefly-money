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
function scan() {
  const all = Array.from(document.querySelectorAll<HTMLElement>(SEGS));
  type Job = { c: HTMLElement, on: HTMLElement, tabs: boolean, k: string, r: R, v: R | null, fresh: boolean };
  const jobs: Job[] = [];
  all.forEach(c => {
    const on = c.querySelector<HTMLElement>(':scope > :is(button, a).on');
    if (!on || !c.offsetWidth) return;
    const p = c.querySelector<HTMLElement>(':scope > .opill');
    const n = c.querySelectorAll(':scope > :is(button, a)').length;
    jobs.push({ c, on, tabs: c.classList.contains('tabs'), k: key(c, all, n), r: rectOf(on, c), v: p && p.getAnimations().length ? rectOf(p, c) : null, fresh: !p });
  });
  jobs.forEach(({ c, tabs, k, r, v, fresh }) => {
    let p = c.querySelector<HTMLElement>(':scope > .opill');
    if (!p) { p = document.createElement('i'); p.className = 'opill'; p.setAttribute('aria-hidden', 'true'); c.prepend(p); c.classList.add('pilled'); }
    // Pressed again mid-glide: start from where the pill is drawn right now, not from where it was heading
    let prev = mem.get(k);
    if (!fresh && v) {
      prev = { x: v.x, y: tabs ? v.y - r.h + 2 : v.y, w: v.w, h: r.h };
      p.getAnimations().forEach(a => a.cancel());
    }
    const h = tabs ? 2 : r.h, y = tabs ? r.y + r.h - 2 : r.y;       // tabs: an underline, segments: a filled chip
    p.style.cssText = 'left:' + r.x + 'px;top:' + y + 'px;width:' + r.w + 'px;height:' + h + 'px';
    if (prev && !reduceMotion && (prev.x !== r.x || prev.y !== r.y || prev.w !== r.w)) {
      const py = tabs ? prev.y + prev.h - 2 : prev.y;
      p.animate([{ transform: 'translate(' + (prev.x - r.x) + 'px,' + (py - y) + 'px) scale(' + prev.w / r.w + ',1)' }, { transform: 'none' }],
        { duration: 280, easing: 'cubic-bezier(.2, .8, .2, 1)' });
    }
    mem.set(k, r);
  });
}

let queued = 0;
function later() { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; scan(); }); }
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
  window.addEventListener('resize', later);
  later();
}

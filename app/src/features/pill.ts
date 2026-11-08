import { reduceMotion } from './polish';

/* Segmented controls and tab rows slide a pill from the old choice to the new one instead of jumping. Pages redraw these
   controls, so each one's last pill rectangle is remembered by a key and the new pill glides in from there (transform
   only). First sight of a control, a different layout, or reduced motion: it simply appears in place. */
type R = { x: number; y: number; w: number; h: number };
const mem = new Map<string, R>();

function key(c: HTMLElement) {
  const all = Array.from(document.querySelectorAll('#view .seg, #view .tabs')), n = c.querySelectorAll(':scope > :is(button, a)').length;
  return location.hash.split('?')[0] + '|' + all.indexOf(c) + '|' + c.className + '|' + n;
}
// Fractional pixels, so the pill lines up with the button exactly (offsetLeft and friends are rounded)
function rectOf(b: HTMLElement, c: HTMLElement): R {
  const a = b.getBoundingClientRect(), o = c.getBoundingClientRect();
  return { x: a.left - o.left - c.clientLeft + c.scrollLeft, y: a.top - o.top - c.clientTop + c.scrollTop, w: a.width, h: a.height };
}

function mount(c: HTMLElement) {
  const on = c.querySelector<HTMLElement>(':scope > :is(button, a).on');
  if (!on || !c.offsetWidth) return;
  const tabs = c.classList.contains('tabs');
  let p = c.querySelector<HTMLElement>(':scope > .opill');
  const fresh = !p;
  if (!p) { p = document.createElement('i'); p.className = 'opill'; p.setAttribute('aria-hidden', 'true'); c.prepend(p); c.classList.add('pilled'); }
  const k = key(c), r = rectOf(on, c);
  // Pressed again mid-glide: start from where the pill is drawn right now, not from where it was heading
  let prev = mem.get(k);
  if (!fresh && p.getAnimations().length) {
    const v = rectOf(p, c);
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
}
function scan() { document.querySelectorAll<HTMLElement>('#view .seg, #view .tabs').forEach(mount); }

let queued = 0;
function later() { if (queued) return; queued = requestAnimationFrame(() => { queued = 0; scan(); }); }
const view = document.getElementById('view');
if (view) {
  new MutationObserver(ms => {
    // Our own pill going in must not trigger another scan
    if (ms.every(m => Array.from(m.addedNodes).every(n => (n as HTMLElement).classList && (n as HTMLElement).classList.contains('opill')))) return;
    scan();       // in the same microtask as the redraw, so the new control never paints a frame without its pill
  }).observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', later);
  later();
}

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
function rectOf(b: HTMLElement): R { return { x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight }; }

function mount(c: HTMLElement) {
  const on = c.querySelector<HTMLElement>(':scope > :is(button, a).on');
  if (!on || !c.offsetWidth) return;
  const tabs = c.classList.contains('tabs');
  let p = c.querySelector<HTMLElement>(':scope > .opill');
  if (!p) { p = document.createElement('i'); p.className = 'opill'; p.setAttribute('aria-hidden', 'true'); c.prepend(p); c.classList.add('pilled'); }
  const k = key(c), r = rectOf(on), prev = mem.get(k);
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
    later();
  }).observe(view, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('resize', later);
  later();
}

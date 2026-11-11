import { el } from '../core/base';
import { buzz } from '../core/haptics';

/* Chart scrubbing and tap-to-open details (the look is in money.css, "Refinements").
   Drag a finger (or pen) along a line chart and a guide follows it, with the tip for the nearest point and a light tick
   as it crosses each one. A mouse keeps the hover tip polish.ts already gives it. */
const SVGNS = 'http://www.w3.org/2000/svg';

// The point (a [data-tip] strip) whose centre is nearest to x, in screen pixels
export function nearestIndex(centres: number[], x: number) {
  let best = -1, d = Infinity;
  centres.forEach((c, i) => { const k = Math.abs(c - x); if (k < d) { d = k; best = i; } });
  return best;
}

let svg: SVGSVGElement | null = null, rects: SVGGraphicsElement[] = [], centres: number[] = [], at = -1, hideT: ReturnType<typeof setTimeout> | undefined;
function guide(s: SVGSVGElement, r: SVGGraphicsElement) {
  let g = s.querySelector<SVGLineElement>('line.scrub-line');
  if (!g) { g = document.createElementNS(SVGNS, 'line') as SVGLineElement; g.setAttribute('class', 'scrub-line'); g.setAttribute('aria-hidden', 'true'); s.appendChild(g); }
  const b = r.getBBox(), x = (b.x + b.width / 2).toFixed(1);
  g.setAttribute('x1', x); g.setAttribute('x2', x); g.setAttribute('y1', '0'); g.setAttribute('y2', String(b.height));
}
function stop() {
  clearTimeout(hideT);
  svg?.querySelector('line.scrub-line')?.remove();
  const tip = el('tip'); if (tip.dataset.src === 'scrub') { tip.hidden = true; tip.dataset.src = ''; }
  svg = null; rects = []; centres = []; at = -1;
}
function show(e: PointerEvent) {
  if (!svg) return;
  const i = nearestIndex(centres, e.clientX);
  if (i < 0 || i === at) return;
  at = i; buzz(4);
  const r = rects[i], tip = el('tip'), box = r.getBoundingClientRect();
  guide(svg, r);
  tip.textContent = r.getAttribute('data-tip'); tip.dataset.src = 'scrub'; tip.hidden = false;
  const w = tip.offsetWidth, h = tip.offsetHeight;
  tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, box.left + box.width / 2 - w / 2)) + 'px';
  tip.style.top = Math.max(8, box.top - h - 8) + 'px';
}
document.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;
  const s = e.target instanceof Element ? e.target.closest<SVGSVGElement>('svg.lines') : null;
  stop();
  if (!s) return;
  const list = [...s.querySelectorAll<SVGGraphicsElement>('rect[data-tip]')];
  if (list.length < 2) return;
  svg = s; rects = list; centres = list.map(r => { const b = r.getBoundingClientRect(); return b.left + b.width / 2; });
}, true);
document.addEventListener('pointermove', e => { if (svg && e.pointerType !== 'mouse') show(e); }, { passive: true });
const end = () => { if (svg) { clearTimeout(hideT); hideT = setTimeout(stop, 1800); } };
document.addEventListener('pointerup', end, true);
document.addEventListener('pointercancel', stop, true);

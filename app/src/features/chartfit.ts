/* =====================================================================
   Chart fit: line and bar charts are drawn in a fixed viewBox and scaled to their card, which also scales their
   text and line widths (a 640-wide drawing in a 1500px card has 2.3x labels). This sets --sx and --sy on each chart, how much
   the drawing is magnified across and down, so money.css can give text and lines their true size back, whatever the
   card, the sidebar fold, the window or Customize make of it. A resize observer keeps it current.
   ===================================================================== */
const SEL = '#view :is(svg.lines, svg.barchart, svg.flowchart, .chart > svg)';
const seen = new WeakSet<Element>();
const ro = 'ResizeObserver' in window ? new ResizeObserver(es => es.forEach(e => fit(e.target as SVGSVGElement))) : null;

function fit(svg: SVGSVGElement) {
  const vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
  if (!vb || !vb.width || !r.width || !r.height) return;
  if (svg.getAttribute('preserveAspectRatio') !== 'none') svg.setAttribute('preserveAspectRatio', 'none');
  // how much the drawing is magnified across and down (equal while the card is the drawing's shape; unequal once it
  // stretches the drawing taller to fill the card)
  const sx = r.width / vb.width, sy = r.height / vb.height, st = svg.style;
  if (Math.abs(sx - (parseFloat(st.getPropertyValue('--sx')) || 0)) > .002) st.setProperty('--sx', sx.toFixed(4));
  if (Math.abs(sy - (parseFloat(st.getPropertyValue('--sy')) || 0)) > .002) st.setProperty('--sy', sy.toFixed(4));
  // it grows with the card's height, but not so far that bars and lines turn into slabs
  const nat = r.width * vb.height / vb.width, cap = Math.round(nat * 1.7) + 'px';
  if (st.maxHeight !== cap) st.maxHeight = cap;
}
function scan() {
  document.querySelectorAll<SVGSVGElement>(SEL).forEach(svg => { if (!seen.has(svg)) { seen.add(svg); ro && ro.observe(svg); } fit(svg); });
}
let queued = false;
const later = () => { if (!queued) { queued = true; requestAnimationFrame(() => { queued = false; scan(); }); } };
const view = document.getElementById('view');
if (view) new MutationObserver(later).observe(view, { childList: true, subtree: true });
addEventListener('resize', later);
scan();

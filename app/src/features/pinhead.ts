import { el } from '../core/base';

/* =====================================================================
   Pinned page head: each page's title row (title, month, Today, All time,
   Customize, + New…) is position: sticky in money.css. This marks when it
   has reached the top (the soft blur behind it is always on), and shares its height as --head-h so the sticky
   day headings on Transactions and the bulk bar sit just below it.
   A head too tall to pin (many rows of buttons on a narrow phone) scrolls
   away as before (html.pinhead is off).
   ===================================================================== */
const root = document.documentElement;
let head: HTMLElement | null = null;
const ro = new ResizeObserver(measure);

function measure() {
  const h = head && head.isConnected ? head.offsetHeight : 0;
  const ok = h > 0 && h <= innerHeight * .3;
  root.classList.toggle('pinhead', ok);
  if (ok) root.style.setProperty('--head-h', h + 'px'); else root.style.removeProperty('--head-h');
}
function find() {
  const h = document.querySelector<HTMLElement>('#view > .head');
  if (h === head) return;
  if (head) ro.unobserve(head);
  head = h;
  if (head) ro.observe(head);
  measure();
}
new MutationObserver(find).observe(el('view'), { childList: true });
addEventListener('resize', measure);
find();

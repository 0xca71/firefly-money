import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const nw = readFileSync('app/src/features/networth.ts', 'utf8'), ov = readFileSync('app/src/pages/overview.ts', 'utf8');
const body = (src: string, name: string) => src.slice(src.indexOf('function ' + name), src.indexOf('\n}\n', src.indexOf('function ' + name)) + 2);

describe('card chips redraw only their card', () => {
  it('Net worth range chips redraw just the tile, clearing the page cache so a revisit is not stale', () => {
    const f = body(nw, 'nwRange');
    expect(f).toMatch(/PAGES\.clear\(\)/);
    expect(f).toMatch(/App\.nwRedraw\(\)\.then\(ok => \{ if \(!ok\) route\(\); \}\)/);
    expect(ov).toMatch(/const methods = \{ attMore, activityRedraw, nwRedraw \}/);
  });
  it('the tile keeps its size while loading and never shows cached history', () => {
    const f = body(ov, 'nwRedraw');
    expect(f).toMatch(/swap\(undefined\)/);                       // same-height placeholder first
    expect(f).toMatch(/App\.netWorthHistory\(\)\.catch\(\(\) => null\)/);   // down: no line, nothing stored
    expect(f).toMatch(/tok !== nwTok/);                           // a newer press wins
    expect(f).toMatch(/replaceWith/);
  });
  it('no chip handler on the Overview does a full route() when its card is there', () => {
    expect(body(ov, 'activityRedraw')).not.toMatch(/route\(/);
    expect(body(ov, 'nwRedraw')).not.toMatch(/route\(/);
  });
});

describe('Net worth range chips are centred', () => {
  it('sit on their own centred row under the heading at any card width', () => {
    const css = readFileSync('app/assets/money.css', 'utf8');
    expect(css).toMatch(/\.panel\.stat\.nw \.panel-head \{ flex-direction: column; align-items: flex-start; \}/);
    expect(css).toMatch(/\.panel\.stat\.nw \.panel-head > \.seg \{ align-self: center;/);
  });
});

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/assets/money.css', 'utf8'), pill = readFileSync('app/src/features/pill.ts', 'utf8');

describe('fluid motion', () => {
  it('uses shared easing tokens instead of repeating the curves', () => {
    expect(css).toMatch(/--ease-enter:/);
    expect(css).toMatch(/--ease-exit:/);
    expect((css.match(/cubic-bezier\(\.2, \.8, \.2, 1\)/g) || []).length).toBeLessThanOrEqual(3);   // token + a few keyframe/legacy uses
  });
  it('segmented controls and tabs slide a pill with transform only, and skip it under reduced motion', () => {
    expect(pill).toMatch(/transform/);
    expect(pill).not.toMatch(/transition|\.style\.(left|top|width)\s*=\s*[^'"]*\+\s*'px'\s*\+.*animate/);
    expect(pill).toMatch(/reduceMotion/);
    expect(css).toMatch(/\.pilled > :is\(button, a\)\.on \{ background: none/);
  });
});

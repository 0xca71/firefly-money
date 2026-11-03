import { describe, expect, it } from 'vitest';
import { SAVED_WINDOW_MS, looksSaved } from '../app/src/features/txform';

const now = Date.parse('2026-11-03T12:00:00Z');
const group = (createdAgo: number, tx: Record<string, unknown>[] = [{ description: 'Lunch', amount: '12.50', date: '2026-11-03T00:00:00+00:00' }]) =>
  ({ id: '1', attributes: { created_at: new Date(now - createdAgo).toISOString(), transactions: tx } });
const body = (tx: Record<string, unknown>[] = [{ description: 'Lunch', amount: '12.5', date: '2026-11-03' }]) => ({ transactions: tx });

describe('already saved after a lost reply', () => {
  it('matches the same description, amount and date made a moment ago', () => {
    expect(looksSaved([group(8000)], body(), now)).toBe(true);
  });
  it('does not match an older one, a different amount, day, or description', () => {
    expect(looksSaved([group(SAVED_WINDOW_MS + 5000)], body(), now)).toBe(false);
    expect(looksSaved([group(8000)], body([{ description: 'Lunch', amount: '13', date: '2026-11-03' }]), now)).toBe(false);
    expect(looksSaved([group(8000)], body([{ description: 'Lunch', amount: '12.5', date: '2026-11-02' }]), now)).toBe(false);
    expect(looksSaved([group(8000)], body([{ description: 'Dinner', amount: '12.5', date: '2026-11-03' }]), now)).toBe(false);
  });
  it('needs every part of a split to be there, and says nothing when the time is unknown', () => {
    const two = [{ description: 'A', amount: '1', date: '2026-11-03' }, { description: 'B', amount: '2', date: '2026-11-03' }];
    expect(looksSaved([group(8000, [two[0]])], body(two), now)).toBe(false);
    expect(looksSaved([group(8000, two)], body(two), now)).toBe(true);
    expect(looksSaved([{ id: '2', attributes: { transactions: two } }], body(two), now)).toBe(false);
  });
});

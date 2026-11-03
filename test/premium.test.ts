// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest';
import { emptyState } from '../app/src/core/dom';
import { gettingStarted } from '../app/src/features/started';
import { S } from '../app/src/core/base';

describe('empty state', () => {
  it('draws an icon, a title, a line and the actions', () => {
    const h = String(emptyState('budgets', 'No budgets yet', 'Give a category a limit.', '<button class="btn primary">Go</button>'));
    expect(h).toContain('class="empty-state"');
    expect(h).toContain('<svg');
    expect(h).toContain('No budgets yet');
    expect(h).toContain('es-act');
  });
  it('falls back to the list icon for an unknown kind and escapes text', () => {
    const h = String(emptyState('nope', '<b>x</b>', 'y'));
    expect(h).toContain('<svg');
    expect(h).not.toContain('<b>x</b>');
    expect(h).not.toContain('es-act');
  });
});

describe('getting started card', () => {
  beforeEach(() => { localStorage.clear(); S.lists = { budgets: [], bills: [] } as never; });
  it('stays away from a device that already used Money', () => {
    expect(String(gettingStarted())).toBe('');
  });
  it('shows on a new install and ticks steps from Firefly data', () => {
    localStorage.setItem('money.gsStart', '1');
    expect(String(gettingStarted())).toContain('0 of 4 done');
    S.lists = { budgets: [{}], bills: [{}] } as never;
    expect(String(gettingStarted())).toContain('2 of 4 done');
  });
  it('can be hidden, and disappears when everything is done', () => {
    localStorage.setItem('money.gsStart', '1');
    localStorage.setItem('money.gsHide', 'true');
    expect(String(gettingStarted())).toBe('');
    localStorage.removeItem('money.gsHide');
    localStorage.setItem('money.gsDone', JSON.stringify(['look', 'tx']));
    S.lists = { budgets: [{}], bills: [{}] } as never;
    expect(String(gettingStarted())).toBe('');
  });
});

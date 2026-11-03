import { describe, expect, it } from 'vitest';
import { SYNCED, changedKeys, syncDecision } from '../app/src/features/sync';

const remote = (t: number, keys: Record<string, unknown> = { dash: 1 }) => ({ t, keys });

describe('settings sync: which side wins', () => {
  it('uses the saved settings when they are newer than this device’s last sync and unsaved change', () => {
    expect(syncDecision(remote(300), 0, 200, true)).toBe('apply');
    expect(syncDecision(remote(300), 250, 200, true)).toBe('apply');
  });
  it('sends this device’s changes when they are newer than the saved ones', () => {
    expect(syncDecision(remote(300), 400, 200, true)).toBe('push');
  });
  it('keeps what this device has when the saved copy is not newer and nothing changed', () => {
    expect(syncDecision(remote(200), 0, 200, true)).toBe('none');
    expect(syncDecision(remote(100), 0, 200, true)).toBe('none');
  });
  it('sends first-time settings when nothing is saved yet, but not an empty set', () => {
    expect(syncDecision(null, 0, 0, true)).toBe('push');
    expect(syncDecision(null, 0, 0, false)).toBe('none');
  });
  it('ignores a saved copy with no settings in it', () => {
    expect(syncDecision({ t: 900 }, 0, 0, false)).toBe('none');
    expect(syncDecision({ t: 900 }, 5, 0, true)).toBe('push');
  });
});

describe('settings sync: what changes', () => {
  const local: Record<string, unknown> = { dash: { v: 3 }, fcDays: 30, logos: true };
  it('lists only the synced settings that differ, treating missing as unset', () => {
    expect(changedKeys(k => local[k], { dash: { v: 3 }, fcDays: 60 })).toEqual(['fcDays', 'logos']);
  });
  it('sees nothing to change when both sides agree', () => {
    expect(changedKeys(k => local[k], { ...local })).toEqual([]);
  });
  it('only looks at settings that follow you between devices', () => {
    expect(changedKeys(k => local[k], { theme: 'glass', secret: 1 })).toEqual(['dash', 'fcDays', 'logos']);
    expect(SYNCED).not.toContain('theme');
  });
});

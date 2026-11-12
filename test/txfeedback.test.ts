/// <reference lib="es2024.promise" />
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App, S, el, type Field } from '../app/src/core/base';
import { CACHE, INFLIGHT, PAGES } from '../app/src/core/api';
import { closeDrawer } from '../app/src/core/dom';
import { normAccount } from '../app/src/core/lists';
import { blankSplit, renderTxForm, type TxForm } from '../app/src/features/txform';

vi.mock('../app/src/core/router', () => ({ route: vi.fn() }));
const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');

function openForm(overrides: Partial<TxForm> = {}) {
  const form: TxForm = { id: '42', type: 'withdrawal', date: '2026-11-12', title: 'Shopping', main: '1', src: '', dst: '', rules: true,
    splits: [{ ...blankSplit(), jid: '42', description: 'Coffee', amount: '4.50' }], ...overrides };
  S.form = form; renderTxForm();
  return el<HTMLFormElement>('txForm');
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() });
  localStorage.clear(); CACHE.clear(); INFLIGHT.clear(); PAGES.clear();
  S.form = null; S.drawerHero = null; S.drawerReturn = null; S.currency = 'USD';
  const own = ['1', '2'].map(id => normAccount({ id, attributes: { name: 'Account ' + id, type: 'asset', currency_code: 'USD' } }));
  S.lists = { accounts: own, own, byId: Object.fromEntries(own.map(a => [a.id, a])), expense: [], revenue: [], categories: [], budgets: [], bills: [], tags: [], currencies: [],
    foreign: [{ id: '2', code: 'EUR', name: 'Euro', symbol: '€', enabled: true, primary: false }] };
  document.body.innerHTML = '<div id="app"><div id="view"></div></div><div id="drawer"></div><div id="scrim"></div><div id="toast"></div>';
});
afterEach(() => {
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); S.form = null;
  if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

describe('transaction field feedback', () => {
  it('waits for blur or submit, then clears an amount error as the user corrects it', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const form = openForm({ splits: [{ ...blankSplit(), description: 'Coffee', amount: '' }] });
    const amount = form.querySelector<HTMLInputElement>('[data-k="amount"]')!;
    amount.dispatchEvent(new Event('input', { bubbles: true }));
    expect(amount.hasAttribute('aria-invalid')).toBe(false);
    amount.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(amount.getAttribute('aria-invalid')).toBe('true');
    await App.saveTx(form);
    expect(fetch).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(amount);
    amount.value = '3.75'; amount.dispatchEvent(new Event('input', { bubbles: true }));
    expect(amount.getAttribute('aria-invalid')).toBe('false');
    expect(amount.closest('label')!.querySelector('.field-feedback.invalid')).toBeNull();
  });

  it('revalidates transfer accounts and foreign currency when their related values change', async () => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    const form = openForm({ type: 'transfer', src: '1', dst: '1', splits: [{ ...blankSplit(), description: 'Transfer', amount: '10', fa: '8' }] });
    await App.saveTx(form);
    const destination = el<HTMLSelectElement>('f-dst'), currency = form.querySelector<HTMLSelectElement>('[data-k="fc"]')!;
    expect(destination.getAttribute('aria-invalid')).toBe('true');
    expect(currency.getAttribute('aria-invalid')).toBe('true');
    const source = el<HTMLSelectElement>('f-src'); source.value = '2'; source.dispatchEvent(new Event('change', { bubbles: true }));
    const foreign = form.querySelector<HTMLInputElement>('[data-k="fa"]')!; foreign.value = ''; foreign.dispatchEvent(new Event('input', { bubbles: true }));
    expect(destination.getAttribute('aria-invalid')).toBe('false');
    expect(currency.getAttribute('aria-invalid')).toBe('false');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('places Firefly errors on the right split, retains inputs, and permits a corrected retry', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }));
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ errors: { 'transactions.1.amount': ['Amount exceeds the allowed maximum.'] } }), { status: 422 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const form = openForm({ splits: [{ ...blankSplit(), jid: '41', description: 'Food', amount: '10' }, { ...blankSplit(), jid: '42', description: 'Drink', amount: '20' }] });
    const amounts = form.querySelectorAll<HTMLInputElement>('[data-k="amount"]');
    await App.saveTx(form);
    expect(el('drawer').classList.contains('open')).toBe(true);
    expect(amounts[0].getAttribute('aria-invalid')).not.toBe('true');
    expect(amounts[1].getAttribute('aria-invalid')).toBe('true');
    expect(amounts[1].value).toBe('20');
    expect(document.activeElement).toBe(amounts[1]);
    const feedback = el(amounts[1].getAttribute('aria-describedby')!);
    expect(feedback.textContent).toBe('Amount exceeds the allowed maximum.');
    expect(el<HTMLButtonElement>('txSave').disabled).toBe(false);
    amounts[1].value = '15'; amounts[1].dispatchEvent(new Event('input', { bubbles: true }));
    await App.saveTx(form);
    expect(el('drawer').classList.contains('open')).toBe(false);
    expect(JSON.parse(fetch.mock.calls[1][1].body).transactions[1].amount).toBe('15');
  });
});

describe('transaction saving feedback', () => {
  it('prevents duplicate writes and only displays success after the server confirms', async () => {
    const { promise, resolve: reply } = Promise.withResolvers<Response>();
    const fetch = vi.fn(() => promise); vi.stubGlobal('fetch', fetch);
    const form = openForm(), button = el<HTMLButtonElement>('txSave');
    const saving = App.saveTx(form); await App.saveTx(form); await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(button.dataset.state).toBe('saving');
    expect(button.disabled).toBe(true);
    expect(form.querySelector<Field>('[data-k="amount"]')!.disabled).toBe(true);
    expect(el('drawer').classList.contains('open')).toBe(true);
    reply(new Response('{}', { status: 200 })); await vi.advanceTimersByTimeAsync(0);
    expect(button.dataset.state).toBe('saved');
    expect(button.getAttribute('aria-busy')).toBe('false');
    await vi.advanceTimersByTimeAsync(250); await saving;
    expect(el('drawer').classList.contains('open')).toBe(false);
  });

  it('does not overwrite a different form when a dismissed save fails later', async () => {
    const { promise, resolve: reply } = Promise.withResolvers<Response>();
    vi.stubGlobal('fetch', () => promise);
    const saving = App.saveTx(openForm()); await vi.advanceTimersByTimeAsync(0);
    closeDrawer(); const next = openForm({ id: '99', splits: [{ ...blankSplit(), description: 'New work', amount: '7' }] });
    reply(new Response(JSON.stringify({ errors: { 'transactions.0.amount': ['Not allowed.'] } }), { status: 422 }));
    await saving;
    expect(S.form.id).toBe('99');
    expect(el('txForm')).toBe(next);
    expect(next.querySelector<Field>('[data-k="description"]')!.value).toBe('New work');
    expect(next.querySelector('[aria-invalid="true"]')).toBeNull();
    expect(el<HTMLButtonElement>('txSave').disabled).toBe(false);
  });
});

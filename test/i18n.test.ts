import { afterEach, describe, expect, it } from 'vitest';
import { browserUiLanguage, catalogs, persistUiLanguage, setDocumentLanguage, tr, translateInitialShell, translateStatic, uiLanguage, UI_LANGUAGE_KEY, zhCN } from '../app/src/core/i18n';
import { html } from '../app/src/core/html';

afterEach(() => {
  localStorage.removeItem(UI_LANGUAGE_KEY);
  document.documentElement.lang = 'en';
  document.body.innerHTML = '';
});

describe('UI language (independent of regional formats)', () => {
  it('supports exactly en and zh-CN with matching catalogs', () => {
    expect(Object.keys(catalogs).sort()).toEqual(['en', 'zh-CN']);
    expect(Object.keys(catalogs.en).sort()).toEqual(Object.keys(zhCN).sort());
    for (const key of Object.keys(zhCN)) expect(catalogs.en[key]).toBe(key);
  });

  it('uses simplified Chinese for Chinese browser preferences only', () => {
    expect(browserUiLanguage('zh-CN')).toBe('zh-CN');
    expect(browserUiLanguage('zh-SG')).toBe('zh-CN');
    expect(browserUiLanguage('zh-Hans')).toBe('zh-CN');
    expect(browserUiLanguage('zh-TW')).toBe('en');
    expect(browserUiLanguage('en-US')).toBe('en');
  });

  it('persists a manual choice and updates document language', () => {
    persistUiLanguage('zh-CN');
    expect(localStorage.getItem(UI_LANGUAGE_KEY)).toBe('zh-CN');
    expect(uiLanguage()).toBe('zh-CN');
    expect(document.documentElement.lang).toBe('zh-CN');
    expect(tr('Transactions')).toBe('交易记录');
    expect(tr('Custom user payee')).toBe('Custom user payee');
    persistUiLanguage('en');
    expect(tr('Transactions')).toBe('Transactions');
    setDocumentLanguage();
    expect(document.documentElement.lang).toBe('en');
  });

  it('localizes only static tagged-template content, not user data', () => {
    persistUiLanguage('zh-CN');
    const userAccount = 'Transactions';
    expect(String(html`<label>Amount</label><strong>${userAccount}</strong><input aria-label="Password" placeholder="Search">`))
      .toBe('<label>金额</label><strong>Transactions</strong><input aria-label="密码" placeholder="搜索">');
    expect(translateStatic('<div>Cancel</div>')).toBe('<div>取消</div>');
  });

  it('translates only initial static shell, not the live financial data', () => {
    persistUiLanguage('zh-CN');
    document.body.innerHTML = '<div id="login"><label>Password</label><input aria-label="Password"></div><main id="view"><div class="name">Transactions</div></main>';
    translateInitialShell();
    expect(document.querySelector('#login label')?.textContent).toBe('密码');
    expect(document.querySelector('#login input')?.getAttribute('aria-label')).toBe('密码');
    expect(document.querySelector('#view .name')?.textContent).toBe('Transactions');
  });
});

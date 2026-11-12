import { afterEach, describe, expect, it } from 'vitest';
import { browserUiLanguage, persistUiLanguage, setDocumentLanguage, tr, translateInitialShell, translateStatic, uiLanguage, UI_LANGUAGE_KEY } from '../app/src/core/i18n';
import { html } from '../app/src/core/html';
import { opt } from '../app/src/core/dom';

afterEach(() => {
  localStorage.removeItem(UI_LANGUAGE_KEY);
  document.documentElement.lang = 'en';
  document.body.innerHTML = '';
});

describe('UI language (independent of regional formats)', () => {
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

  it('keeps interpolated data out of translation, including option labels and placeholders', () => {
    persistUiLanguage('zh-CN');
    document.body.innerHTML = String(html`<select>${opt('account', 'Income', 'account')}</select><input placeholder="${'Search'}"><p>${tr('{name} budget', { name: 'Income <script>' })}</p>`);
    expect(document.querySelector('option')?.textContent).toBe('Income');
    expect(document.querySelector('option')?.value).toBe('account');
    expect(document.querySelector('input')?.placeholder).toBe('Search');
    expect(document.querySelector('p')?.textContent).toBe('Income <script> 预算');
    expect(document.querySelector('script')).toBeNull();
    expect(tr('{name} budget', { name: '{count}' })).toBe('{count} 预算');
  });

  it('translates text after an interpolation without treating attributes or code as text', () => {
    persistUiLanguage('zh-CN');
    const icon = html`<span aria-hidden="true">+</span>`;
    document.body.innerHTML = String(html`<button data-name="Save"${html` disabled title="Save"`}>${icon} Save</button><label><input type="checkbox"${true ? ' checked' : ''}> Active</label><code>Save</code><textarea>Income</textarea>`);
    expect(document.querySelector('button')?.textContent).toBe('+ 保存');
    expect(document.querySelector('button')?.dataset.name).toBe('Save');
    expect(document.querySelector('button')?.title).toBe('保存');
    expect(document.querySelector('button')?.disabled).toBe(true);
    expect(document.querySelector('label')?.textContent?.trim()).toBe('启用');
    expect(document.querySelector('input')?.checked).toBe(true);
    expect(document.querySelector('code')?.textContent).toBe('Save');
    expect(document.querySelector('textarea')?.value).toBe('Income');
  });

  it('uses the selected language when the same template renders again', () => {
    const render = () => String(html`<button>Save</button>`);
    persistUiLanguage('zh-CN');
    expect(render()).toBe('<button>保存</button>');
    persistUiLanguage('en');
    expect(render()).toBe('<button>Save</button>');
    persistUiLanguage('zh-CN');
    expect(render()).toBe('<button>保存</button>');
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

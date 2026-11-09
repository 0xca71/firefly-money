import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const index = readFileSync('app/index.html', 'utf8');
const conf = readFileSync('app/default.conf.template', 'utf8');
const docker = readFileSync('Dockerfile', 'utf8');
const dockerignore = readFileSync('.dockerignore', 'utf8');
const build = readFileSync('build.mjs', 'utf8');
const imgs = [...(readFileSync('app/src/core/logo.ts', 'utf8') + readFileSync('app/src/core/dom.ts', 'utf8')).matchAll(/<img\b[^>]*>/g)].map(m => m[0]);

describe('launch checklist', () => {
  it('page has description, noindex (private app), icon set and a privacy link', () => {
    expect(index).toMatch(/<meta name="description" content="[^"]{40,}"/);
    expect(index).toContain('<meta name="robots" content="noindex">');
    for (const f of ['favicon-32', 'apple-touch-icon']) expect(index).toContain(`/assets/icons/${f}.png`);
    expect(index).toContain('href="/privacy.html"');
  });
  it('manifest lists PNG icons', () => {
    expect(conf).toContain('/assets/icons/icon-192.png');
    expect(conf).toContain('/assets/icons/icon-512.png');
  });
  it('nginx serves a custom 404, robots.txt and the privacy page; the image ships them', () => {
    expect(conf).toContain('error_page 404 /404.html');
    expect(conf).toContain('location = /robots.txt');
    expect(conf).toContain('location = /privacy.html');
    for (const f of ['404.html', 'privacy.html']) {
      expect(docker).toContain(`app/${f} /etc/nginx/templates/${f}.template`);
      expect(dockerignore).toContain(`!app/${f}`);
    }
  });
  it('demo build adds social tags, robots.txt, sitemap and a 404', () => {
    for (const k of ['og:image', 'twitter:card', 'sitemap.xml', 'site/404.html', 'index,follow']) expect(build).toContain(k);
  });
  it('every <img> has alt text', () => {
    expect(imgs.length).toBeGreaterThan(0);
    for (const i of imgs) expect(i).toContain('alt=');
  });
  it('static pages hold no $ (nginx would treat it as a variable)', () => {
    for (const f of ['404.html', 'privacy.html']) expect(readFileSync(`app/${f}`, 'utf8')).not.toContain('$');
  });
});

// Controlli statici: ASSETS ↔ file su disco, percorsi relativi, manifest, dimensioni icone,
// parole e API vietate (nessuna notifica, niente innerHTML, niente style inline, domini esterni).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NOT_PUBLISHED_DIRS = ['.git', '.agents', '.worktrees', 'tests', 'tools', 'docs', 'node_modules'];
const NOT_PUBLISHED_FILES = ['README.md', 'CONTESTO.md', '.gitignore', '.nojekyll'];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const rel = relative(ROOT, p).split('\\').join('/');
    if (statSync(p).isDirectory()) { if (!NOT_PUBLISHED_DIRS.includes(rel)) out.push(...walk(p)); } else out.push(rel);
  }
  return out;
}

const published = walk(ROOT).filter((f) => !NOT_PUBLISHED_FILES.includes(f)).sort();
const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
const assets = JSON.parse(sw.match(/const ASSETS = (\[[\s\S]*?\]);/)[1].replace(/'/g, '"').replace(/,\s*\]/, ']'));
const textFiles = published.filter((f) => /\.(js|html|css|webmanifest|json|svg)$/.test(f));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

test('ASSETS coincide con i file pubblicati nei due sensi', () => {
  const listed = assets.filter((a) => a !== './').sort();
  assert.deepEqual(listed.filter((a) => !published.includes(a)), [], 'voci di ASSETS senza file');
  // sw.js non va in cache: il browser lo controlla sempre in rete per gli aggiornamenti.
  assert.deepEqual(published.filter((f) => f !== 'sw.js' && !listed.includes(f)), [], 'file non presenti in ASSETS');
  assert.ok(assets.includes('./'));
  assert.match(sw, /const VERSION = 'moneyflow-v\d+';/);
});

test('nessun percorso assoluto che inizia con /', () => {
  const bad = [];
  for (const f of textFiles) {
    const s = read(f);
    const patterns = [/(?:href|src)=["']\/(?!\/)/g, /from\s+['"]\/(?!\/)/g, /import\(\s*['"]\/(?!\/)/g, /register\(\s*['"]\//g, /"(?:start_url|scope|src|id)"\s*:\s*"\//g];
    for (const re of patterns) if (re.test(s)) bad.push(`${f}: ${re}`);
  }
  for (const a of assets) if (a.startsWith('/')) bad.push('ASSETS ' + a);
  assert.deepEqual(bad, []);
});

test('manifest valido con i campi di §7', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.name, 'MoneyFlow');
  assert.equal(m.id, './');
  assert.equal(m.start_url, './?source=pwa');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.equal(m.lang, 'it');
  assert.ok(m.theme_color && m.background_color);
  const sizes = m.icons.map((i) => `${i.sizes}:${i.purpose}`);
  assert.deepEqual(sizes, ['192x192:any', '512x512:any', '512x512:maskable']);
  for (const i of m.icons) assert.ok(published.includes(i.src), i.src);
});

test('dimensioni delle icone (header IHDR) e favicon v4 collegate', () => {
  const want = { 'icons/moneyflow-v4-192.png': 192, 'icons/moneyflow-v4-512.png': 512, 'icons/moneyflow-v4-maskable-512.png': 512, 'icons/moneyflow-v4-apple-touch-180.png': 180, 'icons/moneyflow-v4-favicon-32.png': 32 };
  for (const [f, size] of Object.entries(want)) {
    const b = readFileSync(join(ROOT, f));
    assert.equal(b.toString('latin1', 1, 4), 'PNG', f);
    assert.equal(b.readUInt32BE(16), size, f);
    assert.equal(b.readUInt32BE(20), size, f);
  }
  for (const page of ['index.html', 'offline.html']) {
    const html = read(page);
    assert.match(html, /rel="icon" type="image\/svg\+xml" href="icons\/moneyflow-v4-favicon.svg"/, page);
    assert.match(html, /rel="icon" type="image\/png" sizes="32x32" href="icons\/moneyflow-v4-favicon-32.png"/, page);
  }
  assert.match(read('index.html'), /rel="apple-touch-icon"[^>]*href="icons\/moneyflow-v4-apple-touch-180.png"/);
  for (const f of ['icons/moneyflow-v4.svg', 'icons/moneyflow-v4-favicon.svg']) assert.match(read(f), /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" viewBox="0 0 512 512">/, f);
  // Le icone v3 non esistono più e nessun file le cita (vanno cancellate su GitHub).
  assert.deepEqual(published.filter((f) => f.includes('moneyflow-v3-')), []);
  for (const f of textFiles) assert.ok(!read(f).includes('moneyflow-v3-'), f);
});

test('nessun riferimento vietato nei file pubblicati e nella documentazione', () => {
  const word = ['ama', 'zon'].join('');
  const docs = ['README.md', 'CONTESTO.md'].filter((f) => { try { statSync(join(ROOT, f)); return true; } catch { return false; } });
  for (const f of [...textFiles, ...docs]) assert.ok(!read(f).toLowerCase().includes(word), f);
});

test('nessuna notifica, niente innerHTML, niente style inline, solo domini Firebase', () => {
  const allowedHosts = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com', 'firestore.googleapis.com', 'www.w3.org'];
  for (const f of textFiles) {
    const s = read(f);
    for (const bad of ['Notification', 'PushManager', 'text/calendar', 'innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) {
      assert.ok(!s.includes(bad), `${f} contiene ${bad}`);
    }
    if (f !== 'offline.html') assert.ok(!/style=["']/.test(s), `${f} ha uno style inline`);
    for (const [, host] of s.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)) assert.ok(allowedHosts.includes(host), `${f}: dominio ${host}`);
  }
  const csp = read('index.html').match(/Content-Security-Policy" content="([^"]+)"/)[1];
  assert.match(csp, /script-src 'self';/);
  assert.match(csp, /style-src 'self';/);
  assert.match(csp, /connect-src 'self' https:\/\/identitytoolkit.googleapis.com https:\/\/securetoken.googleapis.com https:\/\/firestore.googleapis.com;/);
});

test('ogni file JS inizia con un commento', () => {
  for (const f of published.filter((x) => x.endsWith('.js'))) assert.match(read(f), /^\/\/ \S/, f);
});

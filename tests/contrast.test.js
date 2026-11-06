// Contrasto WCAG 2.x della palette v4 (v5: colore progressivo): legge i token dai blocchi di css/app.css (chiaro, scuro, automatico scuro)
// e calcola i rapporti delle coppie usate dall'interfaccia. Testo ≥ 4,5:1; icone, barre e anelli ≥ 3:1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../js/store.js';

const css = readFileSync(new URL('../css/app.css', import.meta.url), 'utf8');

function block(selector) {
  const at = css.indexOf(selector + ' {\n');
  assert.ok(at >= 0, 'blocco mancante: ' + selector);
  const body = css.slice(at + selector.length + 2, css.indexOf('}', at));
  const tokens = {};
  for (const [, name, value] of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) tokens[name] = value.trim();
  return tokens;
}

const LIGHT = block(':root, :root[data-theme="light"]');
const DARK = block(':root[data-theme="dark"]');
const AUTO = block('  :root[data-theme="auto"]');

const hex = (s) => { const m = /^#([0-9a-f]{6})$/i.exec(s.trim()); assert.ok(m, 'colore non esadecimale: ' + s); return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)); };
const rgba = (s) => { const m = /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/.exec(s); assert.ok(m, 'rgba atteso: ' + s); return { c: [m[1], m[2], m[3]].map(Number), a: Number(m[4]) }; };
const over = (fg, a, bg) => fg.map((v, i) => Math.round(v * a + bg[i] * (1 - a)));
const stops = (s) => [...s.matchAll(/#[0-9a-f]{6}/gi)].map((m) => hex(m[0]));
function lum(c) {
  const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function ratio(a, b) {
  const x = lum(a); const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const TINTS = ['accent', 'teal', 'indigo', 'violet', 'amber', 'pink', 'butter', 'danger'];
const fillOf = (T, k) => (k === 'accent' ? T['accent-fill'] : k === 'danger' ? null : T[`${k}-fill`]);

// Miscela sRGB di due colori con peso t della seconda: round(b × t + a × (1 − t)) per canale.
export const mix = (a, b, t) => a.map((v, i) => Math.round(b[i] * t + v * (1 - t)));
const PROG = [0, 1, 2, 3];
// Le 4 tappe e le miscele a passi di 1 % dei tratti 0→1, 1→2, 2→3 (303 colori per tema).
function progColors(T) {
  const out = PROG.map((k) => [`prog-${k}`, hex(T[`prog-${k}`])]);
  for (let k = 0; k < 3; k++) {
    const a = hex(T[`prog-${k}`]); const b = hex(T[`prog-${k + 1}`]);
    for (let t = 0; t <= 100; t++) out.push([`miscela prog-${k}→${k + 1} al ${t}%`, mix(a, b, t / 100)]);
  }
  return out;
}

// Coppie [descrizione, primo piano, sfondo, minimo] per un tema.
function pairs(T) {
  const out = [];
  const add = (what, fg, bg, need) => out.push([what, fg, bg, need]);
  const bg = hex(T.bg); const surface = hex(T.surface); const s2 = hex(T['surface-2']);
  const text = hex(T.text); const muted = hex(T.muted);
  for (const [n, c] of [['bg', bg], ['surface', surface], ['surface-2', s2]]) {
    add(`testo su ${n}`, text, c, 4.5);
    add(`grigio secondario su ${n}`, muted, c, 4.5);
  }
  for (const k of TINTS) {
    const fg = hex(T[k]); const soft = hex(T[`${k}-soft`]);
    add(`${k}: testo su surface`, fg, surface, 4.5);
    add(`${k}: testo su bg`, fg, bg, 4.5);
    add(`${k}: testo sulla sua tinta tenue`, fg, soft, 4.5);
    add(`testo su tinta tenue ${k}`, text, soft, 4.5);
    add(`grigio secondario su tinta tenue ${k}`, muted, soft, 4.5);
    const fill = fillOf(T, k);
    if (fill) add(`bianco su pieno ${k} (pulsanti, glifi)`, [255, 255, 255], hex(fill), 4.5);
  }
  add('violet: stat Programmati, testo', text, hex(T['violet-soft']), 4.5);
  // Card protagoniste: ogni tappa del gradiente, e i riquadri traslucidi sopra la tappa.
  const tile = rgba(T['hero-tile']);
  const ringTrack = rgba(T['ring-track']);
  for (const [name, key] of [['Quanto ti resta', 'hero-left-bg'], ['Patrimonio totale', 'hero-nw-bg']]) {
    stops(T[key]).forEach((st, i) => {
      add(`${name} tappa ${i + 1}: testo`, text, st, 4.5);
      add(`${name} tappa ${i + 1}: grigio secondario`, muted, st, 4.5);
      add(`${name} tappa ${i + 1}: verde (titolo, numero ≥ 0)`, hex(T.accent), st, 4.5);
      add(`${name} tappa ${i + 1}: rosso (numero < 0)`, hex(T.danger), st, 4.5);
      if (key === 'hero-nw-bg') add(`${name} tappa ${i + 1}: titolo dorato`, hex(T.butter), st, 4.5);
      const t = over(tile.c, tile.a, st);
      add(`${name} tappa ${i + 1}: testo sul riquadro`, text, t, 4.5);
      add(`${name} tappa ${i + 1}: grigio sul riquadro`, muted, t, 4.5);
      add(`${name} tappa ${i + 1}: verde sul riquadro (Entrate)`, hex(T.accent), t, 4.5);
      if (key === 'hero-left-bg') {
        add(`${name} tappa ${i + 1}: anello verde`, hex(T.accent), st, 3);
        add(`${name} tappa ${i + 1}: anello rosso`, hex(T.danger), st, 3);
        add(`${name} tappa ${i + 1}: anello verde sulla traccia`, hex(T.accent), over(ringTrack.c, ringTrack.a, st), 3);
      }
    });
  }
  // v5: colore progressivo di "Quanto ti resta" (numero, "Hai sforato di", anello) su ogni tappa del fondo menta,
  // alle 4 tappe e a ogni 1 % di miscela tra due tappe (come color-mix(in srgb), canali arrotondati agli interi).
  const heroStops = stops(T['hero-left-bg']);
  heroStops.forEach((st, i) => {
    const track = over(ringTrack.c, ringTrack.a, st);
    for (const [label, c] of progColors(T)) {
      add(`Quanto ti resta tappa ${i + 1}: ${label}, testo`, c, st, 4.5);
      add(`Quanto ti resta tappa ${i + 1}: ${label}, anello sulla traccia`, c, track, 3);
    }
  });
  add('barra uscite del grafico su surface', hex(T['chart-expense']), surface, 3);
  add('barra entrate del grafico su surface', hex(T.income), surface, 3);
  add('scheda attiva: verde su tinta tenue', hex(T.accent), hex(T['accent-soft']), 4.5);
  add('testo su segmento scelto', text, hex(T['segment-on']), 4.5);
  // Colori di conti e categorie: glifo bianco sul riquadro pieno.
  for (const c of PALETTE) add(`glifo bianco su colore ${c}`, [255, 255, 255], hex(c), 3);
  return out;
}

test('i token del tema automatico scuro sono uguali a quelli del tema scuro', () => {
  assert.deepEqual(AUTO, DARK);
});

for (const [name, T] of [['chiaro', LIGHT], ['scuro', DARK]]) {
  test(`contrasto WCAG AA, tema ${name}`, () => {
    const bad = pairs(T).map(([what, fg, bg, need]) => [what, ratio(fg, bg), need]).filter(([, r, need]) => r < need)
      .map(([what, r, need]) => `${what}: ${r.toFixed(2)} < ${need}`);
    assert.deepEqual(bad, []);
  });
}

// Tabella per la specifica di design: node tests/contrast.test.js --table
if (process.argv.includes('--table')) {
  console.log('| Tema | Coppia | Rapporto | Minimo |\n|---|---|---|---|');
  for (const [name, T] of [['chiaro', LIGHT], ['scuro', DARK]]) {
    for (const [what, fg, bg, need] of pairs(T)) if (!what.includes('miscela')) console.log(`| ${name} | ${what} | ${ratio(fg, bg).toFixed(2).replace('.', ',')}:1 | ${need}:1 |`);
  }
  // Minimo delle miscele di ogni tratto (testo e anello) sulle tre tappe del fondo.
  console.log('\n| Tema | Tratto | Minimo testo | Minimo anello sulla traccia |\n|---|---|---|---|');
  for (const [name, T] of [['chiaro', LIGHT], ['scuro', DARK]]) {
    for (let k = 0; k < 3; k++) {
      const ps = pairs(T).filter(([w]) => w.includes(`miscela prog-${k}→${k + 1} `));
      const min = (kind) => Math.min(...ps.filter(([w]) => w.endsWith(kind)).map(([, fg, bg]) => ratio(fg, bg))).toFixed(2).replace('.', ',');
      console.log(`| ${name} | prog-${k}→${k + 1} | ${min('testo')}:1 | ${min('traccia')}:1 |`);
    }
  }
}

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
  // v8 (modifica 7): in Home la card "Quanto ti resta" ha il fondo neutro (surface): colore progressivo del numero e
  // dell'anello (anche sulla traccia) a ogni 1 %; "Superato" rosso sulla riga del Piano evidenziata (ambra tenue).
  const surfTrack = over(ringTrack.c, ringTrack.a, surface);
  for (const [label, c] of progColors(T)) {
    add(`Home, Quanto ti resta su surface: ${label}, testo`, c, surface, 4.5);
    add(`Home, Quanto ti resta su surface: ${label}, anello sulla traccia`, c, surfTrack, 3);
  }
  add('Piano, riga evidenziata: rosso su ambra tenue', hex(T.danger), hex(T['amber-soft']), 4.5);
  add('Piano, riga evidenziata: ambra su ambra tenue (Andrà oltre)', hex(T.amber), hex(T['amber-soft']), 4.5);
  add('Piano, barra Andrà oltre sulla traccia (surface-2, anche nella riga evidenziata)', hex(T['risk-bar']), s2, 3);
  add('Piano, barra Andrà oltre su surface', hex(T['risk-bar']), surface, 3);
  add('barra uscite del grafico su surface', hex(T['chart-expense']), surface, 3);
  add('barra entrate del grafico su surface', hex(T.income), surface, 3);
  add('scheda attiva: verde su tinta tenue', hex(T.accent), hex(T['accent-soft']), 4.5);
  add('testo su segmento scelto', text, hex(T['segment-on']), 4.5);
  // Colori di conti e categorie: glifo bianco sul riquadro pieno.
  for (const c of PALETTE) add(`glifo bianco su colore ${c}`, [255, 255, 255], hex(c), 3);
  return out;
}

// ---- v9, materiale "Vetro" ----
// Filtro saturate(s) della specifica Filter Effects (matrice in sRGB, canali limitati a 0–255).
export function saturate(c, s) {
  const [r, g, b] = c;
  return [
    (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b,
    (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b,
  ].map((v) => Math.round(Math.min(255, Math.max(0, v))));
}
const SAT = 1.7; // backdrop-filter: saturate(170%) dei blocchi della Home e della barra delle schede

// Ogni punto della luce di fondo: le tappe esadecimali di --page-light (l'ultima è il fondo) e le loro miscele a passi
// di 0,1 in coordinate baricentriche, che coprono anche le zone dove due o tre luci si sovrappongono.
function lightPoints(T) {
  const vs = stops(T['page-light']);
  assert.equal(vs.length, 4, '--page-light: tre luci e il fondo');
  const out = [];
  const N = 10;
  for (let a = 0; a <= N; a++) for (let b = 0; a + b <= N; b++) for (let c = 0; a + b + c <= N; c++) {
    const w = [a, b, c, N - a - b - c].map((x) => x / N);
    out.push(vs[0].map((_, i) => Math.round(vs.reduce((t, v, k) => t + v[i] * w[k], 0))));
  }
  return out;
}

// Colore risultante del vetro: --glass sopra il punto della luce, con e senza saturate (card fuori dalla Home).
function glassColors(T) {
  const g = rgba(T.glass);
  const seen = new Map();
  for (const p of lightPoints(T)) for (const back of [p, saturate(p, SAT)]) {
    const c = over(g.c, g.a, back);
    seen.set(c.join(','), c);
  }
  return [...seen.values()];
}

// Testi che stanno sul vetro: testo, grigio, verde e rosso, avvisi, colori d'ambito (titoli delle card con tinta),
// colore progressivo di Quanto ti resta (ogni 1 %).
function glassForegrounds(T) {
  const out = [['testo', hex(T.text)], ['grigio secondario', hex(T.muted)], ['verde', hex(T.accent)], ['rosso', hex(T.danger)], ['avviso', hex(T.warning)], ['entrate', hex(T.income)]];
  for (const k of TINTS) out.push([`tinta ${k}`, hex(T[k])]);
  for (const [label, c] of progColors(T)) out.push([`Quanto ti resta, ${label}`, c]);
  return out;
}

// Gradiente lineare a 180°: colore (premoltiplicato) alla posizione pct, con le tappe rgba(...) [p%].
function gradStops(s) {
  const list = [...s.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)\s*([\d.]+%)?/g)];
  return list.map((m, i) => ({ c: [m[1], m[2], m[3]].map(Number), a: Number(m[4]), p: m[5] ? parseFloat(m[5]) : (i === 0 ? 0 : 100) }));
}
function gradOver(s, pct, bg) {
  const st = gradStops(s);
  let i = 0;
  while (i < st.length - 2 && pct > st[i + 1].p) i++;
  const a = st[i]; const b = st[i + 1] || a;
  const t = pct <= a.p ? 0 : pct >= b.p ? 1 : (pct - a.p) / (b.p - a.p);
  const alpha = a.a + (b.a - a.a) * t;
  const pre = a.c.map((v, k) => v * a.a + (b.c[k] * b.a - v * a.a) * t);
  return bg.map((v, k) => Math.round(pre[k] + v * (1 - alpha)));
}
// Minimo contrasto lungo una fascia del pulsante (dal from % al to % dell'altezza, a passi di 1 %).
const bandMin = (fg, grad, fill, from, to) => {
  let min = Infinity;
  for (let p = from; p <= to; p++) min = Math.min(min, ratio(fg, gradOver(grad, p, fill)));
  return min;
};
const BADGE_GLOSS = /\.mini-badge \{ background-image: (linear-gradient\([^;]+\)); \}/.exec(css)?.[1];

// Coppie [descrizione, rapporto, minimo] del materiale v9.
function glassPairs(T) {
  const out = [];
  const glass = glassColors(T);
  for (const [what, fg] of glassForegrounds(T)) {
    out.push([`vetro: ${what} (peggiore su ${glass.length} punti della luce)`, Math.min(...glass.map((g) => ratio(fg, g))), 4.5]);
  }
  // Testo dei pulsanti: fascia 20–80 % dell'altezza (testo da 15–17 px su 36–44 px). Glifi delle icone: 18–82 %.
  const white = [255, 255, 255];
  for (const k of ['accent', 'amber', 'pink']) out.push([`pulsante pieno ${k}: bianco sul riflesso`, bandMin(white, T['gloss-fill'], hex(fillOf(T, k)), 20, 80), 4.5]);
  out.push(['pulsante tenue / scheda attiva: verde sul riflesso', bandMin(hex(T.accent), T['gloss-soft'], hex(T['accent-soft']), 20, 80), 4.5]);
  out.push(['pulsante ambra tenue: ambra sul riflesso', bandMin(hex(T.amber), T['gloss-soft'], hex(T['amber-soft']), 20, 80), 4.5]);
  out.push(['pulsante rosa tenue: rosa sul riflesso', bandMin(hex(T.pink), T['gloss-soft'], hex(T['pink-soft']), 20, 80), 4.5]);
  out.push(['segmento scelto: testo sul riflesso', bandMin(hex(T.text), T['gloss-soft'], hex(T['segment-on']), 20, 80), 4.5]);
  assert.ok(BADGE_GLOSS, 'riflesso delle icone non trovato in app.css');
  const fills = ['accent', 'teal', 'indigo', 'violet', 'amber', 'pink', 'butter'].map((k) => [k, hex(fillOf(T, k))]);
  fills.push(['grafite', hex('#5C5E65')]);
  for (const [k, f] of fills) out.push([`icona ${k}: glifo bianco sul riflesso`, bandMin(white, BADGE_GLOSS, f, 18, 82), 3]);
  return out;
}

for (const [name, T] of [['chiaro', LIGHT], ['scuro', DARK]]) {
  test(`v9 vetro e riflessi: contrasto WCAG AA, tema ${name}`, () => {
    const bad = glassPairs(T).filter(([, r, need]) => r < need).map(([what, r, need]) => `${what}: ${r.toFixed(2)} < ${need}`);
    assert.deepEqual(bad, []);
  });
}

test('v9: il riflesso dei pulsanti pieni resta sopra la fascia del testo', () => {
  for (const T of [LIGHT, DARK]) {
    const st = gradStops(T['gloss-fill']);
    for (const s of st) if (s.p >= 20 && s.c[0] === 255) assert.ok(s.a <= 0.06, `riflesso ${s.a} al ${s.p}%`);
  }
});

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
  // v9: vetro (peggiore su ogni punto della luce) e riflessi dei pulsanti; il colore progressivo come minimo.
  console.log('\n| Tema | Coppia v9 | Rapporto | Minimo |\n|---|---|---|---|');
  for (const [name, T] of [['chiaro', LIGHT], ['scuro', DARK]]) {
    const ps = glassPairs(T);
    for (const [what, r, need] of ps.filter(([w]) => !w.includes('Quanto ti resta'))) console.log(`| ${name} | ${what} | ${r.toFixed(2).replace('.', ',')}:1 | ${need}:1 |`);
    const prog = Math.min(...ps.filter(([w]) => w.includes('Quanto ti resta')).map(([, r]) => r));
    console.log(`| ${name} | vetro: Quanto ti resta, colore progressivo (minimo di 303 colori) | ${prog.toFixed(2).replace('.', ',')}:1 | 4.5:1 |`);
  }
}

// Test di js/routes.js: ogni rotta delle versioni precedenti porta a una vista o a un reindirizzamento, mai a un errore.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveRoute } from '../js/routes.js';

const r = (hash) => {
  const [p, q = ''] = hash.replace(/^#/, '').split('?');
  return resolveRoute(p.split('/').filter(Boolean), Object.fromEntries(new URLSearchParams(q)));
};

test('rotte delle versioni precedenti (CONTESTO): vista o reindirizzamento', () => {
  const views = {
    '#home': ['home', 'home'],
    '#da-confermare': ['da-confermare', 'home'],
    '#da-confermare?programmato=x': ['da-confermare', 'home'],
    '#da-ricevere': ['da-ricevere', 'home'],
    '#programmati': ['programmati', 'home'],
    '#programmati/abc': ['programmati', 'home'],
    '#movimenti?periodo=mese&da=&a=&conto=c&categoria=k&q=bar': ['movimenti', 'movimenti'],
    '#statistiche?periodo=anno': ['statistiche', 'statistiche'],
    '#statistiche/stipendio?anno=2026': ['stipendio', 'statistiche'],
    '#conti': ['conti', 'conti'],
    '#conti/abc': ['conto', 'conti'],
    '#obiettivi/abc': ['obiettivo', 'budget'],
  };
  for (const s of ['tema', 'categorie', 'budget', 'backup', 'csv', 'sync', 'installa']) views[`#impostazioni/${s}`] = ['impostazioni', 'home'];
  views['#impostazioni'] = ['impostazioni', 'home'];
  for (const [hash, [name, tab]] of Object.entries(views)) assert.deepEqual(r(hash), { name, tab }, hash);
});

test('reindirizzamenti con la query conservata', () => {
  assert.deepEqual(r('#calendario?mese=2026-03&giorno=2026-03-12'), { redirect: 'movimenti?vista=calendario&mese=2026-03&giorno=2026-03-12' });
  assert.deepEqual(r('#calendario'), { redirect: 'movimenti?vista=calendario' });
  assert.deepEqual(r('#conti/obiettivi'), { redirect: 'budget/obiettivi' });
  assert.deepEqual(r('#obiettivi'), { redirect: 'budget/obiettivi' });
  assert.deepEqual(r('#impostazioni/fondo-pensione'), { redirect: 'statistiche/fondo-pensione' });
  assert.deepEqual(r('#qualcosa'), { redirect: 'home' });
  assert.deepEqual(r(''), { redirect: 'home' });
});

test('rotte nuove della v4', () => {
  assert.deepEqual(r('#budget'), { name: 'budget', tab: 'budget' });
  assert.deepEqual(r('#budget/obiettivi'), { name: 'budget', tab: 'budget' });
  assert.deepEqual(r('#statistiche/fondo-pensione'), { name: 'fondo-pensione', tab: 'statistiche' });
  assert.deepEqual(r('#impostazioni/periodo'), { name: 'impostazioni', tab: 'home' });
  assert.deepEqual(r('#impostazioni/importa'), { name: 'impostazioni', tab: 'home' });
  assert.deepEqual(r('#da-ricevere?persona=Anna'), { name: 'da-ricevere', tab: 'home' });
  assert.deepEqual(r('#movimenti?vista=calendario&mese=2026-03&giorno=2026-03-02'), { name: 'movimenti', tab: 'movimenti' });
});

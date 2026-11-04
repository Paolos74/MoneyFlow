// Test di js/period.js: periodo dallo stipendio, quanto ti resta e puoi spendere oggi (esempi fatti a mano).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, PALETTE } from '../js/store.js';
import * as C from '../js/calc.js';
import { budgetPeriod, remaining } from '../js/period.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

function world() {
  const store = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid() });
  const cat = (type, name) => store.getState().categories.find((c) => c.type === type && c.name === name).id;
  const eur = store.addAccount({ name: 'Conto', kind: 'eur', initial: 0, color: PALETTE[1] });
  const salary = (date, amount = 200000) => store.addMovement({ type: 'entrata', date, amount, accountId: eur.id, categoryId: cat('entrata', 'Stipendio') });
  return { store, cat, eur, salary };
}

const pick = (p) => [p.from, p.to, p.mode, p.estimatedEnd];

test('mese di calendario (predefinito)', () => {
  const { store, salary } = world();
  salary('2026-03-27');
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-04-10')), ['2026-04-01', '2026-04-30', 'calendar', false]);
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-04-10', 'calendar')), ['2026-04-01', '2026-04-30', 'calendar', false]);
});

test('dallo stipendio: 27/03 e 28/04 → 27/03–27/04', () => {
  const { store, salary } = world();
  salary('2026-03-27');
  salary('2026-04-28');
  const p = budgetPeriod(store.getState(), '2026-04-10', 'salary');
  assert.deepEqual(pick(p), ['2026-03-27', '2026-04-27', 'salary', false]);
  assert.equal(p.salaryDate, '2026-03-27');
  // il giorno dello stipendio nuovo apre il periodo nuovo
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-04-28', 'salary')).slice(0, 2), ['2026-04-28', '2026-05-27']);
});

test('dallo stipendio: solo il 27/03 → 27/03–26/04 stimato', () => {
  const { store, salary } = world();
  salary('2026-03-27');
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-04-10', 'salary')), ['2026-03-27', '2026-04-26', 'salary', true]);
});

test('dallo stipendio: 31/01 → fine 27/02 (fine mese ridotta)', () => {
  const { store, salary } = world();
  salary('2026-01-31');
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-02-10', 'salary')), ['2026-01-31', '2026-02-27', 'salary', true]);
});

test('stipendio in ritardo: oggi 29/04 senza stipendio nuovo → fine 29/04, 1 giorno', () => {
  const { store, salary } = world();
  salary('2026-03-27');
  const s = store.getState();
  const p = budgetPeriod(s, '2026-04-29', 'salary');
  assert.deepEqual(pick(p), ['2026-03-27', '2026-04-29', 'salary', true]);
  assert.equal(remaining(s, p, '2026-04-29').daysLeft, 1);
});

test('senza stipendi → mese di calendario (calendar-fallback); stipendi eliminati non contano', () => {
  const { store, salary } = world();
  const m = salary('2026-03-27');
  store.deleteMovement(m.id);
  assert.deepEqual(pick(budgetPeriod(store.getState(), '2026-04-10', 'salary')), ['2026-04-01', '2026-04-30', 'calendar-fallback', false]);
});

test('puoi spendere oggi: 2.000 − 650 − 300 = 1.050, 10 giorni → 105,00 al giorno', () => {
  const { store, cat, eur, salary } = world();
  salary('2026-04-01', 200000);
  store.addMovement({ type: 'uscita', date: '2026-04-03', amount: 50000, accountId: eur.id, categoryId: cat('uscita', 'Casa') });
  // 170,00 con 20,00 esclusi: contano 150,00 → uscite contate 650,00
  store.addMovement({ type: 'uscita', date: '2026-04-05', amount: 17000, excluded: 2000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti') });
  // restituzioni, trasferimenti e programmati gestiti non contano
  const cash = store.addAccount({ name: 'Contanti', kind: 'eur', initial: 0, color: PALETTE[2] });
  store.addMovement({ type: 'trasferimento', date: '2026-04-06', amount: 10000, accountId: eur.id, toAccountId: cash.id });
  // programmato 300,00 ancora da pagare nel periodo; un'entrata programmata non conta
  store.addScheduled({ type: 'uscita', amount: 30000, accountId: eur.id, categoryId: cat('uscita', 'Bollette'), start: '2026-04-25', freq: 'once' });
  store.addScheduled({ type: 'entrata', amount: 99999, accountId: eur.id, categoryId: cat('entrata', 'Altro'), start: '2026-04-26', freq: 'once' });
  const done = store.addScheduled({ type: 'uscita', amount: 4000, accountId: eur.id, categoryId: cat('uscita', 'Abbonamenti'), start: '2026-04-02', freq: 'once' });
  store.confirmOccurrence(done.id, '2026-04-02', { amount: 4000 });
  const s = store.getState();
  const p = budgetPeriod(s, '2026-04-21', 'calendar');
  // oggi 21/04, fine 30/04 compresa → 10 giorni
  const r = remaining(s, p, '2026-04-21');
  assert.deepEqual(r, { income: 200000, expense: 69000, planned: 30000, left: 101000, daysLeft: 10, perDay: 10100 });
});

test('puoi spendere oggi: esempio del piano senza programmati confermati', () => {
  const { store, cat, eur, salary } = world();
  salary('2026-04-01', 200000);
  store.addMovement({ type: 'uscita', date: '2026-04-03', amount: 50000, accountId: eur.id, categoryId: cat('uscita', 'Casa') });
  store.addMovement({ type: 'uscita', date: '2026-04-05', amount: 17000, excluded: 2000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti') });
  // programmato scaduto e da confermare (20/04 ≤ oggi): conta lo stesso
  store.addScheduled({ type: 'uscita', amount: 30000, accountId: eur.id, categoryId: cat('uscita', 'Bollette'), start: '2026-04-20', freq: 'once' });
  const s = store.getState();
  const r = remaining(s, budgetPeriod(s, '2026-04-21'), '2026-04-21');
  assert.deepEqual(r, { income: 200000, expense: 65000, planned: 30000, left: 105000, daysLeft: 10, perDay: 10500 });
});

test('rimanente negativo → puoi spendere 0; budgetStatus accetta un periodo', () => {
  const { store, cat, eur, salary } = world();
  salary('2026-03-27', 10000);
  const casa = cat('uscita', 'Casa');
  store.updateCategory(casa, { budget: 30000 });
  store.addMovement({ type: 'uscita', date: '2026-03-30', amount: 20000, accountId: eur.id, categoryId: casa });
  store.addMovement({ type: 'uscita', date: '2026-04-02', amount: 5000, accountId: eur.id, categoryId: casa });
  const s = store.getState();
  const p = budgetPeriod(s, '2026-04-10', 'salary');
  const r = remaining(s, p, '2026-04-10');
  assert.equal(r.left, -15000);
  assert.equal(r.perDay, 0);
  assert.equal(r.daysLeft, 17); // 10/04 → 26/04 compresi
  assert.equal(C.budgetStatus(s, p)[0].spent, 25000);
  assert.equal(C.budgetStatus(s, '2026-04')[0].spent, 5000);
});

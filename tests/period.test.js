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
  assert.deepEqual(r, { mode: 'cashflow', income: 200000, expense: 69000, planned: 30000, left: 101000, daysLeft: 10, perDay: 10100 });
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
  assert.deepEqual(r, { mode: 'cashflow', income: 200000, expense: 65000, planned: 30000, left: 105000, daysLeft: 10, perDay: 10500 });
});

test('rimanente negativo → puoi spendere 0; budgetStatus accetta un periodo', () => {
  const { store, cat, eur, salary } = world();
  salary('2026-03-27', 10000);
  const casa = cat('uscita', 'Casa');
  store.addMovement({ type: 'uscita', date: '2026-03-30', amount: 20000, accountId: eur.id, categoryId: casa });
  store.addMovement({ type: 'uscita', date: '2026-04-02', amount: 5000, accountId: eur.id, categoryId: casa });
  let s = store.getState();
  const p = budgetPeriod(s, '2026-04-10', 'salary');
  // senza budget: calcolo v4 (entrate − uscite − programmati)
  const r = remaining(s, p, '2026-04-10');
  assert.equal(r.mode, 'cashflow');
  assert.equal(r.left, -15000);
  assert.equal(r.perDay, 0);
  assert.equal(r.daysLeft, 17); // 10/04 → 26/04 compresi
  // v5: con un budget (Casa 300,00) il rimanente è 300,00 − 250,00 = 50,00
  store.updateCategory(casa, { budget: 30000 });
  s = store.getState();
  assert.deepEqual([remaining(s, p, '2026-04-10').mode, remaining(s, p, '2026-04-10').left], ['budget', 5000]);
  assert.equal(C.budgetStatus(s, p)[0].spent, 25000);
  assert.equal(C.budgetStatus(s, '2026-04')[0].spent, 5000);
});

// ---- v5: "Quanto ti resta" sul budget complessivo ed esempi del piano calcolati a mano ----
import { progressStop, savedInPeriod } from '../js/period.js';

// E1: novembre 2026, oggi 21/11; budget Spesa 300,00 + Svago 200,00; uscite Spesa 120,00, Ristoranti 80,00,
// Svago 50,00 con 10,00 esclusi → contate 240,00.
function e1() {
  const w = world();
  const { store, cat, eur } = w;
  store.updateCategory(cat('uscita', 'Spesa'), { budget: 30000 });
  store.updateCategory(cat('uscita', 'Svago'), { budget: 20000 });
  store.addMovement({ type: 'uscita', date: '2026-11-03', amount: 12000, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
  store.addMovement({ type: 'uscita', date: '2026-11-05', amount: 8000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti') });
  store.addMovement({ type: 'uscita', date: '2026-11-08', amount: 5000, excluded: 1000, accountId: eur.id, categoryId: cat('uscita', 'Svago') });
  return w;
}

test('v5 E1: resta 500,00 − 240,00 = 260,00 €, speso 48,0 %, oggi 26,00 € (10 giorni), 37,14 € con 7 giorni', () => {
  const { store } = e1();
  const s = store.getState();
  const p = budgetPeriod(s, '2026-11-21');
  const r = remaining(s, p, '2026-11-21');
  assert.deepEqual([r.mode, r.budget, r.expense, r.left, r.spentTenths, r.over, r.daysLeft, r.perDay], ['budget', 50000, 24000, 26000, 480, false, 10, 2600]);
  assert.equal(remaining(s, p, '2026-11-24').perDay, 3714); // 260,00 ÷ 7 = 37,142… → 37,14
  // le entrate e i programmati non contano nel modo budget
  assert.equal(r.planned, 0);
  assert.deepEqual(C.budgetAdvice(s, p), { unbudgeted: [{ categoryId: 'default-uscita-ristoranti', value: 8000 }], other: 0, otherBudgeted: false });
});

test('v5 colore: 0, 50, 85, 100 e 112 % con "sforato di 60,00 €"', () => {
  const cases = [[0, 50000, 0, false], [25000, 25000, 500, false], [42500, 7500, 850, false], [50000, 0, 1000, false], [56000, -6000, 1120, true]];
  for (const [spent, left, tenths, over] of cases) {
    const { store, cat, eur } = world();
    store.updateCategory(cat('uscita', 'Spesa'), { budget: 30000 });
    store.updateCategory(cat('uscita', 'Svago'), { budget: 20000 });
    if (spent) store.addMovement({ type: 'uscita', date: '2026-11-02', amount: spent, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
    const s = store.getState();
    const r = remaining(s, budgetPeriod(s, '2026-11-21'), '2026-11-21');
    assert.deepEqual([r.left, r.spentTenths, r.over], [left, tenths, over], `speso ${spent}`);
    if (left <= 0) assert.equal(r.perDay, 0);
  }
  assert.deepEqual([0, 250, 480, 500, 570, 700, 850, 920, 1000, 1120].map((t) => { const x = progressStop(t); return [x.from, x.to, x.mix]; }),
    [[0, 1, 0], [0, 1, 50], [0, 1, 96], [1, 2, 0], [1, 2, 20], [1, 2, 57], [2, 3, 0], [2, 3, 47], [3, 3, 0], [3, 3, 0]]);
});

test('v5 sforato di un centesimo: 500,01 su 500,00 → over con p = 100,0 %', () => {
  const { store, cat, eur } = world();
  store.updateCategory(cat('uscita', 'Spesa'), { budget: 50000 });
  store.addMovement({ type: 'uscita', date: '2026-11-02', amount: 50001, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
  const s = store.getState();
  const r = remaining(s, budgetPeriod(s, '2026-11-21'), '2026-11-21');
  assert.deepEqual([r.left, r.spentTenths, r.over], [-1, 1000, true]);
});

test('v5 E2: nessun budget → calcolo v4 2.000 − 650 − 300 = 1.050,00 €', () => {
  const { store, cat, eur, salary } = world();
  salary('2026-11-01', 200000);
  store.addMovement({ type: 'uscita', date: '2026-11-03', amount: 65000, accountId: eur.id, categoryId: cat('uscita', 'Casa') });
  store.addScheduled({ type: 'uscita', amount: 30000, accountId: eur.id, categoryId: cat('uscita', 'Bollette'), start: '2026-11-25', freq: 'once' });
  const s = store.getState();
  const r = remaining(s, budgetPeriod(s, '2026-11-21'), '2026-11-21');
  assert.deepEqual(r, { mode: 'cashflow', income: 200000, expense: 65000, planned: 30000, left: 105000, daysLeft: 10, perDay: 10500 });
});

test('v5 consiglio: Ristoranti senza budget e Altro (E1 + 45,00 in Altro), Altro mai contato due volte', () => {
  const { store, cat, eur } = e1();
  store.addMovement({ type: 'uscita', date: '2026-11-09', amount: 4500, accountId: eur.id, categoryId: cat('uscita', 'Altro') });
  let s = store.getState();
  const p = budgetPeriod(s, '2026-11-21');
  const r = remaining(s, p, '2026-11-21');
  assert.deepEqual([r.expense, r.left, r.spentTenths, r.perDay], [28500, 21500, 570, 2150]);
  assert.deepEqual(C.budgetAdvice(s, p), { unbudgeted: [{ categoryId: 'default-uscita-ristoranti', value: 8000 }], other: 4500, otherBudgeted: false });
  store.updateCategory('default-uscita-altro', { budget: 1000 });
  s = store.getState();
  assert.deepEqual(C.budgetAdvice(s, p), { unbudgeted: [{ categoryId: 'default-uscita-ristoranti', value: 8000 }], other: 4500, otherBudgeted: true });
});

// E3: novembre 2026. Stipendio 2.000,00 + dividendo 30,00; uscite contate 240,00 (E1); obiettivi 150,00 + 50,00;
// deposito +500,00 −100,00; ETF Compra 501,00 + 281,00, Vendi arrivati 346,99; crypto Compra 100,00 esclusa.
test('v5 E3: metti da parte 1.790,00 €, obiettivi 200,00 €, verso deposito e investimenti 835,01 €', () => {
  const { store, cat, eur, salary } = e1();
  salary('2026-11-01', 200000);
  const dep = store.addAccount({ name: 'Deposito', kind: 'eur', initial: 0, color: PALETTE[6], deposit: { start: '2026-11-01', withholdingBp: 2600, rates: [{ from: '2026-11-01', rateBp: 200 }] } });
  const btc = store.addAccount({ name: 'Wallet', kind: 'crypto', asset: 'BTC', initial: 0, color: PALETTE[8] });
  const etf = store.addInvestment({ name: 'ETF Mondo prova', color: PALETTE[9] });
  store.ensureDividendCategory();
  store.addMovement({ type: 'entrata', date: '2026-11-15', amount: 3000, accountId: eur.id, categoryId: 'default-entrata-dividendi', etfId: etf.id, taxRegime: 'amministrato' });
  store.addMovement({ type: 'trasferimento', date: '2026-11-02', amount: 50000, accountId: eur.id, toAccountId: dep.id });
  store.addMovement({ type: 'trasferimento', date: '2026-11-10', amount: 10000, accountId: dep.id, toAccountId: eur.id });
  store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-04', amount: 50100, amountTo: 10e8, price: 500000, accountId: eur.id, toAccountId: etf.id, etfId: etf.id });
  store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-06', amount: 28100, amountTo: 5e8, price: 560000, accountId: eur.id, toAccountId: etf.id, etfId: etf.id });
  store.addMovement({ type: 'trasferimento', trade: 'vendi', date: '2026-11-12', amount: 6e8, amountTo: 34699, tax: 1201, taxRegime: 'amministrato', price: 600000, accountId: etf.id, toAccountId: eur.id, etfId: etf.id });
  store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-07', amount: 10000, amountTo: 100000, price: 10000000, accountId: eur.id, toAccountId: btc.id });
  const g1 = store.addGoal({ name: 'Vacanza', target: 100000, color: PALETTE[5] });
  const g2 = store.addGoal({ name: 'Bici', target: 50000, color: PALETTE[4] });
  store.adjustGoal(g1.id, 15000, '2026-11-02');
  store.adjustGoal(g2.id, 5000, '2026-11-20');
  store.adjustGoal(g1.id, 9900, '2026-10-30');
  const s = store.getState();
  const sv = savedInPeriod(s, budgetPeriod(s, '2026-11-21'));
  assert.deepEqual([sv.income, sv.expense, sv.net, sv.goals, sv.moved], [203000, 24000, 179000, 20000, 83501]);
  assert.equal(sv.rate, 882); // 1.790 ÷ 2.030 = 88,2 %
  // periodo dallo stipendio dal 27/10 al 26/11: obiettivi del mese di inizio (ottobre)
  assert.equal(savedInPeriod(s, { from: '2026-10-27', to: '2026-11-26' }).goals, 9900);
});

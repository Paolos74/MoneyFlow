// Test di js/calc.js: saldi, quota esclusa e restituzione (caso D20 fatto a mano), patrimonio, aggregati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, PALETTE } from '../js/store.js';
import * as C from '../js/calc.js';
import { readFileSync } from 'node:fs';
import { memoryStorage, clock, seqUuid } from './helpers.js';

function world() {
  const now = clock();
  const store = createStore({ storage: memoryStorage(), now, uuid: seqUuid() });
  const cat = (type, name) => store.getState().categories.find((c) => c.type === type && c.name === name).id;
  const eur = store.addAccount({ name: 'Revolut', kind: 'eur', initial: 10000, color: PALETTE[1] });
  return { store, now, cat, eur };
}

test('caso D20: 100 € + entrata 1.000 €, spesa 40 € con 20 € esclusi, restituzione 20 €', () => {
  const { store, cat, eur, now } = world();
  store.addMovement({ type: 'entrata', date: '2025-03-01', amount: 100000, accountId: eur.id, categoryId: cat('entrata', 'Stipendio') });
  now.advance(10);
  const e = store.addMovement({ type: 'uscita', date: '2025-03-02', amount: 4000, excluded: 2000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti') });
  let s = store.getState();
  assert.equal(C.accountBalance(s, eur.id), 10000 + 100000 - 4000);
  assert.deepEqual(C.openCredits(s).total, 2000);
  now.advance(10);
  const r = store.addMovement({ type: 'restituzione', date: '2025-03-05', amount: 500, accountId: eur.id, refundOf: e.id });
  s = store.getState();
  assert.equal(C.openCredits(s).total, 1500);
  assert.equal(C.openCredits(s).items[0].residual, 1500);
  store.updateMovement(r.id, { amount: 2000 });
  s = store.getState();
  assert.equal(C.accountBalance(s, eur.id), 108000); // 1.080 €
  const t = C.totals(s, '2025-03-01', '2025-03-31');
  assert.equal(t.expense, 2000);
  assert.equal(t.income, 100000);
  assert.equal(t.rate, 980); // 98,0 %
  assert.equal(C.openCredits(s).total, 0);
  assert.deepEqual(C.byCategory(s, '2025-03-01', '2025-03-31').map((x) => [x.label, x.value, x.pct]), [['Ristoranti', 2000, 1000]]);
  // spesa eliminata: il credito sparisce, la restituzione resta e non conta come entrata
  store.deleteMovement(e.id);
  s = store.getState();
  assert.equal(C.openCredits(s).total, 0);
  assert.equal(C.totals(s, '2025-03-01', '2025-03-31').income, 100000);
  assert.equal(C.accountBalance(s, eur.id), 10000 + 100000 + 2000);
});

test('entrate 0 → tasso 0; tasso negativo possibile', () => {
  const { store, cat, eur } = world();
  store.addMovement({ type: 'uscita', date: '2025-03-02', amount: 4000, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
  assert.equal(C.totals(store.getState(), '2025-03-01', '2025-03-31').rate, 0);
  store.addMovement({ type: 'entrata', date: '2025-03-02', amount: 2000, accountId: eur.id, categoryId: cat('entrata', 'Altro') });
  assert.equal(C.totals(store.getState(), '2025-03-01', '2025-03-31').rate, -1000);
});

test('trasferimento EUR→BTC e variazione: nessun effetto su entrate e uscite', () => {
  const { store, eur, now } = world();
  const btc = store.addAccount({ name: 'Coinbase', kind: 'crypto', asset: 'BTC', initial: 1000000, color: PALETTE[3] });
  const eth = store.addAccount({ name: 'Wallet', kind: 'crypto', asset: 'ETH', initial: 2, color: PALETTE[4] });
  now.advance(5);
  store.addMovement({ type: 'trasferimento', date: '2025-03-03', amount: 10000, accountId: eur.id, toAccountId: btc.id, amountTo: 120000 });
  store.addMovement({ type: 'variazione', date: '2025-03-04', amount: -1000, accountId: btc.id });
  const s = store.getState();
  assert.equal(C.accountBalance(s, eur.id), 0);
  assert.equal(C.accountBalance(s, btc.id), 1000000 + 120000 - 1000);
  assert.deepEqual(C.totals(s, '2025-01-01', '2025-12-31'), { income: 0, expense: 0, net: 0, rate: 0 });
  const nw = C.netWorth(s);
  assert.equal(nw.eurCents, 0);
  assert.deepEqual(nw.crypto, [{ asset: 'BTC', units: 1119000 }, { asset: 'ETH', units: 2 }]);
  assert.equal(C.cryptoLine(nw), '0,01119 BTC · 0,00000002 ETH');
  assert.equal(C.balances(s).get(btc.id), 1119000);
  assert.equal(eth.asset, 'ETH');
});

test('conto eliminato fuori dal patrimonio, i movimenti restano nelle statistiche', () => {
  const { store, cat, eur } = world();
  const cash = store.addAccount({ name: 'Contanti', kind: 'eur', initial: 5000, color: PALETTE[2] });
  store.addMovement({ type: 'uscita', date: '2025-03-02', amount: 1000, accountId: cash.id, categoryId: cat('uscita', 'Spesa') });
  store.deleteAccount(cash.id);
  const s = store.getState();
  assert.equal(C.netWorth(s).eurCents, 10000);
  assert.equal(C.totals(s, '2025-03-01', '2025-03-31').expense, 1000);
  assert.equal(C.accountLabel(s, cash.id), 'Contanti (eliminato)');
  assert.equal(C.accountLabel(s, 'nessuno'), 'Conto sconosciuto');
  store.deleteCategory(cat('uscita', 'Spesa'));
  assert.equal(C.categoryLabel(store.getState(), cat('uscita', 'Spesa')), 'Spesa (eliminata)');
  assert.equal(C.searchMovements(store.getState(), { q: 'eliminat' }).length, 1);
});

test('serie del patrimonio a fine mese e barre per mese', () => {
  const { store, cat, eur } = world();
  store.addMovement({ type: 'entrata', date: '2025-02-10', amount: 5000, accountId: eur.id, categoryId: cat('entrata', 'Altro') });
  store.addMovement({ type: 'uscita', date: '2025-03-10', amount: 3000, excluded: 1000, accountId: eur.id, categoryId: cat('uscita', 'Svago') });
  const s = store.getState();
  assert.deepEqual(C.netWorthSeries(s, ['2025-01', '2025-02', '2025-03']).map((p) => p.eurCents), [10000, 15000, 12000]);
  assert.deepEqual(C.byMonth(s, ['2025-02', '2025-03']).map((m) => [m.income, m.expense]), [[5000, 0], [0, 2000]]);
});

test('budget, obiettivi, abbonamenti', () => {
  const { store, cat, eur } = world();
  store.updateCategory(cat('uscita', 'Spesa'), { budget: 10000 });
  store.addMovement({ type: 'uscita', date: '2025-03-02', amount: 12000, excluded: 1000, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
  const b = C.budgetStatus(store.getState(), '2025-03');
  assert.equal(b.length, 1);
  assert.equal(b[0].spent, 11000);
  assert.equal(b[0].over, true);
  assert.equal(b[0].pct, 1100);

  const g = { target: 100000, saved: 40000, deadline: '2025-06-30' };
  assert.deepEqual(
    (({ remaining, monthly, monthsLeft, expired }) => ({ remaining, monthly, monthsLeft, expired }))(C.goalProgress(g, '2025-03-15')),
    { remaining: 60000, monthly: 15000, monthsLeft: 4, expired: false },
  );
  assert.equal(C.goalProgress({ ...g, target: 100001 }, '2025-03-15').monthly, 15001);
  assert.equal(C.goalProgress(g, '2025-07-01').expired, true);
  assert.equal(C.goalProgress({ ...g, deadline: null }, '2025-03-15').monthly, null);
  assert.equal(C.goalProgress({ ...g, saved: 100000 }, '2025-03-15').done, true);

  const base = { accountId: eur.id, categoryId: cat('uscita', 'Abbonamenti'), start: '2025-01-01' };
  store.addScheduled({ ...base, type: 'uscita', amount: 1000, freq: 'monthly' });
  store.addScheduled({ ...base, type: 'uscita', amount: 12000, freq: 'yearly' });
  store.addScheduled({ ...base, type: 'uscita', amount: 500, freq: 'monthly', end: '2025-02-01' });
  store.addScheduled({ ...base, type: 'uscita', amount: 9999, freq: 'once' });
  const r = C.recurringSummary(store.getState(), '2025-03-01');
  assert.equal(r.items.length, 2);
  assert.equal(r.yearly, 24000);
  assert.equal(r.monthly, 2000);
});

test('stipendio: lordo, trattenute, totali annui', () => {
  const { store, cat, eur } = world();
  const st = cat('entrata', 'Stipendio');
  store.addMovement({ type: 'entrata', date: '2025-01-27', amount: 150000, gross: 200000, accountId: eur.id, categoryId: st });
  store.addMovement({ type: 'entrata', date: '2025-02-26', amount: 160000, accountId: eur.id, categoryId: st });
  store.addMovement({ type: 'entrata', date: '2025-02-26', amount: 5000, accountId: eur.id, categoryId: cat('entrata', 'Rimborsi') });
  store.addMovement({ type: 'entrata', date: '2024-12-27', amount: 1, gross: 2, accountId: eur.id, categoryId: st });
  const y = C.salaryYear(store.getState(), 2025);
  assert.equal(y.rows.length, 2);
  assert.equal(y.net, 310000);
  assert.equal(y.gross, 200000);
  assert.equal(y.withheld, 50000);
  assert.equal(y.missing, 1);
  assert.deepEqual(C.salaryYears(store.getState(), 2025), [2024, 2025]);
});

test('voci recenti senza importo, ricerca, raggruppamento per giorno', () => {
  const { store, cat, eur, now } = world();
  const m = { type: 'uscita', accountId: eur.id, categoryId: cat('uscita', 'Spesa'), description: 'Supermercato' };
  store.addMovement({ ...m, date: '2025-03-01', amount: 2550, note: 'latte e pane' }); now.advance(1);
  store.addMovement({ ...m, date: '2025-03-02', amount: 1000 }); now.advance(1);
  store.addMovement({ ...m, date: '2025-03-02', amount: 700, description: 'Bar', categoryId: cat('uscita', 'Ristoranti') });
  const s = store.getState();
  const rec = C.recentTemplates(s);
  assert.equal(rec.length, 2);
  assert.equal(rec[0].description, 'Bar');
  assert.ok(!('amount' in rec[0]));
  assert.equal(C.searchMovements(s, { q: 'pane' }).length, 1);
  assert.equal(C.searchMovements(s, { q: '25,50' }).length, 1);
  assert.equal(C.searchMovements(s, { from: '2025-03-02', to: '2025-03-02' }).length, 2);
  assert.equal(C.searchMovements(s, { categoryId: cat('uscita', 'Ristoranti') }).length, 1);
  const g = C.groupByDay(C.searchMovements(s, {}));
  assert.deepEqual(g.map((d) => [d.date, d.items.length, d.total]), [['2025-03-02', 2, -1700], ['2025-03-01', 1, -2550]]);
});

test('calendario: pallini dei movimenti e programmati tratteggiati', () => {
  const { store, cat, eur } = world();
  store.addMovement({ type: 'uscita', date: '2025-03-05', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa') });
  store.addScheduled({ type: 'uscita', amount: 1000, accountId: eur.id, categoryId: cat('uscita', 'Casa'), start: '2025-02-01', freq: 'monthly' });
  const s = store.getState();
  const weeks = C.calendarMonth(s, '2025-03', '2025-03-10');
  const days = weeks.flat();
  assert.equal(days[0].date, '2025-02-24');
  assert.equal(days.length % 7, 0);
  const d5 = days.find((d) => d.date === '2025-03-05');
  assert.deepEqual(d5.dots, [{ color: C.categoryColor(s, cat('uscita', 'Spesa')), planned: false }]);
  assert.equal(days.find((d) => d.date === '2025-03-01').dots[0].planned, true);
  assert.equal(days.find((d) => d.date === '2025-03-10').isToday, true);
  assert.equal(C.pendingList(s, '2025-03-10').length, 2);
  const det = C.dayDetails(s, '2025-04-01', '2025-03-10');
  assert.equal(det.planned[0].pending, false);
});

test('promemoria backup dopo 30 giorni', () => {
  const day = 86400000;
  assert.equal(C.backupDue({ lastBackupAt: 0, firstUseAt: 0 }, 100 * day), false);
  assert.equal(C.backupDue({ lastBackupAt: 0, firstUseAt: day }, 32 * day), true);
  assert.equal(C.backupDue({ lastBackupAt: 10 * day, firstUseAt: day }, 32 * day), false);
});

test('v2 obiettivi: quota mensile scelta, messo da parte nel mese, attivi e completati', () => {
  const g = { target: 100000, saved: 40000, monthly: 5000, log: { '2025-03': 3000 } };
  const p = C.goalProgress(g, '2025-03-15');
  assert.equal(p.monthly, 5000);
  assert.equal(p.quota, 5000);
  assert.equal(p.monthSaved, 3000); // "30 di 50 €"
  assert.equal(C.goalProgress(g, '2025-04-01').monthSaved, 0);
  // senza quota resta il calcolo v1 (60.000 / 4 mesi)
  const v1 = C.goalProgress({ target: 100000, saved: 40000, deadline: '2025-06-30' }, '2025-03-15');
  assert.equal(v1.monthly, 15000);
  assert.equal(v1.quota, null);
  assert.equal(v1.monthSaved, 0);

  const state = { goals: [
    { id: 'a', name: 'A', target: 100, saved: 100, createdAt: 2, deleted: false },
    { id: 'b', name: 'B', target: 100, saved: 99, createdAt: 1, deleted: false },
    { id: 'c', name: 'C', target: 100, saved: 0, createdAt: 3, deleted: true },
  ] };
  assert.deepEqual(C.activeGoals(state).map((x) => x.id), ['b']);
  assert.deepEqual(C.completedGoals(state).map((x) => x.id), ['a']);
});

test('v2 stipendio: totali della busta paga e mesi con imponibile', () => {
  const { store, cat, eur } = world();
  const st = cat('entrata', 'Stipendio');
  store.addMovement({ type: 'entrata', date: '2025-03-10', amount: 80000, accountId: eur.id, categoryId: st, payslip: { taxable: 100000, irpef: 20000, contributions: 9000 } });
  store.addMovement({ type: 'entrata', date: '2025-03-27', amount: 40000, accountId: eur.id, categoryId: st, payslip: { taxable: 50000, irpef: 10000 } });
  store.addMovement({ type: 'entrata', date: '2025-04-27', amount: 280000, gross: 400000, accountId: eur.id, categoryId: st, payslip: { taxable: 370000, irpef: 86000, pension: 9750 } });
  store.addMovement({ type: 'entrata', date: '2025-05-27', amount: 280000, accountId: eur.id, categoryId: st });
  const y = C.salaryYear(store.getState(), 2025);
  assert.deepEqual(y.months, [{ ym: '2025-03', taxable: 150000, irpef: 30000 }, { ym: '2025-04', taxable: 370000, irpef: 86000 }]);
  assert.equal(y.taxable, 520000);
  assert.equal(y.irpef, 116000);
  assert.equal(y.contributions, 9000);
  assert.equal(y.pension, 9750);
  assert.equal(y.deductions, 0);
  assert.equal(y.rows[0].payslip.taxable, 100000);
  assert.equal(y.rows[3].payslip, null);
});

test('v2: lordo della fixture v1 letto come competenze lorde', () => {
  const raw = readFileSync(new URL('./fixtures/data-v1.json', import.meta.url), 'utf8');
  const store = createStore({ storage: memoryStorage({ 'moneyflow:data': raw }), now: clock(), uuid: seqUuid() });
  const y = C.salaryYear(store.getState(), 2025);
  assert.equal(y.gross, 230000);
  assert.equal(y.rows[0].payslip, null);
  assert.deepEqual(y.months, []);
});

test('v2 Compra/Vendi: etichetta', () => {
  const state = { accounts: [{ id: 'e', kind: 'eur' }, { id: 'b', kind: 'crypto', asset: 'BTC' }] };
  const m = { type: 'trasferimento', trade: 'compra', accountId: 'e', toAccountId: 'b' };
  assert.equal(C.isTrade(m), true);
  assert.equal(C.tradeLabel(state, m), 'Compra BTC');
  assert.equal(C.tradeLabel(state, { ...m, trade: 'vendi', accountId: 'b', toAccountId: 'e' }), 'Vendi BTC');
  assert.equal(C.isTrade({ type: 'trasferimento', trade: null }), false);
});

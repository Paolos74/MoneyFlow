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

// Valori calcolati dal codice v3 (a730f75) sulle fixture v2 e v3: devono restare uguali.
for (const v of ['v2', 'v3']) {
  test(`fixture ${v}: saldi, patrimonio, totali, crediti e stipendi come nella v3`, () => {
    const raw = readFileSync(new URL(`./fixtures/data-${v}.json`, import.meta.url), 'utf8');
    const store = createStore({ storage: memoryStorage({ 'moneyflow:data': raw }), now: clock(), uuid: seqUuid() });
    const s = store.getState();
    const id = (n) => `${v}-${String(n).padStart(4, '0')}`;
    assert.deepEqual([...C.balances(s)], [[id(1), 533151], [id(2), 11700], [id(3), 800], [id(4), 1649000]]);
    // v5: in più investCents (nessun ETF). v6 (decisione v6 §2): le crypto con una Compra entrano nel totale.
    // 0,01649 BTC × ultima Compra 80.000,00 (16/02/2026) = 1.319,20 €; totale 5.448,51 + 1.319,20 = 6.767,71 €.
    const nw = C.netWorth(s);
    assert.deepEqual([nw.eurCents, nw.investCents, nw.cryptoCents, nw.totalCents], [544851, 0, 131920, 676771]);
    assert.deepEqual(nw.crypto, [{ asset: 'BTC', units: 1649000 }]);
    assert.deepEqual(nw.cryptoValued.map((x) => [x.accountId, x.units, x.cents, x.info.price, x.info.date, x.info.source]), [[id(4), 1649000, 131920, 8000000, '2026-02-16', 'purchase']]);
    assert.deepEqual(nw.cryptoUnvalued, []);
    assert.deepEqual(C.totals(s, '2026-02-01', '2026-02-28'), { income: 205000, expense: 11550, net: 193450, rate: 944 });
    const oc = C.openCredits(s);
    assert.equal(oc.total, 3500);
    assert.deepEqual(oc.items.map((i) => [i.movement.id, i.residual]), [[id(8), 3500]]);
    const y = C.salaryYear(s, 2026);
    assert.deepEqual([y.net, y.gross, y.withheld, y.missing, y.taxable, y.irpef], [415000, 300000, 90000, 1, 273000, 52000]);
    assert.deepEqual(y.months, [{ ym: '2026-01', taxable: 273000, irpef: 52000 }]);
  });
}

// Valori calcolati dal codice v4 pubblicato (856eba0) sulla fixture v4: devono restare uguali.
test('fixture v4: saldi, patrimonio, totali e crediti come nella v4', () => {
  const raw = readFileSync(new URL('./fixtures/data-v4.json', import.meta.url), 'utf8');
  const s = createStore({ storage: memoryStorage({ 'moneyflow:data': raw }), now: clock(), uuid: seqUuid() }).getState();
  assert.deepEqual([...C.balances(s)], [['v4-0001', 423701], ['v4-0002', 6750], ['v4-0003', 100504], ['v4-0004', 1800000], ['v4-0005', 0]]);
  // v6: 0,018 BTC × Compra 60.000,00 del 12/02/2026 = 1.080,00 €; totale 5.309,55 + 1.080,00 = 6.389,55 €.
  const nw = C.netWorth(s);
  assert.deepEqual([nw.eurCents, nw.investCents, nw.cryptoCents, nw.totalCents], [530955, 0, 108000, 638955]);
  assert.deepEqual(nw.crypto, [{ asset: 'BTC', units: 1800000 }]);
  assert.deepEqual(nw.cryptoValued.map((x) => [x.info.price, x.info.date, x.info.source]), [[6000000, '2026-02-12', 'purchase']]);
  assert.deepEqual(C.totals(s, '2026-02-01', '2026-02-28'), { income: 205121, expense: 12750, net: 192371, rate: 938 });
  assert.equal(C.openCredits(s).total, 3000);
});

test('v4 spesa divisa: 90,00 tra Anna 30,00 e Luca 30,00, restituzioni per persona', () => {
  const { store, cat, eur, now } = world();
  const e = store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 9000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti'), split: [{ person: 'Anna', amount: 3000 }, { person: 'Luca', amount: 3000 }] });
  let s = store.getState();
  assert.equal(e.excluded, 6000);
  assert.equal(C.totals(s, '2026-03-01', '2026-03-31').expense, 3000, 'contata 30,00');
  assert.equal(C.accountBalance(s, eur.id), 10000 - 9000);
  now.advance(10);
  store.addMovement({ type: 'restituzione', date: '2026-03-02', amount: 3000, accountId: eur.id, refundOf: e.id, person: 'Anna' });
  store.addMovement({ type: 'restituzione', date: '2026-03-03', amount: 1000, accountId: eur.id, refundOf: e.id, person: 'Luca' });
  s = store.getState();
  assert.deepEqual(C.personShares(s, e).map((p) => [p.person, p.share, p.refunded, p.residual]), [['Anna', 3000, 3000, 0], ['Luca', 3000, 1000, 2000]]);
  assert.deepEqual(C.debtsByPerson(s).map((d) => [d.person, d.residual, d.items.length]), [['Luca', 2000, 1]]);
  assert.equal(C.openCredits(s).total, 2000, 'openCredits resta il totale per spesa');
  assert.equal(C.accountBalance(s, eur.id), 10000 - 9000 + 4000);
  assert.equal(C.totals(s, '2026-03-01', '2026-03-31').expense, 3000, 'le restituzioni non cambiano il conteggio');
});

test('v4 chi mi deve: nomi "luca" e "Luca" uniti, ordinati per residuo', () => {
  const { store, cat, eur, now } = world();
  const r = cat('uscita', 'Ristoranti');
  store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 9000, accountId: eur.id, categoryId: r, split: [{ person: 'Luca', amount: 3000 }, { person: 'Anna', amount: 1000 }] });
  now.advance(10);
  store.addMovement({ type: 'uscita', date: '2026-03-05', amount: 5000, accountId: eur.id, categoryId: r, split: [{ person: 'luca', amount: 2500 }] });
  const d = C.debtsByPerson(store.getState());
  assert.deepEqual(d.map((x) => [x.person, x.residual, x.items.length]), [['Luca', 5500, 2], ['Anna', 1000, 1]]);
  assert.equal(d[0].items[0].movement.date, '2026-03-05');
  assert.equal(C.debtOf(store.getState(), 'LUCA').residual, 5500);
  assert.deepEqual(C.knownPeople(store.getState()), ['Anna', 'Luca']);
});

test('v4 spesa v1 con solo excluded → voce "Senza nome"', () => {
  const { store, cat, eur } = world();
  const e = store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 4000, excluded: 2000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti') });
  store.addMovement({ type: 'restituzione', date: '2026-03-02', amount: 500, accountId: eur.id, refundOf: e.id });
  const s = store.getState();
  assert.deepEqual(C.personShares(s, e), [{ person: null, share: 2000, refunded: 500, residual: 1500 }]);
  assert.deepEqual(C.debtsByPerson(s), []);
  // spesa divisa modificata da una v3 (excluded 50,00, quote 30,00): 20,00 senza nome
  const raw = { ...store.find('movement', e.id), id: 'v3x', amount: 9000, excluded: 5000, split: [{ person: 'Anna', amount: 3000 }] };
  const s2 = { ...s, movements: [...s.movements, raw] };
  assert.deepEqual(C.personShares(s2, raw).map((p) => [p.person, p.residual]), [['Anna', 3000], [null, 2000]]);
});

test('v4 icone predefinite di categorie e conti', () => {
  const { store, eur } = world();
  const s = store.getState();
  assert.equal(C.categoryIcon(s, 'default-uscita-casa'), 'house');
  assert.equal(C.categoryIcon(s, 'default-entrata-interessi'), 'percent');
  assert.equal(C.categoryIcon(s, 'manca'), 'tag');
  const c = store.addCategory({ name: 'Gatto', type: 'uscita', color: PALETTE[0] });
  assert.equal(C.categoryIcon(store.getState(), c.id), 'tag');
  store.updateCategory(c.id, { icon: 'paw' });
  assert.equal(C.categoryIcon(store.getState(), c.id), 'paw');
  assert.equal(C.accountIcon(eur), 'bank');
  assert.equal(C.accountIcon({ kind: 'crypto' }), 'coin');
  assert.equal(C.accountIcon({ kind: 'eur', deposit: { start: '2026-01-01' } }), 'vault');
  assert.equal(C.accountIcon({ kind: 'eur', icon: 'piggy' }), 'piggy');
});

// ---- v5: fixture generata con lo store v5 pubblicato (5367ec2) ----
// Valori calcolati dal codice v5 sulla fixture: saldi, totale in euro, ETF e totali non cambiano in v6.
const loadV5 = () => createStore({ storage: memoryStorage({
  'moneyflow:data': readFileSync(new URL('./fixtures/data-v5.json', import.meta.url), 'utf8'),
  'moneyflow:investments': readFileSync(new URL('./fixtures/investments-v5.json', import.meta.url), 'utf8'),
}), now: clock(), uuid: seqUuid() });

test('fixture v5: saldi, patrimonio in euro, ETF, totali e crediti come nella v5', () => {
  const s = loadV5().getState();
  assert.deepEqual([...C.balances(s)], [['v5-0001', 209451], ['v5-0002', 3790], ['v5-0003', 50101], ['v5-0004', 800000]]);
  const nw = C.netWorth(s);
  assert.deepEqual([nw.eurCents, nw.investCents], [263342, 33600]);
  assert.deepEqual(nw.crypto, [{ asset: 'BTC', units: 800000 }]);
  assert.deepEqual(C.totals(s, '2026-02-01', '2026-02-28'), { income: 1557, expense: 16750, net: -15193, rate: -9758 });
  assert.equal(C.openCredits(s).total, 2000);
});

test('v6 fixture v1: BTC senza Compra resta fuori dal totale', () => {
  const raw = readFileSync(new URL('./fixtures/data-v1.json', import.meta.url), 'utf8');
  const s = createStore({ storage: memoryStorage({ 'moneyflow:data': raw }), now: clock(), uuid: seqUuid() }).getState();
  const nw = C.netWorth(s);
  assert.deepEqual([nw.eurCents, nw.cryptoCents, nw.totalCents], [260061, 0, 260061]);
  assert.deepEqual(nw.cryptoUnvalued, [{ asset: 'BTC', units: 2708500 }]);
});

test('v6 fixture v5: patrimonio v5 2.969,42 + 0,008 BTC × Compra 60.000,00 = 480,00 → 3.449,42 €', () => {
  const nw = C.netWorth(loadV5().getState());
  // v5: totalCents 296942 (263342 + 33600); v6: + tradeEuroCents(800000, 6000000) = 48000
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [48000, 344942]);
  assert.deepEqual(nw.cryptoValued.map((x) => [x.info.price, x.info.date, x.info.source]), [[6000000, '2026-02-05', 'purchase']]);
});

// ---- v6: crypto nel patrimonio con il valore scritto a mano (decisione v6 §2), esempi fatti a mano ----
// E7: "Conto principale" 2.000,00; "Wallet prova" BTC da 0. Compra 03/11 0,01 BTC a 60.000,00 = 600,00;
// Compra 10/11 0,005 BTC a 64.000,00 = 320,00. Conto euro 2.000,00 − 600,00 − 320,00 = 1.080,00.
function e7() {
  const now = clock();
  const store = createStore({ storage: memoryStorage(), now, uuid: seqUuid() });
  const eur = store.addAccount({ name: 'Conto principale', kind: 'eur', initial: 200000, color: PALETTE[1] });
  const btc = store.addAccount({ name: 'Wallet prova', kind: 'crypto', asset: 'BTC', initial: 0, color: PALETTE[3] });
  now.advance(10);
  store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-03', amount: 60000, amountTo: 1000000, price: 6000000, accountId: eur.id, toAccountId: btc.id });
  now.advance(10);
  store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-10', amount: 32000, amountTo: 500000, price: 6400000, accountId: eur.id, toAccountId: btc.id });
  return { store, now, eur, btc };
}

test('v6 E7: prima di Aggiorna valore 0,015 BTC × 64.000,00 = 960,00 (prezzo d\'acquisto), totale 2.040,00', () => {
  const { store, btc } = e7();
  const s = store.getState();
  assert.deepEqual(C.cryptoUnitValue(s, store.find('account', btc.id)), { price: 6400000, date: '2026-11-10', source: 'purchase' });
  const nw = C.netWorth(s);
  assert.deepEqual([nw.eurCents, nw.cryptoCents, nw.totalCents], [108000, 96000, 204000]);
  assert.deepEqual(nw.cryptoUnvalued, []);
  // al 05/11: 0,01 BTC × 60.000,00 = 600,00; conto euro 2.000,00 − 600,00 = 1.400,00
  const at5 = C.netWorth(s, '2026-11-05');
  assert.deepEqual([at5.eurCents, at5.cryptoCents, at5.totalCents], [140000, 60000, 200000]);
});

test('v6 E7: Aggiorna valore 70.000,00 → 1.050,00, totale 2.130,00; stessa data sostituita, Annulla', () => {
  const { store, btc } = e7();
  store.setAccountPrice(btc.id, '2026-11-20', 7000000);
  let s = store.getState();
  assert.deepEqual(C.cryptoUnitValue(s, store.find('account', btc.id)), { price: 7000000, date: '2026-11-20', source: 'manual' });
  let nw = C.netWorth(s);
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [105000, 213000]);
  // al 15/11 il valore scritto il 20/11 non c'è ancora: prezzo d'acquisto, 960,00
  assert.equal(C.netWorth(s, '2026-11-15').cryptoCents, 96000);
  assert.deepEqual(C.netWorthSeries(s, ['2026-10', '2026-11']).map((p) => [p.cryptoCents, p.totalCents]), [[0, 200000], [105000, 213000]]);
  // stessa data con 71.000,00: una sola voce
  const before = store.find('account', btc.id).prices.slice();
  store.setAccountPrice(btc.id, '2026-11-20', 7100000);
  assert.deepEqual(store.find('account', btc.id).prices, [{ date: '2026-11-20', price: 7100000 }]);
  assert.equal(C.netWorth(store.getState()).cryptoCents, 106500); // 0,015 × 71.000,00
  // Annulla del toast: rimette i valori di prima
  store.updateAccount(btc.id, { prices: before });
  s = store.getState();
  nw = C.netWorth(s);
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [105000, 213000]);
});

test('v6 E7: la quantità resta la grandezza principale: −0,001 BTC → 0,014 × 70.000,00 = 980,00, totale 2.060,00', () => {
  const { store, btc } = e7();
  store.setAccountPrice(btc.id, '2026-11-20', 7000000);
  store.addMovement({ type: 'variazione', date: '2026-11-21', amount: -100000, accountId: btc.id });
  const nw = C.netWorth(store.getState());
  assert.deepEqual([nw.eurCents, nw.cryptoCents, nw.totalCents], [108000, 98000, 206000]);
  assert.deepEqual(nw.crypto, [{ asset: 'BTC', units: 1400000 }]);
});

test('v6 Vendi crypto non cambia il valore unitario; valore con l\'ultima Compra per data', () => {
  const { store, eur, btc } = e7();
  store.addMovement({ type: 'trasferimento', trade: 'vendi', date: '2026-11-12', amount: 500000, amountTo: 40000, price: 8000000, accountId: btc.id, toAccountId: eur.id });
  const s = store.getState();
  assert.deepEqual(C.cryptoUnitValue(s, store.find('account', btc.id)), { price: 6400000, date: '2026-11-10', source: 'purchase' });
  assert.equal(C.netWorth(s).cryptoCents, 64000); // 0,01 × 64.000,00
});

test('v6 E8: conto ETH senza Compra fuori dal patrimonio, poi Aggiorna valore 3.000,00 → 0,5 × 3.000,00 = 1.500,00', () => {
  const { store } = world();
  const eth = store.addAccount({ name: 'Wallet ETH', kind: 'crypto', asset: 'ETH', initial: 50000000, color: PALETTE[4] });
  let s = store.getState();
  assert.equal(C.cryptoUnitValue(s, store.find('account', eth.id)), null);
  let nw = C.netWorth(s);
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [0, 10000]);
  assert.deepEqual(nw.cryptoUnvalued, [{ asset: 'ETH', units: 50000000 }]);
  store.setAccountPrice(eth.id, '2026-11-20', 300000);
  s = store.getState();
  nw = C.netWorth(s);
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [150000, 160000]);
  assert.deepEqual(nw.cryptoUnvalued, []);
  // conto eliminato: fuori dal patrimonio
  store.deleteAccount(eth.id);
  nw = C.netWorth(store.getState());
  assert.deepEqual([nw.cryptoCents, nw.totalCents, nw.crypto.length], [0, 10000, 0]);
});

test('v6 setAccountPrice: solo conti crypto, valore e data validi; Modifica conserva prices', () => {
  const { store, eur } = world();
  assert.equal(store.find('account', eur.id).prices, null);
  assert.throws(() => store.setAccountPrice(eur.id, '2026-11-20', 100), (e) => e.name === 'ValidationError' && /crypto/.test(e.message));
  const btc = store.addAccount({ name: 'Wallet prova', kind: 'crypto', asset: 'BTC', initial: 100000, color: PALETTE[3] });
  assert.deepEqual(store.find('account', btc.id).prices, []);
  assert.throws(() => store.setAccountPrice(btc.id, '2026-11-20', 0), /Valore non valido/);
  assert.throws(() => store.setAccountPrice(btc.id, '20/11/2026', 100), /Data non valida/);
  store.setAccountPrice(btc.id, '2026-11-20', 7000000);
  store.updateAccount(btc.id, { name: 'Wallet rinominato' });
  assert.deepEqual(store.find('account', btc.id).prices, [{ date: '2026-11-20', price: 7000000 }]);
});

test('v6 cambio di simbolo senza movimenti: i valori del vecchio simbolo si azzerano', () => {
  const { store } = world();
  // saldo iniziale 0,5 BTC, Aggiorna valore 70.000,00 → 35.000,00 € nel patrimonio
  const acc = store.addAccount({ name: 'Wallet cambio', kind: 'crypto', asset: 'BTC', initial: 50000000, color: PALETTE[3] });
  store.setAccountPrice(acc.id, '2026-11-20', 7000000);
  assert.equal(C.netWorth(store.getState()).cryptoCents, 3500000);
  // stesso simbolo (anche scritto in minuscolo): i valori restano
  store.updateAccount(acc.id, { asset: 'btc' });
  assert.deepEqual(store.find('account', acc.id).prices, [{ date: '2026-11-20', price: 7000000 }]);
  // simbolo ETH: il valore BTC non vale più, 0,5 ETH resta fuori dal patrimonio finché non si aggiorna
  store.updateAccount(acc.id, { asset: 'ETH' });
  assert.deepEqual(store.find('account', acc.id).prices, []);
  const nw = C.netWorth(store.getState());
  assert.deepEqual([nw.cryptoCents, nw.totalCents], [0, 10000]);
  assert.deepEqual(nw.cryptoUnvalued, [{ asset: 'ETH', units: 50000000 }]);
  // diventa conto in euro: prices null
  store.updateAccount(acc.id, { kind: 'eur' });
  assert.equal(store.find('account', acc.id).prices, null);
});

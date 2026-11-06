// Test di js/invest.js e dello store per gli ETF (v5): esempi E4 ed E5 del piano calcolati a mano. Dati inventati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, PALETTE, ValidationError, StorageError, INVEST_KEY, DATA_KEY, DIVIDEND_CATEGORY_ID } from '../js/store.js';
import * as C from '../js/calc.js';
import { etfPosition, etfSummary, etfUnitValue, investTaxYear, sellTax, heldAt, etfLabel } from '../js/invest.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

const Q = 1e8; // 1 quota in unità da 1e-8

function world({ regime = 'amministrato', rate } = {}) {
  const storage = memoryStorage();
  const now = clock(1793000000000);
  const store = createStore({ storage, now, uuid: seqUuid() });
  const eur = store.addAccount({ name: 'Conto principale', kind: 'eur', initial: 100000, color: PALETTE[1] });
  const etf = store.addInvestment({ name: 'ETF Mondo prova', code: 'ie00prova001', color: PALETTE[9], taxRegime: regime, ...(rate ? { taxRateBp: rate } : {}) });
  const buy = (date, qty, price, amount) => { now.advance(1000); return store.addMovement({ type: 'trasferimento', trade: 'compra', date, amount, amountTo: qty, price, accountId: eur.id, toAccountId: etf.id, etfId: etf.id }); };
  const sell = (date, qty, price, proceeds, { tax } = {}) => {
    now.advance(1000);
    const t = tax ?? sellTax(store.getState(), etf.id, { qty, proceeds, date }).tax;
    const reg = store.find('investment', etf.id).taxRegime;
    return store.addMovement({ type: 'trasferimento', trade: 'vendi', date, amount: qty, amountTo: reg === 'amministrato' ? proceeds - t : proceeds, tax: t, taxRegime: reg, price, accountId: etf.id, toAccountId: eur.id, etfId: etf.id });
  };
  return { storage, now, store, eur, etf, buy, sell };
}

// E4: Compra 10 × 50,0000 + 1,00 = 501,00; Compra 5 × 56,0000 + 1,00 = 281,00; Vendi 6 × 60,0000 − 1,00 = 359,00.
function e4(opts) {
  const w = world(opts);
  w.buy('2026-11-02', 10 * Q, 500000, 50100);
  w.buy('2026-11-15', 5 * Q, 560000, 28100);
  return w;
}

test('E4: dopo le due Compra 15 quote, costo 782,00 €, prezzo medio 52,1333 €', () => {
  const { store, etf } = e4();
  const p = etfPosition(store.getState(), etf.id);
  assert.deepEqual([p.qty, p.cost, p.avgPrice4], [15 * Q, 78200, 521333]);
  assert.equal(store.find('investment', etf.id).code, 'IE00PROVA001');
});

test('E4: Vendi 6 quote → costo 312,80, plusvalenza 46,20, tassa 12,01, arrivo 346,99; restano 9 quote a 52,1333', () => {
  const { store, etf, eur, sell } = e4();
  const st = sellTax(store.getState(), etf.id, { qty: 6 * Q, proceeds: 35900, date: '2026-11-18' });
  assert.deepEqual([st.held, st.avgPrice4, st.costSold, st.gain, st.tax], [15 * Q, 521333, 31280, 4620, 1201]);
  const m = sell('2026-11-18', 6 * Q, 600000, 35900);
  assert.deepEqual([m.amountTo, m.tax, m.taxRegime], [34699, 1201, 'amministrato']);
  const s = store.getState();
  const p = etfPosition(s, etf.id);
  assert.deepEqual([p.qty, p.cost, p.avgPrice4], [9 * Q, 46920, 521333]);
  assert.deepEqual(p.sales.map((x) => [x.proceeds, x.costSold, x.gain, x.tax]), [[35900, 31280, 4620, 1201]]);
  // conto euro: 1.000,00 − 501,00 − 281,00 + 346,99 = 564,99
  assert.equal(C.accountBalance(s, eur.id), 56499);
  // Compra/Vendi non sono entrate né uscite
  assert.deepEqual(C.totals(s, '2026-11-01', '2026-11-30'), { income: 0, expense: 0, net: 0, rate: 0 });
});

test('E4: valore 504,00 al prezzo d\'acquisto, poi 526,50 dopo Aggiorna valore; guadagno 57,30 € (12,2 %)', () => {
  const { store, etf, sell } = e4();
  sell('2026-11-18', 6 * Q, 600000, 35900);
  let s = store.getState();
  let sum = etfSummary(s, etf.id);
  assert.deepEqual([sum.value, sum.valueInfo.source, sum.valueInfo.date, sum.valueInfo.price4], [50400, 'purchase', '2026-11-15', 560000]);
  store.setInvestmentPrice(etf.id, '2026-11-20', 585000);
  s = store.getState();
  sum = etfSummary(s, etf.id);
  assert.deepEqual([sum.value, sum.valueInfo.source, sum.gain, sum.gainPct, sum.realized], [52650, 'manual', 5730, 122, 4620]);
  // stesso giorno: il valore si sostituisce; prima di quella data vale il prezzo d'acquisto
  store.setInvestmentPrice(etf.id, '2026-11-20', 590000);
  assert.deepEqual(store.find('investment', etf.id).prices, [{ date: '2026-11-20', price: 590000 }]);
  assert.equal(etfUnitValue(store.getState(), store.find('investment', etf.id), '2026-11-19').source, 'purchase');
});

test('E4: patrimonio = conti in euro + 526,50; dividendo 30,00 → conto 594,99; serie e ETF eliminato', () => {
  const { store, etf, eur, sell } = e4();
  sell('2026-11-18', 6 * Q, 600000, 35900);
  store.setInvestmentPrice(etf.id, '2026-11-20', 585000);
  store.ensureDividendCategory();
  store.addMovement({ type: 'entrata', date: '2026-11-21', amount: 3000, accountId: eur.id, categoryId: DIVIDEND_CATEGORY_ID, etfId: etf.id, taxRegime: 'amministrato' });
  let s = store.getState();
  assert.equal(C.accountBalance(s, eur.id), 59499);
  assert.deepEqual([C.netWorth(s).eurCents, C.netWorth(s).investCents, C.netWorth(s).totalCents], [59499, 52650, 112149]);
  assert.equal(C.totals(s, '2026-11-01', '2026-11-30').income, 3000, 'il dividendo è un\'entrata');
  // a fine ottobre (prima del primo acquisto) nessun ETF; a fine novembre 526,50
  assert.deepEqual(C.netWorthSeries(s, ['2026-10', '2026-11']).map((x) => x.totalCents - x.eurCents), [0, 52650]);
  store.deleteInvestment(etf.id);
  s = store.getState();
  assert.equal(C.netWorth(s).investCents, 0);
  assert.equal(etfLabel(s, etf.id), 'ETF Mondo prova (eliminato)');
  assert.equal(C.accountBalance(s, eur.id), 59499, 'i movimenti restano');
  assert.equal(C.searchMovements(s, { etfId: etf.id }).length, 4);
});

test('E4: Vendi 10 quote dopo la vendita → "Puoi vendere al massimo 9 quote"; vendita retrodatata bloccata', () => {
  const { store, etf, eur, sell } = e4();
  sell('2026-11-18', 6 * Q, 600000, 35900);
  const bad = { type: 'trasferimento', trade: 'vendi', amount: 10 * Q, amountTo: 50000, tax: 0, taxRegime: 'amministrato', price: 500000, accountId: etf.id, toAccountId: eur.id, etfId: etf.id };
  assert.throws(() => store.addMovement({ ...bad, date: '2026-11-25' }), (e) => e instanceof ValidationError && e.field === 'amount' && e.message === 'Puoi vendere al massimo 9 quote');
  // retrodatata al 10/11: lì ci sono 10 quote, ma vendendole tutte la vendita del 18/11 di 6 quote resterebbe
  // scoperta (10 − 10 + 5 − 6 = −1): massimo 9
  assert.equal(heldAt(store.getState(), etf.id, '2026-11-10'), 10 * Q);
  assert.throws(() => store.addMovement({ ...bad, date: '2026-11-10' }), (e) => e.message === 'Puoi vendere al massimo 9 quote');
  assert.ok(store.addMovement({ ...bad, amount: 9 * Q, date: '2026-11-10' }));
  assert.equal(heldAt(store.getState(), etf.id, '2026-11-30'), 0);
  assert.throws(() => store.addMovement({ ...bad, amount: Q, date: '2026-11-30' }), (e) => e.message === 'Puoi vendere al massimo 0 quote');
});

test('E4: vendita spostata prima della seconda Compra → plusvalenza 58,40 € e tassa 15,18 €', () => {
  const { store, etf, sell } = e4();
  const m = sell('2026-11-18', 6 * Q, 600000, 35900);
  const st = sellTax(store.getState(), etf.id, { qty: 6 * Q, proceeds: 35900, date: '2026-11-10', exceptId: m.id });
  assert.deepEqual([st.held, st.avgPrice4, st.costSold, st.gain, st.tax], [10 * Q, 501000, 30060, 5840, 1518]);
  // in modifica senza cambiare la data la stima resta 12,01
  assert.equal(sellTax(store.getState(), etf.id, { qty: 6 * Q, proceeds: 35900, date: '2026-11-18', exceptId: m.id }).tax, 1201);
  // salvare senza modifiche lascia il movimento identico
  const same = store.updateMovement(m.id, { ...m });
  assert.deepEqual([same.amount, same.price, same.amountTo, same.tax], [m.amount, m.price, m.amountTo, m.tax]);
});

test('E5: Dichiarativo → arriva 359,00 e tassa da pagare 12,01; dividendo dichiarativo 30,00 → 7,80', () => {
  const { store, etf, eur, sell } = e4({ regime: 'dichiarativo' });
  const m = sell('2026-11-18', 6 * Q, 600000, 35900);
  assert.deepEqual([m.amountTo, m.tax, m.taxRegime], [35900, 1201, 'dichiarativo']);
  store.ensureDividendCategory();
  store.addMovement({ type: 'entrata', date: '2026-11-21', amount: 3000, accountId: eur.id, categoryId: DIVIDEND_CATEGORY_ID, etfId: etf.id, tax: 780, taxRegime: 'dichiarativo' });
  const s = store.getState();
  assert.equal(C.accountBalance(s, eur.id), 100000 - 50100 - 28100 + 35900 + 3000);
  assert.deepEqual(investTaxYear(s, 2026, '2026-11-21'), { gains: 4620, losses: 0, withheld: 0, due: 1201 + 780, carry: [] });
});

test('E5: aliquota ridotta 18,75 % → tassa 8,66 €; Amministrato → trattenute 12,01 nel riepilogo', () => {
  const r = e4({ rate: 1875 });
  assert.equal(sellTax(r.store.getState(), r.etf.id, { qty: 6 * Q, proceeds: 35900, date: '2026-11-18' }).tax, 866);
  const a = e4();
  a.sell('2026-11-18', 6 * Q, 600000, 35900);
  assert.deepEqual(investTaxYear(a.store.getState(), 2026, '2026-11-21'), { gains: 4620, losses: 0, withheld: 1201, due: 0, carry: [] });
  assert.deepEqual(investTaxYear(a.store.getState(), 2025, '2026-11-21'), { gains: 0, losses: 0, withheld: 0, due: 0, carry: [] });
});

test('E5: vendita in perdita 6 × 48,0000 − 1,00 = 287,00 → minusvalenza 25,80 €, tassa 0, zainetto fino al 31/12/2030', () => {
  const { store, etf, sell } = e4();
  const st = sellTax(store.getState(), etf.id, { qty: 6 * Q, proceeds: 28700, date: '2026-11-18' });
  assert.deepEqual([st.gain, st.tax, st.expires], [-2580, 0, '2030-12-31']);
  const m = sell('2026-11-18', 6 * Q, 480000, 28700);
  assert.equal(m.amountTo, 28700);
  const y = investTaxYear(store.getState(), 2026, '2026-11-21');
  assert.deepEqual([y.gains, y.losses, y.withheld, y.due], [0, 2580, 0, 0]);
  assert.deepEqual(y.carry.map((c) => [c.movement.id, c.amount, c.expires]), [[m.id, 2580, '2030-12-31']]);
  // scaduto dopo il 31/12/2030
  assert.deepEqual(investTaxYear(store.getState(), 2031, '2031-01-01').carry, []);
});

test('ETF: nome unico, codice, aliquota, regime, prezzi per data; validazione dei movimenti', () => {
  const { store, etf, eur } = world();
  assert.deepEqual([etf.taxRateBp, etf.taxRegime, etf.prices], [2600, 'amministrato', []]);
  assert.throws(() => store.addInvestment({ name: 'etf mondo PROVA', color: PALETTE[0] }), (e) => e.field === 'name' && /Esiste già un ETF/.test(e.message));
  assert.throws(() => store.addInvestment({ name: 'Altro', code: 'con spazi', color: PALETTE[0] }), (e) => e.field === 'code');
  assert.throws(() => store.addInvestment({ name: 'Altro', taxRateBp: 10001, color: PALETTE[0] }), (e) => e.field === 'taxRateBp');
  const up = store.updateInvestment(etf.id, { taxRegime: 'dichiarativo', taxRateBp: 1875, code: '' });
  assert.deepEqual([up.taxRegime, up.taxRateBp, up.code], ['dichiarativo', 1875, null]);
  // Compra verso un ETF inesistente o da un conto non in euro rifiutata
  assert.throws(() => store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-02', amount: 100, amountTo: Q, price: 100, accountId: eur.id, toAccountId: 'manca', etfId: 'manca' }), (e) => e.field === 'etfId');
  assert.throws(() => store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-02', amount: 100, amountTo: Q, price: 100, accountId: eur.id, toAccountId: eur.id, etfId: etf.id }), (e) => e.field === 'toAccountId');
  // ETF eliminato: niente movimenti nuovi, quelli vecchi restano modificabili
  const m = store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-02', amount: 100, amountTo: Q, price: 100, accountId: eur.id, toAccountId: etf.id, etfId: etf.id });
  store.deleteInvestment(etf.id);
  assert.throws(() => store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2026-11-03', amount: 100, amountTo: Q, price: 100, accountId: eur.id, toAccountId: etf.id, etfId: etf.id }), (e) => e.field === 'etfId');
  assert.equal(store.updateMovement(m.id, { amount: 200 }).amount, 200);
  assert.equal(C.accountLabel(store.getState(), etf.id), 'ETF Mondo prova (eliminato)');
  assert.equal(C.tradeLabel(store.getState(), m), 'Compra ETF Mondo prova');
  store.restoreInvestment(etf.id);
  assert.equal(store.find('investment', etf.id).deleted, false);
});

test('ETF nella chiave nuova: scritture separate, quota piena → stato invariato e StorageError', () => {
  const { store, storage, etf } = world();
  const saved = JSON.parse(storage.getItem(INVEST_KEY));
  assert.deepEqual([saved.app, saved.schemaVersion, saved.investments.map((x) => x.id)], ['MoneyFlow', 1, [etf.id]]);
  assert.equal(JSON.parse(storage.getItem(DATA_KEY)).investments, undefined, 'moneyflow:data resta senza ETF');
  // un aggiornamento del solo ETF non riscrive moneyflow:data
  const dataBefore = storage.getItem(DATA_KEY);
  store.updateInvestment(etf.id, { name: 'ETF Mondo prova 2' });
  assert.equal(storage.getItem(DATA_KEY), dataBefore);
  const before = store.getState();
  storage.failOn = (k) => k === INVEST_KEY;
  assert.throws(() => store.updateInvestment(etf.id, { name: 'Nuovo' }), StorageError);
  assert.equal(store.getState(), before);
  // modifica che tocca le due chiavi (sostituzione completa): la prima scrittura viene annullata
  assert.throws(() => store.replaceAll({ ...before, accounts: [], app: 'MoneyFlow' }), StorageError);
  assert.equal(storage.getItem(DATA_KEY), dataBefore);
  assert.equal(store.getState(), before);
  storage.failOn = null;
  // ricaricando si ritrovano gli ETF
  const again = createStore({ storage, now: clock(), uuid: seqUuid('b') });
  assert.equal(again.find('investment', etf.id).name, 'ETF Mondo prova 2');
});

test('ETF: chiave illeggibile copiata a parte; ETF in un moneyflow:data vecchio recuperati', () => {
  const raw = JSON.stringify({ app: 'MoneyFlow', schemaVersion: 1, accounts: [], categories: [], movements: [], scheduled: [], goals: [] });
  const storage = memoryStorage({ [DATA_KEY]: raw, [INVEST_KEY]: '{rotto' });
  const store = createStore({ storage, now: clock(7), uuid: seqUuid() });
  assert.equal(store.corrupted, `${INVEST_KEY}:corrupt-7`);
  assert.equal(storage.getItem(`${INVEST_KEY}:corrupt-7`), '{rotto');
  assert.deepEqual(store.getState().investments, []);
  // backup v5 importato da una v4: gli ETF finiscono dentro moneyflow:data e la chiave nuova manca
  const etf = { id: 'e1', createdAt: 1, updatedAt: 1, deleted: false, name: 'ETF vecchio', code: null, color: '#4F46E5', order: 0, taxRateBp: 2600, taxRegime: 'amministrato', prices: [] };
  const s2 = memoryStorage({ [DATA_KEY]: JSON.stringify({ ...JSON.parse(raw), investments: [etf] }) });
  const st2 = createStore({ storage: s2, now: clock(), uuid: seqUuid() });
  assert.deepEqual(st2.getState().investments, [etf]);
  st2.addAccount({ name: 'Conto', kind: 'eur', color: PALETTE[0] });
  assert.deepEqual(JSON.parse(s2.getItem(INVEST_KEY)).investments, [etf], 'scritti nella chiave nuova al primo salvataggio');
  assert.equal(JSON.parse(s2.getItem(DATA_KEY)).investments, undefined);
});

test('categoria Dividendi: creata se manca (dati v4), nome alternativo, glifo e colore', () => {
  const raw = JSON.stringify({ app: 'MoneyFlow', schemaVersion: 1, accounts: [], categories: [{ id: 'c1', createdAt: 1, updatedAt: 1, deleted: false, name: 'Dividendi', type: 'entrata', color: '#0F9D58', budget: null, role: null, order: 0 }], movements: [], scheduled: [], goals: [] });
  const storage = memoryStorage({ [DATA_KEY]: raw });
  const store = createStore({ storage, now: clock(), uuid: seqUuid() });
  let events = 0;
  store.subscribe(() => events++);
  store.ensureDividendCategory();
  const c = store.find('category', DIVIDEND_CATEGORY_ID);
  assert.deepEqual([c.name, c.role, c.color, C.categoryIconOf(c)], ['Dividendi ETF', 'dividendi', '#4F46E5', 'coin']);
  store.ensureDividendCategory();
  assert.equal(events, 1, 'nessun salvataggio se c\'è già');
});

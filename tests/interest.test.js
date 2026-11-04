// Test di js/interest.js: interessi giornalieri del deposito su esempi calcolati a mano, movimenti mensili, rettifiche.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accrueInterest, reconcileInterest, interestId, alignId } from '../js/interest.js';
import { createStore, PALETTE, DATA_KEY, INTEREST_CATEGORY_ID } from '../js/store.js';
import * as C from '../js/calc.js';
import { addDays } from '../js/dates.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

const dep = (start, rates, withholdingBp = 2600) => ({ start, withholdingBp, rates: rates.map(([from, rateBp]) => ({ from, rateBp })) });
const acct = (initial, deposit) => ({ id: 'd', kind: 'eur', initial, deposit, deleted: false });
const st = (movements = []) => ({ movements });

// Accrediti giorno per giorno: con `today` = giorno dopo l'ultimo, la somma del mese.
function daily(state, account, start, n) {
  const out = [];
  let prev = 0;
  for (let i = 1; i <= n; i++) {
    const r = accrueInterest(state, account, addDays(start, i));
    const tot = Object.values(r.byMonth).reduce((s, x) => s + x.amount, 0);
    out.push(tot - prev);
    prev = tot;
  }
  return out;
}

test('10.000,00 € al 2,50 % con ritenuta 26 %: 0,50 / 0,51 / 0,51 → 1,52 € in 3 giorni', () => {
  // giorno 1: 1.000.000 × 250 × 7.400 / (365 × 10^8) = 50,6849 cent → 50, resto 0,6849
  // giorno 2: saldo 10.000,50 → 50,6874 + 0,6849 = 51,37 → 51; giorno 3: saldo 10.001,01 → 50,6900 + 0,3723 → 51
  const a = acct(1000000, dep('2026-03-01', [['2026-03-01', 250]]));
  assert.deepEqual(daily(st(), a, '2026-03-01', 3), [50, 51, 51]);
  const r = accrueInterest(st(), a, '2026-03-04');
  assert.deepEqual(r.byMonth, { '2026-03': { amount: 152, lastDay: '2026-03-03' } });
  // oggi non matura: con today = data di inizio nessun giorno
  assert.deepEqual(accrueInterest(st(), a, '2026-03-01').byMonth, {});
});

test('100,00 € alle stesse condizioni: 0,00 / 0,01 / 0,00 / 0,01 / 0,00 (accumulo sotto il centesimo)', () => {
  // 0,5068 al giorno: 0,5068 → 0; 1,0137 → 1 (resto 0,0137); su 100,01: 0,5207 → 0; 1,0276 → 1; su 100,02: 0,5346 → 0
  const a = acct(10000, dep('2026-03-01', [['2026-03-01', 250]]));
  assert.deepEqual(daily(st(), a, '2026-03-01', 5), [0, 1, 0, 1, 0]);
});

test('cambio di tasso dal giorno 3', () => {
  // giorni 1–2 come sopra (50, 51); giorno 3 al 2,00 % su 10.001,01: 1.000.101 × 200 × 7.400 / D = 40,5520 + 0,3723 → 40
  const a = acct(1000000, dep('2026-03-01', [['2026-03-01', 250], ['2026-03-03', 200]]));
  assert.deepEqual(daily(st(), a, '2026-03-01', 3), [50, 51, 40]);
});

test('giorni a cavallo di due mesi: due voci in byMonth, il resto passa al mese dopo', () => {
  const a = acct(1000000, dep('2026-03-30', [['2026-03-30', 250]]));
  const r = accrueInterest(st(), a, '2026-04-02');
  // 30/03: 50, 31/03: 51 → marzo 101 (ultimo giorno 31/03); 01/04: 51 → aprile 51
  assert.deepEqual(r.byMonth, { '2026-03': { amount: 101, lastDay: '2026-03-31' }, '2026-04': { amount: 51, lastDay: '2026-04-01' } });
});

test('saldo negativo o zero: il giorno non matura', () => {
  const a = acct(-5000, dep('2026-03-01', [['2026-03-01', 250]]));
  assert.deepEqual(accrueInterest(st(), a, '2026-03-10').byMonth, {});
  const z = acct(0, dep('2026-03-01', [['2026-03-01', 250]]));
  // versamento di 10.000,00 il 03/03: maturano solo dal 03/03
  const s = st([{ id: 'v', type: 'trasferimento', date: '2026-03-03', amount: 1000000, accountId: 'x', toAccountId: 'd', deleted: false }]);
  assert.deepEqual(accrueInterest(s, z, '2026-03-04').byMonth, { '2026-03': { amount: 50, lastDay: '2026-03-03' } });
});

test('un movimento con data passata cambia i giorni successivi', () => {
  const a = acct(1000000, dep('2026-03-01', [['2026-03-01', 250]]));
  // uscita di 5.000,00 il 02/03: giorno 1 su 10.000 (50, resto 0,6849); giorno 2 su 5.000,50: 25,3437 + 0,6849 = 26,03 → 26;
  // giorno 3 su 5.000,76: 25,3450 + 0,0286 = 25,37 → 25. Totale 1,01 €
  const s = st([{ id: 'u', type: 'uscita', date: '2026-03-02', amount: 500000, excluded: 0, accountId: 'd', deleted: false }]);
  assert.deepEqual(accrueInterest(s, a, '2026-03-04').byMonth['2026-03'].amount, 101);
  // eliminato: non conta
  assert.deepEqual(accrueInterest(st([{ ...s.movements[0], deleted: true }]), a, '2026-03-04').byMonth['2026-03'].amount, 152);
});

// ---------- con lo store ----------

function world(today = '2026-03-04') {
  const now = clock();
  const store = createStore({ storage: memoryStorage(), now, uuid: seqUuid() });
  const eur = store.addAccount({ name: 'Deposito', kind: 'eur', initial: 1000000, color: PALETTE[0], deposit: dep('2026-03-01', [['2026-03-01', 250]]) });
  return { store, now, eur, today };
}

test('deposito avviato 3 giorni fa → un movimento Interessi di 1,52 €; seconda chiamata senza commit', () => {
  const { store, eur } = world();
  let events = 0;
  store.subscribe(() => events++);
  assert.ok(reconcileInterest(store, '2026-03-04') > 0);
  const m = store.find('movement', interestId(eur.id, '2026-03'));
  assert.equal(m.amount, 152);
  assert.equal(m.date, '2026-03-03');
  assert.equal(m.type, 'entrata');
  assert.equal(m.categoryId, INTEREST_CATEGORY_ID);
  assert.equal(m.description, 'Interessi Marzo 2026');
  assert.deepEqual(m.interest, { accountId: eur.id, month: '2026-03' });
  assert.equal(C.accountBalance(store.getState(), eur.id), 1000152);
  assert.equal(C.totals(store.getState(), '2026-03-01', '2026-03-31').income, 152, 'gli interessi contano come entrata');
  assert.equal(events, 1);
  assert.equal(reconcileInterest(store, '2026-03-04'), 0);
  assert.equal(events, 1, 'nessun commit se nulla cambia');
  // il giorno dopo lo stesso movimento si aggiorna (nessun doppione)
  reconcileInterest(store, '2026-03-05');
  const all = store.getState().movements.filter((x) => x.interest);
  assert.equal(all.length, 1);
  // giorno 4 su 10.001,52: 50,6926 + resto 0,0623 = 50,75 → 50
  assert.equal(all[0].amount, 152 + 50);
});

test('passaggio di mese → due movimenti; mese che torna a 0 → eliminato', () => {
  const { store, eur } = world();
  reconcileInterest(store, '2026-04-03');
  const mar = store.find('movement', interestId(eur.id, '2026-03'));
  const apr = store.find('movement', interestId(eur.id, '2026-04'));
  assert.equal(mar.date, '2026-03-31');
  assert.equal(apr.date, '2026-04-02');
  assert.ok(mar.amount > 0 && apr.amount > 0);
  // la data di inizio si sposta a maggio: i movimenti di marzo e aprile vanno in tombstone
  store.updateAccount(eur.id, { deposit: dep('2026-05-01', [['2026-05-01', 250]]) });
  reconcileInterest(store, '2026-04-03');
  assert.equal(store.find('movement', mar.id).deleted, true);
  assert.equal(store.find('movement', apr.id).deleted, true);
  assert.equal(reconcileInterest(store, '2026-04-03'), 0);
});

test('allinea al saldo reale: +5,00 € → saldo uguale a quello scritto, non conta come entrata', () => {
  const { store, eur } = world();
  reconcileInterest(store, '2026-03-04');
  // saldo calcolato al 04/03: 10.001,52 (interessi fino al 03/03); in Revolut l'utente vede 10.006,52
  const id = alignId(eur.id, '2026-03-04');
  store.upsertDerived([{ id, input: { type: 'variazione', date: '2026-03-04', amount: 0, accountId: eur.id, align: { balance: 1000652 }, description: 'Allineamento al saldo reale' } }]);
  reconcileInterest(store, '2026-03-05');
  const al = store.find('movement', id);
  assert.equal(al.amount, 500);
  assert.equal(al.deleted, false);
  const s = store.getState();
  // al 05/03: il giorno 04/03 matura su 10.006,52 → saldo = 10.006,52 + accredito del 04/03
  const r = accrueInterest(s, store.find('account', eur.id), '2026-03-05');
  assert.equal(C.accountBalance(s, eur.id), 1000652 + (r.byMonth['2026-03'].amount - 152));
  assert.equal(C.totals(s, '2026-03-01', '2026-03-31').income, r.byMonth['2026-03'].amount, 'la rettifica non è un\'entrata');
  // una spesa del 02/03 aggiunta dopo: la rettifica si ricalcola e il saldo al 04/03 resta quello scritto
  store.addMovement({ type: 'uscita', date: '2026-03-02', amount: 10000, accountId: eur.id, categoryId: 'default-uscita-spesa' });
  reconcileInterest(store, '2026-03-05');
  const s2 = store.getState();
  const al2 = store.find('movement', id);
  assert.ok(al2.amount > 500 && al2.amount < 10600, 'la rettifica compensa la spesa');
  const interestTo3 = accrueInterest(s2, store.find('account', eur.id), '2026-03-04').byMonth['2026-03'].amount;
  assert.equal(C.accountBalance(s2, eur.id, '2026-03-04') - (store.find('movement', interestId(eur.id, '2026-03')).amount - interestTo3), 1000652);
  // saldo scritto uguale a quello calcolato → importo 0 → tombstone
  store.upsertDerived([{ id, input: { ...store.find('movement', id), align: { balance: 1000652 - al2.amount } } }]);
  reconcileInterest(store, '2026-03-05');
  assert.equal(store.find('movement', id).deleted, true);
});

test('conto senza deposito e fixture v1/v2/v3 → nessuna modifica', () => {
  const plain = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid('p') });
  plain.addAccount({ name: 'Normale', kind: 'eur', initial: 100000, color: PALETTE[1] });
  assert.equal(reconcileInterest(plain, '2026-03-04'), 0);
  for (const v of ['v1', 'v2', 'v3']) {
    const raw = readFileSync(new URL(`./fixtures/data-${v}.json`, import.meta.url), 'utf8');
    const storage = memoryStorage({ [DATA_KEY]: raw });
    const s = createStore({ storage, now: clock(), uuid: seqUuid() });
    assert.equal(reconcileInterest(s, '2026-03-04'), 0, v);
    assert.equal(storage.getItem(DATA_KEY), raw, v);
  }
});

// Test di js/store.js: CRUD, validazione, tombstone, errori di storage, dati corrotti, fixture v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, ValidationError, StorageError, DATA_KEY, PALETTE, SCHEMA_VERSION } from '../js/store.js';
import { tradeEuroCents } from '../js/money.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

function setup(initial) {
  const storage = memoryStorage(initial);
  const now = clock();
  const store = createStore({ storage, now, uuid: seqUuid() });
  return { storage, now, store };
}

function base() {
  const ctx = setup();
  const { store } = ctx;
  const cat = (type, name) => store.getState().categories.find((c) => c.type === type && c.name === name);
  const eur = store.addAccount({ name: 'Revolut', kind: 'eur', initial: 10000, color: PALETTE[1] });
  const cash = store.addAccount({ name: 'Contanti', kind: 'eur', initial: 0, color: PALETTE[2] });
  const btc = store.addAccount({ name: 'Coinbase', kind: 'crypto', asset: 'btc', initial: 0, color: PALETTE[3] });
  return { ...ctx, cat, eur, cash, btc };
}

const expectValidation = (fn, field) => {
  assert.throws(fn, (e) => e instanceof ValidationError && (!field || e.field === field) && typeof e.message === 'string');
};

test('categorie iniziali di D17, due "Altro" ammessi', () => {
  const { store } = setup();
  const cats = store.getState().categories;
  assert.deepEqual(cats.filter((c) => c.type === 'uscita').map((c) => c.name), ['Casa', 'Spesa', 'Trasporti', 'Bollette', 'Abbonamenti', 'Salute', 'Svago', 'Ristoranti', 'Regali', 'Altro']);
  assert.deepEqual(cats.filter((c) => c.type === 'entrata').map((c) => c.name), ['Stipendio', 'Rimborsi', 'Altro']);
  assert.equal(cats.find((c) => c.name === 'Stipendio').role, 'stipendio');
  assert.equal(store.getState().accounts.length, 0);
});

test('conti: CRUD, nomi unici senza maiuscole, simbolo crypto', () => {
  const { store, eur, btc } = base();
  assert.equal(btc.asset, 'BTC');
  expectValidation(() => store.addAccount({ name: 'revolut', kind: 'eur', color: PALETTE[0] }), 'name');
  expectValidation(() => store.addAccount({ name: '', kind: 'eur', color: PALETTE[0] }), 'name');
  expectValidation(() => store.addAccount({ name: 'x'.repeat(61), kind: 'eur', color: PALETTE[0] }), 'name');
  expectValidation(() => store.addAccount({ name: 'W', kind: 'crypto', asset: '', color: PALETTE[0] }), 'asset');
  const up = store.updateAccount(eur.id, { name: 'Revolut Pro' });
  assert.equal(up.name, 'Revolut Pro');
  assert.ok(up.updatedAt > eur.updatedAt);
  store.deleteAccount(eur.id);
  assert.equal(store.find('account', eur.id).deleted, true);
  // eliminato: il nome torna libero; ripristino in conflitto rifiutato
  store.addAccount({ name: 'Revolut Pro', kind: 'eur', color: PALETTE[0] });
  expectValidation(() => store.restoreAccount(eur.id), 'name');
});

test('movimenti: uscita su crypto rifiutata, trasferimento EUR→BTC richiede amountTo', () => {
  const { store, cat, eur, btc, cash } = base();
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 100, accountId: btc.id, categoryId: cat('uscita', 'Spesa').id }), 'accountId');
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 100, accountId: eur.id, categoryId: cat('entrata', 'Stipendio').id }), 'categoryId');
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-02-30', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id }), 'date');
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 0, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id }), 'amount');
  expectValidation(() => store.addMovement({ type: 'trasferimento', date: '2025-01-02', amount: 100, accountId: eur.id, toAccountId: btc.id }), 'amountTo');
  expectValidation(() => store.addMovement({ type: 'trasferimento', date: '2025-01-02', amount: 100, accountId: eur.id, toAccountId: eur.id }), 'toAccountId');
  const t = store.addMovement({ type: 'trasferimento', date: '2025-01-02', amount: 10000, accountId: eur.id, toAccountId: btc.id, amountTo: 120000 });
  assert.equal(t.amountTo, 120000);
  const t2 = store.addMovement({ type: 'trasferimento', date: '2025-01-02', amount: 500, accountId: eur.id, toAccountId: cash.id, amountTo: 999 });
  assert.equal(t2.amountTo, null, 'stessa unità: amountTo ignorato');
  expectValidation(() => store.addMovement({ type: 'variazione', date: '2025-01-02', amount: 5, accountId: eur.id }), 'accountId');
  const v = store.addMovement({ type: 'variazione', date: '2025-01-02', amount: -5, accountId: btc.id });
  assert.equal(v.amount, -5);
  // duplicati ammessi senza avviso (D5)
  const m = { type: 'uscita', date: '2025-01-02', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id };
  store.addMovement(m); store.addMovement(m);
  assert.equal(store.getState().movements.filter((x) => x.amount === 100).length, 2);
});

test('quota esclusa e restituzioni: limiti', () => {
  const { store, cat, eur } = base();
  const spesa = cat('uscita', 'Ristoranti').id;
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 4000, excluded: 4001, accountId: eur.id, categoryId: spesa }), 'excluded');
  const e = store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 4000, excluded: 2000, accountId: eur.id, categoryId: spesa });
  const r1 = store.addMovement({ type: 'restituzione', date: '2025-01-05', amount: 1500, accountId: eur.id, refundOf: e.id });
  expectValidation(() => store.addMovement({ type: 'restituzione', date: '2025-01-06', amount: 501, accountId: eur.id, refundOf: e.id }), 'amount');
  expectValidation(() => store.updateMovement(e.id, { excluded: 1000 }), 'excluded');
  store.updateMovement(r1.id, { amount: 2000 }); // modifica di sé stessa: residuo calcolato senza di lei
  expectValidation(() => store.addMovement({ type: 'restituzione', date: '2025-01-06', amount: 1, accountId: eur.id, refundOf: e.id }), 'amount');
  expectValidation(() => store.addMovement({ type: 'restituzione', date: '2025-01-06', amount: 1, accountId: eur.id, refundOf: 'nessuna' }), 'refundOf');
  // spesa eliminata: la restituzione resta e si può ancora modificare
  store.deleteMovement(e.id);
  assert.equal(store.updateMovement(r1.id, { note: 'grazie' }).note, 'grazie');
});

test('conto eliminato: i movimenti esistenti restano modificabili, i nuovi no', () => {
  const { store, cat, eur } = base();
  const m = store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id });
  store.deleteAccount(eur.id);
  assert.equal(store.updateMovement(m.id, { description: 'ok' }).description, 'ok');
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id }), 'accountId');
});

test('cambio di tipo conto con movimenti rifiutato', () => {
  const { store, cat, eur } = base();
  store.addMovement({ type: 'uscita', date: '2025-01-02', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id });
  expectValidation(() => store.updateAccount(eur.id, { kind: 'crypto', asset: 'ETH' }), 'kind');
});

test('programmati: conferma in una scrittura, salta, annulla', () => {
  const { store, cat, eur } = base();
  const s = store.addScheduled({ type: 'uscita', amount: 1299, accountId: eur.id, categoryId: cat('uscita', 'Abbonamenti').id, description: 'Musica', start: '2025-01-10', freq: 'monthly' });
  expectValidation(() => store.addScheduled({ ...s, id: undefined, freq: 'months', interval: 1 }), 'interval');
  expectValidation(() => store.addScheduled({ ...s, id: undefined, end: '2024-12-01' }), 'end');
  let writes = 0;
  const unsub = store.subscribe(() => writes++);
  const mov = store.confirmOccurrence(s.id, '2025-01-10', { amount: 1399, date: '2025-01-11' });
  assert.equal(writes, 1);
  assert.equal(mov.amount, 1399);
  assert.equal(mov.date, '2025-01-11');
  assert.equal(mov.scheduledId, s.id);
  assert.equal(mov.occurrence, '2025-01-10');
  assert.equal(store.find('scheduled', s.id).handled['2025-01-10'], 'confermato');
  store.skipOccurrence(s.id, '2025-02-10');
  assert.equal(store.find('scheduled', s.id).handled['2025-02-10'], 'saltato');
  store.unhandleOccurrence(s.id, '2025-02-10');
  assert.equal(store.find('scheduled', s.id).handled['2025-02-10'], undefined);
  unsub();
});

test('obiettivi: CRUD e Aggiungi/Togli', () => {
  const { store } = base();
  const g = store.addGoal({ name: 'Vacanza', target: 100000, saved: 0, deadline: '2025-12-31', color: PALETTE[4] });
  store.adjustGoal(g.id, 25000);
  assert.equal(store.find('goal', g.id).saved, 25000);
  expectValidation(() => store.adjustGoal(g.id, -30000), 'amount');
  expectValidation(() => store.addGoal({ name: 'vacanza', target: 1, color: PALETTE[0] }), 'name');
  store.deleteGoal(g.id);
  store.restoreGoal(g.id);
  assert.equal(store.find('goal', g.id).deleted, false);
});

test('categorie: budget solo su uscite, nome unico per tipo', () => {
  const { store, cat } = base();
  const spesa = cat('uscita', 'Spesa');
  assert.equal(store.updateCategory(spesa.id, { budget: 30000 }).budget, 30000);
  expectValidation(() => store.updateCategory(cat('entrata', 'Rimborsi').id, { budget: 100 }), 'budget');
  expectValidation(() => store.addCategory({ name: 'spesa', type: 'uscita', color: PALETTE[0] }), 'name');
  assert.ok(store.addCategory({ name: 'Spesa', type: 'entrata', color: PALETTE[0] }));
});

test('storage pieno → StorageError e stato invariato', () => {
  const { store, storage, eur } = base();
  const before = store.getState();
  let notified = 0;
  store.subscribe(() => notified++);
  storage.failOn = (k) => k === DATA_KEY;
  assert.throws(() => store.updateAccount(eur.id, { name: 'Nuovo' }), StorageError);
  assert.equal(store.getState(), before);
  assert.equal(store.find('account', eur.id).name, 'Revolut');
  assert.equal(notified, 0);
});

test('dati corrotti: copia grezza salvata a parte e ripartenza', () => {
  const storage = memoryStorage({ [DATA_KEY]: '{rotto' });
  const store = createStore({ storage, now: clock(42), uuid: seqUuid() });
  assert.equal(store.corrupted, `${DATA_KEY}:corrupt-42`);
  assert.equal(storage.getItem(`${DATA_KEY}:corrupt-42`), '{rotto');
  assert.equal(store.getState().categories.length, 13);
});

test('fixture data-v1.json caricata identica', () => {
  const raw = readFileSync(new URL('./fixtures/data-v1.json', import.meta.url), 'utf8');
  const storage = memoryStorage({ [DATA_KEY]: raw });
  const store = createStore({ storage, now: clock(), uuid: seqUuid() });
  assert.equal(store.corrupted, null);
  assert.deepEqual(store.getState(), JSON.parse(raw));
});

test('applyRemote: vince updatedAt più recente e notifica come remote', () => {
  const { store, eur } = base();
  const events = [];
  store.subscribe((e) => events.push(e));
  const older = { ...eur, name: 'Vecchio', updatedAt: eur.updatedAt - 1 };
  assert.equal(store.applyRemote([{ kind: 'account', record: older }]), 0);
  const newer = { ...eur, name: 'Remoto', updatedAt: eur.updatedAt + 1000 };
  assert.equal(store.applyRemote([{ kind: 'account', record: newer }, { kind: 'boh', record: {} }]), 1);
  assert.equal(store.find('account', eur.id).name, 'Remoto');
  assert.equal(events.at(-1).source, 'remote');
  assert.deepEqual(events.at(-1).keys, [`account_${eur.id}`]);
});

test('cambio di tipo in modifica: uscita, entrata e trasferimento sì; bloccato con restituzioni', () => {
  const { store, cat, eur, cash, btc } = base();
  const sp = store.addMovement({ type: 'uscita', date: '2025-03-01', amount: 4000, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id, excluded: 1000 });
  const asIn = store.updateMovement(sp.id, { type: 'entrata', categoryId: cat('entrata', 'Rimborsi').id });
  assert.equal(asIn.type, 'entrata');
  assert.equal(asIn.excluded, 0);
  expectValidation(() => store.updateMovement(sp.id, { type: 'uscita' }), 'categoryId');
  const tr = store.updateMovement(sp.id, { type: 'trasferimento', toAccountId: cash.id });
  assert.equal(tr.type, 'trasferimento');
  assert.equal(tr.categoryId, null);
  const back = store.updateMovement(sp.id, { type: 'uscita', categoryId: cat('uscita', 'Spesa').id, excluded: 1000 });
  store.addMovement({ type: 'restituzione', date: '2025-03-02', amount: 500, accountId: eur.id, refundOf: back.id });
  expectValidation(() => store.updateMovement(sp.id, { type: 'entrata', categoryId: cat('entrata', 'Rimborsi').id }), 'type');
  const rf = store.getState().movements.find((m) => m.type === 'restituzione');
  assert.equal(store.updateMovement(rf.id, { type: 'uscita' }).type, 'restituzione');
  const v = store.addMovement({ type: 'variazione', date: '2025-03-01', amount: 100, accountId: btc.id });
  assert.equal(store.updateMovement(v.id, { type: 'entrata' }).type, 'variazione');
});

test('conferma di tutte le scadenze: un movimento ciascuna, collegate al programmato, tutto o niente', () => {
  const { store, cat, eur } = base();
  const s = store.addScheduled({ type: 'uscita', amount: 999, accountId: eur.id, categoryId: cat('uscita', 'Abbonamenti').id, start: '2025-01-05', freq: 'monthly' });
  const movs = store.confirmAll(s.id, ['2025-01-05', '2025-02-05']);
  assert.deepEqual(movs.map((m) => [m.date, m.amount, m.scheduledId, m.occurrence]), [['2025-01-05', 999, s.id, '2025-01-05'], ['2025-02-05', 999, s.id, '2025-02-05']]);
  assert.deepEqual(store.find('scheduled', s.id).handled, { '2025-01-05': 'confermato', '2025-02-05': 'confermato' });
  const conv = store.updateMovement(movs[0].id, { type: 'entrata', categoryId: cat('entrata', 'Altro').id });
  assert.equal(conv.scheduledId, s.id, 'il cambio di tipo mantiene il collegamento al programmato');
  const n = store.getState().movements.length;
  store.deleteAccount(eur.id);
  expectValidation(() => store.confirmAll(s.id, ['2025-03-05', '2025-04-05']));
  assert.equal(store.getState().movements.length, n);
});

test('v2: SCHEMA_VERSION resta 1 (solo campi facoltativi)', () => {
  assert.equal(SCHEMA_VERSION, 1);
});

test('v2 Compra/Vendi: trasferimento euro↔crypto con prezzo unitario', () => {
  const { store, eur, btc, cash } = base();
  // 0,01 BTC a 60.000,00 €: calcolato 600,00 €, corretto a 600,50 € per la commissione
  const qty = 1000000;
  const price = 6000000;
  assert.equal(tradeEuroCents(qty, price), 60000);
  const m = store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2025-03-01', amount: 60050, accountId: eur.id, toAccountId: btc.id, amountTo: qty, price });
  assert.equal(m.trade, 'compra');
  assert.equal(m.price, 6000000);
  assert.equal(m.amount, 60050);
  assert.equal(m.amountTo, 1000000);
  const v = store.addMovement({ type: 'trasferimento', trade: 'vendi', date: '2025-03-02', amount: 500000, accountId: btc.id, toAccountId: eur.id, amountTo: 30000, price });
  assert.equal(v.trade, 'vendi');
  // Vendi da euro → crypto rifiutata
  expectValidation(() => store.addMovement({ type: 'trasferimento', trade: 'vendi', date: '2025-03-01', amount: 100, accountId: eur.id, toAccountId: btc.id, amountTo: 1, price }), 'accountId');
  // prezzo mancante
  expectValidation(() => store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2025-03-01', amount: 100, accountId: eur.id, toAccountId: btc.id, amountTo: 1 }), 'price');
  // euro → euro non è un Compra
  expectValidation(() => store.addMovement({ type: 'trasferimento', trade: 'compra', date: '2025-03-01', amount: 100, accountId: eur.id, toAccountId: cash.id, price }), 'accountId');
  // trasferimento normale: nessun campo nuovo
  const t = store.addMovement({ type: 'trasferimento', date: '2025-03-01', amount: 100, accountId: eur.id, toAccountId: cash.id });
  assert.equal(t.trade, null);
  assert.equal(t.price, null);
});

test('v2 busta paga: campi facoltativi sull\'entrata', () => {
  const { store, cat, eur } = base();
  const stip = cat('entrata', 'Stipendio').id;
  const m = store.addMovement({ type: 'entrata', date: '2025-03-27', amount: 200000, accountId: eur.id, categoryId: stip, gross: 280000, payslip: { taxable: 250000, irpef: 40000 } });
  assert.deepEqual(m.payslip, { contributions: null, taxable: 250000, irpef: 40000, pension: null, deductions: null });
  expectValidation(() => store.addMovement({ type: 'entrata', date: '2025-03-27', amount: 1, accountId: eur.id, categoryId: stip, payslip: { irpef: -1 } }), 'ps-irpef');
  const empty = store.addMovement({ type: 'entrata', date: '2025-03-27', amount: 1, accountId: eur.id, categoryId: stip, payslip: { taxable: null } });
  assert.equal(empty.payslip, null);
  const u = store.addMovement({ type: 'uscita', date: '2025-03-27', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id, payslip: { taxable: 5 } });
  assert.equal(u.payslip, null);
  const up = store.updateMovement(m.id, { amount: 210000 });
  assert.deepEqual(up.payslip, m.payslip);
  assert.equal(up.gross, 280000);
});

test('v2 obiettivi: quota mensile, accantonamenti per mese, allocateGoals tutto o niente', () => {
  const { store, storage } = base();
  const g = store.addGoal({ name: 'Bici', target: 100000, saved: 0, monthly: 5000, color: PALETTE[4] });
  assert.equal(g.monthly, 5000);
  assert.deepEqual(g.log, {});
  expectValidation(() => store.addGoal({ name: 'X', target: 100, monthly: 0, color: PALETTE[0] }), 'monthly');
  store.adjustGoal(g.id, 3000, '2026-05-10');
  assert.equal(store.find('goal', g.id).log['2026-05'], 3000);
  store.adjustGoal(g.id, -1000, '2026-05-20');
  assert.equal(store.find('goal', g.id).log['2026-05'], 2000);
  store.adjustGoal(g.id, 500);
  assert.equal(store.find('goal', g.id).saved, 2500);
  assert.equal(store.find('goal', g.id).log['2026-05'], 2000);

  const h = store.addGoal({ name: 'Telefono', target: 50000, color: PALETTE[5] });
  let writes = 0;
  const orig = storage.setItem.bind(storage);
  storage.setItem = (k, v) => { writes++; orig(k, v); };
  const out = store.allocateGoals([{ id: g.id, amount: 5000 }, { id: h.id, amount: 2000 }], '2026-06-27');
  assert.equal(writes, 1);
  assert.equal(out.length, 2);
  assert.equal(store.find('goal', g.id).saved, 7500);
  assert.equal(store.find('goal', g.id).log['2026-06'], 5000);
  assert.equal(store.find('goal', h.id).saved, 2000);

  // un obiettivo eliminato: niente cambia
  store.deleteGoal(h.id);
  const before = store.getState();
  expectValidation(() => store.allocateGoals([{ id: g.id, amount: 100 }, { id: h.id, amount: 100 }], '2026-06-28'), `alloc-${h.id}`);
  expectValidation(() => store.allocateGoals([{ id: g.id, amount: 0 }], '2026-06-28'), `alloc-${g.id}`);
  assert.equal(store.getState(), before);

  // storage pieno
  storage.failOn = (k) => k === DATA_KEY;
  assert.throws(() => store.allocateGoals([{ id: g.id, amount: 100 }], '2026-06-28'), StorageError);
  assert.equal(store.getState(), before);
  assert.equal(store.find('goal', g.id).saved, 7500);
});

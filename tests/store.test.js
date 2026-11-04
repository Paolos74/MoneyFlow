// Test di js/store.js: CRUD, validazione, tombstone, errori di storage, dati corrotti, fixture v1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore, ValidationError, StorageError, DATA_KEY, PALETTE, SCHEMA_VERSION, INTEREST_CATEGORY_ID } from '../js/store.js';
import { PICK_ICONS } from '../js/icons.js';
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

test('categorie iniziali di D17 più Interessi (v4), due "Altro" ammessi', () => {
  const { store } = setup();
  const cats = store.getState().categories;
  assert.deepEqual(cats.filter((c) => c.type === 'uscita').map((c) => c.name), ['Casa', 'Spesa', 'Trasporti', 'Bollette', 'Abbonamenti', 'Salute', 'Svago', 'Ristoranti', 'Regali', 'Altro']);
  assert.deepEqual(cats.filter((c) => c.type === 'entrata').map((c) => c.name), ['Stipendio', 'Rimborsi', 'Altro', 'Interessi']);
  assert.equal(cats.find((c) => c.name === 'Stipendio').role, 'stipendio');
  const int = cats.find((c) => c.name === 'Interessi');
  assert.equal(int.id, INTEREST_CATEGORY_ID);
  assert.equal(int.role, 'interessi');
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
  assert.equal(store.getState().categories.length, 14);
});

test('fixture data-v1.json caricata identica', () => {
  const raw = readFileSync(new URL('./fixtures/data-v1.json', import.meta.url), 'utf8');
  const storage = memoryStorage({ [DATA_KEY]: raw });
  const store = createStore({ storage, now: clock(), uuid: seqUuid() });
  assert.equal(store.corrupted, null);
  assert.deepEqual(store.getState(), JSON.parse(raw));
});

for (const v of ['v2', 'v3']) {
  test(`fixture data-${v}.json caricata identica`, () => {
    const raw = readFileSync(new URL(`./fixtures/data-${v}.json`, import.meta.url), 'utf8');
    const storage = memoryStorage({ [DATA_KEY]: raw });
    const store = createStore({ storage, now: clock(), uuid: seqUuid() });
    assert.equal(store.corrupted, null);
    assert.deepEqual(store.getState(), JSON.parse(raw));
    assert.equal(storage.getItem(DATA_KEY), raw, 'il caricamento non riscrive i dati');
  });
}

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

// ---------- v4: campi facoltativi nuovi e operazioni atomiche ----------

test('v4 icone: nome di PICK_ICONS oppure null, nome sconosciuto → null', () => {
  const { store, eur, cat } = base();
  assert.equal(eur.icon, null);
  assert.equal(store.updateAccount(eur.id, { icon: 'bank' }).icon, 'bank');
  assert.equal(store.updateAccount(eur.id, { icon: 'razzo' }).icon, null);
  assert.equal(store.updateCategory(cat('uscita', 'Casa').id, { icon: 'house' }).icon, 'house');
  assert.equal(store.updateCategory(cat('uscita', 'Casa').id, { icon: 42 }).icon, null);
  assert.ok(PICK_ICONS.includes('vault') && PICK_ICONS.includes('percent'));
});

test('v4 deposito: solo conti in euro, tassi ordinati dalla data di inizio', () => {
  const { store, eur, btc } = base();
  const dep = { start: '2026-03-01', rates: [{ from: '2026-03-01', rateBp: 250 }] };
  const a = store.updateAccount(eur.id, { deposit: dep });
  assert.deepEqual(a.deposit, { start: '2026-03-01', withholdingBp: 2600, rates: [{ from: '2026-03-01', rateBp: 250 }] });
  const b = store.updateAccount(eur.id, { deposit: { ...dep, withholdingBp: 0, rates: [{ from: '2026-04-01', rateBp: 200 }, { from: '2026-03-01', rateBp: 250 }] } });
  assert.deepEqual(b.deposit.rates.map((r) => r.from), ['2026-03-01', '2026-04-01']);
  assert.equal(b.deposit.withholdingBp, 0);
  expectValidation(() => store.updateAccount(btc.id, { deposit: dep }), 'deposit');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, start: '2026-02-30' } }), 'deposit-start');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, withholdingBp: 10001 } }), 'deposit-withholding');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, rates: [] } }), 'deposit-rate');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, rates: [{ from: '2026-03-01', rateBp: 0 }] } }), 'deposit-rate');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, rates: [{ from: '2026-03-01', rateBp: 2001 }] } }), 'deposit-rate');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, rates: [{ from: '2026-03-02', rateBp: 250 }] } }), 'deposit-rate');
  expectValidation(() => store.updateAccount(eur.id, { deposit: { ...dep, rates: [{ from: '2026-03-01', rateBp: 250 }, { from: '2026-03-01', rateBp: 200 }] } }), 'deposit-rate');
  assert.equal(store.updateAccount(eur.id, { deposit: null }).deposit, null);
});

test('v4 categoria: ruolo interessi accettato, altri ruoli no', () => {
  const { store } = base();
  assert.equal(store.addCategory({ name: 'Cedole', type: 'entrata', color: PALETTE[0], role: 'interessi' }).role, 'interessi');
  assert.equal(store.addCategory({ name: 'Boh', type: 'entrata', color: PALETTE[0], role: 'capo' }).role, null);
});

test('v4 spesa divisa: quote, nomi unici, quota esclusa = somma, limiti per persona', () => {
  const { store, cat, eur } = base();
  const rist = cat('uscita', 'Ristoranti').id;
  const base4 = { type: 'uscita', date: '2026-03-01', amount: 9000, accountId: eur.id, categoryId: rist };
  const e = store.addMovement({ ...base4, excluded: 1, split: [{ person: ' Anna ', amount: 3000 }, { person: 'Luca', amount: 3000 }] });
  assert.deepEqual(e.split, [{ person: 'Anna', amount: 3000 }, { person: 'Luca', amount: 3000 }]);
  assert.equal(e.excluded, 6000, "l'input excluded si ignora");
  expectValidation(() => store.addMovement({ ...base4, split: [{ person: 'Anna', amount: 3000 }, { person: 'anna', amount: 10 }] }), 'split-1');
  expectValidation(() => store.addMovement({ ...base4, split: [{ person: '', amount: 3000 }] }), 'split-0');
  expectValidation(() => store.addMovement({ ...base4, split: [{ person: 'x'.repeat(41), amount: 3000 }] }), 'split-0');
  expectValidation(() => store.addMovement({ ...base4, split: [{ person: 'Anna', amount: 0 }] }), 'split-0');
  expectValidation(() => store.addMovement({ ...base4, split: [{ person: 'Anna', amount: 9001 }] }), 'split');
  expectValidation(() => store.addMovement({ ...base4, split: Array.from({ length: 21 }, (_, i) => ({ person: 'P' + i, amount: 1 })) }), 'split');
  assert.equal(store.addMovement({ ...base4, excluded: 500, split: [] }).split, null, 'split vuoto = comportamento v3');

  // restituzioni per persona
  const r = { type: 'restituzione', date: '2026-03-02', accountId: eur.id, refundOf: e.id };
  const ra = store.addMovement({ ...r, amount: 3000, person: 'anna' });
  assert.equal(ra.person, 'Anna', 'nome come nella spesa');
  expectValidation(() => store.addMovement({ ...r, amount: 1, person: 'Anna' }), 'amount');
  expectValidation(() => store.addMovement({ ...r, amount: 100, person: 'Marco' }), 'person');
  expectValidation(() => store.addMovement({ ...r, amount: 100 }), 'amount'); // nessuna parte senza nome
  store.addMovement({ ...r, amount: 1000, person: 'Luca' });
  // la quota di Anna non può scendere sotto quanto ha restituito; togliere Anna nemmeno
  expectValidation(() => store.updateMovement(e.id, { split: [{ person: 'Anna', amount: 2999 }, { person: 'Luca', amount: 3000 }] }), 'split-0');
  expectValidation(() => store.updateMovement(e.id, { split: [{ person: 'Luca', amount: 3000 }] }), 'split');
  const up = store.updateMovement(e.id, { split: [{ person: 'Anna', amount: 3000 }, { person: 'Luca', amount: 2000 }] });
  assert.equal(up.excluded, 5000);
  // la restituzione su una spesa senza persone accetta un nome libero
  const plain = store.addMovement({ ...base4, excluded: 2000 });
  assert.equal(store.addMovement({ ...r, refundOf: plain.id, amount: 500, person: 'Sara' }).person, 'Sara');
  // tipi diversi dall'uscita non hanno persone
  const inc = store.addMovement({ type: 'entrata', date: '2026-03-01', amount: 100, accountId: eur.id, categoryId: cat('entrata', 'Altro').id, split: [{ person: 'A', amount: 1 }] });
  assert.equal(inc.split, null);
});

test('v4 interessi, rettifica e chiave di importazione', () => {
  const { store, cat, eur, btc } = base();
  const i = store.addMovement({ type: 'entrata', date: '2026-03-31', amount: 152, accountId: eur.id, categoryId: cat('entrata', 'Interessi').id, interest: { accountId: eur.id, month: '2026-03' } });
  assert.deepEqual(i.interest, { accountId: eur.id, month: '2026-03' });
  // variazione su conto euro solo con align
  expectValidation(() => store.addMovement({ type: 'variazione', date: '2026-03-01', amount: 5, accountId: eur.id }), 'accountId');
  const a = store.addMovement({ type: 'variazione', date: '2026-03-10', amount: 500, accountId: eur.id, align: { balance: 100500 } });
  assert.deepEqual(a.align, { balance: 100500 });
  assert.equal(store.addMovement({ type: 'variazione', date: '2026-03-10', amount: 3, accountId: btc.id, align: { balance: 1 } }).align, null);
  const k = store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id, importKey: 'csv|2026-03-01|-100|bar|1' });
  assert.equal(k.importKey, 'csv|2026-03-01|-100|bar|1');
  expectValidation(() => store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 100, accountId: eur.id, categoryId: cat('uscita', 'Spesa').id, importKey: 'x'.repeat(121) }), 'importKey');
  assert.equal(store.addMovement({ type: 'trasferimento', date: '2026-03-01', amount: 100, accountId: eur.id, toAccountId: btc.id, amountTo: 5, importKey: 'x' }).importKey, null);
});

test('v4 upsertDerived: id fissi, categoria Interessi creata o ripristinata, idempotente', () => {
  const { store, eur } = base();
  store.deleteCategory(INTEREST_CATEGORY_ID);
  const id = `interest-${eur.id}-2026-03`;
  const input = { type: 'entrata', date: '2026-03-03', amount: 152, accountId: eur.id, categoryId: INTEREST_CATEGORY_ID, description: 'Interessi marzo 2026', interest: { accountId: eur.id, month: '2026-03' } };
  let events = 0;
  store.subscribe(() => events++);
  assert.ok(store.upsertDerived([{ id, input }], { ensureCategory: true }) > 0);
  assert.equal(events, 1);
  assert.equal(store.find('category', INTEREST_CATEGORY_ID).deleted, false);
  assert.equal(store.find('movement', id).amount, 152);
  assert.equal(store.upsertDerived([{ id, input }], { ensureCategory: true }), 0);
  assert.equal(events, 1, 'seconda chiamata identica: nessuna notifica');
  store.upsertDerived([{ id, input: { ...input, amount: 203, date: '2026-03-04' } }]);
  assert.equal(store.find('movement', id).amount, 203);
  store.upsertDerived([{ id, input, deleted: true }]);
  assert.equal(store.find('movement', id).deleted, true);
  assert.equal(store.upsertDerived([{ id, input, deleted: true }]), 0);
  store.upsertDerived([{ id, input }]);
  assert.equal(store.find('movement', id).deleted, false);
  assert.equal(events, 4);
  // categoria assente del tutto (dati v1–v3): creata con l'id fisso
  const v = setup({ [DATA_KEY]: readFileSync(new URL('./fixtures/data-v3.json', import.meta.url), 'utf8') });
  assert.equal(v.store.find('category', INTEREST_CATEGORY_ID), null);
  const acc = v.store.getState().accounts[0].id;
  v.store.upsertDerived([{ id: `interest-${acc}-2026-03`, input: { ...input, accountId: acc, interest: { accountId: acc, month: '2026-03' } } }], { ensureCategory: true });
  const c = v.store.find('category', INTEREST_CATEGORY_ID);
  assert.equal(c.role, 'interessi');
  assert.equal(c.name, 'Interessi');
  // errore di validazione: niente salvato
  const before = store.getState();
  expectValidation(() => store.upsertDerived([{ id: 'x1', input }, { id: 'x2', input: { ...input, amount: 0 } }]), 'amount');
  assert.equal(store.getState(), before);
});

test('v4 addMovements: un salvataggio, tutto o niente', () => {
  const { store, cat, eur, storage } = base();
  let writes = 0;
  const orig = storage.setItem.bind(storage);
  storage.setItem = (k, v) => { writes++; orig(k, v); };
  const sp = cat('uscita', 'Spesa').id;
  const out = store.addMovements([
    { type: 'uscita', date: '2026-03-01', amount: 100, accountId: eur.id, categoryId: sp, importKey: 'a' },
    { type: 'entrata', date: '2026-03-02', amount: 200, accountId: eur.id, categoryId: cat('entrata', 'Altro').id, importKey: 'b' },
  ]);
  assert.equal(writes, 1);
  assert.equal(out.length, 2);
  const n = store.getState().movements.length;
  expectValidation(() => store.addMovements([{ type: 'uscita', date: '2026-03-01', amount: 100, accountId: eur.id, categoryId: sp }, { type: 'uscita', date: 'no', amount: 1, accountId: eur.id, categoryId: sp }]), 'date');
  assert.equal(store.getState().movements.length, n);
});

test('v4 settlePerson: ha restituito tutto e non li ricevo più', () => {
  const { store, cat, eur } = base();
  const rist = cat('uscita', 'Ristoranti').id;
  const e1 = store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 9000, accountId: eur.id, categoryId: rist, split: [{ person: 'Anna', amount: 3000 }, { person: 'Luca', amount: 3000 }] });
  const e2 = store.addMovement({ type: 'uscita', date: '2026-03-05', amount: 4000, accountId: eur.id, categoryId: rist, split: [{ person: 'luca', amount: 2000 }] });
  store.addMovement({ type: 'restituzione', date: '2026-03-06', amount: 1000, accountId: eur.id, refundOf: e1.id, person: 'Luca' });
  assert.equal(store.settlePerson('LUCA', { mode: 'refund', accountId: eur.id, date: '2026-03-10' }), 2);
  const refunds = store.getState().movements.filter((m) => m.type === 'restituzione' && m.date === '2026-03-10');
  assert.deepEqual(refunds.map((m) => [m.refundOf, m.amount, m.person]), [[e1.id, 2000, 'Luca'], [e2.id, 2000, 'luca']]);
  expectValidation(() => store.settlePerson('Luca', { mode: 'refund', accountId: eur.id, date: '2026-03-10' }));
  // writeoff: Anna non ha restituito nulla → esce dall'elenco, la quota esclusa scende
  store.settlePerson('anna', { mode: 'writeoff' });
  const w = store.find('movement', e1.id);
  assert.deepEqual(w.split, [{ person: 'Luca', amount: 3000 }]);
  assert.equal(w.excluded, 3000);
  // writeoff con una parte già restituita: la quota scende a quanto restituito
  const e3 = store.addMovement({ type: 'uscita', date: '2026-03-07', amount: 5000, accountId: eur.id, categoryId: rist, split: [{ person: 'Sara', amount: 4000 }] });
  store.addMovement({ type: 'restituzione', date: '2026-03-08', amount: 1500, accountId: eur.id, refundOf: e3.id, person: 'Sara' });
  store.settlePerson('Sara', { mode: 'writeoff' });
  assert.deepEqual(store.find('movement', e3.id).split, [{ person: 'Sara', amount: 1500 }]);
  assert.equal(store.find('movement', e3.id).excluded, 1500);
});

test('v4 spesa divisa modificata da una v3 (solo excluded cambiato) si carica senza errori', () => {
  const { store, cat, eur, storage } = base();
  const e = store.addMovement({ type: 'uscita', date: '2026-03-01', amount: 9000, accountId: eur.id, categoryId: cat('uscita', 'Ristoranti').id, split: [{ person: 'Anna', amount: 3000 }] });
  const data = JSON.parse(storage.getItem(DATA_KEY));
  const m = data.movements.find((x) => x.id === e.id);
  m.excluded = 5000; // la v3 conserva split e cambia solo excluded
  const raw = JSON.stringify(data);
  const s2 = createStore({ storage: memoryStorage({ [DATA_KEY]: raw }), now: clock(), uuid: seqUuid('w') });
  assert.equal(s2.corrupted, null);
  assert.equal(s2.find('movement', e.id).excluded, 5000);
  assert.deepEqual(s2.find('movement', e.id).split, [{ person: 'Anna', amount: 3000 }]);
  // la parte senza nome (20,00) si può restituire senza persona
  assert.equal(s2.addMovement({ type: 'restituzione', date: '2026-03-02', amount: 2000, accountId: eur.id, refundOf: e.id }).person, null);
});

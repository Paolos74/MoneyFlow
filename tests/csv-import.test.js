// Test di js/csv-import.js: lettura CSV, estratto Revolut di prova (dati inventati), formato generico, doppioni, categoria suggerita.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseCsv, parseCsvAmount, parseCsvDate, detectRevolut, guessColumns, buildImportRows, suggestCategory } from '../js/csv-import.js';
import { createStore, PALETTE } from '../js/store.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

function world() {
  const store = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid() });
  const acc = store.addAccount({ name: 'Conto', kind: 'eur', initial: 100000, color: PALETTE[1] });
  return { store, acc };
}

// Le righe da importare diventano movimenti come farebbe la vista Importa.
const toInputs = (rows, accountId) => rows.filter((r) => r.include).map((r) => ({
  type: r.type, date: r.date, amount: r.amount, accountId, description: r.description, importKey: r.importKey,
  categoryId: r.type === 'uscita' ? 'default-uscita-altro' : 'default-entrata-altro',
}));

test('lettura: BOM, separatore, virgolette con "" e a capo, CRLF, righe vuote', () => {
  const p = parseCsv('\uFEFFData;Descrizione;Importo\r\n01/03/2026;"Cena; ""amici""\r\nseconda riga";-12,50\r\n\r\n02/03/2026;Bar;-1,20');
  assert.equal(p.sep, ';');
  assert.deepEqual(p.rows, [['Data', 'Descrizione', 'Importo'], ['01/03/2026', 'Cena; "amici"\r\nseconda riga', '-12,50'], ['02/03/2026', 'Bar', '-1,20']]);
  assert.equal(parseCsv('a\tb\tc\n1\t2\t3').sep, '\t');
  assert.equal(parseCsv('"a;b",c,d\n1,2,3').sep, ',', 'i separatori tra virgolette non contano');
});

test('importi italiani e inglesi, date', () => {
  assert.equal(parseCsvAmount('1.234,56'), 123456);
  assert.equal(parseCsvAmount('-12,50'), -1250);
  assert.equal(parseCsvAmount('1234.56'), 123456);
  assert.equal(parseCsvAmount('1,234.56'), 123456);
  assert.equal(parseCsvAmount('-3.5'), -350);
  assert.equal(parseCsvAmount('€ 5'), 500);
  assert.equal(parseCsvAmount('12,50-'), -1250);
  assert.equal(parseCsvAmount('abc'), null);
  assert.equal(parseCsvAmount(''), null);
  assert.equal(parseCsvDate('2026-03-03 09:15:00'), '2026-03-03');
  assert.equal(parseCsvDate('03/03/2026'), '2026-03-03');
  assert.equal(parseCsvDate('3-3-2026'), '2026-03-03');
  assert.equal(parseCsvDate('03.03.2026'), '2026-03-03');
  assert.equal(parseCsvDate('31/02/2026'), null);
  assert.equal(parseCsvDate('domani'), null);
});

test('Revolut di prova: PENDING e USD saltate, commissione sottratta, righe uguali restano due', () => {
  const { store, acc } = world();
  const parsed = parseCsv(readFileSync(new URL('./fixtures/estratto-revolut-prova.csv', import.meta.url), 'utf8'));
  assert.ok(detectRevolut(parsed.rows[0]));
  const r = buildImportRows(parsed, { kind: 'revolut' }, store.getState(), acc.id);
  assert.deepEqual(r.skipped.map((s) => [s.line, s.reason]), [[4, 'Non completata (PENDING)'], [5, 'Valuta USD: si importano solo gli euro']]);
  assert.deepEqual(r.rows.map((x) => [x.date, x.type, x.amount, x.description, x.include]), [
    ['2026-03-03', 'uscita', 350, 'Bar Centrale', true],
    ['2026-03-04', 'entrata', 50000, 'Ricarica da conto', true],
    ['2026-03-08', 'uscita', 10150, 'Prelievo bancomat', true],
    ['2026-03-09', 'uscita', 350, 'Bar Centrale', true],
    ['2026-03-09', 'uscita', 350, 'Bar Centrale', true],
    ['2026-03-10', 'entrata', 2500, 'Rimborso cena, grazie', true],
  ]);
  assert.notEqual(r.rows[3].importKey, r.rows[4].importKey);
  // conto a mano: uscite 3,50 + 101,50 + 3,50 + 3,50 = 112,00; entrate 500,00 + 25,00 = 525,00
  const sum = (t) => r.rows.filter((x) => x.type === t).reduce((s, x) => s + x.amount, 0);
  assert.equal(sum('uscita'), 11200);
  assert.equal(sum('entrata'), 52500);
  store.addMovements(toInputs(r.rows, acc.id));
  assert.equal(store.getState().movements.length, 6);
  // reimport dello stesso file: tutte "Già presente"
  const again = buildImportRows(parsed, { kind: 'revolut' }, store.getState(), acc.id);
  assert.equal(again.rows.length, 6);
  assert.ok(again.rows.every((x) => x.duplicate && !x.include));
});

test('intestazione Revolut in italiano (non verificata su un file vero)', () => {
  const p = parseCsv('Tipo,Prodotto,Data di inizio,Data di completamento,Descrizione,Importo,Costo,Valuta,Stato,Saldo\nPAGAMENTO,Attuale,2026-03-02 10:00:00,2026-03-02 10:00:01,Edicola,-2.00,0.00,EUR,COMPLETATO,10.00');
  const { store, acc } = world();
  const r = buildImportRows(p, { kind: 'revolut' }, store.getState(), acc.id);
  assert.deepEqual(r.rows.map((x) => [x.date, x.amount, x.type]), [['2026-03-02', 200, 'uscita']]);
  assert.equal(detectRevolut(['Data', 'Importo']), null);
});

test('generico ";" con importi italiani e "," con importi inglesi tra virgolette', () => {
  const { store, acc } = world();
  const it = parseCsv('Data operazione;Causale;Importo\n02/03/2026;Spesa;-1.234,56\n03/03/2026;Stipendio;2.000,00\n31/02/2026;Errata;1,00');
  const cols = guessColumns(it.rows[0]);
  assert.deepEqual(cols, { date: 0, description: 1, amount: 2 });
  const r1 = buildImportRows(it, { kind: 'generic', ...cols }, store.getState(), acc.id);
  assert.deepEqual(r1.rows.map((x) => [x.date, x.type, x.amount]), [['2026-03-02', 'uscita', 123456], ['2026-03-03', 'entrata', 200000]]);
  assert.deepEqual(r1.skipped, [{ line: 4, reason: 'Data non valida' }]);
  const en = parseCsv('Date,Description,Amount\n2026-03-02,"Shop, big","1,234.56"\n2026-03-03,Refund,"12.00"');
  const r2 = buildImportRows(en, { kind: 'generic', date: 0, description: 1, amount: 2, invert: true }, store.getState(), acc.id);
  assert.deepEqual(r2.rows.map((x) => [x.type, x.amount, x.description]), [['uscita', 123456, 'Shop, big'], ['uscita', 1200, 'Refund']], 'Inverti segno');
  // senza intestazione: la prima riga è già un movimento
  const no = parseCsv('02/03/2026;Spesa;-5,00');
  assert.equal(buildImportRows(no, { kind: 'generic', date: 0, description: 1, amount: 2 }, store.getState(), acc.id).rows.length, 1);
});

test('spesa inserita a mano con stessa data e importo → riga non spuntata (una per movimento)', () => {
  const { store, acc } = world();
  store.addMovement({ type: 'uscita', date: '2026-03-09', amount: 350, accountId: acc.id, categoryId: 'default-uscita-ristoranti' });
  const parsed = parseCsv(readFileSync(new URL('./fixtures/estratto-revolut-prova.csv', import.meta.url), 'utf8'));
  const r = buildImportRows(parsed, { kind: 'revolut' }, store.getState(), acc.id);
  const bar9 = r.rows.filter((x) => x.date === '2026-03-09');
  assert.deepEqual(bar9.map((x) => x.include), [false, true]);
  assert.equal(r.rows.filter((x) => x.include).length, 5);
});

test('formule nella descrizione importate come testo', () => {
  const { store, acc } = world();
  const p = parseCsv('Data;Descrizione;Importo\n02/03/2026;=SUM(A1:A3);-1,00\n02/03/2026;"@cmd";-2,00');
  const r = buildImportRows(p, { kind: 'generic', date: 0, description: 1, amount: 2 }, store.getState(), acc.id);
  const [m1, m2] = store.addMovements(toInputs(r.rows, acc.id));
  assert.equal(m1.description, '=SUM(A1:A3)');
  assert.equal(m2.description, '@cmd');
});

test('categoria suggerita da un movimento passato con la stessa descrizione', () => {
  const { store, acc } = world();
  const svago = 'default-uscita-svago';
  store.addMovement({ type: 'uscita', date: '2026-01-02', amount: 100, accountId: acc.id, categoryId: 'default-uscita-spesa', description: 'Bar Centrale' });
  store.addMovement({ type: 'uscita', date: '2026-02-02', amount: 100, accountId: acc.id, categoryId: svago, description: '  bar   centrale ' });
  const s = store.getState();
  assert.equal(suggestCategory(s, 'uscita', 'BAR CENTRALE', 'default-uscita-altro'), svago, 'il più recente');
  assert.equal(suggestCategory(s, 'entrata', 'Bar Centrale', 'default-entrata-altro'), 'default-entrata-altro', 'tipo diverso');
  assert.equal(suggestCategory(s, 'uscita', 'Nuovo negozio', 'default-uscita-altro'), 'default-uscita-altro');
  store.deleteCategory(svago);
  assert.equal(suggestCategory(store.getState(), 'uscita', 'Bar Centrale', 'x'), 'default-uscita-spesa', 'categoria eliminata saltata');
});

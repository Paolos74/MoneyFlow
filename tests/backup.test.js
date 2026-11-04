// Test di js/backup.js: invariante di validazione e andata/ritorno identico, anche con orfani e tombstone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBackup, validateBackup, parseBackup, backupFileName, backupSummary } from '../js/backup.js';
import { createStore, ValidationError, PALETTE } from '../js/store.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

function richStore() {
  const store = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid() });
  const cat = store.getState().categories[0].id;
  const a = store.addAccount({ name: 'Revolut', kind: 'eur', initial: 100, color: PALETTE[0] });
  const b = store.addAccount({ name: 'Revolut 2', kind: 'eur', initial: 100, color: PALETTE[0] });
  store.addMovement({ type: 'uscita', date: '2025-01-01', amount: 4000, excluded: 2000, accountId: a.id, categoryId: cat, note: 'x' });
  store.addMovement({ type: 'uscita', date: '2025-01-01', amount: 4000, accountId: b.id, categoryId: cat });
  store.deleteAccount(b.id);
  store.deleteCategory(cat);
  // orfano e nome doppio con un eliminato, come può arrivare dalla sync
  store.applyRemote([{ kind: 'movement', record: { id: 'orfano', type: 'uscita', date: '2025-01-02', amount: 1, accountId: 'manca', categoryId: 'manca', updatedAt: 1, createdAt: 1, deleted: false, description: '', note: '' } }]);
  store.applyRemote([{ kind: 'account', record: { id: 'dup', name: 'revolut', kind: 'eur', initial: 0, color: '#000000', updatedAt: 1, createdAt: 1, deleted: false } }]);
  return store;
}

test('il backup creato dall\'app passa sempre la propria validazione', () => {
  const store = richStore();
  const b = createBackup(store.getState(), Date.UTC(2025, 0, 2));
  assert.equal(b.app, 'MoneyFlow');
  assert.equal(b.schemaVersion, 1);
  assert.equal(b.exportedAt, '2025-01-02T00:00:00.000Z');
  assert.doesNotThrow(() => validateBackup(b));
});

test('andata e ritorno identico', () => {
  const store = richStore();
  const before = structuredClone(store.getState());
  const text = JSON.stringify(createBackup(before));
  const other = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid('z') });
  other.replaceAll(parseBackup(text));
  assert.deepEqual(other.getState(), before);
});

test('file non validi rifiutati con messaggio italiano', () => {
  assert.throws(() => parseBackup('non json'), (e) => e instanceof ValidationError && /JSON/.test(e.message));
  assert.throws(() => parseBackup('{"app":"Altro"}'), (e) => e instanceof ValidationError && /MoneyFlow/.test(e.message));
  assert.throws(() => parseBackup('{"app":"MoneyFlow","schemaVersion":99}'), (e) => /più nuova/.test(e.message));
  assert.throws(() => parseBackup('{"app":"MoneyFlow","schemaVersion":1,"movements":{}}'), ValidationError);
});

test('la fixture v1 si importa come backup', () => {
  const raw = readFileSync(new URL('./fixtures/data-v1.json', import.meta.url), 'utf8');
  const data = parseBackup(raw);
  assert.deepEqual(data, JSON.parse(raw));
  assert.ok(backupSummary(data).movements > 0);
});

for (const v of ['v2', 'v3']) {
  test(`la fixture ${v} si importa come backup, andata e ritorno identico`, () => {
    const raw = readFileSync(new URL(`./fixtures/data-${v}.json`, import.meta.url), 'utf8');
    const data = parseBackup(raw);
    assert.deepEqual(data, JSON.parse(raw));
    const store = createStore({ storage: memoryStorage(), now: clock(), uuid: seqUuid('z') });
    store.replaceAll(data);
    const back = parseBackup(JSON.stringify(createBackup(store.getState())));
    assert.deepEqual(back, JSON.parse(raw));
  });
}

test('nome del file di backup', () => {
  assert.match(backupFileName(new Date(2025, 2, 7, 10).getTime()), /^MoneyFlow_backup_2025-03-07\.json$/);
});

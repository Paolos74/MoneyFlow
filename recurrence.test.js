// Test di js/recurrence.js: frequenze, fine mese, 29/02, data di fine, occorrenze gestite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { occurrences, pendingOccurrences, nextOccurrence, yearlyAmount, freqLabel } from '../js/recurrence.js';

const S = (o) => ({ amount: 1000, freq: 'monthly', start: '2025-01-31', end: null, interval: null, handled: {}, ...o });

test('una volta', () => {
  assert.deepEqual(occurrences(S({ freq: 'once', start: '2025-03-10' }), '2025-01-01', '2025-12-31'), ['2025-03-10']);
  assert.deepEqual(occurrences(S({ freq: 'once', start: '2025-03-10' }), '2025-04-01', '2025-12-31'), []);
});

test('settimanale', () => {
  assert.deepEqual(occurrences(S({ freq: 'weekly', start: '2025-01-01' }), '2025-01-10', '2025-01-31'), ['2025-01-15', '2025-01-22', '2025-01-29']);
});

test('mensile dal 31 → ultimo giorno del mese', () => {
  assert.deepEqual(occurrences(S(), '2025-01-01', '2025-04-30'), ['2025-01-31', '2025-02-28', '2025-03-31', '2025-04-30']);
});

test('ogni N mesi contati dal mese di inizio', () => {
  assert.deepEqual(occurrences(S({ freq: 'months', interval: 3, start: '2024-11-15' }), '2025-01-01', '2025-12-31'), ['2025-02-15', '2025-05-15', '2025-08-15', '2025-11-15']);
});

test('annuale dal 29/02', () => {
  assert.deepEqual(occurrences(S({ freq: 'yearly', start: '2024-02-29' }), '2024-01-01', '2028-12-31'), ['2024-02-29', '2025-02-28', '2026-02-28', '2027-02-28', '2028-02-29']);
});

test('data di fine rispettata', () => {
  assert.deepEqual(occurrences(S({ start: '2025-01-10', end: '2025-03-09' }), '2025-01-01', '2025-12-31'), ['2025-01-10', '2025-02-10']);
});

test('da confermare esclude quelle gestite', () => {
  const s = S({ start: '2025-01-10', handled: { '2025-01-10': 'confermato', '2025-02-10': 'saltato' } });
  assert.deepEqual(pendingOccurrences(s, '2025-04-09'), ['2025-03-10']);
  assert.deepEqual(pendingOccurrences({ ...s, deleted: true }, '2025-04-09'), []);
  assert.equal(nextOccurrence(s, '2025-04-09'), '2025-04-10');
  assert.equal(nextOccurrence(S({ freq: 'once', start: '2025-01-01' }), '2025-02-01'), null);
});

test('importo annuo e etichette', () => {
  assert.equal(yearlyAmount(S({ freq: 'weekly' })), 52000);
  assert.equal(yearlyAmount(S({ freq: 'monthly' })), 12000);
  assert.equal(yearlyAmount(S({ freq: 'months', interval: 5, amount: 1001 })), 2402);
  assert.equal(yearlyAmount(S({ freq: 'yearly' })), 1000);
  assert.equal(yearlyAmount(S({ freq: 'once' })), 0);
  assert.equal(freqLabel(S({ freq: 'months', interval: 4 })), 'Ogni 4 mesi');
});

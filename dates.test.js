// Test di js/dates.js: date locali, fine mese, bisestili, periodi dei filtri.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../js/dates.js';

test('toISO, parseISO, validità', () => {
  assert.equal(D.toISO(2025, 3, 7), '2025-03-07');
  assert.deepEqual(D.parseISO('2024-02-29'), { y: 2024, m: 2, d: 29 });
  assert.equal(D.parseISO('2025-02-29'), null);
  assert.equal(D.parseISO('2025-13-01'), null);
  assert.equal(D.parseISO('25-01-01'), null);
  assert.equal(D.isValidISO(''), false);
});

test('todayISO usa la data locale', () => {
  assert.equal(D.todayISO(new Date(2025, 0, 31, 23, 59)), '2025-01-31');
  assert.equal(D.todayISO(new Date(2025, 0, 1, 0, 1)), '2025-01-01');
});

test('addDays, diffDays, settimana ISO', () => {
  assert.equal(D.addDays('2024-12-31', 1), '2025-01-01');
  assert.equal(D.addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(D.diffDays('2025-01-01', '2025-03-01'), 59);
  assert.equal(D.weekday('2025-03-03'), 0); // lunedì
  assert.equal(D.weekday('2025-03-09'), 6); // domenica
  assert.equal(D.startOfIsoWeek('2025-03-09'), '2025-03-03');
});

test('mesi con fine mese', () => {
  assert.equal(D.addMonthsClamped('2025-01-31', 1), '2025-02-28');
  assert.equal(D.addMonthsClamped('2024-01-31', 1), '2024-02-29');
  assert.equal(D.addMonthsClamped('2025-01-31', 2), '2025-03-31');
  assert.equal(D.addMonthsClamped('2025-11-15', 3), '2026-02-15');
  assert.equal(D.addMonthsYM('2025-01', -1), '2024-12');
  assert.equal(D.monthEnd('2024-02'), '2024-02-29');
  assert.equal(D.daysInMonth(1900, 2), 28);
  assert.equal(D.daysInMonth(2000, 2), 29);
  assert.deepEqual(D.monthsBetween('2024-11', '2025-02'), ['2024-11', '2024-12', '2025-01', '2025-02']);
});

test('formati italiani', () => {
  assert.equal(D.formatDateIt('2025-03-07'), '07/03/2025');
  assert.equal(D.formatDayHeader('2025-03-03'), 'Lunedì 3 marzo');
  assert.equal(D.formatDayHeader('2024-03-04', 2025), 'Lunedì 4 marzo 2024');
  assert.equal(D.monthLabel('2025-12'), 'Dicembre 2025');
});

test('periodi a cavallo d\'anno', () => {
  const t = '2025-01-15';
  assert.deepEqual(D.periodRange('mese', t), { from: '2025-01-01', to: '2025-01-31' });
  assert.deepEqual(D.periodRange('mese-scorso', t), { from: '2024-12-01', to: '2024-12-31' });
  assert.deepEqual(D.periodRange('3mesi', t), { from: '2024-11-01', to: '2025-01-31' });
  assert.deepEqual(D.periodRange('anno', t), { from: '2025-01-01', to: '2025-12-31' });
  assert.deepEqual(D.periodRange('anno-scorso', t), { from: '2024-01-01', to: '2024-12-31' });
  assert.deepEqual(D.periodRange('custom', t, { from: '2024-05-01', to: '2024-05-10' }), { from: '2024-05-01', to: '2024-05-10' });
  assert.ok(D.periodRange('custom', t, { from: '', to: '2024-05-10' }).error);
  assert.ok(D.periodRange('custom', t, { from: '2024-06-01', to: '2024-05-10' }).error);
  assert.deepEqual(D.periodRange('sconosciuto', '2024-02-10'), { from: '2024-02-01', to: '2024-02-29' });
});

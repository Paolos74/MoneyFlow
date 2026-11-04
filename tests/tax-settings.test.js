// Test di js/tax-settings.js: impostazioni della stima solo sul dispositivo (chiave moneyflow:tax).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTaxSettings, TAX_KEY } from '../js/tax-settings.js';
import { memoryStorage } from './helpers.js';

test('valori di partenza, set e setYear salvati in moneyflow:tax', () => {
  const storage = memoryStorage();
  const t = createTaxSettings(storage);
  assert.deepEqual(t.get(), { hireDate: null, regionalBp: null, municipalBp: null, years: {} });
  assert.deepEqual(t.year(2026), { projTaxable: null, projIrpef: null });
  assert.equal(t.set({ hireDate: '2026-03-01', regionalBp: 173 }), true);
  assert.equal(t.setYear(2026, { projTaxable: 300000 }), true);
  const saved = JSON.parse(storage.getItem(TAX_KEY));
  assert.deepEqual(saved, { hireDate: '2026-03-01', regionalBp: 173, municipalBp: null, years: { 2026: { projTaxable: 300000, projIrpef: null } } });
  const again = createTaxSettings(storage);
  assert.equal(again.get().hireDate, '2026-03-01');
  assert.deepEqual(again.year(2026), { projTaxable: 300000, projIrpef: null });
});

test('JSON rotto → valori di partenza; storage pieno → set restituisce false e nulla cambia', () => {
  const storage = memoryStorage({ [TAX_KEY]: '{rotto' });
  const t = createTaxSettings(storage);
  assert.equal(t.get().hireDate, null);
  storage.failOn = (k) => k === TAX_KEY;
  assert.equal(t.set({ regionalBp: 100 }), false);
  assert.equal(t.get().regionalBp, null);
  storage.failOn = null;
  storage.setItem(TAX_KEY, JSON.stringify({ municipalBp: 80 }));
  t.reload();
  assert.equal(t.get().municipalBp, 80);
});

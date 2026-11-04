// Test di js/pension.js: simulatore del fondo pensione su esempi calcolati a mano.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulatePension } from '../js/pension.js';
import { tableFor } from '../js/tax.js';
import { ValidationError } from '../js/errors.js';

const T = tableFor(2026);

test('P1: base 2.500,00, dal 2% al 4%, 14 mensilità, imponibile 36.000,00', () => {
  const r = simulatePension({ base: 250000, currentBp: 200, newBp: 400, months: 14, annualTaxable: 3600000, regionalBp: 173, municipalBp: 80 }, T);
  assert.equal(r.extraPerMonth, 5000); // 2.500 × 2% = 50,00
  assert.equal(r.extraYear, 70000); // × 14 = 700,00
  assert.equal(r.currentDeductible, 140000); // 2.500 × 14 × (1 + 2 + 1)% = 1.400,00
  assert.equal(r.newDeductible, 210000); // × 6% = 2.100,00
  assert.equal(r.residual, 306457); // 5.164,57 − 2.100,00
  assert.equal(r.overLimit, false);
  assert.equal(r.irpefSaving, 23100); // 700 × 33% = 231,00
  assert.equal(r.surchargeSaving, 1771); // 700 × 2,53% = 17,71
  assert.equal(r.netDropPerMonth, 3350); // (700 − 231)/14 = 33,50
});

test('P2: passaggio di scaglione', () => {
  // lorda(28.300) 6.539,00 − lorda(27.600) 6.348,00 = 191,00 (300 × 33% + 400 × 23%)
  const r = simulatePension({ base: 250000, currentBp: 200, newBp: 400, months: 14, annualTaxable: 2830000 }, T);
  assert.equal(r.extraYear, 70000);
  assert.equal(r.irpefSaving, 19100);
  assert.equal(r.surchargeSaving, null);
});

test('P3: oltre il limite deducibile', () => {
  const r = simulatePension({ base: 500000, currentBp: 200, newBp: 800, months: 14, annualTaxable: 4500000 }, T);
  assert.equal(r.extraYear, 420000); // 5.000 × 14 × 6% = 4.200,00
  assert.equal(r.newDeductible, 700000); // × 10% = 7.000,00
  assert.equal(r.overLimit, true);
  assert.equal(r.residual, -183543); // 5.164,57 − 7.000,00
  assert.equal(r.deductibleExtra, 236457); // 5.164,57 − 2.800,00
  assert.equal(r.irpefSaving, 78031); // 2.364,57 × 33% = 780,3081 → 780,31
  assert.equal(r.netDropPerMonth, 24426); // (4.200 − 780,31)/14 = 244,2635 → 244,26
});

test('nuova percentuale minore di quella attuale → errore', () => {
  assert.throws(() => simulatePension({ base: 250000, currentBp: 400, newBp: 200, annualTaxable: 0 }, T), ValidationError);
});

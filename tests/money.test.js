// Test di js/money.js: importi in centesimi, quantità crypto, percentuali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEuroInput, formatEuro, formatEuroPlain, parseQtyInput, formatQty, formatQtyPlain, percentTenths, formatPercent, formatEuroSigned } from '../js/money.js';

const NB = '\u00A0';

test('parseEuroInput: esempi di §6', () => {
  assert.equal(parseEuroInput('12,50'), 1250);
  assert.equal(parseEuroInput('12.50'), 1250);
  assert.equal(parseEuroInput('1.250'), 125000);
  assert.equal(parseEuroInput('1.234,5'), 123450);
  assert.equal(parseEuroInput(' 1 234,56 '), 123456);
  assert.equal(parseEuroInput('40'), 4000);
  assert.equal(parseEuroInput('0,5'), 50);
  assert.equal(parseEuroInput(',5'), 50);
  assert.equal(parseEuroInput('1.000.000'), 100000000);
  assert.equal(parseEuroInput('1.000.000,99'), 100000099);
  assert.equal(parseEuroInput('12 €'), 1200);
  assert.equal(parseEuroInput('0.250'), null);
});

test('parseEuroInput: valori non validi → null', () => {
  for (const v of ['', ' ', 'abc', '12,345', '1,2,3', '12.5.0', '1.23.456', '-5', '12a', ',', '.', null, undefined, {}]) {
    assert.equal(parseEuroInput(v), null, String(v));
  }
});

test('parseEuroInput: negativo solo se ammesso', () => {
  assert.equal(parseEuroInput('-12,50', { allowNegative: true }), -1250);
  assert.equal(parseEuroInput('-12,50'), null);
});

test('formatEuro e formatEuroPlain', () => {
  assert.equal(formatEuro(125050), `1.250,50${NB}€`);
  assert.equal(formatEuro(0), `0,00${NB}€`);
  assert.equal(formatEuro(-4000), `-40,00${NB}€`);
  assert.equal(formatEuroSigned(4000), `+40,00${NB}€`);
  assert.equal(formatEuroPlain(125050), '1250,50');
  assert.equal(formatEuroPlain(-5), '-0,05');
});

test('quantità crypto: 8 decimali in interi', () => {
  assert.equal(parseQtyInput('0,00000001'), 1);
  assert.equal(parseQtyInput('0.05'), 5000000);
  assert.equal(parseQtyInput('1,5'), 150000000);
  assert.equal(parseQtyInput('1.250,5'), 125050000000);
  assert.equal(parseQtyInput('0,000000001'), null);
  assert.equal(parseQtyInput('-0,1'), null);
  assert.equal(parseQtyInput('-0,1', { allowNegative: true }), -10000000);
  assert.equal(formatQty(1, 'BTC'), '0,00000001 BTC');
  assert.equal(formatQty(5000000, 'BTC'), '0,05 BTC');
  assert.equal(formatQty(123456700000000), '1.234.567');
  assert.equal(formatQtyPlain(-150000000), '-1,5');
  assert.equal(formatQty(0, 'ETH'), '0 ETH');
});

test('percentuali in decimi, totale 0 → 0', () => {
  assert.equal(percentTenths(98, 100), 980);
  assert.equal(percentTenths(1, 3), 333);
  assert.equal(percentTenths(5, 0), 0);
  assert.equal(formatPercent(980), '98,0%');
  assert.equal(formatPercent(-55), '-5,5%');
});

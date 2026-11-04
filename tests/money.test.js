// Test di js/money.js: importi in centesimi, quantità crypto, percentuali.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseEuroInput, formatEuro, formatEuroPlain, parseQtyInput, formatQty, formatQtyPlain, percentTenths, formatPercent, formatEuroSigned, tradeEuroCents, parsePercentInput, formatPercentBp } from '../js/money.js';

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

test('tradeEuroCents: quantità × prezzo con arrotondamento metà in su', () => {
  // 0,01 BTC × 60.000,00 € = 1.000.000 × 6.000.000 / 1e8 = 60.000 cent
  assert.equal(tradeEuroCents(1000000, 6000000), 60000);
  // 0,00012345 × 61.234,56 € = 12.345 × 6.123.456 = 75.594.064.320 / 1e8 = 755,94 → 756
  assert.equal(tradeEuroCents(12345, 6123456), 756);
  // 0,5 × 1 cent = 0,5 → 1; 0,5 × 3 cent = 1,5 → 2
  assert.equal(tradeEuroCents(50000000, 1), 1);
  assert.equal(tradeEuroCents(50000000, 3), 2);
  // 21.000.000 BTC × 100.000.000,00 € → oltre il massimo sicuro
  assert.equal(tradeEuroCents(21000000 * 100000000, 10000000000), null);
  assert.equal(tradeEuroCents(0, 6000000), null);
  assert.equal(tradeEuroCents(-5, 6000000), null);
  assert.equal(tradeEuroCents(1000000, 0), null);
});

test('parsePercentInput e formatPercentBp: punti base interi', () => {
  assert.equal(parsePercentInput('1,73'), 173);
  assert.equal(parsePercentInput('1.73'), 173);
  assert.equal(parsePercentInput('0,8'), 80);
  assert.equal(parsePercentInput('2'), 200);
  assert.equal(parsePercentInput(' 1,73 %'), 173);
  assert.equal(parsePercentInput('10'), 1000);
  assert.equal(parsePercentInput('1,734'), null);
  assert.equal(parsePercentInput('11'), null);
  assert.equal(parsePercentInput(''), null);
  assert.equal(parsePercentInput(null), null);
  assert.equal(formatPercentBp(173), '1,73%');
  assert.equal(formatPercentBp(80), '0,80%');
});

test('v4 parsePercentInput con max: ritenuta fino al 100 %, tasso fino al 20 %', () => {
  assert.equal(parsePercentInput('26', { max: 10000 }), 2600);
  assert.equal(parsePercentInput('100', { max: 10000 }), 10000);
  assert.equal(parsePercentInput('100,01', { max: 10000 }), null);
  assert.equal(parsePercentInput('0', { max: 10000 }), 0);
  assert.equal(parsePercentInput('2,5', { max: 2000 }), 250);
  assert.equal(parsePercentInput('21', { max: 2000 }), null);
  assert.equal(parsePercentInput('100'), null, 'senza max resta al 10 %');
});

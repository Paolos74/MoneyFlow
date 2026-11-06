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

// v5: importi degli ETF, esempi E4 ed E5 del piano calcolati a mano.
import { parsePrice4Input, formatPrice4, formatPrice4Plain, etfTradeCents, proportionalCents, avgPrice4, taxCents, formatPercentSigned, formatRateBp } from '../js/money.js';

test('v5 prezzo per quota a 4 decimali: lettura e scrittura', () => {
  assert.equal(parsePrice4Input('52,1333'), 521333);
  assert.equal(parsePrice4Input('56'), 560000);
  assert.equal(parsePrice4Input('56,5'), 565000);
  assert.equal(parsePrice4Input('1.250,1234'), 12501234);
  assert.equal(parsePrice4Input('1,23456'), null);
  assert.equal(parsePrice4Input('-5'), null);
  assert.equal(parsePrice4Input('abc'), null);
  assert.equal(formatPrice4(521333), `52,1333${NB}€`);
  assert.equal(formatPrice4(585000), `58,50${NB}€`);
  assert.equal(formatPrice4(12501230), `1.250,123${NB}€`);
  assert.equal(formatPrice4Plain(500000), '50,00');
  assert.equal(formatPrice4Plain(521333), '52,1333');
});

test('v5 E4: importi, costo delle quote vendute, prezzo medio e tassa', () => {
  assert.equal(etfTradeCents(10e8, 500000), 50000); // 10 × 50,0000 = 500,00
  assert.equal(etfTradeCents(5e8, 560000), 28000); // 5 × 56,0000 = 280,00
  assert.equal(etfTradeCents(6e8, 600000), 36000); // 6 × 60,0000 = 360,00
  assert.equal(etfTradeCents(9e8, 585000), 52650); // 9 × 58,50 = 526,50
  assert.equal(etfTradeCents(0, 500000), null);
  assert.equal(proportionalCents(78200, 6e8, 15e8), 31280); // 782,00 × 6 ÷ 15 = 312,80
  assert.equal(avgPrice4(78200, 15e8), 521333); // 782,00 ÷ 15 = 52,1333
  assert.equal(avgPrice4(46920, 9e8), 521333); // 469,20 ÷ 9 = 52,1333
  assert.equal(avgPrice4(0, 0), 0);
  assert.equal(taxCents(4620, 2600), 1201); // 46,20 × 26 % = 12,012 → 12,01
});

test('v5 E5: aliquota ridotta, perdita, dividendo', () => {
  assert.equal(taxCents(4620, 1875), 866); // 8,6625 → 8,66
  assert.equal(taxCents(-2580, 2600), 0);
  assert.equal(taxCents(0, 2600), 0);
  assert.equal(taxCents(3000, 2600), 780); // 30,00 × 26 % = 7,80
});

test('v5 percentuali con segno e aliquote', () => {
  assert.equal(formatPercentSigned(480), '+48,0%');
  assert.equal(formatPercentSigned(0), '0,0%');
  assert.equal(formatPercentSigned(-34), '-3,4%');
  assert.equal(formatRateBp(2600), '26%');
  assert.equal(formatRateBp(1875), '18,75%');
  assert.equal(formatRateBp(1250), '12,50%');
  assert.equal(formatRateBp(0), '0%');
});

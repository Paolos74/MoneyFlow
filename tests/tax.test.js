// Test di js/tax.js: IRPEF 2026 su esempi calcolati a mano (i conti sono scritti nei commenti).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { irpefGross, irpefNet, workDays, employeeDeduction, extraDeduction, regionalSurcharges, estimateYear, tableFor } from '../js/tax.js';

const T = tableFor(2026);

test('A: r 30.000,00 €, 365 giorni', () => {
  // lorda 28.000 × 23% = 6.440 + 2.000 × 33% = 660 → 7.100,00
  // r4 = (50.000 − 30.000)/22.000 = 0,90909 → 0,9090; 1.910 × 0,9090 = 1.736,19 + 65 = 1.801,19
  // ulteriore 1.000,00; netta 7.100 − 1.801,19 − 1.000 = 4.298,81
  assert.deepEqual(irpefNet(3000000, 365, T), { gross: 710000, employee: 180119, extra: 100000, net: 429881 });
});

test('B: r 35.847,00 €, assunto 1/3 → 306 giorni', () => {
  // giorni: 31+30+31+30+31+31+30+31+30+31 = 306
  assert.equal(workDays(2026, '2026-03-01'), 306);
  // lorda 6.440 + 7.847 × 33% = 2.589,51 → 9.029,51
  // r4 = 14.153/22.000 = 0,6433; 1.910 × 0,6433 = 1.228,703 (niente +65: r > 35.000) × 306/365 = 1.030,0907 → 1.030,09
  // ulteriore r4 = 4.153/8.000 = 0,5191 → 519,10 × 306/365 = 435,1907 → 435,19
  // netta 9.029,51 − 1.030,09 − 435,19 = 7.564,23
  assert.deepEqual(irpefNet(3584700, 306, T), { gross: 902951, employee: 103009, extra: 43519, net: 756423 });
});

test('C: r 8.000,00 €, 100 giorni → minimo 690 €', () => {
  // 1.955 × 100/365 = 535,62 → minimo 690,00; lorda 8.000 × 23% = 1.840,00; netta 1.150,00
  assert.equal(employeeDeduction(800000, 100, T), 69000);
  assert.deepEqual(irpefNet(800000, 100, T), { gross: 184000, employee: 69000, extra: 0, net: 115000 });
});

test('D: r 60.000,00 €, nessuna detrazione', () => {
  // 6.440 + 22.000 × 33% = 7.260 + 10.000 × 43% = 4.300 → 18.000,00
  assert.deepEqual(irpefNet(6000000, 365, T), { gross: 1800000, employee: 0, extra: 0, net: 1800000 });
});

test('E: r 20.000,00 €, 365 giorni', () => {
  // lorda 4.600,00; r4 = 8.000/13.000 = 0,6153; 1.910 + 1.190 × 0,6153 = 2.642,207 → 2.642,21
  // ulteriore 0 (r non supera 20.000); netta 1.957,79
  assert.deepEqual(irpefNet(2000000, 365, T), { gross: 460000, employee: 264221, extra: 0, net: 195779 });
  assert.equal(extraDeduction(2000001, 365, T), 100000);
});

test('F: r 5.000,00 €: detrazione maggiore della lorda → netta 0 e niente addizionali', () => {
  const r = irpefNet(500000, 365, T);
  assert.equal(r.gross, 115000);
  assert.equal(r.net, 0);
  assert.deepEqual(regionalSurcharges(500000, r.net, 173, 80), { regional: 0, municipal: 0, total: 0, monthly: 0 });
});

test('giorni di lavoro nell\'anno', () => {
  assert.equal(workDays(2026, null), 365);
  assert.equal(workDays(2028, null), 365); // bisestile: massimo 365
  assert.equal(workDays(2026, '2027-01-10'), 0);
  assert.equal(workDays(2026, '2020-05-01'), 365);
  assert.equal(workDays(2026, '2026-12-31'), 1);
  assert.equal(irpefGross(0, T), 0);
});

const G = {
  year: 2026, hireDate: '2026-03-01', regionalBp: 173, municipalBp: 80,
  months: [{ ym: '2026-03', taxable: 350000, irpef: 80000 }, { ym: '2026-04', taxable: 370000, irpef: 86000 }],
};

test('stima G: proiezione con la media dei mesi registrati, rimborso e addizionali', () => {
  const e = estimateYear(G);
  // lavorati 10 (marzo–dicembre), registrati 2, mancanti 8
  assert.equal(e.worked, 10);
  assert.equal(e.registered, 2);
  assert.equal(e.missing, 8);
  assert.equal(e.days, 306);
  // imponibile 7.200 + 8 × 3.600 = 36.000,00; trattenuta 1.660 + 8 × 830 = 8.300,00
  assert.equal(e.perMonthTaxable, 360000);
  assert.equal(e.perMonthIrpef, 83000);
  assert.equal(e.annualTaxable, 3600000);
  assert.equal(e.withheld, 830000);
  // lorda 6.440 + 8.000 × 33% = 9.080,00
  assert.equal(e.gross, 908000);
  // r4 = 14.000/22.000 = 0,6363; 1.910 × 0,6363 = 1.215,333 × 306/365 = 1.018,8819 → 1.018,88
  assert.equal(e.employee, 101888);
  // ulteriore r4 = 0,5000 → 500 × 306/365 = 419,178 → 419,18
  assert.equal(e.extra, 41918);
  // netta 9.080 − 1.018,88 − 419,18 = 7.641,94; conguaglio 7.641,94 − 8.300,00 = −658,06 (rimborso)
  assert.equal(e.net, 764194);
  assert.equal(e.balance, -65806);
  // addizionali: 36.000 × 1,73% = 622,80; × 0,80% = 288,00; totale 910,80; rata 910,80/11 = 82,80
  assert.deepEqual(e.surcharges, { regional: 62280, municipal: 28800, total: 91080, monthly: 8280 });
  assert.equal(e.outlier, false);
});

test('stima H: proiezione scritta a mano (3.000,00 imponibile e 700,00 IRPEF per mese)', () => {
  const e = estimateYear({ ...G, projTaxable: 300000, projIrpef: 70000 });
  // imponibile 7.200 + 8 × 3.000 = 31.200,00; trattenuta 1.660 + 8 × 700 = 7.260,00
  assert.equal(e.annualTaxable, 3120000);
  assert.equal(e.withheld, 726000);
  // lorda 6.440 + 3.200 × 33% = 7.496,00
  assert.equal(e.gross, 749600);
  // r4 = 18.800/22.000 = 0,8545; (1.910 × 0,8545 = 1.632,095 + 65) × 306/365 = 1.422,770 → 1.422,77
  assert.equal(e.employee, 142277);
  // ulteriore 1.000 × 306/365 = 838,356 → 838,36
  assert.equal(e.extra, 83836);
  // netta 5.234,87; conguaglio 5.234,87 − 7.260,00 = −2.025,13
  assert.equal(e.net, 523487);
  assert.equal(e.balance, -202513);
  assert.equal(e.manualTaxable, true);
});

test('avviso per un mese molto più alto, anni senza tabella, nessun mese', () => {
  // mediana 3.700; 9.900 > 1,5 × 3.700 = 5.550
  const months = [{ ym: '2026-03', taxable: 350000, irpef: 0 }, { ym: '2026-04', taxable: 370000, irpef: 0 }, { ym: '2026-05', taxable: 990000, irpef: 0 }];
  assert.equal(estimateYear({ year: 2026, months }).outlier, true);
  assert.deepEqual(estimateYear({ year: 2025, months }), { available: false, year: 2025 });
  assert.deepEqual(estimateYear({ year: 2026, months: [] }), { available: true, empty: true, year: 2026 });
  // addizionali senza percentuali
  assert.deepEqual(estimateYear({ ...G, regionalBp: null, municipalBp: null }).surcharges, { regional: null, municipal: null, total: null, monthly: null });
});

// Stima dell'IRPEF annua di un lavoratore dipendente: scaglioni, detrazioni, conguaglio, addizionali.
// Funzioni pure, tutti gli importi in centesimi interi, percentuali in punti base. È una stima, non un 730.

import { TAX_TABLES } from './tax-tables.js';
import { diffDays, toISO, parseISO } from './dates.js';

export { TAX_TABLES };

export const tableFor = (year) => TAX_TABLES[year] || null;

// Divisione di interi ≥ 0 con arrotondamento "metà in su" (un solo arrotondamento per ogni importo).
function divRound(n, d) {
  return Math.floor((2 * n + d) / (2 * d));
}

// Rapporto (limite − r)/ampiezza troncato alla 4ª cifra decimale (TUIR art. 13 c. 6), come intero 0–10000.
function ratio4(limit, r, width) {
  return Math.floor(((limit - r) * 10000) / width);
}

// Imposta lorda: TUIR art. 11 c. 1, aliquota di ogni scaglione sulla sola parte di reddito che vi rientra.
export function irpefGross(r, t) {
  let rest = Math.max(0, r);
  let low = 0;
  let sum = 0; // centesimi × punti base
  for (const b of t.brackets) {
    const top = b.upTo === null ? Infinity : b.upTo;
    const part = Math.min(rest, top - low);
    if (part <= 0) break;
    sum += part * b.rateBp;
    rest -= part;
    low = top;
  }
  return divRound(sum, 10000);
}

// Giorni di lavoro nell'anno per rapportare le detrazioni (TUIR art. 13 c. 1: "rapportata al periodo di lavoro"):
// dalla data di inizio rapporto (o dal 1° gennaio) al 31 dicembre compresi, al massimo 365.
export function workDays(year, hireDate, t = tableFor(year)) {
  const base = t?.daysBase ?? 365;
  const first = toISO(year, 1, 1);
  const last = toISO(year, 12, 31);
  let start = first;
  if (hireDate && parseISO(hireDate)) {
    if (hireDate > last) return 0;
    if (hireDate > first) start = hireDate;
  }
  return Math.min(base, diffDays(start, last) + 1);
}

// Detrazione per lavoro dipendente (TUIR art. 13 c. 1 e c. 1.1), rapportata ai giorni (days/365).
// Il minimo di 690 € (c. 1 lett. a, tempo indeterminato) si applica dopo il rapporto ai giorni (scelta P10).
export function employeeDeduction(r, days, t) {
  const e = t.employee;
  if (days <= 0 || r > e.high) return 0;
  let num; // centesimi × 1e-4
  if (r <= e.low) num = e.lowAmount * 10000;
  else if (r <= e.mid) num = e.midBase * 10000 + e.midExtra * ratio4(e.mid, r, e.mid - e.low);
  else num = e.midBase * ratio4(e.high, r, e.high - e.mid);
  if (r > e.bonusFrom && r <= e.bonusTo) num += e.bonus * 10000; // c. 1.1: +65 €
  let amount = divRound(num * days, t.daysBase * 10000);
  if (r <= e.low) amount = Math.max(amount, e.minAmount);
  return amount;
}

// Ulteriore detrazione (L. 207/2024 art. 1 c. 6): 1.000 € tra 20.000 e 32.000 €, poi a scalare fino a 40.000 €.
// Rapportata ai giorni come la detrazione dell'art. 13 (scelta P11).
export function extraDeduction(r, days, t) {
  const x = t.extra;
  if (days <= 0 || r <= x.from || r > x.to) return 0;
  const num = r <= x.full ? x.amount * 10000 : x.amount * ratio4(x.to, r, x.to - x.full);
  return divRound(num * days, t.daysBase * 10000);
}

// IRPEF netta = lorda − detrazioni, mai sotto zero (le detrazioni non generano rimborsi: TUIR art. 13).
export function irpefNet(r, days, t) {
  const gross = irpefGross(r, t);
  const employee = employeeDeduction(r, days, t);
  const extra = extraDeduction(r, days, t);
  return { gross, employee, extra, net: Math.max(0, gross - employee - extra) };
}

// Addizionali regionale (D.Lgs. 446/1997 art. 50) e comunale (D.Lgs. 360/1998 art. 1) sull'imponibile IRPEF;
// non dovute se l'IRPEF netta è zero (art. 50 c. 3 e art. 1 c. 4). Aliquota unica scelta dall'utente (scelta P14).
// Trattenute in 11 rate l'anno dopo (da gennaio a novembre).
export function regionalSurcharges(r, net, regionalBp, municipalBp) {
  const calc = (bp) => (bp === null || bp === undefined ? null : net > 0 ? divRound(Math.max(0, r) * bp, 10000) : 0);
  const regional = calc(regionalBp);
  const municipal = calc(municipalBp);
  const total = regional === null && municipal === null ? null : (regional || 0) + (municipal || 0);
  return { regional, municipal, total, monthly: total === null ? null : divRound(total, 11) };
}

function median(values) {
  const v = [...values].sort((a, b) => a - b);
  const n = v.length;
  return n % 2 ? v[(n - 1) / 2] : (v[n / 2 - 1] + v[n / 2]) / 2;
}

// Stima dell'anno dalle buste registrate (months = [{ ym, taxable, irpef }] da salaryYear).
// Mesi mancanti = mesi lavorati (dal mese di inizio rapporto a dicembre) − mesi registrati; valgono come la media
// dei mesi registrati oppure come i valori scritti a mano (projTaxable/projIrpef per ogni mese mancante).
export function estimateYear({ year, months = [], hireDate = null, projTaxable = null, projIrpef = null, regionalBp = null, municipalBp = null }) {
  const t = tableFor(year);
  if (!t) return { available: false, year };
  const registered = months.length;
  if (!registered) return { available: true, empty: true, year };
  let worked = 12;
  const h = hireDate ? parseISO(hireDate) : null;
  if (h && h.y > year) worked = 0;
  else if (h && h.y === year) worked = 13 - h.m;
  const missing = Math.max(0, worked - registered);
  const sumTaxable = months.reduce((s, m) => s + m.taxable, 0);
  const sumIrpef = months.reduce((s, m) => s + (m.irpef || 0), 0);
  const avgTaxable = divRound(sumTaxable, registered);
  const avgIrpef = divRound(sumIrpef, registered);
  const manualTaxable = projTaxable !== null && projTaxable !== undefined;
  const manualIrpef = projIrpef !== null && projIrpef !== undefined;
  const projectedTaxable = manualTaxable ? projTaxable * missing : divRound(sumTaxable * missing, registered);
  const projectedIrpef = manualIrpef ? projIrpef * missing : divRound(sumIrpef * missing, registered);
  const annualTaxable = sumTaxable + projectedTaxable;
  const withheld = sumIrpef + projectedIrpef;
  const days = workDays(year, hireDate, t);
  const irpef = irpefNet(annualTaxable, days, t);
  const med = median(months.map((m) => m.taxable));
  const outlier = registered > 1 && months.some((m) => m.taxable > med * 1.5);
  return {
    available: true, empty: false, year,
    worked, registered, missing, days,
    sumTaxable, sumIrpef, avgTaxable, avgIrpef,
    perMonthTaxable: manualTaxable ? projTaxable : avgTaxable,
    perMonthIrpef: manualIrpef ? projIrpef : avgIrpef,
    manualTaxable, manualIrpef,
    projectedTaxable, projectedIrpef,
    annualTaxable, withheld,
    ...irpef,
    balance: irpef.net - withheld, // > 0 da pagare, < 0 rimborso
    surcharges: regionalSurcharges(annualTaxable, irpef.net, regionalBp, municipalBp),
    outlier,
  };
}

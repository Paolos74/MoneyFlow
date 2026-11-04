// Periodo di budget (mese di calendario o dallo stipendio), "quanto ti resta" e "puoi spendere oggi" (v4). Funzioni pure.

import { monthOf, monthStart, monthEnd, addDays, diffDays, addMonthsClamped } from './dates.js';
import * as C from './calc.js';

export const PERIOD_MODES = ['calendar', 'salary'];

// Periodo che contiene `date`.
// - 'calendar': il mese di `date`.
// - 'salary': dall'ultimo stipendio registrato (entrata con C.isSalary, data ≤ date) al giorno prima del primo stipendio
//   registrato dopo `date`; se non c'è, al giorno prima di "inizio + 1 mese" (fine stimata, ridotta a fine mese).
//   Se lo stipendio è in ritardo e `date` supera la fine stimata, il periodo arriva a `date`.
//   Senza stipendi registrati: mese di calendario con mode 'calendar-fallback'.
export function budgetPeriod(state, date, mode = 'calendar') {
  const ym = monthOf(date);
  const calendar = (m) => ({ from: monthStart(ym), to: monthEnd(ym), mode: m, salaryDate: null, estimatedEnd: false });
  if (mode !== 'salary') return calendar('calendar');
  let last = null;
  let next = null;
  for (const m of state.movements) {
    if (m.deleted || !C.isSalary(state, m)) continue;
    if (m.date <= date) { if (!last || m.date > last) last = m.date; }
    else if (!next || m.date < next) next = m.date;
  }
  if (!last) return calendar('calendar-fallback');
  if (next) return { from: last, to: addDays(next, -1), mode: 'salary', salaryDate: last, estimatedEnd: false };
  let to = addDays(addMonthsClamped(last, 1), -1);
  if (date > to) to = date;
  return { from: last, to, mode: 'salary', salaryDate: last, estimatedEnd: true };
}

// Quanto ti resta nel periodo = entrate contate − uscite contate − uscite programmate ancora da pagare nel periodo
// (anche quelle scadute e da confermare). Stesse regole del cash flow: restituzioni, trasferimenti e variazioni esclusi;
// entrate programmate non contate (prudenza).
// Puoi spendere oggi = rimanente / giorni da oggi alla fine del periodo compresi, per difetto al centesimo; 0 se ≤ 0.
export function remaining(state, period, today) {
  const t = C.totals(state, period.from, period.to);
  const planned = C.plannedBetween(state, period.from, period.to, today)
    .filter((p) => p.sched.type === 'uscita')
    .reduce((sum, p) => sum + p.sched.amount, 0);
  const left = t.income - t.expense - planned;
  const daysLeft = Math.max(1, diffDays(today, period.to) + 1);
  const perDay = left > 0 ? Math.floor(left / daysLeft) : 0;
  return { income: t.income, expense: t.expense, planned, left, daysLeft, perDay };
}

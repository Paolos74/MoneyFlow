// Periodo di budget (mese di calendario o dallo stipendio), "quanto ti resta" e "puoi spendere oggi" (v4),
// v5: rimanente sul budget complessivo, colore progressivo e "Quanto metti da parte". Funzioni pure.

import { monthOf, monthStart, monthEnd, addDays, diffDays, addMonthsClamped } from './dates.js';
import * as C from './calc.js';
import { percentTenths } from './money.js';

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

// Quanto ti resta nel periodo (v5, decisione v5 §1):
// - mode 'budget', se almeno una categoria di uscita non eliminata ha un budget:
//   rimanente = somma dei budget − TUTTE le uscite contate del periodo (anche di categorie senza budget).
//   spentTenths = uscite ÷ budget in decimi di punto; over = rimanente < 0 ("Hai sforato di …").
//   Es. E1: budget Spesa 300,00 + Svago 200,00 = 500,00; uscite contate 120,00 + 80,00 + (50,00 − 10,00 esclusi)
//   = 240,00 → resta 260,00 €, speso 48,0 %; con 10 giorni compreso oggi puoi spendere 26,00 € al giorno.
// - mode 'cashflow', senza budget: come la v4, entrate contate − uscite contate − uscite programmate ancora da
//   pagare nel periodo (anche quelle scadute e da confermare); entrate programmate non contate (prudenza).
// In entrambi i modi restituzioni, trasferimenti (Compra/Vendi compresi) e variazioni non contano.
// Puoi spendere oggi = rimanente / giorni da oggi alla fine del periodo compresi, per difetto al centesimo; 0 se ≤ 0
// (es. 260,00 ÷ 7 giorni = 37,142… → 37,14 €).
export function remaining(state, period, today) {
  const t = C.totals(state, period.from, period.to);
  const planned = C.plannedBetween(state, period.from, period.to, today)
    .filter((p) => p.sched.type === 'uscita')
    .reduce((sum, p) => sum + p.sched.amount, 0);
  const daysLeft = Math.max(1, diffDays(today, period.to) + 1);
  const perDayOf = (left) => (left > 0 ? Math.floor(left / daysLeft) : 0);
  const budget = state.categories.filter((c) => !c.deleted && c.type === 'uscita' && c.budget).reduce((s, c) => s + c.budget, 0);
  if (budget > 0) {
    const left = budget - t.expense;
    return {
      mode: 'budget', budget, income: t.income, expense: t.expense, planned, left, daysLeft, perDay: perDayOf(left),
      spentTenths: percentTenths(t.expense, budget), over: left < 0,
    };
  }
  const left = t.income - t.expense - planned;
  return { mode: 'cashflow', income: t.income, expense: t.expense, planned, left, daysLeft, perDay: perDayOf(left) };
}

// Colore progressivo (design v5 §3.2): tappe --prog-0 verde (0 %), --prog-1 giallo (50 %), --prog-2 arancio (85 %),
// --prog-3 rosso (≥ 100 %). mix = peso in percentuale intera della tappa di arrivo nel tratto.
// Es. 48,0 % → { from: 0, to: 1, mix: 96 }; 57,0 % → { 1, 2, 20 }; 92,0 % → { 2, 3, 47 }; 112,0 % → { 3, 3, 0 }.
export function progressStop(spentTenths) {
  const p = Math.max(0, spentTenths || 0);
  if (p < 500) return { from: 0, to: 1, mix: Math.round((p * 100) / 500) };
  if (p < 850) return { from: 1, to: 2, mix: Math.round(((p - 500) * 100) / 350) };
  if (p < 1000) return { from: 2, to: 3, mix: Math.round(((p - 850) * 100) / 150) };
  return { from: 3, to: 3, mix: 0 };
}

// "Quanto metti da parte" (decisione v5 §2 e risposte 1–3):
// - net = entrate contate − uscite contate del periodo (cash flow), rate = tasso di risparmio in decimi;
// - goals = somma con segno del registro `log` degli obiettivi non eliminati nel mese in cui inizia il periodo
//   (con il periodo dallo stipendio dal 27/10 al 26/11 conta ottobre);
// - moved = netto spostato verso deposito e investimenti nel periodo: trasferimenti senza Compra/Vendi da un conto
//   non deposito a un deposito, meno quelli dal deposito verso un conto non deposito, più Compra ETF (euro pagati)
//   meno Vendi ETF (euro arrivati sul conto). Compra/Vendi di crypto esclusi.
// Es. E3: 2.000,00 + 30,00 − 240,00 = 1.790,00 €; obiettivi 150,00 + 50,00 = 200,00 €;
//   500,00 − 100,00 + 501,00 + 281,00 − 346,99 = 835,01 €.
export function savedInPeriod(state, period) {
  const t = C.totals(state, period.from, period.to);
  const ym = monthOf(period.from);
  const goals = state.goals.filter((g) => !g.deleted).reduce((s, g) => s + (Number.isSafeInteger(g.log?.[ym]) ? g.log[ym] : 0), 0);
  const isDeposit = (id) => !!state.accounts.find((a) => a.id === id)?.deposit;
  let moved = 0;
  for (const m of state.movements) {
    if (m.deleted || m.type !== 'trasferimento' || m.date < period.from || m.date > period.to) continue;
    if (m.etfId) {
      if (m.trade === 'compra') moved += m.amount;
      else if (m.trade === 'vendi') moved -= m.amountTo || 0;
      continue;
    }
    if (m.trade) continue;
    const toDep = isDeposit(m.toAccountId);
    const fromDep = isDeposit(m.accountId);
    if (toDep && !fromDep) moved += m.amountTo ?? m.amount;
    else if (fromDep && !toDep) moved -= m.amount;
  }
  return { income: t.income, expense: t.expense, net: t.net, rate: t.rate, goals, moved };
}

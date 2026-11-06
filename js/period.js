// Periodo di budget (mese di calendario o dallo stipendio), "quanto ti resta" e "puoi spendere oggi" (v4),
// v5: rimanente sul budget complessivo, colore progressivo e "Quanto metti da parte" (v7: meno i programmati
// da pagare). Funzioni pure.

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

// Quanto ti resta nel periodo (v5, decisione v5 §1; v6, decisione v6 §1):
// - planned = uscite programmate ancora da pagare nel periodo: occorrenze con data nel periodo non confermate né
//   saltate (anche quelle scadute e "da confermare"), di qualunque categoria, anche senza budget. Entrate e
//   trasferimenti programmati non contano. Un programmato confermato è già un'uscita e non è più da pagare.
//   È lo stesso insieme nei due modi qui sotto.
// - mode 'budget', se almeno una categoria di uscita non eliminata ha un budget (v6):
//   rimanente = somma dei budget − TUTTE le uscite contate del periodo − planned.
//   used = uscite + planned; spentTenths = used ÷ budget in decimi di punto; over = rimanente < 0 ("Hai sforato di …").
//   Es. E1 (v5, nessun programmato): budget Spesa 300,00 + Svago 200,00 = 500,00; uscite contate 120,00 + 80,00 +
//   (50,00 − 10,00 esclusi) = 240,00 → resta 260,00 €, speso 48,0 %; con 10 giorni puoi spendere 26,00 € al giorno.
//   Es. E6 (v6): E1 + un programmato confermato da 10,00 (uscite 250,00) + programmati da pagare 60,00 (futuro) e
//   15,00 (scaduto, da confermare) = 75,00 → resta 500,00 − 250,00 − 75,00 = 175,00 €, usato 325 ÷ 500 = 65,0 %,
//   17,50 € al giorno per 10 giorni.
// - mode 'cashflow', senza budget: come la v4, entrate contate − uscite contate − planned; entrate programmate non
//   contate (prudenza).
// In entrambi i modi restituzioni, trasferimenti (Compra/Vendi compresi) e variazioni non contano.
// Puoi spendere oggi = rimanente / giorni da oggi alla fine del periodo compresi, per difetto al centesimo; 0 se ≤ 0
// (es. 260,00 ÷ 7 giorni = 37,142… → 37,14 €).
// Uscite programmate ancora da pagare nel periodo (v4, usate da remaining e, dalla v7, da savedInPeriod).
function plannedExpense(state, period, today) {
  return C.plannedBetween(state, period.from, period.to, today)
    .filter((p) => p.sched.type === 'uscita')
    .reduce((sum, p) => sum + p.sched.amount, 0);
}

export function remaining(state, period, today) {
  const t = C.totals(state, period.from, period.to);
  const planned = plannedExpense(state, period, today);
  const daysLeft = Math.max(1, diffDays(today, period.to) + 1);
  const perDayOf = (left) => (left > 0 ? Math.floor(left / daysLeft) : 0);
  const budget = state.categories.filter((c) => !c.deleted && c.type === 'uscita' && c.budget).reduce((s, c) => s + c.budget, 0);
  if (budget > 0) {
    const used = t.expense + planned;
    const left = budget - used;
    return {
      mode: 'budget', budget, income: t.income, expense: t.expense, planned, used, left, daysLeft, perDay: perDayOf(left),
      spentTenths: percentTenths(used, budget), over: left < 0,
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

// "Quanto metti da parte" (decisione v5 §2 e risposte 1–3; v7, decisione v7 §3):
// - planned = uscite programmate ancora da pagare nel periodo, lo stesso insieme di remaining() (scadute "da
//   confermare" comprese, confermate già tra le uscite, saltate escluse; entrate e trasferimenti programmati no).
//   Senza `today` planned = 0 (calcolo della v5/v6).
// - net = entrate contate − uscite contate − planned: stima a fine periodo di quanto metti da parte.
//   rate = tasso di risparmio sulle entrate con le uscite + planned, in decimi (entrate 0 → 0).
//   Statistiche e CSV restano sui soli movimenti registrati.
// - goals = somma con segno del registro `log` degli obiettivi non eliminati nel mese in cui inizia il periodo
//   (con il periodo dallo stipendio dal 27/10 al 26/11 conta ottobre);
// - moved = netto spostato verso deposito e investimenti nel periodo: trasferimenti senza Compra/Vendi da un conto
//   non deposito a un deposito, meno quelli dal deposito verso un conto non deposito, più Compra ETF (euro pagati)
//   meno Vendi ETF (euro arrivati sul conto). Compra/Vendi di crypto esclusi.
// Es. E3: 2.000,00 + 30,00 − 240,00 = 1.790,00 €; obiettivi 150,00 + 50,00 = 200,00 €;
//   500,00 − 100,00 + 501,00 + 281,00 − 346,99 = 835,01 €.
// Es. E7 (v7): E3 con oggi 21/11 e programmati Bollette 60,00 il 25/11 (futuro) e Abbonamenti 15,00 il 18/11
//   (scaduto, da confermare) → 1.790,00 − 75,00 = 1.715,00 €, tasso 1.715 ÷ 2.030 = 84,48… → 84,5 %.
export function savedInPeriod(state, period, today) {
  const t = C.totals(state, period.from, period.to);
  const planned = today ? plannedExpense(state, period, today) : 0;
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
  return { income: t.income, expense: t.expense, planned, net: t.income - t.expense - planned, rate: C.savingsRate(t.income, t.expense + planned), goals, moved };
}

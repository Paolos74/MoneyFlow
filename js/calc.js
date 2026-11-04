// Calcoli puri su uno stato dello store: saldi, patrimonio, aggregati, crediti, obiettivi.
// Le uscite contano al netto della quota esclusa; trasferimenti e restituzioni non sono entrate.

import { formatEuro, formatEuroPlain, formatQty, percentTenths } from './money.js';
import { monthEnd, monthStart, monthOf, startOfIsoWeek, addDays, toISO, parseISO } from './dates.js';
import { pendingOccurrences, occurrences, yearlyAmount, nextOccurrence } from './recurrence.js';

const live = (list) => list.filter((r) => !r.deleted);
const byId = (list, id) => list.find((r) => r.id === id) || null;

export const UNKNOWN_ACCOUNT = 'Conto sconosciuto';
export const UNKNOWN_CATEGORY = 'Senza categoria';
export const NEUTRAL_COLOR = '#8E8E93';

export function sortedAccounts(state) {
  return live(state.accounts).sort((a, b) => (a.order - b.order) || a.createdAt - b.createdAt);
}

export function sortedCategories(state, type) {
  return live(state.categories).filter((c) => c.type === type).sort((a, b) => (a.order - b.order) || a.createdAt - b.createdAt);
}

export function accountLabel(state, id) {
  const a = byId(state.accounts, id);
  if (!a) return UNKNOWN_ACCOUNT;
  return a.deleted ? `${a.name} (eliminato)` : a.name;
}

export function categoryLabel(state, id) {
  const c = byId(state.categories, id);
  if (!c) return UNKNOWN_CATEGORY;
  return c.deleted ? `${c.name} (eliminata)` : c.name;
}

export function categoryColor(state, id) {
  return byId(state.categories, id)?.color || NEUTRAL_COLOR;
}

// Colore che rappresenta un movimento (categoria, oppure conto per trasferimenti e variazioni).
export function movementColor(state, m) {
  if (m.type === 'uscita' || m.type === 'entrata') return categoryColor(state, m.categoryId);
  if (m.type === 'restituzione') {
    const exp = byId(state.movements, m.refundOf);
    return exp ? categoryColor(state, exp.categoryId) : NEUTRAL_COLOR;
  }
  return byId(state.accounts, m.accountId)?.color || NEUTRAL_COLOR;
}

export const countedExpense = (m) => m.amount - (m.excluded || 0);

export function isEurAccount(state, id) {
  const a = byId(state.accounts, id);
  return !a || a.kind !== 'crypto';
}

// Effetto di un movimento sul saldo di un conto (nell'unità del conto).
export function movementEffect(m, accountId) {
  let v = 0;
  if (m.accountId === accountId) {
    if (m.type === 'uscita' || m.type === 'trasferimento') v -= m.amount;
    else v += m.amount;
  }
  if (m.type === 'trasferimento' && m.toAccountId === accountId) v += m.amountTo ?? m.amount;
  return v;
}

export function accountBalance(state, accountId, upTo = null) {
  const acc = byId(state.accounts, accountId);
  let b = acc ? acc.initial || 0 : 0;
  for (const m of state.movements) {
    if (m.deleted || (upTo && m.date > upTo)) continue;
    if (m.accountId === accountId || m.toAccountId === accountId) b += movementEffect(m, accountId);
  }
  return b;
}

export function balances(state, upTo = null) {
  const map = new Map();
  for (const a of state.accounts) map.set(a.id, a.initial || 0);
  for (const m of state.movements) {
    if (m.deleted || (upTo && m.date > upTo)) continue;
    for (const id of [m.accountId, m.toAccountId]) {
      if (id && map.has(id)) map.set(id, map.get(id) + movementEffect(m, id));
      if (m.accountId === m.toAccountId) break;
    }
  }
  return map;
}

// Patrimonio: somma in euro dei soli conti in euro; le crypto restano come quantità (scelta provvisoria).
export function netWorth(state, upTo = null) {
  const bal = balances(state, upTo);
  let eurCents = 0;
  const crypto = new Map();
  for (const a of live(state.accounts)) {
    const b = bal.get(a.id) || 0;
    if (a.kind === 'crypto') crypto.set(a.asset, (crypto.get(a.asset) || 0) + b);
    else eurCents += b;
  }
  return {
    eurCents,
    crypto: [...crypto.entries()].map(([asset, units]) => ({ asset, units })).sort((a, b) => a.asset.localeCompare(b.asset)),
  };
}

export function cryptoLine(nw) {
  return nw.crypto.map((c) => formatQty(c.units, c.asset)).join(' · ');
}

export function netWorthSeries(state, months) {
  return months.map((ym) => ({ month: ym, eurCents: netWorth(state, monthEnd(ym)).eurCents }));
}

function inRange(m, from, to) {
  return !m.deleted && m.date >= from && m.date <= to;
}

export function totals(state, from, to) {
  let income = 0;
  let expense = 0;
  for (const m of state.movements) {
    if (!inRange(m, from, to)) continue;
    if (m.type === 'entrata') income += m.amount;
    else if (m.type === 'uscita') expense += countedExpense(m);
  }
  return { income, expense, net: income - expense, rate: savingsRate(income, expense) };
}

// Tasso di risparmio in decimi interi; con entrate 0 vale 0.
export function savingsRate(income, expense) {
  return percentTenths(income - expense, income);
}

export function byCategory(state, from, to, type = 'uscita') {
  const map = new Map();
  for (const m of state.movements) {
    if (!inRange(m, from, to) || m.type !== type) continue;
    const v = type === 'uscita' ? countedExpense(m) : m.amount;
    if (!v) continue;
    map.set(m.categoryId, (map.get(m.categoryId) || 0) + v);
  }
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([categoryId, value]) => ({ categoryId, label: categoryLabel(state, categoryId), color: categoryColor(state, categoryId), value, pct: percentTenths(value, total) }))
    .sort((a, b) => b.value - a.value);
}

export function byMonth(state, months) {
  return months.map((ym) => ({ month: ym, ...totals(state, monthStart(ym), monthEnd(ym)) }));
}

export function budgetStatus(state, ym) {
  const from = monthStart(ym);
  const to = monthEnd(ym);
  return live(state.categories)
    .filter((c) => c.type === 'uscita' && c.budget)
    .sort((a, b) => (a.order - b.order) || a.createdAt - b.createdAt)
    .map((c) => {
      let spent = 0;
      for (const m of state.movements) if (inRange(m, from, to) && m.type === 'uscita' && m.categoryId === c.id) spent += countedExpense(m);
      return { category: c, budget: c.budget, spent, left: c.budget - spent, pct: percentTenths(spent, c.budget), over: spent > c.budget };
    });
}

export function refundsOf(state, expenseId) {
  return state.movements.filter((m) => !m.deleted && m.type === 'restituzione' && m.refundOf === expenseId);
}

export function refundedOf(state, expenseId) {
  return refundsOf(state, expenseId).reduce((t, m) => t + m.amount, 0);
}

// Crediti aperti ("Da ricevere"): quota esclusa meno restituzioni, sulle spese non eliminate.
export function openCredits(state) {
  const items = [];
  for (const m of state.movements) {
    if (m.deleted || m.type !== 'uscita' || !m.excluded) continue;
    const refunded = refundedOf(state, m.id);
    const residual = m.excluded - refunded;
    if (residual > 0) items.push({ movement: m, excluded: m.excluded, refunded, residual });
  }
  items.sort((a, b) => (b.movement.date.localeCompare(a.movement.date)) || b.movement.createdAt - a.movement.createdAt);
  return { items, total: items.reduce((t, i) => t + i.residual, 0) };
}

export function residualOf(state, expense) {
  return (expense.excluded || 0) - refundedOf(state, expense.id);
}

// Avanzamento obiettivo; quota mensile = residuo / mesi rimasti (mese corrente incluso), per eccesso.
export function goalProgress(goal, today) {
  const remaining = Math.max(0, goal.target - goal.saved);
  const res = { saved: goal.saved, target: goal.target, remaining, pct: Math.min(1000, percentTenths(goal.saved, goal.target)), done: remaining === 0, monthly: null, monthsLeft: null, expired: false };
  if (goal.deadline && !res.done) {
    const d = parseISO(goal.deadline);
    const t = parseISO(today);
    if (goal.deadline < today) res.expired = true;
    else {
      res.monthsLeft = (d.y * 12 + d.m) - (t.y * 12 + t.m) + 1;
      res.monthly = Math.ceil(remaining / res.monthsLeft);
    }
  }
  return res;
}

// Riepilogo abbonamenti e ricorrenti (solo uscite ripetute, non terminate).
export function recurringSummary(state, today) {
  const items = live(state.scheduled)
    .filter((s) => s.type === 'uscita' && s.freq !== 'once' && (!s.end || s.end >= today))
    .map((s) => { const yearly = yearlyAmount(s); return { sched: s, yearly, monthly: Math.round(yearly / 12) }; })
    .sort((a, b) => b.yearly - a.yearly);
  const yearly = items.reduce((t, i) => t + i.yearly, 0);
  return { items, yearly, monthly: Math.round(yearly / 12) };
}

export function isSalary(state, m) {
  if (m.type !== 'entrata') return false;
  if (m.gross !== null && m.gross !== undefined) return true;
  return byId(state.categories, m.categoryId)?.role === 'stipendio';
}

// Stipendi dell'anno: righe e totali (lordo e trattenute solo dove il lordo c'è).
export function salaryYear(state, year) {
  const from = toISO(year, 1, 1);
  const to = toISO(year, 12, 31);
  const rows = state.movements
    .filter((m) => inRange(m, from, to) && isSalary(state, m))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((m) => ({ movement: m, net: m.amount, gross: m.gross ?? null, withheld: m.gross != null ? m.gross - m.amount : null }));
  const withGross = rows.filter((r) => r.gross !== null);
  return {
    rows,
    net: rows.reduce((t, r) => t + r.net, 0),
    netWithGross: withGross.reduce((t, r) => t + r.net, 0),
    gross: withGross.reduce((t, r) => t + r.gross, 0),
    withheld: withGross.reduce((t, r) => t + r.withheld, 0),
    missing: rows.length - withGross.length,
  };
}

export function salaryYears(state, currentYear) {
  const years = new Set([currentYear]);
  for (const m of state.movements) if (!m.deleted && isSalary(state, m)) years.add(Number(m.date.slice(0, 4)));
  return [...years].sort((a, b) => a - b);
}

// Voci recenti per il pulsante +: combinazioni distinte, mai l'importo.
export function recentTemplates(state, n = 6) {
  const out = [];
  const seen = new Set();
  const ok = (list, id) => { const r = byId(list, id); return r && !r.deleted; };
  const sorted = state.movements.filter((m) => !m.deleted && ['uscita', 'entrata', 'trasferimento'].includes(m.type))
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const m of sorted) {
    if (!ok(state.accounts, m.accountId)) continue;
    if (m.type === 'trasferimento' ? !ok(state.accounts, m.toAccountId) : !ok(state.categories, m.categoryId)) continue;
    const key = [m.type, m.accountId, m.toAccountId, m.categoryId, m.description.toLocaleLowerCase('it')].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ type: m.type, accountId: m.accountId, toAccountId: m.toAccountId, categoryId: m.categoryId, description: m.description });
    if (out.length >= n) break;
  }
  return out;
}

export function templateLabel(state, t) {
  if (t.description) return t.description;
  if (t.type === 'trasferimento') return `${accountLabel(state, t.accountId)} → ${accountLabel(state, t.toAccountId)}`;
  return categoryLabel(state, t.categoryId);
}

const sortMovs = (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt;

// Ricerca e filtri dei movimenti (descrizione, note, conti, categoria, importo).
export function searchMovements(state, { from, to, accountId, categoryId, q } = {}) {
  const needle = (q || '').trim().toLocaleLowerCase('it');
  return state.movements.filter((m) => {
    if (m.deleted) return false;
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (accountId && m.accountId !== accountId && m.toAccountId !== accountId) return false;
    if (categoryId && m.categoryId !== categoryId) return false;
    if (!needle) return true;
    const hay = [m.description, m.note, accountLabel(state, m.accountId), m.toAccountId ? accountLabel(state, m.toAccountId) : '',
      m.categoryId ? categoryLabel(state, m.categoryId) : '', formatEuro(m.amount), formatEuroPlain(m.amount)].join(' ').toLocaleLowerCase('it');
    return hay.includes(needle);
  }).sort(sortMovs);
}

// Effetto in euro sul flusso del giorno: entrate meno uscite contate.
export function flowValue(m) {
  if (m.type === 'entrata') return m.amount;
  if (m.type === 'uscita') return -countedExpense(m);
  return 0;
}

export function groupByDay(movs) {
  const groups = [];
  let cur = null;
  for (const m of movs) {
    if (!cur || cur.date !== m.date) { cur = { date: m.date, items: [], total: 0 }; groups.push(cur); }
    cur.items.push(m);
    cur.total += flowValue(m);
  }
  return groups;
}

// Tutte le occorrenze da confermare (fino a oggi), dalla più vecchia.
export function pendingList(state, today) {
  const out = [];
  for (const s of live(state.scheduled)) for (const date of pendingOccurrences(s, today)) out.push({ sched: s, date });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function nextDue(state, sched, today) {
  return pendingOccurrences(sched, today)[0] || nextOccurrence(sched, today);
}

export function scheduledColor(state, s) {
  if (s.type === 'trasferimento') return byId(state.accounts, s.accountId)?.color || NEUTRAL_COLOR;
  return categoryColor(state, s.categoryId);
}

// Occorrenze programmate non gestite in un intervallo, marcate pending se già scadute.
export function plannedBetween(state, from, to, today) {
  const out = [];
  for (const s of live(state.scheduled)) {
    const handled = s.handled || {};
    for (const date of occurrences(s, from, to)) if (!handled[date]) out.push({ sched: s, date, pending: date <= today });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Griglia del mese da lunedì: per ogni giorno i pallini dei movimenti e dei programmati.
export function calendarMonth(state, ym, today) {
  const first = monthStart(ym);
  const start = startOfIsoWeek(first);
  const last = monthEnd(ym);
  const end = addDays(startOfIsoWeek(last), 6);
  const days = new Map();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    days.set(d, { date: d, inMonth: monthOf(d) === ym, isToday: d === today, dots: [], count: 0 });
  }
  for (const m of state.movements) {
    const day = !m.deleted && days.get(m.date);
    if (!day) continue;
    day.count++;
    day.dots.push({ color: movementColor(state, m), planned: false });
  }
  for (const p of plannedBetween(state, start, end, today)) {
    const day = days.get(p.date);
    day.count++;
    day.dots.push({ color: scheduledColor(state, p.sched), planned: true });
  }
  const list = [...days.values()];
  const weeks = [];
  for (let i = 0; i < list.length; i += 7) weeks.push(list.slice(i, i + 7));
  return weeks;
}

export function dayDetails(state, date, today) {
  return {
    movements: state.movements.filter((m) => !m.deleted && m.date === date).sort((a, b) => a.createdAt - b.createdAt),
    planned: plannedBetween(state, date, date, today),
  };
}

const DAY_MS = 86400000;

// Promemoria backup: dopo 30 giorni dall'ultimo backup (o dal primo uso).
export function backupDue(prefs, now) {
  const ref = prefs.lastBackupAt || prefs.firstUseAt;
  if (!ref) return false;
  return now - ref > 30 * DAY_MS;
}

export function hasData(state) {
  return state.accounts.some((a) => !a.deleted) || state.movements.some((m) => !m.deleted);
}

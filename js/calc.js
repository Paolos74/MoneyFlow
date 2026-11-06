// Calcoli puri su uno stato dello store: saldi, patrimonio, aggregati, crediti, obiettivi.
// Le uscite contano al netto della quota esclusa; trasferimenti e restituzioni non sono entrate.

import { formatEuro, formatEuroPlain, formatQty, percentTenths, tradeEuroCents } from './money.js';
import { monthEnd, monthStart, monthOf, startOfIsoWeek, addDays, toISO, parseISO } from './dates.js';
import { pendingOccurrences, occurrences, yearlyAmount, nextOccurrence } from './recurrence.js';
import { etfOf, investValue } from './invest.js';

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

// v5: l'id può essere quello di un ETF (lato "investimento" di Compra/Vendi): nome dell'ETF.
export function accountLabel(state, id) {
  const a = byId(state.accounts, id) || etfOf(state, id);
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

// Icone di categorie e conti (v4): quella scelta (campo `icon`) oppure la predefinita.
// Categorie iniziali per id fisso; le altre 'tag'. Conti: deposito 'vault', crypto 'coin', euro 'bank'.
const DEFAULT_CATEGORY_ICONS = {
  'default-uscita-casa': 'house', 'default-uscita-spesa': 'cart', 'default-uscita-trasporti': 'car',
  'default-uscita-bollette': 'bolt', 'default-uscita-abbonamenti': 'repeat', 'default-uscita-salute': 'heart',
  'default-uscita-svago': 'ticket', 'default-uscita-ristoranti': 'fork', 'default-uscita-regali': 'gift',
  'default-uscita-altro': 'tag', 'default-entrata-stipendio': 'briefcase', 'default-entrata-rimborsi': 'return',
  'default-entrata-altro': 'tag', 'default-entrata-interessi': 'percent', 'default-entrata-dividendi': 'coin',
};

export function categoryIconOf(cat) {
  if (!cat) return 'tag';
  return cat.icon || DEFAULT_CATEGORY_ICONS[cat.id] || (cat.role === 'interessi' ? 'percent' : cat.role === 'stipendio' ? 'briefcase' : cat.role === 'dividendi' ? 'coin' : 'tag');
}

export function categoryIcon(state, id) {
  return categoryIconOf(byId(state.categories, id));
}

export function accountIcon(account) {
  if (!account) return 'bank';
  if (account.icon) return account.icon;
  if (account.kind === 'crypto') return 'coin';
  return account.deposit ? 'vault' : 'bank';
}

// Colore che rappresenta un movimento (categoria, oppure conto per trasferimenti e variazioni).
export function movementColor(state, m) {
  if (m.type === 'uscita' || m.type === 'entrata') return categoryColor(state, m.categoryId);
  if (m.type === 'restituzione') {
    const exp = byId(state.movements, m.refundOf);
    return exp ? categoryColor(state, exp.categoryId) : NEUTRAL_COLOR;
  }
  if (m.etfId) return etfOf(state, m.etfId)?.color || NEUTRAL_COLOR;
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

// Valore di 1 unità di un conto crypto a una data D (null = tutto), decisione v6 §2:
// l'ultimo "Aggiorna valore" del conto (`account.prices`, centesimi per 1 unità intera) con data ≤ D → source 'manual';
// altrimenti il prezzo dell'ultima Compra crypto verso il conto con data ≤ D (ordine data, poi creazione) →
// source 'purchase' ("prezzo d'acquisto"); altrimenti null (il conto resta fuori dal patrimonio).
// Le Vendi non cambiano il valore unitario.
export function cryptoUnitValue(state, account, date = null) {
  const prices = (account.prices || []).filter((p) => !date || p.date <= date);
  if (prices.length) { const p = prices[prices.length - 1]; return { price: p.price, date: p.date, source: 'manual' }; }
  let last = null;
  for (const m of state.movements) {
    if (m.deleted || m.etfId || m.type !== 'trasferimento' || m.trade !== 'compra' || m.toAccountId !== account.id) continue;
    if (date && m.date > date) continue;
    if (!Number.isSafeInteger(m.price) || m.price < 1) continue;
    if (!last || m.date > last.date || (m.date === last.date && (m.createdAt ?? 0) >= (last.createdAt ?? 0))) last = m;
  }
  return last ? { price: last.price, date: last.date, source: 'purchase' } : null;
}

// Valore in euro di un conto crypto: quantità × valore di 1 unità, al centesimo "metà in su" (tradeEuroCents);
// 0 se la quantità è ≤ 0 o se non c'è valore.
export function cryptoValue(units, info) {
  return units > 0 && info ? tradeEuroCents(units, info.price) ?? 0 : 0;
}

// Patrimonio a upTo (null = tutto):
// - eurCents = saldi dei conti in euro non eliminati;
// - investCents (v5) = valore degli ETF non eliminati (valore scritto a mano o prezzo d'acquisto, js/invest.js);
// - cryptoCents (v6, decisione v6 §2) = somma dei conti crypto non eliminati con un valore: quantità × valore di
//   1 unità (cryptoUnitValue); i conti senza valore restano fuori e sono elencati in cryptoUnvalued;
// - totalCents = eurCents + investCents + cryptoCents (Patrimonio totale);
// - crypto = tutte le quantità per simbolo (come prima).
// Es. E7: conto euro 1.080,00; 0,015 BTC con ultima Compra a 64.000,00 → 960,00 (prezzo d'acquisto), totale 2.040,00;
// dopo "Aggiorna valore" a 70.000,00 → 0,015 × 70.000,00 = 1.050,00, totale 2.130,00.
export function netWorth(state, upTo = null) {
  const bal = balances(state, upTo);
  let eurCents = 0;
  let cryptoCents = 0;
  const crypto = new Map();
  const cryptoValued = [];
  const unvalued = new Map();
  for (const a of live(state.accounts)) {
    const b = bal.get(a.id) || 0;
    if (a.kind === 'crypto') {
      crypto.set(a.asset, (crypto.get(a.asset) || 0) + b);
      if (b <= 0) continue;
      const info = cryptoUnitValue(state, a, upTo);
      if (info) {
        const cents = cryptoValue(b, info);
        cryptoCents += cents;
        cryptoValued.push({ accountId: a.id, asset: a.asset, units: b, cents, info });
      } else unvalued.set(a.asset, (unvalued.get(a.asset) || 0) + b);
    } else eurCents += b;
  }
  const investCents = investValue(state, upTo);
  const byAsset = (x, y) => x.asset.localeCompare(y.asset);
  return {
    eurCents,
    investCents,
    cryptoCents,
    totalCents: eurCents + investCents + cryptoCents,
    crypto: [...crypto.entries()].map(([asset, units]) => ({ asset, units })).sort(byAsset),
    cryptoValued,
    cryptoUnvalued: [...unvalued.entries()].map(([asset, units]) => ({ asset, units })).sort(byAsset),
  };
}

export function cryptoLine(nw) {
  return nw.crypto.map((c) => formatQty(c.units, c.asset)).join(' · ');
}

export function netWorthSeries(state, months) {
  return months.map((ym) => {
    const nw = netWorth(state, monthEnd(ym));
    return { month: ym, eurCents: nw.eurCents, investCents: nw.investCents, cryptoCents: nw.cryptoCents, totalCents: nw.totalCents };
  });
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

// Consiglio discreto di "Quanto ti resta" (v5, solo con almeno un budget): uscite contate del periodo in categorie
// senza budget (anche eliminate o sconosciute), dalla più alta, esclusa "Altro" di uscita; `other` = uscite in
// "Altro" di uscita (con o senza budget), così la stessa spesa non compare due volte; otherBudgeted = "Altro" ha un budget.
export const OTHER_EXPENSE_ID = 'default-uscita-altro';
export function budgetAdvice(state, period) {
  const map = new Map();
  let other = 0;
  for (const m of state.movements) {
    if (!inRange(m, period.from, period.to) || m.type !== 'uscita') continue;
    const v = countedExpense(m);
    if (!v) continue;
    if (m.categoryId === OTHER_EXPENSE_ID) { other += v; continue; }
    const c = byId(state.categories, m.categoryId);
    if (c && !c.deleted && c.budget) continue;
    map.set(m.categoryId, (map.get(m.categoryId) || 0) + v);
  }
  const oc = byId(state.categories, OTHER_EXPENSE_ID);
  return {
    unbudgeted: [...map.entries()].map(([categoryId, value]) => ({ categoryId, value })).sort((a, b) => b.value - a.value),
    other, otherBudgeted: !!(oc && !oc.deleted && oc.budget),
  };
}

// Budget per categoria: `range` è un mese 'YYYY-MM' oppure un periodo { from, to } (periodo dallo stipendio, v4).
// v6 (decisione v6 §1, risposta 1B): con `today` conta anche le uscite programmate della categoria ancora da pagare
// nel periodo (stesso insieme di "Quanto ti resta", plannedBetween): used = spent + planned, left = budget − used,
// pct = used ÷ budget, over = used > budget. Senza `today` planned = 0 (comportamento v5).
// Es. budget Bollette 100,00, speso 30,00, programmata 50,00 il 25 → used 80,00, restano 20,00; con un'altra
// bolletta programmata da 30,00 → used 110,00, superato di 10,00.
export function budgetStatus(state, range, today = null) {
  const from = typeof range === 'string' ? monthStart(range) : range.from;
  const to = typeof range === 'string' ? monthEnd(range) : range.to;
  const plannedBy = new Map();
  if (today) {
    for (const p of plannedBetween(state, from, to, today)) {
      if (p.sched.type === 'uscita') plannedBy.set(p.sched.categoryId, (plannedBy.get(p.sched.categoryId) || 0) + p.sched.amount);
    }
  }
  return live(state.categories)
    .filter((c) => c.type === 'uscita' && c.budget)
    .sort((a, b) => (a.order - b.order) || a.createdAt - b.createdAt)
    .map((c) => {
      let spent = 0;
      for (const m of state.movements) if (inRange(m, from, to) && m.type === 'uscita' && m.categoryId === c.id) spent += countedExpense(m);
      const planned = plannedBy.get(c.id) || 0;
      const used = spent + planned;
      return { category: c, budget: c.budget, spent, planned, used, left: c.budget - used, pct: percentTenths(used, c.budget), over: used > c.budget };
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

const lowerName = (s) => String(s).trim().toLocaleLowerCase('it');

// Spesa divisa (v4): per ogni persona di `split` { person, share, refunded, residual } (restituzioni con quel nome).
// Una voce person: null ("Senza nome") raccoglie quota esclusa − somma delle quote (dati v1–v3 o spese modificate
// da una v3) e le restituzioni senza nome, quando non è zero. Residui mai negativi.
export function personShares(state, expense) {
  const split = Array.isArray(expense.split) ? expense.split : [];
  const refunds = refundsOf(state, expense.id);
  const rows = split.map((x) => ({ person: x.person, share: x.amount, refunded: 0, residual: 0 }));
  const idx = new Map(rows.map((r, i) => [lowerName(r.person), i]));
  const none = { person: null, share: Math.max(0, (expense.excluded || 0) - split.reduce((t, x) => t + x.amount, 0)), refunded: 0, residual: 0 };
  for (const r of refunds) {
    const i = r.person ? idx.get(lowerName(r.person)) : undefined;
    if (i === undefined) none.refunded += r.amount; else rows[i].refunded += r.amount;
  }
  if (none.share || none.refunded) rows.push(none);
  for (const r of rows) r.residual = Math.max(0, r.share - r.refunded);
  return rows;
}

// "Chi mi deve": residui per persona su tutte le spese non eliminate, nomi uniti senza maiuscole,
// dal residuo più alto. items = [{ movement, share, refunded, residual }] con residuo > 0.
export function debtsByPerson(state) {
  const map = new Map();
  for (const m of state.movements) {
    if (m.deleted || m.type !== 'uscita' || !Array.isArray(m.split) || !m.split.length) continue;
    for (const p of personShares(state, m)) {
      if (p.person === null || p.residual <= 0) continue;
      const k = lowerName(p.person);
      const cur = map.get(k) || { person: p.person, residual: 0, items: [] };
      cur.residual += p.residual;
      cur.items.push({ movement: m, share: p.share, refunded: p.refunded, residual: p.residual });
      map.set(k, cur);
    }
  }
  for (const d of map.values()) d.items.sort((a, b) => b.movement.date.localeCompare(a.movement.date) || b.movement.createdAt - a.movement.createdAt);
  return [...map.values()].sort((a, b) => b.residual - a.residual || a.person.localeCompare(b.person, 'it'));
}

// Persona di "Chi mi deve" dal nome (senza maiuscole), oppure null.
export function debtOf(state, name) {
  const k = lowerName(name || '');
  return debtsByPerson(state).find((d) => lowerName(d.person) === k) || null;
}

// Nomi già usati nelle spese divise e nelle restituzioni (per il suggerimento dei nomi, mai gli importi).
export function knownPeople(state) {
  const seen = new Map();
  for (const m of state.movements) {
    if (m.deleted) continue;
    const names = m.type === 'uscita' && Array.isArray(m.split) ? m.split.map((x) => x.person) : m.type === 'restituzione' && m.person ? [m.person] : [];
    for (const n of names) if (!seen.has(lowerName(n))) seen.set(lowerName(n), n);
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'it'));
}

// Avanzamento obiettivo. Quota mensile: quella scelta dall'utente (v2, `monthly`); se manca,
// come in v1 residuo / mesi rimasti (mese corrente incluso), per eccesso.
// monthSaved = quanto messo da parte nel mese di `today` (dal registro `log`).
export function goalProgress(goal, today) {
  const remaining = Math.max(0, goal.target - goal.saved);
  const res = {
    saved: goal.saved, target: goal.target, remaining, pct: Math.min(1000, percentTenths(goal.saved, goal.target)),
    done: remaining === 0, monthly: null, monthsLeft: null, expired: false,
    quota: goal.monthly ?? null, monthSaved: Math.max(0, goal.log?.[monthOf(today)] || 0),
  };
  if (goal.deadline && !res.done) {
    const d = parseISO(goal.deadline);
    const t = parseISO(today);
    if (goal.deadline < today) res.expired = true;
    else {
      res.monthsLeft = (d.y * 12 + d.m) - (t.y * 12 + t.m) + 1;
      res.monthly = Math.ceil(remaining / res.monthsLeft);
    }
  }
  if (res.quota) res.monthly = res.quota;
  return res;
}

const byCreated = (a, b) => (a.createdAt || 0) - (b.createdAt || 0);

// Obiettivi attivi (cifra non ancora raggiunta) e completati (saved ≥ target, "Completato ✓").
export function activeGoals(state) {
  return live(state.goals).filter((g) => g.saved < g.target).sort(byCreated);
}

export function completedGoals(state) {
  return live(state.goals).filter((g) => g.saved >= g.target).sort(byCreated);
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
    .map((m) => ({ movement: m, net: m.amount, gross: m.gross ?? null, withheld: m.gross != null ? m.gross - m.amount : null, payslip: m.payslip ?? null }));
  const withGross = rows.filter((r) => r.gross !== null);
  const sumPs = (k) => rows.reduce((t, r) => t + (r.payslip?.[k] ?? 0), 0);
  // Mesi con imponibile registrato (mese = data dell'entrata, provvisorio): più buste nello stesso mese si sommano.
  const byYm = new Map();
  for (const r of rows) {
    const ps = r.payslip;
    if (!ps || ps.taxable === null || ps.taxable === undefined) continue;
    const ym = monthOf(r.movement.date);
    const cur = byYm.get(ym) || { ym, taxable: 0, irpef: 0 };
    cur.taxable += ps.taxable;
    cur.irpef += ps.irpef ?? 0;
    byYm.set(ym, cur);
  }
  return {
    rows,
    net: rows.reduce((t, r) => t + r.net, 0),
    netWithGross: withGross.reduce((t, r) => t + r.net, 0),
    gross: withGross.reduce((t, r) => t + r.gross, 0),
    withheld: withGross.reduce((t, r) => t + r.withheld, 0),
    missing: rows.length - withGross.length,
    contributions: sumPs('contributions'),
    taxable: sumPs('taxable'),
    irpef: sumPs('irpef'),
    pension: sumPs('pension'),
    deductions: sumPs('deductions'),
    months: [...byYm.values()].sort((a, b) => a.ym.localeCompare(b.ym)),
  };
}

// Compra/Vendi crypto (v2): trasferimento con `trade`.
export const isTrade = (m) => m.type === 'trasferimento' && (m.trade === 'compra' || m.trade === 'vendi');

export function tradeLabel(state, m) {
  // v5: Compra/Vendi di un ETF → "Compra <nome dell'ETF>".
  if (m.etfId) return (m.trade === 'compra' ? 'Compra ' : 'Vendi ') + (etfOf(state, m.etfId)?.name || 'ETF');
  const cryptoId = m.trade === 'compra' ? m.toAccountId : m.accountId;
  const asset = byId(state.accounts, cryptoId)?.asset || 'crypto';
  return (m.trade === 'compra' ? 'Compra ' : 'Vendi ') + asset;
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
  // UX v6 proposta 10: senza i movimenti creati in automatico (interessi del conto deposito).
  const sorted = state.movements.filter((m) => !m.deleted && !m.interest && ['uscita', 'entrata', 'trasferimento'].includes(m.type))
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
export function searchMovements(state, { from, to, accountId, categoryId, q, etfId } = {}) {
  const needle = (q || '').trim().toLocaleLowerCase('it');
  return state.movements.filter((m) => {
    if (m.deleted) return false;
    if (from && m.date < from) return false;
    if (to && m.date > to) return false;
    if (accountId && m.accountId !== accountId && m.toAccountId !== accountId) return false;
    if (categoryId && m.categoryId !== categoryId) return false;
    if (etfId && m.etfId !== etfId) return false;
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

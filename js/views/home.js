// Home (v8, alternativa B "Cruscotto a riquadri", modifiche 1–9 e 12–19; v9: stessa intestazione con icona anche per
// Quanto ti resta, una tinta per significato, segno meno tipografico nelle uscite): titolo = periodo, card "Quanto ti resta"
// tutta toccabile, riquadri (Da pagare, Messo da parte, Budget, Chi mi deve, Obiettivi), Dove spendi, Ultimi
// movimenti, promemoria backup in fondo. Ogni elemento è un'anteprima che porta alla schermata dove si approfondisce;
// gli elementi senza contenuto non compaiono. Calcoli invariati (remaining, savedInPeriod, budgetStatus della v6/v7).
// ⚙ porta alle Impostazioni (lo crea ctx.header, uguale nelle 5 schede dalla v7).

import { el, card, icon, iconBox, emptyState, button, progress } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercent } from '../money.js';
import { MONTHS, parseISO, addDays } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining, savedInPeriod, progressStop } from '../period.js';
import { nextOccurrence } from '../recurrence.js';
import { heroRing } from './budget.js';
import { shortDate, scheduledTitle, amountIn, movementTitle } from './parts.js';
import { openAccountForm } from './conti.js';

const cap = (s) => s.charAt(0).toLocaleUpperCase('it') + s.slice(1);

// Modifica 5: "Novembre" (mese di calendario, anche senza stipendi) oppure "Dal 27 marzo" (dallo stipendio).
export function homeTitle(p) {
  const d = parseISO(p.from);
  return p.mode === 'salary' ? `Dal ${d.d} ${MONTHS[d.m - 1]}` : cap(MONTHS[d.m - 1]);
}

const chevron = () => el('span', { class: 'row__chev' }, icon('chevron'));
const head = (title, ic, tint) => el('div', { class: 'tile__head' },
  el('span', { class: 'tile__title' }, ic ? el('span', { class: `mini-badge mini-badge--${tint}` }, icon(ic, 14)) : null, el('span', { text: title })),
  chevron());

export function render(root, ctx) {
  const { store } = ctx;
  const state = store.getState();
  const today = ctx.today();
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  // ⚙︎ in alto a destra lo mette ctx.header, uguale nelle 5 schede (v7). La scheda in basso resta "Home".
  ctx.header({ title: homeTitle(p) });

  if (store.corrupted) {
    root.append(card({ title: 'Dati non leggibili', cls: 'card--warn' },
      el('p', { text: 'I dati salvati su questo dispositivo erano danneggiati: ne è stata tenuta una copia e l\'app è ripartita da zero. Puoi importare un backup.' }),
      button('Importa un backup', () => ctx.go('impostazioni/backup'), { kind: 'primary', small: true })));
  }

  const accounts = C.sortedAccounts(state);
  if (!accounts.length) {
    root.append(emptyState({
      icon: 'wallet', title: 'Aggiungi il primo conto',
      text: 'Crea i tuoi conti (Revolut, Contanti, Coinbase…) con il saldo di partenza, poi registra spese ed entrate con il pulsante +.',
      action: button('Nuovo conto', () => openAccountForm(ctx), { kind: 'primary', id: 'home-new-account' }),
    }));
  }

  const r = remaining(state, p, today);
  const budgets = C.budgetStatus(state, p, today);
  root.append(heroCard(p, r));
  root.append(tilesGrid(ctx, state, today, p, r, budgets));
  const where = whereCard(state, today, p, r, budgets);
  if (where) root.append(where);
  const recent = recentCard(state, today);
  if (recent) root.append(recent);

  // Promemoria backup in fondo (modifica 17). Regola dei 30 giorni invariata.
  if (C.backupDue(ctx.prefs.get(), Date.now()) && C.hasData(state)) {
    const text = ctx.prefs.get().lastBackupAt ? 'Ultimo backup più di 30 giorni fa' : 'Non hai ancora fatto un backup';
    root.append(el('a', { class: 'notice-row', href: '#impostazioni/backup', id: 'home-backup', attrs: { 'aria-label': `${text}. Fai il backup` } },
      el('span', { class: 'notice-row__icon' }, icon('clock', 18)),
      el('span', { class: 'notice-row__text', text }),
      el('span', { class: 'notice-row__action' }, 'Fai il backup', icon('chevron', 12))));
  }
}

// Quanto ti resta (modifiche 3, 4, 6, 7): tutta la card porta a Budget. Un solo numero grande nel carattere dei
// numeri, col colore progressivo; "fino al 30/11 · ancora 13 giorni"; Puoi spendere oggi in una riga; sotto la
// scomposizione piccola con "Da pagare" (lo stesso nome dei programmati ancora da pagare in tutta l'app), in una riga
// con un solo "€" alla fine; a capo tra i pezzi solo come ripiego (schermi stretti, importi a 5 cifre).
function heroCard(p, r) {
  const budgetMode = r.mode === 'budget';
  const over = r.left < 0;
  let value;
  if (budgetMode && over) {
    value = el('p', { class: 'remaining__over', id: 'home-over' },
      el('span', { class: 'remaining__over-label', text: 'Hai sforato di ' }),
      el('span', { class: 'hero__value', id: 'home-left', text: formatEuro(-r.left) }));
  } else {
    const leftText = formatEuro(r.left);
    const tone = budgetMode ? '' : r.left >= 0 ? 'is-income' : 'is-danger';
    value = el('p', { class: `hero__value ${tone}${leftText.length > 9 ? ' is-long' : ''}`, id: 'home-left', text: leftText });
  }
  const stop = budgetMode ? progressStop(r.spentTenths) : null;
  const end = shortDate(p.to, p.to);
  const days = r.daysLeft === 1 ? 'ultimo giorno' : `ancora ${r.daysLeft} giorni`;
  const noEuro = (v) => formatEuro(v).replace(/\s*€$/, '');
  const piece = (label, v, id, last) => el('span', { class: 'hhero__piece', id }, `${label} ${last ? formatEuro(v) : noEuro(v)}`);
  const pieces = budgetMode
    ? [piece('Spesi', r.expense, 'month-expense'), piece('Da pagare', r.planned, 'home-planned'), piece('Budget', r.budget, 'home-budget-total', true)]
    : [piece('Entrate', r.income, 'month-income'), piece('Uscite', r.expense, 'month-expense'), piece('Da pagare', r.planned, 'home-planned', true)];
  return el('a', { class: 'card hhero', href: '#budget', id: 'home-remaining' },
    head('Quanto ti resta', 'gauge', 'emerald'),
    el('div', {
      class: 'remaining__main' + (stop ? ' prog' : ''),
      vars: stop ? { '--prog-a': `var(--prog-${stop.from})`, '--prog-b': `var(--prog-${stop.to})`, '--prog-t': `${stop.mix}%` } : null,
    },
    el('div', { class: 'remaining__text' },
      value,
      // Due pezzi che non vanno a capo al loro interno: se manca spazio la riga va a capo solo dopo "·".
      el('p', { class: 'hhero__sub', id: 'home-period' },
        el('span', { class: 'hhero__piece', text: `fino al ${end}${p.estimatedEnd ? ' (stimato)' : ''}` }),
        ' · ',
        el('span', { class: 'hhero__piece', text: days }))),
    heroRing(r)),
    el('div', { class: 'hhero__today' },
      el('span', { class: 'hhero__today-icon' }, icon('sun', 16)),
      el('span', { class: 'hhero__today-label', text: 'Puoi spendere oggi' }),
      el('span', { class: 'hhero__today-value', id: 'home-today', text: formatEuro(r.perDay) })),
    el('p', { class: 'hhero__line', id: 'home-breakdown' }, pieces.flatMap((n, i) => (i ? [' · ', n] : [n]))));
}

// Riquadro (alternativa B, precisazione P1): uno scopo, un valore e al massimo due righe brevi, tutto toccabile.
function tile({ id, href, title, ic, tint, value, valueCls = '', lines = [], wide = false }) {
  return el('a', { class: 'tile' + (wide ? ' tile--wide' : ''), href, id },
    head(title, ic, tint),
    el('p', { class: `tile__value ${valueCls}`, id: `${id}-value`, text: value }),
    ...lines.filter(Boolean).map((t) => el('p', { class: 'tile__line', text: t })));
}

// Prossimo pagamento dopo oggi (modifica 13): prima occorrenza non gestita dei programmati di uscita o
// trasferimento; a parità di data il programmato creato prima.
function nextPayment(state, today) {
  let next = null;
  for (const s of state.scheduled.filter((x) => !x.deleted && x.type !== 'entrata').sort((a, b) => a.createdAt - b.createdAt)) {
    const d = nextOccurrence(s, addDays(today, 1));
    if (d && (!next || d < next.date)) next = { sched: s, date: d };
  }
  return next;
}

function tilesGrid(ctx, state, today, p, r, budgets) {
  const tiles = [];

  // Da pagare (modifiche 12 e 13): niente nome del conto; il prossimo pagamento anche con scadenze da confermare.
  const pending = C.pendingList(state, today);
  const next = nextPayment(state, today);
  if (pending.length) {
    tiles.push(tile({
      id: 'home-pay', href: '#da-confermare', title: 'Da pagare', ic: 'repeat', tint: 'violet', value: `${pending.length} da confermare`,
      lines: [next ? `poi ${scheduledTitle(state, next.sched)} ${shortDate(next.date, today)}` : null],
    }));
  } else if (next) {
    tiles.push(tile({
      id: 'home-pay', href: '#programmati', title: 'Da pagare', ic: 'repeat', tint: 'violet', value: amountIn(state, next.sched.accountId, next.sched.amount),
      lines: [`${scheduledTitle(state, next.sched)} · ${shortDate(next.date, today)}`],
    }));
  }

  // Messo da parte (modifica 8; v7: meno i programmati da pagare). Il dettaglio è in Statistiche (modifica 9).
  // Valore nel colore del testo (modifica 7: l'unico numero colorato forte è Quanto ti resta).
  const sv = savedInPeriod(state, p, today);
  if (sv.income > 0 || sv.expense > 0 || sv.planned > 0) {
    tiles.push(tile({
      id: 'home-saved', href: '#statistiche?blocco=da-parte', title: 'Messo da parte', ic: 'piggy', tint: 'butter',
      value: formatEuroSigned(sv.net),
      lines: [sv.income > 0 && sv.net >= 0 ? `${formatPercent(sv.rate)} delle entrate` : null, sv.planned > 0 ? `${formatEuro(sv.planned)} già tolti` : null],
    }));
  }

  // Budget (modifiche 1 e 2, P1): "1 andrà oltre · Abbonamenti"; i numeri completi sono nel Piano, dove porta il tocco.
  if (r.mode !== 'budget') {
    tiles.push(tile({ id: 'home-budget', href: '#budget?budget=nuovo', title: 'Budget', ic: 'gauge', tint: 'amber', value: 'Nessun budget', lines: ['Imposta i budget'] }));
  } else {
    const risk = budgets.filter((b) => b.over).sort((a, b) => (b.used - b.budget) - (a.used - a.budget));
    if (risk.length) {
      const past = risk.filter((b) => b.spent > b.budget).length;
      const n = risk.length;
      const word = past === n ? (n === 1 ? 'superato' : 'superati') : past === 0 ? (n === 1 ? 'andrà oltre' : 'andranno oltre') : 'a rischio';
      tiles.push(tile({
        id: 'home-budget', href: `#budget?evidenzia=${encodeURIComponent(risk[0].category.id)}`, title: 'Budget', ic: 'gauge', tint: 'amber',
        value: `${n} ${word}`, valueCls: past ? 'is-danger' : 'is-risk',
        lines: [risk.slice(0, 2).map((b) => b.category.name).join(', ') + (n > 2 ? '…' : '')],
      }));
    } else {
      tiles.push(tile({ id: 'home-budget', href: '#budget', title: 'Budget', ic: 'gauge', tint: 'amber', value: 'Nei limiti', lines: [`${budgets.length} budget`] }));
    }
  }

  // Chi mi deve: solo se qualcuno deve dei soldi (esiste solo in Home).
  const credits = C.openCredits(state);
  if (credits.total > 0) {
    const debts = C.debtsByPerson(state);
    tiles.push(tile({
      id: 'home-credits', href: '#da-ricevere', title: debts.length ? 'Chi mi deve' : 'Da ricevere', ic: 'hand', tint: 'teal', value: formatEuro(credits.total),
      lines: [debts.length ? debts.slice(0, 3).map((d) => d.person).join(', ') + (debts.length > 3 ? '…' : '') : `${credits.items.length} ${credits.items.length === 1 ? 'quota anticipata' : 'quote anticipate'}`],
    }));
  }

  // Obiettivi (modifica 16): solo con obiettivi attivi, quello con la scadenza più vicina. Largo se i riquadri prima
  // sono pari, altrimenti riempie il posto libero; senza obiettivi un riquadro rimasto solo prende tutta la riga.
  const goal = C.activeGoals(state).sort((a, b) => (a.deadline || '9999-99-99').localeCompare(b.deadline || '9999-99-99'))[0];
  const odd = tiles.length % 2 === 1;
  if (goal) {
    const gp = C.goalProgress(goal, today);
    tiles.push(el('a', { class: 'tile tile--goal' + (odd ? '' : ' tile--wide'), href: '#budget/obiettivi', id: 'home-goal' },
      head('Obiettivi', 'target', 'pink'),
      el('div', { class: 'tile__goal' }, el('span', { class: 'tile__goal-name', text: goal.name }), el('span', { class: 'tile__goal-pct', id: 'home-goal-value', text: formatPercent(gp.pct) })),
      progress(goal.saved / goal.target, { color: goal.color })));
  } else if (odd) {
    tiles[tiles.length - 1].classList.add('tile--wide');
  }
  return el('div', { class: 'tiles', id: 'home-tiles' }, ...tiles);
}

// Dove spendi (modifica 14, P3): una barra sola con le prime 3 categorie per usato (speso pieno + da pagare
// tratteggiato), quelle a rischio in cima, poi "Altre" in grigio; scala = budget complessivo o totale usato se più
// grande. Legenda in righe, i nomi vanno a capo: niente sovrapposto né troncato.
function whereCard(state, today, p, r, budgets) {
  const by = new Map();
  const get = (id) => { if (!by.has(id)) by.set(id, { categoryId: id, spent: 0, planned: 0 }); return by.get(id); };
  for (const c of C.byCategory(state, p.from, p.to, 'uscita')) get(c.categoryId).spent = c.value;
  for (const x of C.plannedBetween(state, p.from, p.to, today)) if (x.sched.type === 'uscita') get(x.sched.categoryId).planned += x.sched.amount;
  const over = new Map(budgets.filter((b) => b.over).map((b) => [b.category.id, b.used - b.budget]));
  const items = [...by.values()].map((x) => ({ ...x, used: x.spent + x.planned })).filter((x) => x.used > 0)
    .sort((a, b) => (over.has(b.categoryId) - over.has(a.categoryId)) || ((over.get(b.categoryId) || 0) - (over.get(a.categoryId) || 0)) || (b.used - a.used));
  if (!items.length) return null;
  const top = items.slice(0, 3);
  const rest = items.slice(3).reduce((t, x) => ({ spent: t.spent + x.spent, planned: t.planned + x.planned }), { spent: 0, planned: 0 });
  const totalUsed = items.reduce((t, x) => t + x.used, 0);
  const totalPlanned = items.reduce((t, x) => t + x.planned, 0);
  const scale = Math.max(totalUsed, r.mode === 'budget' ? r.budget : 0);
  const pct = (v) => `${(v * 100) / scale}%`;
  const segs = [];
  const add = (v, color, planned) => { if (v > 0) segs.push(el('span', { class: 'stack__seg' + (planned ? ' stack__seg--planned' : ''), vars: { '--c': color, '--w': pct(v) } })); };
  for (const x of top) { const c = C.categoryColor(state, x.categoryId); add(x.spent, c, false); add(x.planned, c, true); }
  add(rest.spent, 'var(--muted)', false);
  add(rest.planned, 'var(--muted)', true);
  const legendRow = (color, name, value, attrs) => el('li', { class: 'where__row', attrs },
    el('span', { class: 'chip__dot', vars: { '--c': color } }), el('span', { class: 'where__name', text: name }), el('span', { class: 'where__value', text: formatEuro(value) }));
  const legend = top.map((x) => legendRow(C.categoryColor(state, x.categoryId), C.categoryLabel(state, x.categoryId), x.used, { 'data-where': x.categoryId }));
  if (rest.spent + rest.planned > 0) legend.push(legendRow('var(--muted)', 'Altre', rest.spent + rest.planned, { 'data-where': 'altre' }));
  return el('a', { class: 'card where', href: '#budget?sezione=piano', id: 'home-where' },
    head('Dove spendi', 'chart', 'indigo'),
    el('div', { class: 'stack', attrs: { role: 'img', 'aria-label': `Usato ${formatEuro(totalUsed)}${r.mode === 'budget' ? ` su un budget di ${formatEuro(r.budget)}` : ''}` } }, ...segs),
    el('ul', { class: 'where__legend' }, ...legend),
    totalPlanned > 0 ? el('p', { class: 'where__note', id: 'home-where-planned' }, el('span', { class: 'where__key' }), `Tratteggiato: ${formatEuro(totalPlanned)} da pagare`) : null);
}

// Ultimi movimenti (modifica 15, P2): le ultime 3 uscite o entrate fino a oggi, ordinate come in Movimenti,
// senza gli interessi automatici del deposito (come i recenti del +). Righe solo da leggere: tocca la card.
function recentCard(state, today) {
  const movs = state.movements.filter((m) => !m.deleted && !m.interest && (m.type === 'uscita' || m.type === 'entrata') && m.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 3);
  if (!movs.length) return null;
  return el('a', { class: 'card recent-card', href: '#movimenti', id: 'home-recent' },
    head('Ultimi movimenti', 'list', 'graphite'),
    el('ul', { class: 'hl-list' }, ...movs.map((m) => el('li', { class: 'hl', attrs: { 'data-movement': m.id } },
      iconBox(C.categoryIcon(state, m.categoryId), C.movementColor(state, m)),
      el('span', { class: 'hl__main' },
        el('span', { class: 'hl__title', text: movementTitle(state, m) }),
        el('span', { class: 'hl__sub', text: `${shortDate(m.date, today)} · ${C.categoryLabel(state, m.categoryId)}` })),
      el('span', { class: 'hl__value' + (m.type === 'entrata' ? ' is-income' : ''), text: m.type === 'uscita' ? '−' + formatEuro(m.amount) : formatEuroSigned(m.amount) })))));
}

// Home: quanto ti resta (v5: sul budget complessivo), promemoria backup, pagamenti programmati con Da confermare,
// quanto metti da parte (v5; v7 meno i programmati da pagare), scorciatoie (Chi mi deve, budget superati).
// ⚙ porta alle Impostazioni (lo crea ctx.header, uguale nelle 5 schede dalla v7).
// UX v6 (proposte 1–10, approvate in prova): solo disposizione e aspetto, calcoli invariati.

import { el, card, icon, emptyState, button, list, row } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercent } from '../money.js';
import { formatDateIt, MONTHS, parseISO } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining, savedInPeriod } from '../period.js';
import { nextOccurrence } from '../recurrence.js';
import { periodText, remainingHero, budgetAdviceHome, setBudgetsInvite } from './budget.js';
import { pendingRow, pendingGroups, pendingGroupRow, shortDate, scheduledTitle, amountIn } from './parts.js';
import { openAccountForm } from './conti.js';
import { openScheduledForm } from './movimento-form.js';

export function render(root, ctx) {
  const { store } = ctx;
  const state = store.getState();
  const today = ctx.today();
  // ⚙︎ in alto a destra lo mette ctx.header, uguale nelle 5 schede (v7).
  ctx.header({ title: 'Home' });

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

  // Quanto ti resta (numero protagonista). v6: somma dei budget − tutte le uscite − programmati da pagare del
  // periodo, con la scomposizione discreta Budget / Speso / Programmati su una riga (UX v6 proposta 2); senza
  // budget il calcolo v4 (entrate − uscite − programmati da pagare) con l'invito "Imposta i budget".
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  const r = remaining(state, p, today);
  const budgetMode = r.mode === 'budget';
  root.append(remainingHero({
    title: 'Quanto ti resta', prefix: 'home', r, label: `Periodo: ${periodText(p)} · fino al ${formatDateIt(p.to)}`,
    link: el('a', { class: 'card__link', href: '#budget', text: 'Budget' }), compactToday: true,
  },
  budgetMode
    ? el('div', { class: 'stats stats--line' },
      stat('Budget', formatEuro(r.budget), 'home-budget-total'),
      stat('Speso', formatEuro(r.expense), 'month-expense'),
      stat('Programmati', formatEuro(r.planned), 'home-planned'))
    : el('div', { class: 'stats stats--line' },
      stat('Entrate', formatEuro(r.income), 'month-income', 'is-income'),
      stat('Uscite', formatEuro(r.expense), 'month-expense'),
      stat('Programmati', formatEuro(r.planned), 'home-planned')),
  budgetMode ? budgetAdviceHome(state, p) : setBudgetsInvite('home-set-budgets')));

  // Promemoria backup (UX v6 proposta 1): una riga sotto la card protagonista. Regola dei 30 giorni invariata.
  if (C.backupDue(ctx.prefs.get(), Date.now()) && C.hasData(state)) {
    const text = ctx.prefs.get().lastBackupAt ? 'Ultimo backup più di 30 giorni fa' : 'Non hai ancora fatto un backup';
    root.append(el('a', { class: 'notice-row', href: '#impostazioni/backup', id: 'home-backup', attrs: { 'aria-label': `${text}. Fai il backup` } },
      el('span', { class: 'notice-row__icon' }, icon('clock', 18)),
      el('span', { class: 'notice-row__text', text }),
      el('span', { class: 'notice-row__action' }, 'Fai il backup', icon('chevron', 12))));
  }

  // Pagamenti programmati (UX v6 proposte 6 e 7): le voci da confermare in righe compatte, altrimenti il
  // prossimo pagamento, altrimenti l'invito ad aggiungerne uno.
  root.append(scheduledCard(ctx, state, today));

  // Quanto metti da parte (decisione v5 §2, UX v6 proposta 5; v7, decisione v7 §3): stima a fine periodo =
  // entrate − uscite − uscite programmate ancora da pagare nel periodo, accanto al titolo; sotto, prima "di cui X €
  // di pagamenti programmati ancora da uscire", poi la % delle entrate (sul nuovo numero), obiettivi e spostato
  // verso deposito e investimenti; tocco → Statistiche. Nascosta se il periodo non ha movimenti né programmati da
  // pagare. Tono calmo: negativo nel colore del testo, nessun avviso.
  const sv = savedInPeriod(state, p, today);
  if (sv.income > 0 || sv.expense > 0 || sv.planned > 0) {
    const goalsLabel = p.mode === 'salary' ? `negli obiettivi di ${MONTHS[parseISO(p.from).m - 1]}` : 'negli obiettivi';
    const parts = [];
    if (sv.planned > 0) parts.push(el('span', { id: 'home-saved-planned', text: `di cui ${formatEuro(sv.planned)} di pagamenti programmati ancora da uscire` }));
    if (sv.income > 0 && sv.net >= 0) parts.push(el('span', { id: 'home-saved-rate', text: `${formatPercent(sv.rate)} delle entrate` }));
    parts.push(el('span', { id: 'home-saved-goals', text: `${formatEuro(sv.goals)} ${goalsLabel}` }));
    parts.push(el('span', { id: 'home-saved-moved', text: `${formatEuro(sv.moved)} verso deposito e investimenti` }));
    root.append(el('a', { class: 'card card--t-pink card--saved card--saved-compact', href: '#statistiche', id: 'home-saved' },
      el('div', { class: 'card__head' },
        el('h2', { class: 'card__title' }, el('span', { class: 'card__badge' }, icon('piggy')), el('span', { text: 'Quanto metti da parte' })),
        el('span', { class: 'saved__head' },
          el('span', { class: 'saved__value' + (sv.net < 0 ? ' is-neg' : ''), id: 'home-saved-net', text: formatEuroSigned(sv.net) }),
          el('span', { class: 'row__chev' }, icon('chevron')))),
      el('p', { class: 'saved__line' }, parts.flatMap((n, i) => (i ? [' · ', n] : [n])))));
  }

  // Scorciatoie (UX v6 proposta 8): solo quando hanno qualcosa da dire. Il patrimonio è in Conti.
  const credits = C.openCredits(state);
  const debts = C.debtsByPerson(state);
  // v6 (risposta 1B): i "budget superati" contano anche i programmati della categoria.
  const over = C.budgetStatus(state, p, today).filter((b) => b.over);
  const shortcuts = [
    credits.total > 0 ? row({
      icon: 'hand', color: 'var(--accent-fill)', title: debts.length ? 'Chi mi deve' : 'Da ricevere',
      subtitle: debts.length ? debts.slice(0, 3).map((d) => d.person).join(', ') + (debts.length > 3 ? '…' : '') : `${credits.items.length} ${credits.items.length === 1 ? 'quota anticipata' : 'quote anticipate'}`,
      value: formatEuro(credits.total), href: '#da-ricevere', id: 'home-credits',
    }) : null,
    over.length ? row({
      icon: 'gauge', color: 'var(--amber-fill)', title: `${over.length} ${over.length === 1 ? 'budget superato' : 'budget superati'}`,
      subtitle: over.slice(0, 3).map((b) => b.category.name).join(', ') + (over.length > 3 ? '…' : ''), href: '#budget', id: 'home-budget',
    }) : null,
  ].filter(Boolean);
  if (shortcuts.length) root.append(el('div', { class: 'section' }, list(...shortcuts)));
}

function scheduledCard(ctx, state, today) {
  const pending = C.pendingList(state, today);
  const content = [];
  if (pending.length) {
    content.push(el('p', { class: 'card__label', text: `Da confermare (${pending.length})` }),
      // Una riga per programmato: con più scadenze arretrate "N scadenze" e Vedi.
      el('div', { class: 'list list--flat' }, pendingGroups(pending).slice(0, 3).map((g, i) => (g.items.length === 1 ? pendingRow(ctx, g.items[0], i, { compact: true }) : pendingGroupRow(ctx, g, i)))),
      el('div', { class: 'card__foot' }, el('a', { class: 'card__link', href: '#da-confermare', id: 'home-pending-all', text: 'Vedi tutte' })));
  } else {
    const live = state.scheduled.filter((s) => !s.deleted);
    // Prossima scadenza non gestita dopo oggi; a parità di data il programmato creato prima.
    let next = null;
    for (const s of [...live].sort((a, b) => a.createdAt - b.createdAt)) {
      const d = nextOccurrence(s, today);
      if (d && (!next || d < next.date)) next = { sched: s, date: d };
    }
    if (next) {
      const t = scheduledTitle(state, next.sched);
      content.push(el('div', { class: 'list list--flat' }, row({
        icon: 'repeat', color: C.scheduledColor(state, next.sched), planned: true, title: `Prossimo: ${t}`, subtitle: shortDate(next.date, today),
        value: amountIn(state, next.sched.accountId, next.sched.amount), valueClass: 'row__value--strong', href: '#programmati', id: 'home-next',
      })));
    } else {
      content.push(el('div', { class: 'advice advice--plain' }, el('button', {
        class: 'advice__row', type: 'button', id: 'home-scheduled-add', on: { click: () => openScheduledForm(ctx) },
      },
      el('span', { class: 'advice__icon' }, icon('repeat', 16)),
      el('span', { class: 'advice__text', text: live.length ? 'Nessun pagamento in arrivo' : 'Nessun pagamento programmato' }),
      el('span', { class: 'advice__action' }, 'Aggiungi', icon('chevron', 12)))));
    }
  }
  return card({ title: 'Pagamenti programmati', tint: 'violet', icon: 'repeat', id: 'home-scheduled-card', cls: 'card--scheduled', link: el('a', { class: 'card__link', href: '#programmati', id: 'home-scheduled', text: 'Tutti' }) }, ...content);
}

function stat(label, value, id, cls = '') {
  return el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: label }), el('div', { class: `stat__value ${cls}`, id, text: value }));
}

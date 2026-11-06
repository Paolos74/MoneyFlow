// Home: quanto ti resta (v5: sul budget complessivo), quanto metti da parte (v5), Da confermare,
// Da ricevere, budget, obiettivi, patrimonio, promemoria backup. ⚙︎ porta alle Impostazioni.

import { el, card, icon, emptyState, button, list, row } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercent } from '../money.js';
import { formatDateIt, MONTHS, parseISO } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining, savedInPeriod } from '../period.js';
import { periodText, remainingHero, budgetAdviceBlock, setBudgetsInvite } from './budget.js';
import { sortedInvestments, etfSummary } from '../invest.js';
import { pendingRow, pendingGroups, pendingGroupRow } from './parts.js';
import { openAccountForm } from './conti.js';

export function render(root, ctx) {
  const { store } = ctx;
  const state = store.getState();
  const today = ctx.today();
  ctx.header({
    title: 'Home',
    actions: [el('a', { class: 'topbar__btn topbar__btn--circle', href: '#impostazioni', id: 'settings-btn', attrs: { 'aria-label': 'Impostazioni' } }, icon('gear'))],
  });

  if (store.corrupted) {
    root.append(card({ title: 'Dati non leggibili', cls: 'card--warn' },
      el('p', { text: 'I dati salvati su questo dispositivo erano danneggiati: ne è stata tenuta una copia e l\'app è ripartita da zero. Puoi importare un backup.' }),
      button('Importa un backup', () => ctx.go('impostazioni/backup'), { kind: 'primary', small: true })));
  }
  if (C.backupDue(ctx.prefs.get(), Date.now()) && C.hasData(state)) {
    const last = ctx.prefs.get().lastBackupAt;
    root.append(card({ title: 'Promemoria backup', cls: 'card--warn' },
      el('p', { text: last ? 'L\'ultimo backup ha più di 30 giorni.' : 'Non hai ancora fatto un backup dei tuoi dati.' }),
      button('Fai il backup', () => ctx.go('impostazioni/backup'), { kind: 'primary', small: true, id: 'home-backup' })));
  }

  const accounts = C.sortedAccounts(state);
  if (!accounts.length) {
    root.append(emptyState({
      icon: 'wallet', title: 'Aggiungi il primo conto',
      text: 'Crea i tuoi conti (Revolut, Contanti, Coinbase…) con il saldo di partenza, poi registra spese ed entrate con il pulsante +.',
      action: button('Nuovo conto', () => openAccountForm(ctx), { kind: 'primary', id: 'home-new-account' }),
    }));
  }

  // Quanto ti resta (numero protagonista). v5: somma dei budget − tutte le uscite del periodo; senza budget
  // il calcolo v4 (entrate − uscite − programmati da pagare) con l'invito "Imposta i budget".
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  const r = remaining(state, p, today);
  const budgetMode = r.mode === 'budget';
  root.append(remainingHero({
    title: 'Quanto ti resta', prefix: 'home', r, label: `Periodo: ${periodText(p)} · fino al ${formatDateIt(p.to)}`,
    link: el('a', { class: 'card__link', href: '#budget', text: 'Budget' }),
  },
  budgetMode
    ? el('div', { class: 'stats' },
      stat('Budget', formatEuro(r.budget), 'home-budget-total'),
      stat('Uscite', formatEuro(r.expense), 'month-expense'))
    : el('div', { class: 'stats' },
      stat('Entrate', formatEuro(r.income), 'month-income', 'is-income', 'stat--income'),
      stat('Uscite', formatEuro(r.expense), 'month-expense', '', 'stat--expense'),
      stat('Programmati', formatEuro(r.planned), 'home-planned', '', 'stat--planned')),
  budgetMode ? budgetAdviceBlock(state, p, 'home') : setBudgetsInvite('home-set-budgets')));

  // Quanto metti da parte (decisione v5 §2): entrate − uscite del periodo in grande, sotto obiettivi e
  // spostato verso deposito e investimenti. Tono calmo: negativo nel colore del testo, nessun avviso.
  const sv = savedInPeriod(state, p);
  const netText = formatEuroSigned(sv.net);
  const small = (v, id) => el('span', { id, class: v === 0 ? 'is-muted' : '', text: formatEuro(v) });
  root.append(card({ title: 'Quanto metti da parte', tint: 'pink', icon: 'piggy', cls: 'card--saved', id: 'home-saved' },
    el('p', { class: 'hero__label', text: 'Entrate meno uscite del periodo' }),
    el('p', { class: 'saved__value' + (netText.length > 11 ? ' is-long' : '') + (sv.net < 0 ? ' is-neg' : ''), id: 'home-saved-net', text: netText }),
    sv.income > 0 && sv.net >= 0 ? el('p', { class: 'hero__sub', id: 'home-saved-rate', text: `Risparmio: ${formatPercent(sv.rate)} delle entrate` }) : null,
    el('div', { class: 'kv' }, el('span', { text: p.mode === 'salary' ? `Negli obiettivi di ${MONTHS[parseISO(p.from).m - 1]}` : 'Negli obiettivi' }), small(sv.goals, 'home-saved-goals')),
    el('div', { class: 'kv' }, el('span', { text: 'Verso deposito e investimenti' }), small(sv.moved, 'home-saved-moved'))));

  // Da confermare
  const pending = C.pendingList(state, today);
  if (pending.length) {
    root.append(card({ title: `Da confermare (${pending.length})`, tint: 'violet', icon: 'clock', link: el('a', { class: 'card__link', href: '#da-confermare', text: 'Tutti' }) },
      // Una riga per programmato: con più scadenze arretrate "N scadenze" e Vedi.
      el('div', { class: 'list list--flat' }, pendingGroups(pending).slice(0, 3).map((g, i) => (g.items.length === 1 ? pendingRow(ctx, g.items[0], i) : pendingGroupRow(ctx, g, i))))));
  }

  // Informazioni secondarie: chi mi deve, budget, programmati, patrimonio (il numero grande è in Conti).
  const credits = C.openCredits(state);
  const debts = C.debtsByPerson(state);
  const nw = C.netWorth(state);
  // v5: con ETF con quote il patrimonio li comprende ("Conti in euro e ETF"), le crypto restano a parte.
  const withEtf = sortedInvestments(state).some((e) => etfSummary(state, e.id).qty > 0);
  const nwSub = withEtf ? 'Conti in euro e ETF' + (nw.crypto.length ? ' · ' + C.cryptoLine(nw) : '') : nw.crypto.length ? C.cryptoLine(nw) : 'Totale dei conti in euro';
  const budgets = C.budgetStatus(state, p);
  const over = budgets.filter((b) => b.over).length;
  root.append(el('div', { class: 'section' }, list(
    credits.total > 0 ? row({
      icon: 'hand', color: 'var(--accent-fill)', title: debts.length ? 'Chi mi deve' : 'Da ricevere',
      subtitle: debts.length ? debts.slice(0, 3).map((d) => d.person).join(', ') + (debts.length > 3 ? '…' : '') : `${credits.items.length} ${credits.items.length === 1 ? 'quota anticipata' : 'quote anticipate'}`,
      value: formatEuro(credits.total), href: '#da-ricevere', id: 'home-credits',
    }) : null,
    row({ icon: 'gauge', color: 'var(--amber-fill)', title: 'Budget e obiettivi', subtitle: budgets.length ? (over ? `${over} ${over === 1 ? 'budget superato' : 'budget superati'}` : 'Tutti i budget nei limiti') : 'Piano per categoria e obiettivi di risparmio', valueClass: over ? 'is-danger' : '', href: '#budget', id: 'home-budget' }),
    row({ icon: 'repeat', color: 'var(--violet-fill)', title: 'Pagamenti programmati', subtitle: 'Abbonamenti, affitto, bollette', href: '#programmati', id: 'home-scheduled' }),
    accounts.length ? row({ icon: 'cash', color: 'var(--butter-fill)', title: 'Patrimonio', subtitle: nwSub, value: formatEuro(nw.totalCents), href: '#conti', id: 'home-networth', attrs: { 'data-networth': String(nw.totalCents) } }) : null)));
}

function stat(label, value, id, cls = '', tileCls = '') {
  return el('div', { class: `stat ${tileCls}` }, el('div', { class: 'stat__label', text: label }), el('div', { class: `stat__value ${cls}`, id, text: value }));
}

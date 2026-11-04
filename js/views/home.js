// Home: patrimonio, cash flow del mese (entrate, uscite, tasso di risparmio), Da confermare,
// Da ricevere, budget, obiettivi, promemoria backup. ⚙︎ porta alle Impostazioni.

import { el, card, icon, emptyState, button, list, row } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercent } from '../money.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining } from '../period.js';
import { periodText, remainingHero } from './budget.js';
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

  // Quanto ti resta (numero protagonista, decisione v4 n. 4): entrate − uscite − programmati da pagare nel periodo.
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  const r = remaining(state, p, today);
  const t = C.totals(state, p.from, p.to);
  root.append(remainingHero({
    title: 'Quanto ti resta', prefix: 'home', r, label: `Periodo: ${periodText(p)} · fino al ${formatDateIt(p.to)}`,
    link: el('a', { class: 'card__link', href: '#budget', text: 'Budget' }),
  },
  el('div', { class: 'stats' },
    stat('Entrate', formatEuro(t.income), 'month-income', 'is-income', 'stat--income'),
    stat('Uscite', formatEuro(t.expense), 'month-expense', '', 'stat--expense'),
    stat('Programmati', formatEuro(r.planned), 'home-planned', '', 'stat--planned')),
  el('p', { class: 'hero__sub', id: 'month-cashflow-line' }, 'Cash flow ', el('span', { class: t.net >= 0 ? 'is-income' : 'is-danger', id: 'month-cashflow', text: formatEuroSigned(t.net) }),
    t.income ? ` · risparmio ${formatPercent(t.rate)}` : '')));

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
    accounts.length ? row({ icon: 'cash', color: 'var(--butter-fill)', title: 'Patrimonio', subtitle: nw.crypto.length ? C.cryptoLine(nw) : 'Totale dei conti in euro', value: formatEuro(nw.eurCents), href: '#conti', id: 'home-networth', attrs: { 'data-networth': String(nw.eurCents) } }) : null)));
}

function stat(label, value, id, cls = '', tileCls = '') {
  return el('div', { class: `stat ${tileCls}` }, el('div', { class: 'stat__label', text: label }), el('div', { class: `stat__value ${cls}`, id, text: value }));
}

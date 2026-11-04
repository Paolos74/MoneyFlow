// Home: patrimonio, cash flow del mese (entrate, uscite, tasso di risparmio), Da confermare,
// Da ricevere, budget, obiettivi, promemoria backup. ⚙︎ porta alle Impostazioni.

import { el, card, icon, emptyState, button, progress, list, row } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercent } from '../money.js';
import { monthOf, monthLabel, monthStart, monthEnd } from '../dates.js';
import * as C from '../calc.js';
import { pendingRow, pendingGroups, pendingGroupRow } from './parts.js';
import { openAccountForm } from './conti.js';

export function render(root, ctx) {
  const { store } = ctx;
  const state = store.getState();
  const today = ctx.today();
  const ym = monthOf(today);
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

  // Patrimonio
  const nw = C.netWorth(state);
  // Senza conti la card resta neutra e non fa concorrenza allo stato vuoto.
  root.append(card({ title: 'Patrimonio', cls: accounts.length ? 'card--hero' : '', link: el('a', { class: 'card__link', href: '#conti', text: 'Conti' }) },
    el('p', { class: 'hero__value', id: 'networth', text: formatEuro(nw.eurCents) }),
    nw.crypto.length ? el('p', { class: 'hero__sub', id: 'networth-crypto', text: `${C.cryptoLine(nw)} · senza valore in euro (nessun prezzo)` }) : null));

  // Mese corrente
  const t = C.totals(state, monthStart(ym), monthEnd(ym));
  // Numero grande: cash flow = entrate contate − uscite contate del mese, verde se ≥ 0, rosso se < 0.
  root.append(card({ title: monthLabel(ym), tint: 'teal', icon: 'chart', link: el('a', { class: 'card__link', href: '#statistiche', text: 'Statistiche' }) },
    el('p', { class: 'hero__label', text: 'Cash flow del mese' }),
    el('p', { class: 'hero__value ' + (t.net >= 0 ? 'is-income' : 'is-danger'), id: 'month-cashflow', text: formatEuroSigned(t.net) }),
    el('div', { class: 'stats' },
      stat('Entrate', formatEuro(t.income), 'month-income', 'is-income', 'stat--income'),
      stat('Uscite', formatEuro(t.expense), 'month-expense', '', 'stat--expense'),
      stat('Risparmio', formatPercent(t.rate), 'month-rate', t.rate < 0 ? 'is-danger' : '', 'stat--rate')),
    t.income ? null : el('p', { class: 'hero__sub', text: 'Il tasso di risparmio compare quando registri un\'entrata.' })));

  // Da confermare
  const pending = C.pendingList(state, today);
  if (pending.length) {
    root.append(card({ title: `Da confermare (${pending.length})`, tint: 'violet', icon: 'clock', link: el('a', { class: 'card__link', href: '#da-confermare', text: 'Tutti' }) },
      // Una riga per programmato: con più scadenze arretrate "N scadenze" e Vedi.
      el('div', { class: 'list list--flat' }, pendingGroups(pending).slice(0, 3).map((g, i) => (g.items.length === 1 ? pendingRow(ctx, g.items[0], i) : pendingGroupRow(ctx, g, i))))));
  }

  // Da ricevere
  const credits = C.openCredits(state);
  if (credits.total > 0) {
    root.append(el('div', { class: 'section' }, list(row({
      icon: 'hand', color: 'var(--accent-fill)', title: 'Da ricevere', subtitle: `${credits.items.length} ${credits.items.length === 1 ? 'quota anticipata' : 'quote anticipate'}`,
      value: formatEuro(credits.total), href: '#da-ricevere', id: 'home-credits',
    }))));
  }

  // Budget
  const budgets = C.budgetStatus(state, ym);
  if (budgets.length) {
    root.append(card({ title: 'Budget del mese', tint: 'amber', icon: 'gauge', link: el('a', { class: 'card__link', href: '#impostazioni/budget', text: 'Modifica' }) },
      // Tocco su un budget: Movimenti del mese filtrati per quella categoria.
      budgets.map((b) => el('a', { class: 'meter' + (b.over ? ' is-over' : ''), href: `#movimenti?periodo=mese&categoria=${encodeURIComponent(b.category.id)}`, attrs: { 'data-budget': b.category.id, 'aria-label': `${b.category.name}: vedi i movimenti del mese` } },
        el('div', { class: 'meter__top' }, el('span', { text: b.category.name }), el('span', { text: `${formatEuro(b.spent)} / ${formatEuro(b.budget)}` })),
        progress(b.spent / b.budget, { color: b.category.color, over: b.over }),
        el('div', { class: 'meter__note', text: b.over ? `Superato di ${formatEuro(-b.left)}` : `Restano ${formatEuro(b.left)}` })))));
  }

  // Obiettivi
  // Solo gli obiettivi attivi; i completati sono nella sezione "Completati" della scheda Conti.
  const goals = C.activeGoals(state);
  const anyGoal = state.goals.some((g) => !g.deleted);
  if (goals.length) {
    root.append(card({ title: 'Obiettivi', tint: 'pink', icon: 'target', link: el('a', { class: 'card__link', href: '#conti/obiettivi', text: 'Tutti' }) },
      goals.slice(0, 3).map((g) => {
        const p = C.goalProgress(g, today);
        return el('a', { class: 'meter', href: `#obiettivi/${g.id}` },
          el('div', { class: 'meter__top' }, el('span', { text: g.name }), el('span', { text: `${formatEuro(g.saved)} / ${formatEuro(g.target)}` })),
          progress(g.saved / g.target, { color: g.color }),
          el('div', { class: 'meter__note', text: p.quota ? `${formatEuro(p.monthSaved)} di ${formatEuro(p.quota)} questo mese` : p.expired ? 'Scaduto' : p.monthly ? `${formatEuro(p.monthly)} al mese` : `Mancano ${formatEuro(p.remaining)}` }));
      })));
  }

  root.append(el('div', { class: 'section' }, list(
    row({ icon: 'repeat', color: 'var(--violet-fill)', title: 'Pagamenti programmati', subtitle: 'Abbonamenti, affitto, bollette', href: '#programmati', id: 'home-scheduled' }),
    budgets.length ? null : row({ icon: 'gauge', color: 'var(--amber-fill)', title: 'Imposta un budget', subtitle: 'Limite mensile per categoria', href: '#impostazioni/budget' }),
    anyGoal ? null : row({ icon: 'target', color: 'var(--pink-fill)', title: 'Crea un obiettivo di risparmio', href: '#conti/obiettivi' }))));
}

function stat(label, value, id, cls = '', tileCls = '') {
  return el('div', { class: `stat ${tileCls}` }, el('div', { class: 'stat__label', text: label }), el('div', { class: `stat__value ${cls}`, id, text: value }));
}

// Movimenti: ricerca, filtri per periodo, conto e categoria, lista per giorno con note.
// I filtri restano nello stato della vista (e nell'indirizzo) durante i ridisegni.

import { el, input, select, icon, emptyState, card } from '../ui.js';
import { formatEuro, formatPercent } from '../money.js';
import * as C from '../calc.js';
import { dayGroups, periodPicker } from './parts.js';

let filters = null;

function fromQuery(q, prefs) {
  return {
    key: q.periodo || prefs.get().lastPeriod || 'mese',
    from: q.da || '', to: q.a || '',
    accountId: q.conto || '', categoryId: q.categoria || '', q: q.q || '',
  };
}

export function render(root, ctx) {
  const state = ctx.store.getState();
  if (!filters || ctx.params.reset || Object.keys(ctx.query).length) {
    filters = fromQuery(ctx.query, ctx.prefs);
    if (ctx.params.accountId) filters.accountId = ctx.params.accountId;
  }
  ctx.header({ title: 'Movimenti' });
  const update = (patch) => {
    filters = { ...filters, ...patch };
    if (patch.key && patch.key !== 'custom') ctx.prefs.set({ lastPeriod: patch.key });
    ctx.setQuery({ periodo: filters.key, da: filters.key === 'custom' ? filters.from : '', a: filters.key === 'custom' ? filters.to : '', conto: filters.accountId, categoria: filters.categoryId, q: filters.q });
    ctx.rerender();
  };

  root.append(el('label', { class: 'search', attrs: { for: 'mov-search' } }, icon('search'),
    input({ id: 'mov-search', type: 'search', value: filters.q, placeholder: 'Cerca descrizione, note, importo', onInput: (v) => update({ q: v }), attrs: { 'aria-label': 'Cerca nei movimenti' } })));

  const pp = periodPicker(ctx, filters, (st) => update(st), 'mp');
  root.append(pp.node);

  const accOpts = [{ value: '', label: 'Tutti i conti' }, ...C.sortedAccounts(state).map((a) => ({ value: a.id, label: a.name }))];
  if (filters.accountId && !accOpts.some((o) => o.value === filters.accountId)) accOpts.push({ value: filters.accountId, label: C.accountLabel(state, filters.accountId) });
  const catOpts = [{ value: '', label: 'Tutte le categorie' },
    ...C.sortedCategories(state, 'uscita').map((c) => ({ value: c.id, label: `${c.name} (uscita)` })),
    ...C.sortedCategories(state, 'entrata').map((c) => ({ value: c.id, label: `${c.name} (entrata)` }))];
  if (filters.categoryId && !catOpts.some((o) => o.value === filters.categoryId)) catOpts.push({ value: filters.categoryId, label: C.categoryLabel(state, filters.categoryId) });
  root.append(el('div', { class: 'filters' },
    select({ id: 'mov-account', options: accOpts, value: filters.accountId, onChange: (v) => update({ accountId: v }) }),
    select({ id: 'mov-category', options: catOpts, value: filters.categoryId, onChange: (v) => update({ categoryId: v }) })));

  if (pp.range.error) return;
  const movs = C.searchMovements(state, { from: pp.range.from, to: pp.range.to, accountId: filters.accountId, categoryId: filters.categoryId, q: filters.q });
  let income = 0;
  let expense = 0;
  for (const m of movs) { if (m.type === 'entrata') income += m.amount; else if (m.type === 'uscita') expense += C.countedExpense(m); }
  root.append(card({},
    el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Movimenti' }), el('div', { class: 'stat__value', id: 'mov-count', text: String(movs.length) })),
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Entrate' }), el('div', { class: 'stat__value is-income', id: 'mov-income', text: formatEuro(income) })),
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Uscite' }), el('div', { class: 'stat__value', id: 'mov-expense', text: formatEuro(expense) }))),
    income ? el('p', { class: 'hero__sub', text: `Tasso di risparmio ${formatPercent(C.savingsRate(income, expense))}. Le uscite contano al netto delle quote escluse.` }) : null));

  if (!movs.length) {
    const any = state.movements.some((m) => !m.deleted);
    root.append(emptyState({ icon: 'list', title: any ? 'Nessun movimento trovato' : 'Ancora nessun movimento', text: any ? 'Prova a cambiare periodo, filtri o ricerca.' : 'Tocca + per registrare la prima spesa o entrata.' }));
    return;
  }
  root.append(...dayGroups(ctx, movs));
}

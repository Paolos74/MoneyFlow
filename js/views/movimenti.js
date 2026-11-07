// Movimenti: ricerca, filtri per periodo, conto e categoria, lista per giorno con note.
// I filtri restano nello stato della vista (e nell'indirizzo) durante i ridisegni.
// v4: segmentato "Lista | Calendario" (il calendario non è più una scheda) e pulsante Importa (CSV), dalla v7 sotto il titolo.
// v8: i filtri stanno nel foglio "Filtri" (badge e chip rimovibili sopra la lista), il riepilogo è una riga.

import { el, input, select, icon, emptyState, segmented, sheet, field, button, clear, preserveFocus } from '../ui.js';
import { ValidationError } from '../errors.js';
import { formatEuro, formatPercent } from '../money.js';
import { periodRange, rangeLabel } from '../dates.js';
import * as C from '../calc.js';
import { dayGroups, periodPicker, titleActions } from './parts.js';
import { renderCalendar } from './calendario.js';

const DEFAULT_PERIOD = 'mese';

let filters = null;

function fromQuery(q, prefs) {
  return {
    key: q.periodo || prefs.get().lastPeriod || DEFAULT_PERIOD,
    from: q.da || '', to: q.a || '',
    accountId: q.conto || '', categoryId: q.categoria || '', q: q.q || '',
  };
}

const LIST_KEYS = ['periodo', 'da', 'a', 'conto', 'categoria', 'q'];

export function render(root, ctx) {
  const state = ctx.store.getState();
  const vista = ctx.query.vista === 'calendario' ? 'calendario' : 'lista';
  // v7: in alto a destra c'è solo ⚙︎; Importa CSV sta nella riga di azioni sotto il titolo (vale per Lista e Calendario).
  ctx.header({ title: 'Movimenti' });
  root.append(titleActions(el('a', { class: 'btn btn--small', href: '#impostazioni/importa', id: 'mov-import', attrs: { 'aria-label': 'Importa movimenti da CSV' } }, icon('upload'), 'Importa CSV')));
  root.append(segmented([{ value: 'lista', label: 'Lista', id: 'seg-lista' }, { value: 'calendario', label: 'Calendario', id: 'seg-calendario' }], vista,
    (v) => ctx.go(v === 'calendario' ? 'movimenti?vista=calendario' : 'movimenti'), { label: 'Vista' }));
  if (vista === 'calendario') { renderCalendar(root, ctx); return; }
  if (!filters || ctx.params.reset || LIST_KEYS.some((k) => k in ctx.query)) {
    filters = fromQuery(ctx.query, ctx.prefs);
    if (ctx.params.accountId) filters.accountId = ctx.params.accountId;
  }
  const update = (patch) => {
    filters = { ...filters, ...patch };
    if (patch.key && patch.key !== 'custom') ctx.prefs.set({ lastPeriod: patch.key });
    ctx.setQuery({ periodo: filters.key, da: filters.key === 'custom' ? filters.from : '', a: filters.key === 'custom' ? filters.to : '', conto: filters.accountId, categoria: filters.categoryId, q: filters.q });
    ctx.rerender();
  };

  root.append(el('label', { class: 'search', attrs: { for: 'mov-search' } }, icon('search'),
    input({ id: 'mov-search', type: 'search', value: filters.q, placeholder: 'Cerca descrizione, note, importo', onInput: (v) => update({ q: v }), attrs: { 'aria-label': 'Cerca nei movimenti' } })));

  const today = ctx.today();
  const range = periodRange(filters.key, today, filters);
  root.append(filterBar(ctx, state, filters, range, update));
  if (range.error) return;

  const movs = C.searchMovements(state, { from: range.from, to: range.to, accountId: filters.accountId, categoryId: filters.categoryId, q: filters.q });
  let income = 0;
  let expense = 0;
  for (const m of movs) { if (m.type === 'entrata') income += m.amount; else if (m.type === 'uscita') expense += C.countedExpense(m); }
  // v8 (decisione v8 §1): riepilogo in una riga, così la lista parte più in alto.
  root.append(el('p', { class: 'mov-summary', id: 'mov-summary' },
    el('span', { id: 'mov-count', text: countText(movs.length) }), ' · ',
    el('span', { class: 'is-income', id: 'mov-income', text: '+' + formatEuro(income) }), ' · ',
    el('span', { id: 'mov-expense', text: '−' + formatEuro(expense) }),
    income ? [' · ', el('span', { id: 'mov-rate', text: `risparmio ${formatPercent(C.savingsRate(income, expense))}` })] : null));

  if (!movs.length) {
    const any = state.movements.some((m) => !m.deleted);
    root.append(emptyState({ icon: 'list', title: any ? 'Nessun movimento trovato' : 'Ancora nessun movimento', text: any ? 'Prova a cambiare periodo, filtri o ricerca.' : 'Tocca + per registrare la prima spesa o entrata.' }));
    return;
  }
  root.append(...dayGroups(ctx, movs));
}

const countText = (n) => (n === 1 ? '1 movimento' : `${n} movimenti`);

// Periodo predefinito: Questo mese, anche scritto come Personalizzato con le stesse date (es. da Budget).
function isDefaultPeriod(f, today) {
  if (f.key === DEFAULT_PERIOD) return true;
  const r = periodRange(f.key, today, f);
  const def = periodRange(DEFAULT_PERIOD, today);
  return !r.error && r.from === def.from && r.to === def.to;
}

// Filtri diversi da quelli predefiniti (Questo mese, Tutti i conti, Tutte le categorie): la ricerca resta a parte.
function activeFilterCount(f, today) {
  return (isDefaultPeriod(f, today) ? 0 : 1) + (f.accountId ? 1 : 0) + (f.categoryId ? 1 : 0);
}

function accountOptions(state, f) {
  const opts = [{ value: '', label: 'Tutti i conti' }, ...C.sortedAccounts(state).map((a) => ({ value: a.id, label: a.name }))];
  if (f.accountId && !opts.some((o) => o.value === f.accountId)) opts.push({ value: f.accountId, label: C.accountLabel(state, f.accountId) });
  return opts;
}

function categoryOptions(state, f) {
  const opts = [{ value: '', label: 'Tutte le categorie' },
    ...C.sortedCategories(state, 'uscita').map((c) => ({ value: c.id, label: `${c.name} (uscita)` })),
    ...C.sortedCategories(state, 'entrata').map((c) => ({ value: c.id, label: `${c.name} (entrata)` }))];
  if (f.categoryId && !opts.some((o) => o.value === f.categoryId)) opts.push({ value: f.categoryId, label: C.categoryLabel(state, f.categoryId) });
  return opts;
}

// v8 (decisione v8 §1): pulsante "Filtri" con il badge dei filtri attivi, il periodo sempre leggibile e un chip
// rimovibile per ogni filtro attivo (il periodo diverso da Questo mese torna a Questo mese).
function filterBar(ctx, state, f, range, update) {
  const n = activeFilterCount(f, ctx.today());
  const periodText = range.error ? 'Periodo non valido' : rangeLabel(range.from, range.to);
  const removable = (id, label, what, patch) => el('button', {
    class: 'chip chip--filter', type: 'button', id, attrs: { 'aria-label': `Togli il filtro ${what}: ${label}` },
    on: { click: () => update(patch) },
  }, el('span', { text: label }), icon('close'));
  return el('div', { class: 'mov-filters' },
    el('div', { class: 'mov-filterbar' },
      el('button', {
        class: 'btn btn--small filter-btn', type: 'button', id: 'mov-filters',
        attrs: { 'aria-label': n ? `Filtri, ${n} attivi` : 'Filtri', 'aria-haspopup': 'dialog' },
        on: { click: () => openFilterSheet(ctx, f, update) },
      }, icon('filter'), 'Filtri', n ? el('span', { class: 'filter-badge', id: 'mov-filters-badge', text: String(n), attrs: { 'aria-hidden': 'true' } }) : null),
      isDefaultPeriod(f, ctx.today())
        ? el('span', { class: 'filter-period', id: 'mov-period', text: periodText })
        : removable('mov-chip-periodo', periodText, 'periodo', { key: DEFAULT_PERIOD }),
      f.accountId ? removable('mov-chip-conto', C.accountLabel(state, f.accountId), 'conto', { accountId: '' }) : null,
      f.categoryId ? removable('mov-chip-categoria', C.categoryLabel(state, f.categoryId), 'categoria', { categoryId: '' }) : null),
    range.error ? el('p', { class: 'field__error', id: 'mov-period-error', text: `${range.error}: tocca Filtri per correggere il periodo.`, attrs: { role: 'alert' } }) : null);
}

// Foglio Filtri: periodo (scelte rapide e Personalizzato), conto e categoria su una bozza; "Mostra N movimenti"
// (o Mostra in alto) li applica, "Azzera filtri" riporta la bozza ai predefiniti. Scelta provvisoria v8.
function openFilterSheet(ctx, current, update) {
  const today = ctx.today();
  const d = { key: current.key, from: current.from, to: current.to, accountId: current.accountId, categoryId: current.categoryId };
  let body;
  const rangeOf = () => periodRange(d.key, today, d);
  const draw = () => preserveFocus(() => { clear(body); body.append(...build()); });
  const apply = () => {
    const r = rangeOf();
    if (r.error) throw new ValidationError(r.error, 'period');
    update(d.key === 'custom' ? { ...d } : { ...d, from: '', to: '' });
  };
  function build() {
    const state = ctx.store.getState();
    const pp = periodPicker(ctx, d, (st) => { Object.assign(d, st); draw(); }, 'mp', { wrap: true });
    const r = pp.range;
    const count = r.error ? 0 : C.searchMovements(state, { from: r.from, to: r.to, accountId: d.accountId, categoryId: d.categoryId, q: current.q }).length;
    const isDefault = d.key === DEFAULT_PERIOD && !d.accountId && !d.categoryId;
    return [
      el('p', { class: 'field__label', text: 'Periodo' }),
      el('div', { class: 'filter-sheet__period', dataset: { field: 'period' } }, pp.node, el('p', { class: 'field__error', hidden: true })),
      el('div', { class: 'form-group' },
        field({ label: 'Conto', input: select({ id: 'mov-account', options: accountOptions(state, d), value: d.accountId, onChange: (v) => { d.accountId = v; draw(); } }) }),
        field({ label: 'Categoria', input: select({ id: 'mov-category', options: categoryOptions(state, d), value: d.categoryId, onChange: (v) => { d.categoryId = v; draw(); } }) })),
      el('div', { class: 'filter-sheet__actions' },
        button(r.error ? 'Correggi le date' : count ? `Mostra ${countText(count)}` : 'Nessun movimento da mostrare', () => api.save(), { kind: 'primary', block: true, id: 'mov-filters-show', disabled: !!r.error }),
        button('Azzera filtri', () => { Object.assign(d, { key: DEFAULT_PERIOD, from: '', to: '', accountId: '', categoryId: '' }); draw(); }, { kind: 'plain', block: true, id: 'mov-filters-reset', disabled: isDefault })),
      el('p', { class: 'section-footer', text: current.q ? `Il numero tiene conto anche della ricerca "${current.q}". Le uscite contano al netto delle quote escluse.` : 'Nel riepilogo le uscite contano al netto delle quote escluse.' }),
    ];
  }
  const api = sheet({
    title: 'Filtri', saveLabel: 'Mostra',
    onSave: () => { apply(); return true; },
    content: (s) => { body = s.body; body.append(...build()); },
  });
  return api;
}

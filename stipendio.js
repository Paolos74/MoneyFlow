// Stipendio e tasse: per ogni stipendio netto, lordo facoltativo e trattenute; totali annui.
// Scelta provvisoria: il lordo si scrive sulla singola entrata (campo "Lordo").

import { el, card, list, row, section, emptyState, button, icon } from '../ui.js';
import { formatEuro } from '../money.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { openMovementForm } from './movimento-form.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  const current = Number(ctx.today().slice(0, 4));
  const year = /^\d{4}$/.test(ctx.query.anno || '') ? Number(ctx.query.anno) : current;
  ctx.header({ title: 'Stipendio e tasse', back: { href: '#statistiche', label: 'Statistiche' } });
  const goYear = (y) => ctx.go(`statistiche/stipendio?anno=${y}`);
  root.append(el('div', { class: 'year-switch' },
    el('button', { type: 'button', id: 'year-prev', attrs: { 'aria-label': 'Anno precedente' }, on: { click: () => goYear(year - 1) } }, icon('left')),
    el('strong', { id: 'year-label', text: String(year) }),
    el('button', { type: 'button', id: 'year-next', attrs: { 'aria-label': 'Anno successivo' }, on: { click: () => goYear(year + 1) } }, icon('right'))));

  const y = C.salaryYear(state, year);
  root.append(card({ title: `Totali ${year}` },
    el('div', { class: 'kv' }, el('span', { text: 'Netto (tutti gli stipendi)' }), el('span', { id: 'sal-net', text: formatEuro(y.net) })),
    el('div', { class: 'kv' }, el('span', { text: 'Lordo' }), el('span', { id: 'sal-gross', text: formatEuro(y.gross) })),
    el('div', { class: 'kv' }, el('span', { text: 'Trattenute (lordo − netto)' }), el('span', { id: 'sal-withheld', text: formatEuro(y.withheld) })),
    y.missing ? el('p', { class: 'hero__sub', id: 'sal-missing', text: `${y.missing} ${y.missing === 1 ? 'stipendio' : 'stipendi'} senza lordo: lordo e trattenute contano solo quelli con il lordo (netto relativo ${formatEuro(y.netWithGross)}).` }) : null));

  const stip = C.sortedCategories(state, 'entrata').find((c) => c.role === 'stipendio');
  if (!y.rows.length) {
    root.append(emptyState({ icon: 'doc', title: `Nessuno stipendio nel ${year}`, text: 'Registra lo stipendio come entrata nella categoria Stipendio: il netto come importo e, se vuoi, il lordo.',
      action: C.sortedAccounts(state).length ? button('Aggiungi stipendio', () => openMovementForm(ctx, { preset: { type: 'entrata', categoryId: stip?.id || '' } }), { kind: 'primary', id: 'sal-add' }) : null }));
    return;
  }
  root.append(section({ title: 'Stipendi', footer: 'Tocca una riga per aggiungere o correggere il lordo.' }, list(...y.rows.map((r) => row({
    icon: 'doc', color: C.categoryColor(state, r.movement.categoryId), // La descrizione si mostra solo se dice qualcosa in più del nome della categoria.
    title: `${formatDateIt(r.movement.date)}${r.movement.description && r.movement.description !== C.categoryLabel(state, r.movement.categoryId) ? ' · ' + r.movement.description : ''}`,
    subtitle: r.gross !== null ? `Lordo ${formatEuro(r.gross)} · trattenute ${formatEuro(r.withheld)}` : 'Lordo non inserito',
    value: formatEuro(r.net), valueSub: 'netto', cls: 'row--wrapsub', attrs: { 'data-salary': r.movement.id },
    onClick: () => openMovementForm(ctx, { movement: ctx.store.find('movement', r.movement.id) }),
  })))));
  if (C.sortedAccounts(state).length) root.append(el('div', { class: 'btn-row' }, button('Aggiungi stipendio', () => openMovementForm(ctx, { preset: { type: 'entrata', categoryId: stip?.id || '' } }), { icon: 'plus', id: 'sal-add' })));
}

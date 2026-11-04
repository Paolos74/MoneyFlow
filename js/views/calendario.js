// Calendario: mese da lunedì con pallini colorati per categoria; programmati futuri e da
// confermare con contorno tratteggiato. Tocco su un giorno → movimenti e programmati sotto.
// v4: non è più una scheda ma la vista "Calendario" di Movimenti (#movimenti?vista=calendario&mese=&giorno=).

import { el, icon, list, section, row, emptyState, button } from '../ui.js';
import { monthOf, addMonthsYM, monthLabel, WEEKDAYS_SHORT, formatDayHeader, isValidISO, parseISO } from '../dates.js';
import * as C from '../calc.js';
import { movementRow, plannedSubtitle, scheduledTitle, amountIn } from './parts.js';
import { openConfirmForm, openQuickAdd } from './movimento-form.js';

let selected = null;

// Giorno scelto nel calendario: il + lo usa come data del nuovo movimento.
export const selectedDay = () => selected;

export function renderCalendar(root, ctx) {
  const state = ctx.store.getState();
  const today = ctx.today();
  if (isValidISO(ctx.query.giorno)) selected = ctx.query.giorno;
  let ym = /^\d{4}-\d{2}$/.test(ctx.query.mese || '') ? ctx.query.mese : monthOf(selected || today);
  if (!selected || monthOf(selected) !== ym) selected = monthOf(today) === ym ? today : `${ym}-01`;

  const goMonth = (n) => {
    ym = addMonthsYM(ym, n);
    selected = monthOf(today) === ym ? today : `${ym}-01`;
    ctx.setQuery({ vista: 'calendario', mese: ym, giorno: selected });
    ctx.rerender();
  };
  const pick = (d) => { selected = d; ctx.setQuery({ vista: 'calendario', mese: monthOf(d), giorno: d }); ctx.rerender(); };

  const weeks = C.calendarMonth(state, ym, today);
  const grid = el('div', { class: 'cal__grid', attrs: { role: 'grid', 'aria-label': monthLabel(ym) } });
  for (const w of weeks) {
    for (const day of w) {
      const p = parseISO(day.date);
      const dots = day.dots.slice(0, 3).map((d) => el('span', { class: 'dot' + (d.planned ? ' dot--planned' : ''), vars: { '--c': d.color } }));
      if (day.dots.length > 3) dots.push(el('span', { class: 'cal__more', text: '+' }));
      grid.append(el('button', {
        type: 'button', class: `cal__day${day.inMonth ? '' : ' is-out'}${day.isToday ? ' is-today' : ''}${day.date === selected ? ' is-selected' : ''}`,
        id: 'day-' + day.date, attrs: { 'aria-label': `${formatDayHeader(day.date)}${day.count ? `, ${day.count} voci` : ''}`, 'aria-pressed': String(day.date === selected) },
        on: { click: () => pick(day.date) },
      }, el('span', { class: 'cal__num', text: String(p.d) }), el('span', { class: 'cal__dots' }, dots)));
    }
  }
  root.append(el('div', { class: 'cal' },
    el('div', { class: 'cal__head' },
      el('button', { class: 'topbar__btn', type: 'button', id: 'cal-prev', attrs: { 'aria-label': 'Mese precedente' }, on: { click: () => goMonth(-1) } }, icon('left')),
      el('span', { class: 'cal__month', id: 'cal-month', text: monthLabel(ym) }),
      el('button', { class: 'topbar__btn', type: 'button', id: 'cal-next', attrs: { 'aria-label': 'Mese successivo' }, on: { click: () => goMonth(1) } }, icon('right'))),
    el('div', { class: 'cal__wd', attrs: { 'aria-hidden': 'true' } }, WEEKDAYS_SHORT.map((w) => el('span', { text: w }))),
    grid));
  root.append(el('div', { class: 'legend-inline' },
    el('span', {}, el('span', { class: 'dot', vars: { '--c': 'var(--accent)' } }), 'Registrato'),
    el('span', {}, el('span', { class: 'dot dot--planned', vars: { '--c': 'var(--violet)' } }), 'Programmato'),
    monthOf(today) !== ym ? button('Oggi', () => pick(today), { kind: 'plain', small: true, id: 'cal-today' }) : null));

  const det = C.dayDetails(state, selected, today);
  const year = Number(today.slice(0, 4));
  const parts = [];
  if (det.planned.length) {
    parts.push(section({ title: 'Programmati' }, list(...det.planned.map((p) => row({
      icon: 'clock', color: C.scheduledColor(state, p.sched), planned: true, title: scheduledTitle(state, p.sched),
      subtitle: `${p.pending ? 'Da confermare' : 'Previsto'} · ${plannedSubtitle(state, p.sched)}`, value: amountIn(state, p.sched.accountId, p.sched.amount),
      onClick: p.pending ? () => openConfirmForm(ctx, ctx.store.find('scheduled', p.sched.id), p.date) : () => ctx.go(`programmati/${p.sched.id}`),
    })))));
  }
  if (det.movements.length) parts.push(section({ title: 'Movimenti' }, list(...det.movements.map((m) => movementRow(ctx, m)))));
  root.append(el('h2', { class: 'day-title', id: 'day-title' }, el('span', { text: formatDayHeader(selected, year) })));
  if (parts.length) root.append(...parts);
  else root.append(emptyState({ icon: 'calendar', title: 'Niente in questo giorno' }));
  const day = selected;
  root.append(el('div', { class: 'btn-row' }, button('Aggiungi in questo giorno', () => openQuickAdd(ctx, { date: day }), { small: true, icon: 'plus', id: 'day-add' })));
}

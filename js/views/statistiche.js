// Statistiche: ciambella delle uscite per categoria, barre entrate/uscite per mese, linea del
// patrimonio, tasso di risparmio per mese, riepilogo abbonamenti, accesso a Stipendio e tasse.

import { el, card, list, row, svgNode, emptyState, section } from '../ui.js';
import { formatEuro, formatPercent } from '../money.js';
import { monthOf, monthsBetween, addMonthsYM, monthShortLabel, monthLabel, monthStart, monthEnd } from '../dates.js';
import { donut, bars, line } from '../charts.js';
import * as C from '../calc.js';
import { periodPicker, scheduledTitle } from './parts.js';
import { freqLabel } from '../recurrence.js';

let period = null;

// Euro senza decimali per le etichette dei grafici; da formatEuro, così anche 4 cifre hanno il punto (8.579 €).
const shortEuro = (cents) => {
  const e = Math.round(cents / 100);
  return Math.abs(e) >= 10000 ? `${Math.round(e / 1000)}k €` : formatEuro(e * 100).replace(',00', '');
};

export function render(root, ctx) {
  const state = ctx.store.getState();
  const today = ctx.today();
  if (!period || ctx.query.periodo) {
    period = { key: ctx.query.periodo || ctx.prefs.get().lastPeriod || 'mese', from: ctx.query.da || '', to: ctx.query.a || '' };
  }
  ctx.header({ title: 'Statistiche' });
  const pp = periodPicker(ctx, period, (st) => {
    period = { ...period, ...st };
    if (st.key && st.key !== 'custom') ctx.prefs.set({ lastPeriod: st.key });
    ctx.setQuery({ periodo: period.key, da: period.key === 'custom' ? period.from : '', a: period.key === 'custom' ? period.to : '' });
    ctx.rerender();
  }, 'sp');
  root.append(pp.node);
  if (pp.range.error) return;
  const { from, to } = pp.range;
  // Rotta di Movimenti con lo stesso periodo (e categoria) delle statistiche.
  const periodQuery = period.key === 'custom' ? `periodo=custom&da=${from}&a=${to}` : `periodo=${period.key}`;
  const movHref = (extra = '') => `#movimenti?${periodQuery}${extra}`;

  const t = C.totals(state, from, to);
  root.append(card({ title: 'Nel periodo' },
    el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Entrate' }), el('div', { class: 'stat__value is-income', id: 'st-income', text: formatEuro(t.income) })),
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Uscite' }), el('div', { class: 'stat__value', id: 'st-expense', text: formatEuro(t.expense) })),
      el('div', { class: 'stat' }, el('div', { class: 'stat__label', text: 'Risparmio' }), el('div', { class: `stat__value ${t.rate < 0 ? 'is-danger' : ''}`, id: 'st-rate', text: formatPercent(t.rate) }))),
    el('p', { class: 'hero__sub', text: 'Uscite al netto delle quote escluse. Trasferimenti e restituzioni non contano.' })));

  // Ciambella
  const cats = C.byCategory(state, from, to, 'uscita');
  root.append(card({ title: 'Uscite per categoria' },
    el('div', { class: 'chart chart--donut', id: 'chart-donut' }, svgNode(donut(cats.map((c) => ({ label: `${c.label}: ${formatEuro(c.value)}`, value: c.value, color: c.color })), { thickness: 26, center: formatEuro(t.expense), centerSub: 'uscite', label: 'Uscite per categoria' }))),
    cats.length ? el('ul', { class: 'legend', id: 'legend-donut' }, cats.map((c) => el('li', { attrs: { 'data-category': c.categoryId } },
      el('a', { class: 'legend__link', href: movHref(`&categoria=${encodeURIComponent(c.categoryId)}`), attrs: { 'aria-label': `${c.label}: vedi i movimenti` } },
        el('span', { class: 'chip__dot', vars: { '--c': c.color } }), el('span', { text: c.label }), el('span', { text: `${formatEuro(c.value)} · ${formatPercent(c.pct)}` })))))
      : el('p', { class: 'hero__sub', text: 'Nessuna uscita nel periodo.' })));

  // Mesi del grafico: quelli del periodo, oppure i 6 che finiscono col mese scelto se è uno solo (massimo 24).
  let months = monthsBetween(monthOf(from), monthOf(to));
  if (months.length < 2) months = monthsBetween(addMonthsYM(monthOf(to), -5), monthOf(to));
  if (months.length > 24) months = months.slice(-24);
  const bm = C.byMonth(state, months);
  root.append(card({ title: 'Entrate e uscite per mese' },
    el('div', { class: 'legend-keys' }, el('span', {}, el('span', { class: 'key' }), 'Entrate'), el('span', {}, el('span', { class: 'key key--exp' }), 'Uscite')),
    el('div', { class: 'chart', id: 'chart-bars' }, svgNode(bars(bm.map((m) => ({ label: monthShortLabel(m.month), income: m.income, expense: m.expense })), { format: formatEuro })))));

  const nws = C.netWorthSeries(state, months);
  root.append(card({ title: 'Andamento del patrimonio (conti in euro)' },
    el('div', { class: 'chart', id: 'chart-line' }, svgNode(line(nws.map((p) => ({ label: monthShortLabel(p.month), value: p.eurCents })), { format: shortEuro, label: 'Patrimonio a fine mese' }))),
    el('p', { class: 'hero__sub', text: 'Saldo a fine mese. Le crypto restano fuori dal totale in euro.' })));

  root.append(section({ title: 'Tasso di risparmio per mese' }, list(...bm.slice().reverse().map((m) => row({
    title: monthLabel(m.month), subtitle: `Entrate ${formatEuro(m.income)} · uscite ${formatEuro(m.expense)}`,
    value: m.income ? formatPercent(m.rate) : '—', valueClass: m.rate < 0 ? 'is-danger' : '',
    href: `#movimenti?periodo=custom&da=${monthStart(m.month)}&a=${monthEnd(m.month)}`, attrs: { 'data-rate-month': m.month },
  })))));

  // Abbonamenti e ricorrenti
  const rs = C.recurringSummary(state, today);
  root.append(section({ title: 'Abbonamenti e ricorrenti', action: el('a', { href: '#programmati', text: 'Gestisci' }) },
    rs.items.length ? list(
      row({ title: 'Al mese', value: formatEuro(rs.monthly), id: 'rec-monthly' }),
      row({ title: 'All\'anno', value: formatEuro(rs.yearly), id: 'rec-yearly' }),
      ...rs.items.map((i) => row({ icon: 'repeat', color: C.scheduledColor(state, i.sched), planned: true, title: scheduledTitle(state, i.sched), subtitle: freqLabel(i.sched), value: formatEuro(i.monthly), valueSub: 'al mese', href: `#programmati/${i.sched.id}` })))
      : emptyState({ icon: 'repeat', title: 'Nessun abbonamento', text: 'Le uscite programmate ripetute compaiono qui con il costo al mese e all\'anno.' })));

  root.append(section({}, list(row({ icon: 'doc', color: '#4F46E5', title: 'Stipendio e tasse', subtitle: 'Lordo, netto, trattenute e totali annui', href: '#statistiche/stipendio', id: 'link-salary' }))));
}

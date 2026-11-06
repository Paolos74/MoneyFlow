// Pezzi di interfaccia condivisi tra le viste: righe dei movimenti, gruppi per giorno,
// programmati da confermare, selettore del periodo.

import { el, row, section, list, chips, field, input, icon, button } from '../ui.js';
import { formatEuro, formatEuroSigned, formatQty, formatPrice4 } from '../money.js';
import { etfOf, qtyText } from '../invest.js';
import { formatDayHeader, formatDateIt, PERIODS, periodRange } from '../dates.js';
import { freqLabel } from '../recurrence.js';
import * as C from '../calc.js';
import { openMovementForm, openConfirmForm, skipWithUndo } from './movimento-form.js';

const TYPE_ICON = { uscita: 'tag', entrata: 'down', trasferimento: 'transfer', restituzione: 'hand', variazione: 'coin' };
const TYPE_LABEL = { uscita: 'Uscita', entrata: 'Entrata', trasferimento: 'Trasferimento', restituzione: 'Restituzione', variazione: 'Variazione quantità' };

const accountOf = (state, id) => state.accounts.find((a) => a.id === id) || null;

export function amountIn(state, accountId, v) {
  const a = accountOf(state, accountId);
  return a && a.kind === 'crypto' ? formatQty(v, a.asset) : formatEuro(v);
}

function signedIn(state, accountId, v) {
  const a = accountOf(state, accountId);
  if (a && a.kind === 'crypto') return (v > 0 ? '+' : '') + formatQty(v, a.asset);
  return formatEuroSigned(v);
}

const typeLabelOf = (m) => (m.type === 'variazione' && m.align ? 'Rettifica saldo' : TYPE_LABEL[m.type]);

export function movementTitle(state, m) {
  if (m.description) return m.description;
  if (C.isTrade(m)) return C.tradeLabel(state, m);
  if (m.type === 'entrata' && m.etfId) return `Dividendo ${etfOf(state, m.etfId)?.name || 'ETF'}`;
  if (m.type === 'uscita' || m.type === 'entrata') return C.categoryLabel(state, m.categoryId);
  return typeLabelOf(m);
}

// Compra/Vendi di un ETF (v5): "10 quote × 50,00 € · Conto principale"; il valore è in euro dal punto di vista
// del conto (−501,00 € / +346,99 €), oppure in quote nella pagina dell'ETF ("+10 quote", sotto "pagati 501,00 €").
function etfTradeRow(ctx, m, { accountId, etfId }) {
  const state = ctx.store.getState();
  const buy = m.trade === 'compra';
  const qty = buy ? m.amountTo : m.amount;
  const eurId = buy ? m.accountId : m.toAccountId;
  const sub = [`${qtyText(qty)} × ${formatPrice4(m.price)}`];
  if (!accountId) sub.push(C.accountLabel(state, eurId));
  let value;
  let valueSub = null;
  let valueClass = '';
  if (etfId) {
    value = `${buy ? '+' : '-'}${qtyText(qty)}`;
    valueSub = buy ? `pagati ${formatEuro(m.amount)}` : `arrivati ${formatEuro(m.amountTo)}`;
    if (buy) valueClass = 'is-income';
  } else if (accountId) {
    const eff = C.movementEffect(m, accountId);
    value = formatEuroSigned(eff);
    if (eff > 0) valueClass = 'is-income';
  } else {
    value = buy ? formatEuro(-m.amount) : formatEuroSigned(m.amountTo);
    valueClass = 'is-muted';
  }
  const extras = m.note ? [el('span', { attrs: { 'aria-label': 'Con nota', title: m.note } }, icon('note'))] : [];
  return row({
    icon: buy ? 'down' : 'up', color: etfOf(state, m.etfId)?.color || C.movementColor(state, m), title: movementTitle(state, m),
    subtitle: [el('span', { text: sub.join(' · ') }), ...extras], value, valueSub, valueClass, chevron: false,
    attrs: { 'data-movement': m.id },
    onClick: () => openMovementForm(ctx, { movement: ctx.store.find('movement', m.id) }),
  });
}

// Riga di un movimento; con accountId mostra l'effetto su quel conto, con etfId (pagina dell'ETF) le quote.
export function movementRow(ctx, m, { accountId = null, etfId = null } = {}) {
  if (m.etfId && C.isTrade(m)) return etfTradeRow(ctx, m, { accountId, etfId });
  const state = ctx.store.getState();
  const sub = [];
  if (C.isTrade(m)) {
    // "0,01 BTC × 60.000,00 €"
    const qty = m.trade === 'compra' ? m.amountTo : m.amount;
    const cryptoId = m.trade === 'compra' ? m.toAccountId : m.accountId;
    sub.push(`${amountIn(state, cryptoId, qty)} × ${formatEuro(m.price)}`);
    if (!accountId) sub.push(C.accountLabel(state, m.trade === 'compra' ? m.accountId : m.toAccountId));
  } else if (m.type === 'trasferimento') sub.push(`${C.accountLabel(state, m.accountId)} → ${C.accountLabel(state, m.toAccountId)}`);
  else {
    if (m.type === 'uscita' || m.type === 'entrata') sub.push(C.categoryLabel(state, m.categoryId));
    if (m.type === 'restituzione' || m.type === 'variazione') sub.push(typeLabelOf(m));
    if (!accountId) sub.push(C.accountLabel(state, m.accountId));
  }
  let value;
  let valueSub = null;
  let valueClass = '';
  if (accountId) {
    const eff = C.movementEffect(m, accountId);
    value = signedIn(state, accountId, eff);
    if (eff > 0) valueClass = 'is-income';
  } else if (m.type === 'uscita') {
    value = formatEuro(-m.amount);
  } else if (m.type === 'entrata') {
    value = formatEuroSigned(m.amount);
    valueClass = 'is-income';
  } else if (m.type === 'restituzione') {
    value = formatEuroSigned(m.amount);
  } else if (m.type === 'variazione') {
    value = signedIn(state, m.accountId, m.amount);
  } else {
    value = amountIn(state, m.accountId, m.amount);
    valueClass = 'is-muted';
  }
  if (m.type === 'uscita' && m.excluded) valueSub = `conta ${formatEuro(m.amount - m.excluded)}`;
  if (m.type === 'entrata' && m.gross) valueSub = `lordo ${formatEuro(m.gross)}`;
  if (m.type === 'trasferimento' && m.amountTo) valueSub = `→ ${amountIn(state, m.toAccountId, m.amountTo)}`;
  // Compra/Vendi visti dal conto crypto: sotto la quantità l'importo in euro pagato o ricevuto.
  const trade = C.isTrade(m);
  const cryptoId = trade ? (m.trade === 'compra' ? m.toAccountId : m.accountId) : null;
  if (trade && accountId === cryptoId) valueSub = m.trade === 'compra' ? `pagati ${formatEuro(m.amount)}` : `ricevuti ${formatEuro(m.amountTo)}`;
  const extras = [];
  if (m.type === 'uscita' && m.excluded) extras.push(el('span', { class: 'tag tag--accent', text: `esclusi ${formatEuro(m.excluded)}` }));
  if (m.note) extras.push(el('span', { attrs: { 'aria-label': 'Con nota', title: m.note } }, icon('note')));
  return row({
    // Compra/Vendi: freccia in giù (entra crypto) o in su (esce crypto), sempre col colore del conto crypto.
    icon: trade ? (m.trade === 'compra' ? 'down' : 'up') : m.type === 'uscita' || m.type === 'entrata' ? C.categoryIcon(state, m.categoryId) : m.align ? 'edit' : TYPE_ICON[m.type],
    color: trade ? (accountOf(state, cryptoId)?.color || C.movementColor(state, m)) : C.movementColor(state, m), title: movementTitle(state, m),
    subtitle: [el('span', { text: sub.join(' · ') }), ...extras], value, valueSub, valueClass, chevron: false,
    attrs: { 'data-movement': m.id },
    onClick: () => openMovementForm(ctx, { movement: ctx.store.find('movement', m.id) }),
  });
}

// Movimenti raggruppati per giorno, con il saldo del giorno (entrate − uscite contate).
export function dayGroups(ctx, movs, opts = {}) {
  const year = Number(ctx.today().slice(0, 4));
  return C.groupByDay(movs).map((g) => section({ cls: 'day' },
    el('h2', { class: 'section-header' }, el('span', { text: formatDayHeader(g.date, year) }), g.total ? el('span', { class: 'is-muted', text: formatEuroSigned(g.total) }) : null),
    list(...g.items.map((m) => movementRow(ctx, m, opts)))));
}

export function plannedSubtitle(state, s) {
  const parts = [freqLabel(s)];
  if (s.type === 'trasferimento') parts.push(`${C.accountLabel(state, s.accountId)} → ${C.accountLabel(state, s.toAccountId)}`);
  else parts.push(C.categoryLabel(state, s.categoryId), C.accountLabel(state, s.accountId));
  return parts.join(' · ');
}

export function scheduledTitle(state, s) {
  return s.description || (s.type === 'trasferimento' ? 'Trasferimento' : C.categoryLabel(state, s.categoryId));
}

// Riga "da confermare": sopra titolo, data e importo; sotto i pulsanti Salta e Conferma.
export function pendingRow(ctx, { sched, date }, idx = 0) {
  const state = ctx.store.getState();
  const where = sched.type === 'trasferimento' ? `${C.accountLabel(state, sched.accountId)} → ${C.accountLabel(state, sched.toAccountId)}` : C.accountLabel(state, sched.accountId);
  return el('div', { class: 'row row--stack', attrs: { 'data-pending': `${sched.id}|${date}` } },
    el('span', { class: 'row__icon row__icon--planned', vars: { '--c': C.scheduledColor(state, sched) } }, icon('clock')),
    el('span', { class: 'row__main' },
      el('span', { class: 'row__title', text: scheduledTitle(state, sched) }),
      el('span', { class: 'row__sub' }, el('span', { text: `${formatDateIt(date)} · ${where}` }))),
    el('span', { class: 'row__value row__value--strong', text: amountIn(state, sched.accountId, sched.amount) }),
    el('span', { class: 'row__actions' },
      button('Salta', () => skipWithUndo(ctx, sched, date), { id: `skip-${idx}` }),
      button('Conferma', () => openConfirmForm(ctx, ctx.store.find('scheduled', sched.id), date), { kind: 'primary', id: `confirm-${idx}` })));
}

// Scadenze da confermare raggruppate per programmato, nell'ordine della prima scadenza.
export function pendingGroups(pending) {
  const map = new Map();
  for (const p of pending) {
    if (!map.has(p.sched.id)) map.set(p.sched.id, { sched: p.sched, items: [] });
    map.get(p.sched.id).items.push(p);
  }
  return [...map.values()];
}

// Riga di un programmato con più scadenze arretrate: "Spotify · 3 scadenze" e Vedi.
export function pendingGroupRow(ctx, { sched, items }, idx = 0) {
  const state = ctx.store.getState();
  const n = items.length;
  const title = scheduledTitle(state, sched);
  return el('div', { class: 'row row--stack', attrs: { 'data-pending-group': sched.id } },
    el('span', { class: 'row__icon row__icon--planned', vars: { '--c': C.scheduledColor(state, sched) } }, icon('clock')),
    el('span', { class: 'row__main' },
      el('span', { class: 'row__title', text: `${title} · ${n} scadenze` }),
      el('span', { class: 'row__sub' }, el('span', { text: `Dal ${formatDateIt(items[0].date)} · ${amountIn(state, sched.accountId, sched.amount)} ciascuna` }))),
    el('span', { class: 'row__value row__value--strong', text: amountIn(state, sched.accountId, sched.amount * n) }),
    el('span', { class: 'row__actions' },
      button('Vedi', () => ctx.go(`da-confermare?programmato=${encodeURIComponent(sched.id)}`), { kind: 'primary', id: `pending-group-${idx}`, label: `Vedi le ${n} scadenze di ${title}` })));
}

// Selettore del periodo (D8). state = { key, from, to }; "Personalizzato" parte dal periodo mostrato.
export function periodPicker(ctx, st, onChange, idPrefix = 'p') {
  const today = ctx.today();
  const range = periodRange(st.key, today, st);
  const wrap = el('div', { class: 'period' },
    chips(PERIODS.map((p) => ({ value: p.key, label: p.label, id: `${idPrefix}-${p.key}` })), st.key, (key) => {
      if (key === 'custom') {
        const cur = periodRange(st.key, today, st);
        onChange({ key, from: cur.from, to: cur.to });
      } else onChange({ key });
    }, { label: 'Periodo' }));
  if (st.key === 'custom') {
    const f = field({ label: 'Dal', id: `${idPrefix}-from`, input: input({ id: `${idPrefix}-from`, type: 'date', value: st.from || '', onInput: (v) => onChange({ ...st, from: v }) }) });
    const t = field({ label: 'Al', id: `${idPrefix}-to`, input: input({ id: `${idPrefix}-to`, type: 'date', value: st.to || '', onInput: (v) => onChange({ ...st, to: v }) }) });
    wrap.append(el('div', { class: 'range' }, f, t));
    if (range.error) wrap.append(el('p', { class: 'field__error', id: `${idPrefix}-error`, text: range.error, attrs: { role: 'alert' } }));
  }
  return { node: wrap, range };
}

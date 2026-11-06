// Pagina di un ETF (v5, design §7): valore, quote, prezzo medio di carico, guadagno, plusvalenza realizzata,
// pulsanti Compra, Vendi, Dividendo, Aggiorna valore; movimenti per giorno; Modifica ed Elimina con Annulla.

import { el, card, button, emptyState, confirmDialog, toast, attempt, list } from '../ui.js';
import { formatEuro, formatEuroSigned, formatPercentSigned, formatPrice4, formatQty, formatRateBp } from '../money.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { etfSummary } from '../invest.js';
import { openEtfTradeForm, openDividendForm, openEtfPriceSheet } from './movimento-form.js';
import { openInvestmentForm } from './conti.js';
import { dayGroups } from './parts.js';

const tone = (v) => (v > 0 ? 'is-income' : v < 0 ? 'is-danger' : '');

export function render(root, ctx) {
  const state = ctx.store.getState();
  const id = ctx.path[1];
  const etf = ctx.store.find('investment', id);
  if (!etf || etf.deleted) {
    ctx.header({ title: 'ETF', back: { href: '#conti', label: 'Conti' } });
    root.append(emptyState({ icon: 'chart', title: etf ? 'ETF eliminato' : 'ETF non trovato', text: etf ? 'I suoi movimenti restano in Movimenti con l\'etichetta "(eliminato)".' : '' }));
    return;
  }
  const edit = el('button', { class: 'topbar__btn', type: 'button', text: 'Modifica', id: 'etf-edit', on: { click: () => openInvestmentForm(ctx, etf) } });
  ctx.header({ title: etf.name, back: { href: '#conti', label: 'Conti' }, actions: [edit] });

  const s = etfSummary(state, etf.id);
  const v = s.valueInfo;
  const valueText = formatEuro(s.value);
  let unit;
  if (s.qty > 0 && v) {
    unit = v.source === 'manual'
      ? `Valore di 1 quota: ${formatPrice4(v.price4)} al ${formatDateIt(v.date)}`
      : `Valore di 1 quota: ${formatPrice4(v.price4)}, prezzo d'acquisto del ${formatDateIt(v.date)}`;
  } else unit = s.sales.length ? 'Hai venduto tutte le quote' : 'Nessuna quota: registra il primo acquisto con Compra.';
  const kv = (label, text, kid, cls = '') => el('div', { class: 'kv' }, el('span', { text: label }), el('span', { class: cls, id: kid, text }));
  root.append(card({ title: 'Valore', icon: 'chart', color: etf.color, cls: 'card--etf' },
    el('p', { class: 'hero__value' + (valueText.length > 12 ? ' is-long' : ''), id: 'etf-value', text: valueText }),
    el('p', { class: 'hero__sub', id: 'etf-unit', text: unit }),
    el('div', { class: 'ledger' },
      kv('Quote possedute', formatQty(s.qty), 'etf-qty'),
      s.qty > 0 ? kv('Prezzo medio di carico', formatPrice4(s.avgPrice4), 'etf-avg') : null,
      s.qty > 0 ? kv('Guadagno o perdita', `${formatEuroSigned(s.gain)} · ${formatPercentSigned(s.gainPct)}`, 'etf-gain', tone(s.gain)) : null,
      s.sales.length ? kv('Plusvalenza realizzata', formatEuroSigned(s.realized), 'etf-realized', tone(s.realized)) : null,
      kv('Tasse sulle vendite', `${etf.taxRegime === 'dichiarativo' ? 'Dichiarativo' : 'Amministrato'} · ${formatRateBp(etf.taxRateBp)}`, 'etf-regime', 'is-muted'))));

  // Compra, Vendi e Dividendo servono un conto in euro; Aggiorna valore no.
  const hasEur = C.sortedAccounts(state).some((a) => a.kind === 'eur');
  const btns = [];
  if (hasEur) {
    btns.push(button('Compra', () => openEtfTradeForm(ctx, { side: 'compra', etfId: etf.id }), { kind: 'gold', icon: 'down', id: 'etf-buy' }));
    if (s.qty > 0) btns.push(button('Vendi', () => openEtfTradeForm(ctx, { side: 'vendi', etfId: etf.id }), { kind: 'gold-soft', icon: 'up', id: 'etf-sell' }));
    btns.push(button('Dividendo', () => openDividendForm(ctx, { etfId: etf.id }), { icon: 'coin', id: 'etf-dividend' }));
  }
  btns.push(button('Aggiorna valore', () => openEtfPriceSheet(ctx, etf), { icon: 'edit', id: 'etf-price' }));
  root.append(el('div', { class: 'section' },
    hasEur ? null : el('p', { class: 'section-footer', id: 'etf-no-eur', text: 'Per comprare serve un conto in euro.' }),
    el('div', { class: 'btn-row btn-row--grid' }, btns)));

  const movs = C.searchMovements(state, { etfId: etf.id });
  if (movs.length) root.append(...dayGroups(ctx, movs, { etfId: etf.id }));
  else root.append(emptyState({ icon: 'chart', title: 'Nessun movimento', text: 'Acquisti, vendite e dividendi di questo ETF compariranno qui.' }));

  root.append(el('div', { class: 'section' }, list(el('button', { type: 'button', class: 'row row--danger row--noicon', id: 'etf-delete', text: 'Elimina ETF', on: { click: async () => {
    const ok = await confirmDialog({
      title: `Eliminare "${etf.name}"?`,
      message: 'L\'ETF sparisce dalla lista e dal patrimonio. I suoi movimenti restano in Movimenti come "(eliminato)".',
      confirmLabel: 'Elimina', destructive: true,
    });
    if (!ok) return;
    if (attempt(() => ctx.store.deleteInvestment(etf.id))) {
      ctx.go('conti');
      toast('ETF eliminato', { undo: () => ctx.store.restoreInvestment(etf.id) });
    }
  } } }))));
}

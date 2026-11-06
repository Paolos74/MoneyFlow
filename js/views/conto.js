// Dettaglio di un conto: saldo, movimenti per giorno, modifica, trasferimento,
// Compra/Vendi e variazione quantità (crypto), elimina conto lasciando i movimenti (D6).
// v4: per un deposito senza vincoli la card Interessi, "Cambia tasso da una data" e "Allinea al saldo reale".
// v6: conto crypto con il valore in euro (Aggiorna valore o prezzo d'acquisto) e il pulsante Aggiorna valore.

import { el, card, button, emptyState, confirmDialog, toast, attempt, list, sheet, field, input } from '../ui.js';
import { formatEuro, formatPercentBp, parsePercentInput, parseEuroInput } from '../money.js';
import { formatDateIt, monthOf } from '../dates.js';
import { ValidationError } from '../errors.js';
import { alignId, reconcileInterest } from '../interest.js';
import * as C from '../calc.js';
import { openMovementForm, openTradeForm, openCryptoPriceSheet } from './movimento-form.js';
import { openAccountForm } from './conti.js';
import { dayGroups, amountIn } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  const id = ctx.path[1];
  const a = ctx.store.find('account', id);
  if (!a || a.deleted) {
    ctx.header({ title: 'Conto', back: { href: '#conti', label: 'Conti' } });
    root.append(emptyState({ icon: 'wallet', title: a ? 'Conto eliminato' : 'Conto non trovato', text: a ? 'I suoi movimenti restano in Movimenti e nelle statistiche con l\'etichetta "(eliminato)".' : '' }));
    return;
  }
  const edit = el('button', { class: 'topbar__btn', type: 'button', text: 'Modifica', id: 'acc-edit', on: { click: () => openAccountForm(ctx, a) } });
  ctx.header({ title: a.name, back: { href: '#conti', label: 'Conti' }, actions: [edit] });
  const bal = C.accountBalance(state, a.id);
  root.append(card({ title: a.kind === 'crypto' ? `Quantità · ${a.asset}` : 'Saldo', icon: C.accountIcon(a), color: a.color },
    el('p', { class: `hero__value ${bal < 0 ? 'is-danger' : ''}`, id: 'acc-balance', text: amountIn(state, a.id, bal) }),
    el('p', { class: 'hero__sub', text: `Saldo iniziale ${amountIn(state, a.id, a.initial)}` }),
    a.kind === 'crypto' ? el('p', { class: 'hero__sub', id: 'acc-value', text: cryptoValueText(state, a, bal) }) : null));
  if (a.kind === 'eur' && a.deposit) root.append(interestCard(ctx, a));
  const actions = [];
  if (a.kind === 'eur') {
    actions.push(button('Uscita', () => openMovementForm(ctx, { preset: { type: 'uscita', accountId: a.id }, showRecents: true }), { icon: 'up', small: true, id: 'acc-out' }));
    actions.push(button('Entrata', () => openMovementForm(ctx, { preset: { type: 'entrata', accountId: a.id } }), { icon: 'down', small: true, id: 'acc-in' }));
  } else {
    // Compra/Vendi: servono almeno un conto in euro.
    if (C.sortedAccounts(state).some((x) => x.kind === 'eur')) {
      actions.push(button('Compra', () => openTradeForm(ctx, { side: 'compra', cryptoAccountId: a.id }), { kind: 'gold', icon: 'down', small: true, id: 'acc-buy' }));
      actions.push(button('Vendi', () => openTradeForm(ctx, { side: 'vendi', cryptoAccountId: a.id }), { kind: 'gold-soft', icon: 'up', small: true, id: 'acc-sell' }));
    }
    actions.push(button('Aggiorna valore', () => openCryptoPriceSheet(ctx, a), { icon: 'edit', small: true, id: 'acc-price' }));
    actions.push(button('Variazione quantità', () => openMovementForm(ctx, { preset: { type: 'variazione', accountId: a.id } }), { icon: 'coin', small: true, id: 'acc-var' }));
  }
  if (C.sortedAccounts(state).length > 1) actions.push(button('Trasferisci', () => openMovementForm(ctx, { preset: { type: 'trasferimento', accountId: a.id } }), { icon: 'transfer', small: true, id: 'acc-transfer' }));
  root.append(el('div', { class: 'btn-row section' }, actions));

  const movs = C.searchMovements(state, { accountId: a.id });
  if (movs.length) root.append(...dayGroups(ctx, movs, { accountId: a.id }));
  else root.append(emptyState({ icon: 'list', title: 'Nessun movimento', text: 'I movimenti di questo conto compariranno qui.' }));

  root.append(el('div', { class: 'section' }, list(el('button', { type: 'button', class: 'row row--danger row--noicon', id: 'acc-delete', text: 'Elimina conto', on: { click: async () => {
    const ok = await confirmDialog({
      title: `Eliminare "${a.name}"?`,
      message: 'Il conto sparisce dalle liste e dal patrimonio. I suoi movimenti restano in Movimenti, nel calendario e nelle statistiche come "(eliminato)".',
      confirmLabel: 'Elimina', destructive: true,
    });
    if (!ok) return;
    if (attempt(() => ctx.store.deleteAccount(a.id))) {
      ctx.go('conti');
      toast('Conto eliminato', { undo: () => ctx.store.restoreAccount(a.id) });
    }
  } } }))));
}

// Valore in euro di un conto crypto (decisione v6 §2): quantità × valore di 1 unità, con la data del valore.
// Senza valore (nessuna Compra e nessun Aggiorna valore) invita ad Aggiorna valore.
function cryptoValueText(state, a, units) {
  const info = C.cryptoUnitValue(state, a);
  if (!info) return units > 0 ? 'Nessun valore in euro: tocca Aggiorna valore' : 'Nessun valore in euro';
  const when = info.source === 'manual' ? `al ${formatDateIt(info.date)}` : `prezzo d'acquisto del ${formatDateIt(info.date)}`;
  return `Valore ${formatEuro(C.cryptoValue(units, info))} · 1 ${a.asset} = ${formatEuro(info.price)} ${info.source === 'manual' ? when : `(${when})`}`;
}

// Card "Interessi": tasso attuale, netti del mese e dell'anno, ritenuta stimata dell'anno.
function interestCard(ctx, a) {
  const state = ctx.store.getState();
  const today = ctx.today();
  const dep = a.deposit;
  const rate = [...dep.rates].reverse().find((r) => r.from <= today) || dep.rates[0];
  const own = state.movements.filter((m) => !m.deleted && m.type === 'entrata' && m.interest && m.interest.accountId === a.id);
  const month = own.filter((m) => m.interest.month === monthOf(today)).reduce((t, m) => t + m.amount, 0);
  const year = own.filter((m) => m.interest.month.slice(0, 4) === today.slice(0, 4)).reduce((t, m) => t + m.amount, 0);
  // Stima: netto × ritenuta / (100 % − ritenuta), perché il netto è il lordo meno la ritenuta.
  const withheld = dep.withholdingBp < 10000 ? Math.round((year * dep.withholdingBp) / (10000 - dep.withholdingBp)) : null;
  const next = dep.rates.find((r) => r.from > today);
  return card({ title: 'Interessi', tint: 'emerald', icon: 'percent' },
    el('div', { class: 'kv' }, el('span', { text: 'Tasso annuo lordo' }), el('span', { id: 'dep-rate', text: formatPercentBp(rate.rateBp) })),
    el('div', { class: 'kv' }, el('span', { text: 'Netti questo mese' }), el('span', { class: 'is-income', id: 'dep-month', text: formatEuro(month) })),
    el('div', { class: 'kv' }, el('span', { text: `Netti nel ${today.slice(0, 4)}` }), el('span', { class: 'is-income', id: 'dep-year', text: formatEuro(year) })),
    withheld !== null ? el('div', { class: 'kv' }, el('span', { text: `Ritenuta ${formatPercentBp(dep.withholdingBp)} trattenuta (stima)` }), el('span', { id: 'dep-withheld', text: formatEuro(withheld) })) : null,
    el('p', { class: 'hero__sub', text: `Calcolati ogni giorno sul saldo di fine giornata dal ${formatDateIt(dep.start)} a ieri e aggiunti da soli: un movimento "Interessi" al mese.${next ? ` Dal ${formatDateIt(next.from)} il tasso sarà ${formatPercentBp(next.rateBp)}.` : ''}` }),
    el('div', { class: 'btn-row' },
      button('Cambia tasso da una data', () => openRateSheet(ctx, a), { small: true, icon: 'percent', id: 'dep-rate-change' }),
      button('Allinea al saldo reale', () => openAlignSheet(ctx, a), { small: true, icon: 'check', id: 'dep-align' })));
}

function openRateSheet(ctx, a) {
  const d = { date: ctx.today(), rateText: '' };
  sheet({
    title: 'Cambia tasso',
    content: (s) => {
      s.body.append(
        el('p', { class: 'section-footer', text: 'Il nuovo tasso vale da questa data in poi; i giorni prima restano al tasso di allora.' }),
        el('div', { class: 'form-group' },
          field({ label: 'Nuovo tasso annuo lordo (%)', field: 'rate', id: 'r-rate', input: input({ id: 'r-rate', value: d.rateText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.rateText = v; } }) }),
          field({ label: 'Dal giorno', field: 'rdate', id: 'r-date', input: input({ id: 'r-date', type: 'date', value: d.date, cls: 'input--date', onInput: (v) => { d.date = v; } }) })));
      setTimeout(() => document.getElementById('r-rate')?.focus(), 0);
    },
    onSave: () => {
      const rateBp = parsePercentInput(d.rateText, { max: 2000 });
      if (!rateBp) throw new ValidationError(d.rateText.trim() ? 'Tasso non valido (es. 2,25), al massimo 20 %' : 'Inserisci il tasso', 'rate');
      const acc = ctx.store.find('account', a.id);
      if (!d.date || d.date < acc.deposit.start) throw new ValidationError(`Scegli un giorno dal ${formatDateIt(acc.deposit.start)} in poi`, 'rdate');
      const rates = [...acc.deposit.rates.filter((r) => r.from !== d.date), { from: d.date, rateBp }];
      const prev = acc.deposit;
      ctx.store.updateAccount(a.id, { deposit: { ...acc.deposit, rates } });
      toast(`Tasso ${formatPercentBp(rateBp)} dal ${formatDateIt(d.date)}`, { undo: () => ctx.store.updateAccount(a.id, { deposit: prev }) });
      return true;
    },
  });
}

// "Allinea al saldo reale": l'utente scrive il saldo che vede nell'app della banca; la rettifica si ricalcola
// a ogni passaggio del motore, così il saldo a quella data resta quello scritto.
function openAlignSheet(ctx, a) {
  const d = { date: ctx.today(), balanceText: '' };
  sheet({
    title: 'Allinea al saldo reale',
    saveLabel: 'Allinea',
    content: (s) => {
      s.body.append(
        el('p', { class: 'section-footer', text: `Saldo calcolato oggi: ${formatEuro(C.accountBalance(ctx.store.getState(), a.id))}. Scrivi quello che vedi nella banca: la differenza diventa una rettifica, che non conta né come entrata né come uscita.` }),
        el('div', { class: 'form-group' },
          field({ label: 'Saldo reale (€)', field: 'balance', id: 'al-balance', input: input({ id: 'al-balance', value: d.balanceText, inputmode: 'decimal', placeholder: '0,00', cls: 'input--amount', onInput: (v) => { d.balanceText = v; } }) }),
          field({ label: 'Alla data', field: 'date', id: 'al-date', hint: 'Il saldo a fine giornata di questa data (di solito oggi).', input: input({ id: 'al-date', type: 'date', value: d.date, cls: 'input--date', onInput: (v) => { d.date = v; } }) })));
      setTimeout(() => document.getElementById('al-balance')?.focus(), 0);
    },
    onSave: () => {
      const balance = parseEuroInput(d.balanceText, { allowNegative: true });
      if (balance === null) throw new ValidationError(d.balanceText.trim() ? 'Importo non valido (es. 10.250,40)' : 'Inserisci il saldo', 'balance');
      if (!d.date || d.date > ctx.today()) throw new ValidationError('Scegli oggi o un giorno passato', 'date');
      const id = alignId(a.id, d.date);
      ctx.store.upsertDerived([{ id, input: { type: 'variazione', date: d.date, amount: 0, accountId: a.id, align: { balance }, description: 'Allineamento al saldo reale' } }]);
      reconcileInterest(ctx.store, ctx.today());
      const m = ctx.store.find('movement', id);
      toast(m && !m.deleted && m.amount ? `Rettifica di ${formatEuro(m.amount)} registrata` : 'Il saldo era già allineato');
      return true;
    },
  });
}

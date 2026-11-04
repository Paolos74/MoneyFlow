// Dettaglio di un conto: saldo, movimenti per giorno, modifica, trasferimento,
// Compra/Vendi e variazione quantità (crypto), elimina conto lasciando i movimenti (D6).

import { el, card, button, emptyState, confirmDialog, toast, attempt, list } from '../ui.js';
import * as C from '../calc.js';
import { openMovementForm, openTradeForm } from './movimento-form.js';
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
  root.append(card({ title: a.kind === 'crypto' ? `Quantità · ${a.asset}` : 'Saldo', icon: a.kind === 'crypto' ? 'coin' : 'wallet', color: a.color },
    el('p', { class: `hero__value ${bal < 0 ? 'is-danger' : ''}`, id: 'acc-balance', text: amountIn(state, a.id, bal) }),
    el('p', { class: 'hero__sub', text: `Saldo iniziale ${amountIn(state, a.id, a.initial)}${a.kind === 'crypto' ? ' · nessun prezzo in euro' : ''}` })));
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

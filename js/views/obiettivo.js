// Dettaglio di un obiettivo: avanzamento, quota mensile, Aggiungi/Togli, modifica, elimina.

import { el, card, button, emptyState, sheet, field, input, toast, attempt, list, progress } from '../ui.js';
import { formatEuro, formatPercent, parseEuroInput } from '../money.js';
import { formatDateIt } from '../dates.js';
import { ValidationError } from '../errors.js';
import * as C from '../calc.js';
import { openGoalForm } from './conti.js';

export function render(root, ctx) {
  const g = ctx.store.find('goal', ctx.path[1]);
  if (!g || g.deleted) {
    ctx.header({ title: 'Obiettivo', back: { href: '#conti/obiettivi', label: 'Obiettivi' } });
    root.append(emptyState({ icon: 'target', title: 'Obiettivo non trovato' }));
    return;
  }
  const p = C.goalProgress(g, ctx.today());
  ctx.header({ title: g.name, back: { href: '#conti/obiettivi', label: 'Obiettivi' }, actions: [el('button', { class: 'topbar__btn', type: 'button', text: 'Modifica', id: 'goal-edit', on: { click: () => openGoalForm(ctx, g) } })] });
  root.append(card({ title: 'Messo da parte' },
    el('p', { class: 'hero__value', id: 'goal-saved', text: formatEuro(g.saved) }),
    el('p', { class: 'hero__sub', text: `di ${formatEuro(g.target)} · ${formatPercent(p.pct)}` }),
    progress(g.saved / g.target, { color: g.color }),
    el('div', { class: 'kv' }, el('span', { text: 'Mancano' }), el('span', { id: 'goal-remaining', text: formatEuro(p.remaining) })),
    el('div', { class: 'kv' }, el('span', { text: 'Scadenza' }), el('span', { text: g.deadline ? formatDateIt(g.deadline) : 'Nessuna' })),
    p.monthly ? el('div', { class: 'kv' }, el('span', { text: 'Da mettere da parte al mese' }), el('span', { id: 'goal-monthly', text: formatEuro(p.monthly) })) : null,
    p.expired ? el('p', { class: 'hero__sub is-danger', text: 'Scadenza passata: modifica la data o l\'importo.' }) : null,
    p.done ? el('p', { class: 'hero__sub is-income', text: 'Obiettivo raggiunto!' }) : null));
  root.append(el('div', { class: 'btn-row section' },
    button('Aggiungi', () => adjust(ctx, g, 1), { kind: 'primary', icon: 'plus', id: 'goal-add' }),
    button('Togli', () => adjust(ctx, g, -1), { id: 'goal-remove', disabled: g.saved === 0 })));
  root.append(el('div', { class: 'section' }, list(el('button', { type: 'button', class: 'row row--danger row--noicon', id: 'goal-delete', text: 'Elimina obiettivo', on: { click: () => {
    if (attempt(() => ctx.store.deleteGoal(g.id))) { ctx.go('conti/obiettivi'); toast('Obiettivo eliminato', { undo: () => ctx.store.restoreGoal(g.id) }); }
  } } }))));
}

function adjust(ctx, g, sign) {
  let text = '';
  sheet({
    title: sign > 0 ? 'Aggiungi all\'obiettivo' : 'Togli dall\'obiettivo',
    saveLabel: sign > 0 ? 'Aggiungi' : 'Togli',
    onSave: () => {
      const v = parseEuroInput(text);
      if (!v) throw new ValidationError(text.trim() ? 'Importo non valido' : 'Inserisci l\'importo', 'amount');
      ctx.store.adjustGoal(g.id, sign * v);
      toast(sign > 0 ? `Aggiunti ${formatEuro(v)}` : `Tolti ${formatEuro(v)}`);
      return true;
    },
    content: (s) => {
      s.body.append(el('div', { class: 'form-group' }, field({ label: 'Importo (€)', field: 'amount', id: 'ga-amount', hint: 'Non sposta soldi tra i conti.',
        input: input({ id: 'ga-amount', inputmode: 'decimal', placeholder: '0,00', cls: 'input--amount', onInput: (v) => { text = v; } }) })));
      setTimeout(() => document.getElementById('ga-amount')?.focus(), 0);
    },
  });
}

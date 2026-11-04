// Da confermare: tutte le scadenze dei programmati arrivate e non ancora confermate o saltate,
// raggruppate per programmato. Con ?programmato=id mostra solo quelle di un programmato.

import { el, list, section, emptyState, button, confirmDialog, toast, attempt } from '../ui.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { pendingRow, pendingGroups, scheduledTitle, amountIn } from './parts.js';

// "Conferma tutte (N)": prima una finestra con date e importi, poi un movimento per ogni scadenza.
async function confirmAll(ctx, { sched, items }) {
  const state = ctx.store.getState();
  const lines = items.map((p) => `${formatDateIt(p.date)} · ${amountIn(state, sched.accountId, sched.amount)}`).join('\n');
  const ok = await confirmDialog({
    title: `Confermare ${items.length} scadenze di ${scheduledTitle(state, sched)}?`,
    message: `Ogni scadenza diventa un movimento con l'importo del programmato:\n${lines}`,
    confirmLabel: `Conferma tutte (${items.length})`,
  });
  if (!ok) return;
  const s = ctx.store.find('scheduled', sched.id);
  if (attempt(() => ctx.store.confirmAll(s.id, items.map((p) => p.date)))) toast(`${items.length} pagamenti confermati`);
}

export function render(root, ctx) {
  ctx.header({ title: 'Da confermare', back: { href: '#home', label: 'Home' } });
  const all = C.pendingList(ctx.store.getState(), ctx.today());
  const only = ctx.query.programmato || '';
  const pending = only ? all.filter((p) => p.sched.id === only) : all;
  if (!pending.length) {
    root.append(emptyState({ icon: 'check', title: 'Tutto confermato', text: 'Quando arriva la scadenza di un pagamento programmato lo trovi qui. Non si registra da solo.',
      action: only && all.length ? button('Mostra tutte le scadenze', () => ctx.go('da-confermare'), { small: true, id: 'pending-all' }) : button('Pagamenti programmati', () => ctx.go('programmati'), { small: true }) }));
    return;
  }
  const state = ctx.store.getState();
  const groups = pendingGroups(pending);
  let idx = 0;
  groups.forEach((g, gi) => {
    const rows = g.items.map((p) => pendingRow(ctx, p, idx++));
    root.append(section({ title: scheduledTitle(state, g.sched), footer: gi === groups.length - 1 ? 'Conferma per registrare il movimento (puoi correggere importo e data) oppure salta questa scadenza.' : null, cls: 'pending-group' },
      list(...rows),
      g.items.length > 1 ? el('div', { class: 'btn-row' }, button(`Conferma tutte (${g.items.length})`, () => confirmAll(ctx, g), { kind: 'plain', id: `confirm-all-${gi}` })) : null));
  });
  root.append(el('div', { class: 'btn-row' },
    only && all.length > pending.length ? button('Mostra tutte le scadenze', () => ctx.go('da-confermare'), { kind: 'plain', id: 'pending-all' }) : null,
    button('Pagamenti programmati', () => ctx.go('programmati'), { kind: 'plain', icon: 'repeat' })));
}

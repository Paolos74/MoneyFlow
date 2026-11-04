// Pagamenti programmati: elenco con la prossima scadenza, nuovo, modifica, elimina.

import { el, list, row, section, emptyState, button } from '../ui.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { openScheduledForm } from './movimento-form.js';
import { amountIn, plannedSubtitle, scheduledTitle } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  const today = ctx.today();
  const add = el('button', { class: 'topbar__btn', type: 'button', text: 'Nuovo', id: 'sched-new', on: { click: () => openScheduledForm(ctx) } });
  ctx.header({ title: 'Programmati', back: { href: '#home', label: 'Home' }, actions: [add] });
  const items = state.scheduled.filter((s) => !s.deleted).map((s) => ({ s, next: C.nextDue(state, s, today) }))
    .sort((a, b) => (a.next || '9999').localeCompare(b.next || '9999'));
  if (!items.length) {
    root.append(emptyState({ icon: 'repeat', title: 'Nessun pagamento programmato', text: 'Affitto, abbonamenti, bollette: alla scadenza li trovi in Home → Da confermare. Nessuna notifica.',
      action: button('Nuovo programmato', () => openScheduledForm(ctx), { kind: 'primary', id: 'sched-new-empty' }) }));
  } else {
    root.append(section({ footer: 'I programmati non si registrano da soli: alla scadenza vanno confermati.' },
      list(...items.map(({ s, next }) => row({
        icon: 'repeat', color: C.scheduledColor(state, s), planned: true, title: scheduledTitle(state, s),
        subtitle: `${plannedSubtitle(state, s)}${next ? ` · ${next <= today ? 'da confermare' : 'prossima'} ${formatDateIt(next)}` : ' · terminato'}`,
        value: amountIn(state, s.accountId, s.amount), attrs: { 'data-scheduled': s.id },
        onClick: () => openScheduledForm(ctx, { scheduled: ctx.store.find('scheduled', s.id) }),
      })))));
  }
  // #programmati/<id> apre direttamente la modifica
  const id = ctx.path[1];
  if (id && !ctx.params.opened) {
    ctx.params.opened = true;
    const s = ctx.store.find('scheduled', id);
    if (s && !s.deleted) openScheduledForm(ctx, { scheduled: s });
  }
}

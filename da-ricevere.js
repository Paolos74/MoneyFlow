// Da ricevere: crediti aperti nati dalle quote escluse, con la restituzione collegata.

import { el, list, section, emptyState, card, button, icon } from '../ui.js';
import { formatEuro } from '../money.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { openRefundForm, openMovementForm, writeOffCredit } from './movimento-form.js';
import { movementTitle } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  ctx.header({ title: 'Da ricevere', back: { href: '#home', label: 'Home' } });
  const credits = C.openCredits(state);
  if (!credits.items.length) {
    root.append(emptyState({ icon: 'hand', title: 'Nessun credito aperto', text: 'Su una spesa puoi attivare "Escludi una quota": ad esempio 20 € anticipati per un amico. Li ritrovi qui finché non registri la restituzione.' }));
    return;
  }
  root.append(card({ title: 'Totale da ricevere' }, el('p', { class: 'hero__value', id: 'credits-total', text: formatEuro(credits.total) }),
    el('p', { class: 'hero__sub', text: 'Le restituzioni entrano nel conto ma non contano come entrate.' })));
  // Riga a due piani: sopra spesa e quota da ricevere, sotto "Non la ricevo più" e la restituzione.
  root.append(section({ title: 'Quote anticipate' }, list(...credits.items.map((c, i) => el('div', { class: 'row row--stack', attrs: { 'data-credit': c.movement.id } },
    el('span', { class: 'row__icon', vars: { '--c': C.categoryColor(state, c.movement.categoryId) } }, icon('hand')),
    el('button', { class: 'row__main', type: 'button', on: { click: () => openMovementForm(ctx, { movement: c.movement }) } },
      el('span', { class: 'row__title', text: movementTitle(state, c.movement) }),
      el('span', { class: 'row__sub row__sub--wrap', text: `${formatDateIt(c.movement.date)} · spesa ${formatEuro(c.movement.amount)} · esclusi ${formatEuro(c.excluded)}${c.refunded ? ` · già ricevuti ${formatEuro(c.refunded)}` : ''}` })),
    el('span', { class: 'row__value row__value--strong', text: formatEuro(c.residual) }),
    el('span', { class: 'row__actions' },
      button('Non la ricevo più', () => writeOffCredit(ctx, c.movement), { kind: 'plain', id: `writeoff-${i}`, label: `Non ricevo più la quota di ${movementTitle(state, c.movement)}` }),
      button('Registra restituzione', () => openRefundForm(ctx, c.movement), { kind: 'primary', id: `refund-${i}`, label: `Registra restituzione per ${movementTitle(state, c.movement)}` })))))));
}

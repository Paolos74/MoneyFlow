// Da ricevere: crediti aperti nati dalle quote escluse, con la restituzione collegata.
// v4: "Chi mi deve" (residuo per persona delle spese divise) e la vista di una persona (#da-ricevere?persona=<nome>).

import { el, list, section, emptyState, card, button, icon, row, sheet, field, select, input, toast, confirmDialog, attempt } from '../ui.js';
import { formatEuro } from '../money.js';
import { formatDateIt } from '../dates.js';
import { ValidationError } from '../errors.js';
import * as C from '../calc.js';
import { openRefundForm, openMovementForm, writeOffCredit } from './movimento-form.js';
import { movementTitle } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  if (ctx.query.persona) { renderPerson(root, ctx, ctx.query.persona); return; }
  ctx.header({ title: 'Da ricevere', back: { href: '#home', label: 'Home' } });
  const credits = C.openCredits(state);
  if (!credits.items.length) {
    root.append(emptyState({ icon: 'hand', title: 'Nessun credito aperto', text: 'Su una spesa puoi attivare "Escludi una quota": ad esempio 20 € anticipati per un amico, oppure dividerla tra più persone. Li ritrovi qui finché non registri la restituzione.' }));
    return;
  }
  root.append(card({ title: 'Totale da ricevere' }, el('p', { class: 'hero__value is-income', id: 'credits-total', text: formatEuro(credits.total) }),
    el('p', { class: 'hero__sub', text: 'Le restituzioni entrano nel conto ma non contano come entrate.' })));
  const debts = C.debtsByPerson(state);
  if (debts.length) {
    root.append(section({ title: 'Chi mi deve' }, list(...debts.map((d, i) => row({
      icon: 'hand', color: 'var(--accent-fill)', title: d.person,
      subtitle: d.items.length === 1 ? '1 spesa' : `${d.items.length} spese`,
      value: formatEuro(d.residual), valueClass: 'row__value--strong', id: `debt-${i}`,
      href: '#da-ricevere?persona=' + encodeURIComponent(d.person), attrs: { 'data-person': d.person },
    })))));
  }
  // Riga a due piani: sopra spesa e quota da ricevere, sotto la restituzione (principale, prima nel DOM) e "Non la ricevo più".
  root.append(section({ title: 'Quote anticipate' }, list(...credits.items.map((c, i) => el('div', { class: 'row row--stack', attrs: { 'data-credit': c.movement.id } },
    el('span', { class: 'row__icon', vars: { '--c': 'var(--accent-fill)' } }, icon('hand')),
    el('button', { class: 'row__main', type: 'button', on: { click: () => openMovementForm(ctx, { movement: c.movement }) } },
      el('span', { class: 'row__title', text: movementTitle(state, c.movement) }),
      el('span', { class: 'row__sub row__sub--wrap', text: `${formatDateIt(c.movement.date)} · spesa ${formatEuro(c.movement.amount)} · esclusi ${formatEuro(c.excluded)}${c.refunded ? ` · già ricevuti ${formatEuro(c.refunded)}` : ''}${peopleLine(c.movement)}` })),
    el('span', { class: 'row__value row__value--strong', text: formatEuro(c.residual) }),
    el('span', { class: 'row__actions' },
      button('Registra restituzione', () => openRefundForm(ctx, c.movement), { kind: 'primary', id: `refund-${i}`, label: `Registra restituzione per ${movementTitle(state, c.movement)}` }),
      button('Non la ricevo più', () => writeOffCredit(ctx, c.movement), { kind: 'plain', id: `writeoff-${i}`, label: `Non ricevo più la quota di ${movementTitle(state, c.movement)}` })))))));
}

const peopleLine = (m) => (m.split && m.split.length ? ' · ' + m.split.map((x) => x.person).join(', ') : '');

// Una persona: le sue spese aperte con il residuo, "Ha restituito tutto", "Non li ricevo più", restituzione singola.
function renderPerson(root, ctx, name) {
  const state = ctx.store.getState();
  const d = C.debtOf(state, name);
  ctx.header({ title: d ? d.person : name, back: { href: '#da-ricevere', label: 'Da ricevere' } });
  if (!d) {
    root.append(emptyState({ icon: 'check', title: 'Nessuna somma aperta', text: `${name} non ti deve niente.` }));
    return;
  }
  root.append(card({ title: 'Ti deve' }, el('p', { class: 'hero__value is-income', id: 'person-total', text: formatEuro(d.residual) }),
    el('p', { class: 'hero__sub', text: d.items.length === 1 ? 'Su 1 spesa divisa' : `Su ${d.items.length} spese divise` }),
    el('div', { class: 'btn-row' },
      button('Ha restituito tutto', () => openSettleSheet(ctx, d), { kind: 'primary', id: 'person-settle', icon: 'hand' }),
      button('Non li ricevo più', () => writeOffPerson(ctx, d), { kind: 'plain', id: 'person-writeoff' }))));
  root.append(section({ title: 'Spese' }, list(...d.items.map((it, i) => el('div', { class: 'row row--stack', attrs: { 'data-credit': it.movement.id } },
    el('span', { class: 'row__icon', vars: { '--c': C.categoryColor(state, it.movement.categoryId) } }, icon(C.categoryIcon(state, it.movement.categoryId))),
    el('button', { class: 'row__main', type: 'button', on: { click: () => openMovementForm(ctx, { movement: it.movement }) } },
      el('span', { class: 'row__title', text: movementTitle(state, it.movement) }),
      el('span', { class: 'row__sub row__sub--wrap', text: `${formatDateIt(it.movement.date)} · quota ${formatEuro(it.share)}${it.refunded ? ` · già ricevuti ${formatEuro(it.refunded)}` : ''}` })),
    el('span', { class: 'row__value row__value--strong', text: formatEuro(it.residual) }),
    el('span', { class: 'row__actions' },
      button('Registra restituzione', () => openRefundForm(ctx, it.movement, { person: d.person }), { kind: 'primary', id: `person-refund-${i}`, label: `Registra restituzione di ${d.person} per ${movementTitle(state, it.movement)}` })))))));
}

// "Ha restituito tutto": una restituzione per spesa, sul conto e nella data scelti (oggi).
function openSettleSheet(ctx, debt) {
  const { store } = ctx;
  const state = store.getState();
  const accounts = C.sortedAccounts(state).filter((a) => a.kind === 'eur');
  const firstAcc = debt.items.map((it) => it.movement.accountId).find((id) => accounts.some((a) => a.id === id)) || accounts[0]?.id || '';
  const d = { accountId: firstAcc, date: ctx.today() };
  sheet({
    title: 'Ha restituito tutto',
    saveLabel: 'Registra',
    content: (s) => s.body.append(
      el('p', { class: 'section-footer', text: `${debt.person} ti restituisce ${formatEuro(debt.residual)}: si registra una restituzione per ogni spesa (${debt.items.length}). Entrano nel conto ma non contano come entrate.` }),
      el('div', { class: 'form-group' },
        field({ label: 'Sul conto', field: 'accountId', id: 'settle-account',
          input: select({ id: 'settle-account', options: [{ value: '', label: 'Scegli…', disabled: true }, ...accounts.map((a) => ({ value: a.id, label: a.name }))], value: d.accountId, onChange: (v) => { d.accountId = v; } }) }),
        field({ label: 'Data', field: 'date', id: 'settle-date', input: input({ id: 'settle-date', type: 'date', value: d.date, cls: 'input--date', onInput: (v) => { d.date = v; } }) }))),
    onSave: () => {
      if (!d.accountId) throw new ValidationError('Scegli un conto', 'accountId');
      const before = new Set(store.getState().movements.map((m) => m.id));
      store.settlePerson(debt.person, { mode: 'refund', accountId: d.accountId, date: d.date });
      const created = store.getState().movements.filter((m) => !before.has(m.id)).map((m) => m.id);
      toast(`Registrati ${formatEuro(debt.residual)} da ${debt.person}`, { undo: () => created.forEach((id) => store.deleteMovement(id)) });
      return true;
    },
  });
}

// "Non li ricevo più": le quote della persona scendono a quanto ha già restituito; il resto torna spesa.
async function writeOffPerson(ctx, debt) {
  const { store } = ctx;
  const ok = await confirmDialog({
    title: `Non li ricevi più da ${debt.person}?`,
    message: `Le sue quote scendono a quanto ha già restituito. I ${formatEuro(debt.residual)} mancanti tornano a contare come spesa in statistiche e budget. Il saldo dei conti non cambia.`,
    confirmLabel: 'Non li ricevo più',
  });
  if (!ok) return;
  const prev = debt.items.map((it) => ({ id: it.movement.id, split: it.movement.split, excluded: it.movement.excluded }));
  if (attempt(() => store.settlePerson(debt.person, { mode: 'writeoff' }))) {
    toast(`${formatEuro(debt.residual)} tornano a contare come spesa`, { undo: () => prev.forEach((p) => store.updateMovement(p.id, { split: p.split, excluded: p.excluded })) });
    ctx.go('da-ricevere');
  }
}

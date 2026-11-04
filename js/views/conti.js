// Conti: controllo segmentato "Conti | Obiettivi", saldi, nuovo conto, trasferimenti;
// obiettivi di risparmio con avanzamento. Esporta i fogli di conto e obiettivo.

import { el, card, list, row, section, segmented, emptyState, button, sheet, field, input, colorPicker, progress, toast } from '../ui.js';
import { formatEuro, parseEuroInput, parseQtyInput, formatEuroPlain, formatQtyPlain } from '../money.js';
import { formatDateIt } from '../dates.js';
import { ValidationError } from '../errors.js';
import { PALETTE } from '../store.js';
import * as C from '../calc.js';
import { openMovementForm } from './movimento-form.js';
import { amountIn } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  const seg = ctx.path[1] === 'obiettivi' ? 'obiettivi' : 'conti';
  const add = el('button', { class: 'topbar__btn', type: 'button', text: 'Nuovo', id: 'conti-new',
    on: { click: () => (seg === 'conti' ? openAccountForm(ctx) : openGoalForm(ctx)) } });
  ctx.header({ title: seg === 'conti' ? 'Conti' : 'Obiettivi', actions: [add] });
  root.append(segmented([{ value: 'conti', label: 'Conti', id: 'seg-conti' }, { value: 'obiettivi', label: 'Obiettivi', id: 'seg-obiettivi' }], seg,
    (v) => ctx.go(v === 'conti' ? 'conti' : 'conti/obiettivi'), { label: 'Sezione' }));
  if (seg === 'conti') renderAccounts(root, ctx, state); else renderGoals(root, ctx, state);
  if (ctx.params.newAccount && !ctx.params.opened) { ctx.params.opened = true; openAccountForm(ctx); }
}

function renderAccounts(root, ctx, state) {
  const accounts = C.sortedAccounts(state);
  const nw = C.netWorth(state);
  root.append(card({ title: 'Patrimonio in euro', cls: 'card--hero' },
    el('p', { class: 'hero__value', id: 'conti-total', text: formatEuro(nw.eurCents) }),
    nw.crypto.length ? el('p', { class: 'hero__sub', text: `${C.cryptoLine(nw)} · senza valore in euro` }) : null));
  if (!accounts.length) {
    root.append(emptyState({ icon: 'wallet', title: 'Nessun conto', text: 'Aggiungi conti in euro (banca, contanti) o in crypto (solo quantità).',
      action: button('Nuovo conto', () => openAccountForm(ctx), { kind: 'primary', id: 'conti-new-empty' }) }));
    return;
  }
  const bal = C.balances(state);
  root.append(section({}, list(...accounts.map((a) => row({
    icon: a.kind === 'crypto' ? 'coin' : 'wallet', color: a.color, title: a.name, subtitle: a.kind === 'crypto' ? `Crypto · ${a.asset}` : 'Euro',
    value: amountIn(state, a.id, bal.get(a.id) || 0), valueClass: (bal.get(a.id) || 0) < 0 ? 'is-danger' : '', href: `#conti/${a.id}`, attrs: { 'data-account': a.id },
  })))));
  root.append(el('div', { class: 'btn-row' },
    accounts.length > 1 ? button('Trasferisci', () => openMovementForm(ctx, { preset: { type: 'trasferimento' } }), { icon: 'transfer', id: 'conti-transfer' }) : null,
    button('Nuovo conto', () => openAccountForm(ctx), { icon: 'plus', id: 'conti-new-bottom' })));
}

function renderGoals(root, ctx, state) {
  const today = ctx.today();
  const goals = state.goals.filter((g) => !g.deleted);
  if (!goals.length) {
    root.append(emptyState({ icon: 'target', title: 'Nessun obiettivo', text: 'Fissa un importo e una scadenza: MoneyFlow ti dice quanto mettere da parte ogni mese.',
      action: button('Nuovo obiettivo', () => openGoalForm(ctx), { kind: 'primary', id: 'goal-new-empty' }) }));
    return;
  }
  const goalCard = (g) => {
    const p = C.goalProgress(g, today);
    const note = p.done ? 'Obiettivo raggiunto'
      : p.quota ? `${formatEuro(p.monthSaved)} di ${formatEuro(p.quota)} questo mese`
        : p.monthly ? `Metti da parte ${formatEuro(p.monthly)} al mese per ${p.monthsLeft} ${p.monthsLeft === 1 ? 'mese' : 'mesi'}` : `Mancano ${formatEuro(p.remaining)}`;
    return el('a', { class: 'card', href: `#obiettivi/${g.id}`, attrs: { 'data-goal': g.id } },
      el('div', { class: 'card__head' }, el('h2', { class: 'goal__title', text: g.name }),
        el('span', { class: 'tag' + (p.done ? ' tag--done' : ''), text: p.done ? 'Completato ✓' : p.expired ? 'Scaduto' : g.deadline ? `entro ${formatDateIt(g.deadline)}` : 'senza scadenza' })),
      el('div', { class: 'meter__top' }, el('span', { class: 'num', text: formatEuro(g.saved) }), el('span', { text: `di ${formatEuro(g.target)}` })),
      progress(g.saved / g.target, { color: g.color }),
      el('div', { class: 'meter__note', text: note }));
  };
  // Prima gli attivi, poi la sezione "Completati" (cifra raggiunta).
  const active = C.activeGoals(state);
  const done = C.completedGoals(state);
  root.append(...active.map(goalCard));
  if (done.length) root.append(section({ title: 'Completati', cls: 'goals-done' }, ...done.map(goalCard)));
  root.append(el('div', { class: 'btn-row' }, button('Nuovo obiettivo', () => openGoalForm(ctx), { icon: 'plus', id: 'goal-new' })));
}

// Foglio nuovo/modifica conto. Il tipo non cambia se il conto ha già movimenti.
export function openAccountForm(ctx, account = null) {
  const { store } = ctx;
  const state = store.getState();
  const used = account && state.movements.some((m) => !m.deleted && (m.accountId === account.id || m.toAccountId === account.id));
  const d = account
    ? { name: account.name, kind: account.kind, asset: account.asset || '', initialText: account.kind === 'crypto' ? formatQtyPlain(account.initial) : formatEuroPlain(account.initial), color: account.color }
    : { name: '', kind: 'eur', asset: '', initialText: '', color: PALETTE[state.accounts.length % PALETTE.length] };
  let body;
  const draw = () => { while (body.firstChild) body.firstChild.remove(); body.append(...build()); };
  function build() {
    return [
      el('div', { class: 'form-group' },
        field({ label: 'Nome', field: 'name', id: 'a-name', input: input({ id: 'a-name', value: d.name, maxlength: 60, placeholder: 'Es. Revolut, Contanti', onInput: (v) => { d.name = v; } }) })),
      used ? el('p', { class: 'section-footer', text: `Tipo: ${d.kind === 'crypto' ? `crypto (${d.asset})` : 'euro'}. Non si può cambiare perché il conto ha già movimenti.` })
        : segmented([{ value: 'eur', label: 'Euro', id: 'a-kind-eur' }, { value: 'crypto', label: 'Crypto', id: 'a-kind-crypto' }], d.kind, (v) => { d.kind = v; draw(); }, { label: 'Tipo di conto' }),
      el('div', { class: 'form-group' },
        d.kind === 'crypto' && !used ? field({ label: 'Simbolo', field: 'asset', id: 'a-asset', hint: 'Es. BTC, ETH. Solo quantità, nessun prezzo da internet.', input: input({ id: 'a-asset', value: d.asset, maxlength: 10, placeholder: 'BTC', onInput: (v) => { d.asset = v; }, attrs: { autocapitalize: 'characters' } }) }) : null,
        field({ label: d.kind === 'crypto' ? 'Quantità iniziale' : 'Saldo iniziale (€)', field: 'initial', id: 'a-initial', hint: d.kind === 'crypto' ? 'Fino a 8 decimali' : 'Quanto c\'è oggi sul conto. Può essere negativo.',
          input: input({ id: 'a-initial', value: d.initialText, inputmode: 'decimal', placeholder: d.kind === 'crypto' ? '0' : '0,00', onInput: (v) => { d.initialText = v; } }) })),
      el('p', { class: 'field__label', text: 'Colore' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field', dataset: { field: 'color' } }, colorPicker(d.color, (c) => { d.color = c; }), el('p', { class: 'field__error', hidden: true }))),
    ];
  }
  return sheet({
    title: account ? 'Modifica conto' : 'Nuovo conto',
    onSave: () => {
      const txt = d.initialText.trim();
      const initial = txt === '' ? 0 : d.kind === 'crypto' ? parseQtyInput(txt, { allowNegative: true }) : parseEuroInput(txt, { allowNegative: true });
      if (initial === null) throw new ValidationError('Saldo iniziale non valido', 'initial');
      const inp = { name: d.name, kind: d.kind, asset: d.asset, initial, color: d.color };
      if (account) { store.updateAccount(account.id, inp); toast('Conto aggiornato'); } else {
        inp.order = state.accounts.length;
        store.addAccount(inp);
        toast('Conto creato');
      }
      return true;
    },
    content: (s) => { body = s.body; body.append(...build()); setTimeout(() => document.getElementById('a-name')?.focus(), 0); },
  });
}

export function openGoalForm(ctx, goal = null) {
  const { store } = ctx;
  const state = store.getState();
  const d = goal
    ? { name: goal.name, targetText: formatEuroPlain(goal.target), savedText: formatEuroPlain(goal.saved), monthlyText: goal.monthly ? formatEuroPlain(goal.monthly) : '', deadline: goal.deadline || '', color: goal.color }
    : { name: '', targetText: '', savedText: '', monthlyText: '', deadline: '', color: PALETTE[(state.goals.length + 4) % PALETTE.length] };
  return sheet({
    title: goal ? 'Modifica obiettivo' : 'Nuovo obiettivo',
    onSave: () => {
      const target = parseEuroInput(d.targetText);
      if (!target) throw new ValidationError(d.targetText.trim() ? 'Importo non valido' : 'Inserisci l\'importo da raggiungere', 'target');
      const saved = d.savedText.trim() ? parseEuroInput(d.savedText) : 0;
      if (saved === null) throw new ValidationError('Importo non valido', 'saved');
      // Quota mensile facoltativa (gli obiettivi della v1 non ce l'hanno).
      const monthly = d.monthlyText.trim() ? parseEuroInput(d.monthlyText) : null;
      if (monthly === 0 || (d.monthlyText.trim() && monthly === null)) throw new ValidationError('Quota mensile non valida', 'monthly');
      const inp = { name: d.name, target, saved, monthly, deadline: d.deadline || null, color: d.color };
      if (goal) store.updateGoal(goal.id, inp); else store.addGoal(inp);
      toast(goal ? 'Obiettivo aggiornato' : 'Obiettivo creato');
      return true;
    },
    content: (s) => {
      s.body.append(
        el('div', { class: 'form-group' },
          field({ label: 'Nome', field: 'name', id: 'g-name', input: input({ id: 'g-name', value: d.name, maxlength: 60, placeholder: 'Es. Vacanza, Fondo emergenza', onInput: (v) => { d.name = v; } }) }),
          field({ label: 'Da raggiungere (€)', field: 'target', id: 'g-target', input: input({ id: 'g-target', value: d.targetText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.targetText = v; } }) }),
          field({ label: 'Quota mensile (€)', field: 'monthly', id: 'g-monthly', hint: 'Facoltativa: quanto vuoi mettere da parte ogni mese. Te la propongo quando salvi lo stipendio.', input: input({ id: 'g-monthly', value: d.monthlyText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.monthlyText = v; } }) }),
          field({ label: 'Già messo da parte (€)', field: 'saved', id: 'g-saved', input: input({ id: 'g-saved', value: d.savedText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.savedText = v; } }) }),
          field({ label: 'Scadenza (facoltativa)', field: 'deadline', id: 'g-deadline', input: input({ id: 'g-deadline', type: 'date', value: d.deadline, onInput: (v) => { d.deadline = v; } }) })),
        el('p', { class: 'field__label', text: 'Colore' }),
        el('div', { class: 'form-group' }, el('div', { class: 'field', dataset: { field: 'color' } }, colorPicker(d.color, (c) => { d.color = c; }), el('p', { class: 'field__error', hidden: true }))),
        el('p', { class: 'section-footer', text: 'L\'obiettivo non sposta soldi tra i conti: aggiorni a mano quanto hai messo da parte.' }));
      setTimeout(() => document.getElementById('g-name')?.focus(), 0);
    },
  });
}

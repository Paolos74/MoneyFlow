// Conti: totale del patrimonio in grande, sezioni Conti in euro, Depositi, Crypto; nuovo conto, trasferimenti.
// Esporta i fogli di conto (con Deposito senza vincoli e icona) e di obiettivo (gli obiettivi stanno in Budget dalla v4).

import { el, card, list, row, section, segmented, emptyState, button, sheet, field, input, colorPicker, iconPicker, toggle, toast } from '../ui.js';
import { formatEuro, parseEuroInput, parseQtyInput, formatEuroPlain, formatQtyPlain, parsePercentInput, formatPercentBp } from '../money.js';
import { ValidationError } from '../errors.js';
import { PALETTE } from '../store.js';
import * as C from '../calc.js';
import { openMovementForm } from './movimento-form.js';
import { amountIn } from './parts.js';

export function render(root, ctx) {
  const state = ctx.store.getState();
  const add = el('button', { class: 'topbar__btn', type: 'button', text: 'Nuovo', id: 'conti-new', on: { click: () => openAccountForm(ctx) } });
  ctx.header({ title: 'Conti', actions: [add] });
  renderAccounts(root, ctx, state);
  if (ctx.params.newAccount && !ctx.params.opened) { ctx.params.opened = true; openAccountForm(ctx); }
}

// Totale del patrimonio in grande (decisione v4 n. 4), poi conti in euro, depositi e crypto (solo quantità).
function renderAccounts(root, ctx, state) {
  const accounts = C.sortedAccounts(state);
  const nw = C.netWorth(state);
  root.append(card({ title: 'Patrimonio totale', tint: 'butter', icon: 'cash', cls: 'card--networth' },
    el('p', { class: 'hero__value', id: 'conti-total', text: formatEuro(nw.eurCents) }),
    el('p', { class: 'hero__sub', text: nw.crypto.length ? `Conti in euro e depositi · ${C.cryptoLine(nw)} senza valore in euro` : 'Conti in euro e depositi' })));
  if (!accounts.length) {
    root.append(emptyState({ icon: 'wallet', title: 'Nessun conto', text: 'Aggiungi conti in euro (banca, contanti), depositi o crypto (solo quantità).',
      action: button('Nuovo conto', () => openAccountForm(ctx), { kind: 'primary', id: 'conti-new-empty' }) }));
    return;
  }
  const bal = C.balances(state);
  const today = ctx.today();
  const accRow = (a, subtitle) => row({
    icon: C.accountIcon(a), color: a.color, title: a.name, subtitle,
    value: amountIn(state, a.id, bal.get(a.id) || 0), valueClass: (bal.get(a.id) || 0) < 0 ? 'is-danger' : '', href: `#conti/${a.id}`, attrs: { 'data-account': a.id },
  });
  const groups = [
    ['Conti in euro', accounts.filter((a) => a.kind === 'eur' && !a.deposit), () => '', 'conti-eur'],
    ['Depositi', accounts.filter((a) => a.kind === 'eur' && a.deposit), (a) => {
      const r = [...a.deposit.rates].reverse().find((x) => x.from <= today) || a.deposit.rates[0];
      return `${formatPercentBp(r.rateBp)} lordo annuo`;
    }, 'conti-deposits'],
    ['Crypto', accounts.filter((a) => a.kind === 'crypto'), (a) => a.asset, 'conti-crypto'],
  ];
  for (const [title, list_, sub, id] of groups) {
    if (!list_.length) continue;
    const tot = list_.filter((a) => a.kind === 'eur').reduce((t, a) => t + (bal.get(a.id) || 0), 0);
    root.append(section({ title, cls: id, action: list_[0].kind === 'eur' ? el('span', { class: 'is-muted', text: formatEuro(tot) }) : null }, list(...list_.map((a) => accRow(a, sub(a))))));
  }
  root.append(el('div', { class: 'btn-row' },
    accounts.length > 1 ? button('Trasferisci', () => openMovementForm(ctx, { preset: { type: 'trasferimento' } }), { icon: 'transfer', id: 'conti-transfer' }) : null,
    button('Nuovo conto', () => openAccountForm(ctx), { icon: 'plus', id: 'conti-new-bottom' })));
}

// Foglio nuovo/modifica conto. Il tipo non cambia se il conto ha già movimenti.
export function openAccountForm(ctx, account = null) {
  const { store } = ctx;
  const state = store.getState();
  const used = account && state.movements.some((m) => !m.deleted && (m.accountId === account.id || m.toAccountId === account.id));
  const dep = account?.deposit || null;
  const d = account
    ? { name: account.name, kind: account.kind, asset: account.asset || '', initialText: account.kind === 'crypto' ? formatQtyPlain(account.initial) : formatEuroPlain(account.initial), color: account.color }
    : { name: '', kind: 'eur', asset: '', initialText: '', color: PALETTE[state.accounts.length % PALETTE.length] };
  // v4: icona scelta (null = predefinita per tipo) e "Deposito senza vincoli" (nessun tasso predefinito).
  Object.assign(d, {
    icon: account?.icon || null,
    depositOn: !!dep, rateText: dep ? bpText(dep.rates[0].rateBp) : '', withholdingText: bpText(dep ? dep.withholdingBp : 2600), start: dep ? dep.start : ctx.today(),
  });
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
      d.kind === 'eur' ? depositBlock() : null,
      el('p', { class: 'field__label', text: 'Icona' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field' }, iconPicker(d.icon || C.accountIcon({ kind: d.kind, deposit: d.depositOn ? {} : null }), (v) => { d.icon = v; }))),
      el('p', { class: 'field__label', text: 'Colore' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field', dataset: { field: 'color' } }, colorPicker(d.color, (c) => { d.color = c; }), el('p', { class: 'field__error', hidden: true }))),
    ];
  }
  function depositBlock() {
    const g = [el('div', { class: 'field field--inline', dataset: { field: 'deposit' } },
      el('label', { class: 'field__label', text: 'Deposito senza vincoli', attrs: { for: 'a-deposit' } }),
      toggle({ id: 'a-deposit', checked: d.depositOn, label: 'Deposito senza vincoli', onChange: (v) => { d.depositOn = v; draw(); if (v) setTimeout(() => document.getElementById('a-rate')?.focus(), 0); } }),
      el('p', { class: 'field__error', hidden: true }))];
    if (d.depositOn) {
      const later = dep ? dep.rates.length - 1 : 0;
      g.push(
        field({ label: 'Tasso annuo lordo (%)', field: 'deposit-rate', id: 'a-rate',
          hint: later ? `Tasso dalla data di inizio. Ci sono altri ${later === 1 ? '1 cambio' : later + ' cambi'} di tasso: li gestisci dalla pagina del conto.` : 'Quello del tuo piano, come lo vedi nell\'app della banca (es. 2,25).',
          input: input({ id: 'a-rate', value: d.rateText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.rateText = v; } }) }),
        field({ label: 'Ritenuta (%)', field: 'deposit-withholding', id: 'a-withholding', hint: 'In Italia il 26 % sugli interessi, trattenuto prima dell\'accredito.',
          input: input({ id: 'a-withholding', value: d.withholdingText, inputmode: 'decimal', placeholder: '26', onInput: (v) => { d.withholdingText = v; } }) }),
        field({ label: 'Data di inizio', field: 'deposit-start', id: 'a-start', hint: 'Gli interessi maturano ogni giorno da questa data fino a ieri e si aggiungono da soli.',
          input: input({ id: 'a-start', type: 'date', value: d.start, cls: 'input--date', onInput: (v) => { d.start = v; } }) }));
    }
    return el('div', { class: 'form-group' }, g);
  }
  function depositInput() {
    if (d.kind !== 'eur' || !d.depositOn) return null;
    const rateBp = parsePercentInput(d.rateText, { max: 2000 });
    if (!rateBp) throw new ValidationError(d.rateText.trim() ? 'Tasso non valido (es. 2,25), al massimo 20 %' : 'Inserisci il tasso annuo', 'deposit-rate');
    const withholdingBp = parsePercentInput(d.withholdingText, { max: 10000 });
    if (withholdingBp === null) throw new ValidationError('Ritenuta non valida (es. 26)', 'deposit-withholding');
    // Il tasso del modulo è quello dalla data di inizio; i cambi successivi restano.
    const rates = [{ from: d.start, rateBp }, ...(dep ? dep.rates.slice(1).filter((r) => r.from > d.start) : [])];
    return { start: d.start, withholdingBp, rates };
  }
  return sheet({
    title: account ? 'Modifica conto' : 'Nuovo conto',
    onSave: () => {
      const txt = d.initialText.trim();
      const initial = txt === '' ? 0 : d.kind === 'crypto' ? parseQtyInput(txt, { allowNegative: true }) : parseEuroInput(txt, { allowNegative: true });
      if (initial === null) throw new ValidationError('Saldo iniziale non valido', 'initial');
      const inp = { name: d.name, kind: d.kind, asset: d.asset, initial, color: d.color, icon: d.icon, deposit: depositInput() };
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

// 250 → "2,50"
const bpText = (bp) => formatPercentBp(bp).replace('%', '');

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

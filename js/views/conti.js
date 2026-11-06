// Conti: totale del patrimonio in grande, sezioni Conti in euro, Depositi, Investimenti (v5), Crypto; nuovo conto, trasferimenti.
// Esporta i fogli di conto (con Deposito senza vincoli e icona), di obiettivo (gli obiettivi stanno in Budget dalla v4)
// e di ETF (v5), più il riepilogo delle tasse degli investimenti.

import { el, card, list, row, section, segmented, emptyState, button, sheet, field, input, colorPicker, iconPicker, toggle, toast, icon, preserveFocus, clear } from '../ui.js';
import { formatEuro, parseEuroInput, parseQtyInput, formatEuroPlain, formatQtyPlain, parsePercentInput, formatPercentBp, formatPercentSigned, formatRateBp } from '../money.js';
import { formatDateIt } from '../dates.js';
import { sortedInvestments, etfSummary, investTaxYear, qtyText } from '../invest.js';
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

// Data breve delle righe: GG/MM nell'anno in corso, altrimenti GG/MM/AAAA.
const shortDate = (iso, today) => (iso.slice(0, 4) === today.slice(0, 4) ? formatDateIt(iso).slice(0, 5) : formatDateIt(iso));

// Totale del patrimonio in grande (decisione v4 n. 4), poi conti in euro, depositi, investimenti e crypto (solo quantità).
// v5: il totale comprende gli ETF al valore scritto a mano (o al prezzo d'acquisto), con le date dei valori usati.
function renderAccounts(root, ctx, state) {
  const accounts = C.sortedAccounts(state);
  const nw = C.netWorth(state);
  const today = ctx.today();
  const etfs = sortedInvestments(state).map((e) => ({ etf: e, sum: etfSummary(state, e.id) }));
  const held = etfs.filter((x) => x.sum.qty > 0);
  const dates = held.map((x) => x.sum.valueInfo.date).sort();
  root.append(card({ title: 'Patrimonio totale', tint: 'butter', icon: 'cash', cls: 'card--networth' },
    el('p', { class: 'hero__value', id: 'conti-total', text: formatEuro(nw.totalCents) }),
    el('p', { class: 'hero__sub', id: 'conti-total-sub', text: (held.length ? 'Conti in euro, depositi e ETF' : 'Conti in euro e depositi') + (nw.crypto.length ? ` · ${C.cryptoLine(nw)} senza valore in euro` : '') }),
    held.length ? el('p', { class: 'hero__sub', id: 'conti-total-dates', text: dates[0] === dates[dates.length - 1] ? `Valore degli ETF al ${formatDateIt(dates[0])}` : `Valore degli ETF dal ${formatDateIt(dates[0])} al ${formatDateIt(dates[dates.length - 1])}` }) : null));
  if (!accounts.length) {
    root.append(emptyState({ icon: 'wallet', title: 'Nessun conto', text: 'Aggiungi conti in euro (banca, contanti), depositi o crypto (solo quantità).',
      action: button('Nuovo conto', () => openAccountForm(ctx), { kind: 'primary', id: 'conti-new-empty' }) }));
    return;
  }
  const bal = C.balances(state);
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
    if (id === 'conti-crypto') renderInvestments(root, ctx, state, etfs, today);
    if (!list_.length) continue;
    const tot = list_.filter((a) => a.kind === 'eur').reduce((t, a) => t + (bal.get(a.id) || 0), 0);
    root.append(section({ title, cls: id, action: list_[0].kind === 'eur' ? el('span', { class: 'is-muted', text: formatEuro(tot) }) : null }, list(...list_.map((a) => accRow(a, sub(a))))));
  }
  root.append(el('div', { class: 'btn-row' },
    accounts.length > 1 ? button('Trasferisci', () => openMovementForm(ctx, { preset: { type: 'trasferimento' } }), { icon: 'transfer', id: 'conti-transfer' }) : null,
    button('Nuovo conto', () => openAccountForm(ctx), { icon: 'plus', id: 'conti-new-bottom' })));
}

// Sezione Investimenti (v5, design §6.3): una riga per ETF, poi "Nuovo ETF"; nota e riepilogo delle tasse sotto.
function renderInvestments(root, ctx, state, etfs, today) {
  const rows = etfs.map(({ etf, sum }) => {
    const info = sum.valueInfo;
    const subtitle = sum.qty <= 0 ? 'Nessuna quota'
      : `${qtyText(sum.qty)} · ${info.source === 'manual' ? 'valore al' : 'prezzo d\'acquisto del'} ${shortDate(info.date, today)}`;
    return row({
      icon: 'chart', color: etf.color, title: etf.name, subtitle, cls: 'row--wrapsub',
      value: formatEuro(sum.value), valueSub: sum.qty > 0 ? formatPercentSigned(sum.gainPct) : null,
      valueSubClass: sum.qty > 0 && sum.gainPct > 0 ? 'is-income' : sum.qty > 0 && sum.gainPct < 0 ? 'is-danger' : null,
      href: `#investimenti/${etf.id}`, attrs: { 'data-etf': etf.id },
    });
  });
  rows.push(row({ icon: 'plus', color: 'var(--accent-fill)', title: 'Nuovo ETF', subtitle: etfs.length ? null : 'Quote e prezzo medio li calcola l\'app dai tuoi acquisti', onClick: () => openInvestmentForm(ctx), id: 'conti-new-etf' }));
  const total = etfs.reduce((t, x) => t + x.sum.value, 0);
  root.append(section({ title: 'Investimenti', cls: 'conti-invest', id: 'conti-invest', action: etfs.length ? el('span', { class: 'is-muted', id: 'conti-invest-total', text: formatEuro(total) }) : null,
    footer: etfs.length ? 'Valori scritti a mano con Aggiorna valore. Nessun prezzo da internet.' : null }, list(...rows)));
  const tax = investTaxCard(state, today);
  if (tax) root.append(tax);
}

// Riepilogo annuo delle tasse degli investimenti (decisione v5 §3b, design §6.4): anno in corso e precedente
// se hanno dati, zainetto delle minusvalenze con la scadenza. È una stima e lo dice.
function investTaxCard(state, today) {
  const y = Number(today.slice(0, 4));
  const has = (t) => t.gains > 0 || t.losses > 0 || t.withheld > 0 || t.due > 0;
  const years = [y, y - 1].map((yr) => ({ yr, t: investTaxYear(state, yr, today) }));
  const carry = years[0].t.carry;
  const shown = years.filter((x) => has(x.t));
  if (!shown.length && !carry.length) return null;
  const kv = (label, v, id) => el('div', { class: 'kv' }, el('span', { text: label }), el('span', { id, text: formatEuro(v) }));
  return card({ title: 'Tasse degli investimenti', tint: 'indigo', icon: 'percent', id: 'conti-invest-tax' },
    shown.map(({ yr, t }) => [
      el('p', { class: 'ledger__title', text: String(yr) }),
      kv('Plusvalenze realizzate', t.gains, `tax-gains-${yr}`),
      t.losses > 0 ? kv('Minusvalenze', t.losses, `tax-losses-${yr}`) : null,
      t.withheld > 0 ? kv('Tasse trattenute dal broker', t.withheld, `tax-withheld-${yr}`) : null,
      t.due > 0 ? kv('Tasse da pagare con la dichiarazione', t.due, `tax-due-${yr}`) : null,
    ]),
    carry.length ? [
      el('p', { class: 'ledger__title', text: 'Zainetto fiscale' }),
      carry.map((c) => el('div', { class: 'kv', attrs: { 'data-carry': c.movement.id } }, el('span', { text: formatEuro(c.amount) }), el('span', { class: 'is-muted', text: `scade il ${formatDateIt(c.expires)}` }))),
    ] : null,
    el('div', { class: 'note' }, icon('info'), el('p', { text: 'Stima: non sostituisce la dichiarazione né i documenti del broker. Le minusvalenze non riducono le tasse sugli ETF.' })));
}

// Foglio Nuovo ETF / Modifica ETF (design §8.1): nome, ISIN o sigla, aliquota sulle plusvalenze, regime, colore.
export function openInvestmentForm(ctx, etf = null) {
  const { store } = ctx;
  const state = store.getState();
  const d = etf
    ? { name: etf.name, code: etf.code || '', rateText: formatRateBp(etf.taxRateBp).replace('%', ''), regime: etf.taxRegime, color: etf.color }
    : { name: '', code: '', rateText: '26', regime: 'amministrato', color: PALETTE[(state.investments || []).length % PALETTE.length] };
  let body;
  const draw = () => preserveFocus(() => { clear(body); body.append(...build()); });
  function build() {
    return [
      el('div', { class: 'form-group' },
        field({ label: 'Nome', field: 'name', id: 'e-name', input: input({ id: 'e-name', value: d.name, maxlength: 60, placeholder: 'Es. ETF Mondo', onInput: (v) => { d.name = v; } }) }),
        field({ label: 'ISIN o sigla', field: 'code', id: 'e-code', hint: 'Il codice ISIN di 12 caratteri o la sigla del broker',
          input: input({ id: 'e-code', value: d.code, maxlength: 20, placeholder: 'Facoltativo', onInput: (v) => { d.code = v; }, attrs: { autocapitalize: 'characters' } }) }),
        field({ label: 'Aliquota sulle plusvalenze (%)', field: 'taxRateBp', id: 'e-rate', hint: 'Di solito 26%. Per gli ETF con titoli di Stato è più bassa, perché quella parte è tassata al 12,5%.',
          input: input({ id: 'e-rate', value: d.rateText, inputmode: 'decimal', placeholder: '26', onInput: (v) => { d.rateText = v; } }) })),
      el('p', { class: 'field__label', text: 'Regime' }),
      segmented([{ value: 'amministrato', label: 'Amministrato', id: 'e-regime-amm' }, { value: 'dichiarativo', label: 'Dichiarativo', id: 'e-regime-dich' }], d.regime, (v) => { d.regime = v; draw(); }, { label: 'Regime' }),
      el('p', { class: 'section-footer', id: 'e-regime-hint', text: d.regime === 'amministrato'
        ? 'Il broker trattiene le tasse quando vendi: l\'app le toglie dall\'importo che arriva sul conto.'
        : 'Le tasse le versi tu con la dichiarazione dei redditi: l\'app le somma in Tasse da pagare.' }),
      etf ? el('p', { class: 'section-footer', text: 'Cambiare regime o aliquota non modifica le vendite già salvate.' }) : null,
      el('p', { class: 'field__label', text: 'Colore' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field', dataset: { field: 'color' } }, colorPicker(d.color, (c) => { d.color = c; }), el('p', { class: 'field__error', hidden: true }))),
    ];
  }
  return sheet({
    title: etf ? 'Modifica ETF' : 'Nuovo ETF',
    onSave: () => {
      const taxRateBp = parsePercentInput(d.rateText, { max: 10000 });
      if (taxRateBp === null) throw new ValidationError('Scrivi un\'aliquota tra 0 e 100 (es. 26)', 'taxRateBp');
      const inp = { name: d.name, code: d.code, taxRateBp, taxRegime: d.regime, color: d.color };
      if (etf) { store.updateInvestment(etf.id, inp); toast('Modifiche salvate'); } else {
        inp.order = (state.investments || []).length;
        store.addInvestment(inp);
        toast('ETF creato');
      }
      return true;
    },
    content: (s) => { body = s.body; body.append(...build()); setTimeout(() => document.getElementById('e-name')?.focus(), 0); },
  });
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

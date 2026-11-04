// Fogli per inserire e modificare movimenti (uscita, entrata, trasferimento, restituzione,
// variazione quantità), programmati, conferma "Da confermare". Bozza nello stato del modulo.

import { el, sheet, field, input, textarea, select, chips, segmented, toggle, stepper, toast, icon, clear, preserveFocus, button, confirmDialog, attempt } from '../ui.js';
import { parseEuroInput, parseQtyInput, formatEuro, formatEuroPlain, formatQtyPlain, formatQty } from '../money.js';
import { ValidationError } from '../errors.js';
import { formatDateIt, monthOf } from '../dates.js';
import { FREQ_LABELS } from '../recurrence.js';
import * as C from '../calc.js';

const TYPE_TITLES = {
  uscita: 'Uscita', entrata: 'Entrata', trasferimento: 'Trasferimento',
  restituzione: 'Restituzione', variazione: 'Variazione quantità',
};

const acc = (state, id) => state.accounts.find((a) => a.id === id) || null;
const isCrypto = (a) => a && a.kind === 'crypto';
const unitOf = (a) => (a ? (a.kind === 'crypto' ? 'c:' + a.asset : 'eur') : null);

function parseFor(a, text, opts) {
  return isCrypto(a) ? parseQtyInput(text, opts) : parseEuroInput(text, opts);
}
function plainFor(a, v) {
  return isCrypto(a) ? formatQtyPlain(v) : formatEuroPlain(v);
}
export function formatFor(a, v) {
  return isCrypto(a) ? formatQty(v, a.asset) : formatEuro(v);
}

// Conti selezionabili per un tipo; il conto già scelto resta anche se eliminato.
function accountOptions(state, type, currentId) {
  const list = C.sortedAccounts(state).filter((a) => {
    if (['uscita', 'entrata', 'restituzione'].includes(type)) return a.kind === 'eur';
    if (type === 'variazione') return a.kind === 'crypto';
    return true;
  });
  const opts = list.map((a) => ({ value: a.id, label: a.name + (a.kind === 'crypto' ? ` (${a.asset})` : '') }));
  if (currentId && !opts.some((o) => o.value === currentId)) opts.unshift({ value: currentId, label: C.accountLabel(state, currentId) });
  return opts;
}

function defaultAccount(state, type) {
  return accountOptions(state, type)[0]?.value || '';
}

// Con salaryFirst la categoria con ruolo Stipendio è la prima chip delle entrate.
function categoryChips(state, type, value, onChange, { salaryFirst = false } = {}) {
  let cats = C.sortedCategories(state, type);
  if (salaryFirst && type === 'entrata') cats = [...cats.filter((c) => c.role === 'stipendio'), ...cats.filter((c) => c.role !== 'stipendio')];
  const opts = cats.map((c) => ({ value: c.id, label: c.name, color: c.color, id: 'cat-' + c.id }));
  if (value && !opts.some((o) => o.value === value)) opts.unshift({ value, label: C.categoryLabel(state, value), color: C.categoryColor(state, value) });
  return chips(opts, value, onChange, { wrap: true, label: 'Categoria' });
}

function amountInput(id, value, onInput, placeholder = '0,00') {
  return input({ id, value, inputmode: 'decimal', placeholder, cls: 'input--amount', onInput });
}

function budgetWarning(store, mov) {
  if (mov.type !== 'uscita') return;
  const st = C.budgetStatus(store.getState(), monthOf(mov.date)).find((b) => b.category.id === mov.categoryId);
  if (st && st.over) toast(`Budget ${st.category.name} superato: ${formatEuro(st.spent)} su ${formatEuro(st.budget)}`, { error: true, duration: 5000 });
}

function needsTemplatesAccounts(ctx) {
  const state = ctx.store.getState();
  if (C.sortedAccounts(state).length) return false;
  confirmDialog({ title: 'Prima crea un conto', message: 'Per registrare un movimento serve almeno un conto (es. Revolut, Contanti).', confirmLabel: 'Crea conto' })
    .then((ok) => { if (ok) ctx.go('conti', { newAccount: true }); });
  return true;
}

// Pulsante +: nuova uscita con le voci recenti in cima; date = giorno scelto nel calendario (altrimenti oggi).
export function openQuickAdd(ctx, { date } = {}) {
  if (needsTemplatesAccounts(ctx)) return;
  openMovementForm(ctx, { preset: { type: 'uscita', date }, showRecents: true });
}

// "Non la ricevo più": la quota esclusa scende a quanto già restituito; la parte mancante torna spesa.
export async function writeOffCredit(ctx, expense) {
  const { store } = ctx;
  const m = store.find('movement', expense.id);
  if (!m) return;
  const refunded = C.refundedOf(store.getState(), m.id);
  const missing = m.excluded - refunded;
  if (missing <= 0) return;
  const ok = await confirmDialog({
    title: 'Non la ricevi più?',
    message: `La quota esclusa scende da ${formatEuro(m.excluded)} a ${formatEuro(refunded)} (già restituiti). I ${formatEuro(missing)} mancanti tornano a contare come spesa in statistiche e budget. Il saldo del conto non cambia.`,
    confirmLabel: 'Non la ricevo più',
  });
  if (!ok) return;
  const prevExcluded = m.excluded;
  if (attempt(() => store.updateMovement(m.id, { excluded: refunded }))) {
    toast(`${formatEuro(missing)} tornano a contare come spesa`, { undo: () => store.updateMovement(m.id, { excluded: prevExcluded }) });
  }
}

/**
 * Foglio del movimento.
 * opts: { movement } per modificare; { preset } per un nuovo; { confirm: { sched, date } } per confermare.
 */
export function openMovementForm(ctx, opts = {}) {
  const { store } = ctx;
  const editing = opts.movement || null;
  const confirming = opts.confirm || null;
  const state0 = store.getState();
  const today = ctx.today();

  const d = (() => {
    if (editing) {
      const m = editing;
      const a = acc(state0, m.accountId);
      const to = acc(state0, m.toAccountId);
      return {
        type: m.type, date: m.date, accountId: m.accountId, toAccountId: m.toAccountId || '', categoryId: m.categoryId || '',
        amountText: plainFor(a, Math.abs(m.amount)), sign: m.amount < 0 ? -1 : 1,
        amountToText: m.amountTo ? plainFor(to, m.amountTo) : '', description: m.description || '', note: m.note || '',
        excludeOn: !!m.excluded, excludedText: m.excluded ? formatEuroPlain(m.excluded) : '',
        grossText: m.gross ? formatEuroPlain(m.gross) : '', refundOf: m.refundOf || null,
      };
    }
    if (confirming) {
      const s = confirming.sched;
      const a = acc(state0, s.accountId);
      const to = acc(state0, s.toAccountId);
      return {
        type: s.type, date: confirming.date, accountId: s.accountId, toAccountId: s.toAccountId || '', categoryId: s.categoryId || '',
        // L'importo è quello scritto dall'utente nel programmato (non un suggerimento dell'app).
        amountText: plainFor(a, s.amount), sign: 1, amountToText: s.amountTo ? plainFor(to, s.amountTo) : '',
        description: s.description || '', note: '', excludeOn: false, excludedText: '', grossText: '', refundOf: null,
      };
    }
    const p = opts.preset || {};
    const type = p.type || 'uscita';
    return {
      type, date: p.date || today, accountId: p.accountId || defaultAccount(state0, type), toAccountId: p.toAccountId || '',
      categoryId: p.categoryId || '', amountText: '', sign: p.sign || 1, amountToText: '', description: p.description || '', note: '',
      excludeOn: false, excludedText: '', grossText: '', refundOf: p.refundOf || null,
    };
  })();

  const title = editing ? TYPE_TITLES[d.type] : confirming ? 'Conferma pagamento' : d.type === 'restituzione' ? 'Restituzione' : d.type === 'variazione' ? 'Variazione quantità' : 'Nuovo movimento';
  let body;

  function draw() {
    preserveFocus(() => {
      clear(body);
      body.append(...build());
    });
  }

  function build() {
    const state = store.getState();
    const a = acc(state, d.accountId);
    const out = [];
    const isNewFree = !editing && !confirming && !['restituzione', 'variazione'].includes(d.type);
    // In modifica uscita, entrata e trasferimento possono cambiare tipo (restituzioni e variazioni no).
    const canSwitchType = isNewFree || (editing && ['uscita', 'entrata', 'trasferimento'].includes(editing.type));

    if (isNewFree && opts.showRecents) {
      const rec = C.recentTemplates(state, 8).filter((t) => t.type === d.type || d.type === 'uscita');
      if (rec.length) {
        out.push(el('p', { class: 'field__label', text: 'Recenti' }));
        out.push(el('div', { class: 'recents' }, rec.map((t, i) => el('button', {
          type: 'button', class: 'recent', id: 'recent-' + i,
          on: { click: () => { Object.assign(d, { type: t.type, accountId: t.accountId, toAccountId: t.toAccountId || '', categoryId: t.categoryId || '', description: t.description }); draw(); focusAmount(); } },
        }, el('span', { class: 'recent__icon', vars: { '--c': t.type === 'trasferimento' ? (acc(state, t.accountId)?.color || C.NEUTRAL_COLOR) : C.categoryColor(state, t.categoryId) } }, icon(t.type === 'trasferimento' ? 'transfer' : t.type === 'entrata' ? 'down' : 'tag')),
        el('span', { text: C.templateLabel(state, t) })))));
      }
    }
    if (canSwitchType) {
      out.push(segmented([
        { value: 'uscita', label: 'Uscita', id: 'type-uscita' },
        { value: 'entrata', label: 'Entrata', id: 'type-entrata' },
        { value: 'trasferimento', label: 'Trasferimento', id: 'type-trasferimento' },
      ], d.type, (v) => {
        if (editing && editing.type === 'uscita' && v !== 'uscita' && C.refundsOf(store.getState(), editing.id).length) {
          toast('Questa spesa ha restituzioni collegate: per cambiarne il tipo elimina prima le restituzioni', { error: true, duration: 5000 });
          return;
        }
        d.type = v;
        const ok = accountOptions(store.getState(), v).some((o) => o.value === d.accountId);
        if (!ok) d.accountId = defaultAccount(store.getState(), v);
        const cat = state.categories.find((c) => c.id === d.categoryId);
        if (!cat || cat.type !== v) d.categoryId = '';
        if (editing && v === 'trasferimento') { d.toAccountId = ''; d.amountToText = ''; }
        if (editing) {
          const t = body.closest('.sheet')?.querySelector('.sheet__title');
          if (t) t.textContent = TYPE_TITLES[v];
        }
        draw();
      }, { label: 'Tipo di movimento' }));
    }

    if (d.type === 'restituzione') {
      const exp = state.movements.find((m) => m.id === d.refundOf);
      if (exp) {
        const residual = C.residualOf(state, exp) + (editing ? editing.amount : 0);
        out.push(el('div', { class: 'card' },
          el('p', { class: 'hero__label', text: 'Restituzione per la spesa' }),
          el('p', { class: 'row__title', text: `${exp.description || C.categoryLabel(state, exp.categoryId)} · ${formatDateIt(exp.date)}` }),
          el('p', { class: 'hero__sub', text: `Quota esclusa ${formatEuro(exp.excluded)} · da ricevere ${formatEuro(Math.max(0, residual))}` }),
          exp.deleted ? el('p', { class: 'hero__sub is-danger', text: 'La spesa è stata eliminata' }) : null));
      }
    }

    if (d.type === 'variazione') {
      out.push(segmented([{ value: 1, label: 'Aumenta', id: 'sign-plus' }, { value: -1, label: 'Diminuisci', id: 'sign-minus' }], d.sign, (v) => { d.sign = v; draw(); }, { label: 'Segno' }));
    }

    const amountLabel = d.type === 'trasferimento' ? 'Importo inviato' : isCrypto(a) ? 'Quantità' : 'Importo';
    const amountHint = d.type === 'restituzione' ? (() => {
      const exp = state.movements.find((m) => m.id === d.refundOf);
      return exp ? `Da ricevere: ${formatEuro(Math.max(0, C.residualOf(state, exp) + (editing ? editing.amount : 0)))}` : null;
    })() : isCrypto(a) ? `In ${a.asset}, fino a 8 decimali` : null;
    out.push(el('div', { class: 'form-group' },
      field({ label: amountLabel + (isCrypto(a) ? ` (${a.asset})` : ' (€)'), field: 'amount', id: 'f-amount', hint: amountHint,
        input: amountInput('f-amount', d.amountText, (v) => { d.amountText = v; }, isCrypto(a) ? '0,00000000' : '0,00') })));

    // Lordo subito sotto l'importo quando la categoria è Stipendio (o c'è già un lordo).
    if (d.type === 'entrata') {
      const cat = state.categories.find((c) => c.id === d.categoryId);
      if (cat?.role === 'stipendio' || d.grossText) {
        const net = parseEuroInput(d.amountText);
        const gross = parseEuroInput(d.grossText);
        out.push(el('div', { class: 'form-group' },
          field({ label: 'Lordo (facoltativo, €)', field: 'gross', id: 'f-gross',
            hint: net && gross ? `Trattenute: ${formatEuro(gross - net)}. L'importo sopra è il netto arrivato sul conto.` : 'Per l\'area Stipendio e tasse. L\'importo sopra è il netto.',
            input: input({ id: 'f-gross', value: d.grossText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.grossText = v; } }) })));
      }
    }

    // Conti
    const accGroup = [];
    accGroup.push(field({ label: d.type === 'trasferimento' ? 'Da conto' : 'Conto', field: 'accountId', id: 'f-account',
      input: select({ id: 'f-account', options: [{ value: '', label: 'Scegli…', disabled: true }, ...accountOptions(state, d.type, editing?.accountId)], value: d.accountId, onChange: (v) => { d.accountId = v; draw(); } }) }));
    if (d.type === 'trasferimento') {
      const toOpts = accountOptions(state, 'trasferimento', editing?.toAccountId).filter((o) => o.value !== d.accountId);
      accGroup.push(field({ label: 'A conto', field: 'toAccountId', id: 'f-to',
        input: select({ id: 'f-to', options: [{ value: '', label: 'Scegli…', disabled: true }, ...toOpts], value: d.toAccountId, onChange: (v) => { d.toAccountId = v; draw(); } }) }));
      const to = acc(state, d.toAccountId);
      if (a && to && unitOf(a) !== unitOf(to)) {
        accGroup.push(field({ label: `Importo ricevuto (${isCrypto(to) ? to.asset : '€'})`, field: 'amountTo', id: 'f-amountTo',
          hint: 'I due conti hanno unità diverse: scrivi quanto è arrivato.',
          input: input({ id: 'f-amountTo', value: d.amountToText, inputmode: 'decimal', placeholder: isCrypto(to) ? '0,00000000' : '0,00', onInput: (v) => { d.amountToText = v; } }) }));
      }
    }
    out.push(el('div', { class: 'form-group' }, accGroup));

    if (d.type === 'uscita' || d.type === 'entrata') {
      out.push(el('p', { class: 'field__label', text: 'Categoria' }));
      out.push(el('div', { class: 'form-group', dataset: { field: 'categoryId' } },
        el('div', { class: 'field' }, categoryChips(state, d.type, d.categoryId, (v) => { d.categoryId = v; draw(); }, { salaryFirst: true }), el('p', { class: 'field__error', hidden: true }))));
    }

    out.push(el('div', { class: 'form-group' },
      field({ label: 'Data', field: 'date', id: 'f-date', input: input({ id: 'f-date', type: 'date', value: d.date, cls: 'input--date', onInput: (v) => { d.date = v; } }) }),
      field({ label: 'Descrizione', field: 'description', id: 'f-desc', input: input({ id: 'f-desc', value: d.description, maxlength: 80, placeholder: 'Facoltativa', onInput: (v) => { d.description = v; } }) })));

    if (d.type === 'uscita') {
      const amount = parseEuroInput(d.amountText);
      const ex = parseEuroInput(d.excludedText);
      const group = [el('div', { class: 'field field--inline' },
        el('label', { class: 'field__label', text: 'Escludi una quota', attrs: { for: 'f-exclude' } }),
        toggle({ id: 'f-exclude', checked: d.excludeOn, label: 'Escludi una quota', onChange: (v) => { d.excludeOn = v; draw(); if (v) document.getElementById('f-excluded')?.focus(); } }))];
      if (d.excludeOn) {
        group.push(field({ label: 'Quota da ricevere (€)', field: 'excluded', id: 'f-excluded',
          hint: amount && ex !== null ? `Il conto scende di ${formatEuro(amount)}; statistiche e budget contano ${formatEuro(Math.max(0, amount - ex))}. ${formatEuro(ex)} restano "Da ricevere".` : 'Esempio: hai pagato 40 € e 20 € sono di un amico. Il conto scende di 40 €, le statistiche contano 20 €.',
          input: input({ id: 'f-excluded', value: d.excludedText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.excludedText = v; } }) }));
      }
      out.push(el('div', { class: 'form-group' }, group));
      if (editing && editing.excluded) {
        const refunds = C.refundsOf(state, editing.id);
        const residual = C.residualOf(state, editing);
        const rows = refunds.map((r) => el('div', { class: 'kv' }, el('span', { text: `Restituzione ${formatDateIt(r.date)}` }), el('span', { class: 'is-income', text: formatEuro(r.amount) })));
        out.push(el('div', { class: 'card' },
          el('div', { class: 'card__head' }, el('h2', { class: 'card__title', text: 'Da ricevere' })),
          ...rows,
          el('div', { class: 'kv' }, el('span', { text: 'Ancora da ricevere' }), el('span', { text: formatEuro(residual) })),
          residual > 0 ? el('div', { class: 'btn-row' },
            button('Registra restituzione', () => { api.close(); openRefundForm(ctx, store.find('movement', editing.id)); }, { icon: 'hand', small: true, id: 'f-add-refund' }),
            button('Non la ricevo più', () => { api.close(); writeOffCredit(ctx, editing); }, { kind: 'plain', small: true, id: 'f-writeoff' })) : null));
      }
    }

    out.push(el('div', { class: 'form-group' },
      field({ label: 'Note', field: 'note', id: 'f-note', input: textarea({ id: 'f-note', value: d.note, maxlength: 500, placeholder: 'Facoltative', onInput: (v) => { d.note = v; } }) })));

    if (confirming) {
      out.push(el('div', { class: 'btn-row' }, button('Salta questa volta', () => {
        api.close();
        skipWithUndo(ctx, confirming.sched, confirming.date);
      }, { kind: 'plain', id: 'f-skip' })));
    }
    if (editing) {
      out.push(el('div', { class: 'list' }, el('button', { type: 'button', class: 'row row--danger row--noicon', id: 'f-delete', text: 'Elimina movimento', on: { click: () => {
        api.close();
        if (attempt(() => store.deleteMovement(editing.id))) toast('Movimento eliminato', { undo: () => store.restoreMovement(editing.id) });
      } } })));
    }
    if (isNewFree) {
      out.push(el('div', { class: 'btn-row' }, button('Programma un pagamento', () => { api.close(); openScheduledForm(ctx, { preset: { type: d.type, accountId: d.accountId, categoryId: d.categoryId, description: d.description, amountText: d.amountText, start: d.date } }); }, { kind: 'plain', icon: 'repeat', id: 'f-schedule' })));
    }
    return out;
  }

  function focusAmount() {
    setTimeout(() => document.getElementById('f-amount')?.focus(), 0);
  }

  function collect() {
    const state = store.getState();
    const a = acc(state, d.accountId);
    if (!d.accountId) throw new ValidationError('Scegli un conto', 'accountId');
    const amount = parseFor(a, d.amountText);
    if (amount === null || amount === 0) throw new ValidationError(d.amountText.trim() ? 'Importo non valido (es. 12,50)' : 'Inserisci l\'importo', 'amount');
    const input = { type: d.type, date: d.date, amount: d.type === 'variazione' ? amount * d.sign : amount, accountId: d.accountId, description: d.description, note: d.note };
    if (d.type === 'uscita' || d.type === 'entrata') {
      if (!d.categoryId) throw new ValidationError('Scegli una categoria', 'categoryId');
      input.categoryId = d.categoryId;
    }
    if (d.type === 'uscita') {
      let ex = 0;
      if (d.excludeOn && d.excludedText.trim()) {
        ex = parseEuroInput(d.excludedText);
        if (ex === null) throw new ValidationError('Quota non valida (es. 20,00)', 'excluded');
      }
      input.excluded = ex;
    }
    if (d.type === 'entrata') {
      if (d.grossText.trim()) {
        const g = parseEuroInput(d.grossText);
        if (g === null) throw new ValidationError('Lordo non valido (es. 2.000,00)', 'gross');
        input.gross = g;
      } else input.gross = null;
    }
    if (d.type === 'trasferimento') {
      if (!d.toAccountId) throw new ValidationError('Scegli il conto di arrivo', 'toAccountId');
      input.toAccountId = d.toAccountId;
      const to = acc(state, d.toAccountId);
      if (a && to && unitOf(a) !== unitOf(to)) {
        const v = parseFor(to, d.amountToText);
        if (v === null || v === 0) throw new ValidationError('Inserisci quanto è arrivato sul conto di destinazione', 'amountTo');
        input.amountTo = v;
      } else input.amountTo = null;
    }
    if (d.type === 'restituzione') input.refundOf = d.refundOf;
    return input;
  }

  const api = sheet({
    title,
    onSave: () => {
      const inp = collect();
      let mov;
      if (editing) mov = store.updateMovement(editing.id, inp);
      else if (confirming) mov = store.confirmOccurrence(confirming.sched.id, confirming.date, { ...inp });
      else mov = store.addMovement(inp);
      toast(editing ? 'Modifiche salvate' : confirming ? 'Pagamento confermato' : 'Movimento salvato');
      budgetWarning(store, mov);
      return mov;
    },
    content: (s) => { body = s.body; body.append(...build()); },
  });
  if (!editing) focusAmount();
  return api;
}

export function skipWithUndo(ctx, sched, date) {
  if (attempt(() => { ctx.store.skipOccurrence(sched.id, date); return true; })) {
    toast(`Saltato: ${sched.description || 'pagamento'} del ${formatDateIt(date)}`, { undo: () => ctx.store.unhandleOccurrence(sched.id, date) });
  }
}

export function openConfirmForm(ctx, sched, date) {
  return openMovementForm(ctx, { confirm: { sched, date } });
}

// Restituzione collegata a una spesa: importo vuoto, conto della spesa se ancora valido.
export function openRefundForm(ctx, expense) {
  const state = ctx.store.getState();
  const a = acc(state, expense.accountId);
  const accountId = a && !a.deleted && a.kind === 'eur' ? a.id : defaultAccount(state, 'restituzione');
  return openMovementForm(ctx, { preset: { type: 'restituzione', refundOf: expense.id, accountId } });
}

// ---- Pagamenti programmati ----
export function openScheduledForm(ctx, opts = {}) {
  const { store } = ctx;
  if (needsTemplatesAccounts(ctx)) return null;
  const editing = opts.scheduled || null;
  const state0 = store.getState();
  const p = opts.preset || {};
  const d = editing ? {
    type: editing.type, amountText: plainFor(acc(state0, editing.accountId), editing.amount), accountId: editing.accountId,
    toAccountId: editing.toAccountId || '', amountToText: editing.amountTo ? plainFor(acc(state0, editing.toAccountId), editing.amountTo) : '',
    categoryId: editing.categoryId || '', description: editing.description || '', start: editing.start, freq: editing.freq,
    interval: editing.interval || 2, endOn: !!editing.end, end: editing.end || '',
  } : {
    // Importo e data arrivano dal foglio + solo se l'utente li aveva già scritti (nessun importo suggerito).
    type: ['uscita', 'entrata', 'trasferimento'].includes(p.type) ? p.type : 'uscita', amountText: p.amountText || '', accountId: p.accountId || '',
    toAccountId: '', amountToText: '', categoryId: p.categoryId || '', description: p.description || '', start: p.start || ctx.today(),
    freq: 'monthly', interval: 2, endOn: false, end: '',
  };
  if (!accountOptions(state0, d.type).some((o) => o.value === d.accountId)) d.accountId = defaultAccount(state0, d.type);
  let body;
  const draw = () => preserveFocus(() => { clear(body); body.append(...build()); });

  function build() {
    const state = store.getState();
    const a = acc(state, d.accountId);
    const out = [];
    out.push(segmented([
      { value: 'uscita', label: 'Uscita', id: 's-type-uscita' }, { value: 'entrata', label: 'Entrata', id: 's-type-entrata' }, { value: 'trasferimento', label: 'Trasferimento', id: 's-type-trasferimento' },
    ], d.type, (v) => {
      d.type = v;
      if (!accountOptions(store.getState(), v).some((o) => o.value === d.accountId)) d.accountId = defaultAccount(store.getState(), v);
      const cat = state.categories.find((c) => c.id === d.categoryId);
      if (!cat || cat.type !== v) d.categoryId = '';
      draw();
    }, { label: 'Tipo' }));
    out.push(el('div', { class: 'form-group' },
      field({ label: `Importo previsto${isCrypto(a) ? ` (${a.asset})` : ' (€)'}`, field: 'amount', id: 's-amount', hint: 'Alla conferma potrai correggerlo.',
        input: amountInput('s-amount', d.amountText, (v) => { d.amountText = v; }, isCrypto(a) ? '0,00000000' : '0,00') })));
    const g = [field({ label: d.type === 'trasferimento' ? 'Da conto' : 'Conto', field: 'accountId', id: 's-account',
      input: select({ id: 's-account', options: [{ value: '', label: 'Scegli…', disabled: true }, ...accountOptions(state, d.type, editing?.accountId)], value: d.accountId, onChange: (v) => { d.accountId = v; draw(); } }) })];
    if (d.type === 'trasferimento') {
      g.push(field({ label: 'A conto', field: 'toAccountId', id: 's-to',
        input: select({ id: 's-to', options: [{ value: '', label: 'Scegli…', disabled: true }, ...accountOptions(state, 'trasferimento', editing?.toAccountId).filter((o) => o.value !== d.accountId)], value: d.toAccountId, onChange: (v) => { d.toAccountId = v; draw(); } }) }));
      const to = acc(state, d.toAccountId);
      if (a && to && unitOf(a) !== unitOf(to)) {
        g.push(field({ label: `Importo ricevuto (${isCrypto(to) ? to.asset : '€'})`, field: 'amountTo', id: 's-amountTo',
          input: input({ id: 's-amountTo', value: d.amountToText, inputmode: 'decimal', onInput: (v) => { d.amountToText = v; } }) }));
      }
    }
    out.push(el('div', { class: 'form-group' }, g));
    if (d.type !== 'trasferimento') {
      out.push(el('p', { class: 'field__label', text: 'Categoria' }));
      out.push(el('div', { class: 'form-group', dataset: { field: 'categoryId' } },
        el('div', { class: 'field' }, categoryChips(state, d.type, d.categoryId, (v) => { d.categoryId = v; draw(); }), el('p', { class: 'field__error', hidden: true }))));
    }
    const freqOpts = Object.entries(FREQ_LABELS).map(([value, label]) => ({ value, label }));
    const rep = [
      field({ label: 'Descrizione', field: 'description', id: 's-desc', input: input({ id: 's-desc', value: d.description, maxlength: 80, placeholder: 'Es. Affitto, Palestra', onInput: (v) => { d.description = v; } }) }),
      field({ label: d.freq === 'once' ? 'Data' : 'Prima scadenza', field: 'start', id: 's-start', input: input({ id: 's-start', type: 'date', value: d.start, onInput: (v) => { d.start = v; } }) }),
      field({ label: 'Ripetizione', field: 'freq', id: 's-freq', input: select({ id: 's-freq', options: freqOpts, value: d.freq, onChange: (v) => { d.freq = v; draw(); } }) }),
    ];
    if (d.freq === 'months') {
      rep.push(el('div', { class: 'field field--inline', dataset: { field: 'interval' } },
        el('span', { class: 'field__label', text: `Ogni ${d.interval} mesi` }),
        stepper({ value: d.interval, min: 2, max: 24, label: 'Ogni quanti mesi', onChange: (v) => { d.interval = v; draw(); } }),
        el('p', { class: 'field__error', hidden: true })));
    }
    if (d.freq !== 'once') {
      rep.push(el('div', { class: 'field field--inline' },
        el('label', { class: 'field__label', text: 'Data di fine', attrs: { for: 's-endon' } }),
        toggle({ id: 's-endon', checked: d.endOn, label: 'Data di fine', onChange: (v) => { d.endOn = v; draw(); } })));
      if (d.endOn) rep.push(field({ label: 'Ultima scadenza entro il', field: 'end', id: 's-end', input: input({ id: 's-end', type: 'date', value: d.end, onInput: (v) => { d.end = v; } }) }));
    }
    out.push(el('div', { class: 'form-group' }, rep));
    out.push(el('p', { class: 'section-footer', text: 'Alla scadenza non si registra da solo: lo trovi in Home → Da confermare, dove puoi confermarlo (anche correggendo importo e data) o saltarlo. Nessuna notifica.' }));
    if (editing) {
      out.push(el('div', { class: 'list' }, el('button', { type: 'button', class: 'row row--danger row--noicon', id: 's-delete', text: 'Elimina programmato', on: { click: () => {
        api.close();
        if (attempt(() => store.deleteScheduled(editing.id))) toast('Programmato eliminato', { undo: () => store.restoreScheduled(editing.id) });
      } } })));
    }
    return out;
  }

  function collect() {
    const state = store.getState();
    const a = acc(state, d.accountId);
    if (!d.accountId) throw new ValidationError('Scegli un conto', 'accountId');
    const amount = parseFor(a, d.amountText);
    if (!amount) throw new ValidationError(d.amountText.trim() ? 'Importo non valido (es. 12,50)' : 'Inserisci l\'importo previsto', 'amount');
    const inp = { type: d.type, amount, accountId: d.accountId, description: d.description, start: d.start, freq: d.freq, interval: d.freq === 'months' ? d.interval : null, end: d.freq !== 'once' && d.endOn ? d.end || 'manca' : null };
    if (inp.end === 'manca') throw new ValidationError('Scegli la data di fine', 'end');
    if (d.type === 'trasferimento') {
      if (!d.toAccountId) throw new ValidationError('Scegli il conto di arrivo', 'toAccountId');
      inp.toAccountId = d.toAccountId;
      const to = acc(state, d.toAccountId);
      if (a && to && unitOf(a) !== unitOf(to)) {
        inp.amountTo = parseFor(to, d.amountToText);
        if (!inp.amountTo) throw new ValidationError('Inserisci l\'importo ricevuto', 'amountTo');
      }
    } else {
      if (!d.categoryId) throw new ValidationError('Scegli una categoria', 'categoryId');
      inp.categoryId = d.categoryId;
    }
    return inp;
  }

  const api = sheet({
    title: editing ? 'Modifica programmato' : 'Nuovo programmato',
    onSave: () => {
      const inp = collect();
      const r = editing ? store.updateScheduled(editing.id, inp) : store.addScheduled(inp);
      toast(editing ? 'Programmato aggiornato' : 'Pagamento programmato');
      return r;
    },
    content: (s) => { body = s.body; body.append(...build()); },
  });
  if (!editing) setTimeout(() => document.getElementById('s-amount')?.focus(), 0);
  return api;
}

// Fogli per inserire e modificare movimenti (uscita, entrata con busta paga, trasferimento, Compra/Vendi crypto,
// restituzione, variazione quantità), programmati, conferma "Da confermare". Bozza nello stato del modulo.

import { el, sheet, field, input, textarea, select, chips, segmented, toggle, stepper, toast, icon, clear, preserveFocus, button, confirmDialog, attempt } from '../ui.js';
import { parseEuroInput, parseQtyInput, formatEuro, formatEuroSigned, formatEuroPlain, formatQtyPlain, formatQty, tradeEuroCents } from '../money.js';
import { ValidationError } from '../errors.js';
import { extractPdfLines, PdfReadError } from '../pdf-text.js';
import { parsePayslipLines } from '../payslip.js';
import { openSetAsideSheet } from './metti-da-parte.js';
import { formatDateIt, monthOf } from '../dates.js';
import { FREQ_LABELS } from '../recurrence.js';
import * as C from '../calc.js';
import { budgetPeriod } from '../period.js';

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

// Campi facoltativi della busta paga, con il codice della voce accanto all'etichetta (il netto è l'importo).
const PS_FIELDS = [
  ['contributions', 'Contributi a carico (900 Totale ritenute sociali)'],
  ['taxable', 'Imponibile fiscale del mese (I01)'],
  ['irpef', 'IRPEF netta trattenuta (I21)'],
  ['pension', 'Contributi deducibili fondo pensione (60450)'],
  ['deductions', 'Detrazioni del mese'],
];
const PDF_LABELS = {
  net: 'Netto a pagare', gross: 'Competenze lorde', contributions: 'Contributi (900)',
  taxable: 'Imponibile fiscale (I01)', irpef: 'IRPEF netta (I21)', pension: 'Fondo pensione (60450)',
};
const emptyPs = () => ({ contributions: '', taxable: '', irpef: '', pension: '', deductions: '' });
const psFrom = (ps) => {
  const out = emptyPs();
  if (ps) for (const k of Object.keys(out)) out[k] = ps[k] === null || ps[k] === undefined ? '' : formatEuroPlain(ps[k]);
  return out;
};
// Spesa divisa (v4): righe Nome + Quota della bozza.
const MAX_PEOPLE = 20;
const peopleFrom = (split) => (split && split.length ? split.map((x) => ({ name: x.person, amountText: formatEuroPlain(x.amount) })) : []);
const isSalaryCat = (state, id) => state.categories.find((c) => c.id === id)?.role === 'stipendio';

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

// Avviso budget sul periodo di budget della data della spesa (mese di calendario o dallo stipendio, v4).
function budgetWarning(ctx, mov) {
  if (mov.type !== 'uscita') return;
  const state = ctx.store.getState();
  const period = budgetPeriod(state, mov.date, ctx.prefs?.get().budgetPeriod);
  const st = C.budgetStatus(state, period).find((b) => b.category.id === mov.categoryId);
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
  const prevSplit = m.split || null;
  // Spesa divisa (v4): la quota di ogni persona scende a quanto ha già restituito (chi non ha restituito nulla esce).
  const patch = prevSplit && prevSplit.length
    ? { split: C.personShares(store.getState(), m).filter((x) => x.person && x.refunded > 0).map((x) => ({ person: x.person, amount: Math.min(x.share, x.refunded) })), excluded: refunded }
    : { excluded: refunded };
  if (attempt(() => store.updateMovement(m.id, patch))) {
    toast(`${formatEuro(missing)} tornano a contare come spesa`, { undo: () => store.updateMovement(m.id, { excluded: prevExcluded, split: prevSplit }) });
  }
}

/**
 * Foglio del movimento.
 * opts: { movement } per modificare; { preset } per un nuovo; { confirm: { sched, date } } per confermare.
 */
export function openMovementForm(ctx, opts = {}) {
  // Compra/Vendi crypto hanno il loro foglio (quantità × prezzo).
  if (opts.movement && C.isTrade(opts.movement)) return openTradeForm(ctx, { movement: opts.movement });
  // Interessi e rettifiche del deposito (v4) sono calcolati dall'app: sola lettura, nessun Elimina.
  if (opts.movement && (opts.movement.interest || opts.movement.align)) return openDerivedSheet(ctx, opts.movement);
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
        grossText: m.gross ? formatEuroPlain(m.gross) : '', ps: psFrom(m.payslip), pdf: null, refundOf: m.refundOf || null,
        excludeMode: m.split && m.split.length ? 'people' : 'one', people: peopleFrom(m.split), person: m.person || null,
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
        description: s.description || '', note: '', excludeOn: false, excludedText: '', grossText: '', ps: emptyPs(), pdf: null, refundOf: null,
        excludeMode: 'one', people: [], person: null,
      };
    }
    const p = opts.preset || {};
    const type = p.type || 'uscita';
    return {
      type, date: p.date || today, accountId: p.accountId || defaultAccount(state0, type), toAccountId: p.toAccountId || '',
      categoryId: p.categoryId || '', amountText: '', sign: p.sign || 1, amountToText: '', description: p.description || '', note: '',
      excludeOn: false, excludedText: '', grossText: '', ps: emptyPs(), pdf: null, refundOf: p.refundOf || null,
      excludeMode: 'one', people: [], person: p.person || null,
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
        }, el('span', { class: 'recent__icon', vars: { '--c': t.type === 'trasferimento' ? (acc(state, t.accountId)?.color || C.NEUTRAL_COLOR) : C.categoryColor(state, t.categoryId) } }, icon(t.type === 'trasferimento' ? 'transfer' : C.categoryIcon(state, t.categoryId))),
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
        // Spesa divisa: chi restituisce (chip con i nomi della spesa; "Senza nome" per la parte senza persona).
        const shares = exp.split && exp.split.length ? C.personShares(state, exp) : null;
        if (shares) {
          if (d.person === null && !editing) d.person = shares.find((x) => x.person && x.residual > 0)?.person ?? null;
          const opts = shares.filter((x) => x.residual > 0 || (editing && (x.person || null) === (editing.person || null)))
            .map((x, i) => ({ value: x.person, label: x.person || 'Senza nome', id: 'f-person-chip-' + i }));
          out.push(el('p', { class: 'field__label', text: 'Chi restituisce' }));
          out.push(el('div', { class: 'form-group', dataset: { field: 'person' } },
            el('div', { class: 'field' }, chips(opts, d.person, (v) => { d.person = v; draw(); }, { wrap: true, label: 'Chi restituisce' }), el('p', { class: 'field__error', hidden: true }))));
        }
      }
    }

    if (d.type === 'variazione') {
      out.push(segmented([{ value: 1, label: 'Aumenta', id: 'sign-plus' }, { value: -1, label: 'Diminuisci', id: 'sign-minus' }], d.sign, (v) => { d.sign = v; draw(); }, { label: 'Segno' }));
    }

    const salary = d.type === 'entrata' && isSalaryCat(state, d.categoryId);
    const amountLabel = d.type === 'trasferimento' ? 'Importo inviato' : isCrypto(a) ? 'Quantità' : salary ? 'Netto a pagare' : 'Importo';
    const amountHint = d.type === 'restituzione' ? (() => {
      const exp = state.movements.find((m) => m.id === d.refundOf);
      if (!exp) return null;
      const own = editing && (editing.person || null) === (d.person || null) ? editing.amount : 0;
      if (exp.split && exp.split.length) {
        const sh = C.personShares(state, exp).find((x) => (x.person || null) === (d.person || null));
        return `Da ricevere da ${d.person || 'Senza nome'}: ${formatEuro(Math.max(0, (sh ? sh.share - sh.refunded : 0) + own))}`;
      }
      return `Da ricevere: ${formatEuro(Math.max(0, C.residualOf(state, exp) + (editing ? editing.amount : 0)))}`;
    })() : isCrypto(a) ? `In ${a.asset}, fino a 8 decimali` : null;
    out.push(el('div', { class: 'form-group' },
      field({ label: amountLabel + (isCrypto(a) ? ` (${a.asset})` : ' (€)'), field: 'amount', id: 'f-amount', hint: amountHint,
        input: amountInput('f-amount', d.amountText, (v) => { d.amountText = v; }, isCrypto(a) ? '0,00000000' : '0,00') })));

    // Busta paga subito sotto l'importo quando la categoria è Stipendio (o ci sono già dei dati).
    // Il "Lordo" della v1 (`gross`) è il campo Competenze lorde.
    if (d.type === 'entrata' && (salary || d.grossText || Object.values(d.ps).some((v) => v.trim()))) {
      out.push(...payslipBlock());
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
        group.push(el('div', { class: 'field' }, segmented([
          { value: 'one', label: 'Una quota', id: 'ex-one' }, { value: 'people', label: 'Più persone', id: 'ex-people' },
        ], d.excludeMode, (v) => { d.excludeMode = v; if (v === 'people' && !d.people.length) d.people = [{ name: '', amountText: '' }]; draw(); }, { label: 'Quota da escludere' })));
      }
      if (d.excludeOn && d.excludeMode === 'one') {
        group.push(field({ label: 'Quota da ricevere (€)', field: 'excluded', id: 'f-excluded',
          hint: amount && ex !== null ? `Il conto scende di ${formatEuro(amount)}; statistiche e budget contano ${formatEuro(Math.max(0, amount - ex))}. ${formatEuro(ex)} restano "Da ricevere".` : 'Esempio: hai pagato 40 € e 20 € sono di un amico. Il conto scende di 40 €, le statistiche contano 20 €.',
          input: input({ id: 'f-excluded', value: d.excludedText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.excludedText = v; } }) }));
      }
      if (d.excludeOn && d.excludeMode === 'people') group.push(peopleBlock(state));
      out.push(el('div', { class: 'form-group' }, group));
      if (editing && editing.excluded) {
        const refunds = C.refundsOf(state, editing.id);
        const residual = C.residualOf(state, editing);
        const rows = refunds.map((r) => el('div', { class: 'kv' }, el('span', { text: `Restituzione ${formatDateIt(r.date)}${r.person ? ' · ' + r.person : ''}` }), el('span', { class: 'is-income', text: formatEuro(r.amount) })));
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

  // Più persone: righe Nome + Quota (€), nessun importo precompilato (D4); nomi già usati suggeriti con <datalist>.
  function peopleBlock(state) {
    const hintText = () => {
      const tot = d.people.reduce((t, p) => t + (parseEuroInput(p.amountText) || 0), 0);
      const a = parseEuroInput(d.amountText);
      return a && tot ? `Il conto scende di ${formatEuro(a)}; statistiche e budget contano ${formatEuro(Math.max(0, a - tot))}. ${formatEuro(tot)} restano "Da ricevere".`
        : 'Scrivi il nome e la quota di ciascuno: la tua parte è quella che resta.';
    };
    const refreshHint = () => { const h = document.getElementById('f-people-hint'); if (h) h.textContent = hintText(); };
    const rows = d.people.map((p, i) => el('div', { class: 'field person-row', dataset: { field: 'split-' + i } },
      el('div', { class: 'person-row__fields' },
        el('label', { class: 'sr-only', text: `Nome della persona ${i + 1}`, attrs: { for: 'f-person-' + i } }),
        input({ id: 'f-person-' + i, value: p.name, maxlength: 40, placeholder: 'Nome', attrs: { list: 'f-people-list', autocapitalize: 'words' }, onInput: (v) => { p.name = v; } }),
        el('label', { class: 'sr-only', text: `Quota di ${p.name || 'questa persona'} (€)`, attrs: { for: 'f-share-' + i } }),
        input({ id: 'f-share-' + i, value: p.amountText, inputmode: 'decimal', placeholder: 'Quota €', cls: 'person-row__amount', onInput: (v) => { p.amountText = v; refreshHint(); } }),
        el('button', { type: 'button', class: 'icon-btn', id: 'f-person-del-' + i, attrs: { 'aria-label': `Togli ${p.name || 'persona ' + (i + 1)}` },
          on: { click: () => { d.people.splice(i, 1); if (!d.people.length) d.people.push({ name: '', amountText: '' }); draw(); } } }, icon('trash'))),
      el('p', { class: 'field__error', hidden: true, attrs: { 'aria-live': 'polite' } })));
    // L'errore dell'intero elenco sta prima delle righe: showFormError usa il primo .field__error del contenitore.
    return el('div', { class: 'field people', dataset: { field: 'split' } },
      el('p', { class: 'field__label', text: 'Persone e quote' }),
      el('p', { class: 'field__error', hidden: true, attrs: { 'aria-live': 'polite' } }),
      ...rows,
      d.people.length < MAX_PEOPLE ? button('Aggiungi persona', () => { d.people.push({ name: '', amountText: '' }); draw(); setTimeout(() => document.getElementById('f-person-' + (d.people.length - 1))?.focus(), 0); }, { kind: 'plain', small: true, icon: 'plus', id: 'f-person-add' }) : null,
      el('p', { class: 'field__hint', id: 'f-people-hint', text: hintText() }),
      el('datalist', { id: 'f-people-list' }, C.knownPeople(state).map((n) => el('option', { value: n }))));
  }

  function payslipBlock() {
    const net = parseEuroInput(d.amountText);
    const gross = parseEuroInput(d.grossText);
    // Esito della lettura in un riquadro: verde con ✓ se letto, rosso con ! se non letto.
    const pdfBox = [];
    if (d.pdf?.busy) pdfBox.push(el('div', { class: 'callout' }, icon('doc'), el('div', {}, el('p', { text: 'Lettura del PDF in corso…' }))));
    else if (d.pdf?.error) pdfBox.push(el('div', { class: 'callout callout--error' }, icon('alert'), el('div', {}, el('p', { class: 'callout__title', text: d.pdf.error }))));
    else if (d.pdf?.ok) {
      pdfBox.push(el('div', { class: 'callout callout--ok' }, icon('check'), el('div', {},
        el('p', { class: 'callout__title', text: d.pdf.ok }),
        d.pdf.netComputed ? el('p', { text: 'Netto calcolato come Totale competenze − Totale ritenute: controllalo sulla busta.' }) : null,
        d.pdf.missing.length ? el('p', { text: `Non trovati: ${d.pdf.missing.join(', ')}. Compilali a mano se servono.` }) : null,
        d.pdf.monthNote ? el('p', { text: d.pdf.monthNote }) : null)));
    }
    const fileInput = el('input', { type: 'file', id: 'f-pdf', accept: 'application/pdf,.pdf', hidden: true, attrs: { 'aria-label': 'Scegli il PDF della busta paga' },
      on: { change: (e) => { const f = e.target.files && e.target.files[0]; if (f) readPdf(f); } } });
    return [
      el('p', { class: 'field__label', text: 'Busta paga (facoltativa)' }),
      el('div', { class: 'form-group' },
        el('div', { class: 'field', id: 'f-pdf-box', attrs: { 'aria-live': 'polite' } },
          button('Leggi busta paga (PDF)', () => document.getElementById('f-pdf')?.click(), { icon: 'doc', small: true, id: 'f-read-pdf', disabled: !!d.pdf?.busy }),
          fileInput,
          el('p', { class: 'field__hint', text: 'Sperimentale: il PDF viene letto solo sul telefono, non viene salvato né inviato.' }),
          ...pdfBox),
        field({ label: 'Competenze lorde (Totale competenze, €)', field: 'gross', id: 'f-gross',
          hint: net && gross ? `Trattenute: ${formatEuro(gross - net)} (competenze − netto). Il netto è l'importo arrivato sul conto.` : 'Per l\'area Stipendio e tasse. L\'importo sopra è il netto arrivato sul conto.',
          input: input({ id: 'f-gross', value: d.grossText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.grossText = v; } }) }),
        ...PS_FIELDS.map(([k, label]) => field({ label: label + ' (€)', field: 'ps-' + k, id: 'f-ps-' + k,
          input: input({ id: 'f-ps-' + k, value: d.ps[k], inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.ps[k] = v; } }) }))),
      el('p', { class: 'section-footer', text: 'Il mese della busta è quello della data dell\'entrata (scelta provvisoria). I dati servono alla stima delle tasse in Statistiche → Stipendio e tasse.' }),
    ];
  }

  // Legge il PDF sul dispositivo e riempie solo i campi trovati; l'utente controlla e salva.
  async function readPdf(file) {
    d.pdf = { busy: true };
    draw();
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const r = parsePayslipLines(await extractPdfLines(bytes));
      if (!r.found.length) {
        d.pdf = { error: 'Nel PDF non ho trovato le voci della busta paga: compila i campi a mano.' };
      } else {
        if (r.net !== null) d.amountText = formatEuroPlain(r.net);
        if (r.gross !== null) d.grossText = formatEuroPlain(r.gross);
        for (const k of ['contributions', 'taxable', 'irpef', 'pension']) if (r[k] !== null) d.ps[k] = formatEuroPlain(r[k]);
        let monthNote = null;
        if (r.month && r.year) {
          const ym = `${r.year}-${String(r.month).padStart(2, '0')}`;
          if (ym !== monthOf(d.date || today)) monthNote = `La busta è di ${String(r.month).padStart(2, '0')}/${r.year}: la data dell'entrata decide il mese (provvisorio).`;
        }
        d.pdf = { ok: `Letti ${r.found.length} campi: controlla i valori e premi Salva.`, missing: r.missing.map((k) => PDF_LABELS[k]), monthNote, netComputed: r.netComputed };
      }
    } catch (e) {
      d.pdf = { error: e instanceof PdfReadError ? e.message : 'Non riesco a leggere questo PDF: compila i campi a mano.' };
    }
    draw();
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
      input.split = null;
      if (d.excludeOn && d.excludeMode === 'people') {
        const people = d.people.filter((p) => p.name.trim() || p.amountText.trim());
        input.split = people.map((p) => {
          const at = d.people.indexOf(p);
          if (!p.name.trim()) throw new ValidationError('Inserisci il nome', 'split-' + at);
          const v = parseEuroInput(p.amountText);
          if (!v) throw new ValidationError(p.amountText.trim() ? 'Quota non valida (es. 30,00)' : 'Inserisci la quota', 'split-' + at);
          return { person: p.name, amount: v };
        });
        if (!input.split.length) input.split = null;
      } else if (d.excludeOn && d.excludedText.trim()) {
        ex = parseEuroInput(d.excludedText);
        if (ex === null) throw new ValidationError('Quota non valida (es. 20,00)', 'excluded');
      }
      input.excluded = ex;
    }
    if (d.type === 'entrata') {
      if (d.grossText.trim()) {
        const g = parseEuroInput(d.grossText);
        if (g === null || g === 0) throw new ValidationError('Competenze lorde non valide (es. 3.250,00)', 'gross');
        input.gross = g;
      } else input.gross = null;
      const ps = {};
      let any = false;
      for (const [k] of PS_FIELDS) {
        const t = d.ps[k].trim();
        if (!t) { ps[k] = null; continue; }
        const v = parseEuroInput(t);
        if (v === null) throw new ValidationError('Importo non valido (es. 1.234,56)', 'ps-' + k);
        ps[k] = v;
        any = true;
      }
      input.payslip = any ? ps : null;
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
    if (d.type === 'restituzione') { input.refundOf = d.refundOf; input.person = d.person; }
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
      budgetWarning(ctx, mov);
      // Nuovo stipendio (anche da un programmato): foglio "Metti da parte" se ci sono obiettivi attivi.
      if (!editing && mov.type === 'entrata' && isSalaryCat(store.getState(), mov.categoryId) && C.activeGoals(store.getState()).length) {
        setTimeout(() => openSetAsideSheet(ctx, { date: mov.date }), 0);
      }
      return mov;
    },
    content: (s) => { body = s.body; body.append(...build()); },
  });
  if (!editing) focusAmount();
  return api;
}

// Compra/Vendi crypto: quantità × prezzo unitario = importo in euro, calcolato ma modificabile (commissioni).
// Si salva come trasferimento euro↔crypto con `trade` e `price`.
export function openTradeForm(ctx, { side = 'compra', cryptoAccountId = null, movement = null } = {}) {
  const { store } = ctx;
  const state0 = store.getState();
  const editing = movement;
  const d = (() => {
    if (editing) {
      const buy = editing.trade === 'compra';
      const qty = buy ? editing.amountTo : editing.amount;
      const euro = buy ? editing.amount : editing.amountTo;
      return {
        side: editing.trade, cryptoId: buy ? editing.toAccountId : editing.accountId, eurId: buy ? editing.accountId : editing.toAccountId,
        qtyText: formatQtyPlain(qty), priceText: formatEuroPlain(editing.price), amountText: formatEuroPlain(euro),
        amountEdited: euro !== tradeEuroCents(qty, editing.price), date: editing.date, description: editing.description || '', note: editing.note || '',
      };
    }
    const eur = C.sortedAccounts(state0).find((a) => a.kind === 'eur');
    return { side, cryptoId: cryptoAccountId, eurId: eur?.id || '', qtyText: '', priceText: '', amountText: '', amountEdited: false, date: ctx.today(), description: '', note: '' };
  })();
  let body;
  const draw = () => preserveFocus(() => { clear(body); body.append(...build()); });
  const cryptoAcc = () => acc(store.getState(), d.cryptoId);
  const calc = () => {
    const q = parseQtyInput(d.qtyText);
    const p = parseEuroInput(d.priceText);
    return q && p ? { q, p, cents: tradeEuroCents(q, p) } : null;
  };
  const calcText = () => {
    const c = calc();
    const asset = cryptoAcc()?.asset || '';
    if (!c) return 'Scrivi quantità e prezzo: l\'importo si calcola da solo. Puoi correggerlo per le commissioni.';
    if (c.cents === null) return 'Quantità o prezzo troppo grandi';
    return `Calcolato: ${formatQty(c.q, asset)} × ${formatEuro(c.p)} = ${formatEuro(c.cents)}. Puoi correggerlo per le commissioni.`;
  };
  // Ricalcolo dal vivo senza ridisegnare (finché l'importo non è stato corretto a mano).
  const refresh = () => {
    const c = calc();
    if (!d.amountEdited) {
      d.amountText = c && c.cents !== null ? formatEuroPlain(c.cents) : '';
      const n = document.getElementById('t-amount');
      if (n) n.value = d.amountText;
    }
    const h = document.getElementById('t-calc');
    if (h) h.textContent = calcText();
  };

  function build() {
    const state = store.getState();
    const ca = cryptoAcc();
    const asset = ca?.asset || '';
    const buy = d.side === 'compra';
    const out = [];
    if (!editing) {
      out.push(segmented([{ value: 'compra', label: 'Compra', id: 'trade-compra' }, { value: 'vendi', label: 'Vendi', id: 'trade-vendi' }], d.side,
        (v) => { d.side = v; const t = body.closest('.sheet')?.querySelector('.sheet__title'); if (t) t.textContent = v === 'compra' ? `Compra ${asset}` : `Vendi ${asset}`; draw(); }, { label: 'Compra o vendi' }));
    }
    out.push(el('p', { class: 'section-footer', text: `Conto crypto: ${ca ? `${ca.name} (${asset})` : C.accountLabel(state, d.cryptoId)}` }));
    out.push(el('div', { class: 'form-group' },
      field({ label: `Quantità (${asset})`, field: 'qty', id: 't-qty', hint: 'Fino a 8 decimali',
        input: amountInput('t-qty', d.qtyText, (v) => { d.qtyText = v; refresh(); }, '0,00000000') }),
      field({ label: `Prezzo di 1 ${asset} (€)`, field: 'price', id: 't-price',
        input: input({ id: 't-price', value: d.priceText, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { d.priceText = v; refresh(); } }) }),
      field({ label: buy ? 'Importo pagato (€)' : 'Importo ricevuto (€)', field: 'amount', id: 't-amount',
        hint: el('p', { class: 'field__hint calc calc--gold', id: 't-calc', text: calcText() }),
        input: input({ id: 't-amount', value: d.amountText, inputmode: 'decimal', placeholder: '0,00', cls: 'input--amount', onInput: (v) => {
          const c = calc();
          const was = d.amountEdited;
          d.amountText = v;
          d.amountEdited = !(c && c.cents !== null && parseEuroInput(v) === c.cents);
          if (was !== d.amountEdited) draw();
        } }) }),
      d.amountEdited ? el('div', { class: 'field' }, button('Ricalcola', () => { d.amountEdited = false; refresh(); draw(); }, { kind: 'plain', small: true, id: 't-recalc', icon: 'undo' })) : null));
    const eurOpts = C.sortedAccounts(state).filter((a) => a.kind === 'eur').map((a) => ({ value: a.id, label: a.name }));
    if (d.eurId && !eurOpts.some((o) => o.value === d.eurId)) eurOpts.unshift({ value: d.eurId, label: C.accountLabel(state, d.eurId) });
    out.push(el('div', { class: 'form-group' },
      field({ label: buy ? 'Dal conto in euro' : 'Sul conto in euro', field: 'eurId', id: 't-eur',
        input: select({ id: 't-eur', options: [{ value: '', label: 'Scegli…', disabled: true }, ...eurOpts], value: d.eurId, onChange: (v) => { d.eurId = v; } }) }),
      field({ label: 'Data', field: 'date', id: 't-date', input: input({ id: 't-date', type: 'date', value: d.date, cls: 'input--date', onInput: (v) => { d.date = v; } }) }),
      field({ label: 'Descrizione', field: 'description', id: 't-desc', input: input({ id: 't-desc', value: d.description, maxlength: 80, placeholder: 'Facoltativa', onInput: (v) => { d.description = v; } }) })));
    out.push(el('div', { class: 'form-group' },
      field({ label: 'Note', field: 'note', id: 't-note', input: textarea({ id: 't-note', value: d.note, maxlength: 500, placeholder: 'Facoltative', onInput: (v) => { d.note = v; } }) })));
    out.push(el('p', { class: 'section-footer', text: 'Il patrimonio in euro cambia dell\'importo; il conto crypto della quantità. Nessun prezzo viene preso da internet.' }));
    if (editing) {
      out.push(el('div', { class: 'list' }, el('button', { type: 'button', class: 'row row--danger row--noicon', id: 't-delete', text: 'Elimina movimento', on: { click: () => {
        api.close();
        if (attempt(() => store.deleteMovement(editing.id))) toast('Movimento eliminato', { undo: () => store.restoreMovement(editing.id) });
      } } })));
    }
    return out;
  }

  function collect() {
    const qty = parseQtyInput(d.qtyText);
    if (!qty) throw new ValidationError(d.qtyText.trim() ? 'Quantità non valida (es. 0,01)' : 'Inserisci la quantità', 'qty');
    const price = parseEuroInput(d.priceText);
    if (!price) throw new ValidationError(d.priceText.trim() ? 'Prezzo non valido (es. 60.000,00)' : 'Inserisci il prezzo', 'price');
    const cents = tradeEuroCents(qty, price);
    if (cents === null) throw new ValidationError('Quantità o prezzo troppo grandi', 'amount');
    const euro = d.amountEdited ? parseEuroInput(d.amountText) : cents;
    if (!euro) throw new ValidationError(d.amountText.trim() ? 'Importo non valido (es. 600,50)' : 'Inserisci l\'importo', 'amount');
    if (!d.eurId) throw new ValidationError('Scegli il conto in euro', 'eurId');
    const buy = d.side === 'compra';
    return {
      type: 'trasferimento', trade: d.side, price, date: d.date, description: d.description, note: d.note,
      accountId: buy ? d.eurId : d.cryptoId, toAccountId: buy ? d.cryptoId : d.eurId,
      amount: buy ? euro : qty, amountTo: buy ? qty : euro,
    };
  }

  // Gli errori dello store usano i campi del movimento: si riportano sui campi del foglio.
  const FIELD_MAP = { compra: { amount: 'amount', amountTo: 'qty', accountId: 'eurId', toAccountId: 'eurId' }, vendi: { amount: 'qty', amountTo: 'amount', accountId: 'eurId', toAccountId: 'eurId' } };
  const asset0 = cryptoAcc()?.asset || '';
  const api = sheet({
    title: d.side === 'compra' ? `Compra ${asset0}` : `Vendi ${asset0}`,
    onSave: () => {
      const inp = collect();
      try {
        const mov = editing ? store.updateMovement(editing.id, inp) : store.addMovement(inp);
        toast(editing ? 'Modifiche salvate' : d.side === 'compra' ? 'Acquisto salvato' : 'Vendita salvata');
        return mov;
      } catch (e) {
        if (e instanceof ValidationError && FIELD_MAP[d.side][e.field]) throw new ValidationError(e.message, FIELD_MAP[d.side][e.field]);
        throw e;
      }
    },
    content: (s) => { body = s.body; body.append(...build()); },
  });
  if (!editing) setTimeout(() => document.getElementById('t-qty')?.focus(), 0);
  return api;
}

function openDerivedSheet(ctx, m) {
  const state = ctx.store.getState();
  const kv = (k, v, cls) => el('div', { class: 'kv' }, el('span', { text: k }), el('span', { class: cls, text: v }));
  return sheet({
    title: m.interest ? 'Interessi' : 'Rettifica saldo',
    content: (s) => s.body.append(el('div', { class: 'card', id: 'derived-card' },
      kv('Importo', formatEuroSigned(m.amount), m.amount > 0 ? 'is-income' : ''),
      kv('Conto', C.accountLabel(state, m.accountId)),
      kv(m.interest ? 'Maturati fino al' : 'Data', formatDateIt(m.date)),
      m.align ? kv('Saldo scritto', formatEuro(m.align.balance)) : null,
      m.description ? kv('Descrizione', m.description) : null),
      el('p', { class: 'section-footer', id: 'derived-note', text: 'Calcolato in automatico. Per correggerlo usa Allinea al saldo reale nel conto.' }),
      el('div', { class: 'btn-row' }, button('Apri il conto', () => { s.close(); ctx.go(`conti/${m.accountId}`); }, { small: true, icon: 'chevron', id: 'derived-account' }))),
  });
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
// Su una spesa divisa `person` sceglie subito chi restituisce (altrimenti la prima persona con un residuo).
export function openRefundForm(ctx, expense, { person = null } = {}) {
  const state = ctx.store.getState();
  const a = acc(state, expense.accountId);
  const accountId = a && !a.deleted && a.kind === 'eur' ? a.id : defaultAccount(state, 'restituzione');
  return openMovementForm(ctx, { preset: { type: 'restituzione', refundOf: expense.id, accountId, person } });
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

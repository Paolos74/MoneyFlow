// Importa movimenti da CSV (v4): scelta del file, formato (Revolut o colonne scelte), conto e categorie,
// anteprima con doppioni non spuntati, conferma in un solo salvataggio con Annulla. Il file resta sul dispositivo.

import { el, card, section, list, button, field, select, toggle, toast, emptyState, attempt } from '../ui.js';
import { formatEuro } from '../money.js';
import { formatDateIt } from '../dates.js';
import * as C from '../calc.js';
import { parseCsv, detectRevolut, guessColumns, hasHeaderRow, buildImportRows, suggestCategory } from '../csv-import.js';

// Bozza dell'importazione: resta tra un ridisegno e l'altro finché non si importa o si ricomincia.
let draft = null;

const defaultCategory = (state, type) => {
  const live = C.sortedCategories(state, type);
  return live.find((c) => c.id === `default-${type}-altro`)?.id || live.find((c) => c.name === 'Altro')?.id || live[0]?.id || '';
};

export function render(root, ctx) {
  const state = ctx.store.getState();
  const accounts = C.sortedAccounts(state).filter((a) => a.kind === 'eur');
  if (!accounts.length) {
    root.append(emptyState({ icon: 'wallet', title: 'Prima crea un conto in euro', text: 'I movimenti importati vanno su un conto in euro.' }));
    return;
  }
  if (!draft) return renderPick(root, ctx);
  renderSetup(root, ctx, state, accounts);
}

function renderPick(root, ctx) {
  const fileInput = el('input', { type: 'file', id: 'import-file', hidden: true, attrs: { accept: '.csv,text/csv', 'aria-label': 'Scegli il file CSV' },
    on: { change: async (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!f) return;
      try {
        const parsed = parseCsv(await f.text());
        if (parsed.rows.length < 1) { toast('Il file è vuoto', { error: true }); return; }
        const revolut = !!detectRevolut(parsed.rows[0]);
        const header = parsed.rows[0];
        const cols = revolut ? null : guessColumns(hasHeaderRow(parsed.rows) ? header : []);
        draft = {
          fileName: f.name, parsed, kind: revolut ? 'revolut' : 'generic',
          date: cols?.date ?? -1, description: cols?.description ?? -1, amount: cols?.amount ?? -1, invert: false,
          accountId: '', catOut: '', catIn: '', rows: null, overrides: {},
        };
        ctx.rerender();
      } catch {
        toast('Non riesco a leggere il file', { error: true });
      }
    } } });
  root.append(card({ title: 'Importa movimenti', icon: 'upload' },
    el('p', { text: 'Scegli un file CSV: l\'estratto conto di Revolut viene riconosciuto da solo; per gli altri scegli le colonne Data, Descrizione e Importo.' }),
    el('p', { text: 'Prima di salvare vedi l\'anteprima: i movimenti già presenti non vengono importati due volte.' }),
    fileInput,
    button('Scegli il file CSV', () => fileInput.click(), { kind: 'primary', icon: 'upload', id: 'import-pick' })));
  root.append(el('p', { class: 'section-footer', text: 'Il file viene letto solo su questo dispositivo, non viene salvato né inviato.' }));
}

function renderSetup(root, ctx, state, accounts) {
  const d = draft;
  if (!accounts.some((a) => a.id === d.accountId)) d.accountId = accounts[0].id;
  if (!C.sortedCategories(state, 'uscita').some((c) => c.id === d.catOut)) d.catOut = defaultCategory(state, 'uscita');
  if (!C.sortedCategories(state, 'entrata').some((c) => c.id === d.catIn)) d.catIn = defaultCategory(state, 'entrata');
  const redraw = () => ctx.rerender();

  root.append(card({ title: d.kind === 'revolut' ? 'Estratto conto Revolut' : 'Formato generico', icon: 'doc' },
    el('p', { id: 'import-format', text: d.kind === 'revolut'
      ? `${d.fileName}: riconosciuto. Si importano le righe completate in euro; data di completamento, importo meno la commissione.`
      : `${d.fileName}: scegli quali colonne contengono data, descrizione e importo.` }),
    button('Scegli un altro file', () => { draft = null; redraw(); }, { kind: 'plain', small: true, id: 'import-restart' })));

  if (d.kind === 'generic') {
    const header = d.parsed.rows[0] || [];
    const named = hasHeaderRow(d.parsed.rows);
    const colOpts = header.map((h, i) => ({ value: String(i), label: named ? `${i + 1}. ${h || '(vuota)'}` : `Colonna ${i + 1} (es. ${h})` }));
    const colSelect = (key, label, optional) => field({ label, field: 'col-' + key, id: 'import-col-' + key,
      input: select({ id: 'import-col-' + key, options: [{ value: '-1', label: optional ? 'Nessuna' : 'Scegli…', disabled: !optional }, ...colOpts], value: String(d[key]), onChange: (v) => { d[key] = Number(v); redraw(); } }) });
    root.append(section({ title: 'Colonne' }, el('div', { class: 'form-group' },
      colSelect('date', 'Data', false), colSelect('description', 'Descrizione', true), colSelect('amount', 'Importo', false),
      el('div', { class: 'field field--inline' },
        el('label', { class: 'field__label', text: 'Inverti segno', attrs: { for: 'import-invert' } }),
        toggle({ id: 'import-invert', checked: d.invert, label: 'Inverti segno', onChange: (v) => { d.invert = v; redraw(); } })),
      el('p', { class: 'field__hint', text: 'Attivalo se nel file le uscite sono positive. Date: GG/MM/AAAA, GG-MM-AAAA, GG.MM.AAAA o AAAA-MM-GG; importi come 1.234,56 o 1234.56.' }))));
  }

  const catOpts = (type) => C.sortedCategories(state, type).map((c) => ({ value: c.id, label: c.name }));
  root.append(section({ title: 'Dove e come' }, el('div', { class: 'form-group' },
    field({ label: 'Conto', field: 'accountId', id: 'import-account', input: select({ id: 'import-account', options: accounts.map((a) => ({ value: a.id, label: a.name })), value: d.accountId, onChange: (v) => { d.accountId = v; redraw(); } }) }),
    field({ label: 'Categoria per le uscite', id: 'import-cat-out', hint: 'Le righe con una descrizione già usata prendono la categoria dell\'ultima volta. Puoi cambiarla riga per riga.',
      input: select({ id: 'import-cat-out', options: catOpts('uscita'), value: d.catOut, onChange: (v) => { d.catOut = v; redraw(); } }) }),
    field({ label: 'Categoria per le entrate', id: 'import-cat-in', input: select({ id: 'import-cat-in', options: catOpts('entrata'), value: d.catIn, onChange: (v) => { d.catIn = v; redraw(); } }) }))));

  if (d.kind === 'generic' && (d.date < 0 || d.amount < 0)) {
    root.append(el('p', { class: 'section-footer', id: 'import-need-cols', text: 'Scegli almeno le colonne Data e Importo per vedere l\'anteprima.' }));
    return;
  }
  const mapping = d.kind === 'revolut' ? { kind: 'revolut' } : { kind: 'generic', date: d.date, description: d.description, amount: d.amount, invert: d.invert };
  const { rows, skipped } = buildImportRows(d.parsed, mapping, state, d.accountId);
  // Scelte riga per riga (spunta, categoria) per chiave d'importazione, così restano dopo un ridisegno.
  for (const r of rows) {
    const o = d.overrides[r.importKey] || {};
    r.include = o.include ?? r.include;
    r.categoryId = o.categoryId || suggestCategory(state, r.type, r.description, r.type === 'uscita' ? d.catOut : d.catIn);
  }
  const chosen = rows.filter((r) => r.include);
  const dup = rows.filter((r) => r.duplicate).length;
  const out = chosen.filter((r) => r.type === 'uscita').reduce((t, r) => t + r.amount, 0);
  const inc = chosen.filter((r) => r.type === 'entrata').reduce((t, r) => t + r.amount, 0);

  root.append(card({ title: 'Anteprima' },
    el('div', { class: 'kv' }, el('span', { text: 'Da importare' }), el('span', { id: 'import-count', text: String(chosen.length) })),
    el('div', { class: 'kv' }, el('span', { text: 'Già presenti' }), el('span', { id: 'import-dup', text: String(dup) })),
    el('div', { class: 'kv' }, el('span', { text: 'Saltate' }), el('span', { id: 'import-skipped', text: String(skipped.length) })),
    el('div', { class: 'kv' }, el('span', { text: 'Uscite' }), el('span', { id: 'import-out', text: formatEuro(out) })),
    el('div', { class: 'kv' }, el('span', { text: 'Entrate' }), el('span', { class: 'is-income', id: 'import-in', text: formatEuro(inc) }))));

  if (rows.length) {
    root.append(section({ title: 'Movimenti' }, list(...rows.map((r, i) => {
      const o = (d.overrides[r.importKey] ||= {});
      return el('div', { class: 'row row--stack import-row', attrs: { 'data-import': String(i) } },
        el('span', { class: 'import-row__check' }, el('input', { type: 'checkbox', id: 'import-inc-' + i, checked: r.include,
          attrs: { 'aria-label': `Importa ${r.description || 'movimento'} del ${formatDateIt(r.date)}` }, on: { change: (e) => { o.include = e.target.checked; redraw(); } } })),
        el('label', { class: 'row__main', attrs: { for: 'import-inc-' + i } },
          el('span', { class: 'row__title', text: r.description || (r.type === 'uscita' ? 'Uscita' : 'Entrata') }),
          el('span', { class: 'row__sub' }, el('span', { text: formatDateIt(r.date) }), r.duplicate ? el('span', { class: 'tag', text: 'Già presente' }) : null)),
        el('span', { class: `row__value ${r.type === 'entrata' ? 'is-income' : ''}`, text: r.type === 'uscita' ? formatEuro(-r.amount) : '+' + formatEuro(r.amount) }),
        el('span', { class: 'row__actions' }, select({ id: 'import-cat-' + i, options: catOpts(r.type), value: r.categoryId, onChange: (v) => { o.categoryId = v; redraw(); } })));
    }))));
  }
  if (skipped.length) {
    root.append(section({ title: 'Saltate' }, list(...skipped.map((s, i) => el('div', { class: 'row row--noicon', id: 'import-skip-' + i },
      el('span', { class: 'row__main' }, el('span', { class: 'row__title', text: `Riga ${s.line}` }), el('span', { class: 'row__sub' }, el('span', { text: s.reason }))))))));
  }
  root.append(el('div', { class: 'section' }, button(`Importa ${chosen.length} ${chosen.length === 1 ? 'movimento' : 'movimenti'}`, () => {
    const inputs = chosen.map((r) => ({ type: r.type, date: r.date, amount: r.amount, accountId: d.accountId, categoryId: r.categoryId, description: r.description, importKey: r.importKey }));
    const created = attempt(() => ctx.store.addMovements(inputs));
    if (!created) return;
    draft = null;
    toast(`Importati ${created.length} movimenti`, { undo: () => created.forEach((m) => ctx.store.deleteMovement(m.id)) });
    ctx.go('movimenti');
  }, { kind: 'primary', block: true, icon: 'upload', id: 'import-go', disabled: !chosen.length })));
}

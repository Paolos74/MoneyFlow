// Stipendio e tasse: totali dell'anno dalle buste paga, stima dell'IRPEF annua con conguaglio e addizionali,
// impostazioni della stima (solo su questo dispositivo). È una stima: non sostituisce CU né 730.

import { el, card, list, row, section, emptyState, button, icon, sheet, field, input } from '../ui.js';
import { formatEuro, formatEuroPlain, parseEuroInput, parsePercentInput, formatPercentBp } from '../money.js';
import { formatDateIt, isValidISO } from '../dates.js';
import { ValidationError, StorageError } from '../errors.js';
import { estimateYear } from '../tax.js';
import * as C from '../calc.js';
import { openMovementForm } from './movimento-form.js';

const kv = (label, value, id, cls = '', rowCls = '') => el('div', { class: 'kv ' + rowCls }, el('span', { text: label }), el('span', { id, class: cls, text: value }));
// Blocco del calcolo con un titolo piccolo (design: "scontrino" con le righe e il totale in grassetto).
const ledger = (title, ...rows) => el('div', { class: 'ledger' }, el('h3', { class: 'ledger__title', text: title }), ...rows);
const minus = (v) => (v ? '−' + formatEuro(v) : formatEuro(0));

export function render(root, ctx) {
  const state = ctx.store.getState();
  const current = Number(ctx.today().slice(0, 4));
  const year = /^\d{4}$/.test(ctx.query.anno || '') ? Number(ctx.query.anno) : current;
  ctx.header({ title: 'Stipendio e tasse', back: { href: '#statistiche', label: 'Statistiche' } });
  const goYear = (y) => ctx.go(`statistiche/stipendio?anno=${y}`);
  root.append(el('div', { class: 'year-switch' },
    el('button', { type: 'button', id: 'year-prev', attrs: { 'aria-label': 'Anno precedente' }, on: { click: () => goYear(year - 1) } }, icon('left')),
    el('strong', { id: 'year-label', text: String(year) }),
    el('button', { type: 'button', id: 'year-next', attrs: { 'aria-label': 'Anno successivo' }, on: { click: () => goYear(year + 1) } }, icon('right'))));

  // Il "Lordo" della v1 (gross) vale come Competenze lorde.
  const y = C.salaryYear(state, year);
  root.append(card({ title: `Totali ${year}`, tint: 'indigo', icon: 'doc' },
    kv('Competenze lorde', formatEuro(y.gross), 'sal-gross'),
    kv('Contributi a carico', formatEuro(y.contributions), 'sal-contrib'),
    kv('Imponibile fiscale', formatEuro(y.taxable), 'sal-taxable'),
    kv('IRPEF trattenuta', formatEuro(y.irpef), 'sal-irpef'),
    kv('Netto (tutti gli stipendi)', formatEuro(y.net), 'sal-net'),
    kv('Trattenute (competenze − netto)', formatEuro(y.withheld), 'sal-withheld'),
    y.missing ? el('p', { class: 'hero__sub', id: 'sal-missing', text: `${y.missing} ${y.missing === 1 ? 'stipendio' : 'stipendi'} senza competenze lorde: competenze e trattenute contano solo quelli che le hanno (netto relativo ${formatEuro(y.netWithGross)}).` }) : null));

  renderEstimate(root, ctx, year, y);

  root.append(section({}, list(row({ icon: 'coin', color: 'var(--indigo-fill)', title: 'Se aumento il fondo pensione', subtitle: 'Quanto costa al mese e quante tasse risparmi', href: '#impostazioni/fondo-pensione', id: 'link-pension' }))));

  const stip = C.sortedCategories(state, 'entrata').find((c) => c.role === 'stipendio');
  if (!y.rows.length) {
    root.append(emptyState({ icon: 'doc', title: `Nessuno stipendio nel ${year}`, text: 'Registra lo stipendio come entrata nella categoria Stipendio: il netto a pagare come importo e, se vuoi, i dati della busta paga.',
      action: C.sortedAccounts(state).length ? button('Aggiungi stipendio', () => openMovementForm(ctx, { preset: { type: 'entrata', categoryId: stip?.id || '' } }), { kind: 'primary', id: 'sal-add' }) : null }));
    return;
  }
  root.append(section({ title: 'Stipendi', footer: 'Tocca una riga per aggiungere o correggere i dati della busta paga.' }, list(...y.rows.map((r) => {
    // Un dato per riga, senza "·": nella colonna stretta accanto al netto nessuna riga va a capo a metà.
    const parts = [];
    if (r.gross !== null) parts.push(`Competenze ${formatEuro(r.gross)}`, `Trattenute ${formatEuro(r.withheld)}`);
    if (r.payslip?.taxable != null) parts.push(`Imponibile ${formatEuro(r.payslip.taxable)}`);
    if (r.payslip?.irpef != null) parts.push(`IRPEF ${formatEuro(r.payslip.irpef)}`);
    return row({
      icon: 'doc', color: C.categoryColor(state, r.movement.categoryId), // La descrizione si mostra solo se dice qualcosa in più del nome della categoria.
      title: `${formatDateIt(r.movement.date)}${r.movement.description && r.movement.description !== C.categoryLabel(state, r.movement.categoryId) ? ' · ' + r.movement.description : ''}`,
      subtitle: parts.length ? parts.map((t) => el('span', { text: t })) : 'Busta paga non inserita',
      value: formatEuro(r.net), valueSub: 'netto', cls: 'row--wrapsub', attrs: { 'data-salary': r.movement.id },
      onClick: () => openMovementForm(ctx, { movement: ctx.store.find('movement', r.movement.id) }),
    });
  }))));
  if (C.sortedAccounts(state).length) root.append(el('div', { class: 'btn-row' }, button('Aggiungi stipendio', () => openMovementForm(ctx, { preset: { type: 'entrata', categoryId: stip?.id || '' } }), { icon: 'plus', id: 'sal-add' })));
}

function renderEstimate(root, ctx, year, y) {
  const s = ctx.tax.get();
  const py = ctx.tax.year(year);
  const e = estimateYear({ year, months: y.months, hireDate: s.hireDate, projTaxable: py.projTaxable, projIrpef: py.projIrpef, regionalBp: s.regionalBp, municipalBp: s.municipalBp });
  const settingsBtn = button('Impostazioni della stima', () => openTaxSettings(ctx, year), { small: true, icon: 'gear', id: 'tax-settings' });
  const disclaimer = el('p', { class: 'note__strong', id: 'tax-disclaimer', text: `Stima indicativa con le regole IRPEF ${year === 2026 || !e.available ? 2026 : year}: non sostituisce la Certificazione Unica (CU) né il 730.` });
  const body = [];
  if (!e.available) {
    body.push(el('p', { id: 'tax-unavailable', text: `Tabella IRPEF ${year} non disponibile: per ora la stima c'è solo per il 2026.` }));
  } else if (e.empty) {
    body.push(el('p', { id: 'tax-empty', text: 'Per la stima scrivi nelle buste paga l\'imponibile fiscale del mese (I01) e l\'IRPEF trattenuta (I21), a mano o con "Leggi busta paga (PDF)".' }));
  } else {
    const n = e.missing;
    const how = e.manualTaxable || e.manualIrpef ? 'come scritto nelle impostazioni della stima' : 'come la media dei mesi registrati';
    const explain = n === 0
      ? `Tutti i ${e.worked} mesi lavorati del ${year} sono registrati.`
      : `${n === 1 ? 'Il mese mancante vale' : `I ${n} mesi mancanti valgono`} ${how}: ${formatEuro(e.perMonthTaxable)} di imponibile e ${formatEuro(e.perMonthIrpef)} di IRPEF al mese. Tredicesima e quattordicesima non sono stimate a parte.`;
    const balLabel = e.balance < 0 ? 'Rimborso stimato' : e.balance > 0 ? 'Da pagare stimati' : 'Nessun conguaglio stimato';
    body.push(
      el('p', { class: 'hero__label', id: 'tax-balance-label', text: balLabel }),
      el('p', { class: 'hero__value' + (e.balance < 0 ? ' is-income' : e.balance > 0 ? ' is-danger' : ''), id: 'tax-balance', text: formatEuro(Math.abs(e.balance)) }),
      el('p', { class: 'hero__sub', text: 'IRPEF dovuta sull\'anno − IRPEF trattenuta nelle buste. Di solito il conguaglio lo fa l\'azienda con le buste di fine anno.' }),
      ledger('Proiezione dell\'anno',
        kv('Mesi registrati', `${e.registered} di ${e.worked}`, 'tax-months'),
        el('p', { class: 'ledger__note', id: 'tax-explain', text: explain }),
        e.outlier ? el('p', { class: 'note note--warn', id: 'tax-outlier', text: 'Un mese è molto più alto degli altri (es. bonus una tantum): la media lo ripete nei mesi mancanti. Correggi la proiezione nelle impostazioni della stima.' }) : null),
      ledger('Calcolo dell\'IRPEF',
        kv('Imponibile annuo stimato', formatEuro(e.annualTaxable), 'tax-taxable'),
        kv('IRPEF lorda (scaglioni)', formatEuro(e.gross), 'tax-gross'),
        kv(`Detrazione lavoro dipendente (${e.days} giorni)`, minus(e.employee), 'tax-employee', '', 'kv--minus'),
        kv('Ulteriore detrazione (cuneo fiscale)', minus(e.extra), 'tax-extra', '', 'kv--minus'),
        kv('IRPEF dovuta', formatEuro(e.net), 'tax-net', '', 'kv--total'),
        kv('IRPEF trattenuta stimata', formatEuro(e.withheld), 'tax-withheld')));
    const sc = e.surcharges;
    if (sc.total === null) {
      body.push(el('p', { class: 'note', id: 'tax-surcharge-missing', text: 'Addizionali regionale e comunale: inserisci le percentuali nelle impostazioni della stima per stimarle.' }));
    } else {
      body.push(ledger('Addizionali',
        kv(`Addizionale regionale${s.regionalBp !== null ? ` (${formatPercentBp(s.regionalBp)})` : ''}`, sc.regional === null ? 'non impostata' : formatEuro(sc.regional), 'tax-regional'),
        kv(`Addizionale comunale${s.municipalBp !== null ? ` (${formatPercentBp(s.municipalBp)})` : ''}`, sc.municipal === null ? 'non impostata' : formatEuro(sc.municipal), 'tax-municipal'),
        kv('Addizionali totali', formatEuro(sc.total), 'tax-surcharge-total', '', 'kv--total'),
        kv(`Rata indicativa ${year + 1}`, `11 × ${formatEuro(sc.monthly)}`, 'tax-surcharge-monthly'),
        el('p', { class: 'ledger__note', text: `Le addizionali del ${year} si pagano l'anno dopo, trattenute in 11 rate da gennaio a novembre.` })));
    }
  }
  // Avviso "è una stima" sempre visibile, in un riquadro con l'icona informazioni.
  body.push(el('div', { class: 'note note--info' }, icon('info'), el('div', {}, disclaimer,
    el('p', { text: 'Non considera: la somma esente del cuneo fiscale fino a 20.000 €, il trattamento integrativo, le detrazioni per familiari a carico, oneri e spese detraibili (es. mediche), altri redditi, le imposte sostitutive (es. 15% su notturni e turni, 5% sugli aumenti contrattuali) che non sono nell\'imponibile I01.' }))),
    el('div', { class: 'btn-row' }, settingsBtn));
  root.append(card({ title: `Stima delle tasse ${year}`, cls: 'card--estimate', tint: 'indigo', icon: 'gauge', link: el('span', { class: 'tag tag--tint', text: 'Stima' }) }, ...body));
}

function openTaxSettings(ctx, year) {
  const s = ctx.tax.get();
  const py = ctx.tax.year(year);
  const pct = (bp) => (bp === null || bp === undefined ? '' : formatPercentBp(bp).replace('%', ''));
  const d = {
    hire: s.hireDate || '', regional: pct(s.regionalBp), municipal: pct(s.municipalBp),
    projTaxable: py.projTaxable === null ? '' : formatEuroPlain(py.projTaxable), projIrpef: py.projIrpef === null ? '' : formatEuroPlain(py.projIrpef),
  };
  const readPct = (text, fieldName) => {
    if (!text.trim()) return null;
    const v = parsePercentInput(text);
    if (v === null) throw new ValidationError('Percentuale non valida (es. 1,73, al massimo 10)', fieldName);
    return v;
  };
  const readEuro = (text, fieldName) => {
    if (!text.trim()) return null;
    const v = parseEuroInput(text);
    if (v === null) throw new ValidationError('Importo non valido (es. 3.000,00)', fieldName);
    return v;
  };
  return sheet({
    title: 'Impostazioni della stima',
    onSave: () => {
      if (d.hire && !isValidISO(d.hire)) throw new ValidationError('Data non valida', 'hire');
      const patch = { hireDate: d.hire || null, regionalBp: readPct(d.regional, 'regional'), municipalBp: readPct(d.municipal, 'municipal') };
      const yearPatch = { projTaxable: readEuro(d.projTaxable, 'projTaxable'), projIrpef: readEuro(d.projIrpef, 'projIrpef') };
      if (!ctx.tax.set(patch) || !ctx.tax.setYear(year, yearPatch)) throw new StorageError();
      ctx.rerender();
      return true;
    },
    content: (sh) => sh.body.append(
      el('div', { class: 'form-group' },
        field({ label: 'Data di inizio rapporto', field: 'hire', id: 'tx-hire', hint: 'Vuota = 1° gennaio. Le detrazioni si rapportano ai giorni lavorati nell\'anno.',
          input: input({ id: 'tx-hire', type: 'date', value: d.hire, onInput: (v) => { d.hire = v; } }) })),
      el('div', { class: 'form-group' },
        field({ label: 'Addizionale regionale (%)', field: 'regional', id: 'tx-regional', input: input({ id: 'tx-regional', value: d.regional, inputmode: 'decimal', placeholder: 'es. 1,73', onInput: (v) => { d.regional = v; } }) }),
        field({ label: 'Addizionale comunale (%)', field: 'municipal', id: 'tx-municipal', hint: 'Le percentuali del tuo Comune e della tua Regione (sono nella CU o sui loro siti). Vuote = non stimate.',
          input: input({ id: 'tx-municipal', value: d.municipal, inputmode: 'decimal', placeholder: 'es. 0,80', onInput: (v) => { d.municipal = v; } }) })),
      el('p', { class: 'field__label', text: `Mesi mancanti del ${year}` }),
      el('div', { class: 'form-group' },
        field({ label: 'Imponibile per ogni mese mancante (€)', field: 'projTaxable', id: 'tx-proj-taxable',
          input: input({ id: 'tx-proj-taxable', value: d.projTaxable, inputmode: 'decimal', placeholder: 'Media dei mesi registrati', onInput: (v) => { d.projTaxable = v; } }) }),
        field({ label: 'IRPEF per ogni mese mancante (€)', field: 'projIrpef', id: 'tx-proj-irpef', hint: 'Vuote = media dei mesi registrati. Utile se un mese ha un bonus una tantum che falsa la media.',
          input: input({ id: 'tx-proj-irpef', value: d.projIrpef, inputmode: 'decimal', placeholder: 'Media dei mesi registrati', onInput: (v) => { d.projIrpef = v; } }) })),
      el('p', { class: 'section-footer', text: 'Queste impostazioni restano solo su questo dispositivo: non vanno nella sincronizzazione né nel backup.' })),
  });
}

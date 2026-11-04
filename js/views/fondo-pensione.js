// Strumento "Se aumento il fondo pensione": contributo in più, risparmio IRPEF e addizionali,
// calo del netto, spazio deducibile residuo. Stima; gli input non si salvano (bozza nel modulo).

import { el, card, field, input, stepper, clear } from '../ui.js';
import { formatEuro, formatEuroPlain, parseEuroInput, parsePercentInput, formatPercentBp } from '../money.js';
import { ValidationError } from '../errors.js';
import { estimateYear, tableFor } from '../tax.js';
import { simulatePension } from '../pension.js';
import * as C from '../calc.js';

let draft = null;

const kv = (label, value, id, cls = '') => el('div', { class: 'kv' }, el('span', { text: label }), el('span', { id, class: cls, text: value }));

// v4: rotta #statistiche/fondo-pensione (prima in Impostazioni → Strumenti, che ora rimanda qui).
export function render(root, ctx) {
  ctx.header({ title: 'Se aumento il fondo pensione', back: { href: '#statistiche/stipendio', label: 'Stipendio' } });
  const year = Number(ctx.today().slice(0, 4));
  const s = ctx.tax.get();
  if (!draft) {
    // Imponibile annuo precompilato dalla stima delle tasse dell'anno, se c'è.
    const py = ctx.tax.year(year);
    const e = estimateYear({ year, months: C.salaryYear(ctx.store.getState(), year).months, hireDate: s.hireDate, projTaxable: py.projTaxable, projIrpef: py.projIrpef });
    const fromEstimate = e.available && !e.empty;
    draft = { base: '', current: '', next: '', months: 14, employee: '1,00', employer: '1,00', taxable: fromEstimate ? formatEuroPlain(e.annualTaxable) : '', fromEstimate };
  }
  const d = draft;
  const results = el('div', { id: 'pf-results' });
  const update = () => { clear(results); results.append(...compute(ctx, d, year)); };
  const text = (id, key, label, opts = {}) => field({ label, field: key, id, hint: opts.hint,
    input: input({ id, value: d[key], inputmode: 'decimal', placeholder: opts.placeholder || '0,00', onInput: (v) => { d[key] = v; if (key === 'taxable') d.fromEstimate = false; update(); } }) });

  root.append(el('div', { class: 'form-group' },
    text('pf-base', 'base', 'Retribuzione base del mese (€)', { hint: 'Quella su cui si calcola il contributo, es. l\'imponibile TFR della busta paga.' }),
    text('pf-current', 'current', 'Contributo volontario attuale (%)', { placeholder: 'es. 2' }),
    text('pf-new', 'next', 'Nuovo contributo volontario (%)', { placeholder: 'es. 4' }),
    el('div', { class: 'field field--inline', dataset: { field: 'months' } },
      el('span', { class: 'field__label', text: `Mensilità: ${d.months}` }),
      stepper({ value: d.months, min: 12, max: 16, label: 'Mensilità', onChange: (v) => { d.months = v; ctx.rerender(); } })),
    text('pf-employee', 'employee', 'Contributo base dipendente (%)'),
    text('pf-employer', 'employer', 'Contributo azienda (%)', { hint: 'Contano per il limite deducibile. Il TFR versato al fondo non conta.' }),
    text('pf-taxable', 'taxable', 'Imponibile annuo stimato (€)', { hint: d.fromEstimate ? 'Dalla stima delle tasse di Stipendio e tasse: puoi cambiarlo.' : 'Il reddito imponibile dell\'anno (es. dalla stima delle tasse o dalla CU).' })));
  root.append(results);
  update();
  root.append(el('p', { class: 'section-footer', text: 'Stima con le regole IRPEF 2026. I soldi versati al fondo restano vincolati fino alla pensione (salvo le anticipazioni previste dal fondo). In uscita sono tassati al 15%, che scende fino al 9% con gli anni di adesione.' }));
}

function compute(ctx, d, year) {
  const s = ctx.tax.get();
  const table = tableFor(year) || tableFor(2026);
  const base = parseEuroInput(d.base);
  const currentBp = parsePercentInput(d.current);
  const newBp = parsePercentInput(d.next);
  const employeeBp = parsePercentInput(d.employee);
  const employerBp = parsePercentInput(d.employer);
  const taxable = parseEuroInput(d.taxable);
  if (!base || currentBp === null || newBp === null || employeeBp === null || employerBp === null || taxable === null) {
    return [card({ title: 'Risultato' }, el('p', { id: 'pf-incomplete', text: 'Compila retribuzione base, percentuali (es. 2 e 4, al massimo 10%) e imponibile annuo per vedere il risultato.' }))];
  }
  let r;
  try {
    r = simulatePension({ base, currentBp, newBp, months: d.months, annualTaxable: taxable, employeeBaseBp: employeeBp, employerBp, regionalBp: s.regionalBp, municipalBp: s.municipalBp }, table);
  } catch (e) {
    if (e instanceof ValidationError) return [card({ title: 'Risultato' }, el('p', { class: 'is-danger', id: 'pf-error', text: e.message }))];
    throw e;
  }
  return [card({ title: `Dal ${formatPercentBp(currentBp)} al ${formatPercentBp(newBp)}`, tint: 'indigo', icon: 'coin' },
    el('p', { class: 'hero__label', text: 'Il netto in busta scende di circa' }),
    el('p', { class: 'hero__value', id: 'pf-net-drop', text: formatEuro(r.netDropPerMonth) }),
    el('p', { class: 'hero__sub', text: `per mensilità (${d.months} l'anno), perché parte del contributo in più torna come IRPEF in meno.` }),
    kv('Contributo in più per mensilità', formatEuro(r.extraPerMonth), 'pf-extra-month'),
    kv('Contributo in più all\'anno', formatEuro(r.extraYear), 'pf-extra-year'),
    kv('Risparmio IRPEF stimato', formatEuro(r.irpefSaving), 'pf-irpef-saving', 'is-income'),
    r.surchargeSaving === null
      ? el('p', { class: 'hero__sub', id: 'pf-surcharge-missing', text: 'Risparmio sulle addizionali: inserisci le percentuali in Stipendio e tasse → Impostazioni della stima.' })
      : kv('Risparmio addizionali (l\'anno dopo)', formatEuro(r.surchargeSaving), 'pf-surcharge-saving', 'is-income'),
    kv('Deducibile all\'anno (dipendente + azienda)', formatEuro(r.newDeductible), 'pf-deductible'),
    kv(`Spazio deducibile residuo (limite ${formatEuro(r.limit)})`, formatEuro(r.residual), 'pf-residual', r.overLimit ? 'is-danger' : ''),
    r.overLimit ? el('p', { class: 'hero__sub is-danger', id: 'pf-over', text: `Superi il limite di ${formatEuro(r.limit)} deducibili all'anno: la parte oltre il limite non fa risparmiare tasse.` }) : null)];
}

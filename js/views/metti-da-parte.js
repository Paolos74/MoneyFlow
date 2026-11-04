// Foglio "Metti da parte": dopo il salvataggio di uno stipendio propone le quote mensili degli obiettivi attivi.
// Niente si aggiunge senza Conferma; gli accantonamenti restano virtuali (non spostano soldi tra i conti).

import { el, sheet, field, input, toggle, toast, preserveFocus, clear, icon, progress } from '../ui.js';
import { formatEuro, formatEuroPlain, parseEuroInput } from '../money.js';
import { ValidationError } from '../errors.js';
import * as C from '../calc.js';

export function openSetAsideSheet(ctx, { date }) {
  const { store } = ctx;
  const goals = C.activeGoals(store.getState());
  if (!goals.length) return null;
  // Obiettivi con quota: spuntati con la quota; senza quota (es. creati in v1): non spuntati e campo vuoto.
  const d = new Map(goals.map((g) => [g.id, { on: !!g.monthly, text: g.monthly ? formatEuroPlain(g.monthly) : '' }]));
  let body;
  const draw = () => preserveFocus(() => { clear(body); body.append(...build()); });

  function build() {
    const state = store.getState();
    const rows = goals.map((g) => {
      const cur = state.goals.find((x) => x.id === g.id) || g;
      const r = d.get(g.id);
      // Ogni obiettivo: pallino del suo colore, nome, interruttore e la barra di avanzamento.
      return el('div', { class: 'form-group setaside', attrs: { 'data-setaside': g.id }, vars: { '--c': g.color } },
        el('div', { class: 'field field--inline' },
          el('label', { class: 'field__label setaside__name', attrs: { for: `sa-on-${g.id}` } }, el('span', { class: 'chip__dot' }), el('span', { text: g.name })),
          toggle({ id: `sa-on-${g.id}`, checked: r.on, label: `Metti da parte per ${g.name}`, onChange: (v) => { r.on = v; draw(); if (v) document.getElementById(`sa-${g.id}`)?.focus(); } })),
        r.on ? field({ label: 'Importo (€)', field: `alloc-${g.id}`, id: `sa-${g.id}`,
          hint: `Mancano ${formatEuro(Math.max(0, cur.target - cur.saved))}${g.monthly ? ` · quota mensile ${formatEuro(g.monthly)}` : ''}`,
          input: input({ id: `sa-${g.id}`, value: r.text, inputmode: 'decimal', placeholder: '0,00', onInput: (v) => { r.text = v; } }) })
          : el('div', { class: 'field' }, el('p', { class: 'field__hint', text: `Mancano ${formatEuro(Math.max(0, cur.target - cur.saved))}` })),
        el('div', { class: 'setaside__bar' }, progress(cur.saved / cur.target, { color: g.color })));
    });
    return [
      el('div', { class: 'sheet-intro' }, el('span', { class: 'sheet-intro__icon sheet-intro__icon--pink' }, icon('target')),
        el('p', { text: 'Hai registrato lo stipendio: vuoi mettere da parte le quote dei tuoi obiettivi? I soldi restano sul conto, l\'obiettivo tiene il conto.' })),
      ...rows,
    ];
  }

  return sheet({
    title: 'Metti da parte',
    saveLabel: 'Conferma',
    cancelLabel: 'Salta',
    onSave: () => {
      const items = [];
      for (const g of goals) {
        const r = d.get(g.id);
        if (!r.on) continue;
        const v = parseEuroInput(r.text);
        if (!v) throw new ValidationError(r.text.trim() ? 'Importo non valido (es. 50,00)' : 'Inserisci l\'importo o togli la spunta', `alloc-${g.id}`);
        items.push({ id: g.id, amount: v });
      }
      if (!items.length) return true; // niente spuntato: si chiude senza fare nulla
      const out = store.allocateGoals(items, date);
      const total = items.reduce((t, i) => t + i.amount, 0);
      // Un solo toast alla volta: gli obiettivi completati si aggiungono al messaggio.
      const done = out.filter((g) => g.saved >= g.target).map((g) => `«${g.name}» completato ✓`);
      toast([`Messi da parte ${formatEuro(total)}`, ...done].join(' · '), { duration: done.length ? 5000 : undefined });
      return true;
    },
    content: (s) => { body = s.body; body.append(...build()); },
  });
}

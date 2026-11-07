// Budget (v4): segmentato "Budget | Obiettivi". Budget ispirato alla divisione Rimanente / Piano / Andamento:
// quanto ti resta nel periodo e quanto puoi spendere oggi, budget per categoria, prime categorie di spesa.
// Obiettivi: gli obiettivi di risparmio (prima erano nella scheda Conti).
// v5: "Quanto ti resta" sul budget complessivo con colore progressivo, "Hai sforato di" e consiglio discreto.
// v6: dal budget si tolgono anche i programmati da pagare (riga "Da pagare", v8: stesso nome della Home); le barre del Piano
// contano speso + programmati della categoria ("di cui X programmati", risposta 1B).
// v7 (decisione v7 §2): i budget si creano, cambiano e tolgono solo qui, nel Piano: tocco sulla riga → foglio
// "Budget <Categoria>" (con "Vedi le spese del periodo"), "Aggiungi budget" per le categorie senza budget.
// #budget?budget=<id> apre il foglio di quella categoria, #budget?budget=nuovo "Aggiungi budget".

import { el, card, section, list, row, segmented, emptyState, button, progress, icon, iconBox, svgNode, sheet, field, input, chips, toast } from '../ui.js';
import { ring } from '../charts.js';
import { formatEuro, formatPercent, parseEuroInput, formatEuroPlain } from '../money.js';
import { ValidationError } from '../errors.js';
import { formatDateIt, MONTHS, monthLabel, monthOf, parseISO } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining, progressStop } from '../period.js';
import { openGoalForm } from './conti.js';
import { titleActions } from './parts.js';

const dayMonth = (iso) => { const p = parseISO(iso); return `${p.d} ${MONTHS[p.m - 1]}`; };

// Testo del periodo: "dal 27 marzo, ultimo stipendio" oppure il mese.
export function periodText(p) {
  if (p.mode === 'salary') return `dal ${dayMonth(p.from)}, ultimo stipendio`;
  return monthLabel(monthOf(p.from)).toLocaleLowerCase('it');
}

// Card protagonista "Quanto ti resta" (Home) e "Rimanente" (Budget), stesso aspetto (design v4, ispirato a Buddy):
// fondo menta, numero grande, anello, riquadro "Puoi spendere oggi".
// v5, modo budget: anello = parte del budget che resta; numero e anello col colore progressivo (design v5 §3);
// sforato (rimanente < 0) → "Hai sforato di X €" e anello pieno rosso. Modo senza budget: come la v4.
// Testo sotto "Puoi spendere oggi": esaurito / in rosso, a zero, oppure i giorni rimasti.
export function todaySub(r) {
  if (r.left < 0) return r.mode === 'budget' ? 'Budget del periodo esaurito' : 'Il periodo è già in rosso';
  if (r.left === 0) return 'Niente da spendere per ora';
  return r.daysLeft === 1 ? 'Ultimo giorno del periodo' : `Per ${r.daysLeft} giorni, oggi compreso`;
}

export function heroRing(r) {
  const over = r.left < 0;
  if (r.mode === 'budget') {
    // Parte del budget che resta: N% = rimanente × 100 ÷ budget, tra 0 e 100.
    const pct = over ? 0 : Math.max(0, Math.min(100, Math.round((r.left * 100) / r.budget)));
    const spent = `${r.planned > 0 ? 'Speso e programmato' : 'Speso'} il ${formatPercent(r.spentTenths)} del budget`;
    return el('div', { class: 'remaining__ring' },
      svgNode(ring(over ? 1 : Math.max(0, r.left) / r.budget, { center: `${pct}%`, sub: 'resta', label: over ? `${spent}, sforato di ${formatEuro(-r.left)}` : spent })));
  }
  // Anello v4: rimanente negativo = anello pieno rosso con "0%" (non resta nulla); positivo limitato a 100%.
  const pct = r.income > 0 ? (over ? 0 : Math.min(100, Math.round((r.left * 100) / r.income))) : null;
  return pct === null ? null : el('div', { class: 'remaining__ring' + (over ? ' is-over' : '') },
    svgNode(ring(over ? 1 : r.left / r.income, { center: `${pct}%`, sub: 'resta', label: over ? `Sforato di ${formatEuro(-r.left)}` : `Resta il ${pct}% delle entrate del periodo` })));
}

export function remainingHero({ title, link, prefix, label, r, sub, todaySub: todayText = todaySub(r) }, ...rest) {
  const budgetMode = r.mode === 'budget';
  const over = r.left < 0;
  let value;
  if (budgetMode && over) {
    // Il textContent di #<prefix>-over è la frase intera: "Hai sforato di 60,00 €".
    value = el('p', { class: 'remaining__over', id: `${prefix}-over` },
      el('span', { class: 'remaining__over-label', text: 'Hai sforato di ' }),
      el('span', { class: 'hero__value', id: `${prefix}-left`, text: formatEuro(-r.left) }));
  } else {
    const leftText = formatEuro(r.left);
    const tone = budgetMode ? '' : r.left >= 0 ? 'is-income' : 'is-danger';
    value = el('p', { class: `hero__value ${tone}${leftText.length > 9 ? ' is-long' : ''}`, id: `${prefix}-left`, text: leftText });
  }
  const stop = budgetMode ? progressStop(r.spentTenths) : null;
  return card({ title, tint: 'emerald', icon: 'gauge', cls: `card--remaining ${prefix}-left`, link },
    el('div', {
      class: 'remaining__main' + (stop ? ' prog' : ''),
      vars: stop ? { '--prog-a': `var(--prog-${stop.from})`, '--prog-b': `var(--prog-${stop.to})`, '--prog-t': `${stop.mix}%` } : null,
    },
    el('div', { class: 'remaining__text' },
      el('p', { class: 'hero__label', id: `${prefix}-period`, text: label }),
      value,
      sub ? el('p', { class: 'hero__sub', text: sub }) : null),
    heroRing(r)),
    el('div', { class: 'today-box' },
      el('span', { class: 'today-box__icon' }, icon('sun', 18)),
      el('div', { class: 'today-box__text' },
        el('p', { class: 'today-box__label', text: 'Puoi spendere oggi' }),
        el('p', { class: 'today-box__value', id: `${prefix}-today`, text: formatEuro(r.perDay) }),
        el('p', { class: 'today-box__sub', text: todayText }))),
    ...rest);
}

// Riga del consiglio: glifo grigio, testo grigio, azione verde con chevron. Mai rosso, mai un avviso.
function adviceRow({ href, id, glyph = 'info', text, action }) {
  return el('a', { class: 'advice__row', href, id, attrs: { 'aria-label': `${text}. ${action}` } },
    el('span', { class: 'advice__icon' }, icon(glyph, 16)),
    el('span', { class: 'advice__text', text }),
    el('span', { class: 'advice__action' }, action, icon('chevron', 12)));
}

const moveLink = (p, categoryId) => `#movimenti?periodo=custom&da=${p.from}&a=${p.to}&categoria=${encodeURIComponent(categoryId)}`;

// Consiglio discreto (decisione v5 §1, design §4.4): al massimo due righe, solo nel modo budget.
// Prima riga: la categoria senza budget con più uscite ("e un'altra categoria" / "e altre N categorie"), azione
// "Crea un budget"; se la categoria è eliminata o sconosciuta "Scegli la categoria" verso Movimenti filtrati.
// v8 (modifica 19): conta anche i programmati da pagare del periodo in categorie senza budget.
// Seconda riga: uscite in "Altro" di uscita, "Scegli la categoria" verso Movimenti filtrati su Altro.
// Dalla v8 i consigli stanno solo qui (card Rimanente), non più in Home.
export function budgetAdviceBlock(state, p, prefix, today) {
  const rows = budgetAdviceRows(state, p, prefix, today);
  return rows.length ? el('div', { class: 'advice' }, rows) : null;
}

// "16,80 € in Salute", "16,80 € spesi + 600,00 € programmati in Casa", "600,00 € di Affitto programmato in Casa",
// "650,00 € programmati in Casa".
function unbudgetedText(state, x) {
  const cat = C.categoryLabel(state, x.categoryId);
  if (!x.planned) return `${formatEuro(x.value)} in ${cat}`;
  if (x.value) return `${formatEuro(x.value)} spesi + ${formatEuro(x.planned)} programmati in ${cat}`;
  if (x.plannedCount === 1 && x.plannedLabel) return `${formatEuro(x.planned)} di ${x.plannedLabel} programmato in ${cat}`;
  return `${formatEuro(x.planned)} programmati in ${cat}`;
}

function budgetAdviceRows(state, p, prefix, today) {
  const a = C.budgetAdvice(state, p, today);
  const rows = [];
  const first = a.unbudgeted[0];
  if (first) {
    const n = a.unbudgeted.length - 1;
    const more = n === 0 ? '' : n === 1 ? ' e un\'altra categoria' : ` e altre ${n} categorie`;
    const cat = state.categories.find((c) => c.id === first.categoryId);
    const live = cat && !cat.deleted;
    rows.push(adviceRow({
      id: `${prefix}-advice`, text: `${unbudgetedText(state, first)}${more}, senza budget`,
      action: live ? 'Crea un budget' : 'Scegli la categoria', href: live ? `#budget?budget=${encodeURIComponent(first.categoryId)}` : moveLink(p, first.categoryId),
    }));
  }
  if (a.other > 0) {
    rows.push(adviceRow({ id: `${prefix}-advice-other`, text: `${formatEuro(a.other)} in ${C.categoryLabel(state, C.OTHER_EXPENSE_ID)}`, action: 'Scegli la categoria', href: moveLink(p, C.OTHER_EXPENSE_ID) }));
  }
  return rows;
}

export function render(root, ctx) {
  const state = ctx.store.getState();
  const seg = ctx.path[1] === 'obiettivi' ? 'obiettivi' : 'budget';
  // v7: in alto a destra c'è solo ⚙︎; "Nuovo obiettivo" sta sotto il segmentato (con almeno un obiettivo).
  ctx.header({ title: seg === 'budget' ? 'Budget' : 'Obiettivi' });
  root.append(segmented([{ value: 'budget', label: 'Budget', id: 'seg-budget' }, { value: 'obiettivi', label: 'Obiettivi', id: 'seg-obiettivi' }], seg,
    (v) => ctx.go(v === 'budget' ? 'budget' : 'budget/obiettivi'), { label: 'Sezione' }));
  if (seg === 'obiettivi' && state.goals.some((g) => !g.deleted)) {
    root.append(titleActions(button('Nuovo obiettivo', () => openGoalForm(ctx), { small: true, icon: 'plus', id: 'budget-new' })));
  }
  if (seg === 'budget') renderBudget(root, ctx, state); else renderGoals(root, ctx, state);
}

function renderBudget(root, ctx, state) {
  const today = ctx.today();
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  const r = remaining(state, p, today);

  // Rimanente. v6: con almeno un budget, budget complessivo meno tutte le uscite e i programmati da pagare del periodo.
  const kv = (label, value, id, cls = '', rowCls = '') => el('div', { class: 'kv ' + rowCls }, el('span', { text: label }), el('span', { class: cls, id, text: value }));
  let table;
  if (r.mode === 'budget') {
    const a = C.budgetAdvice(state, p);
    const unbudgeted = a.unbudgeted.reduce((t, x) => t + x.value, 0) + (a.otherBudgeted ? 0 : a.other);
    table = el('div', { class: 'remaining__kv' },
      kv('Budget complessivo', formatEuro(r.budget), 'budget-total'),
      kv('Uscite del periodo', formatEuro(r.expense), 'budget-expense'),
      kv('Da pagare', formatEuro(r.planned), 'budget-planned'),
      unbudgeted > 0 ? kv('di cui senza budget', formatEuro(unbudgeted), 'budget-unbudgeted', '', 'kv--minus') : null);
  } else {
    table = el('div', { class: 'remaining__kv' },
      kv('Entrate', formatEuro(r.income), 'budget-income', 'is-income'),
      kv('Uscite', formatEuro(r.expense), 'budget-expense'),
      kv('Da pagare', formatEuro(r.planned), 'budget-planned'));
  }
  const until = `${formatDateIt(p.to)}${p.estimatedEnd ? ' (prossimo stipendio stimato)' : ''}`;
  root.append(remainingHero({
    title: 'Rimanente', prefix: 'budget', r, label: `Periodo: ${periodText(p)}`,
    link: el('a', { class: 'card__link', href: '#impostazioni/periodo', id: 'budget-period-link', text: 'Cambia periodo' }),
    sub: r.mode === 'budget' ? `Budget complessivo meno le uscite e i pagamenti programmati del periodo, fino al ${until}.` : `Ti restano ${formatEuro(r.left)} fino al ${until}.`,
    todaySub: todaySub(r),
  },
  table,
  p.mode === 'calendar-fallback' ? el('p', { class: 'hero__sub', text: 'Nessuno stipendio registrato: si usa il mese di calendario.' }) : null,
  r.mode === 'budget' ? budgetAdviceBlock(state, p, 'budget', today) : null));

  // Piano: budget per categoria nel periodo. v7: il tocco apre il foglio del budget; in fondo "Aggiungi budget".
  const budgets = C.budgetStatus(state, p, today);
  const without = C.sortedCategories(state, 'uscita').filter((c) => !c.budget);
  const addRow = without.length
    ? el('button', { class: 'plan__add', type: 'button', id: 'budget-add', on: { click: () => openAddBudgetSheet(ctx, p) } }, icon('plus', 18), el('span', { text: 'Aggiungi budget' }))
    : null;
  // v8 (modifiche 1 e 2): una riga a rischio dice "Superato" (già speso più del budget, rosso) oppure "Andrà oltre"
  // (lo supererà con i programmati, ambra), sempre con i numeri; #budget?evidenzia=<id> la porta al centro, evidenziata.
  const want = ctx.query.budget;
  if (ctx.query.evidenzia) ctx.params.highlight = ctx.query.evidenzia;
  const planSection = section({ title: 'Piano', cls: 'section--t-amber plan-section', id: 'budget-plan', footer: budgets.length ? 'Tocca una categoria per cambiare o togliere il budget. Vale per il periodo di budget; le quote escluse non contano.' : null },
    budgets.length
      ? card({ cls: 'plan' }, budgets.map((b) => {
        const risk = riskNote(b);
        return el('button', { class: 'meter meter--cat' + (risk ? (risk.past ? ' is-over' : ' is-risk') : '') + (ctx.params.highlight === b.category.id ? ' is-highlight' : ''), type: 'button',
          attrs: { 'data-budget': b.category.id, 'aria-label': `${b.category.name}: budget ${formatEuro(b.budget)}, ${risk ? risk.text : `restano ${formatEuro(b.left)}`}. Cambia il budget` },
          on: { click: () => openBudgetSheet(ctx, b.category, p) } },
        iconBox(C.categoryIcon(state, b.category.id), b.category.color),
        el('div', { class: 'meter__body' },
          el('div', { class: 'meter__top' }, el('span', { class: 'meter__name', text: b.category.name }),
            el('span', { text: `${formatEuro(b.used)} / ${formatEuro(b.budget)}` })),
          progress(b.used / b.budget, { color: b.category.color, over: !!risk?.past }),
          el('div', { class: 'meter__note' + (risk ? (risk.past ? ' is-over' : ' is-risk') : ''), text: risk ? risk.text : `Restano ${formatEuro(b.left)}` + (b.planned > 0 ? ` · di cui ${formatEuro(b.planned)} programmati` : '') })),
        el('span', { class: 'row__chev' }, icon('chevron')));
      }), addRow)
      : list(row({ icon: 'gauge', color: 'var(--amber-fill)', title: 'Imposta i budget', subtitle: 'Quanto ti resta userà la somma dei budget', onClick: () => openAddBudgetSheet(ctx, p), id: 'budget-set' })));
  root.append(planSection);

  // Dalla Home (v8): ?evidenzia=<id> scorre fino alla riga, ?sezione=piano fino al Piano. Una volta, poi la query
  // si toglie; lo scorrimento aspetta il riposizionamento in cima fatto dal router al cambio di rotta.
  const ev = ctx.query.evidenzia;
  if ((ev || ctx.query.sezione === 'piano') && !want) {
    // Il bersaglio si cerca nel documento al momento dello scorrimento: un ridisegno nel frattempo (es. interessi
    // aggiornati all'avvio) sostituisce i nodi.
    const sel = ev ? `[data-budget="${CSS.escape(ev)}"]` : '#budget-plan';
    ctx.setQuery({});
    requestAnimationFrame(() => document.querySelector(sel)?.scrollIntoView({ block: ev ? 'center' : 'start' }));
  }

  // Collegamenti vecchi e consigli (#budget?budget=…): il foglio si apre una volta, poi la query si toglie.
  if (want && !ctx.params.opened) {
    ctx.params.opened = true;
    ctx.setQuery({});
    const cat = C.sortedCategories(state, 'uscita').find((c) => c.id === want);
    if (cat) openBudgetSheet(ctx, cat, p);
    else if (want === 'nuovo' && without.length) openAddBudgetSheet(ctx, p);
  }

  // Andamento: prime 3 categorie di spesa del periodo
  const cats = C.byCategory(state, p.from, p.to, 'uscita').slice(0, 3);
  root.append(section({ title: 'Andamento', cls: 'section--t-teal', action: el('a', { href: '#statistiche', id: 'budget-stats', text: 'Statistiche' }) },
    cats.length
      ? list(...cats.map((c) => row({ icon: C.categoryIcon(state, c.categoryId), color: c.color, title: c.label, subtitle: `${formatPercent(c.pct)} delle uscite`, value: formatEuro(c.value),
        href: `#movimenti?periodo=custom&da=${p.from}&a=${p.to}&categoria=${encodeURIComponent(c.categoryId)}`, attrs: { 'data-trend': c.categoryId } })))
      : el('p', { class: 'section-footer', text: 'Nessuna uscita nel periodo.' })));
}

// Budget a rischio (v8, modifica 1; il calcolo resta quello della v6, used = speso + programmati > budget):
// "Superato di 12,00 € · 52,00 € spesi su 40,00 €" se lo speso supera già il budget, altrimenti
// "Andrà oltre di 11,99 € · 0,00 € spesi + 51,99 € programmati su 40,00 €". null se la categoria non è a rischio.
export function riskNote(b) {
  if (!b.over) return null;
  const past = b.spent > b.budget;
  const head = past ? `Superato di ${formatEuro(b.spent - b.budget)}` : `Andrà oltre di ${formatEuro(b.used - b.budget)}`;
  const nums = b.planned > 0 ? `${formatEuro(b.spent)} spesi + ${formatEuro(b.planned)} programmati su ${formatEuro(b.budget)}` : `${formatEuro(b.spent)} spesi su ${formatEuro(b.budget)}`;
  return { past, text: `${head} · ${nums}` };
}

// Obiettivi di risparmio: attivi, poi "Completati" (cifra raggiunta). Stessi id della v3 (goal-new, data-goal).
function renderGoals(root, ctx, state) {
  const today = ctx.today();
  const goals = state.goals.filter((g) => !g.deleted);
  if (!goals.length) {
    root.append(emptyState({ icon: 'target', title: 'Nessun obiettivo', text: 'Fissa un importo e una scadenza: MoneyFlow ti dice quanto mettere da parte ogni mese.',
      action: button('Nuovo obiettivo', () => openGoalForm(ctx), { kind: 'primary', id: 'goal-new-empty' }) }));
    return;
  }
  const goalCard = (g) => {
    const pr = C.goalProgress(g, today);
    const note = pr.done ? 'Obiettivo raggiunto'
      : pr.quota ? `${formatEuro(pr.monthSaved)} di ${formatEuro(pr.quota)} questo mese`
        : pr.monthly ? `Metti da parte ${formatEuro(pr.monthly)} al mese per ${pr.monthsLeft} ${pr.monthsLeft === 1 ? 'mese' : 'mesi'}` : `Mancano ${formatEuro(pr.remaining)}`;
    return el('a', { class: 'card goal-card', href: `#obiettivi/${g.id}`, attrs: { 'data-goal': g.id } },
      el('div', { class: 'card__head' }, iconBox(pr.done ? 'check' : 'target', g.color),
        el('div', { class: 'goal__heading' }, el('h2', { class: 'goal__title', text: g.name }),
          el('span', { class: 'tag' + (pr.done ? ' tag--done' : ' tag--goal'), text: pr.done ? 'Completato ✓' : pr.expired ? 'Scaduto' : g.deadline ? `entro ${formatDateIt(g.deadline)}` : 'senza scadenza' }))),
      el('div', { class: 'meter__top' }, el('span', { class: 'num', text: formatEuro(g.saved) }), el('span', { text: `di ${formatEuro(g.target)}` })),
      progress(g.saved / g.target, { color: g.color }),
      el('div', { class: 'meter__note', text: note }));
  };
  const active = C.activeGoals(state);
  const done = C.completedGoals(state);
  root.append(...active.map(goalCard));
  if (done.length) root.append(section({ title: 'Completati', cls: 'goals-done' }, ...done.map(goalCard)));
  root.append(el('div', { class: 'btn-row' }, button('Nuovo obiettivo', () => openGoalForm(ctx), { icon: 'plus', id: 'goal-new' })));
}

// Foglio "Budget <Categoria>" (prima in Impostazioni → Budget): importo per periodo, vuoto = togli;
// "Vedi le spese del periodo" apre Movimenti filtrati per categoria e periodo (risposta 2).
export function openBudgetSheet(ctx, cat, p) {
  let text = cat.budget ? formatEuroPlain(cat.budget) : '';
  return sheet({
    title: `Budget ${cat.name}`,
    onSave: () => {
      const v = text.trim() ? parseEuroInput(text) : null;
      if (text.trim() && !v) throw new ValidationError('Importo non valido (es. 250,00)', 'budget');
      if (v === (cat.budget || null)) return true;
      ctx.store.updateCategory(cat.id, { budget: v });
      toast(v ? 'Budget salvato' : 'Budget tolto');
      return true;
    },
    content: (s) => {
      s.body.append(el('div', { class: 'form-group' }, field({ label: 'Importo per periodo (€)', field: 'budget', id: 'b-amount', hint: cat.budget ? 'Lascia vuoto per togliere il budget.' : 'Vale per ogni periodo di budget.',
        input: input({ id: 'b-amount', value: text, inputmode: 'decimal', placeholder: '0,00', cls: 'input--amount', onInput: (v) => { text = v; } }) })),
      list(row({ icon: 'list', color: 'var(--teal-fill)', title: 'Vedi le spese del periodo', subtitle: periodText(p), id: 'b-movements',
        onClick: () => { s.close(); ctx.go(moveLink(p, cat.id).slice(1)); } })));
    },
  });
}

// Foglio "Aggiungi budget": scelta della categoria di uscita senza budget e importo.
export function openAddBudgetSheet(ctx, p) {
  const d = { categoryId: '', text: '' };
  const cats = () => C.sortedCategories(ctx.store.getState(), 'uscita').filter((c) => !c.budget);
  const box = el('div', { class: 'field' });
  const drawChips = () => {
    box.replaceChildren(chips(cats().map((c) => ({ value: c.id, label: c.name, color: c.color, id: 'b-cat-' + c.id })), d.categoryId,
      (v) => { d.categoryId = v; drawChips(); document.getElementById('b-cat-' + v)?.focus(); }, { wrap: true, label: 'Categoria' }),
    el('p', { class: 'field__error', hidden: true, attrs: { 'aria-live': 'polite' } }));
  };
  drawChips();
  return sheet({
    title: 'Aggiungi budget',
    onSave: () => {
      if (!d.categoryId) throw new ValidationError('Scegli una categoria', 'categoryId');
      const v = parseEuroInput(d.text);
      if (!v) throw new ValidationError(d.text.trim() ? 'Importo non valido (es. 250,00)' : 'Inserisci l\'importo', 'budget');
      ctx.store.updateCategory(d.categoryId, { budget: v });
      toast('Budget salvato');
      return true;
    },
    content: (s) => {
      s.body.append(el('p', { class: 'field__label', text: 'Categoria' }),
        el('div', { class: 'form-group', dataset: { field: 'categoryId' } }, box),
        el('div', { class: 'form-group' }, field({ label: 'Importo per periodo (€)', field: 'budget', id: 'b-amount',
          input: input({ id: 'b-amount', value: d.text, inputmode: 'decimal', placeholder: '0,00', cls: 'input--amount', onInput: (v) => { d.text = v; } }) })),
        el('p', { class: 'section-footer', text: 'Quanto ti resta userà la somma dei budget, meno le uscite e i pagamenti programmati del periodo.' }));
    },
  });
}

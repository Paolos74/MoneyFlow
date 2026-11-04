// Budget (v4): segmentato "Budget | Obiettivi". Budget ispirato alla divisione Rimanente / Piano / Andamento:
// quanto ti resta nel periodo e quanto puoi spendere oggi, budget per categoria, prime categorie di spesa.
// Obiettivi: gli obiettivi di risparmio (prima erano nella scheda Conti).

import { el, card, section, list, row, segmented, emptyState, button, progress, icon, iconBox, svgNode } from '../ui.js';
import { ring } from '../charts.js';
import { formatEuro, formatPercent } from '../money.js';
import { formatDateIt, MONTHS, monthLabel, monthOf, parseISO } from '../dates.js';
import * as C from '../calc.js';
import { budgetPeriod, remaining } from '../period.js';
import { openGoalForm } from './conti.js';

const dayMonth = (iso) => { const p = parseISO(iso); return `${p.d} ${MONTHS[p.m - 1]}`; };

// Testo del periodo: "dal 27 marzo, ultimo stipendio" oppure il mese.
export function periodText(p) {
  if (p.mode === 'salary') return `dal ${dayMonth(p.from)}, ultimo stipendio`;
  return monthLabel(monthOf(p.from)).toLocaleLowerCase('it');
}

// Card protagonista "Quanto ti resta" (Home) e "Rimanente" (Budget), stesso aspetto (design v4, ispirato a Buddy):
// fondo menta, numero grande, anello con la parte delle entrate che resta, riquadro "Puoi spendere oggi".
// Testo sotto "Puoi spendere oggi": in rosso, a zero, oppure i giorni rimasti.
export function todaySub(r) {
  if (r.left < 0) return 'Il periodo è già in rosso';
  if (r.left === 0) return 'Niente da spendere per ora';
  return r.daysLeft === 1 ? 'Ultimo giorno del periodo' : `Per ${r.daysLeft} giorni, oggi compreso`;
}

export function remainingHero({ title, link, prefix, label, r, sub, todaySub: todayText = todaySub(r) }, ...rest) {
  // Anello: rimanente negativo = anello pieno rosso con "0%" (non resta nulla); positivo limitato a 100%.
  const over = r.left < 0;
  const pct = r.income > 0 ? (over ? 0 : Math.min(100, Math.round((r.left * 100) / r.income))) : null;
  const ringNode = pct === null ? null : el('div', { class: 'remaining__ring' + (over ? ' is-over' : '') },
    svgNode(ring(over ? 1 : r.left / r.income, { center: `${pct}%`, sub: 'resta', label: over ? `Sforato di ${formatEuro(-r.left)}` : `Resta il ${pct}% delle entrate del periodo` })));
  const leftText = formatEuro(r.left);
  return card({ title, tint: 'emerald', icon: 'gauge', cls: `card--remaining ${prefix}-left`, link },
    el('div', { class: 'remaining__main' },
      el('div', { class: 'remaining__text' },
        el('p', { class: 'hero__label', id: `${prefix}-period`, text: label }),
        el('p', { class: 'hero__value ' + (r.left >= 0 ? 'is-income' : 'is-danger') + (leftText.length > 9 ? ' is-long' : ''), id: `${prefix}-left`, text: leftText }),
        sub ? el('p', { class: 'hero__sub', text: sub }) : null),
      ringNode),
    el('div', { class: 'today-box' },
      el('span', { class: 'today-box__icon' }, icon('sun', 18)),
      el('div', { class: 'today-box__text' },
        el('p', { class: 'today-box__label', text: 'Puoi spendere oggi' }),
        el('p', { class: 'today-box__value', id: `${prefix}-today`, text: formatEuro(r.perDay) }),
        el('p', { class: 'today-box__sub', text: todayText }))),
    ...rest);
}

export function render(root, ctx) {
  const state = ctx.store.getState();
  const seg = ctx.path[1] === 'obiettivi' ? 'obiettivi' : 'budget';
  const actions = seg === 'obiettivi'
    ? [el('button', { class: 'topbar__btn', type: 'button', text: 'Nuovo', id: 'budget-new', on: { click: () => openGoalForm(ctx) } })]
    : [];
  ctx.header({ title: seg === 'budget' ? 'Budget' : 'Obiettivi', actions });
  root.append(segmented([{ value: 'budget', label: 'Budget', id: 'seg-budget' }, { value: 'obiettivi', label: 'Obiettivi', id: 'seg-obiettivi' }], seg,
    (v) => ctx.go(v === 'budget' ? 'budget' : 'budget/obiettivi'), { label: 'Sezione' }));
  if (seg === 'budget') renderBudget(root, ctx, state); else renderGoals(root, ctx, state);
}

function renderBudget(root, ctx, state) {
  const today = ctx.today();
  const p = budgetPeriod(state, today, ctx.prefs.get().budgetPeriod);
  const r = remaining(state, p, today);

  // Rimanente
  root.append(remainingHero({
    title: 'Rimanente', prefix: 'budget', r, label: `Periodo: ${periodText(p)}`,
    link: el('a', { class: 'card__link', href: '#impostazioni/periodo', id: 'budget-period-link', text: 'Cambia periodo' }),
    sub: `Ti restano ${formatEuro(r.left)} fino al ${formatDateIt(p.to)}${p.estimatedEnd ? ' (prossimo stipendio stimato)' : ''}.`,
    todaySub: todaySub(r),
  },
  el('div', { class: 'remaining__kv' },
    el('div', { class: 'kv' }, el('span', { text: 'Entrate' }), el('span', { class: 'is-income', id: 'budget-income', text: formatEuro(r.income) })),
    el('div', { class: 'kv' }, el('span', { text: 'Uscite' }), el('span', { id: 'budget-expense', text: formatEuro(r.expense) })),
    el('div', { class: 'kv' }, el('span', { text: 'Programmati da pagare' }), el('span', { id: 'budget-planned', text: formatEuro(r.planned) }))),
  p.mode === 'calendar-fallback' ? el('p', { class: 'hero__sub', text: 'Nessuno stipendio registrato: si usa il mese di calendario.' }) : null));

  // Piano: budget per categoria nel periodo
  const budgets = C.budgetStatus(state, p);
  root.append(section({ title: 'Piano', cls: 'section--t-amber', action: el('a', { href: '#impostazioni/budget', id: 'budget-edit', text: 'Modifica' }) },
    budgets.length
      ? card({ cls: 'plan' }, budgets.map((b) => el('a', { class: 'meter meter--cat' + (b.over ? ' is-over' : ''), href: `#movimenti?periodo=custom&da=${p.from}&a=${p.to}&categoria=${encodeURIComponent(b.category.id)}`, attrs: { 'data-budget': b.category.id, 'aria-label': `${b.category.name}: vedi i movimenti del periodo` } },
        iconBox(C.categoryIcon(state, b.category.id), b.category.color),
        el('div', { class: 'meter__body' },
          el('div', { class: 'meter__top' }, el('span', { class: 'meter__name', text: b.category.name }),
            el('span', { text: `${formatEuro(b.spent)} / ${formatEuro(b.budget)}` })),
          progress(b.spent / b.budget, { color: b.category.color, over: b.over }),
          el('div', { class: 'meter__note', text: b.over ? `Superato di ${formatEuro(-b.left)}` : `Restano ${formatEuro(b.left)}` })))))
      : list(row({ icon: 'gauge', color: 'var(--amber-fill)', title: 'Imposta un budget', subtitle: 'Un limite per categoria nel periodo', href: '#impostazioni/budget', id: 'budget-set' }))));

  // Andamento: prime 3 categorie di spesa del periodo
  const cats = C.byCategory(state, p.from, p.to, 'uscita').slice(0, 3);
  root.append(section({ title: 'Andamento', cls: 'section--t-teal', action: el('a', { href: '#statistiche', id: 'budget-stats', text: 'Statistiche' }) },
    cats.length
      ? list(...cats.map((c) => row({ icon: C.categoryIcon(state, c.categoryId), color: c.color, title: c.label, subtitle: `${formatPercent(c.pct)} delle uscite`, value: formatEuro(c.value),
        href: `#movimenti?periodo=custom&da=${p.from}&a=${p.to}&categoria=${encodeURIComponent(c.categoryId)}`, attrs: { 'data-trend': c.categoryId } })))
      : el('p', { class: 'section-footer', text: 'Nessuna uscita nel periodo.' })));
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

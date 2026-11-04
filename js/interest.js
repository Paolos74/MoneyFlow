// Interessi automatici dei conti "Deposito senza vincoli" (v4): calcolo giornaliero in centesimi interi.
//
// Formula (come Revolut: interessi calcolati ogni giorno sul saldo, ritenuta trattenuta prima dell'accredito,
// interessi netti sotto 0,01 € accumulati finché arrivano a 0,01 €):
// - si matura per ogni giorno d dalla data di inizio del deposito fino a IERI compreso (il saldo di oggi non è
//   ancora quello di fine giornata);
// - B_d = saldo di fine giornata = saldo iniziale + movimenti del conto con data ≤ d (esclusi i movimenti
//   automatici "Interessi" e le rettifiche di questo conto) + interessi accreditati nei giorni PRIMA di d
//   + rettifiche "Allinea al saldo reale" con data ≤ d. Se B_d ≤ 0 il giorno non matura;
// - maturato netto del giorno in frazioni di centesimo, con BigInt:
//     n_d = B_d × tasso_d × (10000 − ritenuta)   su   D = 365 × 10000 × 10000
//   (tasso annuo lordo e ritenuta in punti base; base 365 anche negli anni bisestili: "tasso annuo / 365");
//   tasso_d = ultima voce di `rates` con from ≤ d;
// - accumulo: acc += n_d; accredito del giorno c_d = floor(acc / D) centesimi; acc −= c_d × D.
//   L'accredito entra nel saldo dal giorno dopo (capitalizzazione giornaliera); il resto passa ai giorni seguenti,
//   anche nel mese dopo.
// Esempio: 10.000,00 € al 2,50 % con ritenuta 26 %: n = 1.000.000 × 250 × 7.400 / D = 50,6849 cent → 0,50 €.
//
// Rettifica "Allinea al saldo reale" (variazione con align: { balance }) alla data X:
//   importo = balance − (saldo base a X + interessi accreditati fino a X−1 + rettifiche precedenti),
// così il saldo di fine giornata di X è quello scritto dall'utente, anche se cambia un movimento precedente.

import { addDays, monthOf, monthLabel } from './dates.js';
import { movementEffect } from './calc.js';
import { INTEREST_CATEGORY_ID } from './store.js';

const D = 365n * 10000n * 10000n;

export const interestId = (accountId, ym) => `interest-${accountId}-${ym}`;
export const alignId = (accountId, date) => `align-${accountId}-${date}`;

const isOwnInterest = (m, accountId) => m.type === 'entrata' && m.interest && m.interest.accountId === accountId;
const isOwnAlign = (m, accountId) => m.type === 'variazione' && m.align && m.accountId === accountId;

function rateOn(rates, d) {
  let r = 0;
  for (const x of rates) if (x.from <= d) r = x.rateBp; else break;
  return r;
}

// → { byMonth: { 'YYYY-MM': { amount, lastDay } }, alignAmounts: { [id]: centesimi }, aligns: [movimenti] }.
// Le rettifiche si leggono anche se eliminate: con importo 0 il motore le mette in tombstone ma il saldo scritto resta.
export function accrueInterest(state, account, today) {
  const out = { byMonth: {}, alignAmounts: {}, aligns: [] };
  const dep = account && account.kind === 'eur' ? account.deposit : null;
  if (!dep) return out;
  const id = account.id;
  const yesterday = addDays(today, -1);
  const deltas = new Map();
  const aligns = new Map();
  let first = dep.start;
  let last = yesterday;
  for (const m of state.movements) {
    if (m.accountId !== id && m.toAccountId !== id) continue;
    if (isOwnAlign(m, id)) {
      aligns.set(m.date, m);
      if (m.date < first) first = m.date;
      if (m.date > last) last = m.date;
      continue;
    }
    if (m.deleted || isOwnInterest(m, id)) continue;
    deltas.set(m.date, (deltas.get(m.date) || 0) + movementEffect(m, id));
  }
  out.aligns = [...aligns.values()];
  // saldo base prima del primo giorno del ciclo
  let base = account.initial || 0;
  for (const [date, v] of deltas) if (date < first) base += v;
  let credited = 0;
  let alignSum = 0;
  let acc = 0n;
  const wFactor = BigInt(10000 - dep.withholdingBp);
  for (let d = first; d <= last; d = addDays(d, 1)) {
    base += deltas.get(d) || 0;
    const al = aligns.get(d);
    if (al) {
      const amount = al.align.balance - (base + credited + alignSum);
      out.alignAmounts[al.id] = amount;
      alignSum += amount;
    }
    if (d < dep.start || d > yesterday) continue;
    const b = base + credited + alignSum;
    if (b <= 0) continue;
    acc += BigInt(b) * BigInt(rateOn(dep.rates, d)) * wFactor;
    const c = acc / D;
    acc -= c * D;
    const ym = monthOf(d);
    const slot = out.byMonth[ym] || (out.byMonth[ym] = { amount: 0, lastDay: d });
    slot.amount += Number(c);
    slot.lastDay = d;
    credited += Number(c);
  }
  return out;
}

// Allinea i movimenti automatici di tutti i conti deposito: un movimento "Interessi" per mese per conto
// (id fisso interest-<conto>-<mese>, data = ultimo giorno maturato del mese) e l'importo delle rettifiche.
// Una sola upsertDerived: se nulla cambia non salva e non notifica (niente cicli con subscribe).
export function reconcileInterest(store, today) {
  const state = store.getState();
  const records = [];
  for (const a of state.accounts) {
    if (a.deleted || a.kind !== 'eur' || !a.deposit) continue;
    const r = accrueInterest(state, a, today);
    const months = new Set(Object.keys(r.byMonth));
    for (const m of state.movements) if (isOwnInterest(m, a.id) && m.id === interestId(a.id, m.interest.month)) months.add(m.interest.month);
    for (const ym of months) {
      const slot = r.byMonth[ym];
      const id = interestId(a.id, ym);
      if (!slot || slot.amount <= 0) {
        if (state.movements.some((m) => m.id === id)) records.push({ id, deleted: true });
        continue;
      }
      records.push({
        id, input: {
          type: 'entrata', date: slot.lastDay, amount: slot.amount, accountId: a.id, categoryId: INTEREST_CATEGORY_ID,
          description: 'Interessi ' + monthLabel(ym), interest: { accountId: a.id, month: ym },
        },
      });
    }
    for (const al of r.aligns) {
      const amount = r.alignAmounts[al.id] ?? 0;
      records.push({ id: al.id, deleted: amount === 0, input: { ...al, amount } });
    }
  }
  if (!records.length) return 0;
  return store.upsertDerived(records, { ensureCategory: records.some((x) => !x.deleted && x.input.type === 'entrata') });
}

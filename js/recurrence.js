// Ricorrenze dei pagamenti programmati: occorrenze, da confermare, prossima scadenza.
// Funzioni pure su date 'YYYY-MM-DD'.

import { parseISO, addDays, addMonthsClamped } from './dates.js';

const MAX_ITER = 2000;

export const FREQ_LABELS = {
  once: 'Una volta',
  weekly: 'Ogni settimana',
  monthly: 'Ogni mese',
  months: 'Ogni N mesi',
  yearly: 'Ogni anno',
};

export function freqLabel(s) {
  if (s.freq === 'months') return `Ogni ${s.interval} mesi`;
  return FREQ_LABELS[s.freq] || '';
}

// k-esima data della serie (k = 0 è l'inizio)
function nth(s, k) {
  const day = parseISO(s.start).d;
  switch (s.freq) {
    case 'weekly': return addDays(s.start, 7 * k);
    case 'monthly': return addMonthsClamped(s.start, k, day);
    case 'months': return addMonthsClamped(s.start, k * (s.interval || 2), day);
    case 'yearly': return addMonthsClamped(s.start, 12 * k, day);
    default: return k === 0 ? s.start : null;
  }
}

// Occorrenze comprese tra from e to (inclusi), rispettando la data di fine.
export function occurrences(s, from, to) {
  if (!s || !parseISO(s.start)) return [];
  const last = s.end && s.end < to ? s.end : to;
  const out = [];
  for (let k = 0; k < MAX_ITER; k++) {
    const d = nth(s, k);
    if (!d || d > last) break;
    if (d >= from) out.push(d);
  }
  return out;
}

// Occorrenze fino a oggi non ancora confermate o saltate.
export function pendingOccurrences(s, today) {
  if (!s || s.deleted) return [];
  const handled = s.handled || {};
  return occurrences(s, s.start, today).filter((d) => !handled[d]);
}

// Prima occorrenza da oggi in poi non ancora gestita.
export function nextOccurrence(s, today) {
  if (!s || s.deleted) return null;
  const handled = s.handled || {};
  const far = addDays(today, 3700);
  for (const d of occurrences(s, today, far)) if (!handled[d]) return d;
  return null;
}

// Importo annuo stimato (centesimi): settimanale ×52, mensile ×12, ogni N mesi ×12/N.
export function yearlyAmount(s) {
  switch (s.freq) {
    case 'weekly': return s.amount * 52;
    case 'monthly': return s.amount * 12;
    case 'months': return Math.round((s.amount * 12) / (s.interval || 2));
    case 'yearly': return s.amount;
    default: return 0;
  }
}

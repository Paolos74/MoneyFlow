// Date come stringhe locali 'YYYY-MM-DD' costruite da anno, mese e giorno.
// Mai new Date('YYYY-MM-DD'): è in UTC e può dare il giorno prima.

export const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export const WEEKDAYS = ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
export const WEEKDAYS_SHORT = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];

const pad = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function toISO(y, m, d) {
  return `${String(y).padStart(4, '0')}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y, m) {
  if (m === 2) return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(m) ? 30 : 31;
}

export function parseISO(s) {
  const r = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
  if (!r) return null;
  const y = Number(r[1]);
  const m = Number(r[2]);
  const d = Number(r[3]);
  if (m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return { y, m, d };
}

export const isValidISO = (s) => parseISO(s) !== null;

export function todayISO(now = new Date()) {
  const d = now instanceof Date ? now : new Date(now);
  return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// Giorni dal 1/1/1970 senza fusi orari, per contare e confrontare.
function dayNumber({ y, m, d }) {
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function fromDayNumber(n) {
  const dt = new Date(n * 86400000);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso, n) {
  return fromDayNumber(dayNumber(parseISO(iso)) + n);
}

export function diffDays(a, b) {
  return dayNumber(parseISO(b)) - dayNumber(parseISO(a));
}

// Aggiunge mesi tenendo il giorno indicato (o quello di partenza), ridotto a fine mese.
export function addMonthsClamped(iso, n, day) {
  const p = parseISO(iso);
  const idx = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  return toISO(y, m, Math.min(day || p.d, daysInMonth(y, m)));
}

// 0 = lunedì … 6 = domenica
export function weekday(iso) {
  return (((dayNumber(parseISO(iso)) + 3) % 7) + 7) % 7;
}

export function startOfIsoWeek(iso) {
  return addDays(iso, -weekday(iso));
}

export const monthOf = (iso) => iso.slice(0, 7);
export const monthStart = (ym) => ym + '-01';

export function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  return toISO(y, m, daysInMonth(y, m));
}

export function addMonthsYM(ym, n) {
  return addMonthsClamped(ym + '-01', n).slice(0, 7);
}

// Elenco dei mesi 'YYYY-MM' da a fino a b compresi.
export function monthsBetween(a, b) {
  const out = [];
  let cur = a;
  for (let i = 0; cur <= b && i < 600; i++) {
    out.push(cur);
    cur = addMonthsYM(cur, 1);
  }
  return out;
}

export function formatDateIt(iso) {
  const p = parseISO(iso);
  if (!p) return '';
  return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
}

// "Lunedì 3 marzo" (con l'anno se diverso da quello di riferimento)
export function formatDayHeader(iso, refYear) {
  const p = parseISO(iso);
  if (!p) return '';
  const s = `${cap(WEEKDAYS[weekday(iso)])} ${p.d} ${MONTHS[p.m - 1]}`;
  return refYear && refYear !== p.y ? `${s} ${p.y}` : s;
}

export function formatDayShort(iso) {
  const p = parseISO(iso);
  if (!p) return '';
  return `${p.d} ${MONTHS_SHORT[p.m - 1]}`;
}

export function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return `${cap(MONTHS[m - 1])} ${y}`;
}

export function monthShortLabel(ym) {
  const m = Number(ym.slice(5, 7));
  return cap(MONTHS_SHORT[m - 1]);
}

export const PERIODS = [
  { key: 'mese', label: 'Questo mese' },
  { key: 'mese-scorso', label: 'Mese scorso' },
  { key: '3mesi', label: 'Ultimi 3 mesi' },
  { key: 'anno', label: "Quest'anno" },
  { key: 'anno-scorso', label: 'Anno scorso' },
  { key: 'custom', label: 'Personalizzato' },
];

// Periodo chiuso { from, to } per uno dei filtri; per 'custom' controlla le date.
export function periodRange(key, today, custom = {}) {
  const ym = monthOf(today);
  const y = Number(today.slice(0, 4));
  switch (key) {
    case 'mese': return { from: monthStart(ym), to: monthEnd(ym) };
    case 'mese-scorso': { const p = addMonthsYM(ym, -1); return { from: monthStart(p), to: monthEnd(p) }; }
    case '3mesi': return { from: monthStart(addMonthsYM(ym, -2)), to: monthEnd(ym) };
    case 'anno': return { from: toISO(y, 1, 1), to: toISO(y, 12, 31) };
    case 'anno-scorso': return { from: toISO(y - 1, 1, 1), to: toISO(y - 1, 12, 31) };
    case 'custom': {
      const { from, to } = custom;
      if (!isValidISO(from) || !isValidISO(to)) return { from, to, error: 'Inserisci entrambe le date' };
      if (from > to) return { from, to, error: 'La data di inizio è dopo la data di fine' };
      return { from, to };
    }
    default: return periodRange('mese', today);
  }
}

// Importazione di movimenti da CSV (v4), funzioni pure: lettura RFC 4180, estratto Revolut, formato generico
// con scelta delle colonne, doppioni, categoria suggerita da un movimento passato. Tutto sul dispositivo.

import { isValidISO, toISO } from './dates.js';
import { movementEffect } from './calc.js';

// ---------- lettura ----------

// Separatore più frequente fuori dalle virgolette nella prima riga, tra ';', ',' e tabulazione.
function detectSeparator(text) {
  const counts = { ';': 0, ',': 0, '\t': 0 };
  let q = false;
  for (const c of text) {
    if (c === '"') q = !q;
    else if (!q && (c === '\n' || c === '\r')) break;
    else if (!q && c in counts) counts[c]++;
  }
  let best = ',';
  for (const s of [';', '\t', ',']) if (counts[s] > counts[best]) best = s;
  return best;
}

// Testo → { sep, rows: [[celle]] }. Toglie il BOM; virgolette doppie con "" e a capo dentro le virgolette;
// righe CRLF o LF; righe vuote saltate.
export function parseCsv(text) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  const sep = detectSeparator(s);
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const endRow = () => {
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    row = [];
    cell = '';
  };
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\r') { if (s[i + 1] === '\n') i++; endRow(); }
    else if (c === '\n') endRow();
    else cell += c;
  }
  if (cell !== '' || row.length) endRow();
  return { sep, rows };
}

// Importo di una cella → centesimi con segno, oppure null. L'ultimo separatore ('.' o ',') seguito da 1–2 cifre
// alla fine è il decimale, gli altri sono migliaia: "1.234,56", "-12,50", "1234.56", "1,234.56", "€ 5", "12,50-".
export function parseCsvAmount(text) {
  let s = String(text ?? '').replace(/[\s\u00A0\u202F€]/g, '').replace(/EUR$/i, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.startsWith('-') || s.startsWith('−')) { neg = !neg; s = s.slice(1); } else if (s.startsWith('+')) s = s.slice(1);
  if (s.endsWith('-')) { neg = !neg; s = s.slice(0, -1); }
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  const m = /[.,](\d{1,2})$/.exec(s);
  let intPart = s;
  let dec = '00';
  if (m) { intPart = s.slice(0, m.index); dec = (m[1] + '0').slice(0, 2); }
  intPart = intPart.replace(/[.,']/g, '');
  if (!/^\d*$/.test(intPart)) return null;
  const cents = Number(intPart || '0') * 100 + Number(dec);
  if (!Number.isSafeInteger(cents)) return null;
  return neg ? -cents : cents;
}

// Data di una cella → 'YYYY-MM-DD' o null: AAAA-MM-GG, GG/MM/AAAA, GG-MM-AAAA, GG.MM.AAAA, con eventuale ora dopo.
export function parseCsvDate(text) {
  const s = String(text ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T].*)?$/.exec(s);
  let iso = null;
  if (m) iso = toISO(Number(m[1]), Number(m[2]), Number(m[3]));
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T,].*)?$/.exec(s))) iso = toISO(Number(m[3]), Number(m[2]), Number(m[1]));
  return iso && isValidISO(iso) ? iso : null;
}

// ---------- Revolut ----------

// Estratto conto personale di Revolut. Intestazione inglese (riferimento: esempio pubblico su
// github.com/brucify/revolutax); quella italiana NON è verificata su un file vero.
const REVOLUT = {
  en: { type: 'Type', product: 'Product', started: 'Started Date', completed: 'Completed Date', description: 'Description', amount: 'Amount', fee: 'Fee', currency: 'Currency', state: 'State', balance: 'Balance' },
  it: { type: 'Tipo', product: 'Prodotto', started: 'Data di inizio', completed: 'Data di completamento', description: 'Descrizione', amount: 'Importo', fee: 'Costo', currency: 'Valuta', state: 'Stato', balance: 'Saldo' },
};
const COMPLETED = ['COMPLETED', 'COMPLETATO', 'COMPLETATA'];
const norm = (s) => String(s ?? '').trim().toLocaleLowerCase('it');

// Intestazione → indici delle colonne Revolut, oppure null.
export function detectRevolut(header) {
  const h = (header || []).map(norm);
  for (const names of Object.values(REVOLUT)) {
    const idx = {};
    for (const [k, label] of Object.entries(names)) idx[k] = h.indexOf(norm(label));
    if (['completed', 'started', 'description', 'amount', 'currency', 'state'].every((k) => idx[k] >= 0)) return idx;
  }
  return null;
}

// ---------- formato generico ----------

// Colonne proposte dai nomi dell'intestazione (l'utente le può cambiare).
export function guessColumns(header) {
  const h = (header || []).map(norm);
  const find = (re) => h.findIndex((x) => re.test(x));
  return {
    date: find(/^(data|date|giorno)|data (operazione|contabile|valuta)/),
    description: find(/descr|causale|dettagl|beneficiar|esercente|memo|note/),
    amount: find(/importo|amount|ammontare|valore|euro/),
  };
}

// La prima riga è un'intestazione se nessuna sua cella è una data.
export const hasHeaderRow = (rows) => !!rows.length && !rows[0].some((c) => parseCsvDate(c));

// ---------- righe da importare ----------

const cleanDescription = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 80);
const descKey = (s) => cleanDescription(s).toLocaleLowerCase('it');

// mapping: { kind: 'revolut' } oppure { kind: 'generic', date, description, amount, invert }.
// → { rows: [{ line, date, description, amount, type, importKey, duplicate, include }], skipped: [{ line, reason }] }.
// importKey = csv|data|importo con segno|descrizione minuscola|n, con n che conta le righe uguali nello stesso file
// (due spese uguali nello stesso giorno restano due). Doppione: stessa importKey già sul conto (stesso file
// reimportato), oppure stessa data e stesso effetto sul conto di un movimento senza importKey (inserito a mano):
// queste righe partono non spuntate, una riga per ogni movimento già presente.
export function buildImportRows(parsed, mapping, state, accountId) {
  const all = parsed.rows || [];
  let body;
  let pick;
  const skipped = [];
  if (mapping.kind === 'revolut') {
    const idx = detectRevolut(all[0]);
    if (!idx) return { rows: [], skipped: [] };
    body = all.slice(1).map((cells, i) => ({ cells, line: i + 2 }));
    pick = ({ cells, line }) => {
      const st = String(cells[idx.state] ?? '').trim().toUpperCase();
      if (!COMPLETED.includes(st)) return { reason: `Non completata (${st || 'senza stato'})`, line };
      const cur = String(cells[idx.currency] ?? '').trim().toUpperCase();
      if (cur !== 'EUR') return { reason: `Valuta ${cur || 'mancante'}: si importano solo gli euro`, line };
      const date = parseCsvDate(cells[idx.completed]) || parseCsvDate(cells[idx.started]);
      if (!date) return { reason: 'Data non valida', line };
      const amount = parseCsvAmount(cells[idx.amount]);
      const fee = idx.fee >= 0 && String(cells[idx.fee] ?? '').trim() ? parseCsvAmount(cells[idx.fee]) : 0;
      if (amount === null || fee === null) return { reason: 'Importo non valido', line };
      return { date, signed: amount - fee, description: cells[idx.description], line };
    };
  } else {
    const header = hasHeaderRow(all);
    body = all.slice(header ? 1 : 0).map((cells, i) => ({ cells, line: i + (header ? 2 : 1) }));
    pick = ({ cells, line }) => {
      const date = parseCsvDate(cells[mapping.date]);
      if (!date) return { reason: 'Data non valida', line };
      const amount = parseCsvAmount(cells[mapping.amount]);
      if (amount === null) return { reason: 'Importo non valido', line };
      return { date, signed: mapping.invert ? -amount : amount, description: mapping.description >= 0 ? cells[mapping.description] : '', line };
    };
  }
  // movimenti già sul conto: per chiave d'importazione e, senza chiave, per data ed effetto (uno a uno)
  const keys = new Set();
  const manual = new Map();
  for (const m of state.movements) {
    if (m.deleted || (m.accountId !== accountId && m.toAccountId !== accountId)) continue;
    if (m.importKey) keys.add(m.importKey);
    else {
      const k = m.date + '|' + movementEffect(m, accountId);
      manual.set(k, (manual.get(k) || 0) + 1);
    }
  }
  const seen = new Map();
  const rows = [];
  for (const r of body) {
    const p = pick(r);
    if (p.reason) { skipped.push(p); continue; }
    if (p.signed === 0) { skipped.push({ line: p.line, reason: 'Importo zero' }); continue; }
    const description = cleanDescription(p.description);
    const base = `csv|${p.date}|${p.signed}|${descKey(description).slice(0, 80)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    const importKey = `${base}|${n}`.slice(0, 120);
    let duplicate = keys.has(importKey);
    if (!duplicate) {
      const mk = p.date + '|' + p.signed;
      if (manual.get(mk) > 0) { duplicate = true; manual.set(mk, manual.get(mk) - 1); }
    }
    rows.push({ line: p.line, date: p.date, description, amount: Math.abs(p.signed), type: p.signed < 0 ? 'uscita' : 'entrata', importKey, duplicate, include: !duplicate });
  }
  return { rows, skipped };
}

// Categoria di un movimento passato dello stesso tipo con la stessa descrizione (senza maiuscole e spazi in più),
// il più recente con una categoria non eliminata; altrimenti `fallback`. Mai importi.
export function suggestCategory(state, type, description, fallback = null) {
  const k = descKey(description);
  if (!k) return fallback;
  let best = null;
  for (const m of state.movements) {
    if (m.deleted || m.type !== type || descKey(m.description) !== k) continue;
    const cat = state.categories.find((c) => c.id === m.categoryId);
    if (!cat || cat.deleted) continue;
    if (!best || m.date > best.date || (m.date === best.date && (m.createdAt || 0) > (best.createdAt || 0))) best = m;
  }
  return best ? best.categoryId : fallback;
}

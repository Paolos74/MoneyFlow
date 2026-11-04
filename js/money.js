// Importi in centesimi interi (euro) e quantità crypto in unità da 1e-8.
// Lettura e formattazione all'italiana: mai somme di numeri decimali.

const EUR = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
const INT_IT = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 0, useGrouping: 'always' });

export const QTY_DECIMALS = 8;
export const QTY_UNIT = 100000000;

// Separa parte intera e decimale gestendo i punti delle migliaia.
// euroMode: un solo punto seguito da 3 cifre vale come migliaia (1.250 = 1250).
function splitNumber(s, euroMode) {
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  let intPart;
  let decPart = '';
  const comma = s.lastIndexOf(',');
  if (comma >= 0) {
    intPart = s.slice(0, comma);
    decPart = s.slice(comma + 1);
    if (decPart.includes('.') || intPart.includes(',')) return null;
    if (intPart.includes('.')) {
      if (!/^\d{1,3}(\.\d{3})+$/.test(intPart)) return null;
      intPart = intPart.replace(/\./g, '');
    }
  } else {
    const parts = s.split('.');
    if (parts.length === 1) intPart = s;
    else if (parts.length === 2) {
      const [a, b] = parts;
      if (euroMode && b.length === 3 && /^[1-9]\d{0,2}$/.test(a)) intPart = a + b;
      else { intPart = a; decPart = b; }
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      intPart = s.replace(/\./g, '');
    }
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || !/^\d*$/.test(decPart)) return null;
  if (intPart.length > 13) return null;
  return { intPart, decPart };
}

function cleanSign(input, allowNegative) {
  if (typeof input === 'number') input = String(input);
  if (typeof input !== 'string') return null;
  let s = input.replace(/[\s\u00A0\u202F€]/g, '');
  let neg = false;
  if (s.startsWith('-') || s.startsWith('−')) {
    if (!allowNegative) return null;
    neg = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!s) return null;
  return { s, neg };
}

// "12,50" → 1250. Restituisce null se il valore non è valido.
export function parseEuroInput(input, { allowNegative = false } = {}) {
  const c = cleanSign(input, allowNegative);
  if (!c) return null;
  const p = splitNumber(c.s, true);
  if (!p || p.decPart.length > 2) return null;
  const cents = Number(p.intPart) * 100 + Number((p.decPart + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents)) return null;
  return c.neg && cents !== 0 ? -cents : cents;
}

// "0,05" → 5000000 (unità da 1e-8). Il punto singolo vale come virgola.
export function parseQtyInput(input, { allowNegative = false } = {}) {
  const c = cleanSign(input, allowNegative);
  if (!c) return null;
  const p = splitNumber(c.s, false);
  if (!p || p.decPart.length > QTY_DECIMALS) return null;
  const units = Number(p.intPart) * QTY_UNIT + Number((p.decPart + '00000000').slice(0, QTY_DECIMALS));
  if (!Number.isSafeInteger(units)) return null;
  return c.neg && units !== 0 ? -units : units;
}

export function formatEuro(cents) {
  return EUR.format((Number(cents) || 0) / 100);
}

// Importo con segno esplicito (+ per le entrate), per le liste.
export function formatEuroSigned(cents) {
  if (cents > 0) return '+' + formatEuro(cents);
  return formatEuro(cents);
}

// Senza simbolo né migliaia: "-1250,50". Per CSV e campi da modificare.
export function formatEuroPlain(cents) {
  const n = Number(cents) || 0;
  const abs = Math.abs(n);
  const s = Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
  return n < 0 ? '-' + s : s;
}

function qtyParts(units) {
  const n = Number(units) || 0;
  const abs = Math.abs(n);
  const int = Math.floor(abs / QTY_UNIT);
  const frac = String(abs % QTY_UNIT).padStart(QTY_DECIMALS, '0').replace(/0+$/, '');
  return { neg: n < 0, int, frac };
}

// 5000000, 'BTC' → "0,05 BTC"
export function formatQty(units, asset) {
  const { neg, int, frac } = qtyParts(units);
  const s = (neg ? '-' : '') + INT_IT.format(int) + (frac ? ',' + frac : '');
  return asset ? s + ' ' + asset : s;
}

export function formatQtyPlain(units) {
  const { neg, int, frac } = qtyParts(units);
  return (neg ? '-' : '') + int + (frac ? ',' + frac : '');
}

// Percentuale in decimi interi: 980 = 98,0 %. Con totale 0 vale 0.
export function percentTenths(part, total) {
  if (!total) return 0;
  return Math.round((part * 1000) / total);
}

export function formatPercent(tenths) {
  const n = Math.round(Number(tenths) || 0);
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(abs / 10) + ',' + (abs % 10) + '%';
}

// Compra/Vendi crypto: quantità (unità 1e-8) × prezzo per 1 unità intera (centesimi) / 1e8 = centesimi.
// Calcolo con BigInt per non perdere precisione; arrotondamento al centesimo "metà in su".
// Restituisce null se gli input non sono interi positivi o se il risultato è troppo grande.
export function tradeEuroCents(qtyUnits, priceCents) {
  if (!Number.isSafeInteger(qtyUnits) || !Number.isSafeInteger(priceCents) || qtyUnits <= 0 || priceCents <= 0) return null;
  const unit = BigInt(QTY_UNIT);
  const cents = (BigInt(qtyUnits) * BigInt(priceCents) + unit / 2n) / unit;
  const n = Number(cents);
  return Number.isSafeInteger(n) ? n : null;
}

// Percentuale scritta dall'utente → punti base interi (1,73 % = 173). Da 0 a 10 %.
export function parsePercentInput(text) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[\s\u00A0\u202F]/g, '').replace(/%$/, '');
  const m = /^(\d{1,2})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
  return bp <= 1000 ? bp : null;
}

// 173 → "1,73%"
export function formatPercentBp(bp) {
  const n = Math.round(Number(bp) || 0);
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0') + '%';
}

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

// ---- ETF (v5): prezzo per quota in unità da 1e-4 € (4 decimali), quote in unità da 1e-8 come le crypto ----
export const PRICE4_UNIT = 10000;

// "52,1333" → 521333; "56" → 560000; "1.250,1234" → 12501234. null se non valido o con più di 4 decimali.
export function parsePrice4Input(input) {
  const c = cleanSign(input, false);
  if (!c) return null;
  const p = splitNumber(c.s, true);
  if (!p || p.decPart.length > 4) return null;
  const units = Number(p.intPart) * PRICE4_UNIT + Number((p.decPart + '0000').slice(0, 4));
  return Number.isSafeInteger(units) ? units : null;
}

// Almeno 2 decimali, gli zeri finali oltre il 2° tolti: 521333 → "52,1333", 585000 → "58,50".
function price4Parts(units) {
  const n = Number(units) || 0;
  const abs = Math.abs(n);
  const int = Math.floor(abs / PRICE4_UNIT);
  let frac = String(abs % PRICE4_UNIT).padStart(4, '0');
  while (frac.length > 2 && frac.endsWith('0')) frac = frac.slice(0, -1);
  return { neg: n < 0, int, frac };
}

export function formatPrice4(units) {
  const { neg, int, frac } = price4Parts(units);
  return (neg ? '-' : '') + INT_IT.format(int) + ',' + frac + '\u00A0€';
}

// Senza simbolo né migliaia: "52,1333". Per i campi da modificare.
export function formatPrice4Plain(units) {
  const { neg, int, frac } = price4Parts(units);
  return (neg ? '-' : '') + int + ',' + frac;
}

// Arrotondamento "metà in su" di a / b con BigInt (a ≥ 0, b > 0); null se il risultato non è un intero sicuro.
function divRoundHalfUp(a, b) {
  const n = Number((a * 2n + b) / (b * 2n));
  return Number.isSafeInteger(n) ? n : null;
}

// Importo di un'operazione ETF: quote (1e-8) × prezzo per quota (1e-4 €) = centesimi × 1e10.
// centesimi = quote × prezzo ÷ 1e10, arrotondato al centesimo "metà in su".
// Es. 10 quote × 50,0000 € = (10e8 × 500000) ÷ 1e10 = 50000 centesimi = 500,00 €.
export function etfTradeCents(qtyUnits, price4) {
  if (!Number.isSafeInteger(qtyUnits) || !Number.isSafeInteger(price4) || qtyUnits <= 0 || price4 <= 0) return null;
  return divRoundHalfUp(BigInt(qtyUnits) * BigInt(price4), 10000000000n);
}

// Quota del costo di carico: costo × parte ÷ totale, al centesimo "metà in su".
// Es. costo delle 6 quote vendute su 15 con costo 782,00 € = 78200 × 6 ÷ 15 = 31280 centesimi = 312,80 €.
export function proportionalCents(costCents, partUnits, totalUnits) {
  if (!Number.isSafeInteger(costCents) || !Number.isSafeInteger(partUnits) || !Number.isSafeInteger(totalUnits) || totalUnits <= 0 || partUnits < 0 || costCents < 0) return 0;
  return divRoundHalfUp(BigInt(costCents) * BigInt(partUnits), BigInt(totalUnits)) ?? 0;
}

// Prezzo medio di carico per quota (1e-4 €) = costo (centesimi) ÷ quote, cioè costo × 100 × 1e8 ÷ quote (unità 1e-8).
// Es. 782,00 € per 15 quote = 78200 × 1e10 ÷ 15e8 = 521333 (52,1333 €). 0 senza quote.
export function avgPrice4(costCents, qtyUnits) {
  if (!Number.isSafeInteger(costCents) || !Number.isSafeInteger(qtyUnits) || qtyUnits <= 0 || costCents < 0) return 0;
  return divRoundHalfUp(BigInt(costCents) * 10000000000n, BigInt(qtyUnits)) ?? 0;
}

// Tassa sulla plusvalenza: 0 se la plusvalenza è ≤ 0, altrimenti plusvalenza × aliquota (punti base) ÷ 10000,
// al centesimo "metà in su". Es. 46,20 € al 26 % = 4620 × 2600 ÷ 10000 = 1201,2 → 1201 (12,01 €).
export function taxCents(gainCents, rateBp) {
  if (!Number.isSafeInteger(gainCents) || gainCents <= 0 || !Number.isSafeInteger(rateBp) || rateBp <= 0) return 0;
  return divRoundHalfUp(BigInt(gainCents) * BigInt(rateBp), 10000n) ?? 0;
}

// Percentuale con il "+" davanti se positiva: 480 → "+48,0%", 0 → "0,0%", −34 → "-3,4%".
export function formatPercentSigned(tenths) {
  return (tenths > 0 ? '+' : '') + formatPercent(tenths);
}

// Aliquota in punti base senza ",00": 2600 → "26%", 1875 → "18,75%", 1250 → "12,50%", 0 → "0%".
export function formatRateBp(bp) {
  return formatPercentBp(bp).replace(/,00%$/, '%');
}

// Percentuale scritta dall'utente → punti base interi (1,73 % = 173). Da 0 a `max` punti base
// (predefinito 1000 = 10 %; la ritenuta del deposito arriva a 10000 = 100 %).
export function parsePercentInput(text, { max = 1000 } = {}) {
  if (typeof text !== 'string') return null;
  const s = text.replace(/[\s\u00A0\u202F]/g, '').replace(/%$/, '');
  const m = /^(\d{1,3})(?:[.,](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bp = Number(m[1]) * 100 + Number(((m[2] || '') + '00').slice(0, 2));
  return bp <= max ? bp : null;
}

// 173 → "1,73%"
export function formatPercentBp(bp) {
  const n = Math.round(Number(bp) || 0);
  const abs = Math.abs(n);
  return (n < 0 ? '-' : '') + Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0') + '%';
}

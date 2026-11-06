// Calcoli puri degli investimenti in ETF (v5): quote, prezzo medio di carico, valore, plusvalenze, tasse stimate.
// Formule e riferimenti fiscali qui sotto; tutto è una stima e l'interfaccia lo dice.
//
// Costo medio ponderato (risposte 4 e 6 dell'utente):
// - Compra: quote += quote comprate; costo += importo pagato (commissioni comprese).
//   Prezzo medio di carico = costo ÷ quote (es. 501,00 + 281,00 = 782,00 € per 15 quote → 52,1333 €).
// - Vendi: costo delle quote vendute = costo × quote vendute ÷ quote possedute, al centesimo "metà in su";
//   costo −= costo delle quote vendute, quote −= quote vendute. Il prezzo medio delle quote rimaste non cambia
//   (es. 782,00 × 6 ÷ 15 = 312,80 €; restano 9 quote con costo 469,20 € → ancora 52,1333 €).
// - Plusvalenza = importo della vendita al netto delle commissioni − costo delle quote vendute
//   (es. 359,00 − 312,80 = 46,20 €). L'importo della vendita è quello che arriva sul conto più la tassa
//   trattenuta dal broker (regime Amministrato), oppure quello che arriva sul conto (Dichiarativo).
// - Tassa = plusvalenza × aliquota dell'ETF, al centesimo "metà in su", 0 se la plusvalenza è ≤ 0
//   (es. 46,20 × 26 % = 12,01 €). Il 26 % è l'imposta sostitutiva sui redditi di capitale degli ETF armonizzati
//   (art. 44 e 45 TUIR, D.Lgs. 461/1997); per gli ETF con titoli di Stato l'aliquota effettiva è più bassa
//   (la quota di titoli di Stato è tassata al 12,5 %), per questo è modificabile per ETF.
// - Minusvalenza (vendita in perdita): reddito diverso (art. 67 e 68 TUIR), compensabile fino al 31/12 del
//   4° anno successivo solo con plusvalenze da azioni, ETC, certificati, non con quelle da ETF: lo "zainetto"
//   è solo informativo e non riduce le tasse sugli ETF.
// - Valore di 1 quota a una data: l'ultimo "Aggiorna valore" con data ≤ quella data, altrimenti il prezzo
//   dell'ultimo acquisto ≤ quella data ("prezzo d'acquisto", risposta 6). Valore = quote × valore di 1 quota.
// Anno fiscale di vendite e dividendi = anno della data del movimento (scelta provvisoria P8).

import { etfTradeCents, proportionalCents, avgPrice4, taxCents, percentTenths, formatQty, QTY_UNIT } from './money.js';

const byId = (list, id) => (list || []).find((r) => r.id === id) || null;

// "9 quote", "1 quota", "12,5 quote"
export const qtyText = (units) => `${formatQty(units)} ${units === QTY_UNIT ? 'quota' : 'quote'}`;

export const isEtfTrade = (m) => !!m.etfId && m.type === 'trasferimento' && (m.trade === 'compra' || m.trade === 'vendi');
export const isDividend = (m) => !!m.etfId && m.type === 'entrata';

export function etfOf(state, id) {
  return byId(state.investments, id);
}

export function etfLabel(state, id) {
  const e = etfOf(state, id);
  if (!e) return 'ETF sconosciuto';
  return e.deleted ? `${e.name} (eliminato)` : e.name;
}

// ETF non eliminati nell'ordine scelto, poi per nome.
export function sortedInvestments(state) {
  return (state.investments || []).filter((e) => !e.deleted)
    .sort((a, b) => (a.order - b.order) || a.name.localeCompare(b.name, 'it'));
}

const opOrder = (a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0);

// Movimenti dell'ETF (Compra, Vendi, dividendi) non eliminati, in ordine di data e creazione.
export function etfMovements(state, etfId) {
  return state.movements.filter((m) => !m.deleted && m.etfId === etfId && (isEtfTrade(m) || isDividend(m))).sort(opOrder);
}

// Importo della vendita al netto delle commissioni: arrivato sul conto + tassa trattenuta (solo Amministrato).
export const saleProceeds = (m) => (m.amountTo || 0) + (m.taxRegime === 'dichiarativo' ? 0 : (m.tax || 0));

// Posizione dell'ETF dopo le operazioni con data ≤ upTo (null = tutte).
// before = { date, createdAt }: solo le operazioni che vengono prima (foglio Vendi); exceptId: movimento escluso.
// Tollerante: una vendita oltre le quote (dati arrivati dalla sync) vende al massimo quelle possedute.
export function etfPosition(state, etfId, upTo = null, { before = null, exceptId = null } = {}) {
  let qty = 0;
  let cost = 0;
  const sales = [];
  const dividends = [];
  for (const m of etfMovements(state, etfId)) {
    if (m.id === exceptId) continue;
    if (upTo && m.date > upTo) continue;
    if (before && opOrder(m, before) >= 0) continue;
    if (isDividend(m)) { dividends.push({ movement: m, amount: m.amount, tax: m.tax || 0, regime: m.taxRegime || 'amministrato' }); continue; }
    if (m.trade === 'compra') { qty += m.amountTo; cost += m.amount; continue; }
    const q = Math.min(m.amount, qty);
    const costSold = q === qty ? cost : proportionalCents(cost, q, qty);
    const proceeds = saleProceeds(m);
    sales.push({ movement: m, qty: q, proceeds, costSold, gain: proceeds - costSold, tax: m.tax || 0, regime: m.taxRegime || 'amministrato' });
    qty -= q;
    cost -= costSold;
  }
  return { qty, cost, avgPrice4: avgPrice4(cost, qty), sales, dividends };
}

// Valore di 1 quota a una data (P9): { price4, date, source: 'manual' | 'purchase' } oppure null.
export function etfUnitValue(state, etf, date = null) {
  const prices = (etf.prices || []).filter((p) => !date || p.date <= date);
  if (prices.length) { const p = prices[prices.length - 1]; return { price4: p.price, date: p.date, source: 'manual' }; }
  const buys = etfMovements(state, etf.id).filter((m) => m.trade === 'compra' && (!date || m.date <= date));
  if (buys.length) { const b = buys[buys.length - 1]; return { price4: b.price, date: b.date, source: 'purchase' }; }
  return null;
}

// Riepilogo di un ETF a una data (null = oggi e tutte le operazioni registrate): posizione, valore, guadagno.
export function etfSummary(state, etfId, date = null) {
  const etf = etfOf(state, etfId);
  const pos = etfPosition(state, etfId, date);
  const valueInfo = etf ? etfUnitValue(state, etf, date) : null;
  const value = pos.qty > 0 && valueInfo ? etfTradeCents(pos.qty, valueInfo.price4) ?? 0 : 0;
  const gain = value - pos.cost;
  return {
    ...pos, value, gain, gainPct: percentTenths(gain, pos.cost), valueInfo,
    realized: pos.sales.reduce((t, s) => t + s.gain, 0),
  };
}

// Valore totale degli ETF non eliminati a una data (patrimonio).
export function investValue(state, date = null) {
  return sortedInvestments(state).reduce((t, e) => t + etfSummary(state, e.id, date).value, 0);
}

// Scadenza della minusvalenza: 31/12 del 4° anno dopo quello della vendita.
export const lossExpiry = (date) => `${Number(date.slice(0, 4)) + 4}-12-31`;

// Riepilogo fiscale di un anno sugli ETF non eliminati (stima):
// gains = plusvalenze > 0 delle vendite dell'anno; losses = minusvalenze delle vendite dell'anno;
// withheld = tasse trattenute (vendite Amministrato); due = tasse da pagare con la dichiarazione (vendite e
// dividendi Dichiarativo); carry = zainetto: minusvalenze di tutte le vendite non ancora scadute a `today`.
export function investTaxYear(state, year, today) {
  const y = String(year);
  const out = { gains: 0, losses: 0, withheld: 0, due: 0, carry: [] };
  for (const etf of sortedInvestments(state)) {
    const pos = etfPosition(state, etf.id);
    for (const s of pos.sales) {
      if (s.gain < 0) {
        const expires = lossExpiry(s.movement.date);
        if (expires >= today) out.carry.push({ movement: s.movement, etfId: etf.id, amount: -s.gain, expires });
      }
      if (s.movement.date.slice(0, 4) !== y) continue;
      if (s.gain > 0) out.gains += s.gain; else out.losses += -s.gain;
      if (s.regime === 'dichiarativo') out.due += s.tax; else out.withheld += s.tax;
    }
    for (const d of pos.dividends) {
      if (d.movement.date.slice(0, 4) === y && d.regime === 'dichiarativo') out.due += d.tax;
    }
  }
  out.carry.sort((a, b) => a.expires.localeCompare(b.expires) || a.movement.date.localeCompare(b.movement.date));
  return out;
}

// Stima per il foglio Vendi: quote possedute e prezzo medio prima della vendita, costo delle quote vendute,
// plusvalenza e tassa con l'aliquota attuale dell'ETF. exceptId = la vendita in modifica.
export function sellTax(state, etfId, { qty, proceeds, date, exceptId = null }) {
  const etf = etfOf(state, etfId);
  const self = exceptId ? state.movements.find((m) => m.id === exceptId) : null;
  const pos = etfPosition(state, etfId, null, { before: { date, createdAt: self ? self.createdAt : Infinity }, exceptId });
  const q = Math.min(qty, pos.qty);
  const costSold = q <= 0 ? 0 : q === pos.qty ? pos.cost : proportionalCents(pos.cost, q, pos.qty);
  const gain = proceeds - costSold;
  return { held: pos.qty, avgPrice4: pos.avgPrice4, costSold, gain, tax: taxCents(gain, etf ? etf.taxRateBp : 2600), expires: gain < 0 ? lossExpiry(date) : null };
}

// Quote possedute a una data escluso un movimento (riga "possiedi N quote" del foglio Vendi).
export function heldAt(state, etfId, date, exceptId = null) {
  const self = exceptId ? state.movements.find((m) => m.id === exceptId) : null;
  return etfPosition(state, etfId, null, { before: { date, createdAt: self ? self.createdAt : Infinity }, exceptId }).qty;
}

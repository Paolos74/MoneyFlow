// Modello dati di MoneyFlow: validazione, CRUD con tombstone, persistenza sicura.
// Ogni modifica valida, prepara una copia, salva e solo alla fine notifica.

import { ValidationError, StorageError } from './errors.js';
import { isValidISO, monthOf } from './dates.js';
import { formatEuro, formatQty, QTY_UNIT } from './money.js';
import { PICK_ICONS } from './icons.js';

export { ValidationError, StorageError };

export const APP = 'MoneyFlow';
export const SCHEMA_VERSION = 1;
export const DATA_KEY = 'moneyflow:data';
// ETF (v5): chiave nuova e separata, così una scheda ancora in v4 che salva `moneyflow:data` non li cancella.
export const INVEST_KEY = 'moneyflow:investments';

export const PALETTE = [
  '#0F9D58', '#2563EB', '#D97706', '#DC2626', '#7C3AED', '#DB2777',
  '#0891B2', '#65A30D', '#EA580C', '#4F46E5', '#B45309', '#64748B',
];

// Raccolte del modello e prefisso usato nelle chiavi (sync, notifiche ai listener).
export const KINDS = {
  account: 'accounts',
  category: 'categories',
  movement: 'movements',
  scheduled: 'scheduled',
  goal: 'goals',
  investment: 'investments',
};

// Raccolte salvate in `moneyflow:data` (quelle della v1–v4); `investments` sta in INVEST_KEY.
export const DATA_COLLECTIONS = ['accounts', 'categories', 'movements', 'scheduled', 'goals'];

export const MOVEMENT_TYPES = ['uscita', 'entrata', 'trasferimento', 'restituzione', 'variazione'];
export const SCHEDULED_TYPES = ['uscita', 'entrata', 'trasferimento'];
export const FREQS = ['once', 'weekly', 'monthly', 'months', 'yearly'];

const DEFAULT_CATEGORIES = [
  ['uscita', 'Casa', 0], ['uscita', 'Spesa', 7], ['uscita', 'Trasporti', 1], ['uscita', 'Bollette', 2],
  ['uscita', 'Abbonamenti', 4], ['uscita', 'Salute', 3], ['uscita', 'Svago', 5], ['uscita', 'Ristoranti', 8],
  ['uscita', 'Regali', 6], ['uscita', 'Altro', 11],
  ['entrata', 'Stipendio', 0], ['entrata', 'Rimborsi', 6], ['entrata', 'Altro', 11],
  ['entrata', 'Interessi', 0], ['entrata', 'Dividendi', 9],
];

// Categoria delle entrate "Interessi" dei conti deposito (v4): id fisso, creata da upsertDerived se manca.
export const INTEREST_CATEGORY_ID = 'default-entrata-interessi';
// Categoria "Dividendi" degli ETF (v5, provvisoria): id fisso, creata dal foglio Dividendo se manca (dati v1–v4).
export const DIVIDEND_CATEGORY_ID = 'default-entrata-dividendi';
const DEFAULT_ROLES = { Stipendio: 'stipendio', Interessi: 'interessi', Dividendi: 'dividendi' };
// Categorie con ruolo create dall'app quando servono: nome alternativo se il nome è già usato.
const ROLE_CATEGORIES = {
  interessi: { id: INTEREST_CATEGORY_ID, name: 'Interessi', alt: 'Interessi deposito', color: PALETTE[0], order: 13 },
  dividendi: { id: DIVIDEND_CATEGORY_ID, name: 'Dividendi', alt: 'Dividendi ETF', color: PALETTE[9], order: 14 },
};
export const TAX_REGIMES = ['amministrato', 'dichiarativo'];
export const DEFAULT_TAX_RATE_BP = 2600;

export function emptyData() {
  return { app: APP, schemaVersion: SCHEMA_VERSION, accounts: [], categories: [], movements: [], scheduled: [], goals: [] };
}

// Le categorie iniziali hanno id fissi e date a 0: su ogni dispositivo sono lo stesso record,
// quindi la sync non le raddoppia e qualsiasi modifica vera (updatedAt > 0) vince su quelle mai toccate.
export function defaultData() {
  const data = emptyData();
  DEFAULT_CATEGORIES.forEach(([type, name, color], i) => {
    data.categories.push({
      id: `default-${type}-${name.toLocaleLowerCase('it')}`, createdAt: 0, updatedAt: 0, deleted: false,
      name, type, color: PALETTE[color], budget: null,
      role: (type === 'entrata' && DEFAULT_ROLES[name]) || null, order: i,
    });
  });
  return data;
}

const fail = (msg, field) => { throw new ValidationError(msg, field); };
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const lower = (s) => String(s).trim().toLocaleLowerCase('it');

function cleanName(v, field = 'name') {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s.length < 1) fail('Inserisci un nome', field);
  if (s.length > 60) fail('Il nome può avere al massimo 60 caratteri', field);
  return s;
}

function cleanText(v, max, field, label) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string') fail(`${label} non valida`, field);
  const s = v.trim();
  if (s.length > max) fail(`${label}: al massimo ${max} caratteri`, field);
  return s;
}

function cleanColor(v) {
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v.toUpperCase();
  fail('Colore non valido', 'color');
}

function cleanInt(v, field, { min = -Infinity, nonZero = false, label = 'Importo' } = {}) {
  if (!Number.isSafeInteger(v)) fail(`${label} non valido`, field);
  if (v < min) fail(min > 0 ? `${label}: deve essere maggiore di zero` : `${label} non valido`, field);
  if (nonZero && v === 0) fail(`${label}: non può essere zero`, field);
  return v;
}

function cleanDate(v, field, label = 'Data') {
  if (!isValidISO(v)) fail(`${label} non valida`, field);
  return v;
}

function uniqueName(list, rec, sameGroup = () => true) {
  const n = lower(rec.name);
  if (list.some((x) => !x.deleted && x.id !== rec.id && sameGroup(x) && lower(x.name) === n)) {
    fail('Esiste già un elemento con questo nome', 'name');
  }
}

// Riferimento a un conto o categoria: se cambia, deve puntare a un elemento esistente e non eliminato.
function checkRef(list, id, prevId, field, label) {
  if (typeof id !== 'string' || !id) fail(`Scegli ${label}`, field);
  const found = list.find((x) => x.id === id);
  if (id === prevId) return found || null;
  if (!found || found.deleted) fail(`Scegli ${label}`, field);
  return found;
}

// Busta paga (v2, campi facoltativi sull'entrata): ogni valore in centesimi ≥ 0 oppure null.
// Il lordo della v1 (`gross`) resta dov'è e vale come "Competenze lorde (Totale competenze)".
export const PAYSLIP_FIELDS = {
  contributions: 'Contributi',
  taxable: 'Imponibile fiscale',
  irpef: 'IRPEF trattenuta',
  pension: 'Contributi fondo pensione',
  deductions: 'Detrazioni',
};

function cleanPayslip(input) {
  if (!isObj(input)) return null;
  const out = {};
  let any = false;
  for (const [k, label] of Object.entries(PAYSLIP_FIELDS)) {
    const v = input[k];
    if (v === null || v === undefined) { out[k] = null; continue; }
    out[k] = cleanInt(v, 'ps-' + k, { min: 0, label });
    any = true;
  }
  return any ? out : null;
}

// Accantonamenti per mese degli obiettivi: { 'YYYY-MM': centesimi con segno }.
function cleanGoalLog(v) {
  const out = {};
  if (!isObj(v)) return out;
  for (const [k, n] of Object.entries(v)) {
    if (/^\d{4}-\d{2}$/.test(k) && Number.isSafeInteger(n)) out[k] = n;
  }
  return out;
}

// Icona scelta per conti e categorie (v4): un nome di PICK_ICONS; un nome sconosciuto diventa null.
const cleanIcon = (v) => (typeof v === 'string' && PICK_ICONS.includes(v) ? v : null);

// Conto deposito senza vincoli (v4): data di inizio, ritenuta e tassi annui lordi per data, in punti base.
function cleanDeposit(v, kind) {
  if (v === null || v === undefined) return null;
  if (kind !== 'eur') fail('Il deposito vale solo per i conti in euro', 'deposit');
  if (!isObj(v)) fail('Deposito non valido', 'deposit');
  const start = cleanDate(v.start, 'deposit-start', 'Data di inizio');
  const wb = v.withholdingBp ?? 2600;
  if (!Number.isSafeInteger(wb) || wb < 0 || wb > 10000) fail('Ritenuta: da 0 a 100 %', 'deposit-withholding');
  if (!Array.isArray(v.rates) || !v.rates.length) fail('Inserisci il tasso annuo', 'deposit-rate');
  const rates = v.rates.map((r) => {
    if (!isObj(r)) fail('Tasso non valido', 'deposit-rate');
    const from = cleanDate(r.from, 'deposit-rate', 'Data del tasso');
    if (!Number.isSafeInteger(r.rateBp) || r.rateBp < 1 || r.rateBp > 2000) fail('Tasso annuo: da 0,01 a 20 %', 'deposit-rate');
    return { from, rateBp: r.rateBp };
  }).sort((a, b) => a.from.localeCompare(b.from));
  if (rates[0].from !== start) fail('Il primo tasso deve partire dalla data di inizio', 'deposit-rate');
  if (rates.some((r, i) => i > 0 && r.from === rates[i - 1].from)) fail('Due tassi con la stessa data', 'deposit-rate');
  return { start, withholdingBp: wb, rates };
}

// Nome di una persona (spesa divisa, restituzione): 1–40 caratteri.
function cleanPerson(v, field) {
  const p = typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
  if (p.length < 1) fail('Inserisci il nome', field);
  if (p.length > 40) fail('Il nome può avere al massimo 40 caratteri', field);
  return p;
}

// Spesa divisa tra più persone (v4): [{ person, amount }], al massimo 20, nomi unici senza maiuscole. null se vuota.
function cleanSplit(v) {
  if (v === null || v === undefined) return null;
  if (!Array.isArray(v)) fail('Persone non valide', 'split');
  if (!v.length) return null;
  if (v.length > 20) fail('Al massimo 20 persone', 'split');
  const seen = new Set();
  return v.map((it, i) => {
    if (!isObj(it)) fail('Persone non valide', 'split');
    const person = cleanPerson(it.person, 'split-' + i);
    const k = lower(person);
    if (seen.has(k)) fail(`${person} compare due volte`, 'split-' + i);
    seen.add(k);
    return { person, amount: cleanInt(it.amount, 'split-' + i, { min: 1, label: 'Quota' }) };
  });
}

const unitOf = (acc) => (acc ? (acc.kind === 'crypto' ? 'crypto:' + acc.asset : 'eur') : null);

// Totale restituito per una spesa, escludendo eventualmente una restituzione.
function refundedTotal(state, expenseId, exceptId) {
  let t = 0;
  for (const m of state.movements) {
    if (!m.deleted && m.type === 'restituzione' && m.refundOf === expenseId && m.id !== exceptId) t += m.amount;
  }
  return t;
}

// Restituito da una persona (nome senza maiuscole; null = restituzioni senza nome).
function refundedBy(state, expenseId, person, exceptId) {
  const k = person === null ? null : lower(person);
  let t = 0;
  for (const m of state.movements) {
    if (m.deleted || m.type !== 'restituzione' || m.refundOf !== expenseId || m.id === exceptId) continue;
    const mk = m.person ? lower(m.person) : null;
    if (mk === k) t += m.amount;
  }
  return t;
}

const splitSum = (split) => (split || []).reduce((t, x) => t + x.amount, 0);

// ---- ETF (v5) ----
// Valori di 1 quota scritti a mano ("Aggiorna valore"): [{ date, price }] con price in unità da 1e-4 €,
// ordinati per data, una sola voce per data (l'ultima scritta vince).
function cleanPrices(v) {
  if (v === null || v === undefined) return [];
  if (!Array.isArray(v)) fail('Valori non validi', 'price');
  const byDate = new Map();
  for (const p of v) {
    if (!isObj(p)) fail('Valore non valido (es. 58,50)', 'price');
    const date = cleanDate(p.date, 'date');
    byDate.set(date, { date, price: cleanInt(p.price, 'price', { min: 1, label: 'Valore' }) });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

const cleanRegime = (v) => (v === 'dichiarativo' ? 'dichiarativo' : 'amministrato');

// Compra/Vendi dello stesso ETF nell'ordine in cui contano: data, poi momento di creazione.
const etfOpOrder = (a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? Infinity) - (b.createdAt ?? Infinity);
const etfDelta = (m) => (m.trade === 'compra' ? m.amountTo : m.trade === 'vendi' ? -m.amount : 0);

// Risposta 7 dell'utente: una vendita non può superare le quote possedute a quella data, né far scendere
// sotto zero le quote in una data successiva (vendita retrodatata). N = il minimo delle quote possedute
// dalla posizione della vendita in poi, calcolato senza la vendita stessa.
function checkEtfSale(state, rec, prev) {
  const ops = state.movements
    .filter((m) => !m.deleted && m.etfId === rec.etfId && m.type === 'trasferimento' && m.id !== prev?.id && (m.trade === 'compra' || m.trade === 'vendi'))
    .map((m) => ({ date: m.date, createdAt: m.createdAt, delta: etfDelta(m), self: false }));
  ops.push({ date: rec.date, createdAt: prev ? prev.createdAt : Infinity, delta: 0, self: true });
  ops.sort(etfOpOrder);
  let qty = 0;
  let available = null;
  for (const op of ops) {
    qty += op.delta;
    if (op.self) available = qty;
    else if (available !== null) available = Math.min(available, qty);
  }
  if (rec.amount > available) {
    const n = Math.max(0, available);
    fail(`Puoi vendere al massimo ${formatQty(n)} ${n === QTY_UNIT ? 'quota' : 'quote'}`, 'amount');
  }
}

// Movimenti collegati a un ETF (`etfId`): Compra/Vendi (trasferimento con `trade`) e dividendo (entrata).
// Compra: dal conto in euro (accountId) all'ETF (toAccountId = etfId), amount = euro pagati, amountTo = quote.
// Vendi: dall'ETF (accountId = etfId) al conto in euro, amount = quote, amountTo = euro arrivati sul conto
// (al netto della tassa trattenuta in regime Amministrato), tax = tassa (trattenuta o da pagare).
// price = prezzo di 1 quota in unità da 1e-4 €. Un telefono in v4 vede il saldo in euro giusto e ignora l'ETF.
function etfMovement(input, prev, state, rec) {
  const etf = (state.investments || []).find((x) => x.id === input.etfId);
  if (!etf || (etf.deleted && input.etfId !== prev?.etfId)) fail('Scegli un ETF', 'etfId');
  rec.etfId = input.etfId;
  rec.taxRegime = cleanRegime(input.taxRegime);
  const eurRef = (id, prevId, field) => {
    const a = checkRef(state.accounts, id, prevId, field, 'un conto in euro');
    if (a && a.kind !== 'eur') fail('Scegli un conto in euro', field);
    return id;
  };
  if (rec.type === 'trasferimento') {
    if (input.trade !== 'compra' && input.trade !== 'vendi') fail('Operazione non valida', 'trade');
    rec.trade = input.trade;
    rec.price = cleanInt(input.price, 'price', { min: 1, label: 'Prezzo' });
    if (rec.trade === 'compra') {
      rec.accountId = eurRef(input.accountId, prev?.accountId, 'accountId');
      if (input.toAccountId !== rec.etfId) fail('Compra: dal conto in euro all\'ETF', 'toAccountId');
      rec.toAccountId = rec.etfId;
      rec.amountTo = cleanInt(input.amountTo, 'amountTo', { min: 1, label: 'Quote' });
      rec.tax = null;
    } else {
      if (input.accountId !== rec.etfId) fail('Vendi: dall\'ETF al conto in euro', 'accountId');
      rec.accountId = rec.etfId;
      rec.toAccountId = eurRef(input.toAccountId, prev?.toAccountId, 'toAccountId');
      rec.amountTo = cleanInt(input.amountTo ?? 0, 'amountTo', { min: 0, label: 'Importo' });
      rec.tax = cleanInt(input.tax ?? 0, 'tax', { min: 0, label: 'Tasse' });
      checkEtfSale(state, rec, prev);
    }
    return rec;
  }
  if (rec.type === 'entrata') {
    rec.accountId = eurRef(input.accountId, prev?.accountId, 'accountId');
    const cat = checkRef(state.categories, input.categoryId, prev?.categoryId, 'categoryId', 'una categoria');
    if (cat && cat.type !== 'entrata') fail('Scegli una categoria di entrata', 'categoryId');
    rec.categoryId = input.categoryId;
    rec.tax = input.tax === null || input.tax === undefined ? null : cleanInt(input.tax, 'tax', { min: 0, label: 'Tasse' });
    return rec;
  }
  return fail('Movimento ETF non valido', 'type');
}

const VALIDATORS = {
  account(input, prev, state) {
    const kind = input.kind === 'crypto' ? 'crypto' : input.kind === 'eur' ? 'eur' : fail('Scegli il tipo di conto', 'kind');
    const rec = {
      name: cleanName(input.name),
      kind,
      asset: null,
      initial: cleanInt(input.initial ?? 0, 'initial', { label: 'Saldo iniziale' }),
      color: cleanColor(input.color),
      order: Number.isSafeInteger(input.order) ? input.order : 0,
      icon: cleanIcon(input.icon),
      deposit: cleanDeposit(input.deposit, kind),
      // v6 (facoltativo, assente nei dati v1–v5): valori di 1 unità crypto scritti a mano ("Aggiorna valore"),
      // [{ date, price }] con price in centesimi per 1 unità intera; null per i conti in euro.
      prices: kind === 'crypto' ? cleanPrices(input.prices) : null,
    };
    if (kind === 'crypto') {
      const a = typeof input.asset === 'string' ? input.asset.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{1,10}$/.test(a)) fail('Simbolo crypto: da 1 a 10 lettere o cifre (es. BTC)', 'asset');
      rec.asset = a;
    }
    if (prev && unitOf(prev) !== unitOf(rec)) {
      const used = state.movements.some((m) => !m.deleted && (m.accountId === prev.id || m.toAccountId === prev.id));
      if (used) fail('Il conto ha già dei movimenti: non puoi cambiare tipo o simbolo', 'kind');
      // I valori scritti a mano sono di 1 unità del vecchio simbolo: con un simbolo nuovo non valgono più.
      if (kind === 'crypto') rec.prices = [];
    }
    uniqueName(state.accounts, { ...rec, id: prev?.id });
    return rec;
  },

  category(input, prev, state) {
    const type = prev ? prev.type : input.type;
    if (type !== 'uscita' && type !== 'entrata') fail('Tipo di categoria non valido', 'type');
    const rec = {
      name: cleanName(input.name),
      type,
      color: cleanColor(input.color),
      budget: null,
      role: ['stipendio', 'interessi', 'dividendi'].includes(input.role) ? input.role : null,
      order: Number.isSafeInteger(input.order) ? input.order : 0,
      icon: cleanIcon(input.icon),
    };
    if (input.budget !== null && input.budget !== undefined) {
      if (type !== 'uscita') fail('Il budget vale solo per le categorie di uscita', 'budget');
      rec.budget = cleanInt(input.budget, 'budget', { min: 1, label: 'Budget' });
    }
    uniqueName(state.categories, { ...rec, id: prev?.id }, (x) => x.type === type);
    return rec;
  },

  movement(input, prev, state) {
    // In modifica uscita, entrata e trasferimento possono scambiarsi il tipo; restituzioni e variazioni restano del loro tipo.
    let type = prev ? prev.type : input.type;
    if (prev && input.type !== prev.type && SCHEDULED_TYPES.includes(prev.type) && SCHEDULED_TYPES.includes(input.type)) {
      if (prev.type === 'uscita' && refundedTotal(state, prev.id) > 0) {
        fail('Questa spesa ha restituzioni collegate: per cambiarne il tipo elimina prima le restituzioni', 'type');
      }
      type = input.type;
    }
    if (!MOVEMENT_TYPES.includes(type)) fail('Tipo di movimento non valido', 'type');
    // Rettifica "Allinea al saldo reale" (v4): variazione su un conto deposito, scritta solo dal motore degli interessi.
    const align = type === 'variazione' && isObj(input.align) && Number.isSafeInteger(input.align.balance) ? { balance: input.align.balance } : null;
    const rec = {
      type,
      date: cleanDate(input.date, 'date'),
      amount: type === 'variazione'
        ? cleanInt(input.amount, 'amount', { nonZero: !align, label: 'Quantità' })
        : cleanInt(input.amount, 'amount', { min: 1 }),
      accountId: null, toAccountId: null, amountTo: null, categoryId: null,
      description: cleanText(input.description, 80, 'description', 'Descrizione'),
      note: cleanText(input.note, 500, 'note', 'Nota'),
      excluded: 0, refundOf: null, gross: null,
      trade: null, price: null, payslip: null,
      scheduledId: typeof input.scheduledId === 'string' ? input.scheduledId : null,
      occurrence: isValidISO(input.occurrence) ? input.occurrence : null,
      split: null, person: null, interest: null, align: null, importKey: null,
      etfId: null, tax: null, taxRegime: null,
    };
    if (typeof input.etfId === 'string' && input.etfId) return etfMovement(input, prev, state, rec);
    const acc = checkRef(state.accounts, input.accountId, prev?.accountId, 'accountId', 'un conto');
    rec.accountId = input.accountId;
    if (acc && ['uscita', 'entrata', 'restituzione'].includes(type) && acc.kind !== 'eur') {
      fail('Uscite, entrate e restituzioni si registrano solo su conti in euro', 'accountId');
    }
    if (acc && type === 'variazione' && acc.kind !== 'crypto' && !align) fail('La variazione di quantità vale solo per i conti crypto', 'accountId');
    if (align && acc && acc.kind === 'eur') rec.align = align;
    if ((type === 'uscita' || type === 'entrata') && input.importKey !== null && input.importKey !== undefined && input.importKey !== '') {
      if (typeof input.importKey !== 'string' || input.importKey.length > 120) fail('Chiave di importazione non valida', 'importKey');
      rec.importKey = input.importKey;
    }
    if (type === 'entrata' && isObj(input.interest) && typeof input.interest.accountId === 'string' && /^\d{4}-\d{2}$/.test(input.interest.month)) {
      rec.interest = { accountId: input.interest.accountId, month: input.interest.month };
    }

    if (type === 'uscita' || type === 'entrata') {
      const cat = checkRef(state.categories, input.categoryId, prev?.categoryId, 'categoryId', 'una categoria');
      if (cat && cat.type !== type) fail('Scegli una categoria adatta al tipo di movimento', 'categoryId');
      rec.categoryId = input.categoryId;
    }
    if (type === 'uscita') {
      // Spesa divisa (v4): la quota esclusa è la somma delle quote delle persone.
      rec.split = cleanSplit(input.split);
      rec.excluded = rec.split ? splitSum(rec.split) : cleanInt(input.excluded ?? 0, 'excluded', { min: 0, label: 'Quota esclusa' });
      if (rec.excluded > rec.amount) fail(rec.split ? "Le quote delle persone non possono superare l'importo" : "La quota esclusa non può superare l'importo", rec.split ? 'split' : 'excluded');
      const refunded = prev ? refundedTotal(state, prev.id) : 0;
      if (rec.split && prev) {
        // Nessuna persona può scendere sotto quanto ha già restituito (anche chi viene tolto dall'elenco).
        const names = new Map(rec.split.map((x, i) => [lower(x.person), i]));
        for (const m of state.movements) {
          if (m.deleted || m.type !== 'restituzione' || m.refundOf !== prev.id || !m.person) continue;
          const i = names.get(lower(m.person));
          const share = i === undefined ? 0 : rec.split[i].amount;
          const by = refundedBy(state, prev.id, m.person);
          if (by > share) fail(`${m.person} ha già restituito ${formatEuro(by)}: la sua quota non può essere minore`, i === undefined ? 'split' : 'split-' + i);
        }
      }
      if (rec.excluded < refunded) fail(`Sono già stati restituiti ${formatEuro(refunded)}: la quota esclusa non può essere minore`, rec.split ? 'split' : 'excluded');
    }
    if (type === 'entrata' && input.gross !== null && input.gross !== undefined) {
      rec.gross = cleanInt(input.gross, 'gross', { min: 1, label: 'Competenze lorde' });
    }
    if (type === 'entrata') rec.payslip = cleanPayslip(input.payslip);
    if (type === 'trasferimento') {
      const to = checkRef(state.accounts, input.toAccountId, prev?.toAccountId, 'toAccountId', 'il conto di arrivo');
      if (input.toAccountId === input.accountId) fail('Scegli due conti diversi', 'toAccountId');
      rec.toAccountId = input.toAccountId;
      if (acc && to && unitOf(acc) !== unitOf(to)) {
        rec.amountTo = cleanInt(input.amountTo, 'amountTo', { min: 1, label: 'Importo ricevuto' });
      }
      // Compra/Vendi (v2): un trasferimento euro↔crypto con il prezzo unitario (centesimi per 1 unità intera).
      if (input.trade === 'compra' || input.trade === 'vendi') {
        const buy = input.trade === 'compra';
        const ok = acc && to && (buy ? acc.kind === 'eur' && to.kind === 'crypto' : acc.kind === 'crypto' && to.kind === 'eur');
        if (!ok) fail(buy ? 'Compra: dal conto in euro al conto crypto' : 'Vendi: dal conto crypto al conto in euro', 'accountId');
        rec.trade = input.trade;
        rec.price = cleanInt(input.price, 'price', { min: 1, label: 'Prezzo' });
      }
    }
    if (type === 'restituzione') {
      const exp = state.movements.find((m) => m.id === input.refundOf);
      if (!exp || exp.type !== 'uscita' || (exp.deleted && input.refundOf !== prev?.refundOf)) {
        fail('La spesa collegata non esiste più', 'refundOf');
      }
      rec.refundOf = input.refundOf;
      const named = typeof input.person === 'string' && input.person.trim() ? cleanPerson(input.person, 'person') : null;
      const split = Array.isArray(exp.split) && exp.split.length ? exp.split : null;
      if (named && split) {
        const share = split.find((x) => lower(x.person) === lower(named));
        if (!share) fail('Scegli una delle persone della spesa', 'person');
        rec.person = share.person;
      } else rec.person = named;
      if (!exp.deleted) {
        const residual = (exp.excluded || 0) - refundedTotal(state, exp.id, prev?.id);
        if (rec.amount > residual) fail(`Puoi registrare al massimo ${formatEuro(residual)}`, 'amount');
        if (split) {
          // Residuo della persona scelta, oppure della parte senza nome (quota esclusa − somma delle quote).
          const share = rec.person ? split.find((x) => lower(x.person) === lower(rec.person)).amount : Math.max(0, exp.excluded - splitSum(split));
          const left = share - refundedBy(state, exp.id, rec.person, prev?.id);
          if (rec.amount > left) fail(`${rec.person ? rec.person + ': puoi' : 'Puoi'} registrare al massimo ${formatEuro(Math.max(0, left))}`, 'amount');
        }
      }
    }
    return rec;
  },

  scheduled(input, prev, state) {
    const type = input.type;
    if (!SCHEDULED_TYPES.includes(type)) fail('Tipo non valido', 'type');
    const rec = {
      type,
      amount: cleanInt(input.amount, 'amount', { min: 1 }),
      accountId: input.accountId, toAccountId: null, amountTo: null, categoryId: null,
      description: cleanText(input.description, 80, 'description', 'Descrizione'),
      start: cleanDate(input.start, 'start', 'Data di inizio'),
      freq: FREQS.includes(input.freq) ? input.freq : fail('Scegli la frequenza', 'freq'),
      interval: null,
      end: null,
      handled: isObj(input.handled) ? { ...input.handled } : (prev?.handled ? { ...prev.handled } : {}),
    };
    const acc = checkRef(state.accounts, input.accountId, prev?.accountId, 'accountId', 'un conto');
    if (acc && type !== 'trasferimento' && acc.kind !== 'eur') fail('Uscite ed entrate si programmano solo su conti in euro', 'accountId');
    if (type !== 'trasferimento') {
      const cat = checkRef(state.categories, input.categoryId, prev?.categoryId, 'categoryId', 'una categoria');
      if (cat && cat.type !== type) fail('Scegli una categoria adatta al tipo', 'categoryId');
      rec.categoryId = input.categoryId;
    } else {
      const to = checkRef(state.accounts, input.toAccountId, prev?.toAccountId, 'toAccountId', 'il conto di arrivo');
      if (input.toAccountId === input.accountId) fail('Scegli due conti diversi', 'toAccountId');
      rec.toAccountId = input.toAccountId;
      if (acc && to && unitOf(acc) !== unitOf(to)) rec.amountTo = cleanInt(input.amountTo, 'amountTo', { min: 1, label: 'Importo ricevuto' });
    }
    if (rec.freq === 'months') {
      if (!Number.isSafeInteger(input.interval) || input.interval < 2 || input.interval > 24) fail('Ogni quanti mesi: da 2 a 24', 'interval');
      rec.interval = input.interval;
    }
    if (input.end) {
      rec.end = cleanDate(input.end, 'end', 'Data di fine');
      if (rec.end < rec.start) fail("La data di fine è prima dell'inizio", 'end');
    }
    return rec;
  },

  goal(input, prev, state) {
    const rec = {
      name: cleanName(input.name),
      target: cleanInt(input.target, 'target', { min: 1, label: 'Obiettivo' }),
      saved: cleanInt(input.saved ?? 0, 'saved', { min: 0, label: 'Messo da parte' }),
      deadline: input.deadline ? cleanDate(input.deadline, 'deadline', 'Scadenza') : null,
      color: cleanColor(input.color),
      monthly: input.monthly === null || input.monthly === undefined ? null : cleanInt(input.monthly, 'monthly', { min: 1, label: 'Quota mensile' }),
      log: cleanGoalLog(input.log),
    };
    uniqueName(state.goals, { ...rec, id: prev?.id });
    return rec;
  },

  // ETF (v5): nome, ISIN o sigla facoltativi, aliquota (punti base, predefinita 26 %), regime, valori scritti a mano.
  investment(input, prev, state) {
    const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
    if (code && !/^[A-Z0-9.-]{1,20}$/.test(code)) fail('Solo lettere, numeri, punto e trattino (massimo 20)', 'code');
    const rate = input.taxRateBp ?? DEFAULT_TAX_RATE_BP;
    if (!Number.isSafeInteger(rate) || rate < 0 || rate > 10000) fail("Scrivi un'aliquota tra 0 e 100 (es. 26)", 'taxRateBp');
    const rec = {
      name: cleanName(input.name),
      code: code || null,
      color: cleanColor(input.color),
      order: Number.isSafeInteger(input.order) ? input.order : 0,
      taxRateBp: rate,
      taxRegime: cleanRegime(input.taxRegime),
      prices: cleanPrices(input.prices),
    };
    const n = lower(rec.name);
    if ((state.investments || []).some((x) => !x.deleted && x.id !== prev?.id && lower(x.name) === n)) fail('Esiste già un ETF con questo nome', 'name');
    return rec;
  },
};

const cloneState = (s) => ({ ...s, accounts: [...s.accounts], categories: [...s.categories], movements: [...s.movements], scheduled: [...s.scheduled], goals: [...s.goals], investments: [...(s.investments || [])] });

const validRecords = (list) => list.filter((r) => isObj(r) && typeof r.id === 'string' && r.id);

// Normalizza un dato letto (localStorage o backup) senza scartare campi sconosciuti.
// `collections`: per `moneyflow:data` solo le 5 raccolte v1–v4; per un backup anche `investments` (v5).
export function normalizeData(raw, collections = Object.values(KINDS)) {
  if (!isObj(raw) || raw.app !== APP) return null;
  const out = { ...raw };
  for (const col of collections) {
    const list = raw[col] === undefined ? [] : raw[col];
    if (!Array.isArray(list)) return null;
    out[col] = validRecords(list);
  }
  if (!Number.isSafeInteger(out.schemaVersion)) out.schemaVersion = SCHEMA_VERSION;
  // Punto di migrazione: qui si convertiranno le versioni vecchie quando lo schema cambierà.
  return out;
}

export function createStore({ storage, now = () => Date.now(), uuid = () => crypto.randomUUID(), key = DATA_KEY, investKey = INVEST_KEY } = {}) {
  let state;
  let corrupted = null;
  // ETF letti da un `moneyflow:data` vecchio (backup v5 importato in una v4) e non ancora scritti nella chiave nuova.
  let investPending = false;
  const listeners = new Set();

  // `moneyflow:data` senza `investments`, come lo scrive la v4.
  const dataOf = (s) => { const { investments, ...rest } = s; return rest; };
  const investOf = (s) => ({ app: APP, schemaVersion: SCHEMA_VERSION, investments: s.investments || [] });

  // Salva solo le chiavi toccate (`keys` della modifica; null = tutto). Se la seconda scrittura fallisce
  // si rimette il valore precedente della prima: lo stato resta invariato e arriva StorageError.
  function persist(next, keys = null) {
    const inv = keys === null || investPending || keys.some((k) => k.startsWith('investment_'));
    const data = keys === null || keys.some((k) => !k.startsWith('investment_'));
    let before = null;
    try {
      if (data) {
        if (inv) { try { before = storage.getItem(key); } catch { before = null; } }
        storage.setItem(key, JSON.stringify(dataOf(next)));
      }
    } catch (e) {
      throw new StorageError();
    }
    try {
      if (inv) storage.setItem(investKey, JSON.stringify(investOf(next)));
    } catch (e) {
      if (data) {
        try { if (before === null) storage.removeItem(key); else storage.setItem(key, before); } catch { /* resta il valore nuovo: si ricarica alla prossima apertura */ }
      }
      throw new StorageError();
    }
    if (inv) investPending = false;
  }

  function loadInvestments(legacy) {
    let raw = null;
    try { raw = storage.getItem(investKey); } catch { raw = null; }
    if (raw === null) {
      if (Array.isArray(legacy)) { investPending = true; return validRecords(legacy); }
      return [];
    }
    try {
      const o = JSON.parse(raw);
      if (isObj(o) && o.app === APP && Array.isArray(o.investments)) return validRecords(o.investments);
    } catch { /* sotto: copia grezza e ripartenza */ }
    const ck = `${investKey}:corrupt-${now()}`;
    try { storage.setItem(ck, raw); } catch { /* niente spazio: il valore resta sotto la chiave originale fino al prossimo salvataggio */ }
    corrupted = ck;
    return [];
  }

  function load() {
    investPending = false;
    let raw = null;
    try { raw = storage.getItem(key); } catch { raw = null; }
    if (raw === null) {
      state = { ...defaultData(), investments: loadInvestments(null) };
      try { storage.setItem(key, JSON.stringify(dataOf(state))); } catch { /* resta in memoria finché non c'è spazio */ }
      return;
    }
    let parsed = null;
    try { parsed = normalizeData(JSON.parse(raw), DATA_COLLECTIONS); } catch { parsed = null; }
    if (parsed) {
      const legacy = parsed.investments;
      delete parsed.investments;
      state = { ...parsed, investments: loadInvestments(legacy) };
      return;
    }
    const ck = `${key}:corrupt-${now()}`;
    try { storage.setItem(ck, raw); } catch { /* niente spazio: il valore resta comunque sotto la chiave originale fino al prossimo salvataggio */ }
    corrupted = ck;
    state = { ...defaultData(), investments: loadInvestments(null) };
  }

  function notify(keys, source) {
    for (const fn of [...listeners]) fn({ keys, source });
  }

  function commit(next, keys, source = 'local') {
    persist(next, keys);
    state = next;
    notify(keys, source);
  }

  const stamp = (prev) => Math.max(now(), (prev?.updatedAt || 0) + 1);
  const col = (kind) => KINDS[kind] || fail('Tipo sconosciuto');

  function find(kind, id) {
    return state[col(kind)].find((r) => r.id === id) || null;
  }

  function add(kind, input) {
    const clean = VALIDATORS[kind](input || {}, null, state);
    const t = now();
    const rec = { id: uuid(), createdAt: t, updatedAt: t, deleted: false, ...clean };
    const next = cloneState(state);
    next[col(kind)].push(rec);
    commit(next, [`${kind}_${rec.id}`]);
    return rec;
  }

  function update(kind, id, patch) {
    const prev = find(kind, id);
    if (!prev) fail('Elemento non trovato');
    const merged = { ...prev, ...patch };
    const clean = VALIDATORS[kind](merged, prev, state);
    const rec = { ...prev, ...clean, id: prev.id, createdAt: prev.createdAt, deleted: prev.deleted, updatedAt: stamp(prev) };
    const next = cloneState(state);
    const list = next[col(kind)];
    list[list.findIndex((r) => r.id === id)] = rec;
    commit(next, [`${kind}_${id}`]);
    return rec;
  }

  function setDeleted(kind, id, deleted) {
    const prev = find(kind, id);
    if (!prev) fail('Elemento non trovato');
    if (!deleted) {
      // Il ripristino deve rispettare le stesse regole (nomi unici, quote restituite).
      VALIDATORS[kind]({ ...prev }, prev, state);
    }
    const rec = { ...prev, deleted, updatedAt: stamp(prev) };
    const next = cloneState(state);
    const list = next[col(kind)];
    list[list.findIndex((r) => r.id === id)] = rec;
    commit(next, [`${kind}_${id}`]);
    return rec;
  }

  function confirmOccurrence(schedId, date, overrides = {}) {
    return confirmMany(schedId, [{ date, overrides }])[0];
  }

  // Conferma una o più scadenze dello stesso programmato in un solo salvataggio: o tutte o nessuna.
  function confirmMany(schedId, items) {
    const s = find('scheduled', schedId);
    if (!s || s.deleted) fail('Pagamento programmato non trovato');
    const t = now();
    const handled = { ...(s.handled || {}) };
    const movs = items.map(({ date, overrides = {} }) => {
      const input = {
        type: s.type, date, amount: s.amount, accountId: s.accountId, toAccountId: s.toAccountId,
        amountTo: s.amountTo, categoryId: s.categoryId, description: s.description,
        ...overrides, scheduledId: s.id, occurrence: date,
      };
      const clean = VALIDATORS.movement(input, null, state);
      handled[date] = 'confermato';
      return { id: uuid(), createdAt: t, updatedAt: t, deleted: false, ...clean };
    });
    const next = cloneState(state);
    next.movements.push(...movs);
    next.scheduled[next.scheduled.findIndex((r) => r.id === s.id)] = { ...s, handled, updatedAt: stamp(s) };
    commit(next, [...movs.map((m) => `movement_${m.id}`), `scheduled_${s.id}`]);
    return movs;
  }

  function setHandled(schedId, date, value) {
    const s = find('scheduled', schedId);
    if (!s) fail('Pagamento programmato non trovato');
    const handled = { ...(s.handled || {}) };
    if (value) handled[date] = value; else delete handled[date];
    const next = cloneState(state);
    next.scheduled[next.scheduled.findIndex((r) => r.id === s.id)] = { ...s, handled, updatedAt: stamp(s) };
    commit(next, [`scheduled_${s.id}`]);
  }

  // Aggiungi/Togli a mano. Con una data valida il movimento entra anche nel mese (log) per la quota mensile.
  function adjustGoal(id, delta, date = null) {
    const g = find('goal', id);
    if (!g || g.deleted) fail('Obiettivo non trovato');
    if (!Number.isSafeInteger(delta) || delta === 0) fail('Importo non valido', 'amount');
    if (g.saved + delta < 0) fail('Non puoi togliere più di quanto hai messo da parte', 'amount');
    const patch = { saved: g.saved + delta };
    if (isValidISO(date)) {
      const log = cleanGoalLog(g.log);
      const ym = monthOf(date);
      log[ym] = (log[ym] || 0) + delta;
      patch.log = log;
    }
    return update('goal', id, patch);
  }

  // "Metti da parte" dopo lo stipendio: più obiettivi in un solo salvataggio, tutto o niente.
  function allocateGoals(items, date) {
    if (!isValidISO(date)) fail('Data non valida', 'date');
    if (!Array.isArray(items) || !items.length) fail('Scegli almeno un obiettivo');
    const ym = monthOf(date);
    const next = cloneState(state);
    const keys = [];
    const out = [];
    for (const { id, amount } of items) {
      const i = next.goals.findIndex((g) => g.id === id);
      const prev = i >= 0 ? next.goals[i] : null;
      if (!prev || prev.deleted) fail('Obiettivo non trovato', 'alloc-' + id);
      if (!Number.isSafeInteger(amount) || amount < 1) fail('Importo: deve essere maggiore di zero', 'alloc-' + id);
      const log = cleanGoalLog(prev.log);
      log[ym] = (log[ym] || 0) + amount;
      const rec = { ...prev, saved: prev.saved + amount, log, updatedAt: stamp(prev) };
      if (!Number.isSafeInteger(rec.saved)) fail('Importo non valido', 'alloc-' + id);
      next.goals[i] = rec;
      keys.push(`goal_${id}`);
      out.push(rec);
    }
    commit(next, keys);
    return out;
  }

  // Movimenti calcolati dall'app (interessi, rettifiche): id fissi decisi dal chiamante, un solo salvataggio.
  // records: [{ id, input, deleted }]. Un record da eliminare che esiste viene solo marcato deleted (contenuto invariato);
  // un record nuovo già eliminato si crea solo se valido (rettifiche con importo 0).
  // Nessun salvataggio e nessuna notifica se nulla cambia: così chi lo chiama da subscribe non crea cicli.
  // Categoria con ruolo (Interessi v4, Dividendi v5) con id fisso: creata se manca (nome alternativo se il nome
  // è già usato da un'altra entrata), ripristinata se eliminata. Restituisce le chiavi toccate.
  function ensureRoleCategory(next, role) {
    const def = ROLE_CATEGORIES[role];
    const i = next.categories.findIndex((c) => c.id === def.id);
    if (i < 0) {
      const t = now();
      const clash = next.categories.some((c) => !c.deleted && c.type === 'entrata' && lower(c.name) === lower(def.name));
      next.categories.push({
        id: def.id, createdAt: t, updatedAt: t, deleted: false, name: clash ? def.alt : def.name,
        type: 'entrata', color: def.color, budget: null, role, order: def.order, icon: null,
      });
      return [`category_${def.id}`];
    }
    if (next.categories[i].deleted) {
      next.categories[i] = { ...next.categories[i], deleted: false, updatedAt: stamp(next.categories[i]) };
      return [`category_${def.id}`];
    }
    return [];
  }

  // Foglio Dividendo (v5): assicura la categoria Dividendi; nessun salvataggio se c'è già.
  function ensureDividendCategory() {
    const next = cloneState(state);
    const keys = ensureRoleCategory(next, 'dividendi');
    if (keys.length) commit(next, keys);
    return DIVIDEND_CATEGORY_ID;
  }

  // "Aggiorna valore" (v5): aggiunge o sostituisce il valore di 1 quota di quella data.
  function setInvestmentPrice(id, date, price) {
    const etf = find('investment', id);
    if (!etf || etf.deleted) fail('ETF non trovato');
    if (!isValidISO(date)) fail('Data non valida', 'date');
    if (!Number.isSafeInteger(price) || price < 1) fail('Valore non valido (es. 58,50)', 'price');
    const prices = [...(etf.prices || []).filter((p) => p.date !== date), { date, price }];
    return update('investment', id, { prices });
  }

  // "Aggiorna valore" di un conto crypto (v6): aggiunge o sostituisce il valore di 1 unità di quella data
  // (centesimi per 1 unità intera, es. 1 BTC = 70.000,00 → 7000000).
  function setAccountPrice(id, date, price) {
    const acc = find('account', id);
    if (!acc || acc.deleted || acc.kind !== 'crypto') fail('Conto crypto non trovato');
    if (!isValidISO(date)) fail('Data non valida', 'date');
    if (!Number.isSafeInteger(price) || price < 1) fail('Valore non valido (es. 70.000,00)', 'price');
    const prices = [...(acc.prices || []).filter((p) => p.date !== date), { date, price }];
    return update('account', id, { prices });
  }

  function upsertDerived(records, { ensureCategory = false } = {}) {
    const next = cloneState(state);
    const keys = [];
    const t = now();
    if (ensureCategory) keys.push(...ensureRoleCategory(next, 'interessi'));
    for (const { id, input, deleted = false } of records) {
      const i = next.movements.findIndex((m) => m.id === id);
      const prev = i >= 0 ? next.movements[i] : null;
      if (deleted && prev) {
        if (prev.deleted) continue;
        next.movements[i] = { ...prev, deleted: true, updatedAt: stamp(prev) };
        keys.push(`movement_${id}`);
        continue;
      }
      const clean = VALIDATORS.movement(input, prev, next);
      if (prev) {
        const same = !prev.deleted && Object.entries(clean).every(([k, v]) => JSON.stringify(prev[k] ?? null) === JSON.stringify(v ?? null));
        if (same) continue;
        next.movements[i] = { ...prev, ...clean, deleted: false, updatedAt: stamp(prev) };
      } else {
        next.movements.push({ id, createdAt: t, updatedAt: t, deleted, ...clean });
      }
      keys.push(`movement_${id}`);
    }
    if (!keys.length) return 0;
    commit(next, keys);
    return keys.length;
  }

  // Più movimenti nuovi in un salvataggio (importazione CSV): o tutti o nessuno.
  function addMovements(inputs) {
    const next = cloneState(state);
    const t = now();
    const out = inputs.map((input) => {
      const rec = { id: uuid(), createdAt: t, updatedAt: t, deleted: false, ...VALIDATORS.movement(input || {}, null, next) };
      next.movements.push(rec);
      return rec;
    });
    if (!out.length) return out;
    commit(next, out.map((m) => `movement_${m.id}`));
    return out;
  }

  // Chiude il conto con una persona su tutte le spese divise aperte, in un salvataggio.
  // refund: una restituzione per spesa con il residuo della persona; writeoff: la quota scende a quanto ha già
  // restituito (se non ha restituito nulla la persona esce dall'elenco) e la quota esclusa di conseguenza.
  function settlePerson(name, { mode, accountId, date } = {}) {
    const k = lower(name || '');
    if (!k) fail('Persona non trovata');
    if (mode !== 'refund' && mode !== 'writeoff') fail('Operazione non valida');
    const next = cloneState(state);
    const keys = [];
    const t = now();
    for (const exp of state.movements) {
      if (exp.deleted || exp.type !== 'uscita' || !Array.isArray(exp.split)) continue;
      const share = exp.split.find((x) => lower(x.person) === k);
      if (!share) continue;
      const by = refundedBy(state, exp.id, share.person);
      const residual = share.amount - by;
      if (residual <= 0) continue;
      if (mode === 'refund') {
        const input = { type: 'restituzione', date, amount: residual, accountId, refundOf: exp.id, person: share.person };
        const rec = { id: uuid(), createdAt: t, updatedAt: t, deleted: false, ...VALIDATORS.movement(input, null, next) };
        next.movements.push(rec);
        keys.push(`movement_${rec.id}`);
      } else {
        const split = exp.split.map((x) => (x === share ? { ...x, amount: by } : x)).filter((x) => x.amount > 0);
        const i = next.movements.findIndex((m) => m.id === exp.id);
        const clean = VALIDATORS.movement({ ...exp, split, excluded: splitSum(split) }, exp, next);
        next.movements[i] = { ...exp, ...clean, updatedAt: stamp(exp) };
        keys.push(`movement_${exp.id}`);
      }
    }
    if (!keys.length) fail('Nessuna somma aperta con questa persona');
    commit(next, keys);
    return keys.length;
  }

  const allKeys = () => Object.entries(KINDS).flatMap(([kind, c]) => state[c].map((r) => `${kind}_${r.id}`));

  function replaceAll(data) {
    const norm = normalizeData(data);
    if (!norm) fail('Dati non validi');
    commit(norm, null, 'local');
    corrupted = null;
  }

  // Applica record arrivati dalla sync: vince updatedAt più recente; non segna nulla come da inviare.
  function applyRemote(items) {
    const next = cloneState(state);
    const keys = [];
    for (const { kind, record } of items) {
      const c = KINDS[kind];
      if (!c || !isObj(record) || typeof record.id !== 'string') continue;
      const list = next[c];
      const i = list.findIndex((r) => r.id === record.id);
      if (i < 0) list.push(record);
      else if ((record.updatedAt || 0) > (list[i].updatedAt || 0)) list[i] = record;
      else continue;
      keys.push(`${kind}_${record.id}`);
    }
    if (keys.length) commit(next, keys, 'remote');
    return keys.length;
  }

  function recordByKey(k) {
    const i = k.indexOf('_');
    const kind = k.slice(0, i);
    if (!KINDS[kind]) return null;
    return find(kind, k.slice(i + 1));
  }

  function reload() {
    load();
    notify(null, 'external');
  }

  load();

  const api = {
    getState: () => state,
    get corrupted() { return corrupted; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    find, add, update, allKeys, recordByKey, replaceAll, applyRemote, reload,
    remove: (kind, id) => setDeleted(kind, id, true),
    restore: (kind, id) => setDeleted(kind, id, false),
    confirmOccurrence,
    confirmAll: (id, dates) => confirmMany(id, dates.map((date) => ({ date }))),
    skipOccurrence: (id, date) => setHandled(id, date, 'saltato'),
    unhandleOccurrence: (id, date) => setHandled(id, date, null),
    adjustGoal, allocateGoals, upsertDerived, addMovements, settlePerson, ensureDividendCategory, setInvestmentPrice, setAccountPrice,
  };
  for (const kind of ['Account', 'Category', 'Movement', 'Scheduled', 'Goal', 'Investment']) {
    const k = kind.toLowerCase();
    api['add' + kind] = (input) => add(k, input);
    api['update' + kind] = (id, patch) => update(k, id, patch);
    api['delete' + kind] = (id) => setDeleted(k, id, true);
    api['restore' + kind] = (id) => setDeleted(k, id, false);
  }
  return api;
}

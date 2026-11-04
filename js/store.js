// Modello dati di MoneyFlow: validazione, CRUD con tombstone, persistenza sicura.
// Ogni modifica valida, prepara una copia, salva e solo alla fine notifica.

import { ValidationError, StorageError } from './errors.js';
import { isValidISO } from './dates.js';
import { formatEuro } from './money.js';

export { ValidationError, StorageError };

export const APP = 'MoneyFlow';
export const SCHEMA_VERSION = 1;
export const DATA_KEY = 'moneyflow:data';

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
};

export const MOVEMENT_TYPES = ['uscita', 'entrata', 'trasferimento', 'restituzione', 'variazione'];
export const SCHEDULED_TYPES = ['uscita', 'entrata', 'trasferimento'];
export const FREQS = ['once', 'weekly', 'monthly', 'months', 'yearly'];

const DEFAULT_CATEGORIES = [
  ['uscita', 'Casa', 0], ['uscita', 'Spesa', 7], ['uscita', 'Trasporti', 1], ['uscita', 'Bollette', 2],
  ['uscita', 'Abbonamenti', 4], ['uscita', 'Salute', 3], ['uscita', 'Svago', 5], ['uscita', 'Ristoranti', 8],
  ['uscita', 'Regali', 6], ['uscita', 'Altro', 11],
  ['entrata', 'Stipendio', 0], ['entrata', 'Rimborsi', 6], ['entrata', 'Altro', 11],
];

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
      role: type === 'entrata' && name === 'Stipendio' ? 'stipendio' : null, order: i,
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

const unitOf = (acc) => (acc ? (acc.kind === 'crypto' ? 'crypto:' + acc.asset : 'eur') : null);

// Totale restituito per una spesa, escludendo eventualmente una restituzione.
function refundedTotal(state, expenseId, exceptId) {
  let t = 0;
  for (const m of state.movements) {
    if (!m.deleted && m.type === 'restituzione' && m.refundOf === expenseId && m.id !== exceptId) t += m.amount;
  }
  return t;
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
    };
    if (kind === 'crypto') {
      const a = typeof input.asset === 'string' ? input.asset.trim().toUpperCase() : '';
      if (!/^[A-Z0-9]{1,10}$/.test(a)) fail('Simbolo crypto: da 1 a 10 lettere o cifre (es. BTC)', 'asset');
      rec.asset = a;
    }
    if (prev && unitOf(prev) !== unitOf(rec)) {
      const used = state.movements.some((m) => !m.deleted && (m.accountId === prev.id || m.toAccountId === prev.id));
      if (used) fail('Il conto ha già dei movimenti: non puoi cambiare tipo o simbolo', 'kind');
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
      role: input.role === 'stipendio' ? 'stipendio' : null,
      order: Number.isSafeInteger(input.order) ? input.order : 0,
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
    const rec = {
      type,
      date: cleanDate(input.date, 'date'),
      amount: type === 'variazione'
        ? cleanInt(input.amount, 'amount', { nonZero: true, label: 'Quantità' })
        : cleanInt(input.amount, 'amount', { min: 1 }),
      accountId: null, toAccountId: null, amountTo: null, categoryId: null,
      description: cleanText(input.description, 80, 'description', 'Descrizione'),
      note: cleanText(input.note, 500, 'note', 'Nota'),
      excluded: 0, refundOf: null, gross: null,
      scheduledId: typeof input.scheduledId === 'string' ? input.scheduledId : null,
      occurrence: isValidISO(input.occurrence) ? input.occurrence : null,
    };
    const acc = checkRef(state.accounts, input.accountId, prev?.accountId, 'accountId', 'un conto');
    rec.accountId = input.accountId;
    if (acc && ['uscita', 'entrata', 'restituzione'].includes(type) && acc.kind !== 'eur') {
      fail('Uscite, entrate e restituzioni si registrano solo su conti in euro', 'accountId');
    }
    if (acc && type === 'variazione' && acc.kind !== 'crypto') fail('La variazione di quantità vale solo per i conti crypto', 'accountId');

    if (type === 'uscita' || type === 'entrata') {
      const cat = checkRef(state.categories, input.categoryId, prev?.categoryId, 'categoryId', 'una categoria');
      if (cat && cat.type !== type) fail('Scegli una categoria adatta al tipo di movimento', 'categoryId');
      rec.categoryId = input.categoryId;
    }
    if (type === 'uscita') {
      rec.excluded = cleanInt(input.excluded ?? 0, 'excluded', { min: 0, label: 'Quota esclusa' });
      if (rec.excluded > rec.amount) fail("La quota esclusa non può superare l'importo", 'excluded');
      const refunded = prev ? refundedTotal(state, prev.id) : 0;
      if (rec.excluded < refunded) fail(`Sono già stati restituiti ${formatEuro(refunded)}: la quota esclusa non può essere minore`, 'excluded');
    }
    if (type === 'entrata' && input.gross !== null && input.gross !== undefined) {
      rec.gross = cleanInt(input.gross, 'gross', { min: 1, label: 'Lordo' });
    }
    if (type === 'trasferimento') {
      const to = checkRef(state.accounts, input.toAccountId, prev?.toAccountId, 'toAccountId', 'il conto di arrivo');
      if (input.toAccountId === input.accountId) fail('Scegli due conti diversi', 'toAccountId');
      rec.toAccountId = input.toAccountId;
      if (acc && to && unitOf(acc) !== unitOf(to)) {
        rec.amountTo = cleanInt(input.amountTo, 'amountTo', { min: 1, label: 'Importo ricevuto' });
      }
    }
    if (type === 'restituzione') {
      const exp = state.movements.find((m) => m.id === input.refundOf);
      if (!exp || exp.type !== 'uscita' || (exp.deleted && input.refundOf !== prev?.refundOf)) {
        fail('La spesa collegata non esiste più', 'refundOf');
      }
      rec.refundOf = input.refundOf;
      if (!exp.deleted) {
        const residual = (exp.excluded || 0) - refundedTotal(state, exp.id, prev?.id);
        if (rec.amount > residual) fail(`Puoi registrare al massimo ${formatEuro(residual)}`, 'amount');
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
    };
    uniqueName(state.goals, { ...rec, id: prev?.id });
    return rec;
  },
};

const cloneState = (s) => ({ ...s, accounts: [...s.accounts], categories: [...s.categories], movements: [...s.movements], scheduled: [...s.scheduled], goals: [...s.goals] });

// Normalizza un dato letto (localStorage o backup) senza scartare campi sconosciuti.
export function normalizeData(raw) {
  if (!isObj(raw) || raw.app !== APP) return null;
  const out = { ...raw };
  for (const col of Object.values(KINDS)) {
    const list = raw[col] === undefined ? [] : raw[col];
    if (!Array.isArray(list)) return null;
    out[col] = list.filter((r) => isObj(r) && typeof r.id === 'string' && r.id);
  }
  if (!Number.isSafeInteger(out.schemaVersion)) out.schemaVersion = SCHEMA_VERSION;
  // Punto di migrazione: qui si convertiranno le versioni vecchie quando lo schema cambierà.
  return out;
}

export function createStore({ storage, now = () => Date.now(), uuid = () => crypto.randomUUID(), key = DATA_KEY } = {}) {
  let state;
  let corrupted = null;
  const listeners = new Set();

  function persist(next) {
    try {
      storage.setItem(key, JSON.stringify(next));
    } catch (e) {
      throw new StorageError();
    }
  }

  function load() {
    let raw = null;
    try { raw = storage.getItem(key); } catch { raw = null; }
    if (raw === null) {
      state = defaultData();
      try { persist(state); } catch { /* resta in memoria finché non c'è spazio */ }
      return;
    }
    let parsed = null;
    try { parsed = normalizeData(JSON.parse(raw)); } catch { parsed = null; }
    if (parsed) { state = parsed; return; }
    const ck = `${key}:corrupt-${now()}`;
    try { storage.setItem(ck, raw); } catch { /* niente spazio: il valore resta comunque sotto la chiave originale fino al prossimo salvataggio */ }
    corrupted = ck;
    state = defaultData();
  }

  function notify(keys, source) {
    for (const fn of [...listeners]) fn({ keys, source });
  }

  function commit(next, keys, source = 'local') {
    persist(next);
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

  function adjustGoal(id, delta) {
    const g = find('goal', id);
    if (!g || g.deleted) fail('Obiettivo non trovato');
    if (!Number.isSafeInteger(delta) || delta === 0) fail('Importo non valido', 'amount');
    if (g.saved + delta < 0) fail('Non puoi togliere più di quanto hai messo da parte', 'amount');
    return update('goal', id, { saved: g.saved + delta });
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
    adjustGoal,
  };
  for (const kind of ['Account', 'Category', 'Movement', 'Scheduled', 'Goal']) {
    const k = kind.toLowerCase();
    api['add' + kind] = (input) => add(k, input);
    api['update' + kind] = (id, patch) => update(k, id, patch);
    api['delete' + kind] = (id) => setDeleted(k, id, true);
    api['restore' + kind] = (id) => setDeleted(k, id, false);
  }
  return api;
}

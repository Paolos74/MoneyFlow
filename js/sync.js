// Sincronizzazione facoltativa con Firebase via REST (Identity Toolkit, Secure Token, Firestore).
// Vince la modifica più recente (updatedAt); push a blocchi di 250; pull a pagine con cursore.

import { FIREBASE_CONFIG } from './firebase-config.js';

export const SYNC_KEY = 'moneyflow:sync';
const PAGE = 300;
const BATCH = 250;
const DEBOUNCE_MS = 5000;

export class SyncError extends Error {
  constructor(message, code = 'error') {
    super(message);
    this.name = 'SyncError';
    this.code = code;
  }
}

const MSG = {
  network: 'Impossibile raggiungere Firebase. Controlla la connessione e riprova.',
  credentials: 'Email o password non corrette',
  apiKey: 'API key non valida: controlla la configurazione Firebase',
  tooMany: 'Troppi tentativi: riprova tra qualche minuto',
  server: 'Firebase non risponde, riprova più tardi',
  expired: 'Sessione scaduta: accedi di nuovo. Le modifiche sul telefono restano salvate.',
  disabled: 'Questo utente è disattivato in Firebase',
  denied: 'Accesso negato da Firestore: controlla le regole del database',
  notFound: 'Database Firestore non trovato: controlla il Project ID e che il database esista',
  notConfigured: 'Inserisci API key e Project ID',
  signedOut: 'Accedi per sincronizzare',
};

// Traduce una risposta di errore di Firebase in un messaggio italiano.
export function mapError(status, body, service) {
  const msg = String(body?.error?.message || body?.error_description || '');
  const code = msg.split(/[ :]/)[0];
  if (/API key not valid|API_KEY_INVALID|API_KEY_NOT_VALID/i.test(msg) || body?.error?.details?.some?.((d) => d?.reason === 'API_KEY_INVALID')) return new SyncError(MSG.apiKey, 'apiKey');
  if (code === 'TOO_MANY_ATTEMPTS_TRY_LATER' || status === 429) return new SyncError(MSG.tooMany, 'tooMany');
  if (['INVALID_PASSWORD', 'EMAIL_NOT_FOUND', 'INVALID_LOGIN_CREDENTIALS', 'INVALID_EMAIL', 'MISSING_PASSWORD'].includes(code)) return new SyncError(MSG.credentials, 'credentials');
  if (code === 'USER_DISABLED') return new SyncError(MSG.disabled, service === 'token' ? 'expired' : 'disabled');
  if (service === 'token' && ['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_NOT_FOUND', 'INVALID_GRANT_TYPE', 'MISSING_REFRESH_TOKEN'].includes(code)) return new SyncError(MSG.expired, 'expired');
  if (status >= 500) return new SyncError(MSG.server, 'server');
  if (service === 'firestore' && status === 401) return new SyncError(MSG.expired, 'unauth');
  if (service === 'firestore' && status === 403) return new SyncError(MSG.denied, 'denied');
  if (service === 'firestore' && status === 404) return new SyncError(MSG.notFound, 'notFound');
  return new SyncError('Errore interno: ' + (msg || `HTTP ${status}`), 'internal');
}

const emptyState = () => ({
  apiKey: '', projectId: '', email: '', uid: '', idToken: '', refreshToken: '', expiresAt: 0,
  cursor: null, dirty: {}, lastSyncAt: 0, lastError: '',
});

function toFields(kind, rec) {
  return {
    type: { stringValue: kind },
    data: { stringValue: JSON.stringify(rec) },
    updatedAt: { integerValue: String(rec.updatedAt || 0) },
    deleted: { booleanValue: !!rec.deleted },
  };
}

export function createSync({
  store, storage, fetch, now = () => Date.now(), config = FIREBASE_CONFIG,
  setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = (t) => globalThis.clearTimeout(t),
}) {
  let st = load();
  let running = null;
  let timer = null;
  let busy = false;
  const listeners = new Set();

  function load() {
    try {
      const raw = JSON.parse(storage.getItem(SYNC_KEY) || 'null');
      const s = { ...emptyState(), ...(raw && typeof raw === 'object' ? raw : {}) };
      if (Array.isArray(s.dirty)) s.dirty = Object.fromEntries(s.dirty.map((k) => [k, 0]));
      if (!s.dirty || typeof s.dirty !== 'object') s.dirty = {};
      delete s.password;
      return s;
    } catch { return emptyState(); }
  }
  function save() {
    try { storage.setItem(SYNC_KEY, JSON.stringify(st)); } catch { /* lo stato resta in memoria */ }
  }
  function emit() { for (const fn of [...listeners]) fn(status()); }

  const cfg = () => ({ apiKey: (st.apiKey || config.apiKey || '').trim(), projectId: (st.projectId || config.projectId || '').trim() });
  const signedIn = () => !!(st.refreshToken && st.uid);

  function status() {
    const c = cfg();
    return {
      configured: !!(c.apiKey && c.projectId), apiKey: c.apiKey, projectId: c.projectId,
      signedIn: signedIn(), email: st.email, lastSyncAt: st.lastSyncAt, lastError: st.lastError,
      pending: Object.keys(st.dirty).length, busy,
    };
  }

  async function call(url, opts, service) {
    let res;
    try { res = await fetch(url, opts); } catch { throw new SyncError(MSG.network, 'network'); }
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    if (!res.ok) throw mapError(res.status, body, service);
    return body;
  }

  function clearSession() {
    st.idToken = ''; st.refreshToken = ''; st.expiresAt = 0;
  }

  async function signIn(email, password) {
    const c = cfg();
    try {
      if (!c.apiKey || !c.projectId) throw new SyncError(MSG.notConfigured, 'config');
      const body = await call(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(c.apiKey)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email).trim(), password: String(password), returnSecureToken: true }),
      }, 'auth');
      if (st.uid && st.uid !== body.localId) { st.cursor = null; }
      st.email = body.email || String(email).trim();
      st.uid = body.localId;
      st.idToken = body.idToken;
      st.refreshToken = body.refreshToken;
      st.expiresAt = now() + Number(body.expiresIn || 3600) * 1000;
      // Al primo accesso si invia tutto: il pull prima del push evita di sovrascrivere dati più recenti.
      for (const k of store.allKeys()) if (!(k in st.dirty)) st.dirty[k] = 0;
      st.lastError = '';
      save();
    } catch (e) {
      return fail(e);
    }
    return syncNow();
  }

  function signOut() {
    clearTimer(timer);
    clearSession();
    st.uid = ''; st.cursor = null; st.lastError = '';
    save(); emit();
  }

  function configure({ apiKey, projectId }) {
    const changed = (apiKey ?? st.apiKey) !== st.apiKey || (projectId ?? st.projectId) !== st.projectId;
    if (apiKey !== undefined) st.apiKey = String(apiKey).trim();
    if (projectId !== undefined) st.projectId = String(projectId).trim();
    if (changed) { st.cursor = null; }
    save(); emit();
  }

  async function refresh() {
    const c = cfg();
    const body = await call(`https://securetoken.googleapis.com/v1/token?key=${encodeURIComponent(c.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(st.refreshToken)}`,
    }, 'token');
    st.idToken = body.id_token;
    st.refreshToken = body.refresh_token || st.refreshToken;
    st.expiresAt = now() + Number(body.expires_in || 3600) * 1000;
    save();
  }

  async function ensureToken() {
    if (!signedIn()) throw new SyncError(MSG.signedOut, 'signedOut');
    if (!st.idToken || st.expiresAt - 60000 < now()) await refresh();
  }

  const base = () => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg().projectId)}/databases/(default)/documents`;

  // Chiamata a Firestore con un nuovo tentativo dopo il rinnovo del token se risponde 401.
  async function firestore(path, payload) {
    const send = () => call(base() + path, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${st.idToken}` }, body: JSON.stringify(payload),
    }, 'firestore');
    try { return await send(); } catch (e) {
      if (e.code !== 'unauth') throw e;
      await refresh();
      try { return await send(); } catch (e2) { if (e2.code === 'unauth') throw new SyncError(MSG.expired, 'expired'); throw e2; }
    }
  }

  async function pull() {
    let applied = 0;
    let cursor = st.cursor;
    let first = true;
    for (let page = 0; page < 1000; page++) {
      const q = {
        from: [{ collectionId: 'records' }],
        orderBy: [{ field: { fieldPath: 'syncedAt' }, direction: 'ASCENDING' }, { field: { fieldPath: '__name__' }, direction: 'ASCENDING' }],
        limit: PAGE,
      };
      if (cursor && first) {
        const t = new Date(Date.parse(cursor.time) - 60000).toISOString();
        q.startAt = { values: [{ timestampValue: t }], before: true };
      } else if (cursor) {
        q.startAt = { values: [{ timestampValue: cursor.time }, { referenceValue: cursor.name }], before: false };
      }
      first = false;
      const rows = await firestore(`/users/${encodeURIComponent(st.uid)}:runQuery`, { structuredQuery: q });
      const docs = (Array.isArray(rows) ? rows : []).map((r) => r.document).filter(Boolean);
      const items = [];
      for (const d of docs) {
        try {
          const kind = d.fields?.type?.stringValue;
          const record = JSON.parse(d.fields?.data?.stringValue || 'null');
          if (kind && record) items.push({ kind, record });
        } catch { /* documento illeggibile: ignorato */ }
      }
      if (items.length) applied += store.applyRemote(items);
      if (docs.length) {
        const lastDoc = docs[docs.length - 1];
        cursor = { time: lastDoc.fields?.syncedAt?.timestampValue, name: lastDoc.name };
        st.cursor = cursor;
        save();
      }
      if (docs.length < PAGE) break;
    }
    return applied;
  }

  async function push() {
    const keys = Object.keys(st.dirty);
    let pushed = 0;
    const docBase = `projects/${cfg().projectId}/databases/(default)/documents/users/${st.uid}/records/`;
    for (let i = 0; i < keys.length; i += BATCH) {
      const chunk = [];
      for (const k of keys.slice(i, i + BATCH)) {
        const rec = store.recordByKey(k);
        if (!rec) { delete st.dirty[k]; continue; }
        const kind = k.slice(0, k.indexOf('_'));
        chunk.push({ k, ts: rec.updatedAt, write: { update: { name: docBase + k, fields: toFields(kind, rec) }, updateTransforms: [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }] } });
      }
      if (!chunk.length) continue;
      await firestore(':commit', { writes: chunk.map((c) => c.write) });
      for (const c of chunk) {
        // Se nel frattempo il record è cambiato di nuovo, resta da inviare.
        if (store.recordByKey(c.k)?.updatedAt === c.ts) delete st.dirty[c.k];
      }
      pushed += chunk.length;
      save();
    }
    return pushed;
  }

  function fail(e) {
    const err = e instanceof SyncError ? e : new SyncError('Errore interno: ' + (e?.message || e), 'internal');
    if (err.code === 'expired') clearSession();
    st.lastError = err.message;
    save();
    emit();
    return { ok: false, error: err.message, code: err.code };
  }

  async function run() {
    busy = true; emit();
    try {
      if (!status().configured) throw new SyncError(MSG.notConfigured, 'config');
      await ensureToken();
      const pulled = await pull();
      const pushed = await push();
      st.lastSyncAt = now();
      st.lastError = '';
      save();
      return { ok: true, pulled, pushed };
    } catch (e) {
      return fail(e);
    } finally {
      busy = false; emit();
    }
  }

  function syncNow() {
    if (!running) running = run().finally(() => { running = null; });
    return running;
  }

  function schedule(ms = DEBOUNCE_MS) {
    if (!signedIn()) return;
    clearTimer(timer);
    timer = setTimer(() => { timer = null; syncNow(); }, ms);
  }

  // Le modifiche locali vanno inviate; quelle arrivate dalla sync no (niente cicli).
  store.subscribe(({ keys, source }) => {
    if (source !== 'local') return;
    for (const k of keys || store.allKeys()) st.dirty[k] = 0;
    save();
    schedule();
    emit();
  });

  return {
    status, configure, signIn, signOut, syncNow, schedule, refresh,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // Sync automatica solo con sessione attiva: all'avvio e al ritorno in primo piano.
    start() { if (signedIn()) syncNow(); },
    onVisible() { if (signedIn()) syncNow(); },
    reloadState() { st = load(); emit(); },
  };
}

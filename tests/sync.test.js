// Test di js/sync.js con un fetch simulato: Identity Toolkit, Secure Token e Firestore in memoria.
// Firebase reale non è raggiungibile da qui: questi test provano solo il protocollo REST.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSync, SYNC_KEY, mapError } from '../js/sync.js';
import { createStore, PALETTE } from '../js/store.js';
import { memoryStorage, clock, seqUuid } from './helpers.js';

const CFG = { apiKey: 'chiave', projectId: 'progetto' };
const DOCS = 'https://firestore.googleapis.com/v1/projects/progetto/databases/(default)/documents';

// Server Firebase finto: utenti, token, documenti con syncedAt crescente.
function fakeFirebase({ now }) {
  const srv = {
    users: { 'ada@example.it': { password: 'segreta-lunga', uid: 'u1' } },
    docs: new Map(), tick: 0, commits: [], queries: 0, tokenValid: new Set(), refreshes: 0,
    failNext: null, offline: false, expireRefresh: false,
  };
  const json = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
  const nextTs = () => new Date(Date.UTC(2025, 0, 1) + (++srv.tick) * 10).toISOString().replace('Z', '123Z');
  const issue = () => { const t = 'tok' + Math.random(); srv.tokenValid.add(t); return t; };

  srv.fetch = async (url, opts = {}) => {
    if (srv.offline) throw new TypeError('Failed to fetch');
    if (srv.failNext) { const f = srv.failNext; srv.failNext = null; return json(f.status, f.body); }
    const u = new URL(url);
    if (u.host === 'identitytoolkit.googleapis.com') {
      if (u.searchParams.get('key') !== 'chiave') return json(400, { error: { code: 400, message: 'API key not valid. Please pass a valid API key.' } });
      const b = JSON.parse(opts.body);
      const usr = srv.users[b.email];
      if (!usr) return json(400, { error: { message: 'EMAIL_NOT_FOUND' } });
      if (usr.password !== b.password) return json(400, { error: { message: 'INVALID_LOGIN_CREDENTIALS' } });
      return json(200, { localId: usr.uid, email: b.email, idToken: issue(), refreshToken: 'rt-' + usr.uid, expiresIn: '3600' });
    }
    if (u.host === 'securetoken.googleapis.com') {
      srv.refreshes++;
      if (srv.expireRefresh) return json(400, { error: { message: 'TOKEN_EXPIRED' } });
      const p = new URLSearchParams(opts.body);
      assert.equal(p.get('grant_type'), 'refresh_token');
      return json(200, { id_token: issue(), refresh_token: p.get('refresh_token'), expires_in: '3600', user_id: 'u1' });
    }
    assert.equal(u.host, 'firestore.googleapis.com');
    const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
    if (!srv.tokenValid.has(token)) return json(401, { error: { status: 'UNAUTHENTICATED', message: 'Missing or invalid authentication.' } });
    const body = JSON.parse(opts.body);
    if (url === DOCS + ':commit') {
      assert.ok(body.writes.length <= 250, 'al massimo 250 scritture');
      srv.commits.push(body.writes.length);
      for (const w of body.writes) {
        assert.match(w.update.name, /^projects\/progetto\/databases\/\(default\)\/documents\/users\/u1\/records\/(account|category|movement|scheduled|goal)_/);
        assert.deepEqual(w.updateTransforms, [{ fieldPath: 'syncedAt', setToServerValue: 'REQUEST_TIME' }]);
        srv.docs.set(w.update.name, { name: w.update.name, fields: { ...w.update.fields, syncedAt: { timestampValue: nextTs() } } });
      }
      return json(200, { writeResults: [] });
    }
    if (url === DOCS + '/users/u1:runQuery') {
      srv.queries++;
      const q = body.structuredQuery;
      assert.deepEqual(q.orderBy.map((o) => o.field.fieldPath), ['syncedAt', '__name__']);
      let list = [...srv.docs.values()].sort((a, b) => a.fields.syncedAt.timestampValue.localeCompare(b.fields.syncedAt.timestampValue) || a.name.localeCompare(b.name));
      if (q.startAt) {
        const [t, n] = q.startAt.values;
        list = list.filter((d) => {
          const c = d.fields.syncedAt.timestampValue.localeCompare(t.timestampValue) || (n ? d.name.localeCompare(n.referenceValue) : 0);
          return q.startAt.before ? c >= 0 : c > 0;
        });
      }
      list = list.slice(0, q.limit);
      return json(200, list.length ? list.map((d) => ({ document: d, readTime: 'x' })) : [{ readTime: 'x' }]);
    }
    return json(404, { error: { message: 'not found' } });
  };
  return srv;
}

function device(srv, prefix, now) {
  const storage = memoryStorage();
  const store = createStore({ storage, now, uuid: seqUuid(prefix) });
  const timers = [];
  const sync = createSync({ store, storage, now, config: CFG, fetch: (...a) => srv.fetch(...a), setTimer: (fn) => { timers.push(fn); return timers.length; }, clearTimer: () => {} });
  return { storage, store, sync, timers };
}

test('accesso, push e pull tra due dispositivi, password mai salvata', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  const acc = A.store.addAccount({ name: 'Revolut', kind: 'eur', initial: 100, color: PALETTE[0] });
  const r = await A.sync.signIn('ada@example.it', 'segreta-lunga');
  assert.deepEqual([r.ok, r.pushed], [true, 14]);
  assert.ok(!A.storage.getItem(SYNC_KEY).includes('segreta-lunga'));
  assert.equal(A.sync.status().pending, 0);

  const B = device(srv, 'b', now);
  const rb = await B.sync.signIn('ada@example.it', 'segreta-lunga');
  assert.equal(rb.ok, true);
  assert.equal(B.store.find('account', acc.id).name, 'Revolut');

  // modifica su B, più recente: vince su A
  now.advance(1000);
  B.store.updateAccount(acc.id, { name: 'Revolut B' });
  assert.equal(B.timers.length > 0, true, 'sync pianificata dopo la modifica');
  await B.sync.syncNow();
  const pushesBefore = srv.commits.length;
  await A.sync.syncNow();
  assert.equal(A.store.find('account', acc.id).name, 'Revolut B');
  assert.equal(A.sync.status().pending, 0, 'applyRemote non segna nulla da inviare');
  assert.equal(srv.commits.length, pushesBefore, 'nessun push dopo i dati remoti (niente cicli)');

  // eliminazione come tombstone
  now.advance(1000);
  A.store.deleteAccount(acc.id);
  await A.sync.syncNow();
  await B.sync.syncNow();
  assert.equal(B.store.find('account', acc.id).deleted, true);

  // modifica più vecchia non sovrascrive
  const stale = { ...B.store.find('account', acc.id), name: 'Vecchio', deleted: false, updatedAt: 5 };
  assert.equal(B.store.applyRemote([{ kind: 'account', record: stale }]), 0);
});

test('categorie predefinite: un secondo dispositivo non le raddoppia e la modifica di A resta', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  const casaA = A.store.getState().categories.find((c) => c.type === 'uscita' && c.name === 'Casa');
  now.advance(1000);
  A.store.updateCategory(casaA.id, { budget: 30000 });
  await A.sync.signIn('ada@example.it', 'segreta-lunga');

  now.advance(1000);
  const B = device(srv, 'b', now);
  await B.sync.signIn('ada@example.it', 'segreta-lunga');
  await A.sync.syncNow();

  for (const D of [A, B]) {
    const live = D.store.getState().categories.filter((c) => !c.deleted);
    assert.equal(live.length, 13);
    assert.equal(live.filter((c) => c.name === 'Casa').length, 1);
    assert.equal(D.store.find('category', casaA.id).budget, 30000, 'budget di A conservato');
  }
  now.advance(1000);
  const casaB = B.store.getState().categories.find((c) => c.type === 'uscita' && c.name === 'Casa');
  B.store.updateCategory(casaB.id, { budget: 45000 });
  await B.sync.syncNow();
  await A.sync.syncNow();
  assert.equal(A.store.find('category', casaA.id).budget, 45000);
  A.store.updateCategory(casaA.id, { name: 'Affitto' });
  assert.equal(A.store.find('category', casaA.id).name, 'Affitto');
});

test('600 modifiche → 3 commit da 250/250/100 e pull a pagine', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  const acc = A.store.addAccount({ name: 'Conto', kind: 'eur', initial: 0, color: PALETTE[0] });
  const cat = A.store.getState().categories[0].id;
  for (let i = 0; i < 586; i++) A.store.addMovement({ type: 'uscita', date: '2025-01-01', amount: i + 1, accountId: acc.id, categoryId: cat });
  // 13 categorie + 1 conto + 586 movimenti = 600
  await A.sync.signIn('ada@example.it', 'segreta-lunga');
  assert.deepEqual(srv.commits, [250, 250, 100]);
  const B = device(srv, 'b', now);
  srv.queries = 0;
  await B.sync.signIn('ada@example.it', 'segreta-lunga');
  assert.ok(srv.queries >= 3, 'pull in più pagine da 300');
  assert.equal(B.store.getState().movements.length, 586);
});

test('token scaduto: rinnovo automatico; rinnovo impossibile → sessione chiusa, dati tenuti', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  await A.sync.signIn('ada@example.it', 'segreta-lunga');
  now.advance(3600 * 1000);
  A.store.addAccount({ name: 'Nuovo', kind: 'eur', initial: 0, color: PALETTE[0] });
  const r = await A.sync.syncNow();
  assert.equal(r.ok, true);
  assert.equal(srv.refreshes, 1);

  // token rifiutato dal server (401) → rinnovo e nuovo tentativo
  srv.tokenValid.clear();
  assert.equal((await A.sync.syncNow()).ok, true);
  assert.equal(srv.refreshes, 2);

  srv.tokenValid.clear();
  srv.expireRefresh = true;
  A.store.addAccount({ name: 'Altro', kind: 'eur', initial: 0, color: PALETTE[0] });
  const r2 = await A.sync.syncNow();
  assert.equal(r2.ok, false);
  assert.match(r2.error, /Sessione scaduta/);
  assert.equal(A.sync.status().signedIn, false);
  assert.equal(A.sync.status().pending, 1, 'le modifiche locali restano da inviare');
  assert.ok(A.store.getState().accounts.some((a) => a.name === 'Altro'));
});

test('messaggi di errore in italiano', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  assert.match((await A.sync.signIn('ada@example.it', 'sbagliata')).error, /Email o password non corrette/);
  assert.match((await A.sync.signIn('nessuno@example.it', 'x')).error, /Email o password non corrette/);
  srv.offline = true;
  assert.match((await A.sync.signIn('ada@example.it', 'segreta-lunga')).error, /^Impossibile raggiungere Firebase/);
  srv.offline = false;
  srv.failNext = { status: 400, body: { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER : Access disabled' } } };
  assert.match((await A.sync.signIn('ada@example.it', 'segreta-lunga')).error, /Troppi tentativi/);
  srv.failNext = { status: 503, body: null };
  assert.match((await A.sync.signIn('ada@example.it', 'segreta-lunga')).error, /Firebase non risponde/);
  A.sync.configure({ apiKey: 'altra' });
  assert.match((await A.sync.signIn('ada@example.it', 'segreta-lunga')).error, /API key non valida/);
  A.sync.configure({ apiKey: 'chiave' });
  assert.equal((await A.sync.signIn('ada@example.it', 'segreta-lunga')).ok, true);
  srv.failNext = { status: 429, body: {} };
  assert.match((await A.sync.syncNow()).error, /Troppi tentativi/);
  srv.failNext = { status: 403, body: { error: { status: 'PERMISSION_DENIED', message: 'Missing or insufficient permissions.' } } };
  assert.match((await A.sync.syncNow()).error, /regole/);
  srv.failNext = { status: 400, body: { error: { message: 'qualcosa di strano' } } };
  assert.equal((await A.sync.syncNow()).error, 'Errore interno: qualcosa di strano');
  assert.equal(A.sync.status().lastError, 'Errore interno: qualcosa di strano');
  assert.equal((await A.sync.syncNow()).ok, true);
  assert.equal(A.sync.status().lastError, '');
  assert.equal(mapError(404, {}, 'firestore').code, 'notFound');
});

test('senza configurazione o senza accesso non parte nulla', async () => {
  const now = clock();
  const storage = memoryStorage();
  const store = createStore({ storage, now, uuid: seqUuid() });
  let calls = 0;
  const sync = createSync({ store, storage, now, config: { apiKey: '', projectId: '' }, fetch: async () => { calls++; throw new Error('no'); }, setTimer: () => 0, clearTimer: () => {} });
  assert.match((await sync.signIn('a@b.it', 'x')).error, /API key e Project ID/);
  sync.start();
  assert.equal(calls, 0);
  assert.equal(sync.status().configured, false);
});

test('esci: token cancellati, dati locali tenuti', async () => {
  const now = clock();
  const srv = fakeFirebase({ now });
  const A = device(srv, 'a', now);
  await A.sync.signIn('ada@example.it', 'segreta-lunga');
  A.sync.signOut();
  const saved = JSON.parse(A.storage.getItem(SYNC_KEY));
  assert.equal(saved.refreshToken, '');
  assert.equal(saved.idToken, '');
  assert.equal(A.store.getState().categories.length, 13);
});

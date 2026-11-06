// Avvio di MoneyFlow: store, preferenze, sync, router con hash, barra in alto e schede,
// service worker con banner "Aggiorna", installazione, pillola Offline, più schede aperte.

import { createStore, DATA_KEY, INVEST_KEY } from './store.js';
import { createPrefs, PREFS_KEY } from './prefs.js';
import { createSync, SYNC_KEY } from './sync.js';
import { createTaxSettings, TAX_KEY } from './tax-settings.js';
import { el, icon, clear, preserveFocus } from './ui.js';
import { todayISO } from './dates.js';
import { resolveRoute } from './routes.js';
import { openQuickAdd } from './views/movimento-form.js';
import { reconcileInterest } from './interest.js';
import * as home from './views/home.js';
import * as daConfermare from './views/da-confermare.js';
import * as daRicevere from './views/da-ricevere.js';
import * as programmati from './views/programmati.js';
import * as movimenti from './views/movimenti.js';
import * as calendario from './views/calendario.js';
import * as statistiche from './views/statistiche.js';
import * as stipendio from './views/stipendio.js';
import * as fondoPensione from './views/fondo-pensione.js';
import * as budget from './views/budget.js';
import * as conti from './views/conti.js';
import * as conto from './views/conto.js';
import * as investimento from './views/investimento.js';
import * as obiettivo from './views/obiettivo.js';
import * as impostazioni from './views/impostazioni.js';

// localStorage incapsulato: i metodi restano legati all'oggetto originale.
const storage = {
  getItem: (k) => globalThis.localStorage.getItem(k),
  setItem: (k, v) => globalThis.localStorage.setItem(k, v),
  removeItem: (k) => globalThis.localStorage.removeItem(k),
  keys: () => Object.keys(globalThis.localStorage),
};

const prefs = createPrefs(storage);
const taxSettings = createTaxSettings(storage);
const store = createStore({ storage, uuid: () => crypto.randomUUID() });
const sync = createSync({ store, storage, fetch: (...a) => globalThis.fetch(...a) });

const $ = (id) => document.getElementById(id);
const viewEl = $('view');
const topbar = $('topbar');

// ---- Tema ----
const isDark = (theme) => theme === 'dark' || (theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme(theme = prefs.get().theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark(theme) ? '#0C0D0F' : '#F6F5F1');
}
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());

// ---- Installazione ----
// Scelta consapevole (PWA-BASE §7): niente preventDefault, così il banner di Chrome resta.
let deferredPrompt = null;
const install = {
  available: () => !!deferredPrompt,
  installed: () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
  async prompt() {
    if (!deferredPrompt) return 'unavailable';
    const e = deferredPrompt;
    deferredPrompt = null;
    e.prompt();
    const choice = await e.userChoice.catch(() => ({ outcome: 'dismissed' }));
    rerender();
    return choice.outcome;
  },
};
addEventListener('beforeinstallprompt', (e) => { deferredPrompt = e; if (currentRoute()[0] === 'impostazioni') rerender(); });
addEventListener('appinstalled', () => { deferredPrompt = null; rerender(); });

// ---- Router ----
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [p, q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean), query: Object.fromEntries(new URLSearchParams(q)) };
}
const currentRoute = () => parseHash().path;

// Nomi delle rotte (js/routes.js) → moduli delle viste.
const VIEWS = {
  home, 'da-confermare': daConfermare, 'da-ricevere': daRicevere, programmati, movimenti, budget,
  statistiche, stipendio, 'fondo-pensione': fondoPensione, conti, conto, investimento, obiettivo, impostazioni,
};

function resolve(path, query) {
  const r = resolveRoute(path, query);
  return r.redirect ? r : { view: VIEWS[r.name], tab: r.tab };
}

// Parametri passati in memoria da go(); restano validi finché non si cambia rotta.
let params = {};
let pendingParams = null;
function go(route, p = {}) {
  const target = '#' + route.replace(/^#/, '');
  if (location.hash === target) { params = p; render(); } else { pendingParams = p; location.hash = target; }
}

// Aggiorna la query nell'indirizzo senza ridisegnare (filtri, giorno scelto…).
function setQuery(q) {
  const { path } = parseHash();
  const s = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
  history.replaceState(null, '', '#' + path.join('/') + (s ? '?' + s : ''));
}

// ---- Barra in alto ----
function setHeader(container, { title, back, actions = [], large = true }) {
  clear($('topbar-left'));
  clear($('topbar-right'));
  $('topbar-title').textContent = title || '';
  if (back) {
    $('topbar-left').append(el('a', { class: 'topbar__btn', href: back.href, id: 'back-btn', attrs: { 'aria-label': 'Indietro: ' + (back.label || '') } }, icon('back', 22), el('span', { text: back.label || 'Indietro' })));
  }
  for (const a of actions) $('topbar-right').append(a);
  if (large && title) container.append(el('h1', { class: 'large-title', text: title }));
  document.title = title ? `${title} · MoneyFlow` : 'MoneyFlow';
}

function updateCompact() {
  topbar.classList.toggle('is-compact', window.scrollY > 24);
}
addEventListener('scroll', updateCompact, { passive: true });

// Un ridisegno chiesto mentre se ne sta già facendo uno (es. eventi di blur) viene rimandato.
let rendering = false;
let again = false;
function render() {
  if (rendering) { again = true; return; }
  rendering = true;
  try { renderNow(); } finally { rendering = false; }
  if (again) { again = false; queueMicrotask(rerender); }
}

function renderNow() {
  const { path, query } = parseHash();
  const r = resolve(path, query);
  if (r.redirect) { location.replace('#' + r.redirect); return; }
  for (const t of document.querySelectorAll('.tab')) {
    if (t.dataset.tab === r.tab) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
  }
  clear(viewEl);
  const ctx = {
    store, prefs, sync, install, go, rerender, setQuery, applyTheme, path, query, params, tax: taxSettings,
    today: () => todayISO(),
    header: (opts) => setHeader(viewEl, opts),
    getVersion,
  };
  try {
    r.view.render(viewEl, ctx);
  } catch (e) {
    console.error(e);
    viewEl.append(el('p', { class: 'form-error', text: 'Errore interno: ' + (e?.message || e) }));
  }
  updateCompact();
}

function rerender() {
  preserveFocus(render);
}

addEventListener('hashchange', () => {
  params = pendingParams || {};
  pendingParams = null;
  render();
  window.scrollTo(0, 0);
  updateCompact();
});

store.subscribe(() => rerender());

// ---- Interessi dei depositi (v4) ----
// All'avvio, al ritorno in primo piano e dopo ogni modifica dello store (anche dalla sync).
// Il flag evita il rientro; la passata successiva non trova differenze e non salva, quindi il ciclo termina.
let reconciling = false;
let reconcileQueued = false;
function runReconcile() {
  if (reconciling) return;
  reconciling = true;
  try { reconcileInterest(store, todayISO()); } catch (e) { console.warn('Interessi non aggiornati:', e?.message || e); } finally { reconciling = false; }
}
store.subscribe(() => {
  if (reconciling || reconcileQueued) return;
  reconcileQueued = true;
  queueMicrotask(() => { reconcileQueued = false; runReconcile(); });
});
sync.subscribe(() => { if (currentRoute()[0] === 'impostazioni') rerender(); });

// Più schede aperte: se un'altra scheda salva, ricarica e ridisegna.
addEventListener('storage', (e) => {
  if (!e.key || !e.key.startsWith('moneyflow:')) return;
  if (e.key === DATA_KEY || e.key === INVEST_KEY) store.reload();
  else if (e.key === PREFS_KEY) { prefs.reload(); applyTheme(); rerender(); }
  else if (e.key === SYNC_KEY) sync.reloadState();
  else if (e.key === TAX_KEY) { taxSettings.reload(); rerender(); }
});

// ---- Offline ----
function updateOnline() { $('offline-pill').hidden = navigator.onLine; }
addEventListener('online', updateOnline);
addEventListener('offline', updateOnline);

// ---- Service worker e banner "Aggiorna" (schema di PWA-BASE §7) ----
let waiting = null;
let updateRequested = false;
let reloaded = false;
const banner = $('update-banner');
function showBanner(sw) {
  waiting = sw;
  banner.hidden = false;
}
$('update-btn').addEventListener('click', () => {
  if (waiting) { updateRequested = true; waiting.postMessage({ type: 'SKIP_WAITING' }); } else location.reload();
});

async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  let controller = navigator.serviceWorker.controller;
  const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
  const showIfWaiting = () => { if (reg.waiting && navigator.serviceWorker.controller) showBanner(reg.waiting); };
  showIfWaiting();
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    sw?.addEventListener('statechange', () => { if (sw.state === 'installed') showIfWaiting(); });
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    const prev = controller;
    controller = navigator.serviceWorker.controller;
    if (!prev || reloaded) return; // primo claim dopo l'installazione: ignorare
    if (updateRequested) { reloaded = true; location.reload(); } else showBanner(null); // aggiornato da un'altra scheda
  });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
}

function getVersion() {
  return new Promise((resolve) => {
    const c = navigator.serviceWorker?.controller;
    if (!c) { resolve(null); return; }
    const ch = new MessageChannel();
    const t = setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = (e) => { clearTimeout(t); resolve(e.data?.version || null); };
    c.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') { runReconcile(); sync.onVisible(); rerender(); }
});

// ---- Avvio ----
for (const span of document.querySelectorAll('.tab__icon')) span.append(icon(span.dataset.icon, 24));
$('fab').append(icon('plus', 30));
// Nel Calendario di Movimenti il + apre il foglio sul giorno scelto; altrove su oggi.
const inCalendar = () => { const { path, query } = parseHash(); return path[0] === 'movimenti' && query.vista === 'calendario'; };
$('fab').addEventListener('click', () => openQuickAdd({ store, prefs, go, tax: taxSettings, today: () => todayISO() },
  { date: inCalendar() ? calendario.selectedDay() || undefined : undefined }));
applyTheme();
updateOnline();
if (!location.hash) history.replaceState(null, '', '#home');
runReconcile();
render();
sync.start();
registerSW().catch((e) => console.warn('Service worker non registrato:', e?.message || e));

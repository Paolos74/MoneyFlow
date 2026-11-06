// Service worker di MoneyFlow: cache dei file dell'app, offline, aggiornamento solo su richiesta.
// AUMENTARE VERSION A OGNI RILASCIO e tenere ASSETS uguale ai file pubblicati.

const VERSION = 'moneyflow-v7';
const ASSETS = [
  './',
  'index.html',
  'offline.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/moneyflow-v4.svg',
  'icons/moneyflow-v4-favicon.svg',
  'icons/moneyflow-v4-192.png',
  'icons/moneyflow-v4-512.png',
  'icons/moneyflow-v4-maskable-512.png',
  'icons/moneyflow-v4-apple-touch-180.png',
  'icons/moneyflow-v4-favicon-32.png',
  'js/app.js',
  'js/backup.js',
  'js/calc.js',
  'js/charts.js',
  'js/csv-import.js',
  'js/csv.js',
  'js/dates.js',
  'js/errors.js',
  'js/escape.js',
  'js/firebase-config.js',
  'js/icons.js',
  'js/interest.js',
  'js/invest.js',
  'js/money.js',
  'js/payslip.js',
  'js/pdf-text.js',
  'js/pension.js',
  'js/period.js',
  'js/prefs.js',
  'js/recurrence.js',
  'js/routes.js',
  'js/store.js',
  'js/sync.js',
  'js/tax-settings.js',
  'js/tax-tables.js',
  'js/tax.js',
  'js/theme-boot.js',
  'js/ui.js',
  'js/views/budget.js',
  'js/views/calendario.js',
  'js/views/conti.js',
  'js/views/conto.js',
  'js/views/da-confermare.js',
  'js/views/da-ricevere.js',
  'js/views/fondo-pensione.js',
  'js/views/importa.js',
  'js/views/investimento.js',
  'js/views/home.js',
  'js/views/impostazioni.js',
  'js/views/metti-da-parte.js',
  'js/views/movimenti.js',
  'js/views/movimento-form.js',
  'js/views/obiettivo.js',
  'js/views/parts.js',
  'js/views/programmati.js',
  'js/views/statistiche.js',
  'js/views/stipendio.js',
];
const scopeUrl = (p) => new URL(p, self.registration.scope).href;

self.addEventListener('install', (e) => { // niente skipWaiting: aspetta "Aggiorna"
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(ASSETS.map((p) => new Request(scopeUrl(p), { cache: 'reload' })))));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((ks) => Promise.all(ks.filter((k) => k.startsWith('moneyflow-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  else if (e.data?.type === 'GET_VERSION') e.ports[0]?.postMessage({ version: VERSION });
});

// Solo GET della stessa origine: Firebase e le altre API esterne vanno sempre in rete.
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(scopeUrl('index.html'), { ignoreSearch: true });
      // Le pagine dell'app (radice o index.html, con qualsiasi ?parametro) vengono dalla cache.
      const isApp = url.pathname.endsWith('/') || url.pathname.endsWith('/index.html');
      if (cached && isApp) return cached;
      try {
        return await fetch(req);
      } catch {
        return (await caches.match(scopeUrl('offline.html'))) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
      }
      return res;
    } catch {
      return Response.error();
    }
  })());
});

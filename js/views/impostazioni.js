// Impostazioni: tema, categorie, periodo di budget (v4), backup, esportazione e importazione CSV,
// sincronizzazione Firebase, strumenti (collegamento al fondo pensione, ora in Statistiche), installazione, versione.
// v7: i budget si gestiscono solo nella scheda Budget (#impostazioni/budget → #budget); "‹ Indietro" torna alla
// scheda da cui si è toccato ⚙︎. Il foglio categoria (senza campo Budget) si apre anche dai fogli dei movimenti.

import { el, list, row, section, segmented, sheet, field, input, colorPicker, iconPicker, toast, button, confirmDialog, shareOrDownload, attempt, card } from '../ui.js';
import { formatEuro } from '../money.js';
import { formatDateIt, todayISO } from '../dates.js';
import { ValidationError, StorageError } from '../errors.js';
import { PALETTE, DATA_KEY } from '../store.js';
import { createBackup, parseBackup, backupFileName, backupSummary } from '../backup.js';
import { buildCsv, csvFileName, CSV_FORMATS } from '../csv.js';
import * as C from '../calc.js';
import { periodPicker } from './parts.js';
import { render as importa } from './importa.js';

const SECTIONS = {
  tema: { title: 'Tema', icon: 'sun', color: 'var(--amber-fill)' },
  categorie: { title: 'Categorie', icon: 'tag', color: 'var(--pink-fill)' },
  periodo: { title: 'Periodo di budget', icon: 'calendar', color: 'var(--teal-fill)' },
  backup: { title: 'Backup', icon: 'download', color: '#2563EB' },
  csv: { title: 'Esporta CSV', icon: 'doc', color: 'var(--teal-fill)' },
  importa: { title: 'Importa movimenti (CSV)', icon: 'upload', color: 'var(--teal-fill)' },
  sync: { title: 'Sincronizzazione', icon: 'cloud', color: 'var(--indigo-fill)' },
  installa: { title: 'Installa l\'app', icon: 'phone', color: 'var(--accent-fill)' },
};
// Dalla v4 il simulatore sta in Statistiche (#statistiche/fondo-pensione); qui resta solo il collegamento.
const PENSION = { title: 'Se aumento il fondo pensione', icon: 'coin', color: 'var(--indigo-fill)' };

let csvPeriod = null;
let syncDraft = null;
let version = null;

export function render(root, ctx) {
  const sec = ctx.path[1];
  if (sec && SECTIONS[sec]) {
    ctx.header({ title: SECTIONS[sec].title, back: { href: '#impostazioni', label: 'Impostazioni' } });
    ({ tema, categorie, periodo, backup, csv, importa, sync, installa })[sec](root, ctx);
    return;
  }
  ctx.header({ title: 'Impostazioni', back: ctx.settingsBack || { href: '#home', label: 'Home' } });
  const st = ctx.sync.status();
  const sub = {
    tema: { auto: 'Automatico', light: 'Chiaro', dark: 'Scuro' }[ctx.prefs.get().theme],
    backup: ctx.prefs.get().lastBackupAt ? `Ultimo: ${formatDateIt(todayISO(new Date(ctx.prefs.get().lastBackupAt)))}` : 'Mai fatto',
    sync: st.signedIn ? `Attiva · ${st.email}` : 'Non attiva (facoltativa)',
    csv: CSV_FORMATS[ctx.prefs.get().csvFormat]?.label,
    importa: 'Revolut o altri estratti conto',
    periodo: ctx.prefs.get().budgetPeriod === 'salary' ? 'Dallo stipendio' : 'Mese di calendario',
  };
  root.append(section({ title: 'Generale' }, list(...['tema', 'categorie', 'periodo'].map((k) => row({ icon: SECTIONS[k].icon, color: SECTIONS[k].color, title: SECTIONS[k].title, subtitle: sub[k], href: `#impostazioni/${k}`, id: `set-${k}` })))));
  root.append(section({ title: 'Dati' }, list(...['backup', 'csv', 'importa', 'sync'].map((k) => row({ icon: SECTIONS[k].icon, color: SECTIONS[k].color, title: SECTIONS[k].title, subtitle: sub[k], href: `#impostazioni/${k}`, id: `set-${k}` })))));
  root.append(section({ title: 'Strumenti' }, list(row({ icon: PENSION.icon, color: PENSION.color, title: PENSION.title, subtitle: 'In Statistiche: stima di costo e risparmio di tasse', href: '#statistiche/fondo-pensione', id: 'set-fondo-pensione' }))));
  root.append(section({ title: 'App' }, list(row({ icon: 'phone', color: SECTIONS.installa.color, title: SECTIONS.installa.title, subtitle: ctx.install.installed() ? 'Già installata' : 'Android e iPhone', href: '#impostazioni/installa', id: 'set-installa' }),
    row({ icon: 'info', color: '#636366', title: 'Versione', value: version || '…', valueClass: 'is-muted', id: 'set-version' }))));
  root.append(el('p', { class: 'section-footer', text: 'MoneyFlow salva i dati su questo dispositivo. Nessuna notifica, nessun prezzo da internet.' }));
  if (!version) ctx.getVersion().then((v) => { version = v || 'moneyflow-v4 (senza service worker)'; ctx.rerender(); });
}

function tema(root, ctx) {
  const cur = ctx.prefs.get().theme;
  root.append(segmented([{ value: 'auto', label: 'Automatico', id: 'theme-auto' }, { value: 'light', label: 'Chiaro', id: 'theme-light' }, { value: 'dark', label: 'Scuro', id: 'theme-dark' }], cur, (v) => {
    ctx.prefs.set({ theme: v });
    ctx.applyTheme(v);
    ctx.rerender();
  }, { label: 'Tema' }));
  root.append(el('p', { class: 'section-footer', text: 'Automatico segue l\'impostazione chiaro/scuro del telefono.' }));
}

// ---- Categorie ----
function categorie(root, ctx) {
  const state = ctx.store.getState();
  for (const [type, label] of [['uscita', 'Uscite'], ['entrata', 'Entrate']]) {
    const cats = C.sortedCategories(state, type);
    root.append(section({ title: label, action: el('button', { type: 'button', text: 'Nuova', id: `cat-new-${type}`, on: { click: () => openCategoryForm(ctx, null, type) } }) },
      list(...cats.map((c) => row({ icon: C.categoryIconOf(c), color: c.color, title: c.name, subtitle: c.role === 'stipendio' ? 'Stipendio (area tasse)' : c.role === 'interessi' ? 'Interessi dei depositi (automatici)' : c.budget ? `Budget ${formatEuro(c.budget)} per periodo` : null, attrs: { 'data-cat': c.id }, onClick: () => openCategoryForm(ctx, c, type) })))));
  }
  root.append(el('p', { class: 'section-footer', text: 'Se elimini una categoria, i movimenti restano con l\'etichetta "(eliminata)".' }));
}

// Foglio categoria: nome, icona, colore. v7 (risposta 3): niente campo Budget (i budget stanno nella scheda Budget);
// modificando una categoria il budget già impostato resta (non è nel patch). Dai fogli dei movimenti, del
// programmato e dall'import CSV si apre sopra il foglio aperto con il tipo fisso: onCreated(id) riceve la
// categoria nuova, onCancel la chiusura senza salvare. Nome unico per tipo senza maiuscole (lo controlla lo store).
export function openCategoryForm(ctx, cat, type, { onCreated, onCancel } = {}) {
  const state = ctx.store.getState();
  const d = cat ? { name: cat.name, color: cat.color, icon: cat.icon || null } : { name: '', color: PALETTE[state.categories.length % PALETTE.length], icon: null };
  let created = null;
  const api = sheet({
    title: cat ? 'Modifica categoria' : type === 'uscita' ? 'Nuova categoria di uscita' : 'Nuova categoria di entrata',
    onSave: () => {
      const inp = { name: d.name, color: d.color, type, role: cat?.role || null, icon: d.icon };
      if (cat) ctx.store.updateCategory(cat.id, inp); else created = ctx.store.addCategory({ ...inp, order: state.categories.length });
      toast(cat ? 'Categoria aggiornata' : 'Categoria creata');
      return true;
    },
    onClose: () => { if (created) onCreated?.(created.id); else onCancel?.(); },
    content: (s) => {
      s.body.append(el('div', { class: 'form-group' },
        field({ label: 'Nome', field: 'name', id: 'c-name', input: input({ id: 'c-name', value: d.name, maxlength: 60, onInput: (v) => { d.name = v; } }) })),
      el('p', { class: 'field__label', text: 'Icona' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field' }, iconPicker(d.icon || C.categoryIconOf(cat), (v) => { d.icon = v; }))),
      el('p', { class: 'field__label', text: 'Colore' }),
      el('div', { class: 'form-group' }, el('div', { class: 'field', dataset: { field: 'color' } }, colorPicker(d.color, (c) => { d.color = c; }), el('p', { class: 'field__error', hidden: true }))));
      if (cat) {
        s.body.append(list(el('button', { type: 'button', class: 'row row--danger row--noicon', id: 'c-delete', text: 'Elimina categoria', on: { click: () => {
          api.close();
          if (attempt(() => ctx.store.deleteCategory(cat.id))) toast('Categoria eliminata', { undo: () => ctx.store.restoreCategory(cat.id) });
        } } })));
      }
      if (onCreated) setTimeout(() => document.getElementById('c-name')?.focus(), 0);
    },
  });
  return api;
}

// ---- Periodo di budget (v4) ----
function periodo(root, ctx) {
  const cur = ctx.prefs.get().budgetPeriod === 'salary' ? 'salary' : 'calendar';
  root.append(segmented([{ value: 'calendar', label: 'Mese di calendario', id: 'period-calendar' }, { value: 'salary', label: 'Dallo stipendio', id: 'period-salary' }], cur, (v) => {
    ctx.prefs.set({ budgetPeriod: v });
    toast(v === 'salary' ? 'Il periodo parte dall\'ultimo stipendio' : 'Il periodo è il mese di calendario');
    ctx.rerender();
  }, { label: 'Periodo di budget' }));
  root.append(el('p', { class: 'section-footer', id: 'period-note', text: cur === 'salary'
    ? 'Il periodo va dall\'ultima entrata Stipendio registrata al giorno prima della successiva. Finché non arriva, la fine è stimata alla stessa data del mese dopo; se lo stipendio è in ritardo, il periodo arriva a oggi.'
    : 'Il periodo va dal 1° all\'ultimo giorno del mese.' }));
  root.append(el('p', { class: 'section-footer', text: 'Vale per "Quanto ti resta", "Puoi spendere oggi" e i budget per categoria. Statistiche e CSV restano a mesi di calendario. Preferenza di questo dispositivo.' }));
}

// ---- Backup ----
const BEFORE_IMPORT = `${DATA_KEY}:before-import-`;

function backup(root, ctx) {
  const prefs = ctx.prefs.get();
  root.append(card({ title: 'Esporta' },
    el('p', { text: prefs.lastBackupAt ? `Ultimo backup: ${formatDateIt(todayISO(new Date(prefs.lastBackupAt)))}.` : 'Non hai ancora fatto un backup.' }),
    el('p', { text: 'Il file contiene tutti i dati: conservalo in un posto sicuro (Drive, email, computer).' }),
    button('Esporta backup', async () => {
      const text = JSON.stringify(createBackup(ctx.store.getState(), Date.now()), null, 2);
      const file = new File([text], backupFileName(Date.now()), { type: 'application/json' });
      try {
        const r = await shareOrDownload(file);
        if (r === 'aborted') return;
        ctx.prefs.set({ lastBackupAt: Date.now() });
        toast(r === 'downloaded' ? `Backup scaricato: ${file.name}` : 'Backup condiviso');
        ctx.rerender();
      } catch (e) { toast('Errore interno: ' + (e?.message || e), { error: true }); }
    }, { kind: 'primary', icon: 'download', id: 'backup-export' })));

  const fileInput = el('input', { type: 'file', id: 'backup-file', hidden: true, attrs: { accept: '.json,application/json' }, on: { change: (e) => importFile(ctx, e.target.files?.[0], e.target) } });
  root.append(card({ title: 'Importa' },
    el('p', { text: 'Sostituisce i dati di questo dispositivo con quelli del backup. Prima viene salvata una copia dei dati attuali, che puoi ripristinare.' }),
    fileInput,
    button('Importa backup', () => fileInput.click(), { icon: 'upload', id: 'backup-import' })));

  const key = prefs.beforeImportKey;
  if (key && localStorage.getItem(key)) {
    root.append(card({ title: 'Dati di prima dell\'importazione' },
      el('p', { text: 'C\'è una copia dei dati com\'erano prima dell\'ultima importazione.' }),
      button('Ripristina i dati di prima', async () => {
        const ok = await confirmDialog({ title: 'Ripristinare i dati di prima?', message: 'I dati attuali verranno sostituiti con la copia salvata prima dell\'importazione.', confirmLabel: 'Ripristina', destructive: true });
        if (!ok) return;
        attempt(() => {
          const data = parseBackup(localStorage.getItem(key));
          ctx.store.replaceAll(data);
          toast('Dati di prima ripristinati');
        });
      }, { kind: 'danger', id: 'backup-restore' })));
  }
}

async function importFile(ctx, file, inputEl) {
  if (!file) return;
  let data;
  try {
    data = parseBackup(await file.text());
  } catch (e) {
    toast(e instanceof ValidationError ? e.message : 'Impossibile leggere il file', { error: true });
    inputEl.value = '';
    return;
  }
  inputEl.value = '';
  const s = backupSummary(data);
  const ok = await confirmDialog({
    title: 'Importare questo backup?',
    message: `${s.accounts} conti, ${s.movements} movimenti, ${s.categories} categorie, ${s.scheduled} programmati, ${s.goals} obiettivi${s.investments ? `, ${s.investments} ETF` : ''}. I dati attuali saranno sostituiti (ne viene salvata una copia).`,
    confirmLabel: 'Importa', destructive: true,
  });
  if (!ok) return;
  const key = BEFORE_IMPORT + Date.now();
  try {
    // Una sola copia di sicurezza: si toglie quella vecchia per non riempire lo spazio.
    const old = ctx.prefs.get().beforeImportKey;
    if (old) localStorage.removeItem(old);
    localStorage.setItem(key, JSON.stringify(createBackup(ctx.store.getState(), Date.now())));
  } catch {
    toast(new StorageError('Spazio pieno: impossibile salvare la copia di sicurezza, importazione annullata.').message, { error: true });
    return;
  }
  ctx.prefs.set({ beforeImportKey: key });
  if (attempt(() => { ctx.store.replaceAll(data); return true; })) toast('Backup importato');
}

// ---- CSV ----
function csv(root, ctx) {
  if (!csvPeriod) csvPeriod = { key: ctx.prefs.get().lastPeriod || 'mese' };
  const fmt = ctx.prefs.get().csvFormat;
  root.append(el('p', { class: 'field__label', text: 'Periodo' }));
  const pp = periodPicker(ctx, csvPeriod, (st) => { csvPeriod = { ...csvPeriod, ...st }; ctx.rerender(); }, 'cp');
  root.append(pp.node);
  root.append(el('p', { class: 'field__label', text: 'Formato' }));
  root.append(segmented([{ value: 'semicolon', label: 'Excel italiano', id: 'csv-semicolon' }, { value: 'comma', label: 'Numbers, Fogli, iPhone', id: 'csv-comma' }], fmt, (v) => { ctx.prefs.set({ csvFormat: v }); ctx.rerender(); }, { label: 'Formato CSV' }));
  root.append(el('p', { class: 'section-footer', text: fmt === 'semicolon' ? 'Separatore punto e virgola: per Excel con impostazioni italiane.' : 'Separatore virgola, importi tra virgolette: per Numbers, Google Fogli, l\'anteprima dell\'iPhone ed Excel non italiano.' }));
  const n = pp.range.error ? 0 : C.searchMovements(ctx.store.getState(), { from: pp.range.from, to: pp.range.to }).length;
  root.append(el('div', { class: 'section' }, button(`Esporta CSV (${n} movimenti)`, async () => {
    const text = buildCsv(ctx.store.getState(), { from: pp.range.from, to: pp.range.to, format: fmt });
    const file = new File([text], csvFileName(pp.range.from, pp.range.to), { type: 'text/csv' });
    try {
      const r = await shareOrDownload(file);
      if (r !== 'aborted') toast(r === 'downloaded' ? `CSV scaricato: ${file.name}` : 'CSV condiviso');
    } catch (e) { toast('Errore interno: ' + (e?.message || e), { error: true }); }
  }, { kind: 'primary', icon: 'download', block: true, id: 'csv-export', disabled: !!pp.range.error })));
  root.append(el('p', { class: 'section-footer', text: 'Colonne: Data, Conto, Tipo, Categoria, Descrizione, Importo. Le uscite hanno il segno meno e l\'importo contato (senza la quota esclusa).' }));
}

// ---- Sincronizzazione ----
function sync(root, ctx) {
  const st = ctx.sync.status();
  if (!syncDraft) syncDraft = { apiKey: st.apiKey, projectId: st.projectId, email: st.email || '', password: '' };
  const last = st.lastSyncAt ? new Date(st.lastSyncAt) : null;
  if (st.signedIn) {
    root.append(card({ title: 'Sincronizzazione attiva' },
      el('div', { class: 'kv' }, el('span', { text: 'Account' }), el('span', { id: 'sync-email', text: st.email })),
      el('div', { class: 'kv' }, el('span', { text: 'Ultima sincronizzazione' }), el('span', { id: 'sync-last', text: last ? `${formatDateIt(todayISO(last))} ${last.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}` : 'Mai' })),
      el('div', { class: 'kv' }, el('span', { text: 'Modifiche da inviare' }), el('span', { id: 'sync-pending', text: String(st.pending) })),
      st.lastError ? el('p', { class: 'form-error', id: 'sync-error', text: st.lastError }) : null,
      el('div', { class: 'btn-row' },
        button(st.busy ? 'Sincronizzo…' : 'Sincronizza ora', async () => { const r = await ctx.sync.syncNow(); toast(r.ok ? 'Sincronizzato' : r.error, { error: !r.ok }); }, { kind: 'primary', icon: 'cloud', id: 'sync-now', disabled: st.busy }),
        button('Esci', async () => {
          const ok = await confirmDialog({ title: 'Uscire dalla sincronizzazione?', message: 'I dati restano su questo dispositivo. Potrai accedere di nuovo quando vuoi.', confirmLabel: 'Esci' });
          if (ok) { ctx.sync.signOut(); toast('Sincronizzazione disattivata'); }
        }, { id: 'sync-signout' }))));
    root.append(el('p', { class: 'section-footer', text: 'Si sincronizza all\'apertura, quando torni nell\'app e qualche secondo dopo una modifica. Nessun lavoro in background, nessuna notifica.' }));
    return;
  }
  const d = syncDraft;
  root.append(el('p', { class: 'prose', text: 'Facoltativa e gratuita: serve per usare gli stessi dati su Android e iPhone. Richiede un progetto Firebase personale (piano Spark): la guida passo passo è nel file README.md.' }));
  const formBox = el('div', {});
  formBox.append(
    st.lastError ? el('p', { class: 'form-error', id: 'sync-error', text: st.lastError, attrs: { role: 'alert' } }) : null,
    el('p', { class: 'field__label', text: 'Progetto Firebase' }),
    el('div', { class: 'form-group' },
      field({ label: 'API key', id: 'sync-apikey', input: input({ id: 'sync-apikey', value: d.apiKey, placeholder: 'AIza…', onInput: (v) => { d.apiKey = v; }, attrs: { spellcheck: 'false', autocapitalize: 'off' } }) }),
      field({ label: 'Project ID', id: 'sync-project', input: input({ id: 'sync-project', value: d.projectId, placeholder: 'moneyflow-12345', onInput: (v) => { d.projectId = v; }, attrs: { spellcheck: 'false', autocapitalize: 'off' } }) })),
    el('p', { class: 'field__label', text: 'Accesso' }),
    el('div', { class: 'form-group' },
      field({ label: 'Email', id: 'sync-email-in', input: input({ id: 'sync-email-in', type: 'email', value: d.email, autocomplete: 'username', onInput: (v) => { d.email = v; }, attrs: { autocapitalize: 'off' } }) }),
      field({ label: 'Password', id: 'sync-password', hint: 'Non viene salvata sul dispositivo.', input: input({ id: 'sync-password', type: 'password', value: d.password, autocomplete: 'current-password', onInput: (v) => { d.password = v; } }) })),
    button(st.busy ? 'Accesso in corso…' : 'Accedi e sincronizza', async () => {
      ctx.sync.configure({ apiKey: d.apiKey, projectId: d.projectId });
      const r = await ctx.sync.signIn(d.email, d.password);
      d.password = '';
      toast(r.ok ? 'Sincronizzazione attiva' : r.error, { error: !r.ok });
      ctx.rerender();
    }, { kind: 'primary', icon: 'cloud', block: true, id: 'sync-signin', disabled: st.busy }));
  root.append(formBox);
}

// ---- Installazione ----
function installa(root, ctx) {
  if (ctx.install.installed()) root.append(card({}, el('p', { text: 'MoneyFlow è già installata su questo dispositivo.' })));
  else if (ctx.install.available()) {
    root.append(card({ title: 'Android' }, el('p', { text: 'Il browser permette di installare MoneyFlow con un tocco.' }),
      button('Installa', async () => { const r = await ctx.install.prompt(); if (r === 'accepted') toast('MoneyFlow installata'); }, { kind: 'primary', icon: 'phone', id: 'install-btn' })));
  }
  root.append(card({ title: 'Android (Chrome)' }, el('ol', { class: 'prose' },
    el('li', {}, 'Apri MoneyFlow in Chrome.'),
    el('li', {}, 'Tocca il menu ', el('strong', { text: '⋮' }), ' in alto a destra.'),
    el('li', {}, 'Scegli ', el('strong', { text: 'Installa app' }), ' (in inglese ', el('strong', { text: 'Install app' }), ') oppure ', el('strong', { text: 'Aggiungi a schermata Home' }), ' (', el('strong', { text: 'Add to Home screen' }), ').'),
    el('li', {}, 'Conferma con ', el('strong', { text: 'Installa' }), '. L\'icona compare tra le app.'))));
  root.append(card({ title: 'iPhone (Safari)' }, el('ol', { class: 'prose' },
    el('li', {}, 'Apri MoneyFlow in ', el('strong', { text: 'Safari' }), ' (non in un\'altra app).'),
    el('li', {}, 'Tocca ', el('strong', { text: 'Condividi' }), ' (il quadrato con la freccia in su).'),
    el('li', {}, 'Scorri e scegli ', el('strong', { text: 'Aggiungi alla schermata Home' }), ' (', el('strong', { text: 'Add to Home Screen' }), ').'),
    el('li', {}, 'Tocca ', el('strong', { text: 'Aggiungi' }), ' (', el('strong', { text: 'Add' }), ').')),
    el('p', { class: 'prose' }, el('strong', { text: 'Importante: ' }), 'su iPhone un sito non installato può perdere i dati dopo circa 7 giorni senza visite. Installala e fai un backup ogni tanto.')));
}

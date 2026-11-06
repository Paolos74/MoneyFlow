// Helper DOM di MoneyFlow: el(), icone, fogli dal basso (v7: impilabili e chiudibili trascinandoli giù), avvisi,
// toast con Annulla, liste, chip, segmentato, campi, condivisione/download. Testo dell'utente solo con textContent.

import { iconSvg, PICK_ICONS, PICK_ICON_LABELS } from './icons.js';
import { ValidationError, StorageError } from './errors.js';
import { PALETTE } from './store.js';

// el('div', { class, text, attrs, on, vars }, ...figli)
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) node.addEventListener(ev, fn);
    else if (k === 'vars') for (const [name, val] of Object.entries(v)) node.style.setProperty(name, String(val));
    else if (k === 'attrs') for (const [a, val] of Object.entries(v)) { if (val !== null && val !== undefined && val !== false) node.setAttribute(a, val === true ? '' : String(val)); }
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k in node) node[k] = v;
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

// Converte una stringa SVG generata dall'app (icone, grafici con testi già escapati) in nodo.
export function svgNode(markup) {
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (root.nodeName !== 'svg') return document.createTextNode('');
  return document.importNode(root, true);
}

export function icon(name, size) {
  return svgNode(iconSvg(name, size));
}

export function clear(node) {
  while (node.firstChild) node.firstChild.remove();
}

export function iconBox(name, color, { planned = false } = {}) {
  return el('span', { class: 'row__icon' + (planned ? ' row__icon--planned' : ''), vars: { '--c': color } }, icon(name));
}

// Riga di lista inset: icona colorata, titolo, sottotitolo, valore, chevron.
// v5: valueSubClass = classe del testo piccolo sotto il valore (es. is-income per il guadagno degli ETF).
export function row({ icon: ic, color, planned, title, subtitle, value, valueSub, valueClass, valueSubClass, onClick, href, chevron = !!(onClick || href), cls = '', id, attrs }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const node = el(tag, { class: `row ${ic ? '' : 'row--noicon'} ${cls}`, href, id, attrs: { type: tag === 'button' ? 'button' : null, ...(attrs || {}) }, on: onClick ? { click: onClick } : null },
    ic ? (ic instanceof Node ? ic : iconBox(ic, color, { planned })) : null,
    el('span', { class: 'row__main' },
      el('span', { class: 'row__title', text: title }),
      subtitle ? el('span', { class: 'row__sub' }, typeof subtitle === 'string' ? el('span', { text: subtitle }) : subtitle) : null),
    value !== undefined && value !== null ? el('span', { class: `row__value ${valueClass || ''}` }, value, valueSub ? el('small', { class: valueSubClass || null, text: valueSub }) : null) : null,
    chevron ? el('span', { class: 'row__chev' }, icon('chevron')) : null);
  return node;
}

export function section({ title, action, footer, cls = '', id }, ...content) {
  return el('section', { class: 'section ' + cls, id },
    title || action ? el('h2', { class: 'section-header' }, el('span', { text: title || '' }), action || null) : null,
    ...content,
    footer ? el('p', { class: 'section-footer' }, footer) : null);
}

export function list(...rows) {
  return el('div', { class: 'list' }, ...rows);
}

// tint: colore dell'ambito (teal, indigo, violet, amber, pink, butter, emerald); icon: glifo nel riquadro accanto al titolo;
// color: colore del riquadro (es. quello del conto) al posto della tinta.
// v5: id facoltativo sull'elemento <section> della card.
export function card({ title, link, cls = '', tint, icon: ic, color, id }, ...content) {
  const badge = ic ? el('span', { class: 'card__badge', vars: color ? { '--c': color } : {} }, icon(ic)) : null;
  return el('section', { class: `card ${tint ? 'card--t-' + tint : ''} ${cls}`, id },
    title || link ? el('div', { class: 'card__head' }, el('h2', { class: 'card__title' }, badge, el('span', { text: title || '' })), link || null) : null,
    ...content);
}

export function linkButton(text, onClick, cls = 'card__link') {
  return el('button', { class: cls, type: 'button', text, on: { click: onClick } });
}

export function button(text, onClick, { kind = '', icon: ic, small, block, id, disabled, label } = {}) {
  return el('button', {
    class: `btn ${kind ? 'btn--' + kind : ''} ${small ? 'btn--small' : ''} ${block ? 'btn--block' : ''}`, type: 'button', id, disabled,
    attrs: { 'aria-label': label }, on: { click: onClick },
  }, ic ? icon(ic) : null, text);
}

export function emptyState({ icon: ic = 'info', title, text, action }) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty__icon' }, icon(ic)),
    el('p', { class: 'empty__title', text: title }),
    text ? el('p', { class: 'empty__text', text }) : null,
    action || null);
}

export function chips(options, value, onChange, { wrap = false, label } = {}) {
  return el('div', { class: 'chips' + (wrap ? ' chips--wrap' : ''), attrs: { role: 'group', 'aria-label': label } },
    options.map((o) => el('button', {
      class: 'chip', type: 'button', attrs: { 'aria-pressed': String(o.value === value) }, id: o.id,
      on: { click: () => onChange(o.value) },
    }, o.color ? el('span', { class: 'chip__dot', vars: { '--c': o.color } }) : null, o.label)));
}

export function segmented(options, value, onChange, { label } = {}) {
  return el('div', { class: 'segmented', attrs: { role: 'group', 'aria-label': label } },
    options.map((o) => el('button', {
      type: 'button', text: o.label, id: o.id, attrs: { 'aria-pressed': String(o.value === value) },
      on: { click: () => { if (o.value !== value) onChange(o.value); } },
    })));
}

export function progress(ratio, { color, over } = {}) {
  const p = Math.max(0, Math.min(1, ratio || 0));
  return el('div', { class: 'progress' + (over ? ' is-over' : ''), attrs: { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(p * 100) } },
    el('div', { class: 'progress__fill', vars: { '--p': p, ...(color ? { '--c': color } : {}) } }));
}

// Campo con etichetta, suggerimento ed errore; data-field per mostrare gli errori di validazione.
export function field({ label, input, hint, field: name, inline = false, id }) {
  const err = el('p', { class: 'field__error', hidden: true, attrs: { 'aria-live': 'polite' } });
  // L'id va sul controllo vero (anche dentro il contenitore del select), mai sul contenitore.
  const ctl = input?.matches?.('input, select, textarea') ? input : input?.querySelector?.('input, select, textarea');
  if (ctl && id && !ctl.id) ctl.id = id;
  const lab = el('label', { class: 'field__label', text: label, attrs: { for: ctl?.id || null } });
  return el('div', { class: 'field' + (inline ? ' field--inline' : ''), dataset: name ? { field: name } : {} },
    lab, input, hint ? (hint instanceof Node ? hint : el('p', { class: 'field__hint', text: hint })) : null, err);
}

export function input({ id, value = '', type = 'text', placeholder, inputmode, cls = '', maxlength, onInput, autocomplete = 'off', attrs }) {
  return el('input', {
    class: 'input ' + cls, id, type, value, placeholder, maxLength: maxlength,
    attrs: { inputmode, autocomplete, enterkeyhint: 'done', ...(attrs || {}) },
    // Le date ascoltano anche 'change' (alcuni selettori nativi non mandano 'input');
    // i campi di testo no, perché 'change' scatta anche sul blur durante un ridisegno.
    on: onInput ? (type === 'date' ? { input: (e) => onInput(e.target.value), change: (e) => onInput(e.target.value) } : { input: (e) => onInput(e.target.value) }) : null,
  });
}

export function textarea({ id, value = '', placeholder, maxlength, onInput }) {
  const t = el('textarea', { class: 'input', id, placeholder, maxLength: maxlength, on: onInput ? { input: (e) => onInput(e.target.value) } : null });
  t.value = value;
  return t;
}

export function select({ id, options, value, onChange, cls = '' }) {
  const s = el('select', { class: 'input ' + cls, id, on: { change: (e) => onChange(e.target.value) } },
    options.map((o) => el('option', { value: o.value, text: o.label, selected: o.value === value, disabled: o.disabled })));
  s.value = value ?? '';
  return el('div', { class: 'select-wrap' }, s);
}

export function toggle({ id, checked, onChange, label }) {
  return el('span', { class: 'switch' },
    el('input', { type: 'checkbox', id, checked: !!checked, attrs: { role: 'switch', 'aria-label': label }, on: { change: (e) => onChange(e.target.checked) } }),
    el('span', { class: 'switch__track', attrs: { 'aria-hidden': 'true' } }));
}

export function stepper({ value, min, max, onChange, label }) {
  return el('span', { class: 'stepper', attrs: { role: 'group', 'aria-label': label } },
    el('button', { type: 'button', text: '−', attrs: { 'aria-label': 'Diminuisci' }, disabled: value <= min, on: { click: () => onChange(Math.max(min, value - 1)) } }),
    el('span', { text: String(value), attrs: { 'aria-live': 'polite' } }),
    el('button', { type: 'button', text: '+', attrs: { 'aria-label': 'Aumenta' }, disabled: value >= max, on: { click: () => onChange(Math.min(max, value + 1)) } }));
}

export function colorPicker(value, onChange) {
  const wrap = el('div', { class: 'swatches', attrs: { role: 'radiogroup', 'aria-label': 'Colore' } });
  const draw = (cur) => {
    clear(wrap);
    for (const c of PALETTE) {
      wrap.append(el('button', {
        type: 'button', class: 'swatch', vars: { '--c': c }, attrs: { 'aria-pressed': String(c === cur), 'aria-label': 'Colore ' + c },
        on: { click: () => { onChange(c); draw(c); } },
      }));
    }
  };
  draw(value);
  return wrap;
}

// Selettore di icone per conti e categorie (v4): griglia di PICK_ICONS, pulsanti con aria-pressed.
export function iconPicker(value, onChange) {
  const wrap = el('div', { class: 'icon-picker', attrs: { role: 'group', 'aria-label': 'Icona' } });
  const draw = (cur) => {
    clear(wrap);
    for (const name of PICK_ICONS) {
      wrap.append(el('button', {
        type: 'button', class: 'icon-pick', id: 'icon-' + name, attrs: { 'aria-pressed': String(name === cur), 'aria-label': 'Icona ' + PICK_ICON_LABELS[name] },
        on: { click: () => { onChange(name); draw(name); } },
      }, icon(name)));
    }
  };
  draw(value);
  return wrap;
}

// Mostra l'errore sotto il campo indicato (data-field) oppure in cima al modulo.
export function showFormError(root, err) {
  for (const n of root.querySelectorAll('.field.has-error')) { n.classList.remove('has-error'); const e = n.querySelector('.field__error'); if (e) e.hidden = true; }
  const top = root.querySelector('.form-error');
  if (top) top.remove();
  if (!err) return;
  const msg = err.message || String(err);
  const target = err.field ? root.querySelector(`[data-field="${err.field}"]`) : null;
  if (target) {
    target.classList.add('has-error');
    const e = target.querySelector('.field__error');
    e.textContent = msg;
    e.hidden = false;
    target.scrollIntoView?.({ block: 'center' });
    target.querySelector('input, select, textarea')?.focus();
  } else {
    root.prepend(el('p', { class: 'form-error', text: msg, attrs: { role: 'alert' } }));
    root.scrollTop = 0;
  }
}

const sheetRoot = () => document.getElementById('sheet-root');
let openSheets = 0;

// Livelli aperti (fogli, avvisi, fogli d'azione), dal basso in alto: Esc chiude solo quello in cima (v7).
const layers = [];
function onLayerKey(e) {
  if (e.key !== 'Escape' || !layers.length) return;
  e.stopPropagation();
  layers[layers.length - 1]();
}
function trapEscape(onEsc) {
  if (!layers.length) document.addEventListener('keydown', onLayerKey, true);
  layers.push(onEsc);
  return () => {
    const i = layers.lastIndexOf(onEsc);
    if (i >= 0) layers.splice(i, 1);
    if (!layers.length) document.removeEventListener('keydown', onLayerKey, true);
  };
}

// Fogli impilati (v7): ogni foglio aperto sopra un altro ha velo e foglio più in alto (z-index per livello).
const sheetStack = [];
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Gesto di chiusura (decisione v7 §5, design §5.2), con Pointer Events di tocco e penna (il mouse no):
// - dalla maniglia e dall'intestazione sempre, dopo 8 px verso il basso (sotto è un tocco: Annulla/Salva restano
//   cliccabili);
// - dal corpo solo se all'inizio del gesto è scrollato in cima e il dito va verso il basso; mai da campi, select,
//   cursori o file di chip/recenti che scorrono di lato. Verso l'alto lo scroll interno resta nativo.
// Il foglio segue il dito (translateY ≥ 0), il velo sfuma; al rilascio chiude oltre il 25 % dell'altezza (almeno
// 120 px) o con una velocità verso il basso > 0,5 px/ms negli ultimi 100 ms, altrimenti torna su.
const DRAG_START = 8;
const NO_DRAG = 'input, textarea, select, [contenteditable], .chips, .recents, [data-no-drag]';
function attachDrag(node, backdrop, body, head, requestClose) {
  let g = null;
  let suppressClick = false;
  const set = (dy, animate) => {
    node.style.transition = animate && !reducedMotion() ? 'transform .25s cubic-bezier(.2,.9,.3,1)' : 'none';
    backdrop.style.transition = node.style.transition.replace('transform', 'opacity');
    node.style.transform = dy ? `translateY(${dy}px)` : '';
    backdrop.style.opacity = dy ? String(Math.max(0, 1 - dy / Math.max(1, node.offsetHeight))) : '';
  };
  const reset = () => set(0, true);
  const down = (e) => {
    if (g || (e.pointerType !== 'touch' && e.pointerType !== 'pen') || e.button > 0) return;
    const fromHead = head.contains(e.target) || e.target.classList?.contains('sheet__grabber');
    if (!fromHead) {
      if (!body.contains(e.target) || e.target.closest(NO_DRAG) || body.scrollTop > 0) return;
    }
    g = { id: e.pointerId, y0: e.clientY, x0: e.clientX, fromHead, active: false, samples: [{ t: e.timeStamp, y: e.clientY }] };
  };
  const move = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const dy = e.clientY - g.y0;
    const dx = e.clientX - g.x0;
    if (!g.active) {
      // Dal corpo: un movimento verso l'alto o di lato lascia lo scroll al browser.
      if (!g.fromHead && (dy < 0 || Math.abs(dx) > Math.abs(dy))) { if (Math.abs(dy) > 2 || Math.abs(dx) > 2) g = null; return; }
      if (dy < DRAG_START) return;
      g.active = true;
      try { node.setPointerCapture(e.pointerId); } catch { /* evento sintetico o puntatore già rilasciato */ }
    }
    g.samples.push({ t: e.timeStamp, y: e.clientY });
    while (g.samples.length > 2 && e.timeStamp - g.samples[0].t > 100) g.samples.shift();
    set(Math.max(0, dy), false);
  };
  const up = (e) => {
    if (!g || e.pointerId !== g.id) return;
    const was = g;
    g = null;
    if (!was.active) return;
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
    if (e.type === 'pointercancel') { reset(); return; }
    const dy = Math.max(0, e.clientY - was.y0);
    const first = was.samples[0];
    const dt = e.timeStamp - first.t;
    const v = dt > 0 ? (e.clientY - first.y) / dt : 0;
    const h = node.offsetHeight;
    if (dy > Math.max(120, h * 0.25) || (v > 0.5 && dy > DRAG_START)) {
      requestClose(true, { dismiss: () => {
        if (reducedMotion()) return Promise.resolve();
        set(h, true);
        return new Promise((r) => setTimeout(r, 250));
      }, back: reset });
    } else reset();
  };
  // Durante il gesto attivo, o all'avvio verso il basso dal corpo in cima, il touchmove non deve scrollare.
  const touchMove = (e) => {
    if (!g) return;
    const t = e.touches[0];
    if (g.active || (t && t.clientY - g.y0 > 0 && Math.abs(t.clientY - g.y0) >= Math.abs(t.clientX - g.x0))) e.preventDefault();
  };
  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);
  node.addEventListener('touchmove', touchMove, { passive: false });
  // Un rilascio dopo il trascinamento non deve premere Annulla o Salva.
  node.addEventListener('click', (e) => { if (suppressClick) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// Foglio dal basso "Annulla · Titolo · Salva". onSave lancia ValidationError per mostrare l'errore.
// v7: si chiude anche trascinandolo giù (attachDrag) o toccando il velo; se ci sono modifiche non salvate chiede
// "Vuoi annullare le modifiche?" (risposta 4). Annulla ed Esc chiudono senza chiedere. Modifiche = un evento
// input/change nel corpo o un clic su un pulsante con aria-pressed (chip, segmentato, colore, icona), oppure
// l'opzione dirty() se il foglio vuole deciderlo da sé. I fogli senza Salva non chiedono mai.
export function sheet({ title, saveLabel = 'Salva', onSave, onClose, content, cancelLabel = 'Annulla', dirty }) {
  const prevFocus = document.activeElement;
  const body = el('div', { class: 'sheet__body' });
  const titleId = 'sheet-title-' + (++openSheets);
  const backdrop = el('div', { class: 'backdrop', on: { click: () => requestClose(false) } });
  const saveBtn = onSave ? el('button', { class: 'topbar__btn', type: 'button', text: saveLabel, id: 'sheet-save', on: { click: () => save() } }) : el('span');
  const head = el('div', { class: 'sheet__head' },
    el('button', { class: 'topbar__btn', type: 'button', text: onSave ? cancelLabel : 'Chiudi', id: 'sheet-cancel', on: { click: () => close() } }),
    el('div', { class: 'sheet__title', id: titleId, text: title }),
    saveBtn);
  const node = el('div', { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } },
    el('div', { class: 'sheet__grabber', attrs: { 'aria-hidden': 'true' } }),
    head,
    body);
  let changed = false;
  body.addEventListener('input', () => { changed = true; });
  body.addEventListener('change', () => { changed = true; });
  body.addEventListener('click', (e) => { if (e.target.closest?.('button[aria-pressed]')) changed = true; }, true);
  const isDirty = () => !!onSave && (dirty ? !!dirty() : changed);
  let closed = false;
  let asking = false;
  const untrap = trapEscape(() => close());
  function close(result) {
    if (closed) return;
    closed = true;
    untrap();
    backdrop.remove();
    node.remove();
    const i = sheetStack.indexOf(node);
    if (i >= 0) sheetStack.splice(i, 1);
    onClose?.(result);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
  }
  // Chiusura dal gesto (fromDrag, con l'animazione di uscita) o dal velo: con modifiche chiede conferma.
  async function requestClose(fromDrag, anim) {
    if (closed || asking) return;
    if (isDirty()) {
      anim?.back();
      asking = true;
      const ok = await confirmDialog({ title: 'Vuoi annullare le modifiche?', confirmLabel: 'Annulla le modifiche', cancelLabel: 'Continua a modificare', destructive: true, stacked: true });
      asking = false;
      if (!ok) return;
    } else if (anim) await anim.dismiss();
    close();
  }
  async function save() {
    try {
      showFormError(body, null);
      const r = await onSave(api);
      if (r !== false) close(r);
    } catch (e) {
      if (e instanceof ValidationError) showFormError(body, e);
      else if (e instanceof StorageError) showFormError(body, e);
      else { console.error(e); showFormError(body, new Error('Errore interno: ' + (e?.message || e))); }
    }
  }
  const api = { body, close, save, setTitle: (t) => { node.querySelector('.sheet__title').textContent = t; }, node, isDirty };
  if (typeof content === 'function') content(api); else if (content) append(body, [content]);
  const level = sheetStack.length;
  sheetStack.push(node);
  if (level) { backdrop.style.zIndex = String(50 + level * 2); node.style.zIndex = String(51 + level * 2); }
  attachDrag(node, backdrop, body, head, requestClose);
  sheetRoot().append(backdrop, node);
  setTimeout(() => { if (!body.contains(document.activeElement)) (body.querySelector('[autofocus]') || saveBtn)?.focus?.(); }, 30);
  return api;
}

// Avviso centrato: la domanda come titolo, l'azione distruttiva in rosso. Risolve true/false.
// stacked (v7): pulsanti uno sopra l'altro per le etichette lunghe, l'azione in alto e la scelta sicura in grassetto sotto.
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Annulla', destructive = false, stacked = false }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const backdrop = el('div', { class: 'backdrop dialog-backdrop' });
    let done = false;
    const finish = (v) => { if (done) return; done = true; untrap(); backdrop.remove(); node.remove(); prevFocus?.focus?.(); resolve(v); };
    const ok = el('button', { type: 'button', text: confirmLabel, id: 'dialog-ok', class: destructive ? 'is-destructive' : '', on: { click: () => finish(true) } });
    const cancelBtn = cancelLabel ? el('button', { type: 'button', text: cancelLabel, id: 'dialog-cancel', on: { click: () => finish(false) } }) : null;
    const node = el('div', { class: 'dialog', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-msg' } },
      el('div', { class: 'dialog__body' },
        el('p', { class: 'dialog__title', id: 'dialog-title', text: title }),
        message ? el('p', { class: 'dialog__msg', id: 'dialog-msg', text: message }) : null),
      el('div', { class: 'dialog__actions' + (stacked ? ' dialog__actions--stacked' : '') },
        stacked ? ok : null,
        cancelBtn,
        stacked ? null : ok));
    const untrap = trapEscape(() => finish(false));
    sheetRoot().append(backdrop, node);
    (stacked && cancelBtn ? cancelBtn : ok).focus();
  });
}

// Foglio d'azione: elenco di scelte più Annulla.
export function actionSheet({ title, actions }) {
  const backdrop = el('div', { class: 'backdrop dialog-backdrop', on: { click: () => close() } });
  let closed = false;
  const close = () => { if (closed) return; closed = true; untrap(); backdrop.remove(); node.remove(); };
  const node = el('div', { class: 'actionsheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Azioni' } },
    el('div', { class: 'actionsheet__group' },
      title ? el('div', { class: 'actionsheet__title', text: title }) : null,
      actions.map((a) => el('button', { type: 'button', text: a.label, class: a.destructive ? 'is-destructive' : '', on: { click: () => { close(); a.onClick(); } } }))),
    el('div', { class: 'actionsheet__group' }, el('button', { type: 'button', class: 'is-cancel', text: 'Annulla', on: { click: close } })));
  const untrap = trapEscape(close);
  sheetRoot().append(backdrop, node);
  node.querySelector('button')?.focus();
}

// Toast a pillola, con "Annulla" facoltativo.
export function toast(message, { undo, error = false, duration } = {}) {
  const root = document.getElementById('toast-root');
  const t = el('div', { class: 'toast' + (error ? ' toast--error' : ''), attrs: { role: error ? 'alert' : 'status' } }, el('span', { text: message }));
  let timer;
  const close = () => { clearTimeout(timer); t.remove(); };
  // Un solo toast alla volta: il nuovo sostituisce il precedente.
  for (const old of root.querySelectorAll('.toast')) old.remove();
  if (undo) t.append(el('button', { type: 'button', text: 'Annulla', on: { click: () => { close(); try { undo(); } catch (e) { toast(e.message || String(e), { error: true }); } } } }));
  root.append(t);
  timer = setTimeout(close, duration || (undo ? 6000 : 3500));
  return close;
}

// Esegue un'azione dello store mostrando gli errori all'utente.
export function attempt(fn) {
  try { return fn(); } catch (e) {
    if (e instanceof ValidationError || e instanceof StorageError) toast(e.message, { error: true });
    else { console.error(e); toast('Errore interno: ' + (e?.message || e), { error: true }); }
    return undefined;
  }
}

// Condivide un file se possibile, altrimenti lo scarica. AbortError (foglio chiuso) è silenzioso.
export async function shareOrDownload(file) {
  try {
    if (navigator.canShare && navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: file.name });
      return 'shared';
    }
  } catch (e) {
    if (e?.name === 'AbortError') return 'aborted';
    if (!['NotAllowedError', 'TypeError', 'DataError'].includes(e?.name)) throw e;
  }
  downloadFile(file);
  return 'downloaded';
}

export function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = el('a', { href: url, download: file.name, hidden: true });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// Ridisegna conservando il campo attivo (per id), la posizione del cursore e lo scroll.
export function preserveFocus(fn) {
  const a = document.activeElement;
  const id = a && a.id;
  let sel = null;
  try { sel = a && typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null; } catch { sel = null; }
  const y = window.scrollY;
  fn();
  window.scrollTo(0, y);
  if (id) {
    const n = document.getElementById(id);
    if (n && n !== document.activeElement) {
      n.focus({ preventScroll: true });
      if (sel) { try { n.setSelectionRange(sel[0], sel[1]); } catch { /* campo senza selezione */ } }
    }
  }
}

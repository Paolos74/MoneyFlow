// Helper DOM di MoneyFlow: el(), icone, fogli dal basso, avvisi, toast con Annulla,
// liste, chip, segmentato, campi, condivisione/download. Testo dell'utente solo con textContent.

import { iconSvg } from './icons.js';
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
export function row({ icon: ic, color, planned, title, subtitle, value, valueSub, valueClass, onClick, href, chevron = !!(onClick || href), cls = '', id, attrs }) {
  const tag = href ? 'a' : onClick ? 'button' : 'div';
  const node = el(tag, { class: `row ${ic ? '' : 'row--noicon'} ${cls}`, href, id, attrs: { type: tag === 'button' ? 'button' : null, ...(attrs || {}) }, on: onClick ? { click: onClick } : null },
    ic ? (ic instanceof Node ? ic : iconBox(ic, color, { planned })) : null,
    el('span', { class: 'row__main' },
      el('span', { class: 'row__title', text: title }),
      subtitle ? el('span', { class: 'row__sub' }, typeof subtitle === 'string' ? el('span', { text: subtitle }) : subtitle) : null),
    value !== undefined && value !== null ? el('span', { class: `row__value ${valueClass || ''}` }, value, valueSub ? el('small', { text: valueSub }) : null) : null,
    chevron ? el('span', { class: 'row__chev' }, icon('chevron')) : null);
  return node;
}

export function section({ title, action, footer, cls = '' }, ...content) {
  return el('section', { class: 'section ' + cls },
    title || action ? el('h2', { class: 'section-header' }, el('span', { text: title || '' }), action || null) : null,
    ...content,
    footer ? el('p', { class: 'section-footer' }, footer) : null);
}

export function list(...rows) {
  return el('div', { class: 'list' }, ...rows);
}

export function card({ title, link, cls = '' }, ...content) {
  return el('section', { class: 'card ' + cls },
    title || link ? el('div', { class: 'card__head' }, el('h2', { class: 'card__title', text: title || '' }), link || null) : null,
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

function trapEscape(onEsc) {
  const h = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onEsc(); } };
  document.addEventListener('keydown', h, true);
  return () => document.removeEventListener('keydown', h, true);
}

// Foglio dal basso "Annulla · Titolo · Salva". onSave lancia ValidationError per mostrare l'errore.
export function sheet({ title, saveLabel = 'Salva', onSave, onClose, content, cancelLabel = 'Annulla' }) {
  const prevFocus = document.activeElement;
  const body = el('div', { class: 'sheet__body' });
  const titleId = 'sheet-title-' + (++openSheets);
  const backdrop = el('div', { class: 'backdrop', on: { click: () => close() } });
  const saveBtn = onSave ? el('button', { class: 'topbar__btn', type: 'button', text: saveLabel, id: 'sheet-save', on: { click: () => save() } }) : el('span');
  const node = el('div', { class: 'sheet', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId } },
    el('div', { class: 'sheet__grabber', attrs: { 'aria-hidden': 'true' } }),
    el('div', { class: 'sheet__head' },
      el('button', { class: 'topbar__btn', type: 'button', text: onSave ? cancelLabel : 'Chiudi', id: 'sheet-cancel', on: { click: () => close() } }),
      el('div', { class: 'sheet__title', id: titleId, text: title }),
      saveBtn),
    body);
  let closed = false;
  const untrap = trapEscape(() => close());
  function close(result) {
    if (closed) return;
    closed = true;
    untrap();
    backdrop.remove();
    node.remove();
    onClose?.(result);
    if (prevFocus && document.contains(prevFocus)) prevFocus.focus?.();
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
  const api = { body, close, save, setTitle: (t) => { node.querySelector('.sheet__title').textContent = t; }, node };
  if (typeof content === 'function') content(api); else if (content) append(body, [content]);
  sheetRoot().append(backdrop, node);
  setTimeout(() => { if (!body.contains(document.activeElement)) (body.querySelector('[autofocus]') || saveBtn)?.focus?.(); }, 30);
  return api;
}

// Avviso centrato: la domanda come titolo, l'azione distruttiva in rosso. Risolve true/false.
export function confirmDialog({ title, message, confirmLabel = 'OK', cancelLabel = 'Annulla', destructive = false }) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const backdrop = el('div', { class: 'backdrop dialog-backdrop' });
    let done = false;
    const finish = (v) => { if (done) return; done = true; untrap(); backdrop.remove(); node.remove(); prevFocus?.focus?.(); resolve(v); };
    const ok = el('button', { type: 'button', text: confirmLabel, id: 'dialog-ok', class: destructive ? 'is-destructive' : '', on: { click: () => finish(true) } });
    const node = el('div', { class: 'dialog', attrs: { role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-msg' } },
      el('div', { class: 'dialog__body' },
        el('p', { class: 'dialog__title', id: 'dialog-title', text: title }),
        message ? el('p', { class: 'dialog__msg', id: 'dialog-msg', text: message }) : null),
      el('div', { class: 'dialog__actions' },
        cancelLabel ? el('button', { type: 'button', text: cancelLabel, id: 'dialog-cancel', on: { click: () => finish(false) } }) : null,
        ok));
    const untrap = trapEscape(() => finish(false));
    sheetRoot().append(backdrop, node);
    ok.focus();
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

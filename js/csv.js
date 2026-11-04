// Esportazione CSV dei movimenti: BOM, CRLF, date GG/MM/AAAA, formati ';' e ','.
// Protezione dalle formule sulle celle di testo; importi generati dall'app.

import { formatDateIt } from './dates.js';
import { formatEuroPlain, formatQtyPlain } from './money.js';
import { categoryLabel } from './calc.js';

export const CSV_FORMATS = {
  semicolon: { sep: ';', quoteNumbers: false, label: 'Excel italiano (;)' },
  comma: { sep: ',', quoteNumbers: true, label: 'Numbers, Google Fogli, iPhone (,)' },
};

const TYPE_LABELS = {
  uscita: 'Uscita', entrata: 'Entrata', trasferimento: 'Trasferimento',
  restituzione: 'Restituzione', variazione: 'Variazione quantità',
};

function quote(v, sep, force = false) {
  const s = String(v);
  if (force || s.includes(sep) || s.includes('"') || s.includes('\n') || s.includes('\r')) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function textCell(v, sep) {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return quote(s, sep);
}

function accountName(state, id) {
  const a = state.accounts.find((x) => x.id === id);
  if (!a) return 'Conto sconosciuto';
  let s = a.name + (a.kind === 'crypto' ? ` (${a.asset})` : '');
  if (a.deleted) s += ' (eliminato)';
  return s;
}

function amountText(state, m) {
  const a = state.accounts.find((x) => x.id === m.accountId);
  const crypto = a && a.kind === 'crypto';
  const v = m.type === 'uscita' ? -m.amount : m.amount;
  return crypto ? formatQtyPlain(v) : formatEuroPlain(v);
}

export function buildCsv(state, { from, to, format = 'semicolon' }) {
  const f = CSV_FORMATS[format] || CSV_FORMATS.semicolon;
  const sep = f.sep;
  const rows = [['Data', 'Conto', 'Tipo', 'Categoria', 'Descrizione', 'Importo'].join(sep)];
  const movs = state.movements
    .filter((m) => !m.deleted && m.date >= from && m.date <= to)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  for (const m of movs) {
    const conto = m.type === 'trasferimento'
      ? `${accountName(state, m.accountId)} → ${accountName(state, m.toAccountId)}`
      : accountName(state, m.accountId);
    const cat = m.type === 'uscita' || m.type === 'entrata' ? categoryLabel(state, m.categoryId) : '';
    rows.push([
      formatDateIt(m.date),
      textCell(conto, sep),
      textCell(TYPE_LABELS[m.type] || m.type, sep),
      textCell(cat, sep),
      textCell(m.description, sep),
      quote(amountText(state, m), sep, f.quoteNumbers),
    ].join(sep));
  }
  return '\uFEFF' + rows.join('\r\n') + '\r\n';
}

export function csvFileName(from, to) {
  return `MoneyFlow_movimenti_${from}_${to}.csv`;
}

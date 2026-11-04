// Backup JSON di MoneyFlow: crea, valida, legge. Tombstone e riferimenti orfani inclusi.
// Invariante: un backup creato dall'app passa sempre la propria validazione.

import { APP, SCHEMA_VERSION, KINDS, normalizeData, ValidationError } from './store.js';
import { todayISO } from './dates.js';

export function createBackup(state, now = Date.now()) {
  const out = { ...state, app: APP, schemaVersion: SCHEMA_VERSION, exportedAt: new Date(now).toISOString() };
  for (const col of Object.values(KINDS)) out[col] = state[col].map((r) => ({ ...r }));
  return out;
}

export function validateBackup(obj) {
  if (!obj || typeof obj !== 'object' || obj.app !== APP) throw new ValidationError('Il file non è un backup di MoneyFlow');
  if (Number.isSafeInteger(obj.schemaVersion) && obj.schemaVersion > SCHEMA_VERSION) {
    throw new ValidationError("Il backup viene da una versione più nuova di MoneyFlow: aggiorna l'app e riprova");
  }
  const data = normalizeData(obj);
  if (!data) throw new ValidationError('Il backup è danneggiato: mancano o non sono validi alcuni elenchi');
  delete data.exportedAt;
  return data;
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(String(text).replace(/^\uFEFF/, '')); } catch { throw new ValidationError('Il file non è un JSON valido'); }
  return validateBackup(obj);
}

// Conteggi per il riepilogo prima di importare.
export function backupSummary(data) {
  const n = (list) => list.filter((r) => !r.deleted).length;
  return { accounts: n(data.accounts), categories: n(data.categories), movements: n(data.movements), scheduled: n(data.scheduled), goals: n(data.goals) };
}

export function backupFileName(now = Date.now()) {
  return `MoneyFlow_backup_${todayISO(new Date(now))}.json`;
}

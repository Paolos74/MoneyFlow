// Preferenze di questo dispositivo (tema, formato CSV, ultimo backup…): non si sincronizzano.

export const PREFS_KEY = 'moneyflow:prefs';

export const DEFAULT_PREFS = {
  theme: 'auto',
  csvFormat: 'semicolon',
  lastBackupAt: 0,
  firstUseAt: 0,
  lastPeriod: 'mese',
  beforeImportKey: '',
  budgetPeriod: 'calendar', // v4: 'calendar' (mese di calendario) | 'salary' (dallo stipendio)
};

export function createPrefs(storage, now = () => Date.now()) {
  let prefs = read();
  if (!prefs.firstUseAt) {
    prefs.firstUseAt = now();
    write();
  }

  function read() {
    try {
      const raw = JSON.parse(storage.getItem(PREFS_KEY) || 'null');
      return { ...DEFAULT_PREFS, ...(raw && typeof raw === 'object' ? raw : {}) };
    } catch { return { ...DEFAULT_PREFS }; }
  }
  function write() {
    try { storage.setItem(PREFS_KEY, JSON.stringify(prefs)); return true; } catch { return false; }
  }

  return {
    get: () => ({ ...prefs }),
    set(patch) { prefs = { ...prefs, ...patch }; return write(); },
    reload() { prefs = read(); },
  };
}

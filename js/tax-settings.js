// Impostazioni della stima delle tasse, solo su questo dispositivo (non sincronizzate, non nel backup):
// data di inizio rapporto, % addizionali, proiezione dei mesi mancanti scritta a mano per anno.

export const TAX_KEY = 'moneyflow:tax';

export const DEFAULT_TAX = { hireDate: null, regionalBp: null, municipalBp: null, years: {} };

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

export function createTaxSettings(storage) {
  let data = read();

  function read() {
    try {
      const raw = JSON.parse(storage.getItem(TAX_KEY) || 'null');
      if (!isObj(raw)) return { ...DEFAULT_TAX, years: {} };
      return { ...DEFAULT_TAX, ...raw, years: isObj(raw.years) ? { ...raw.years } : {} };
    } catch { return { ...DEFAULT_TAX, years: {} }; }
  }
  function write(next) {
    try { storage.setItem(TAX_KEY, JSON.stringify(next)); data = next; return true; } catch { return false; }
  }

  return {
    get: () => ({ ...data, years: { ...data.years } }),
    year: (y) => ({ projTaxable: null, projIrpef: null, ...(data.years[String(y)] || {}) }),
    set(patch) { return write({ ...data, ...patch, years: { ...data.years } }); },
    setYear(y, patch) {
      const k = String(y);
      return write({ ...data, years: { ...data.years, [k]: { projTaxable: null, projIrpef: null, ...(data.years[k] || {}), ...patch } } });
    },
    reload() { data = read(); },
  };
}

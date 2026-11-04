// Lettura delle voci di una busta paga dalle righe di testo del PDF (layout con codici voce: I01, I21, 900, 60450).
// Importi in formato italiano ("2.415,05", "870,15-": il meno finale indica una trattenuta) → centesimi positivi.

const AMOUNT = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})-?$/;

// "3312,45" → 331245; "2.415,05" → 241505; "870,15-" → 87015. null se non è un importo.
export function parseItAmount(s) {
  const m = AMOUNT.exec(String(s ?? '').trim());
  if (!m) return null;
  const cents = Number(m[1].replace(/\./g, '')) * 100 + Number(m[2]);
  return Number.isSafeInteger(cents) ? cents : null;
}

const tokens = (line) => line.split(/\s+/).filter(Boolean);
const amounts = (line) => tokens(line).map(parseItAmount).filter((v) => v !== null);
const lastAmount = (line) => { const a = amounts(line); return a.length ? a[a.length - 1] : null; };

export const PAYSLIP_KEYS = ['net', 'gross', 'contributions', 'taxable', 'irpef', 'pension'];

// Righe → { gross, contributions, taxable, irpef, pension, net, month, year, found, missing }.
// Le detrazioni del mese non si leggono (campo da compilare a mano).
export function parsePayslipLines(lines) {
  const out = { gross: null, contributions: null, taxable: null, irpef: null, pension: null, net: null, month: null, year: null };
  const list = (lines || []).map((l) => String(l).replace(/\s+/g, ' ').trim());
  const setOnce = (k, v) => { if (out[k] === null && v !== null) out[k] = v; };
  list.forEach((line, i) => {
    const tk = tokens(line);
    if (tk.includes('I01')) setOnce('taxable', lastAmount(line));
    if (tk.includes('I21')) setOnce('irpef', lastAmount(line));
    if (tk.includes('60450')) setOnce('pension', lastAmount(line));
    if (tk[0] === '900' && /ritenute sociali/i.test(line)) setOnce('contributions', lastAmount(line));
    if (tk[0] === 'Ferie' && tk.length >= 3 && parseItAmount(tk[tk.length - 1]) !== null && parseItAmount(tk[tk.length - 2]) !== null) {
      setOnce('gross', parseItAmount(tk[tk.length - 1]));
    }
    const netAt = line.toUpperCase().indexOf('NETTO A PAGARE');
    if (netAt >= 0 && out.net === null) {
      const after = amounts(line.slice(netAt + 14));
      if (after.length) out.net = after[0];
      else {
        for (let j = i + 1; j <= i + 3 && j < list.length; j++) {
          const a = amounts(list[j]);
          if (a.length) { out.net = a[0]; break; }
        }
      }
    }
    if (out.month === null) {
      const m = /\b\d{2}-\d{2}-\d{4}\s+(\d{1,2})\s+(\d{4})\b/.exec(line);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { out.month = Number(m[1]); out.year = Number(m[2]); }
    }
  });
  out.found = PAYSLIP_KEYS.filter((k) => out[k] !== null);
  out.missing = PAYSLIP_KEYS.filter((k) => out[k] === null);
  return out;
}

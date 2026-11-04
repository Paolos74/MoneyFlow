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
// Importi con il gettone originale: serve a sapere se c'è il punto delle migliaia.
const amountTokens = (line) => tokens(line).map((t) => ({ t, v: parseItAmount(t) })).filter((a) => a.v !== null);

// Moduli a caratteri fissi: "2 . 4 3 8 , 9 9" → "2.438,99". Si uniscono solo le sequenze di 3 o più
// gettoni da un carattere fatti di cifre, punto, virgola o meno; i gettoni normali restano come sono.
function joinSpacedNumbers(line) {
  const tk = tokens(line);
  const out = [];
  let run = [];
  const flush = () => {
    if (run.length >= 3) out.push(run.join(''));
    else out.push(...run);
    run = [];
  };
  for (const t of tk) {
    if (/^[\d.,-]$/.test(t)) run.push(t);
    else { flush(); out.push(t); }
  }
  flush();
  return out.join(' ');
}

const NET_LABEL = 'NETTOAPAGARE';
const NET_TOLERANCE = 100; // centesimi: arrotondamenti della busta

// Posizione dell'etichetta "NETTO A PAGARE" nella riga, anche con le lettere spaziate: { start, end } o null.
function findNetLabel(line) {
  const map = [];
  let compact = '';
  for (let i = 0; i < line.length; i++) {
    if (/\s/.test(line[i])) continue;
    compact += line[i].toUpperCase();
    map.push(i);
  }
  const at = compact.indexOf(NET_LABEL);
  if (at < 0) return null;
  return { start: map[at], end: map[at + NET_LABEL.length - 1] + 1 };
}

export const PAYSLIP_KEYS = ['net', 'gross', 'contributions', 'taxable', 'irpef', 'pension'];

// Righe → { gross, contributions, taxable, irpef, pension, net, netComputed, month, year, found, missing }.
// Le detrazioni del mese non si leggono (campo da compilare a mano).
// Netto: importi vicino a "NETTO A PAGARE" (stessa riga dopo, stessa riga prima, fino a 3 righe sotto, fino a 3 sopra);
// vince quello uguale a Totale competenze − Totale ritenute della riga Ferie (scarto ≤ 1,00 €), altrimenti il primo
// con il punto delle migliaia, altrimenti il primo. Senza etichetta: l'importo con il punto delle migliaia uguale
// all'atteso; se non c'è, il netto è l'atteso stesso (netComputed = true, da controllare sulla busta).
export function parsePayslipLines(lines) {
  const out = { gross: null, contributions: null, taxable: null, irpef: null, pension: null, net: null, netComputed: false, month: null, year: null };
  const list = (lines || []).map((l) => joinSpacedNumbers(String(l).replace(/\s+/g, ' ').trim()));
  const setOnce = (k, v) => { if (out[k] === null && v !== null) out[k] = v; };
  let withheld = null;
  let labelAt = -1;
  let label = null;
  list.forEach((line, i) => {
    const tk = tokens(line);
    if (tk.includes('I01')) setOnce('taxable', lastAmount(line));
    if (tk.includes('I21')) setOnce('irpef', lastAmount(line));
    if (tk.includes('60450')) setOnce('pension', lastAmount(line));
    if (tk[0] === '900' && /ritenute sociali/i.test(line)) setOnce('contributions', lastAmount(line));
    if (tk[0] && tk[0].toLowerCase() === 'ferie' && tk.length >= 3 && out.gross === null) {
      const comp = parseItAmount(tk[tk.length - 1]);
      const rit = parseItAmount(tk[tk.length - 2]);
      if (comp !== null && rit !== null) { out.gross = comp; withheld = rit; }
    }
    if (labelAt < 0) {
      const f = findNetLabel(line);
      if (f) { labelAt = i; label = f; }
    }
    if (out.month === null) {
      const m = /\b\d{2}-\d{2}-\d{4}\s+(\d{1,2})\s+(\d{4})\b/.exec(line);
      if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) { out.month = Number(m[1]); out.year = Number(m[2]); }
    }
  });

  const expected = out.gross !== null && withheld !== null && out.gross > withheld ? out.gross - withheld : null;
  const matches = (v) => expected !== null && Math.abs(v - expected) <= NET_TOLERANCE;
  const dotted = (a) => a.t.includes('.');
  if (labelAt >= 0) {
    const line = list[labelAt];
    const cands = [...amountTokens(line.slice(label.end)), ...amountTokens(line.slice(0, label.start))];
    for (let j = labelAt + 1; j <= labelAt + 3 && j < list.length; j++) cands.push(...amountTokens(list[j]));
    for (let j = labelAt - 1; j >= labelAt - 3 && j >= 0; j--) cands.push(...amountTokens(list[j]));
    const pick = cands.find((a) => matches(a.v)) || cands.find(dotted) || cands[0];
    if (pick) out.net = pick.v;
  }
  if (out.net === null && expected !== null) {
    const all = list.flatMap(amountTokens);
    const pick = all.find((a) => dotted(a) && matches(a.v));
    if (pick) out.net = pick.v;
    else { out.net = expected; out.netComputed = true; }
  }
  out.found = PAYSLIP_KEYS.filter((k) => out[k] !== null);
  out.missing = PAYSLIP_KEYS.filter((k) => out[k] === null);
  return out;
}

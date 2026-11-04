// Test del lettore PDF (js/pdf-text.js) e della lettura delle voci (js/payslip.js).
// I PDF sono sintetici con dati inventati, creati da tools/make_payslip_pdf.py: il PDF reale non è disponibile.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extractPdfLines, PdfReadError } from '../js/pdf-text.js';
import { parseItAmount, parsePayslipLines } from '../js/payslip.js';

const fixture = (name) => new Uint8Array(readFileSync(new URL('./fixtures/' + name, import.meta.url)));
const EXPECTED = { gross: 325000, contributions: 29861, pension: 9750, taxable: 285389, irpef: 51240, net: 243899, month: 4, year: 2026 };

for (const name of ['busta-paga-sintetica.pdf', 'busta-paga-sintetica-cid.pdf']) {
  test(`PDF sintetico ${name}: voci lette`, async () => {
    const lines = await extractPdfLines(fixture(name));
    assert.ok(lines.includes('I01 Impon. fiscale mese 2853,89'));
    assert.ok(lines.includes('I21 Irpef netta 512,40-'));
    assert.ok(lines.includes('Descrizione voce (dati inventati)'));
    const r = parsePayslipLines(lines);
    for (const [k, v] of Object.entries(EXPECTED)) assert.equal(r[k], v, k);
    assert.deepEqual(r.missing, []);
  });
}

test('importi in formato italiano', () => {
  assert.equal(parseItAmount('3312,45'), 331245);
  assert.equal(parseItAmount('2.415,05'), 241505);
  assert.equal(parseItAmount('870,15-'), 87015);
  assert.equal(parseItAmount('12.34,00'), null);
  assert.equal(parseItAmount('12,5'), null);
  assert.equal(parseItAmount('abc'), null);
});

test('righe di esempio del layout reale (valori di esempio)', () => {
  const r = parsePayslipLines([
    '23-10-2026 10 2026',
    'Ferie 12,50 4,00 8,50 1201,10 3870,25',
    '900 Totale ritenute sociali 455,20',
    '60450 Ctr. fiscalmente deducib. 101,30',
    'I01 Impon. fiscale mese 3312,45',
    'I11 Imposta lorda 33,00 870,15',
    'I21 Irpef netta 870,15-',
    'NETTO A PAGARE',
    'Banca: bonifico',
    '2.415,05',
  ]);
  assert.equal(r.taxable, 331245);
  assert.equal(r.irpef, 87015);
  assert.equal(r.gross, 387025);
  assert.equal(r.contributions, 45520);
  assert.equal(r.pension, 10130);
  assert.equal(r.net, 241505);
  assert.equal(r.month, 10);
  assert.equal(r.year, 2026);
  // la riga I11 da sola non vale come I01 o I21
  const only = parsePayslipLines(['I11 Imposta lorda 33,00 870,15']);
  assert.equal(only.taxable, null);
  assert.equal(only.irpef, null);
  assert.deepEqual(only.found, []);
  assert.equal(parsePayslipLines(['01-01-2026 13 2026']).month, null);
});

const ascii = (s) => new TextEncoder().encode(s);

async function rejectsWith(bytes, re) {
  await assert.rejects(extractPdfLines(bytes), (e) => e instanceof PdfReadError && re.test(e.message));
}

test('file non PDF, PDF cifrato, PDF senza testo', async () => {
  await rejectsWith(ascii('Ciao, questo non è un PDF'), /non è un PDF/);
  await rejectsWith(ascii('%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\ntrailer\n<< /Root 1 0 R /Encrypt 5 0 R >>\n%%EOF\n'), /protetto/);
  const empty = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'
    + '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'
    + '3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n'
    + '4 0 obj\n<< /Length 18 >>\nstream\n0 0 m 100 100 l S\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n';
  await rejectsWith(ascii(empty), /scansione/);
});

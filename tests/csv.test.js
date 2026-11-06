// Test di js/csv.js confrontati byte per byte nei due formati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCsv, csvFileName } from '../js/csv.js';

const state = {
  accounts: [
    { id: 'a1', name: 'Revolut', kind: 'eur', asset: null, initial: 0, deleted: false },
    { id: 'a2', name: 'Coinbase', kind: 'crypto', asset: 'BTC', initial: 0, deleted: false },
    { id: 'a3', name: 'Vecchio', kind: 'eur', asset: null, initial: 0, deleted: true },
  ],
  categories: [
    { id: 'c1', name: 'Ristoranti', type: 'uscita', deleted: false },
    { id: 'c2', name: 'Stipendio', type: 'entrata', deleted: false },
  ],
  movements: [
    { id: 'm2', type: 'entrata', date: '2025-03-01', amount: 150000, accountId: 'a1', categoryId: 'c2', description: 'Marzo', createdAt: 2, deleted: false },
    { id: 'm1', type: 'uscita', date: '2025-03-01', amount: 4000, excluded: 2000, accountId: 'a1', categoryId: 'c1', description: 'Cena; "amici", ok', createdAt: 1, deleted: false },
    { id: 'm3', type: 'uscita', date: '2025-03-02', amount: 1250, accountId: 'a3', categoryId: 'c1', description: '=SOMMA(A1)', createdAt: 3, deleted: false },
    { id: 'm4', type: 'trasferimento', date: '2025-03-03', amount: 10000, amountTo: 5000000, accountId: 'a1', toAccountId: 'a2', description: '-x\nriga', createdAt: 4, deleted: false },
    { id: 'm5', type: 'restituzione', date: '2025-03-04', amount: 2000, accountId: 'a1', refundOf: 'm1', description: '@mario', createdAt: 5, deleted: false },
    { id: 'm6', type: 'variazione', date: '2025-03-05', amount: -1000, accountId: 'a2', description: '+fee', createdAt: 6, deleted: false },
    { id: 'm7', type: 'uscita', date: '2025-03-06', amount: 1, accountId: 'a1', categoryId: 'zz', description: '', createdAt: 7, deleted: true },
    { id: 'm9', type: 'uscita', date: '2025-03-07', amount: 1000, excluded: 1000, accountId: 'a1', categoryId: 'c1', description: 'Per un amico', createdAt: 9, deleted: false },
    { id: 'm8', type: 'uscita', date: '2025-04-01', amount: 1, accountId: 'a1', categoryId: 'c1', description: 'fuori', createdAt: 8, deleted: false },
  ],
};

test('formato ; (Excel italiano)', () => {
  const expected = '\uFEFF' + [
    'Data;Conto;Tipo;Categoria;Descrizione;Importo',
    '01/03/2025;Revolut;Uscita;Ristoranti;"Cena; ""amici"", ok";-20,00',
    '01/03/2025;Revolut;Entrata;Stipendio;Marzo;1500,00',
    "02/03/2025;Vecchio (eliminato);Uscita;Ristoranti;'=SOMMA(A1);-12,50",
    `03/03/2025;Revolut → Coinbase (BTC);Trasferimento;;"'-x\nriga";100,00`,
    "04/03/2025;Revolut;Restituzione;;'@mario;20,00",
    "05/03/2025;Coinbase (BTC);Variazione quantità;;'+fee;-0,00001",
    '07/03/2025;Revolut;Uscita;Ristoranti;Per un amico;0,00',
  ].join('\r\n') + '\r\n';
  assert.equal(buildCsv(state, { from: '2025-03-01', to: '2025-03-31', format: 'semicolon' }), expected);
});

test('formato , (Numbers, Google Fogli) con importi tra virgolette', () => {
  const expected = '\uFEFF' + [
    'Data,Conto,Tipo,Categoria,Descrizione,Importo',
    '01/03/2025,Revolut,Uscita,Ristoranti,"Cena; ""amici"", ok","-20,00"',
    '01/03/2025,Revolut,Entrata,Stipendio,Marzo,"1500,00"',
    "02/03/2025,Vecchio (eliminato),Uscita,Ristoranti,'=SOMMA(A1),\"-12,50\"",
    `03/03/2025,Revolut → Coinbase (BTC),Trasferimento,,"'-x\nriga","100,00"`,
    "04/03/2025,Revolut,Restituzione,,'@mario,\"20,00\"",
    "05/03/2025,Coinbase (BTC),Variazione quantità,,'+fee,\"-0,00001\"",
    '07/03/2025,Revolut,Uscita,Ristoranti,Per un amico,"0,00"',
  ].join('\r\n') + '\r\n';
  assert.equal(buildCsv(state, { from: '2025-03-01', to: '2025-03-31', format: 'comma' }), expected);
});

test('nome del file', () => {
  assert.equal(csvFileName('2025-03-01', '2025-03-31'), 'MoneyFlow_movimenti_2025-03-01_2025-03-31.csv');
});

test('v4: interessi come Entrata · Interessi, rettifica come "Rettifica saldo"', () => {
  const s = {
    accounts: [{ id: 'd', name: 'Deposito', kind: 'eur', asset: null, initial: 0, deleted: false }],
    categories: [{ id: 'default-entrata-interessi', name: 'Interessi', type: 'entrata', deleted: false }],
    movements: [
      { id: 'interest-d-2026-03', type: 'entrata', date: '2026-03-31', amount: 152, accountId: 'd', categoryId: 'default-entrata-interessi', description: 'Interessi Marzo 2026', interest: { accountId: 'd', month: '2026-03' }, createdAt: 1, deleted: false },
      { id: 'align-d-2026-03-31', type: 'variazione', date: '2026-03-31', amount: -37, accountId: 'd', align: { balance: 100000 }, description: 'Allineamento al saldo reale', createdAt: 2, deleted: false },
    ],
  };
  assert.equal(buildCsv(s, { from: '2026-03-01', to: '2026-03-31' }), '\uFEFF' + [
    'Data;Conto;Tipo;Categoria;Descrizione;Importo',
    '31/03/2026;Deposito;Entrata;Interessi;Interessi Marzo 2026;1,52',
    '31/03/2026;Deposito;Rettifica saldo;;Allineamento al saldo reale;-0,37',
  ].join('\r\n') + '\r\n');
});

test('v5: Compra e Vendi ETF come Trasferimento con l\'importo in euro, dividendo come Entrata · Dividendi', () => {
  const s = {
    accounts: [{ id: 'a1', name: 'Conto principale', kind: 'eur', asset: null, initial: 0, deleted: false }],
    investments: [{ id: 'e1', name: 'Mondo prova', deleted: false }, { id: 'e2', name: 'ETF Bond prova', deleted: true }],
    categories: [{ id: 'default-entrata-dividendi', name: 'Dividendi', type: 'entrata', deleted: false }],
    movements: [
      { id: 'm1', type: 'trasferimento', trade: 'compra', date: '2026-11-02', amount: 50100, amountTo: 1000000000, price: 500000, accountId: 'a1', toAccountId: 'e1', etfId: 'e1', description: '', createdAt: 1, deleted: false },
      { id: 'm2', type: 'trasferimento', trade: 'vendi', date: '2026-11-18', amount: 600000000, amountTo: 34699, tax: 1201, price: 600000, accountId: 'e1', toAccountId: 'a1', etfId: 'e1', description: '', createdAt: 2, deleted: false },
      { id: 'm3', type: 'entrata', date: '2026-11-21', amount: 3000, accountId: 'a1', categoryId: 'default-entrata-dividendi', etfId: 'e1', description: 'Cedola', createdAt: 3, deleted: false },
      { id: 'm4', type: 'trasferimento', trade: 'compra', date: '2026-11-22', amount: 10000, amountTo: 100000000, price: 1000000, accountId: 'a1', toAccountId: 'e2', etfId: 'e2', description: '', createdAt: 4, deleted: false },
    ],
  };
  assert.equal(buildCsv(s, { from: '2026-11-01', to: '2026-11-30' }), '\uFEFF' + [
    'Data;Conto;Tipo;Categoria;Descrizione;Importo',
    '02/11/2026;Conto principale → ETF Mondo prova;Trasferimento;;;501,00',
    '18/11/2026;ETF Mondo prova → Conto principale;Trasferimento;;;346,99',
    '21/11/2026;Conto principale;Entrata;Dividendi;Cedola;30,00',
    '22/11/2026;Conto principale → ETF Bond prova (eliminato);Trasferimento;;;100,00',
  ].join('\r\n') + '\r\n');
  assert.equal(buildCsv(s, { from: '2026-11-01', to: '2026-11-30', format: 'comma' }).split('\r\n')[2], '18/11/2026,ETF Mondo prova → Conto principale,Trasferimento,,,"346,99"');
});

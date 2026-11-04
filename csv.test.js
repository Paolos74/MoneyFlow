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

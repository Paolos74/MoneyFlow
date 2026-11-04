// Test di js/charts.js: archi della ciambella, nessun NaN con dati vuoti, testi escapati.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { donut, donutArcs, bars, line } from '../js/charts.js';

test('la somma degli archi è 360°', () => {
  const arcs = donutArcs([3, 1, 0, 6]);
  assert.equal(arcs[0].start, 0);
  assert.equal(arcs.at(-1).end, 360);
  const sum = arcs.reduce((t, a) => t + (a.end - a.start), 0);
  assert.ok(Math.abs(sum - 360) < 1e-9);
  assert.deepEqual(donutArcs([0, 0]), []);
});

test('nessun NaN o Infinity con dati vuoti o piatti', () => {
  for (const s of [donut([]), donut([{ label: 'a', value: 5, color: '#112233' }]), bars([]), bars([{ label: 'Gen', income: 0, expense: 0 }]),
    line([]), line([{ label: 'Gen', value: 0 }]), line([{ label: 'a', value: 5 }, { label: 'b', value: 5 }]), line([{ label: 'a', value: -5 }, { label: 'b', value: 9 }])]) {
    assert.ok(!/NaN|Infinity|undefined/.test(s), s);
    assert.ok(s.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'));
  }
});

test('testi escapati, colori non validi neutralizzati, niente style inline', () => {
  const s = donut([{ label: '<b>"x"&\'', value: 1, color: 'red;evil' }, { label: 'y', value: 1, color: '#00FF00' }], { center: '<script>' });
  assert.ok(s.includes('&lt;b&gt;&quot;x&quot;&amp;&#39;'));
  assert.ok(s.includes('&lt;script&gt;'));
  assert.ok(!s.includes('<script>'));
  assert.ok(!s.includes('red;evil'));
  assert.ok(!/style=/.test(s + bars([{ label: '<', income: 1, expense: 2 }]) + line([{ label: '>', value: 1 }])));
});

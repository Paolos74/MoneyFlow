// Test di js/prefs.js: valori predefiniti, primo uso, salvataggio.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPrefs, PREFS_KEY } from '../js/prefs.js';
import { memoryStorage } from './helpers.js';

test('predefiniti e firstUseAt al primo avvio', () => {
  const storage = memoryStorage();
  const p = createPrefs(storage, () => 1000);
  assert.equal(p.get().theme, 'auto');
  assert.equal(p.get().csvFormat, 'semicolon');
  assert.equal(p.get().firstUseAt, 1000);
  p.set({ theme: 'dark', csvFormat: 'comma' });
  const q = createPrefs(storage, () => 2000);
  assert.deepEqual([q.get().theme, q.get().csvFormat, q.get().firstUseAt], ['dark', 'comma', 1000]);
});

test('preferenze illeggibili → predefiniti', () => {
  const storage = memoryStorage({ [PREFS_KEY]: '{x' });
  assert.equal(createPrefs(storage, () => 1).get().theme, 'auto');
});

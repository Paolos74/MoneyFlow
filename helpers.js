// Strumenti comuni ai test: storage in memoria, orologio e uuid prevedibili.

export function memoryStorage(initial = {}, { failOn = null } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    failOn,
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem(k, v) {
      if (this.failOn && this.failOn(k, v)) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      map.set(k, String(v));
    },
    removeItem: (k) => map.delete(k),
  };
}

export function clock(start = 1735732800000) {
  let t = start;
  const fn = () => t;
  fn.advance = (ms) => { t += ms; };
  fn.set = (v) => { t = v; };
  return fn;
}

export function seqUuid(prefix = 'id') {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(4, '0')}`;
}

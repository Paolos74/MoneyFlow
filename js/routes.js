// Rotte di MoneyFlow (v4), funzione pura: percorso e query dell'hash → vista e scheda, oppure reindirizzamento.
// Schede: home, movimenti, budget, statistiche, conti. Le rotte vecchie si reindirizzano con la query conservata.

const withQuery = (target, query = {}) => {
  const s = new URLSearchParams(Object.entries(query).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();
  return target + (s ? '?' + s : '');
};

// path: ['conti', '<id>'], query: { mese: '2026-03' } → { name, tab } | { redirect: 'percorso?query' }
export function resolveRoute(path = [], query = {}) {
  const [a, b] = path;
  switch (a) {
    case 'home': return { name: 'home', tab: 'home' };
    case 'da-confermare': return { name: 'da-confermare', tab: 'home' };
    case 'da-ricevere': return { name: 'da-ricevere', tab: 'home' };
    case 'programmati': return { name: 'programmati', tab: 'home' };
    case 'movimenti': return { name: 'movimenti', tab: 'movimenti' };
    // v1–v3: il calendario era una scheda; ora è la vista "Calendario" di Movimenti.
    case 'calendario': return { redirect: withQuery('movimenti', { vista: 'calendario', ...query }) };
    case 'budget': return { name: 'budget', tab: 'budget' };
    case 'statistiche':
      if (b === 'stipendio') return { name: 'stipendio', tab: 'statistiche' };
      if (b === 'fondo-pensione') return { name: 'fondo-pensione', tab: 'statistiche' };
      return { name: 'statistiche', tab: 'statistiche' };
    case 'conti':
      if (b === 'obiettivi') return { redirect: withQuery('budget/obiettivi', query) };
      return b ? { name: 'conto', tab: 'conti' } : { name: 'conti', tab: 'conti' };
    case 'obiettivi':
      return b ? { name: 'obiettivo', tab: 'budget' } : { redirect: withQuery('budget/obiettivi', query) };
    case 'impostazioni':
      if (b === 'fondo-pensione') return { redirect: withQuery('statistiche/fondo-pensione', query) };
      return { name: 'impostazioni', tab: 'home' };
    default: return { redirect: 'home' };
  }
}

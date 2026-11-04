// Applica il tema salvato prima del primo disegno (script classico, niente moduli).
// Imposta data-theme su <html> e il colore della barra del sistema.
(function () {
  var theme = 'auto';
  try {
    var p = JSON.parse(localStorage.getItem('moneyflow:prefs') || 'null');
    if (p && (p.theme === 'light' || p.theme === 'dark')) theme = p.theme;
  } catch (e) { /* preferenze illeggibili: tema automatico */ }
  var root = document.documentElement;
  root.setAttribute('data-theme', theme);
  var dark = theme === 'dark' || (theme === 'auto' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#0B0F0D' : '#F2F5F3');
})();

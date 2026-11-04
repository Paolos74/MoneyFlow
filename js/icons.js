// Icone SVG inline in stile SF Symbols (tratto arrotondato, 24×24, colore dal testo).

const P = {
  home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v10.5h4.5v-6h4v6h4.5V9"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20h16"/><rect x="5.5" y="11" width="3" height="6.5" rx="1"/><rect x="10.5" y="6" width="3" height="11.5" rx="1"/><rect x="15.5" y="13" width="3" height="4.5" rx="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="13.5" rx="3"/><path d="M3 10h18"/><path d="M16 14.5h2"/><path d="M6 6 15.5 3.5 17 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/><circle cx="12" cy="12" r="6.5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  left: '<path d="m14.5 6-6 6 6 6"/>',
  right: '<path d="m9.5 6 6 6-6 6"/>',
  trash: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13"/>',
  transfer: '<path d="M4 8h14l-3.5-3.5M20 16H6l3.5 3.5"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor"/>',
  cloud: '<path d="M7 18.5h10.5a4 4 0 0 0 .5-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18.5Z"/>',
  down: '<path d="M12 4v15M6 13l6 6 6-6"/>',
  up: '<path d="M12 20V5M6 11l6-6 6 6"/>',
  star: '<path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8Z"/>',
  wifiOff: '<path d="M3 3l18 18M8.5 16a5 5 0 0 1 7 0M5 12.5a10 10 0 0 1 4-2.3M19 12.5a10 10 0 0 0-3.3-2M2 9a15 15 0 0 1 4.5-2.8M22 9a15 15 0 0 0-10-3.9"/><circle cx="12" cy="19.5" r=".8" fill="currentColor"/>',
  note: '<path d="M6 3.5h8.5L19 8v12.5H6Z"/><path d="M14 3.5V8.5h5M9 13h7M9 16.5h5"/>',
  repeat: '<path d="M4 11V9a3 3 0 0 1 3-3h12l-3-3M20 13v2a3 3 0 0 1-3 3H5l3 3"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  download: '<path d="M12 4v11M7 10.5l5 5 5-5M4.5 19.5h15"/>',
  upload: '<path d="M12 16V5M7 9.5l5-5 5 5M4.5 19.5h15"/>',
  coin: '<ellipse cx="12" cy="7" rx="7.5" ry="3"/><path d="M4.5 7v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V7M4.5 12v5c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-5"/>',
  doc: '<path d="M6 3.5h8.5L19 8v12.5H6Z"/><path d="M14 3.5V8.5h5M9 12.5h7M9 16h7"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5"/><circle cx="12" cy="7.8" r=".8" fill="currentColor"/>',
  phone: '<rect x="6.5" y="2.5" width="11" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  alert: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5"/><circle cx="12" cy="17.2" r=".8" fill="currentColor"/>',
  palette: '<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.4.3-2.8 1.8-2.8h1.7a3.5 3.5 0 0 0 3.5-3.5c0-4.7-3.8-8.5-8.5-8.5Z"/><circle cx="7.8" cy="11" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/><circle cx="15" cy="7.8" r="1" fill="currentColor"/>',
  tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8Z"/><circle cx="8" cy="9" r="1.3"/>',
  gauge: '<path d="M4 17a8.5 8.5 0 1 1 16 0"/><path d="m12 15 4-5"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
  hand: '<path d="M3.5 13.5h3l3.5 2h4a1.5 1.5 0 0 0 0-3h-2.5"/><path d="M6.5 19.5h8l6-4.5a1.6 1.6 0 0 0-2-2.5L14.5 15"/><circle cx="15.5" cy="6.5" r="3"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
  // Icone di categorie e conti (v4), stile SF Symbols: 24×24, tratto 1,9 arrotondato, colore dal testo. I nomi non cambiano.
  house: '<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5h10.3L20 7.5H6.5"/><circle cx="9.5" cy="19" r="1.5"/><circle cx="16.5" cy="19" r="1.5"/>',
  car: '<path d="M5.5 11.5 7 7.2A2.5 2.5 0 0 1 9.4 5.5h5.2A2.5 2.5 0 0 1 17 7.2l1.5 4.3"/><rect x="3.5" y="11.5" width="17" height="6" rx="2"/><path d="M6.5 17.5v2M17.5 17.5v2"/><circle cx="7.5" cy="14.5" r="1" fill="currentColor"/><circle cx="16.5" cy="14.5" r="1" fill="currentColor"/>',
  bolt: '<path d="M13.5 3 5.5 13.5H12L10.5 21l8-10.5H12Z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.3 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z"/>',
  ticket: '<path d="M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4Z"/><path d="M14 7.5v10" stroke-dasharray="1.5 2"/>',
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6"/><path d="M17 21V3c-2 1.5-3 4-3 7v3h3"/>',
  gift: '<rect x="4" y="9" width="16" height="11.5" rx="1.5"/><path d="M3 9h18M12 9v11.5"/><path d="M12 9c-2.5 0-5-1-5-3a2 2 0 0 1 4 0c0 1.5 1 3 1 3s1-1.5 1-3a2 2 0 0 1 4 0c0 2-2.5 3-5 3Z"/>',
  briefcase: '<rect x="3.5" y="7.5" width="17" height="12" rx="2.5"/><path d="M9 7.5V5.5h6v2M3.5 12.5h17"/>',
  return: '<path d="M9 8 4.5 12.5 9 17"/><path d="M4.5 12.5h11a4 4 0 0 0 0-8H13"/>',
  percent: '<path d="M18.5 5.5 5.5 18.5"/><circle cx="7.5" cy="7.5" r="2.3"/><circle cx="16.5" cy="16.5" r="2.3"/>',
  plane: '<path d="M12 3c.9 0 1.5.8 1.5 1.8V10l7 4v2l-7-2v4l2 1.5V21L12 20l-3.5 1v-1.5l2-1.5v-4l-7 2v-2l7-4V4.8C10.5 3.8 11.1 3 12 3Z"/>',
  paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12 12c-3 0-5.5 3.5-5.5 6 0 1.5 1.5 2 3 1.5s3.5-.5 5 0 3 0 3-1.5c0-2.5-2.5-6-5.5-6Z"/>',
  book: '<path d="M12 6.5C10 5 7 4.5 4 5v13.5c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5V5c-3-.5-6 0-8 1.5Z"/><path d="M12 6.5V20"/>',
  shirt: '<path d="M8.5 4 4 6.5 5.5 11 7.5 10v10h9V10l2 1L20 6.5 15.5 4a3.5 3.5 0 0 1-7 0Z"/>',
  gamepad: '<path d="M7 8h10a4 4 0 0 1 4 4.5l-.5 3a2.5 2.5 0 0 1-4.3 1.2L14.5 15h-5l-1.7 1.7a2.5 2.5 0 0 1-4.3-1.2l-.5-3A4 4 0 0 1 7 8Z"/><path d="M8 10.5v3M6.5 12h3"/><circle cx="15.5" cy="11" r=".6" fill="currentColor"/><circle cx="17" cy="13" r=".6" fill="currentColor"/>',
  cup: '<path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5Z"/><path d="M16 9.5h1.5a2.5 2.5 0 0 1 0 5H16M8.5 3.5v2M12 3.5v2"/>',
  fuel: '<path d="M5 20.5V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 14 5v15.5M3.5 20.5h12M5 10h9"/><path d="M14 8.5l3 2v7a1.5 1.5 0 0 0 3 0V9l-2.5-2.5"/>',
  dumbbell: '<path d="M8 12h8M5.5 8v8M8 6.5v11M18.5 8v8M16 6.5v11M3 10.5v3M21 10.5v3"/>',
  music: '<path d="M9 17.5V5.5l11-2v12"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
  baby: '<path d="M13 4v7h7a7 7 0 0 0-7-7Z"/><path d="M3 6.5h2L6.5 11H20a5 5 0 0 1-5 5H10a3.5 3.5 0 0 1-3.4-2.7L6.5 11"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="16.5" cy="19.5" r="1.5"/>',
  bank: '<path d="M3.5 9.5 12 4l8.5 5.5Z"/><path d="M5.5 10v7.5M10 10v7.5M14 10v7.5M18.5 10v7.5M3.5 20h17"/>',
  card: '<rect x="3" y="5.5" width="18" height="13" rx="2.5"/><path d="M3 10h18M6.5 15h4"/>',
  cash: '<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.8"/><path d="M6 9h.01M18 15h.01"/>',
  vault: '<rect x="3.5" y="4" width="17" height="14.5" rx="2.5"/><circle cx="11" cy="11.25" r="3.2"/><path d="M11 8.05v1.2M11 13.25v1.2M7.8 11.25H9M13 11.25h1.2M17 8.5v5.5M7 18.5V20M17 18.5V20"/>',
  piggy: '<path d="M5 11.5a6.5 5.5 0 0 1 11.5-3.5L19 7v3.5l1.5 1v3l-2 .5-1.5 2.5V20h-3v-1.5h-4V20h-3v-3A5.5 5.5 0 0 1 5 11.5Z"/><path d="M3 10.5c0 1 1 1.5 2 1.5M10 7h3"/><circle cx="15.5" cy="11" r=".7" fill="currentColor"/>',
};

export const ICON_NAMES = Object.keys(P);

// Icone che l'utente può scegliere per categorie e conti (v4). I nomi sono salvati nei dati: non cambiarli.
export const PICK_ICONS = [
  'house', 'cart', 'car', 'bolt', 'repeat', 'heart', 'ticket', 'fork', 'gift', 'tag', 'briefcase', 'return',
  'percent', 'plane', 'paw', 'book', 'shirt', 'gamepad', 'cup', 'fuel', 'dumbbell', 'music', 'baby', 'phone',
  'bank', 'wallet', 'card', 'cash', 'coin', 'vault', 'piggy',
];

// Nomi letti dagli screen reader nel selettore di icone.
export const PICK_ICON_LABELS = {
  house: 'Casa', cart: 'Carrello', car: 'Auto', bolt: 'Fulmine', repeat: 'Ripetizione', heart: 'Cuore', ticket: 'Biglietto',
  fork: 'Posate', gift: 'Regalo', tag: 'Etichetta', briefcase: 'Valigetta', return: 'Rimborso', percent: 'Percentuale',
  plane: 'Aereo', paw: 'Zampa', book: 'Libro', shirt: 'Maglietta', gamepad: 'Videogiochi', cup: 'Tazza', fuel: 'Carburante',
  dumbbell: 'Palestra', music: 'Musica', baby: 'Bambino', phone: 'Telefono', bank: 'Banca', wallet: 'Portafoglio',
  card: 'Carta', cash: 'Contanti', coin: 'Moneta', vault: 'Cassaforte', piggy: 'Salvadanaio',
};

export function iconSvg(name, size = 22) {
  const body = P[name] || P.info;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;
}

// Escape dei testi inseriti in stringhe HTML/SVG generate a mano (grafici).

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => MAP[c]);
}

export const escapeAttr = escapeHtml;

// Grafici SVG generati a mano con funzioni pure (stringhe): ciambella, barre, linea.
// Colori con attributi di presentazione (la CSP non permette style inline); testi escapati.

import { escapeHtml as esc } from './escape.js';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const r2 = (n) => Math.round(n * 100) / 100;
const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : '#8E8E93');

// Angoli (gradi) delle fette: la somma è sempre 360 se il totale è > 0.
export function donutArcs(values) {
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return [];
  let acc = 0;
  return values.map((v) => {
    const start = (acc / total) * 360;
    acc += Math.max(0, v);
    return { start, end: (acc / total) * 360 };
  });
}

function polar(cx, cy, r, deg) {
  const a = ((deg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

function sector(cx, cy, ro, ri, a0, a1) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x0, y0] = polar(cx, cy, ro, a0);
  const [x1, y1] = polar(cx, cy, ro, a1);
  const [x2, y2] = polar(cx, cy, ri, a1);
  const [x3, y3] = polar(cx, cy, ri, a0);
  return `M${r2(x0)} ${r2(y0)}A${ro} ${ro} 0 ${large} 1 ${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}A${ri} ${ri} 0 ${large} 0 ${r2(x3)} ${r2(y3)}Z`;
}

/** slices: [{ label, value, color }] */
export function donut(slices, { size = 220, thickness = 34, center = '', centerSub = '', label = 'Grafico a ciambella' } = {}) {
  const c = size / 2;
  const ro = c - 2;
  const ri = ro - thickness;
  const arcs = donutArcs(slices.map((s) => s.value));
  let body = '';
  if (!arcs.length) {
    body = `<circle class="chart__empty" cx="${c}" cy="${c}" r="${r2(ro - thickness / 2)}" fill="none" stroke-width="${thickness}"/>`;
  } else {
    slices.forEach((s, i) => {
      const { start, end } = arcs[i];
      if (end - start <= 0) return;
      const t = `<title>${esc(s.label)}</title>`;
      if (end - start >= 359.999) {
        body += `<circle cx="${c}" cy="${c}" r="${r2(ro - thickness / 2)}" fill="none" stroke="${safeColor(s.color)}" stroke-width="${thickness}">${t}</circle>`;
      } else {
        const gap = arcs.length > 1 ? Math.min(0.8, (end - start) / 4) : 0;
        body += `<path d="${sector(c, c, ro, ri, start + gap / 2, end - gap / 2)}" fill="${safeColor(s.color)}">${t}</path>`;
      }
    });
  }
  const txt = `<text class="chart__center" x="${c}" y="${c + (centerSub ? -2 : 7)}" text-anchor="middle" font-size="20">${esc(center)}</text>`
    + (centerSub ? `<text x="${c}" y="${c + 18}" text-anchor="middle" font-size="12">${esc(centerSub)}</text>` : '');
  return `<svg ${NS} viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}${txt}</svg>`;
}

/** Anello di avanzamento (v4, "Quanto ti resta"): fraction 0..1 della circonferenza, partenza in alto, senso orario.
 *  Colori dal CSS (classi ring__track e ring__fill); center è il testo grande al centro, sub quello piccolo sotto. */
export function ring(fraction, { size = 84, thickness = 10, center = '', sub = '', label = 'Avanzamento' } = {}) {
  const c = size / 2;
  const r = c - thickness / 2 - 1;
  const len = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const fill = f > 0 ? `<circle class="ring__fill" cx="${c}" cy="${c}" r="${r2(r)}" fill="none" stroke-width="${thickness}" stroke-linecap="round" stroke-dasharray="${r2(len * f)} ${r2(len)}" transform="rotate(-90 ${c} ${c})"/>` : '';
  const txt = `<text class="ring__center" x="${c}" y="${c + (sub ? 2 : 6)}" text-anchor="middle" font-size="18">${esc(center)}</text>`
    + (sub ? `<text class="ring__sub" x="${c}" y="${c + 16}" text-anchor="middle" font-size="10">${esc(sub)}</text>` : '');
  return `<svg ${NS} viewBox="0 0 ${size} ${size}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle class="ring__track" cx="${c}" cy="${c}" r="${r2(r)}" fill="none" stroke-width="${thickness}"/>${fill}${txt}</svg>`;
}

/** months: [{ label, income, expense }] — barre affiancate entrate/uscite */
export function bars(months, { width = 340, height = 180, label = 'Entrate e uscite per mese', format = String } = {}) {
  const top = 10;
  const bottom = 24;
  const h = height - top - bottom;
  const max = Math.max(0, ...months.map((m) => Math.max(m.income, m.expense)));
  const n = Math.max(1, months.length);
  const gw = width / n;
  const bw = Math.max(3, Math.min(16, gw / 3.2));
  let body = `<line class="chart__grid" x1="0" x2="${width}" y1="${top + h}" y2="${top + h}" stroke-width="1"/>`;
  body += `<line class="chart__grid" x1="0" x2="${width}" y1="${top}" y2="${top}" stroke-width="0.5" stroke-dasharray="3 3"/>`;
  months.forEach((m, i) => {
    const cx = gw * i + gw / 2;
    const hi = max ? (m.income / max) * h : 0;
    const he = max ? (m.expense / max) * h : 0;
    body += `<rect class="chart__income" x="${r2(cx - bw - 1)}" y="${r2(top + h - hi)}" width="${r2(bw)}" height="${r2(Math.max(0, hi))}" rx="${r2(Math.min(4, bw / 2))}"><title>${esc(`${m.label}: entrate ${format(m.income)}`)}</title></rect>`;
    body += `<rect class="chart__expense" x="${r2(cx + 1)}" y="${r2(top + h - he)}" width="${r2(bw)}" height="${r2(Math.max(0, he))}" rx="${r2(Math.min(4, bw / 2))}"><title>${esc(`${m.label}: uscite ${format(m.expense)}`)}</title></rect>`;
    body += `<text x="${r2(cx)}" y="${height - 6}" text-anchor="middle" font-size="11">${esc(m.label)}</text>`;
  });
  if (max) body += `<text x="2" y="${top - 2}" font-size="10">${esc(format(max))}</text>`;
  return `<svg ${NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;
}

/** points: [{ label, value }] — linea con area */
export function line(points, { width = 340, height = 170, label = 'Andamento', format = String } = {}) {
  const top = 18;
  const bottom = 24;
  const left = 4;
  const right = 4;
  const h = height - top - bottom;
  const w = width - left - right;
  const vals = points.map((p) => p.value);
  let min = Math.min(...vals, 0);
  let max = Math.max(...vals, 0);
  if (!points.length) { min = 0; max = 0; }
  const span = max - min || 1;
  const x = (i) => left + (points.length > 1 ? (i / (points.length - 1)) * w : w / 2);
  const y = (v) => top + h - ((v - min) / span) * h;
  let body = `<line class="chart__grid" x1="0" x2="${width}" y1="${r2(y(0))}" y2="${r2(y(0))}" stroke-width="1" stroke-dasharray="3 3"/>`;
  if (points.length) {
    const pts = points.map((p, i) => `${r2(x(i))} ${r2(y(p.value))}`);
    body += `<path class="chart__area" d="M${r2(x(0))} ${r2(y(min))}L${pts.join('L')}L${r2(x(points.length - 1))} ${r2(y(min))}Z"/>`;
    body += `<path class="chart__line" d="M${pts.join('L')}" fill="none" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    const li = points.length - 1;
    body += `<circle class="chart__dot" cx="${r2(x(li))}" cy="${r2(y(points[li].value))}" r="4"><title>${esc(`${points[li].label}: ${format(points[li].value)}`)}</title></circle>`;
    body += `<text x="${r2(x(0))}" y="${height - 6}" font-size="11">${esc(points[0].label)}</text>`;
    if (li > 0) body += `<text x="${r2(x(li))}" y="${height - 6}" text-anchor="end" font-size="11">${esc(points[li].label)}</text>`;
    body += `<text x="${width - 2}" y="12" text-anchor="end" font-size="11">${esc(format(points[li].value))}</text>`;
  }
  return `<svg ${NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title>${body}</svg>`;
}

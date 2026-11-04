#!/usr/bin/env python3
# Genera l'icona di MoneyFlow v4 (solo libreria standard): due banconote stilizzate sovrapposte, una dorata dietro e una verde
# davanti con il simbolo €, angoli arrotondati e leggera inclinazione, su sfondo menta-crema. La geometria è definita una volta
# sola (NOTES) e serve sia alla sorgente vettoriale (icons/moneyflow-v4.svg, favicon SVG) sia ai PNG (rasterizzati qui).
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
# Nomi con la versione: i telefoni non riusano l'icona vecchia dalla cache.
FILES = {
    'svg': 'moneyflow-v4.svg',
    'favicon_svg': 'moneyflow-v4-favicon.svg',
    'any192': 'moneyflow-v4-192.png',
    'any512': 'moneyflow-v4-512.png',
    'maskable': 'moneyflow-v4-maskable-512.png',
    'apple': 'moneyflow-v4-apple-touch-180.png',
    'favicon': 'moneyflow-v4-favicon-32.png',
}

# Sfondo: gradiente diagonale dall'alto a sinistra (menta) al basso a destra (crema).
BG_FROM, BG_TO = '#DDF3E6', '#FCEFD3'

# Banconote in coordinate [0,1] del soggetto (y verso il basso). angle in gradi, positivo = senso orario (come SVG rotate).
NOTES = [
    {   # dietro: dorata
        'cx': 0.555, 'cy': 0.395, 'w': 0.62, 'h': 0.36, 'r': 0.055, 'angle': -14.0,
        'top': '#F9D77E', 'bottom': '#E6AA35', 'frame': '#B97C0E', 'medal': '#FCEBB8', 'euro': None,
    },
    {   # davanti: verde con €
        'cx': 0.455, 'cy': 0.610, 'w': 0.62, 'h': 0.36, 'r': 0.055, 'angle': 8.0,
        'top': '#14A673', 'bottom': '#047857', 'frame': '#7FDDB4', 'medal': '#E9F8EF', 'euro': '#047857',
    },
]
FRAME_INSET, FRAME_W = 0.032, 0.012     # cornice interna della banconota
MEDAL_R = 0.100                          # medaglione centrale
DOT_R, DOT_X, DOT_Y = 0.020, 0.215, 0.105  # pallini negli angoli (coordinate locali dal centro)
EURO_R, EURO_W, EURO_GAP = 0.056, 0.020, 42.0  # anello del simbolo €: raggio, spessore, mezza apertura a destra (gradi)
EURO_BARS = [(-0.016, 0.013), (0.014, 0.013)]  # barre: (y dal centro, spessore)
EURO_BAR_X0, EURO_BAR_X1 = -0.088, 0.018
SHADOW_DY, SHADOW_ALPHA = 0.018, 0.16    # ombra netta sotto ogni banconota


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def rr_inside(x, y, hw, hh, r):
    """Punto (x, y) dentro il rettangolo arrotondato centrato nell'origine con semiassi hw, hh e raggio r."""
    ax, ay = abs(x), abs(y)
    if ax > hw or ay > hh:
        return False
    qx, qy = ax - (hw - r), ay - (hh - r)
    if qx <= 0 or qy <= 0:
        return True
    return qx * qx + qy * qy <= r * r


def to_local(n, u, v):
    a = math.radians(n['angle'])
    dx, dy = u - n['cx'], v - n['cy']
    return dx * math.cos(a) + dy * math.sin(a), -dx * math.sin(a) + dy * math.cos(a)


def in_euro(x, y):
    d = math.hypot(x, y)
    ang = math.degrees(math.atan2(-y, x))
    if abs(d - EURO_R) <= EURO_W / 2 and abs(ang) > EURO_GAP:
        return True
    for by, bw in EURO_BARS:
        if EURO_BAR_X0 <= x <= EURO_BAR_X1 and abs(y - by) <= bw / 2:
            return True
    return False


def note_color(n, x, y):
    """Colore della banconota nel punto locale (x, y) o None se fuori."""
    hw, hh, r = n['w'] / 2, n['h'] / 2, n['r']
    if not rr_inside(x, y, hw, hh, r):
        return None
    if n['euro'] and in_euro(x, y):
        return hex2rgb(n['euro'])
    if math.hypot(x, y) <= MEDAL_R:
        return hex2rgb(n['medal'])
    for sx in (-1, 1):
        for sy in (-1, 1):
            if math.hypot(x - sx * DOT_X, y - sy * DOT_Y) <= DOT_R:
                return hex2rgb(n['frame'])
    i = FRAME_INSET
    if rr_inside(x, y, hw - i, hh - i, r - i / 2) and not rr_inside(x, y, hw - i - FRAME_W, hh - i - FRAME_W, r - i / 2 - FRAME_W):
        return hex2rgb(n['frame'])
    t = (y + hh) / (2 * hh)
    return lerp(hex2rgb(n['top']), hex2rgb(n['bottom']), t)


def subject(u, v, base):
    """Colore del soggetto sopra il colore di fondo base; restituisce (colore, è soggetto)."""
    c, hit = base, False
    for n in NOTES:
        x, y = to_local(n, u, v - SHADOW_DY)
        if rr_inside(x, y, n['w'] / 2, n['h'] / 2, n['r']):
            c = lerp(c, (0, 40, 30), SHADOW_ALPHA)
        x, y = to_local(n, u, v)
        col = note_color(n, x, y)
        if col is not None:
            c, hit = col, True
    return c, hit


def bg_color(fx, fy):
    return lerp(hex2rgb(BG_FROM), hex2rgb(BG_TO), max(0.0, min(1.0, (fx + fy) / 2)))


def subject_extent():
    """Distanza massima dal centro (0.5, 0.5) degli angoli delle banconote, nello spazio del soggetto."""
    best = 0.0
    for n in NOTES:
        a = math.radians(n['angle'])
        for sx in (-1, 1):
            for sy in (-1, 1):
                x, y = sx * n['w'] / 2, sy * n['h'] / 2
                u = n['cx'] + x * math.cos(a) - y * math.sin(a)
                v = n['cy'] + x * math.sin(a) + y * math.cos(a)
                best = max(best, math.hypot(u - 0.5, v - 0.5))
    return best


def png(path, size, scale, rounded=False, sub=4, radius=0.22):
    rows = []
    s0 = (1 - scale) / 2
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            acc = [0.0, 0.0, 0.0]
            alpha = 0
            for sy in range(sub):
                for sx in range(sub):
                    fx = (x + (sx + 0.5) / sub) / size
                    fy = (y + (sy + 0.5) / sub) / size
                    if rounded and not rr_inside(fx - 0.5, fy - 0.5, 0.5, 0.5, radius):
                        continue
                    alpha += 1
                    c, _ = subject((fx - s0) / scale, (fy - s0) / scale, bg_color(fx, fy))
                    for i in range(3):
                        acc[i] += c[i]
            col = bytes(round(acc[i] / alpha) for i in range(3)) if alpha else bytes(3)
            row += col + bytes([round(255 * alpha / (sub * sub))])
        rows.append(bytes(row))
    raw = b''.join(rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    data += chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(data)
    print('creato', os.path.relpath(path), size)


def f(n):
    return f'{n * 512:.2f}'.rstrip('0').rstrip('.')


def svg(path, scale, rounded, radius=0.22):
    """Sorgente vettoriale con la stessa geometria dei PNG (viewBox 512)."""
    s0 = (1 - scale) / 2 * 512
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
           '<title>MoneyFlow</title>',
           '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">'
           f'<stop offset="0" stop-color="{BG_FROM}"/><stop offset="1" stop-color="{BG_TO}"/></linearGradient>']
    for i, n in enumerate(NOTES):
        out.append(f'<linearGradient id="n{i}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{n["top"]}"/>'
                   f'<stop offset="1" stop-color="{n["bottom"]}"/></linearGradient>')
    if rounded:
        out.append(f'<clipPath id="clip"><rect width="512" height="512" rx="{f(radius)}"/></clipPath>')
    out.append('</defs>')
    out.append(f'<rect width="512" height="512" rx="{f(radius) if rounded else 0}" fill="url(#bg)"/>')
    clip = ' clip-path="url(#clip)"' if rounded else ''
    out.append(f'<g{clip}><g transform="translate({s0:.2f} {s0:.2f}) scale({scale})">')
    for i, n in enumerate(NOTES):
        hw, hh, r = n['w'] / 2, n['h'] / 2, n['r']
        rot = f'rotate({n["angle"]} {f(n["cx"])} {f(n["cy"])})'
        x0, y0 = n['cx'] - hw, n['cy'] - hh
        out.append(f'<rect x="{f(x0)}" y="{f(y0 + SHADOW_DY)}" width="{f(n["w"])}" height="{f(n["h"])}" rx="{f(r)}" fill="#00281E" fill-opacity="{SHADOW_ALPHA}" transform="rotate({n["angle"]} {f(n["cx"])} {f(n["cy"] + SHADOW_DY)})"/>')
        out.append(f'<g transform="{rot}">')
        out.append(f'<rect x="{f(x0)}" y="{f(y0)}" width="{f(n["w"])}" height="{f(n["h"])}" rx="{f(r)}" fill="url(#n{i})"/>')
        ins = FRAME_INSET + FRAME_W / 2
        out.append(f'<rect x="{f(x0 + ins)}" y="{f(y0 + ins)}" width="{f(n["w"] - 2 * ins)}" height="{f(n["h"] - 2 * ins)}" rx="{f(r - ins / 2 - FRAME_W / 4)}" fill="none" stroke="{n["frame"]}" stroke-width="{f(FRAME_W)}"/>')
        for sx in (-1, 1):
            for sy in (-1, 1):
                out.append(f'<circle cx="{f(n["cx"] + sx * DOT_X)}" cy="{f(n["cy"] + sy * DOT_Y)}" r="{f(DOT_R)}" fill="{n["frame"]}"/>')
        out.append(f'<circle cx="{f(n["cx"])}" cy="{f(n["cy"])}" r="{f(MEDAL_R)}" fill="{n["medal"]}"/>')
        if n['euro']:
            g = math.radians(EURO_GAP)
            ax, ay = n['cx'] + EURO_R * math.cos(g), n['cy'] - EURO_R * math.sin(g)
            bx, by = n['cx'] + EURO_R * math.cos(g), n['cy'] + EURO_R * math.sin(g)
            out.append(f'<path d="M{f(ax)} {f(ay)}A{f(EURO_R)} {f(EURO_R)} 0 1 0 {f(bx)} {f(by)}" fill="none" stroke="{n["euro"]}" stroke-width="{f(EURO_W)}"/>')
            for yy, bw in EURO_BARS:
                out.append(f'<rect x="{f(n["cx"] + EURO_BAR_X0)}" y="{f(n["cy"] + yy - bw / 2)}" width="{f(EURO_BAR_X1 - EURO_BAR_X0)}" height="{f(bw)}" fill="{n["euro"]}"/>')
        out.append('</g>')
    out.append('</g></g></svg>\n')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(out))
    print('creato', os.path.relpath(path))


def main():
    os.makedirs(OUT, exist_ok=True)
    ext = subject_extent()
    any_scale = 0.86
    # maskable: tutto il soggetto dentro il cerchio centrale del 72% (raggio 0,36 del lato)
    mask_scale = round(0.355 / ext, 3)
    print(f'raggio del soggetto: {ext:.3f}; maskable scala {mask_scale} → raggio {ext * mask_scale:.3f} (limite 0,36)')
    assert ext * mask_scale <= 0.36
    assert ext * any_scale <= 0.5 * math.sqrt(2)
    svg(os.path.join(OUT, FILES['svg']), any_scale, rounded=False)
    # favicon: soggetto ingrandito (scala 1,18) e angoli meno tondi, per leggere banconote e € a 16-32 px
    fav_scale, fav_radius = 1.18, 0.18
    svg(os.path.join(OUT, FILES['favicon_svg']), fav_scale, rounded=True, radius=fav_radius)
    png(os.path.join(OUT, FILES['any192']), 192, any_scale)
    png(os.path.join(OUT, FILES['any512']), 512, any_scale)
    png(os.path.join(OUT, FILES['maskable']), 512, mask_scale)
    png(os.path.join(OUT, FILES['apple']), 180, any_scale)
    png(os.path.join(OUT, FILES['favicon']), 32, fav_scale, rounded=True, radius=fav_radius)


if __name__ == '__main__':
    main()

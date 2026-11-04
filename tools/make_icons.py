#!/usr/bin/env python3
# Genera le icone PNG di MoneyFlow v3 (solo libreria standard: math, zlib e struct).
# Sfondo in gradiente smeraldo → laguna → indaco; moneta d'oro con il simbolo dell'euro e una freccia bianca che gira e sale.
import math
import os
import struct
import zlib

# Gradiente diagonale dello sfondo (dall'alto a sinistra al basso a destra).
BG_STOPS = [(0.0, (16, 185, 129)), (0.5, (13, 148, 136)), (1.0, (49, 46, 129))]  # #10B981, #0D9488, #312E81
COIN_TOP = (253, 230, 138)     # #FDE68A
COIN_BOTTOM = (245, 158, 11)   # #F59E0B
COIN_RIM = (217, 119, 6)       # #D97706
EURO = (146, 64, 14)           # #92400E
WHITE = (255, 255, 255)

# Geometria del soggetto in coordinate [0,1] (y verso il basso).
CX, CY, R = 0.43, 0.57, 0.28          # moneta
RIM = 0.035                            # bordo della moneta
ARC_R, ARC_W = 0.40, 0.075             # freccia: arco intorno alla moneta
ARC_FROM, ARC_TO = -105.0, 22.0        # gradi (0 = destra, antiorario)
HEAD_LEN, HEAD_W = 0.15, 0.20          # punta della freccia

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')
# Nomi con la versione: i telefoni non riusano l'icona vecchia dalla cache.
FILES = {
    'any192': 'moneyflow-v3-192.png',
    'any512': 'moneyflow-v3-512.png',
    'maskable': 'moneyflow-v3-maskable-512.png',
    'apple': 'moneyflow-v3-apple-touch-180.png',
    'favicon': 'moneyflow-v3-favicon-32.png',
}


def lerp(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def bg_color(fx, fy):
    t = max(0.0, min(1.0, (fx + fy) / 2))
    for (t0, c0), (t1, c1) in zip(BG_STOPS, BG_STOPS[1:]):
        if t <= t1:
            return lerp(c0, c1, (t - t0) / (t1 - t0))
    return BG_STOPS[-1][1]


def rounded_rect(px, py, x0, y0, x1, y1, r):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def arc_point(deg, r=ARC_R):
    a = math.radians(deg)
    return CX + r * math.cos(a), CY - r * math.sin(a)


def in_triangle(p, a, b, c):
    def s(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = s(p, a, b), s(p, b, c), s(p, c, a)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def arrow_head():
    a = math.radians(ARC_TO)
    base = arc_point(ARC_TO)
    tangent = (-math.sin(a), -math.cos(a))  # direzione antioraria sullo schermo
    normal = (math.cos(a), -math.sin(a))
    tip = (base[0] + tangent[0] * HEAD_LEN, base[1] + tangent[1] * HEAD_LEN)
    left = (base[0] + normal[0] * HEAD_W / 2, base[1] + normal[1] * HEAD_W / 2)
    right = (base[0] - normal[0] * HEAD_W / 2, base[1] - normal[1] * HEAD_W / 2)
    return tip, left, right


HEAD = arrow_head()


def in_arrow(u, v):
    d = math.hypot(u - CX, v - CY)
    ang = math.degrees(math.atan2(-(v - CY), u - CX))
    if ARC_FROM <= ang <= ARC_TO and abs(d - ARC_R) <= ARC_W / 2:
        return True
    sx, sy = arc_point(ARC_FROM)  # estremo iniziale arrotondato
    if math.hypot(u - sx, v - sy) <= ARC_W / 2:
        return True
    return in_triangle((u, v), *HEAD)


def in_euro(u, v):
    x, y = u - CX, v - CY
    d = math.hypot(x, y)
    ang = math.degrees(math.atan2(-y, x))
    ring_r, ring_w = 0.125, 0.045
    if abs(d - ring_r) <= ring_w / 2 and not (-48 <= ang <= 48):
        return True
    for yy in (-0.03, 0.03):
        if -0.17 <= x <= 0.03 and abs(y - yy) <= 0.017:
            return True
    return False


def subject(u, v):
    """Colore del soggetto in (u, v) o None se è sfondo; secondo valore: ombra (0..1)."""
    if in_arrow(u, v):
        return WHITE
    d = math.hypot(u - CX, v - CY)
    if d <= R:
        if in_euro(u, v):
            return EURO
        if d >= R - RIM:
            return COIN_RIM
        t = (v - (CY - R)) / (2 * R)
        return lerp(COIN_TOP, COIN_BOTTOM, t)
    return None


def shadow(u, v):
    # Ombra morbida sotto la moneta.
    d = math.hypot(u - CX, v - (CY + 0.035))
    return max(0.0, min(1.0, (R + 0.06 - d) / 0.08)) * 0.28


def subject_extent():
    """Distanza massima dal centro (0.5, 0.5) dei punti del soggetto, nello spazio del soggetto."""
    best = 0.0
    n = 400
    for j in range(n):
        for i in range(n):
            u, v = (i + 0.5) / n, (j + 0.5) / n
            if subject(u, v) is not None:
                best = max(best, math.hypot(u - 0.5, v - 0.5))
    return best


def png(path, size, scale, rounded=False, sub=4):
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
                    if rounded and not rounded_rect(fx, fy, 0, 0, 1, 1, 0.22):
                        continue
                    alpha += 1
                    u, v = (fx - s0) / scale, (fy - s0) / scale
                    c = subject(u, v)
                    if c is None:
                        c = lerp(bg_color(fx, fy), (0, 0, 0), shadow(u, v))
                    for i in range(3):
                        acc[i] += c[i]
            if alpha:
                col = bytes(round(acc[i] / alpha) for i in range(3))
            else:
                col = bytes(3)
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


def main():
    os.makedirs(OUT, exist_ok=True)
    ext = subject_extent()
    any_scale = 0.80
    # maskable: tutto il soggetto dentro il cerchio centrale del 72% (raggio 0,36 del lato)
    mask_scale = round(0.35 / ext, 3)
    print(f'raggio del soggetto: {ext:.3f}; maskable scala {mask_scale} → raggio {ext * mask_scale:.3f} (limite 0,36)')
    assert ext * mask_scale <= 0.36
    png(os.path.join(OUT, FILES['any192']), 192, any_scale)
    png(os.path.join(OUT, FILES['any512']), 512, any_scale)
    png(os.path.join(OUT, FILES['maskable']), 512, mask_scale)
    png(os.path.join(OUT, FILES['apple']), 180, any_scale)
    png(os.path.join(OUT, FILES['favicon']), 32, 0.92, rounded=True)


if __name__ == '__main__':
    main()

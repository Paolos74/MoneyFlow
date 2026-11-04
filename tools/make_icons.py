#!/usr/bin/env python3
# Genera le icone PNG di MoneyFlow (solo libreria standard: zlib e struct).
# Sfondo verde smeraldo, simbolo bianco: tre barre che crescono e una freccia.
import os
import struct
import zlib

GREEN_TOP = (16, 150, 110)
GREEN_BOTTOM = (4, 120, 87)  # #047857
WHITE = (255, 255, 255)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'icons')


def rounded_rect(px, py, x0, y0, x1, y1, r):
    if px < x0 or px > x1 or py < y0 or py > y1:
        return False
    cx = min(max(px, x0 + r), x1 - r)
    cy = min(max(py, y0 + r), y1 - r)
    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r


def in_symbol(u, v):
    """u, v in [0,1] nello spazio del simbolo."""
    bars = [(0.06, 0.58, 0.26), (0.39, 0.40, 0.59), (0.72, 0.18, 0.92)]
    for x0, top, x1 in bars:
        if rounded_rect(u, v, x0, top, x1, 0.94, 0.05):
            return True
    return False


def png(path, size, scale, rounded=False):
    sub = 4
    rows = []
    s0 = (1 - scale) / 2
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            cov = 0
            bg = 0
            for sy in range(sub):
                for sx in range(sub):
                    fx = (x + (sx + 0.5) / sub) / size
                    fy = (y + (sy + 0.5) / sub) / size
                    inside_bg = (not rounded) or rounded_rect(fx, fy, 0, 0, 1, 1, 0.22)
                    if inside_bg:
                        bg += 1
                        if in_symbol((fx - s0) / scale, (fy - s0) / scale):
                            cov += 1
            n = sub * sub
            t = y / max(1, size - 1)
            g = tuple(round(GREEN_TOP[i] * (1 - t) + GREEN_BOTTOM[i] * t) for i in range(3))
            a = cov / n
            col = tuple(round(g[i] * (1 - a / max(bg / n, 1e-9)) + WHITE[i] * (a / max(bg / n, 1e-9))) if bg else 0 for i in range(3))
            row += bytes(col) + bytes([round(255 * bg / n)])
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
    png(os.path.join(OUT, 'icon-192.png'), 192, 0.56)
    png(os.path.join(OUT, 'icon-512.png'), 512, 0.56)
    # maskable: il simbolo sta dentro il cerchio centrale del 72%
    png(os.path.join(OUT, 'icon-maskable-512.png'), 512, 0.44)
    png(os.path.join(OUT, 'apple-touch-icon.png'), 180, 0.56)
    png(os.path.join(OUT, 'favicon-32.png'), 32, 0.7, rounded=True)


if __name__ == '__main__':
    main()

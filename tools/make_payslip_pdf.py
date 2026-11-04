#!/usr/bin/env python3
# Genera tre PDF di busta paga SINTETICI (dati inventati, nessun dato reale) per i test del lettore PDF.
# Solo libreria standard (zlib). Uscita: tests/fixtures/busta-paga-sintetica.pdf (font standard, FlateDecode),
# busta-paga-sintetica-cid.pdf (font Type0 Identity-H con ToUnicode e object stream: serve solo a provare il lettore)
# e busta-paga-sintetica-modulo.pdf (modulo prestampato: etichette fisse in un Form XObject separato dai valori,
# "NETTO A PAGARE" scritto una lettera alla volta come nei moduli a caratteri fissi).
import os
import zlib

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'tests', 'fixtures')

# Righe della busta: (y, [pezzi]); ogni pezzo è (x, testo) oppure (x, ['testo', crenatura, 'testo', ...]) per TJ.
# Valori inventati e coerenti: competenze 3.250,00 − ritenute 811,01 = netto 2.438,99.
LINES = [
    (800, [(40, 'LSLU0001')]),
    (785, [(40, 'DITTA DI PROVA')]),
    (770, [(40, 'Descrizione voce (dati inventati)')]),
    (750, [(40, '28-04-2026'), (120, '4'), (140, '2026')]),
    (720, [(40, 'Ferie'), (200, '12,00'), (260, '4,00'), (320, '8,00'), (420, '811,01'), (500, '3250,00')]),
    (700, [(40, '900'), (80, 'Totale ritenute sociali'), (500, '298,61')]),
    (685, [(40, '60450'), (80, 'Ctr. fiscalmente deducib.'), (500, '97,50')]),
    (670, [(40, 'I01'), (80, ['Impon.', -300, 'fiscale', -300, 'mese']), (500, '2853,89')]),
    (655, [(40, 'I11'), (80, 'Imposta lorda'), (420, '23,00'), (500, '656,39')]),
    (640, [(40, 'I21'), (80, ['Ir', 15, 'pef netta']), (500, '512,40-')]),
    (610, [(40, 'Imp.fiscale'), (100, 'Impos.lorda'), (160, 'Detr.godute'), (220, 'Impos.netta'),
           (280, 'Imp. Prev.'), (340, 'Ctr. FPC'), (400, 'Ctr. F.Ass.')]),
    (598, [(40, '2853,89'), (100, '656,39'), (160, '143,99'), (220, '512,40'), (280, '3250,00'), (340, '97,50'), (400, '0,00')]),
]
# "NETTO A PAGARE" con il valore sulla riga sotto (T* con TL 14).
NET_LABEL = (400, 560, 'NETTO A PAGARE')
NET_VALUE = '2.438,99'


def lit(s):
    return '(' + s.replace('\\', '\\\\').replace('(', '\\(').replace(')', '\\)') + ')'


def content(enc):
    """Content stream: enc(testo) restituisce la stringa PDF (letterale o esadecimale)."""
    out = ['q 1 0 0 1 0 0 cm', 'BT', '/F1 9 Tf']
    for y, pieces in LINES:
        x0 = pieces[0][0]
        out.append(f'1 0 0 1 {x0} {y} Tm')
        prev = x0
        for i, (x, text) in enumerate(pieces):
            if i > 0:
                out.append(f'{x - prev} 0 Td')  # spostamento relativo all'inizio del pezzo precedente
                prev = x
            if isinstance(text, list):
                parts = [enc(p) if isinstance(p, str) else str(p) for p in text]
                out.append('[' + ' '.join(parts) + '] TJ')
            else:
                out.append(enc(text) + ' Tj')
    x, y, label = NET_LABEL
    out.append(f'1 0 0 1 {x} {y} Tm 14 TL')
    out.append(enc(label) + ' Tj')
    out.append('T* ' + enc(NET_VALUE) + ' Tj')
    out.append('ET Q')
    return ('\n'.join(out) + '\n').encode('latin-1')


def all_texts():
    texts = [NET_LABEL[2], NET_VALUE]
    for _, pieces in LINES:
        for _, t in pieces:
            texts.extend(p for p in (t if isinstance(t, list) else [t]) if isinstance(p, str))
    return texts


def write_classic(path, objects):
    """objects: lista di bytes (corpo degli oggetti 1..n). xref classica con offset esatti."""
    data = bytearray(b'%PDF-1.4\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for i, body in enumerate(objects, start=1):
        offsets.append(len(data))
        data += f'{i} 0 obj\n'.encode() + body + b'\nendobj\n'
    xref = len(data)
    data += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    for off in offsets:
        data += f'{off:010d} 00000 n \n'.encode()
    data += f'trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    with open(path, 'wb') as f:
        f.write(data)


def stream(dict_items, raw, compress=True):
    body = zlib.compress(raw) if compress else raw
    filt = ' /Filter /FlateDecode' if compress else ''
    return f'<< {dict_items} /Length {len(body)}{filt} >>\nstream\n'.encode() + body + b'\nendstream'


def make_simple():
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        stream('', content(lit)),
    ]
    write_classic(os.path.join(OUT, 'busta-paga-sintetica.pdf'), objects)


def make_cid():
    # Codici a 2 byte: cifre 0x0010–0x0019 (bfrange), ", . -" 0x0020–0x0022 (bfrange con array), il resto bfchar.
    codes = {str(d): 0x10 + d for d in range(10)}
    codes.update({',': 0x20, '.': 0x21, '-': 0x22})
    others = sorted({c for t in all_texts() for c in t if c not in codes})
    for i, c in enumerate(others):
        codes[c] = 0x100 + i

    def hexs(s):
        return '<' + ''.join(f'{codes[c]:04X}' for c in s) + '>'

    cmap = ['/CIDInit /ProcSet findresource begin', '12 dict begin', 'begincmap',
            '/CMapName /Prova-UCS def', '/CMapType 2 def',
            '1 begincodespacerange', '<0000> <FFFF>', 'endcodespacerange',
            '2 beginbfrange', '<0010> <0019> <0030>', '<0020> <0022> [<002C> <002E> <002D>]', 'endbfrange',
            f'{len(others)} beginbfchar']
    cmap += [f'<{codes[c]:04X}> <{ord(c):04X}>' for c in others]
    cmap += ['endbfchar', 'endcmap', 'CMapName currentdict /CMap defineresource pop', 'end', 'end']
    tounicode = ('\n'.join(cmap) + '\n').encode('latin-1')

    # Oggetti 4 (font Type0) e 6 (CIDFont) dentro l'object stream 8; gli stream (5, 7) restano normali.
    obj4 = b'<< /Type /Font /Subtype /Type0 /BaseFont /Helvetica /Encoding /Identity-H /DescendantFonts [6 0 R] /ToUnicode 7 0 R >>'
    obj6 = b'<< /Type /Font /Subtype /CIDFontType2 /BaseFont /Helvetica /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /DW 500 >>'
    packed = obj4 + b'\n' + obj6 + b'\n'
    header = f'4 0 6 {len(obj4) + 1} '.encode()
    objstm = stream(f'/Type /ObjStm /N 2 /First {len(header)}', header + packed)

    regular = {
        1: b'<< /Type /Catalog /Pages 2 0 R >>',
        2: b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        3: b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        5: stream('', content(hexs)),
        7: stream('', tounicode),
        8: objstm,
    }
    data = bytearray(b'%PDF-1.5\n%\xe2\xe3\xcf\xd3\n')
    offsets = {}
    for num in sorted(regular):
        offsets[num] = len(data)
        data += f'{num} 0 obj\n'.encode() + regular[num] + b'\nendobj\n'
    # Tabella xref come stream (/W [1 4 2]): tipo 0 libero, 1 normale (offset), 2 compresso (object stream, indice).
    xref_off = len(data)
    rows = bytearray()
    for num in range(10):
        if num == 0:
            rows += bytes([0]) + (0).to_bytes(4, 'big') + (65535).to_bytes(2, 'big')
        elif num in offsets:
            rows += bytes([1]) + offsets[num].to_bytes(4, 'big') + (0).to_bytes(2, 'big')
        elif num == 4:
            rows += bytes([2]) + (8).to_bytes(4, 'big') + (0).to_bytes(2, 'big')
        elif num == 6:
            rows += bytes([2]) + (8).to_bytes(4, 'big') + (1).to_bytes(2, 'big')
        else:  # 9: la tabella stessa
            rows += bytes([1]) + xref_off.to_bytes(4, 'big') + (0).to_bytes(2, 'big')
    data += b'9 0 obj\n' + stream('/Type /XRef /Size 10 /W [1 4 2] /Root 1 0 R', bytes(rows), compress=False) + b'\nendobj\n'
    data += f'startxref\n{xref_off}\n%%EOF\n'.encode()
    with open(os.path.join(OUT, 'busta-paga-sintetica-cid.pdf'), 'wb') as f:
        f.write(data)


# Etichette fisse del modulo (coordinate della pagina): stanno nel Form XObject, non nel content stream.
FORM_LABELS = [
    (770, 40, 'Descrizione voce (dati inventati)'),
    (610, 40, ['Imp.fiscale', 'Impos.lorda', 'Detr.godute', 'Impos.netta', 'Imp. Prev.', 'Ctr. FPC', 'Ctr. F.Ass.']),
]
FORM_SHIFT = 10  # il form ha /Matrix [1 0 0 1 0 10]: dentro il form le y sono 10 punti più in basso


def form_content():
    out = ['BT', '/F1 9 Tf']
    for y, x, text in FORM_LABELS:
        if isinstance(text, list):
            for i, t in enumerate(text):
                out.append(f'1 0 0 1 {x + 60 * i} {y - FORM_SHIFT} Tm')
                out.append(lit(t) + ' Tj')
        else:
            out.append(f'1 0 0 1 {x} {y - FORM_SHIFT} Tm')
            out.append(lit(text) + ' Tj')
    # "NETTO A PAGARE" una lettera per volta, ognuna con il suo Td (spazio tra le parole = passo doppio).
    x, y, label = NET_LABEL
    out.append(f'1 0 0 1 {x} {y - FORM_SHIFT} Tm')
    step = 0
    for c in label:
        if c == ' ':
            step += 6
            continue
        if step:
            out.append(f'{step} 0 Td')
        out.append(lit(c) + ' Tj')
        step = 6
    out.append('ET')
    return ('\n'.join(out) + '\n').encode('latin-1')


def form_page_content():
    """Valori stampati sopra il modulo: le righe di LINES senza le etichette del form, e il netto sotto l'etichetta."""
    fixed = {y for y, _, _ in FORM_LABELS}
    out = ['q 1 0 0 1 0 0 cm /Fm1 Do Q', 'BT', '/F1 9 Tf']
    for y, pieces in LINES:
        if y in fixed:
            continue
        for x, text in pieces:
            out.append(f'1 0 0 1 {x} {y} Tm')
            if isinstance(text, list):
                parts = [lit(p) if isinstance(p, str) else str(p) for p in text]
                out.append('[' + ' '.join(parts) + '] TJ')
            else:
                out.append(lit(text) + ' Tj')
    x, y, _ = NET_LABEL
    out.append(f'1 0 0 1 {x} {y - 14} Tm')
    out.append(lit(NET_VALUE) + ' Tj')
    out.append('ET')
    return ('\n'.join(out) + '\n').encode('latin-1')


def make_form():
    objects = [
        b'<< /Type /Catalog /Pages 2 0 R >>',
        b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> /XObject << /Fm1 6 0 R >> >> /Contents 5 0 R >>',
        b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
        stream('', form_page_content()),
        stream(f'/Type /XObject /Subtype /Form /BBox [0 0 595 842] /Matrix [1 0 0 1 0 {FORM_SHIFT}] /Resources << /Font << /F1 4 0 R >> >>', form_content()),
    ]
    write_classic(os.path.join(OUT, 'busta-paga-sintetica-modulo.pdf'), objects)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    make_simple()
    make_cid()
    make_form()
    print('Creati tests/fixtures/busta-paga-sintetica.pdf, busta-paga-sintetica-cid.pdf e busta-paga-sintetica-modulo.pdf (dati inventati)')

// Lettore PDF minimo, solo sul dispositivo e senza librerie: estrae le righe di testo di un PDF.
// Stream FlateDecode con DecompressionStream('deflate'), object stream, font semplici, mappe ToUnicode e Form XObject.
// Sperimentale: nessuna garanzia sui PDF con layout o codifiche diverse.

export class PdfReadError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PdfReadError';
  }
}

const MSG_NOT_PDF = 'Il file non è un PDF';
const MSG_ENCRYPTED = 'Il PDF è protetto o cifrato: compila i campi a mano';
const MSG_NO_TEXT = "Nel PDF non c'è testo leggibile (forse è una scansione): compila i campi a mano";
const MSG_BROKEN = 'Non riesco a leggere questo PDF: compila i campi a mano';

// ---------- byte e stringhe latin1 ----------

function bytesToLatin1(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
  return s;
}

function latin1ToBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

// zlib (RFC 1950), come nei PDF. Se lo stream è troncato o ha byte in più si tiene quanto già decompresso.
async function inflate(bytes) {
  const ds = new DecompressionStream('deflate');
  const writer = ds.writable.getWriter();
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const reader = ds.readable.getReader();
  const chunks = [];
  let len = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      len += value.length;
    }
  } catch {
    if (!len) return null;
  }
  const out = new Uint8Array(len);
  let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

// ---------- lessico e oggetti PDF ----------

const WS = new Set([0, 9, 10, 12, 13, 32]);
const DELIM = new Set(['(', ')', '<', '>', '[', ']', '{', '}', '/', '%']);
const isWs = (c) => WS.has(c.charCodeAt(0));

class Lexer {
  constructor(src, pos = 0) { this.s = src; this.p = pos; }

  skipWs() {
    const s = this.s;
    while (this.p < s.length) {
      const c = s[this.p];
      if (isWs(c)) this.p++;
      else if (c === '%') { while (this.p < s.length && s[this.p] !== '\n' && s[this.p] !== '\r') this.p++; }
      else break;
    }
  }

  // Token: { t: 'num'|'name'|'str'|'op'|'[' |']'|'<<'|'>>'|'eof', v }
  next() {
    this.skipWs();
    const s = this.s;
    if (this.p >= s.length) return { t: 'eof' };
    const c = s[this.p];
    if (c === '(') return { t: 'str', v: this.literal() };
    if (c === '<') {
      if (s[this.p + 1] === '<') { this.p += 2; return { t: '<<' }; }
      return { t: 'str', v: this.hex() };
    }
    if (c === '>' && s[this.p + 1] === '>') { this.p += 2; return { t: '>>' }; }
    if (c === '[' || c === ']' || c === '{' || c === '}') { this.p++; return { t: c === '{' ? '[' : c === '}' ? ']' : c }; }
    if (c === '/') {
      this.p++;
      let n = '';
      while (this.p < s.length && !isWs(s[this.p]) && !DELIM.has(s[this.p])) n += s[this.p++];
      return { t: 'name', v: n.replace(/#([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))) };
    }
    let w = '';
    while (this.p < s.length && !isWs(s[this.p]) && !DELIM.has(s[this.p])) w += s[this.p++];
    if (!w) { this.p++; return { t: 'op', v: c }; }
    if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(w)) return { t: 'num', v: Number(w) };
    return { t: 'op', v: w };
  }

  literal() {
    const s = this.s;
    this.p++;
    let depth = 1;
    let out = '';
    while (this.p < s.length) {
      const c = s[this.p++];
      if (c === '\\') {
        const e = s[this.p++];
        if (e === 'n') out += '\n';
        else if (e === 'r') out += '\r';
        else if (e === 't') out += '\t';
        else if (e === 'b') out += '\b';
        else if (e === 'f') out += '\f';
        else if (e === '\r') { if (s[this.p] === '\n') this.p++; } // a capo continuato
        else if (e === '\n') { /* a capo continuato */ }
        else if (e >= '0' && e <= '7') {
          let o = e;
          while (o.length < 3 && s[this.p] >= '0' && s[this.p] <= '7') o += s[this.p++];
          out += String.fromCharCode(parseInt(o, 8) & 0xff);
        } else if (e !== undefined) out += e; // \( \) \\ e altri
      } else if (c === '(') { depth++; out += c; }
      else if (c === ')') { if (--depth === 0) break; out += c; }
      else out += c;
    }
    return out;
  }

  hex() {
    const s = this.s;
    this.p++;
    let h = '';
    while (this.p < s.length && s[this.p] !== '>') {
      if (/[0-9a-fA-F]/.test(s[this.p])) h += s[this.p];
      this.p++;
    }
    this.p++;
    if (h.length % 2) h += '0';
    let out = '';
    for (let i = 0; i < h.length; i += 2) out += String.fromCharCode(parseInt(h.slice(i, i + 2), 16));
    return out;
  }
}

// Valori: numeri, { name }, { str }, { ref }, array, Map (dizionari), { op } per gli operatori.
function parseValue(lx, tok = lx.next()) {
  switch (tok.t) {
    case 'num': {
      // "n g R" = riferimento indiretto
      const save = lx.p;
      const t2 = lx.next();
      if (t2.t === 'num') {
        const t3 = lx.next();
        if (t3.t === 'op' && t3.v === 'R') return { ref: tok.v };
      }
      lx.p = save;
      return tok.v;
    }
    case 'name': return { name: tok.v };
    case 'str': return { str: tok.v };
    case '[': {
      const arr = [];
      for (;;) {
        const t = lx.next();
        if (t.t === ']' || t.t === 'eof') break;
        arr.push(parseValue(lx, t));
      }
      return arr;
    }
    case '<<': {
      const d = new Map();
      for (;;) {
        const t = lx.next();
        if (t.t === '>>' || t.t === 'eof') break;
        if (t.t !== 'name') continue;
        d.set(t.v, parseValue(lx));
      }
      return d;
    }
    case 'op':
      if (tok.v === 'true') return true;
      if (tok.v === 'false') return false;
      if (tok.v === 'null') return null;
      return { op: tok.v };
    default: return null;
  }
}

const nameOf = (v) => (v && typeof v === 'object' && 'name' in v ? v.name : null);

// ---------- documento ----------

class PdfDoc {
  constructor(src) {
    this.src = src;
    this.objs = new Map(); // num → { dictSrc, valueCache, raw (stream latin1) | null }
    this.decoded = new Map();
  }

  scan() {
    const s = this.src;
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let m;
    while ((m = re.exec(s))) {
      const num = Number(m[1]);
      const start = re.lastIndex;
      const endObj = s.indexOf('endobj', start);
      const st = s.indexOf('stream', start);
      if (st >= 0 && (endObj < 0 || st < endObj) && s.slice(start, st).trimEnd().endsWith('>>')) {
        let dataStart = st + 6;
        if (s[dataStart] === '\r') dataStart++;
        if (s[dataStart] === '\n') dataStart++;
        const dictSrc = s.slice(start, st);
        const dict = parseValue(new Lexer(dictSrc));
        let dataEnd = -1;
        const len = dict instanceof Map ? dict.get('Length') : null;
        if (typeof len === 'number' && len >= 0 && /^\s*endstream/.test(s.slice(dataStart + len, dataStart + len + 20))) {
          dataEnd = dataStart + len;
        } else {
          const es = s.indexOf('endstream', dataStart);
          if (es < 0) continue;
          dataEnd = es;
          if (s[dataEnd - 1] === '\n') dataEnd--;
          if (s[dataEnd - 1] === '\r') dataEnd--;
        }
        this.objs.set(num, { value: dict, raw: s.slice(dataStart, dataEnd) });
        const after = s.indexOf('endobj', dataEnd);
        re.lastIndex = after >= 0 ? after + 6 : dataEnd;
      } else {
        const end = endObj >= 0 ? endObj : s.length;
        this.objs.set(num, { src: s.slice(start, end), raw: null });
        re.lastIndex = end;
      }
    }
  }

  get(num) {
    const o = this.objs.get(num);
    if (!o) return null;
    if (!('value' in o)) o.value = parseValue(new Lexer(o.src));
    return o.value;
  }

  resolve(v, depth = 0) {
    while (v && typeof v === 'object' && 'ref' in v && depth++ < 20) v = this.get(v.ref);
    return v;
  }

  dictGet(d, key) {
    d = this.resolve(d);
    return d instanceof Map ? this.resolve(d.get(key)) : null;
  }

  // Dati dello stream decodificati (latin1), null se il filtro non è supportato.
  async streamData(num) {
    if (this.decoded.has(num)) return this.decoded.get(num);
    const o = this.objs.get(num);
    let out = null;
    if (o && o.raw !== null) {
      let filters = this.resolve(o.value.get('Filter'));
      filters = filters ? (Array.isArray(filters) ? filters.map((f) => nameOf(this.resolve(f))) : [nameOf(filters)]) : [];
      let data = latin1ToBytes(o.raw);
      let ok = true;
      for (const f of filters) {
        if (f === 'FlateDecode' || f === 'Fl') {
          data = await inflate(data);
          if (!data) { ok = false; break; }
        } else { ok = false; break; }
      }
      if (ok) out = bytesToLatin1(data);
    }
    this.decoded.set(num, out);
    return out;
  }

  // Oggetti dentro gli object stream (/Type /ObjStm): intestazione "num offset" ripetuta /N volte.
  async expandObjectStreams() {
    for (const [num, o] of [...this.objs]) {
      if (o.raw === null || nameOf(o.value.get('Type')) !== 'ObjStm') continue;
      const data = await this.streamData(num);
      if (!data) continue;
      const n = this.resolve(o.value.get('N'));
      const first = this.resolve(o.value.get('First'));
      if (typeof n !== 'number' || typeof first !== 'number') continue;
      const lx = new Lexer(data.slice(0, first));
      const pairs = [];
      for (let i = 0; i < n; i++) {
        const a = lx.next();
        const b = lx.next();
        if (a.t !== 'num' || b.t !== 'num') break;
        pairs.push([a.v, b.v]);
      }
      pairs.forEach(([objNum, off], i) => {
        if (this.objs.has(objNum)) return;
        const end = i + 1 < pairs.length ? first + pairs[i + 1][1] : data.length;
        this.objs.set(objNum, { src: data.slice(first + off, end), raw: null });
      });
    }
  }

  isEncrypted() {
    for (const o of this.objs.values()) {
      if (o.raw !== null && nameOf(o.value.get('Type')) === 'XRef' && o.value.has('Encrypt')) return true;
    }
    const s = this.src;
    let i = s.indexOf('trailer');
    while (i >= 0) {
      const d = parseValue(new Lexer(s, i + 7));
      if (d instanceof Map && d.has('Encrypt')) return true;
      i = s.indexOf('trailer', i + 7);
    }
    return false;
  }

  // Pagine in ordine: dall'albero /Pages del catalogo; in mancanza, gli oggetti /Type /Page per numero.
  pages() {
    const out = [];
    const seen = new Set();
    const walk = (ref, depth) => {
      if (!ref || depth > 30 || typeof ref !== 'object' || !('ref' in ref) || seen.has(ref.ref)) return;
      seen.add(ref.ref);
      const node = this.get(ref.ref);
      if (!(node instanceof Map)) return;
      const type = nameOf(node.get('Type'));
      if (type === 'Page' || (!type && !node.has('Kids'))) out.push(ref.ref);
      else for (const k of this.resolve(node.get('Kids')) || []) walk(k, depth + 1);
    };
    for (const num of [...this.objs.keys()].sort((a, b) => a - b)) {
      const v = this.get(num);
      if (v instanceof Map && nameOf(v.get('Type')) === 'Catalog') { walk(v.get('Pages'), 0); break; }
    }
    if (out.length) return out;
    return [...this.objs.keys()].sort((a, b) => a - b).filter((n) => {
      const v = this.get(n);
      return v instanceof Map && nameOf(v.get('Type')) === 'Page';
    });
  }

  // Risorse ereditabili dalla pagina e dai suoi /Parent.
  inherited(pageNum, key) {
    let node = this.get(pageNum);
    for (let i = 0; node instanceof Map && i < 30; i++) {
      if (node.has(key)) return this.resolve(node.get(key));
      node = this.resolve(node.get('Parent'));
    }
    return null;
  }
}

// ---------- font e mappe ToUnicode ----------

// Byte 0x80–0x9F di WinAnsi diversi da latin1 (i più comuni).
const WIN_ANSI = { 0x80: '€', 0x82: '‚', 0x84: '„', 0x85: '…', 0x91: '‘', 0x92: '’', 0x93: '“', 0x94: '”', 0x95: '•', 0x96: '–', 0x97: '—' };

function utf16Hex(bytes) {
  let out = '';
  for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes.charCodeAt(i) << 8) | bytes.charCodeAt(i + 1));
  if (bytes.length === 1) out = bytes;
  return out;
}

function parseCMap(src) {
  const map = new Map();
  let codeLen = 0;
  const lx = new Lexer(src);
  const strs = (n) => { const a = []; for (let i = 0; i < n; i++) a.push(parseValue(lx)); return a; };
  for (;;) {
    const t = lx.next();
    if (t.t === 'eof') break;
    if (t.t !== 'op') continue;
    if (t.v === 'begincodespacerange') {
      for (;;) {
        const save = lx.p;
        const a = lx.next();
        if (a.t !== 'str') { lx.p = save; break; }
        lx.next();
        codeLen = Math.max(codeLen, a.v.length);
      }
    } else if (t.v === 'beginbfchar') {
      for (;;) {
        const save = lx.p;
        const a = lx.next();
        if (a.t !== 'str') { lx.p = save; break; }
        const [dst] = strs(1);
        if (dst && dst.str !== undefined) map.set(a.v, utf16Hex(dst.str));
        else if (dst && dst.name) map.set(a.v, dst.name);
      }
    } else if (t.v === 'beginbfrange') {
      for (;;) {
        const save = lx.p;
        const a = lx.next();
        if (a.t !== 'str') { lx.p = save; break; }
        const b = lx.next();
        const [dst] = strs(1);
        const lo = parseInt([...a.v].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('') || '0', 16);
        const hi = parseInt([...b.v].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('') || '0', 16);
        const len = a.v.length;
        for (let code = lo, i = 0; code <= hi && i < 65536; code++, i++) {
          let key = ''; // codice big-endian di `len` byte
          for (let k = len - 1; k >= 0; k--) key += String.fromCharCode((code >> (8 * k)) & 0xff);
          if (Array.isArray(dst)) {
            const d = dst[i];
            if (d && d.str !== undefined) map.set(key, utf16Hex(d.str));
          } else if (dst && dst.str !== undefined) {
            const base = utf16Hex(dst.str);
            map.set(key, base.slice(0, -1) + String.fromCharCode(base.charCodeAt(base.length - 1) + i));
          }
        }
      }
    }
  }
  if (!codeLen) for (const k of map.keys()) codeLen = Math.max(codeLen, k.length);
  return { map, codeLen: codeLen || 1 };
}

async function loadFont(doc, fontRef) {
  const font = doc.resolve(fontRef);
  const info = { decode: (b) => [...b].map((c) => WIN_ANSI[c.charCodeAt(0)] || c).join(''), twoByte: false };
  if (!(font instanceof Map)) return info;
  const subtype = nameOf(doc.resolve(font.get('Subtype')));
  const tu = font.get('ToUnicode');
  if (tu && typeof tu === 'object' && 'ref' in tu) {
    const src = await doc.streamData(tu.ref);
    if (src) {
      const { map, codeLen } = parseCMap(src);
      const len = subtype === 'Type0' ? Math.max(2, codeLen) : codeLen;
      info.twoByte = len === 2;
      info.decode = (b) => {
        let out = '';
        for (let i = 0; i < b.length; i += len) {
          const code = b.slice(i, i + len);
          const u = map.get(code);
          if (u !== undefined) out += u;
          else if (len === 1) out += WIN_ANSI[code.charCodeAt(0)] || code;
        }
        return out;
      };
      return info;
    }
  }
  if (subtype === 'Type0') {
    // Senza ToUnicode i codici a 2 byte non dicono quale carattere sia: niente testo.
    info.twoByte = true;
    info.decode = () => '';
  }
  return info;
}

// ---------- content stream ----------

const mul = (a, b) => [
  a[0] * b[0] + a[1] * b[2], a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2], a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4], a[4] * b[1] + a[5] * b[3] + b[5],
];
const ID = [1, 0, 0, 1, 0, 0];

// Font di un dizionario /Resources: Map nome → decodificatore.
async function loadFonts(doc, res) {
  const fonts = new Map();
  const fontDict = res instanceof Map ? doc.resolve(res.get('Font')) : null;
  if (fontDict instanceof Map) {
    for (const [name, ref] of fontDict) fonts.set(name, await loadFont(doc, ref));
  }
  return fonts;
}

const MAX_FORM_DEPTH = 5;

// Interpreta gli operatori di testo e aggiunge a `pieces` i pezzi { x, y, text, seq }.
// ctx = { doc, fonts, resources, depth, visited }: con `Do` legge anche il testo dei Form XObject
// (moduli prestampati con le etichette fisse in un modello separato dai valori).
async function runContent(src, ctx, pieces, startCtm = ID) {
  const { doc, fonts } = ctx;
  const lx = new Lexer(src);
  let ops = [];
  let ctm = startCtm;
  const stack = [];
  let tm = ID;
  let lm = ID;
  let font = null;
  let size = 0;
  let leading = 0;
  let last = null; // ultimo pezzo, per unire i Tj consecutivi senza riposizionamento

  const show = (str) => {
    if (!font) return;
    const text = font.decode(str);
    const m = mul(tm, ctm);
    if (last) last.text += text;
    else {
      last = { x: m[4], y: m[5], text, seq: pieces.length };
      pieces.push(last);
    }
    // avanzamento stimato (mezza em per carattere): serve solo a ordinare i pezzi sulla riga
    const n = font.twoByte ? str.length / 2 : str.length;
    tm = mul([1, 0, 0, 1, n * size * 0.5, 0], tm);
  };
  const moveTo = (m) => { lm = m; tm = m; last = null; };
  const nextLine = () => moveTo(mul([1, 0, 0, 1, 0, -leading], lm));

  for (;;) {
    const tok = lx.next();
    if (tok.t === 'eof') break;
    if (tok.t !== 'op') { ops.push(parseValue(lx, tok)); continue; }
    const op = tok.v;
    const num = (i) => (typeof ops[i] === 'number' ? ops[i] : 0);
    switch (op) {
      case 'true': case 'false': case 'null': ops.push(op === 'true'); continue;
      case 'q': stack.push(ctm); break;
      case 'Q': ctm = stack.pop() || ID; last = null; break;
      case 'cm': if (ops.length >= 6) ctm = mul(ops.slice(-6).map((v) => (typeof v === 'number' ? v : 0)), ctm); last = null; break;
      case 'BT': tm = ID; lm = ID; last = null; break;
      case 'ET': last = null; break;
      case 'Tf': {
        const f = ops.length >= 2 ? nameOf(ops[ops.length - 2]) : null;
        font = (f && fonts.get(f)) || null;
        size = Math.abs(num(ops.length - 1)) || size;
        last = null;
        break;
      }
      case 'TL': leading = num(ops.length - 1); break;
      case 'Tm': if (ops.length >= 6) moveTo(ops.slice(-6).map((v) => (typeof v === 'number' ? v : 0))); break;
      case 'Td': moveTo(mul([1, 0, 0, 1, num(ops.length - 2), num(ops.length - 1)], lm)); break;
      case 'TD': leading = -num(ops.length - 1); moveTo(mul([1, 0, 0, 1, num(ops.length - 2), num(ops.length - 1)], lm)); break;
      case 'T*': nextLine(); break;
      case 'Tj': { const s = ops[ops.length - 1]; if (s && s.str !== undefined) show(s.str); break; }
      case "'": { nextLine(); const s = ops[ops.length - 1]; if (s && s.str !== undefined) show(s.str); break; }
      case '"': { nextLine(); const s = ops[ops.length - 1]; if (s && s.str !== undefined) show(s.str); break; }
      case 'TJ': {
        const arr = ops[ops.length - 1];
        if (Array.isArray(arr)) {
          for (const it of arr) {
            if (it && it.str !== undefined) show(it.str);
            else if (typeof it === 'number' && it < -200 && last) last.text += ' '; // crenatura larga = spazio
          }
        }
        break;
      }
      case 'Do': {
        const name = ops.length ? nameOf(ops[ops.length - 1]) : null;
        last = null;
        if (name) await runForm(name, ctx, pieces, ctm);
        break;
      }
      case 'BI': {
        // immagine in linea: salta fino a "EI"
        const s = lx.s;
        const id = s.indexOf('ID', lx.p);
        const ei = id >= 0 ? s.slice(id + 2).search(/\sEI(\s|$)/) : -1;
        lx.p = ei >= 0 ? id + 2 + ei + 3 : s.length;
        break;
      }
      default: break;
    }
    ops = [];
  }
}

// Form XObject richiamato con `Do`: /Matrix (default identità) per la CTM corrente, font delle sue /Resources
// (se mancano, quelli di chi lo richiama), profondità massima 5 e nessun oggetto visitato due volte (niente cicli).
// Le immagini (/Subtype /Image) si ignorano.
async function runForm(name, ctx, pieces, ctm) {
  const { doc } = ctx;
  if (ctx.depth >= MAX_FORM_DEPTH) return;
  const xobjs = ctx.resources instanceof Map ? doc.resolve(ctx.resources.get('XObject')) : null;
  const ref = xobjs instanceof Map ? xobjs.get(name) : null;
  if (!ref || typeof ref !== 'object' || !('ref' in ref) || ctx.visited.has(ref.ref)) return;
  const o = doc.objs.get(ref.ref);
  if (!o || o.raw === null || nameOf(doc.resolve(o.value.get('Subtype'))) !== 'Form') return;
  const data = await doc.streamData(ref.ref);
  if (!data) return;
  const mx = doc.resolve(o.value.get('Matrix'));
  const matrix = Array.isArray(mx) && mx.length === 6 ? mx.map((v) => (typeof v === 'number' ? v : 0)) : ID;
  const res = doc.resolve(o.value.get('Resources'));
  const own = res instanceof Map && doc.resolve(res.get('Font')) instanceof Map;
  const sub = {
    doc,
    fonts: own ? await loadFonts(doc, res) : ctx.fonts,
    resources: res instanceof Map ? res : ctx.resources,
    depth: ctx.depth + 1,
    visited: new Set([...ctx.visited, ref.ref]),
  };
  await runContent(data, sub, pieces, mul(matrix, ctm));
}

// Raggruppa i pezzi per y (tolleranza 2 punti, dall'alto in basso) e li ordina per x.
function toLines(pieces) {
  const sorted = [...pieces].filter((p) => p.text.trim()).sort((a, b) => b.y - a.y || a.seq - b.seq);
  const lines = [];
  let cur = null;
  for (const p of sorted) {
    if (cur && Math.abs(cur.y - p.y) <= 2) cur.items.push(p);
    else { cur = { y: p.y, items: [p] }; lines.push(cur); }
  }
  return lines
    .map((l) => l.items.sort((a, b) => a.x - b.x || a.seq - b.seq).map((p) => p.text).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

// Uint8Array → righe di testo (tutte le pagine, in ordine).
export async function extractPdfLines(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  const src = bytesToLatin1(bytes);
  if (!src.slice(0, 1024).includes('%PDF-')) throw new PdfReadError(MSG_NOT_PDF);
  const doc = new PdfDoc(src);
  try {
    doc.scan();
  } catch {
    throw new PdfReadError(MSG_BROKEN);
  }
  if (doc.isEncrypted()) throw new PdfReadError(MSG_ENCRYPTED);
  await doc.expandObjectStreams();
  const lines = [];
  for (const pageNum of doc.pages()) {
    const page = doc.get(pageNum);
    const res = doc.inherited(pageNum, 'Resources');
    const fonts = await loadFonts(doc, res);
    let contents = page instanceof Map ? page.get('Contents') : null;
    const resolved = doc.resolve(contents);
    if (Array.isArray(resolved)) contents = resolved;
    const refs = Array.isArray(contents) ? contents : [contents];
    let text = '';
    for (const r of refs) {
      if (r && typeof r === 'object' && 'ref' in r) {
        const d = await doc.streamData(r.ref);
        if (d) text += d + '\n';
      }
    }
    const pieces = [];
    const ctx = { doc, fonts, resources: res instanceof Map ? res : null, depth: 0, visited: new Set() };
    try { await runContent(text, ctx, pieces); } catch { /* contenuto non interpretabile: si tiene quanto letto */ }
    lines.push(...toLines(pieces));
  }
  if (!lines.length) throw new PdfReadError(MSG_NO_TEXT);
  return lines;
}

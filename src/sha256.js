// SHA-256 + Base64 em JavaScript puro (sem depender de crypto nativo).
const K = [];
const H0 = [];
(() => {
  const primes = [];
  let n = 2;
  while (primes.length < 64) {
    let isPrime = true;
    for (let i = 2; i * i <= n; i++) if (n % i === 0) { isPrime = false; break; }
    if (isPrime) primes.push(n);
    n++;
  }
  const frac = (x) => Math.floor((x - Math.floor(x)) * 4294967296);
  primes.forEach((p) => K.push(frac(Math.cbrt(p))));
  primes.slice(0, 8).forEach((p) => H0.push(frac(Math.sqrt(p))));
})();

const rotr = (x, n) => (x >>> n) | (x << (32 - n));

export function utf8(str) {
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const d = str.charCodeAt(i + 1);
      if (d >= 0xdc00 && d <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

export function sha256(bytes) {
  const len = bytes.length;
  const total = ((len + 9 + 63) >> 6) << 6;
  const b = new Uint8Array(total);
  b.set(bytes);
  b[len] = 0x80;
  const bits = len * 8;
  b[total - 4] = (bits >>> 24) & 255;
  b[total - 3] = (bits >>> 16) & 255;
  b[total - 2] = (bits >>> 8) & 255;
  b[total - 1] = bits & 255;
  const hi = Math.floor(len / 536870912);
  b[total - 8] = (hi >>> 24) & 255;
  b[total - 7] = (hi >>> 16) & 255;
  b[total - 6] = (hi >>> 8) & 255;
  b[total - 5] = hi & 255;

  const h = H0.slice();
  const w = new Array(64);
  for (let o = 0; o < total; o += 64) {
    for (let i = 0; i < 16; i++) {
      const j = o + i * 4;
      w[i] = (b[j] << 24) | (b[j + 1] << 16) | (b[j + 2] << 8) | b[j + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const mj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + mj) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] = (h[0] + a) | 0; h[1] = (h[1] + bb) | 0; h[2] = (h[2] + c) | 0; h[3] = (h[3] + d) | 0;
    h[4] = (h[4] + e) | 0; h[5] = (h[5] + f) | 0; h[6] = (h[6] + g) | 0; h[7] = (h[7] + hh) | 0;
  }
  const out = [];
  h.forEach((v) => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255));
  return out;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function base64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
    const n = (a << 16) | ((b || 0) << 8) | (c || 0);
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63];
    s += b === undefined ? '=' : B64[(n >> 6) & 63];
    s += c === undefined ? '=' : B64[n & 63];
  }
  return s;
}

export const b64sha = (str) => base64(sha256(utf8(str)));

// Branded QR code as SVG: modules merged into rounded runs (no gaps, so it stays easy to scan), rounded finder "eyes",
// and the logo ring in a cleared centre. Error correction H or Q keeps it robust; build.mjs
// verifies every generated code with two independent decoders.
import QRCode from 'qrcode';
import { createRequire } from 'node:module';
import { ringDots } from './ring.mjs';

const require = createRequire(import.meta.url);
const Alignment = require('qrcode/lib/core/alignment-pattern');

const n2 = (v) => +v.toFixed(3);
const DOT_R = +(process.env.QR_DOT_R || 0.5);

/**
 * @param {string} text  URL to encode
 * @param {object} o
 * @param {string} [o.dark]   data dot colour
 * @param {string} [o.eye]    finder pattern colour
 * @param {string} [o.ring]   centre logo colour
 * @param {number} [o.quiet]  quiet zone in modules (spec: 4)
 * @param {boolean} [o.logo]  put the ring logo in the centre
 * @param {'pills'|'dots'|'rounded'|'squares'} [o.style]
 */
export function qrSvg(text, o = {}) {
  const { dark = '#1C2B45', eye = '#2D67AA', ring = '#4A86CF', quiet = 4, logo = true, style = 'pills' } = o;
  // Strongest error correction that still fits 41×41 modules (version ≤ 6): from version 7 on an alignment
  // pattern sits in the centre where the logo goes. H restores 30 % of the code, Q 25 %.
  const make = (ecc) => ({ ecc, code: QRCode.create(text, { errorCorrectionLevel: ecc }) });
  const { ecc, code: qr } = [make('H'), make('Q')].find((c) => c.code.version <= 6) ?? make('H');
  const N = qr.modules.size;
  const get = (r, c) => qr.modules.get(r, c);
  const reserved = (r, c) => qr.modules.isReserved(r, c);

  // finder patterns (7x7) + separators are drawn separately
  const inFinder = (r, c) =>
    (r < 8 && c < 8) || (r < 8 && c >= N - 8) || (r >= N - 8 && c < 8);

  // alignment patterns (5x5), drawn as crisp rounded squares
  const align = Alignment.getPositions(qr.version).filter(([r, c]) => !inFinder(r, c));
  const inAlign = (r, c) => align.some(([ar, ac]) => Math.abs(r - ar) <= 2 && Math.abs(c - ac) <= 2);

  // centre area for the logo: a circle that must not touch any function pattern
  const mid = (N - 1) / 2;
  let clearR = logo ? N * 0.135 : 0;
  const touchesFunction = (rad) => {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (Math.hypot(r - mid, c - mid) <= rad + 0.5 && reserved(r, c) && !(r === 6 || c === 6)) return true;
    }
    return false;
  };
  while (clearR > 0 && touchesFunction(clearR)) clearR -= 0.5;
  const cleared = (r, c) => clearR > 0 && Math.hypot(r - mid, c - mid) <= clearR;

  const q = quiet;
  const parts = [];
  const dots = [];
  const isData = (r, c) => r >= 0 && c >= 0 && r < N && c < N && get(r, c) && !inFinder(r, c) && !inAlign(r, c) && !cleared(r, c);
  if (style === 'pills') {
    // horizontal runs of dark modules as one shape: square where a neighbour continues the run
    // (also vertically), rounded only at free ends, so there are no gaps for scanners to trip on
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        if (!isData(r, c)) continue;
        let e = c;
        while (isData(r, e + 1)) e++;
        const x = c + q, y = r + q, w = e - c + 1;
        const rad = 0.5;
        const tl = !isData(r - 1, c) && !isData(r, c - 1), bl = !isData(r + 1, c) && !isData(r, c - 1);
        const tr = !isData(r - 1, e) && !isData(r, e + 1), br = !isData(r + 1, e) && !isData(r, e + 1);
        dots.push(cornerRect(x, y, w, 1, tl ? rad : 0, tr ? rad : 0, br ? rad : 0, bl ? rad : 0));
        c = e;
      }
    }
  }
  for (let r = 0; r < N && style !== 'pills'; r++) {
    for (let c = 0; c < N; c++) {
      if (!get(r, c) || inFinder(r, c) || inAlign(r, c) || cleared(r, c)) continue;
      const x = c + q, y = r + q;
      if (style === 'dots') {
        dots.push(`M${n2(x + 0.5 - DOT_R)} ${n2(y + 0.5)}a${DOT_R} ${DOT_R} 0 1 0 ${2 * DOT_R} 0a${DOT_R} ${DOT_R} 0 1 0 -${2 * DOT_R} 0`);
      } else if (style === 'rounded') {
        dots.push(roundRect(n2(x + 0.02), n2(y + 0.02), 0.96, 0.96, 0.3));
      } else {
        dots.push(`M${x} ${y}h1v1h-1z`);
      }
    }
  }
  parts.push(`<path fill="${dark}" d="${dots.join('')}"/>`);

  // finder eyes
  const eyes = [[0, 0], [0, N - 7], [N - 7, 0]];
  for (const [r, c] of eyes) {
    const x = c + q, y = r + q;
    parts.push(
      `<path fill="${eye}" fill-rule="evenodd" d="${roundRect(x, y, 7, 7, 2.1)}${roundRect(x + 1, y + 1, 5, 5, 1.35)}"/>`,
      `<path fill="${eye}" d="${roundRect(x + 2, y + 2, 3, 3, 0.95)}"/>`,
    );
  }
  // alignment patterns
  for (const [r, c] of align) {
    const x = c - 2 + q, y = r - 2 + q;
    parts.push(
      `<path fill="${dark}" fill-rule="evenodd" d="${roundRect(x, y, 5, 5, 1.4)}${roundRect(x + 1, y + 1, 3, 3, 0.8)}"/>`,
      `<circle fill="${dark}" cx="${x + 2.5}" cy="${y + 2.5}" r=".55"/>`,
    );
  }
  // centre logo
  if (clearR > 0) {
    const cx = mid + 0.5 + q, cy = mid + 0.5 + q;
    const scale = (clearR - 0.9) / 100;
    parts.push(`<g fill="${ring}">${ringDots(cx, cy, scale).map((d) => `<circle cx="${n2(d.x)}" cy="${n2(d.y)}" r="${n2(d.r)}"/>`).join('')}</g>`);
  }

  const S = N + 2 * q;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" shape-rendering="geometricPrecision" role="img" aria-label="QR code: ${escapeXml(text)}">` +
    `<rect width="${S}" height="${S}" fill="#fff"/>${parts.join('')}</svg>`;
  return { svg, version: qr.version, ecc, modules: N, size: S, clearedRadius: clearR };
}

function cornerRect(x, y, w, h, tl, tr, br, bl) {
  const a = (r, dx, dy) => (r ? `a${r} ${r} 0 0 1 ${dx} ${dy}` : '');
  return `M${x + tl} ${y}h${w - tl - tr}${a(tr, tr, tr)}v${h - tr - br}${a(br, -br, br)}h-${w - br - bl}${a(bl, -bl, -bl)}v-${h - bl - tl}${a(tl, tl, -tl)}z`;
}

function roundRect(x, y, w, h, r) {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`;
}

function escapeXml(s) {
  return s.replace(/[<>&"]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[ch]));
}

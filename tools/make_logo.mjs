// Recreates the PolarisDX logo as clean vector SVG (from the printed form):
//  - the dotted ring, which repeats the same 9 dots in each quarter (4-fold rotation),
//  - the wordmark "POLARIS" (Figtree Bold, grey) + "DX" (Figtree Regular, blue), outlined to paths
//    so it looks identical everywhere, with no font needed.
// If you have the official logo file, replace src/logo/*.svg with it; everything else picks it up.
//
// Usage: node tools/make_logo.mjs   (needs tools/.cache/Figtree-*.ttf from make_fonts.py)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import opentype from 'opentype.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', 'src', 'logo');
fs.mkdirSync(OUT, { recursive: true });

import { BRAND, ringDots } from './ring.mjs';

const circles = (dots, fill) =>
  dots.map((d) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}"${fill ? ` fill="${fill}"` : ''}/>`).join('');

// --- mark (ring only), viewBox centred on the ring ---
const R = 100;
const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 2} ${-R - 2} ${2 * R + 4} ${2 * R + 4}" role="img" aria-label="PolarisDX">` +
  `<g fill="${BRAND.blue}">${circles(ringDots())}</g></svg>\n`;
fs.writeFileSync(path.join(OUT, 'mark.svg'), mark);

// --- full lockup ---
const font = (n) => opentype.loadSync(path.join(HERE, '.cache', `Figtree-${n}.ttf`));
const bold = font('Bold');
const light = font('Regular');

const capH = 0.41 * 2 * R;             // cap height relative to ring diameter (measured on the print)
const size = capH / (bold.tables.os2.sCapHeight / bold.unitsPerEm);
const gap = 0.26 * 2 * R;              // ring → "P"
const baseline = capH / 2;              // caps centred on the ring centre (y = 0)
const tracking = 0.035 * size;          // open letter spacing, as in the print

function word(fontObj, text, x) {
  let d = '';
  let pen = x;
  for (let i = 0; i < text.length; i++) {
    const g = fontObj.charToGlyph(text[i]);
    d += g.getPath(pen, baseline, size).toPathData(2);
    pen += (g.advanceWidth / fontObj.unitsPerEm) * size + tracking;
    if (i < text.length - 1) {
      pen += (fontObj.getKerningValue(g, fontObj.charToGlyph(text[i + 1])) / fontObj.unitsPerEm) * size;
    }
  }
  return { d, end: pen - tracking };
}

const x0 = R + gap;
const pol = word(bold, 'POLARIS', x0);
const dx = word(light, 'DX', pol.end + 0.06 * capH);
const right = Math.ceil(dx.end + 2);
const lockup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-R - 2} ${-R - 2} ${right + R + 2} ${2 * R + 4}" role="img" aria-label="PolarisDX">` +
  `<g fill="${BRAND.blue}">${circles(ringDots())}</g>` +
  `<path fill="${BRAND.grey}" d="${pol.d}"/>` +
  `<path fill="${BRAND.blue}" d="${dx.d}"/></svg>\n`;
fs.writeFileSync(path.join(OUT, 'logo.svg'), lockup);

// white version for dark backgrounds
fs.writeFileSync(path.join(OUT, 'logo-white.svg'),
  lockup.replace(`fill="${BRAND.grey}"`, 'fill="#FFFFFF"').replaceAll(`fill="${BRAND.blue}"`, 'fill="#BFD6F5"'));

console.log('logo.svg', lockup.length, 'bytes; aspect', ((right + R + 2) / (2 * R + 4)).toFixed(3));

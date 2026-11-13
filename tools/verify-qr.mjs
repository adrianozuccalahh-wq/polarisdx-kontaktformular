// Checks that QR codes decode to the expected URL under tough conditions:
// small, blurred, tilted (perspective) and rotated, with two independent decoders (jsQR + ZXing).
// Pass = ZXing reads every variant and jsQR every variant except the two extreme 40° tilts.
// Usage: node tools/verify-qr.mjs <file.svg|file.png|file.pdf.png> <expected-url> [...more pairs]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(HERE, '.cache', 'qr-verify');
fs.mkdirSync(TMP, { recursive: true });

const VARIANTS = [
  { name: 'large', px: 600, css: '' },
  { name: 'small-150px', px: 150, css: '' },
  { name: 'tiny-110px', px: 110, css: '' },
  { name: 'blur', px: 300, css: 'filter: blur(1.6px);' },
  { name: 'rotated-17deg', px: 300, css: 'transform: rotate(17deg);' },
  // extreme angles: ZXing (the decoder family used by most phone scanners) must read them; jsQR is weaker there
  { name: 'tilted-40deg', px: 320, css: 'transform: perspective(500px) rotateX(40deg);', extreme: true },
  { name: 'tilted+rotated', px: 320, css: 'transform: perspective(600px) rotateY(32deg) rotate(-9deg);', extreme: true },
  { name: 'dim-lowcontrast', px: 300, css: 'filter: contrast(.55) brightness(1.15);' },
];

export async function verify(pairs, { quiet = false } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 760, height: 760 }, deviceScaleFactor: 1 });
  let failures = 0;
  for (const [file, expected] of pairs) {
    const mime = file.endsWith('.svg') ? 'image/svg+xml' : 'image/png';
    const src = `data:${mime};base64,${fs.readFileSync(path.resolve(file)).toString('base64')}`;
    for (const v of VARIANTS) {
      await page.setContent(`<html><body style="margin:0;background:#fff;display:grid;place-items:center;height:760px">
        <img src="${src}" style="width:${v.px}px;height:${v.px}px;${v.css}"></body></html>`);
      await page.waitForFunction(() => document.images[0].complete);
      const out = path.join(TMP, `${path.basename(file)}.${v.name}.png`);
      await page.screenshot({ path: out });
      const png = PNG.sync.read(fs.readFileSync(out));
      const js = jsQR(new Uint8ClampedArray(png.data), png.width, png.height, { inversionAttempts: 'dontInvert' });
      let zx = '';
      try {
        zx = execFileSync('python3', ['-I', '-c',
          'import sys,zxingcpp;from PIL import Image;r=zxingcpp.read_barcodes(Image.open(sys.argv[1]));print(r[0].text if r else "")', out],
        { encoding: 'utf8' }).trim();
      } catch (e) { zx = `ERR ${e.message.split('\n')[0]}`; }
      const okJs = js?.data === expected;
      const okZx = zx === expected;
      const pass = okZx && (okJs || v.extreme);
      if (!pass) failures++;
      if (!quiet || !pass) {
        console.log(`${pass ? 'ok  ' : 'FAIL'} ${path.basename(file).padEnd(34)} ${v.name.padEnd(16)} jsQR:${okJs ? 'ok' : (v.extreme ? 'n/a (extreme)' : js?.data ?? '—')}  ZXing:${okZx ? 'ok' : zx || '—'}`);
      }
    }
  }
  await browser.close();
  return failures;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const pairs = [];
  for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
  const failures = await verify(pairs);
  console.log(failures ? `\n${failures} failed decode(s)` : '\nall decodes ok');
  process.exit(failures ? 1 : 0);
}

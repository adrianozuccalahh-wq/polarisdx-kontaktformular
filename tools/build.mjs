// Builds everything from config.json:
//   docs/index.html            the online form (QR target), one self-contained file; docs/ is the GitHub Pages root
//   docs/de/index.html         the same form opening in German (QR on the German print form)
//   output/*.pdf               print form DE + EN, QR sign (A4)
//   output/qr/*.svg|png        QR codes on their own
//   output/vorschau/*.png      previews
// and checks that every QR code (also inside the PDFs' artwork) decodes to the right URL.
//
// Usage (from tools/):  npm install && node build.mjs [--url https://…] [--recipient you@x.y]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { qrSvg } from './qr.mjs';
import { ringDots, ringSvgCircles } from './ring.mjs';
import { icon } from '../src/icons.mjs';
import { verify } from './verify-qr.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const CACHE = path.join(HERE, '.cache');
const OUT = path.join(ROOT, 'output');
const SITE = path.join(ROOT, 'docs');
for (const d of [CACHE, OUT, path.join(OUT, 'qr'), path.join(OUT, 'vorschau'), SITE]) fs.mkdirSync(d, { recursive: true });

// ---------- config ----------
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const argv = process.argv.slice(2);
const arg = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined; };
cfg.formUrl = arg('url') ?? cfg.formUrl;
cfg.recipient = arg('recipient') ?? cfg.recipient;
if (!/^https:\/\/[^\s]+\/$/.test(cfg.formUrl)) throw new Error(`formUrl must be https://… and end with "/": ${cfg.formUrl}`);
if (!cfg.recipient || /\s/.test(cfg.recipient)) throw new Error('recipient missing');
const URL_EN = cfg.formUrl;
const URL_DE = `${cfg.formUrl}de/`;   // same form, opens in German (for the German print form)

// ---------- shared assets ----------
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const b64 = (p) => fs.readFileSync(path.join(ROOT, p)).toString('base64');
const FONTS = {
  FONT_400: b64('src/fonts/Figtree-Regular.woff2'),
  FONT_500: b64('src/fonts/Figtree-Medium.woff2'),
  FONT_600: b64('src/fonts/Figtree-SemiBold.woff2'),
  FONT_700: b64('src/fonts/Figtree-Bold.woff2'),
};
const logoSvg = read('src/logo/logo.svg').trim().replace('<svg ', '<svg class="logo" ');
const markSvg = read('src/logo/mark.svg').trim();
const svgDataUri = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

function fill(template, vars, label) {
  let out = template.replace(/\{\{icon:(\w+)\}\}/g, (_, n) => icon(n));
  out = out.replace(/\{\{([\w.]+)\}\}/g, (m, key) => {
    const v = key.split('.').reduce((o, k) => (o == null ? o : o[k]), vars);
    if (v == null) throw new Error(`${label}: no value for ${m}`);
    return v;
  });
  return out;
}

// ---------- QR codes ----------
const qrEN = qrSvg(URL_EN);
const qrDE = qrSvg(URL_DE);
const QR_FILES = {
  en: path.join(OUT, 'qr', 'PolarisDX_QR_Kontaktformular.svg'),
  de: path.join(OUT, 'qr', 'PolarisDX_QR_Kontaktformular_DE.svg'),
};
fs.writeFileSync(QR_FILES.en, qrEN.svg);
fs.writeFileSync(QR_FILES.de, qrDE.svg);
for (const [u, q] of [[URL_EN, qrEN], [URL_DE, qrDE]]) console.log(`QR: version ${q.version} (${q.modules}×${q.modules}), error correction ${q.ecc}, ${u}`);

// ---------- web form ----------
const burst = ringDots(0, 0, 1).map((d, i) => `<circle cx="${d.x}" cy="${d.y}" r="${d.r}" style="--i:${i}"/>`).join('');
const tint = markSvg.replace(/fill="#[0-9A-Fa-f]{6}"/, 'fill="#4A86CF" fill-opacity="0.07"');
const privacy = cfg.privacyUrl
  ? { link: ` <a href="${cfg.privacyUrl}" target="_blank" rel="noopener" data-i18n="privacy">Privacy policy</a>`,
      foot: ` · <a href="${cfg.privacyUrl}" target="_blank" rel="noopener" data-i18n="privacy">Privacy policy</a>` }
  : { link: '', foot: '' };
const webVars = {
  ...FONTS,
  LOGO_SVG: logoSvg.replace('role="img"', 'role="img" focusable="false"'),
  MARK_DATAURI: svgDataUri(markSvg),
  MARK_TINT_DATAURI: svgDataUri(tint),
  RING_BURST: burst,
  RECIPIENT: cfg.recipient,
  FORM_URL: cfg.formUrl,
  PRIVACY_LINK: privacy.link,
  PRIVACY_FOOT: privacy.foot,
};
const web = fill(read('src/web/index.html'), { ...webVars, DEFAULT_LANG: 'en', PAGE_URL: URL_EN }, 'web');
const webDe = fill(read('src/web/index.html'), { ...webVars, DEFAULT_LANG: 'de', PAGE_URL: URL_DE }, 'web-de');
fs.mkdirSync(path.join(SITE, 'de'), { recursive: true });
fs.writeFileSync(path.join(SITE, 'index.html'), web);
fs.writeFileSync(path.join(SITE, 'de', 'index.html'), webDe);
fs.writeFileSync(path.join(SITE, '.nojekyll'), '');
console.log(`web: docs/index.html + docs/de/index.html (${(web.length / 1024).toFixed(0)} KB each)`);

// ---------- print ----------
const STRINGS = {
  de: {
    docTitle: 'PolarisDX – Kontaktformular',
    eyebrow: 'Kontakt', title: 'Kontaktformular',
    lead: 'Wir freuen uns auf Ihre Nachricht und melden uns schnellstmöglich bei Ihnen.',
    name: 'Name', nameHint: 'Vor- und Nachname',
    address: 'Adresse', street: 'Straße, Hausnummer', city: 'PLZ, Ort',
    phone: 'Telefon', email: 'E-Mail', emailHint: 'bitte gut leserlich',
    request: 'Kundenwunsch', requestHint: 'Wie können wir Ihnen helfen?',
    consent: 'Ich bin einverstanden, dass meine Angaben zur Bearbeitung meiner Anfrage gespeichert und verwendet werden. Die Einwilligung kann ich jederzeit widerrufen.',
    date: 'Datum', signature: 'Unterschrift',
    qrTitle: 'Lieber digital?', qrText: 'QR-Code scannen und das Formular direkt auf dem Smartphone ausfüllen.',
  },
  en: {
    docTitle: 'PolarisDX – Contact form',
    eyebrow: 'Contact', title: 'Contact form',
    lead: 'We look forward to hearing from you and will get back to you as soon as possible.',
    name: 'Name', nameHint: 'First and last name',
    address: 'Address', street: 'Street, house number', city: 'Postcode, city',
    phone: 'Phone', email: 'Email', emailHint: 'please write clearly',
    request: 'Your request', requestHint: 'How can we help you?',
    consent: 'I agree that my details may be stored and used to process my request. I can withdraw my consent at any time.',
    date: 'Date', signature: 'Signature',
    qrTitle: 'Prefer digital?', qrText: 'Scan the QR code and fill in the form right on your phone.',
  },
};
const RING = `<g>${ringSvgCircles()}</g>`;
const jobs = [
  { file: 'PolarisDX_Kontaktformular_DE', tpl: 'src/print/form.html', vars: { lang: 'de', t: STRINGS.de, QR_SVG: qrDE.svg }, url: URL_DE },
  { file: 'PolarisDX_Contact-Form_EN', tpl: 'src/print/form.html', vars: { lang: 'en', t: STRINGS.en, QR_SVG: qrEN.svg }, url: URL_EN },
  { file: 'PolarisDX_QR-Aufsteller_A4', tpl: 'src/print/sign.html', vars: { QR_SVG: qrEN.svg.replace('<svg ', '<svg class="qr" '), URL_SHORT: URL_EN.replace(/^https:\/\//, '').replace(/\/$/, '') }, url: URL_EN },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 794, height: 1123 }, deviceScaleFactor: 2 });
const previews = [];
for (const job of jobs) {
  const html = fill(read(job.tpl), { ...FONTS, LOGO_SVG: logoSvg, RING, ...job.vars }, job.file);
  const htmlPath = path.join(CACHE, `${job.file}.html`);
  fs.writeFileSync(htmlPath, html);
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(() => document.fonts.ready);
  const overflow = await page.evaluate(() => {
    const c = document.querySelector('.content');
    return c.scrollHeight - c.clientHeight;
  });
  if (overflow > 1) throw new Error(`${job.file}: content overflows the page by ${overflow}px`);
  await page.pdf({ path: path.join(OUT, `${job.file}.pdf`), preferCSSPageSize: true, printBackground: true });
  const png = path.join(OUT, 'vorschau', `${job.file}.png`);
  await page.locator('.page').screenshot({ path: png });
  previews.push([png, job.url]);
  console.log(`print: output/${job.file}.pdf`);
}

// QR codes as PNG too (for slides, e-mail, social media)
for (const [lang, file] of Object.entries(QR_FILES)) {
  const svg = fs.readFileSync(file, 'utf8');
  await page.setViewportSize({ width: 1000, height: 1000 });
  await page.setContent(`<html><body style="margin:0">${svg.replace('<svg ', '<svg width="1000" height="1000" ')}</body></html>`);
  await page.screenshot({ path: file.replace(/\.svg$/, '.png'), clip: { x: 0, y: 0, width: 1000, height: 1000 } });
}
await browser.close();

// ---------- verification ----------
let failures = await verify([[QR_FILES.en, URL_EN], [QR_FILES.de, URL_DE],
  [QR_FILES.en.replace(/\.svg$/, '.png'), URL_EN]], { quiet: true });
for (const [png, url] of previews) {
  // full page preview: is the printed code found and correct?
  const got = execFileSync('python3', ['-I', '-c',
    'import sys,zxingcpp;from PIL import Image;r=zxingcpp.read_barcodes(Image.open(sys.argv[1]));print("\\n".join(x.text for x in r))', png],
  { encoding: 'utf8' }).trim();
  const ok = got === url;
  if (!ok) failures++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} QR on ${path.basename(png)} → ${got || 'not found'}`);
}
if (failures) { console.error(`${failures} QR check(s) failed`); process.exit(1); }
console.log('all QR codes verified');

// End-to-end test of the online form (docs/) in Chromium, phone-sized.
// FormSubmit is mocked: nothing is ever sent. Also writes phone screenshots to output/vorschau.
// Usage (from tools/): node test-form.mjs
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const DOCS = path.join(ROOT, 'docs');
const SHOTS = path.join(ROOT, 'output', 'vorschau');
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
const ENDPOINT = `https://formsubmit.co/ajax/${cfg.recipient}`;

// tiny static server for docs/
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p = path.join(DOCS, decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  if (!p.startsWith(DOCS) || !fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'content-type': p.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const BASE = `${ORIGIN}/`;

const browser = await chromium.launch();
const ctx = await browser.newContext({ ...devices['iPhone 13'] });
let passed = 0;
const results = [];
async function test(name, fn) {
  const page = await ctx.newPage();
  const errors = [];
  const external = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(ORIGIN) && !u.startsWith('data:')) external.push(u); });
  try {
    await fn(page, { errors, external });
    assert.deepEqual(errors, [], 'console/page errors');
    passed++; results.push(`ok    ${name}`);
  } catch (e) {
    results.push(`FAIL  ${name}\n      ${e.message.split('\n').join('\n      ')}`);
  } finally {
    await page.close();
  }
}

// mock FormSubmit; returns an array that collects the request bodies
async function mock(page, reply) {
  const sent = [];
  await page.route('https://formsubmit.co/**', async (route) => {
    const req = route.request();
    sent.push({ url: req.url(), body: req.postDataJSON(), headers: req.headers() });
    await reply(route);
  });
  return sent;
}
const okReply = (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: 'true', message: 'The form was submitted successfully.' }) });

async function fillValid(page) {
  await page.fill('#name', 'Anna Schmidt');
  await page.fill('#street', 'Musterstraße 12');
  await page.fill('#postcode', '20095');
  await page.fill('#city', 'Hamburg');
  await page.fill('#country', 'Germany');
  await page.fill('#phone', '+49 40 123456');
  await page.fill('#email', 'anna.schmidt@example.com');
  await page.fill('#request', 'Please send me an offer for 20 units.');
  await page.check('#consent');
}

await test('opens in English, no external requests, fits the phone width', async (page, { external }) => {
  await page.goto(BASE);
  assert.equal(await page.locator('h1').textContent(), 'Contact form');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.locator('#formCard').isVisible(), true);
  assert.equal(await page.locator('#doneCard').isVisible(), false);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `horizontal overflow ${overflow}px`);
  const fontOk = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('600 16px Figtree'); });
  assert.equal(fontOk, true, 'Figtree font loaded');
  assert.deepEqual(external, [], 'page loads nothing from other servers');
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Handy.png'), fullPage: true });
});

await test('empty submit shows errors for name, email, consent and sends nothing', async (page) => {
  const sent = await mock(page, okReply);
  await page.goto(BASE);
  await page.click('#submit');
  for (const id of ['name', 'email', 'consent']) {
    assert.equal(await page.locator(`#f-${id}`).getAttribute('class').then((c) => c.includes('invalid')), true, `${id} marked invalid`);
    assert.equal(await page.locator(`#e-${id}`).isVisible(), true, `${id} error visible`);
  }
  assert.equal(await page.locator('#f-phone.invalid').count(), 0, 'empty phone is fine (optional)');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'name', 'focus moves to first problem');
  assert.equal(sent.length, 0);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Handy_Fehler.png') });
});

await test('bad email and bad phone are rejected; errors clear while typing', async (page) => {
  const sent = await mock(page, okReply);
  await page.goto(BASE);
  await fillValid(page);
  await page.fill('#email', 'anna@example');
  await page.fill('#phone', '12ab');
  await page.click('#submit');
  assert.equal(await page.locator('#f-email.invalid').count(), 1);
  assert.equal(await page.locator('#f-phone.invalid').count(), 1);
  await page.fill('#email', 'anna@example.com');
  await page.fill('#phone', '');
  assert.equal(await page.locator('.invalid').count(), 0, 'errors clear once fixed');
  assert.equal(sent.length, 0);
});

await test('valid form is sent to FormSubmit with the right data, then thanks the visitor', async (page) => {
  const sent = await mock(page, okReply);
  await page.goto(BASE);
  await fillValid(page);
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Handy_ausgefuellt.png'), fullPage: true });
  await page.click('#submit');
  await page.locator('#doneCard').waitFor({ state: 'visible' });
  assert.equal(sent.length, 1);
  const { url, body, headers } = sent[0];
  assert.equal(url, ENDPOINT);
  assert.equal(headers['content-type'], 'application/json');
  assert.equal(body.Name, 'Anna Schmidt');
  assert.equal(body.email, 'anna.schmidt@example.com', 'field named "email" = Reply-To in FormSubmit');
  assert.equal(body.Address, 'Musterstraße 12, 20095 Hamburg, Germany');
  assert.equal(body.Phone, '+49 40 123456');
  assert.equal(body.Request, 'Please send me an offer for 20 units.');
  assert.equal(body.Language, 'English');
  assert.match(body.Consent, /^Yes/);
  assert.equal(body._subject, 'New contact request: Anna Schmidt');
  assert.equal(body._template, 'table');
  assert.equal(body._honey, '');
  assert.equal(await page.locator('#doneTitle').textContent(), 'Thank you, Anna!');
  await page.waitForTimeout(1400); // let the animation finish for the screenshot
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Handy_gesendet.png') });
  await page.click('#again');
  assert.equal(await page.locator('#formCard').isVisible(), true);
  assert.equal(await page.inputValue('#name'), '', 'form is empty for the next visitor');
  assert.equal(await page.locator('#consent').isChecked(), false);
});

await test('before activation FormSubmit says "needs Activation": visitor still sees success', async (page) => {
  await mock(page, (route) => route.fulfill({ status: 200, contentType: 'application/json',
    body: JSON.stringify({ success: 'false', message: "This form needs Activation. We've sent you an email containing an 'Activate Form' button." }) }));
  await page.goto(BASE);
  await fillValid(page);
  await page.click('#submit');
  await page.locator('#doneCard').waitFor({ state: 'visible' });
});

await test('server error: message + e-mail fallback, data kept, button usable again', async (page, ctx2) => {
  await mock(page, (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"success":"false","message":"oops"}' }));
  await page.goto(BASE);
  await fillValid(page);
  await page.click('#submit');
  await page.locator('#alert.show').waitFor();
  const href = await page.locator('#mailFallback').getAttribute('href');
  assert.ok(href.startsWith(`mailto:${cfg.recipient}?subject=`), 'mailto fallback');
  assert.ok(decodeURIComponent(href).includes('Anna Schmidt'));
  assert.equal(await page.inputValue('#name'), 'Anna Schmidt', 'nothing lost');
  assert.equal(await page.locator('#submit').isDisabled(), false);
  ctx2.errors.length = 0; // the failed request is logged on purpose
});

await test('no connection: error message instead of hanging', async (page, ctx2) => {
  await mock(page, (route) => route.abort('internetdisconnected'));
  await page.goto(BASE);
  await fillValid(page);
  await page.click('#submit');
  await page.locator('#alert.show').waitFor();
  ctx2.errors.length = 0;
});

await test('honeypot filled (bot): nothing is sent', async (page) => {
  const sent = await mock(page, okReply);
  await page.goto(BASE);
  await fillValid(page);
  await page.evaluate(() => { document.querySelector('input[name=_honey]').value = 'spam'; });
  await page.click('#submit');
  await page.locator('#doneCard').waitFor({ state: 'visible' });
  assert.equal(sent.length, 0);
});

await test('DE switch translates the page and is kept on reload; German data label in e-mail', async (page) => {
  const sent = await mock(page, okReply);
  await page.goto(BASE);
  await page.click('.lang button[data-lang=de]');
  assert.equal(await page.locator('h1').textContent(), 'Kontaktformular');
  assert.equal(await page.getAttribute('#name', 'placeholder'), 'Vor- und Nachname');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'de');
  assert.ok(page.url().endsWith('?lang=de'));
  await page.reload();
  assert.equal(await page.locator('h1').textContent(), 'Kontaktformular');
  await page.click('#submit');
  assert.equal(await page.locator('#e-name span').textContent(), 'Bitte geben Sie Ihren Namen ein.');
  await fillValid(page);
  await page.click('#submit');
  await page.locator('#doneCard').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#doneTitle').textContent(), 'Vielen Dank, Anna!');
  assert.equal(sent[0].body.Language, 'German');
  await page.click('.lang button[data-lang=en]'); // reset for the next tests (stored choice)
});

await test('/de/ page (QR on the German print form) opens in German', async (page) => {
  await page.goto(BASE + 'de/');
  assert.equal(await page.locator('h1').textContent(), 'Kontaktformular');
  assert.equal(await page.locator('form').getAttribute('action'), `https://formsubmit.co/${cfg.recipient}`);
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Handy_DE.png') });
});

await test('?sent=1 (return from the no-JavaScript fallback) shows the thank-you card', async (page) => {
  await page.goto(BASE + '?sent=1');
  assert.equal(await page.locator('#doneCard').isVisible(), true);
  assert.equal(await page.locator('#doneTitle').textContent(), 'Thank you!');
});

await test('works without JavaScript as a plain form post (fallback)', async () => {
  const c2 = await browser.newContext({ javaScriptEnabled: false });
  const p2 = await c2.newPage();
  await p2.goto(BASE);
  assert.equal(await p2.locator('form').getAttribute('action'), `https://formsubmit.co/${cfg.recipient}`);
  assert.equal(await p2.locator('form').getAttribute('method'), 'POST');
  assert.equal(await p2.locator('input[name=_next]').getAttribute('value'), `${cfg.formUrl}?sent=1`);
  for (const n of ['Name', 'Street', 'Postcode', 'City', 'Country', 'Phone', 'email', 'Request', 'Consent']) {
    assert.equal(await p2.locator(`[name="${n}"]`).count(), 1, `field ${n}`);
  }
  await c2.close();
});

await test('desktop layout', async (page) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(BASE);
  await page.screenshot({ path: path.join(SHOTS, 'Online-Formular_Desktop.png'), fullPage: true });
});

await browser.close();
server.close();
console.log(results.join('\n'));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);

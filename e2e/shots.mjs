// Screenshots into docs/. Usage: node e2e/shots.mjs http://localhost:3400
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const U = (process.argv[2] || 'http://localhost:3400').replace(/\/$/, '');
fs.mkdirSync('docs', { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
async function page(w = 1280, h = 900) { const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h, deviceScaleFactor: 2 }); return p; }
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear());
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter');
  await p.waitForSelector('.top .nav', { timeout: 8000 }); await sleep(700);
}
const go = async (p, r) => { await p.evaluate((x) => (location.hash = '#/' + x), r); await sleep(700); };
const shot = async (p, name) => { await p.screenshot({ path: 'docs/' + name + '.png' }); console.log('shot', name); };
async function api(token, op) { const r = await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token }, body: JSON.stringify({ op }) }); return r.json(); }
const token = (await (await fetch(U + '/api/data', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: { type: 'login', pin: '1111' } }) })).json()).token;
await api(token, { type: 'reset' });
let p = await page(); await p.goto(U, { waitUntil: 'networkidle0' }); await sleep(400); await shot(p, '01-login');
await login(p, '1111'); await shot(p, '02-dashboard');
await go(p, 'packages'); await shot(p, '03-packages');
await p.click('[data-act="newpackage"]'); await sleep(500); await shot(p, '04-new-package'); await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'bookings'); await shot(p, '05-bookings');
await p.click('[data-act="newbooking"]'); await sleep(500); await shot(p, '06-new-booking'); await p.keyboard.press('Escape'); await sleep(300);
await go(p, 'documents'); await shot(p, '07-documents');
await go(p, 'clients'); await shot(p, '08-clients');
await go(p, 'payments'); await shot(p, '09-payments');
await go(p, 'reports'); await sleep(600); await shot(p, '10-reports');
await go(p, 'audit'); await shot(p, '11-audit');
let ag = await page(); await login(ag, '2222'); await shot(ag, '12-agent-dashboard');
let dc = await page(); await login(dc, '3333'); await go(dc, 'documents'); await shot(dc, '13-docs-queue');
let ac = await page(); await login(ac, '4444'); await go(ac, 'payments'); await shot(ac, '14-accountant-payments');
let ld = await page(); await login(ld, '5555'); await shot(ld, '15-leader-dashboard');
let a = await page(); await login(a, '1111', 'ar'); await shot(a, '16-arabic-dashboard');
await go(a, 'bookings'); await shot(a, '17-arabic-bookings');
let ph = await page(390, 844); await login(ph, '2222'); await shot(ph, '18-phone-dashboard');
await go(ph, 'packages'); await shot(ph, '19-phone-packages');
let lph = await page(390, 844); await login(lph, '5555'); await shot(lph, '20-phone-leader');
let aph = await page(390, 844); await login(aph, '1111', 'ar'); await shot(aph, '21-phone-arabic');
await api(token, { type: 'reset' });
await b.close(); console.log('done');

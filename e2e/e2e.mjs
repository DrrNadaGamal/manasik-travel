// Browser and API checks against a running Manasik (local dev server or the live URL).
// Usage: node e2e/e2e.mjs http://localhost:3400   (needs Chrome at /usr/bin/google-chrome)
import puppeteer from 'puppeteer-core';
import * as L from '../public/logic.js';
const U = (process.argv[2] || 'http://localhost:3400').replace(/\/$/, '');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else fail++; console.log(c ? 'PASS' : 'FAIL', m); };
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
const errs = [];
async function newPage(w = 1280, h = 900) {
  const p = await (await b.createBrowserContext()).newPage(); await p.setViewport({ width: w, height: h });
  p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => m.type() === 'error' && !/Failed to load resource/.test(m.text()) && errs.push(m.text()));
  p.on('dialog', (d) => d.accept());
  return p;
}
async function login(p, pin, lang = 'en') {
  await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.evaluate(() => localStorage.clear()); await p.goto(U + '/?lang=' + lang, { waitUntil: 'networkidle0' });
  await p.type('#pin', pin); await p.keyboard.press('Enter'); await p.waitForSelector('.top .nav', { timeout: 15000 }); await sleep(400);
}
const go = async (p, r) => { await p.evaluate((r) => (location.hash = '#/' + r), r); await sleep(450); };
const body = async (p) => { for (let i = 0; i < 4; i++) { try { return await p.evaluate(() => document.body.innerText); } catch { await sleep(600); } } return ''; };
const bare = /undefined|NaN|\[object/;
async function api(token, method, bodyObj, raw) {
  const r = await fetch(U + '/api/data', { method, headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: raw ?? (bodyObj ? JSON.stringify(bodyObj) : undefined) });
  let j = null; try { j = await r.json(); } catch {} return { status: r.status, j };
}
const tokenFor = async (pin) => (await api(null, 'POST', { op: { type: 'login', pin } })).j.token;
const T = { manager: await tokenFor('1111'), agent: await tokenFor('2222'), docs: await tokenFor('3333'), acc: await tokenFor('4444'), leader: await tokenFor('5555') };
const post = (role, op) => api(T[role], 'POST', { op });
const view = async (role) => (await api(T[role], 'GET')).j;
await post('manager', { type: 'reset' });
let n = 0; const key = () => 'e2e-' + Date.now().toString(36) + '-' + ++n;
const today = L.dayKey(Date.now());

// ---------- API security ----------
ok((await api(null, 'GET')).status === 401, 'no token: 401');
ok((await api('garbage', 'GET')).status === 401, 'garbage token: 401');
const tv = T.agent.split('.'); const forged = Buffer.from('u-mgr.' + (Date.now() + 1e7)).toString('base64url') + '.' + tv[1];
ok((await api(forged, 'GET')).status === 401, 'forged token for another user: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: '9999' } })).status === 401, 'wrong PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: ['1111'] } })).status === 401, 'array PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: 1111 } })).status === 401, 'numeric PIN: 401');
ok((await api(null, 'POST', { op: { type: 'login', pin: { $ne: 1 } } })).status === 401, 'object PIN: 401');
ok((await api(T.manager, 'POST', null, '{not json')).status === 400, 'malformed JSON: 400');
ok((await post('manager', { type: 'nope' })).status === 400, 'unknown action: 400');
ok((await post('manager', { type: 'constructor' })).status === 400, 'prototype name as action: 400');
ok((await post('manager', { type: '__proto__' })).status === 400, '__proto__ as action: 400');
ok((await post('manager', { type: 'toString' })).status === 400, 'toString as action: 400');
ok((await post('manager', { type: 'addClient', name: 'x'.repeat(70000) })).status === 413, 'oversized body: 413');
ok((await api(T.manager, 'DELETE')).status === 405, 'DELETE: 405');
ok((await api(T.manager, 'PUT', { op: { type: 'reset' } })).status === 405, 'PUT: 405');
ok((await api(T.manager, 'PATCH', { op: { type: 'reset' } })).status === 405, 'PATCH: 405');
ok((await post('agent', { type: 'reset' })).status === 403, 'agent cannot reset: 403');
ok((await post('docs', { type: 'reset' })).status === 403, 'docs cannot reset: 403');
ok((await post('acc', { type: 'reset' })).status === 403, 'accountant cannot reset: 403');
ok((await post('leader', { type: 'reset' })).status === 403, 'leader cannot reset: 403');
ok((await api(null, 'POST', { op: { type: 'reset' } })).status === 401, 'reset without token: 401');

// ---------- permission lanes (API) ----------
const v0 = await view('manager');
const p3 = v0.packages.find((p) => p.id === 'p3');
const c1 = v0.clients[0];
const bookOp = () => ({ type: 'addBooking', packageId: 'p3', clientId: c1.id, roomType: 'quad', persons: 1, key: key() });
ok((await post('docs', bookOp())).status === 403, 'docs cannot add bookings: 403');
ok((await post('acc', bookOp())).status === 403, 'accountant cannot add bookings: 403');
ok((await post('leader', bookOp())).status === 403, 'leader cannot add bookings: 403');
ok((await post('agent', { type: 'addPackage', name: 'Lane pkg', kind: 'umrah', depart: L.addDays(today, 60), return: L.addDays(today, 70), makkah: 'Hotel A', transport: 'air', capacity: 40, prices: { quad: 30000, triple: 36000, double: 45000 }, key: key() })).status === 403, 'agent cannot add packages: 403');
ok((await post('leader', { type: 'addClient', name: 'Lane Person', key: key() })).status === 403, 'leader cannot add clients: 403');
ok((await post('docs', { type: 'addPayment', bookingId: 'b12', amount: 100, method: 'cash', key: key() })).status === 403, 'docs cannot add payments: 403');
ok((await post('leader', { type: 'addPayment', bookingId: 'b12', amount: 100, method: 'cash', key: key() })).status === 403, 'leader cannot add payments: 403');
ok((await post('acc', { type: 'updateDocument', documentId: 'd1', status: 'received' })).status === 403, 'accountant cannot move documents: 403');
ok((await post('agent', { type: 'cancelBooking', bookingId: 'b12' })).status === 403, 'agent cannot cancel bookings: 403');
ok((await post('agent', { type: 'setTraveling', packageId: 'p3' })).status === 403, 'agent cannot mark departure: 403');
ok((await post('leader', { type: 'updateClient', clientId: c1.id, name: 'Lane Person Two' })).status === 403, 'leader cannot edit clients: 403');

// ---------- views: money stays with money roles ----------
for (const role of ['docs', 'leader']) {
  const v = await view(role);
  const j = JSON.stringify(v);
  ok(!j.includes('"rate"'), role + ': no rates in view');
  ok(!j.includes('"amount"'), role + ': no amounts in view');
  ok(v.payments.length === 0, role + ': no payments in view');
  ok((v.reports.totals.outstanding || 0) === 0 && (v.reports.totals.collectedThisMonth || 0) === 0, role + ': money totals zeroed');
}
const vl = await view('leader');
ok(vl.documents.length === 0 && vl.clients.length === 0, 'leader: manifest only, no documents or clients');
ok(vl.bookings.length > 0 && vl.bookings.every((x) => x.clientName), 'leader: sees pilgrim manifest');
ok(vl.insights.every((i) => i.kind === 'departure_soon'), 'leader: only departure insights');
const vd = await view('docs');
ok(vd.documents.length > 0, 'docs: sees the document queue');
ok(vd.reports.byMonth.every((m) => m.booked === 0 && m.collected === 0), 'docs: report money zeroed');
const va = await view('agent');
ok(JSON.stringify(va.bookings).includes('"rate"'), 'agent: sees rates');
ok(va.audit.length === 0, 'agent: no audit log');
ok((await view('manager')).audit.length > 0, 'manager: sees audit log');

// ---------- booking lifecycle over the API ----------
const nb = (await post('agent', bookOp())).j.result;
ok(nb && nb.code && nb.amount === p3.prices.quad, 'agent books a pilgrim: rate applied');
ok((await post('agent', bookOp())).j.result.code !== nb.code, 'second booking gets a new code');
const cap = await post('manager', { type: 'addBooking', packageId: 'p6', clientId: c1.id, roomType: 'quad', persons: 2, key: key() });
ok(cap.status === 400, 'capacity guard refuses overbooking: 400');
ok((await post('manager', { type: 'addBooking', packageId: 'p6', clientId: c1.id, roomType: 'quad', persons: 1, key: key() })).status === 200, 'last seat books fine');
ok((await post('manager', { type: 'addBooking', packageId: 'p6', clientId: v0.clients[1].id, roomType: 'quad', persons: 1, key: key() })).status === 400, 'full package refuses one more');
ok((await post('manager', { type: 'confirmBooking', bookingId: nb.bookingId })).status === 400, 'confirm refused before 20% paid');
await post('acc', { type: 'addPayment', bookingId: nb.bookingId, amount: Math.floor(nb.amount * 0.19), method: 'cash', key: key() });
ok((await post('manager', { type: 'confirmBooking', bookingId: nb.bookingId })).status === 400, 'confirm refused at 19% paid');
await post('acc', { type: 'addPayment', bookingId: nb.bookingId, amount: Math.ceil(nb.amount * 0.2) - Math.floor(nb.amount * 0.19), method: 'card', key: key() });
ok((await post('agent', { type: 'confirmBooking', bookingId: nb.bookingId })).status === 200, 'confirm passes at 20% paid');
ok((await post('acc', { type: 'addPayment', bookingId: nb.bookingId, amount: nb.amount, method: 'cash', key: key() })).status === 400, 'payment above balance refused');
ok((await post('acc', { type: 'addPayment', bookingId: nb.bookingId, amount: 100, method: 'cheque', key: key() })).status === 400, 'unknown method refused');
ok((await post('acc', { type: 'addPayment', bookingId: nb.bookingId, amount: 100, method: 'cash', date: L.addDays(today, 1), key: key() })).status === 400, 'future payment refused');
const docs1 = (await view('manager')).documents.filter((d) => d.bookingId === nb.bookingId);
ok(docs1.length === 4 && docs1.every((d) => d.status === 'missing'), 'new booking starts with 4 missing documents');
ok((await post('docs', { type: 'updateDocument', documentId: docs1[0].id, status: 'submitted' })).status === 200, 'docs moves a document forward');
ok((await post('docs', { type: 'updateDocument', documentId: docs1[0].id, status: 'missing' })).status === 400, 'documents never move backward');
ok((await post('manager', { type: 'cancelBooking', bookingId: nb.bookingId })).status === 200, 'manager cancels the booking');
ok((await post('docs', { type: 'updateDocument', documentId: docs1[1].id, status: 'received' })).status === 400, 'cancelled booking documents are frozen');
ok((await view('manager')).insights.some((i) => i.kind === 'refund_owed' && i.code === nb.code), 'cancelled paid booking raises refund_owed');
ok((await post('manager', { type: 'completeBooking', bookingId: 'b22' })).status === 400, 'cancelled booking cannot complete');
const idem = bookOp(); idem.key = 'e2e-idem-fixed-key';
const i1 = await post('agent', idem); const i2 = await post('agent', idem);
ok(i1.status === 200 && i2.status === 200 && i2.j.result.duplicate === true, 'idempotency key replays as duplicate');
ok((await post('agent', { ...bookOp(), key: 'abc' })).status === 400, 'short idempotency key: 400');

// ---------- browser: login and role lanes ----------
const p = await newPage();
await p.goto(U + '/', { waitUntil: 'networkidle0' });
ok((await body(p)).includes('1111'), 'sign-in lists demo roles with PINs');
ok((await p.$('#pin')) !== null, 'PIN input present');
await login(p, '1111');
let tx = await body(p);
ok(/Manager|مدير/.test(tx), 'manager lands on dashboard');
ok(!bare.test(tx), 'dashboard: no undefined/NaN');
await go(p, 'packages'); tx = await body(p);
ok(tx.includes('Shawwal') || tx.includes('شوال') || tx.toLowerCase().includes('umrah') || tx.includes('عمرة'), 'packages page lists packages');
ok(/%/.test(tx), 'packages show occupancy');
await go(p, 'bookings'); tx = await body(p);
ok(tx.includes('MN-'), 'bookings show booking codes');
ok(!bare.test(tx), 'bookings: no undefined/NaN');
await go(p, 'reports'); tx = await body(p);
ok(/Reports|التقارير/.test(tx), 'manager opens reports');
await go(p, 'audit'); tx = await body(p);
ok(/addBooking|addClient|reset/.test(tx), 'audit log records actions');

// manager books a pilgrim through the UI
await go(p, 'bookings');
await p.evaluate(() => [...document.querySelectorAll('[data-act]')].find((x) => x.dataset.act === 'newbooking').click());
await sleep(400);
ok((await p.$('.modal')) !== null, 'booking modal opens');
await p.select('#m-room', 'double');
await p.evaluate(() => document.querySelector('.modal [data-form] .btn.pri').click());
await sleep(700);
tx = await body(p);
ok(!bare.test(tx), 'booking saved without artifacts');

// agent lane
const pa = await newPage(); await login(pa, '2222');
tx = await body(pa);
ok(!/Audit|التدقيق/.test(await pa.evaluate(() => document.querySelector('.nav').innerText)), 'agent nav has no audit');
ok(/EGP|ج/.test(tx), 'agent sees money on dashboard');

// docs lane
const pd = await newPage(); await login(pd, '3333');
await go(pd, 'documents'); tx = await body(pd);
ok(/Passport|Visa|جواز|تأشيرة/.test(tx), 'docs sees the document queue');
ok(!/EGP|ج\.م/.test(tx.replace(/جميع/g, '')), 'docs sees no money');
await go(pd, 'payments'); await sleep(300);
ok((await pd.evaluate(() => location.hash)).includes('documents') || (await pd.evaluate(() => location.hash)).includes('dashboard'), 'docs is redirected away from payments');

// accountant lane
const pc = await newPage(); await login(pc, '4444');
tx = await pc.evaluate(() => document.querySelector('.nav').innerText);
ok(!/Packages|الباقات/.test(tx), 'accountant nav has no packages');
await go(pc, 'payments'); tx = await body(pc);
ok(/Cash|Card|Transfer|نقد|بطاقة|تحويل/.test(tx), 'accountant sees payment methods');
// add a payment through the UI (needs method select)
await pc.evaluate(() => [...document.querySelectorAll('[data-act]')].find((x) => x.dataset.act === 'pay').click());
await sleep(400);
ok((await pc.$('#m-method')) !== null, 'payment modal has a method select');
await pc.select('#m-method', 'transfer');
await pc.evaluate(() => document.querySelector('.modal [data-form] .btn.pri').click());
await sleep(700);
ok(!bare.test(await body(pc)), 'payment saved without artifacts');

// leader lane
const pl = await newPage(); await login(pl, '5555');
tx = await body(pl);
ok(!/EGP|ج\.م/.test(tx), 'leader dashboard has no money');
await go(pl, 'bookings'); tx = await body(pl);
ok(tx.includes('MN-'), 'leader sees the manifest');
ok(!/EGP|ج\.م/.test(tx), 'leader manifest has no money');
await go(pl, 'documents'); await sleep(300);
ok(!(await pl.evaluate(() => location.hash)).includes('documents'), 'leader is redirected away from documents');

// XSS hygiene
await post('manager', { type: 'addClient', name: '<img src=x onerror=alert(1)> Hacker', phone: '0100', key: key() });
const px = await newPage(); await login(px, '1111'); await go(px, 'clients');
const xtx = await px.evaluate(() => document.body.innerHTML);
ok(!xtx.includes('<img src=x onerror'), 'client name is escaped in the DOM');

// Arabic RTL
const pr = await newPage(); await login(pr, '1111', 'ar');
ok((await pr.evaluate(() => document.documentElement.dir)) === 'rtl', 'arabic renders RTL');
ok((await body(pr)).includes('الباقات'), 'arabic nav translated');
await go(pr, 'bookings');
ok(!bare.test(await body(pr)), 'arabic bookings: no undefined/NaN');

// mobile width
const pm = await newPage(390, 844); await login(pm, '1111');
ok((await pm.evaluate(() => document.documentElement.scrollWidth)) <= 390 + 2, 'no horizontal scroll at 390px');
await go(pm, 'reports');
ok((await pm.evaluate(() => document.documentElement.scrollWidth)) <= 390 + 2, 'reports fit 390px');

ok(errs.length === 0, 'zero page errors' + (errs.length ? ': ' + errs.slice(0, 3).join(' | ') : ''));

await post('manager', { type: 'reset' });
console.log(`\n${pass} passed, ${fail} failed`);
await b.close();
process.exit(fail ? 1 : 0);

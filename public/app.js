// Manasik single-page app. Every action goes to /api/data; the server is the authority.
import * as L from './logic.js';
import { STR, SRV } from './i18n.js';

const LS = { get: (k, d) => { try { const v = localStorage.getItem('mn-' + k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => localStorage.setItem('mn-' + k, JSON.stringify(v)), del: (k) => localStorage.removeItem('mn-' + k) };
const S = { lang: new URLSearchParams(location.search).get('lang') || LS.get('lang', 'en'), token: LS.get('token', null), me: LS.get('me', null), data: null, busy: false, modal: null, filter: 'open' };
const ar = () => S.lang === 'ar';
const t = (k) => (STR[S.lang] && STR[S.lang][k]) ?? STR.en[k] ?? k;
const srvErr = (m) => { const map = SRV[S.lang]; if (map && m) for (const [re, ar2] of map) { const x = m.match(re); if (x) return ar2.replace('$1', x[1] || ''); } return m || ''; };
const nf = (n, d = 0) => Number(n).toLocaleString(ar() ? 'ar-EG' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const egp = (n) => `${nf(n)} ${t('cur')}`;
const dF = (k) => k ? new Date(k + 'T12:00:00Z').toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }) : '';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (id) => document.querySelector(id);
const D = () => S.data;
const role = () => S.me?.role;
const nm = (o) => (ar() && o?.nameAr ? o.nameAr : o?.name) || '';

const NAV = {
  manager: ['dashboard', 'packages', 'bookings', 'documents', 'clients', 'payments', 'reports', 'audit'],
  agent: ['dashboard', 'packages', 'bookings', 'documents', 'clients', 'payments'],
  docs: ['dashboard', 'packages', 'bookings', 'documents', 'clients'],
  accountant: ['dashboard', 'bookings', 'payments', 'reports'],
  leader: ['dashboard', 'packages', 'bookings'],
};
const route = () => {
  const r = (location.hash.replace(/^#\//, '') || '').split('?')[0];
  if (!S.token || !S.me) return 'login';
  const allowed = NAV[role()] || [];
  return allowed.includes(r) ? r : allowed[0];
};
const isMoney = () => ['manager', 'agent', 'accountant'].includes(role());
const canBook = () => ['manager', 'agent'].includes(role());
const canDocs = () => ['manager', 'docs'].includes(role());
const canPay = () => ['manager', 'accountant'].includes(role());

// ---------- api ----------
async function api(method, op) {
  let r;
  try { r = await fetch('/api/data', { method, headers: { 'content-type': 'application/json', ...(S.token ? { authorization: 'Bearer ' + S.token } : {}) }, body: op ? JSON.stringify({ op }) : undefined }); }
  catch { throw new Error('Network error'); }
  const j = await r.json().catch(() => null);
  if (r.status === 401 && !(op && op.type === 'login')) { logout(false); throw new Error(srvErr('Sign in again')); }
  if (!r.ok) { const e = new Error(srvErr(j?.error) || 'Server error'); e.status = r.status; throw e; }
  return j;
}
async function refresh() { S.data = await api('GET'); }
async function doOp(op, msg) {
  if (S.busy) return null;
  S.busy = true;
  try { const j = await api('POST', op); S.data = j; if (msg) toast(msg); return j.result || {}; }
  catch (e) { toast(e.message, true); return null; } finally { S.busy = false; }
}
function toast(msg, bad) {
  const el = $('#toast'); el.innerHTML = `<div class="${bad ? 'err' : ''}">${esc(msg)}</div>`;
  clearTimeout(toast._t); toast._t = setTimeout(() => (el.innerHTML = ''), 4500);
}
function logout(reload = true) {
  LS.del('token'); LS.del('me'); S.token = null; S.me = null; S.data = null; S.modal = null;
  if (reload) { location.hash = '#/'; render(); }
}

// ---------- small views ----------
const pill = (txt, cls = '') => `<span class="pill ${cls}">${esc(txt)}</span>`;
const sel = (id, list, cur, extra = '') => `<select id="${id}" ${extra}>${list.map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(cur) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
const field = (id, label, inner) => `<div class="f"><label for="${id}">${esc(label)}</label>${inner}</div>`;
const inp = (id, label, v = '', attrs = '') => field(id, label, `<input id="${id}" value="${esc(v)}" ${attrs}>`);
const val = (id) => $(id)?.value?.trim() ?? '';
const num = (id) => (val(id) === '' ? NaN : Number(val(id)));
const tbl = (head, rows, empty) => `<div class="tw"><table><thead><tr>${head.map((h) => `<th${h[1] ? ' class="num"' : ''}>${esc(Array.isArray(h) ? h[0] : h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}" class="empty">${esc(empty || t('noRows'))}</td></tr>`}</tbody></table></div>`;
const modalBg = (inner, wide) => `<div class="modal-bg" data-act="bg"><div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true">${inner}</div></div>`;
const mhead = (title) => `<div class="mhead"><h3>${esc(title)}</h3><button class="btn sm ghost2" data-act="bg" aria-label="Close">✕</button></div>`;

const LOGO = `<svg viewBox="0 0 48 48" aria-hidden="true"><rect width="48" height="48" rx="12" fill="rgba(255,255,255,.12)"/><path d="M14 34h20M24 12c6 4 9 8 9 13a9 9 0 1 1-18 0c0-5 3-9 9-13z" stroke="#a8842c" stroke-width="3" fill="none" stroke-linecap="round"/><circle cx="24" cy="10" r="2.4" fill="#a8842c"/></svg>`;
function shell(inner) {
  const tt = D().reports.totals;
  const nav = NAV[role()].map((r) => `<a href="#/${r}" class="${route() === r ? 'on' : ''}">${esc(t('nav.' + r))}${r === 'documents' && tt.docsPending ? ` <b class="dot">${tt.docsPending}</b>` : ''}</a>`).join('');
  return `<div class="top"><a class="brand" href="#/${NAV[role()][0]}">${LOGO}<span>Manasik<small>${esc(t('app.tag'))}</small></span></a>
    <nav class="nav">${nav}</nav><div class="tools"><span class="pill">${esc(t('role.' + role()))} · ${esc(nm(S.me))}</span>
    <button class="btn ghost sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button><button class="btn ghost sm" data-act="logout">${esc(t('signin.out'))}</button></div></div><main>${inner}</main>${modalHtml()}`;
}
function loginPage() {
  return `<main class="login"><div class="card login-card"><div class="brand big">${LOGO}<span>Manasik<small>${esc(t('app.tag'))}</small></span></div>
    <h1>${esc(t('signin.title'))}</h1><p class="muted">${esc(t('signin.pick'))}</p>
    <div class="demo-users">${L.DEMO_USERS.map((u) => `<button class="btn" data-act="pin" data-pin="${u.pin}"><span>${esc(ar() ? u.labelAr : u.label)}</span><b>${u.pin}</b></button>`).join('')}</div>
    <div class="f"><label for="pin">${esc(t('signin.pin'))}</label><input id="pin" class="big" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="••••"></div>
    <button class="btn pri big" data-act="login" style="width:100%">${esc(t('signin.go'))}</button>
    <div class="row" style="margin-top:.4rem"><button class="btn sm" data-act="lang">${ar() ? 'English' : 'العربية'}</button></div></div></main>`;
}

// ---------- insights ----------
function insightText(i) {
  if (i.kind === 'departure_soon' || i.kind === 'visa_deadline') return esc(i.name) + ': ' + t('ins.' + i.kind).replace('{n}', nf(i.days));
  if (i.kind === 'almost_full') return esc(i.name) + ': ' + t('ins.almost_full').replace('{n}', nf(i.free));
  if (i.kind === 'docs_missing') return esc(i.code) + ': ' + t('ins.docs_missing').replace('{n}', nf(i.n)).replace('{d}', nf(i.days));
  if (i.kind === 'balance_near_departure') return esc(i.code) + ': ' + t('ins.balance_near_departure').replace('{a}', egp(i.amount)).replace('{d}', nf(i.days));
  if (i.kind === 'refund_owed') return esc(i.code) + ': ' + t('ins.refund_owed').replace('{a}', egp(i.amount));
  return i.kind;
}
const INS_PILL = {
  departure_soon: ['pk.depart', 'ice'], almost_full: ['nav.packages', 'off'], visa_deadline: ['dk.visa', 'bad'],
  docs_missing: ['nav.documents', 'bad'], balance_near_departure: ['nav.payments', 'off'], refund_owed: ['nav.payments', 'bad'],
};
const insPill = (k) => { const [label, cls] = INS_PILL[k] || ['nav.dashboard', '']; return pill(t(label), cls); };

// ---------- dashboard ----------
const kpi = (n, l, s = '', cls = '') => `<div class="card kpi ${cls}"><div class="n">${esc(n)}</div><div class="l">${esc(l)}</div>${s ? `<div class="s">${esc(s)}</div>` : ''}</div>`;
function pgDashboard() {
  const d = D(), tt = d.reports.totals;
  const upcoming = d.packages.filter((p) => p.status === 'open' && p.depart >= d.today).slice(0, 6);
  const kpis = [`${kpi(nf(tt.openPackages), t('k.openPackages'))}${kpi(nf(tt.departingThisWeek), t('k.departing'), '', tt.departingThisWeek ? 'warn' : '')}${kpi(nf(tt.activeBookings), t('k.activeBookings'))}${kpi(nf(tt.pilgrimsTraveling), t('k.traveling'))}`];
  if (tt.docsPending !== undefined && role() !== 'accountant') kpis.push(kpi(nf(tt.docsPending), t('k.docsPending'), '', tt.docsPending ? 'warn' : ''));
  if (isMoney()) kpis.push(kpi(egp(tt.bookedThisMonth), t('k.booked')) + kpi(egp(tt.collectedThisMonth), t('k.collected')) + kpi(egp(tt.outstanding), t('k.outstanding'), '', tt.outstanding ? 'warn' : ''));
  return `<div class="bar"><h1>${esc(t('nav.dashboard'))}</h1></div>
  <div class="grid kpis">${kpis.join('')}</div>
  <div class="grid two" style="margin-top:1rem">
  <section class="card"><h2>${esc(t('dash.upcoming'))}</h2>${upcoming.map((p) => `<div class="mrow"><div><b>${esc(dF(p.depart))}</b> <span class="small muted">${esc(p.name)} · ${esc(t('tr.' + p.transport))}</span></div><span class="small">${nf(p.taken)}/${nf(p.capacity)}</span></div>`).join('') || `<p class="empty">${esc(t('noRows'))}</p>`}</section>
  <section class="card"><h2>${esc(t('insights'))}</h2>${d.insights.length ? d.insights.map((i) => `<div class="att-row"><span>${insPill(i.kind)} ${esc(insightText(i))}</span></div>`).join('') : `<p class="empty">${esc(t('none'))}</p>`}</section></div>`;
}

// ---------- packages ----------
function pgPackages() {
  const d = D();
  const list = d.packages.filter((p) => S.filter === 'all' ? true : S.filter === 'done' ? (p.status === 'closed' || p.depart < d.today) : (p.status === 'open' && p.depart >= d.today));
  const money = isMoney();
  return `<div class="bar"><h1>${esc(t('nav.packages'))}</h1><span class="sp"></span>
    ${['open', 'done', 'all'].map((f) => `<button class="btn sm ${S.filter === f ? '' : 'ghost2'}" data-act="filter" data-f="${f}">${esc(t('f.' + f))}</button>`).join('')}
    ${role() === 'manager' ? `<button class="btn pri" data-act="newpackage">${esc(t('b.newPackage'))}</button>` : ''}</div>
  <section class="card">${tbl([[t('f.name')], [t('pk.depart')], [t('f.kind')], [t('pk.occupancy'), 1]].concat(money ? [[t('pk.prices')]] : []).concat([['']]),
    list.map((p) => `<tr><td><b>${esc(p.name)}</b><div class="small muted">${esc(p.makkah)}${p.madinah ? ' · ' + esc(p.madinah) : ''}</div></td>
    <td><b>${esc(dF(p.depart))}</b><div class="small muted">${esc(t('pk.return'))} ${esc(dF(p.return))} · ${esc(t('tr.' + p.transport))}</div></td>
    <td>${pill(t('pkg.' + p.kind), 'ice')} ${pill(t('pkg.' + (p.status === 'open' && p.depart >= d.today ? 'open' : 'closed')), p.status === 'open' && p.depart >= d.today ? 'ok' : '')}</td>
    <td class="num"><b>${nf(p.occupancy)}%</b><div class="small muted">${nf(p.taken)}/${nf(p.capacity)}</div></td>
    ${money ? `<td class="small">${nf(p.prices.quad)} / ${nf(p.prices.triple)} / ${nf(p.prices.double)}</td>` : ''}
    <td><div class="row">${p.status === 'open' && p.depart >= d.today && canBook() ? `<button class="btn sm" data-act="newbooking" data-id="${p.id}">${esc(t('b.newBooking'))}</button>` : ''}
    ${role() === 'manager' ? `<button class="btn sm ghost2" data-act="editpackage" data-id="${p.id}">${esc(t('b.edit'))}</button>` : ''}
    ${role() === 'manager' && p.status === 'open' && p.depart <= d.today ? `<button class="btn sm" data-act="travel" data-id="${p.id}">${esc(t('b.travel'))}</button>` : ''}</div></td></tr>`))}</section>`;
}

// ---------- bookings ----------
function pgBookings() {
  const d = D();
  const money = isMoney();
  const list = d.bookings.filter((b) => S.filter === 'all' ? true : S.filter === 'done' ? ['completed', 'cancelled'].includes(b.status) : !['completed', 'cancelled'].includes(b.status));
  return `<div class="bar"><h1>${esc(t('nav.bookings'))}</h1><span class="sp"></span>
    ${['open', 'done', 'all'].map((f) => `<button class="btn sm ${S.filter === f ? '' : 'ghost2'}" data-act="filter" data-f="${f}">${esc(t('f.' + f))}</button>`).join('')}
    ${canBook() ? `<button class="btn pri" data-act="newbooking">${esc(t('b.newBooking'))}</button>` : ''}</div>
  <section class="card">${tbl([[t('bk.code')], [t('bk.client')], [t('bk.package')], [t('bk.stage')], [t('bk.docs'), 1]].concat(money ? [[t('bk.balance'), 1]] : []).concat([['']]),
    list.map((b) => `<tr><td><b>${esc(b.code)}</b><div class="small muted">${esc(dF(b.depart))}</div></td>
    <td>${esc(b.clientName)}<div class="small muted">${nf(b.persons)} ${esc(t('bk.persons'))} · ${esc(t('rt.' + b.roomType))}</div></td>
    <td class="small">${esc(b.packageName)}</td>
    <td>${pill(t('bs.' + b.status), b.status === 'cancelled' ? 'bad' : b.status === 'completed' ? 'ok' : b.status === 'traveling' ? 'ice' : '')}</td>
    <td class="num">${b.docsApproved < b.docsTotal ? `<b class="neg">${nf(b.docsApproved)}/${nf(b.docsTotal)}</b>` : `${nf(b.docsTotal)}/${nf(b.docsTotal)}`}</td>
    ${money ? `<td class="num ${b.balance > 0 && b.status !== 'cancelled' ? 'neg' : ''}">${b.status === 'cancelled' ? '—' : egp(b.balance)}</td>` : ''}
    <td><div class="row">${b.status === 'reserved' && canBook() ? `<button class="btn sm" data-act="confirm" data-id="${b.id}">${esc(t('b.confirm'))}</button>` : ''}
    ${!['cancelled', 'completed'].includes(b.status) && canPay() && money && b.balance > 0 ? `<button class="btn sm" data-act="pay" data-id="${b.id}">${esc(t('b.pay'))}</button>` : ''}
    ${b.status === 'traveling' && role() === 'manager' ? `<button class="btn sm" data-act="complete" data-id="${b.id}">${esc(t('b.complete'))}</button>` : ''}
    ${!['cancelled', 'completed'].includes(b.status) && role() === 'manager' ? `<button class="btn sm danger" data-act="cancel" data-id="${b.id}">${esc(t('b.cancel'))}</button>` : ''}</div></td></tr>`))}</section>`;
}

// ---------- documents ----------
function pgDocuments() {
  const d = D();
  const rows = d.documents.filter((x) => x.status !== 'approved').concat(d.documents.filter((x) => x.status === 'approved').slice(0, 30));
  return `<div class="bar"><h1>${esc(t('nav.documents'))}</h1></div>
  <section class="card">${tbl([[t('dc.booking')], [t('dc.client')], [t('dc.package')], [t('dc.kind')], [t('dc.stage')], ['']],
    rows.map((x) => `<tr><td><b>${esc(x.code)}</b></td><td>${esc(x.clientName)}</td><td class="small">${esc(x.packageName)}<div class="small muted">${esc(dF(x.depart))}</div></td>
    <td>${pill(t('dk.' + x.kind), 'ice')}</td><td>${pill(t('ds.' + x.status), x.status === 'approved' ? 'ok' : x.status === 'missing' ? 'bad' : 'off')}</td>
    <td>${canDocs() && x.status !== 'approved' ? `<button class="btn sm" data-act="docfwd" data-id="${x.id}">${esc(t('b.advance'))}: ${esc(t('ds.' + L.DOC_STAGES[L.DOC_STAGES.indexOf(x.status) + 1]))}</button>` : ''}</td></tr>`))}</section>`;
}

// ---------- clients ----------
function pgClients() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.clients'))}</h1><span class="sp"></span>${canBook() ? `<button class="btn pri" data-act="newclient">${esc(t('b.newClient'))}</button>` : ''}</div>
  <section class="card">${tbl([[t('f.name')], [t('f.phone')], [t('f.passport')], [t('cl.bookings'), 1], ['']],
    d.clients.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td class="small">${esc(c.phone || '—')}</td><td class="small">${esc(c.passportNo || '—')}</td>
    <td class="num">${nf(c.bookings)}</td>
    <td>${canBook() ? `<button class="btn sm ghost2" data-act="editclient" data-id="${c.id}">${esc(t('b.edit'))}</button>` : ''}</td></tr>`))}</section>`;
}

// ---------- payments ----------
function pgPayments() {
  const d = D(), tt = d.reports.totals;
  return `<div class="bar"><h1>${esc(t('nav.payments'))}</h1><span class="sp"></span>${canPay() ? `<button class="btn pri" data-act="pay">${esc(t('b.pay'))}</button>` : ''}</div>
  ${isMoney() ? `<div class="grid kpis">${kpi(egp(tt.outstanding), t('k.outstanding'))}${kpi(egp(tt.collectedThisMonth), t('k.collected'))}</div>` : ''}
  <section class="card" style="margin-top:1rem"><h2>${esc(t('py.recent'))}</h2><p class="muted small">${esc(t('py.hint'))}</p>${tbl([[t('f.date')], [t('py.booking')], [t('f.method')], [t('f.amount'), 1]],
    (d.payments || []).slice(0, 120).map((p) => { const b = d.bookings.find((x) => x.id === p.bookingId) || {}; return `<tr><td class="small">${esc(dF(p.date))}</td><td><b>${esc(b.code || '')}</b><div class="small muted">${esc(b.clientName || '')}</div></td><td>${pill(t('pm.' + p.method))}</td><td class="num">${egp(p.amount)}</td></tr>`; }))}</section>`;
}

// ---------- reports ----------
function pgReports() {
  const d = D();
  const bm = d.reports.byMonth;
  const max = Math.max(1, ...bm.map((m) => m.collected));
  return `<div class="bar"><h1>${esc(t('nav.reports'))}</h1></div>
  <div class="grid two">
  <section class="card"><h2>${esc(t('rep.monthly'))}</h2>
    ${bm.map((m) => `<div class="att-row"><span class="small" style="min-width:8ch">${esc(m.month)}</span><span class="meter"><i style="width:${Math.round(m.collected / max * 100)}%"></i></span><b class="num small">${nf(m.collected)}</b></div>`).join('')}
    ${tbl([[t('rep.month')], [t('rep.bookings'), 1], [t('rep.persons'), 1], [t('rep.booked'), 1], [t('rep.collected'), 1]], bm.map((m) => `<tr><td>${esc(m.month)}</td><td class="num">${nf(m.bookings)}</td><td class="num">${nf(m.persons)}</td><td class="num">${nf(m.booked)}</td><td class="num">${nf(m.collected)}</td></tr>`))}</section>
  <section class="card"><h2>${esc(t('rep.perPackage'))}</h2>
    ${d.reports.perPackage.map((p) => `<div class="att-row"><span class="small" style="min-width:14ch">${esc(p.name)}</span><span class="meter"><i style="width:${p.occupancy}%"></i></span><b class="num small">${nf(p.taken)}/${nf(p.capacity)}</b></div>`).join('') || `<p class="empty">${esc(t('noRows'))}</p>`}
    <h2 style="margin-top:1.2rem">${esc(t('k.outstanding'))}</h2>
    <div class="grid kpis">${kpi(egp(d.reports.totals.outstanding), t('k.outstanding'))}${kpi(egp(d.reports.totals.bookedThisMonth), t('k.booked'))}</div></section></div>`;
}

// ---------- audit ----------
const tsF = (ts) => ts ? new Date(ts).toLocaleDateString(ar() ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short' }) : '';
function pgAudit() {
  const d = D();
  return `<div class="bar"><h1>${esc(t('nav.audit'))}</h1></div>
  <section class="card">${tbl([[t('audit.when')], [t('audit.who')], [t('audit.what')]], d.audit.map((a) => `<tr><td class="small muted">${esc(tsF(a.ts))} ${esc(new Date(a.ts).toTimeString().slice(0, 5))}</td><td class="small">${esc(a.name)}</td><td class="small">${esc(a.action)} · ${esc(a.detail)}</td></tr>`))}</section>`;
}

// ---------- modals ----------
function packageModal(p) {
  const isNew = !p;
  return modalBg(`<form data-form="package">${mhead(t(isNew ? 'b.newPackage' : 'b.edit'))}<div class="frow">
    ${inp('m-name', t('f.name'), p?.name)}
    ${field('m-kind', t('f.kind'), sel('m-kind', L.PKG_KINDS.map((k) => [k, t('pkg.' + k)]), p?.kind || 'umrah'))}
    ${inp('m-depart', t('pk.depart'), p?.depart, 'type="date"')}
    ${inp('m-return', t('pk.return'), p?.return, 'type="date"')}
    ${inp('m-visa', t('pk.visa'), p?.visaDeadline, 'type="date"')}
    ${inp('m-makkah', t('pk.makkah'), p?.makkah)}
    ${inp('m-madinah', t('pk.madinah'), p?.madinah)}
    ${field('m-transport', t('f.transport'), sel('m-transport', ['air', 'bus'].map((k) => [k, t('tr.' + k)]), p?.transport || 'air'))}
    ${inp('m-cap', t('f.capacity'), p?.capacity ?? 45, 'type="number" min="1" max="500"')}
    ${inp('m-quad', t('rt.quad'), p?.prices?.quad ?? 38000, 'type="number" min="0"')}
    ${inp('m-triple', t('rt.triple'), p?.prices?.triple ?? 45000, 'type="number" min="0"')}
    ${inp('m-double', t('rt.double'), p?.prices?.double ?? 58000, 'type="number" min="0"')}
    </div>${p ? field('m-status', t('f.status'), sel('m-status', ['open', 'closed'].map((k) => [k, t('pkg.' + k)]), p.status)) : ''}
    <button class="btn pri big" style="width:100%">${esc(t('b.save'))}</button></form>`);
}
function bookingModal(packageId) {
  const d = D();
  const open = d.packages.filter((p) => p.status === 'open' && p.depart >= d.today);
  if (!open.length) { toast(t('err.needPackage'), true); return ''; }
  return modalBg(`<form data-form="booking">${mhead(t('b.newBooking'))}<div class="frow">
    ${field('m-pkg', t('bk.package'), sel('m-pkg', open.map((p) => [p.id, `${p.name} · ${dF(p.depart)} · ${nf(p.capacity - p.taken)} ${t('pk.seats')}`]), packageId || open[0].id))}
    ${field('m-client', t('bk.client'), sel('m-client', d.clients.map((c) => [c.id, c.name])))}
    ${field('m-room', t('f.roomType'), sel('m-room', L.ROOM_TYPES.map((k) => [k, t('rt.' + k)])))}
    ${inp('m-persons', t('bk.persons'), 1, 'type="number" min="1" max="6"')}
    ${inp('m-notes', t('bk.notes'))}
    </div><button class="btn pri big" style="width:100%">${esc(t('b.save'))}</button></form>`);
}
function clientModal(c) {
  return modalBg(`<form data-form="client">${mhead(t(c ? 'b.edit' : 'b.newClient'))}<div class="frow">
    ${inp('m-name', t('f.name'), c?.name)}
    ${inp('m-phone', t('f.phone'), c?.phone, 'inputmode="tel"')}
    ${inp('m-pass', t('f.passport'), c?.passportNo)}
    </div><button class="btn pri big" style="width:100%">${esc(t('b.save'))}</button></form>`);
}
function paymentModal(bookingId) {
  const d = D();
  const open = d.bookings.filter((b) => !['cancelled', 'completed'].includes(b.status) && b.balance > 0);
  if (!open.length) { toast(t('err.noBalance'), true); return ''; }
  return modalBg(`<form data-form="payment">${mhead(t('b.pay'))}<div class="frow">
    ${field('m-booking', t('py.booking'), sel('m-booking', open.map((b) => [b.id, `${b.code} · ${b.clientName} · ${egp(b.balance)}`]), bookingId || open[0].id))}
    ${inp('m-amount', t('f.amount'), open.find((b) => b.id === (bookingId || open[0].id))?.balance ?? open[0].balance, 'type="number" min="1"')}
    ${field('m-method', t('f.method'), sel('m-method', ['cash', 'card', 'transfer'].map((k) => [k, t('pm.' + k)])))}
    </div><button class="btn pri big" style="width:100%">${esc(t('b.save'))}</button></form>`);
}
function modalHtml() {
  if (!S.modal) return '';
  const [kind, id] = S.modal.split(':');
  try {
    if (kind === 'package') return packageModal(id ? D().packages.find((p) => p.id === id) : null);
    if (kind === 'booking') return bookingModal(id || null);
    if (kind === 'client') return clientModal(id ? D().clients.find((c) => c.id === id) : null);
    if (kind === 'payment') return paymentModal(id || null);
  } catch (e) { toast(e.message, true); }
  return '';
}

// ---------- render ----------
const PAGES = { dashboard: pgDashboard, packages: pgPackages, bookings: pgBookings, documents: pgDocuments, clients: pgClients, payments: pgPayments, reports: pgReports, audit: pgAudit };
function render() {
  document.documentElement.lang = S.lang;
  document.documentElement.dir = ar() ? 'rtl' : 'ltr';
  document.title = 'Manasik';
  const app = $('#app');
  if (!S.token || !S.me) { app.innerHTML = loginPage(); return; }
  if (!S.data) { app.innerHTML = `<main><p class="empty">${esc(t('loading'))}</p></main>`; return; }
  const r = route();
  if (location.hash !== '#/' + r) history.replaceState(null, '', '#/' + r);
  app.innerHTML = shell((PAGES[r] || pgDashboard)());
}
async function boot() {
  render();
  if (!S.token || !S.me) return;
  try { await refresh(); } catch (e) { toast(e.message, true); return; }
  if (route() === 'login') location.hash = '#/' + NAV[role()][0];
  render();
}

// ---------- actions ----------
const ACT = {
  lang() { S.lang = ar() ? 'en' : 'ar'; LS.set('lang', S.lang); render(); },
  logout: () => logout(),
  pin(e, el) { $('#pin').value = el.dataset.pin; doLogin(); },
  login: () => doLogin(),
  filter(e, el) { S.filter = el.dataset.f; render(); },
  newpackage() { S.modal = 'package'; render(); },
  editpackage(e, el) { S.modal = 'package:' + el.dataset.id; render(); },
  newbooking(e, el) { S.modal = 'booking' + (el.dataset.id ? ':' + el.dataset.id : ''); render(); },
  newclient() { S.modal = 'client'; render(); },
  editclient(e, el) { S.modal = 'client:' + el.dataset.id; render(); },
  pay(e, el) { S.modal = 'payment' + (el.dataset.id ? ':' + el.dataset.id : ''); render(); },
  bg() { S.modal = null; render(); },
  async confirm(e, el) { if (await doOp({ type: 'confirmBooking', key: 'cf-' + el.dataset.id, bookingId: el.dataset.id }, t('ok.confirmed'))) render(); },
  async docfwd(e, el) {
    const x = D().documents.find((y) => y.id === el.dataset.id); if (!x) return;
    const next = L.DOC_STAGES[L.DOC_STAGES.indexOf(x.status) + 1];
    if (await doOp({ type: 'updateDocument', key: 'doc-' + el.dataset.id + '-' + next, documentId: el.dataset.id, status: next }, t('ok.doc'))) render();
  },
  async travel(e, el) { if (await doOp({ type: 'setTraveling', key: 'tv-' + el.dataset.id, packageId: el.dataset.id }, t('ok.travel'))) render(); },
  async complete(e, el) { if (await doOp({ type: 'completeBooking', key: 'cp-' + el.dataset.id, bookingId: el.dataset.id }, t('ok.completed'))) render(); },
  async cancel(e, el) { if (await doOp({ type: 'cancelBooking', key: 'cx-' + el.dataset.id, bookingId: el.dataset.id }, t('ok.cancelled'))) render(); },
};
async function doLogin() {
  const pin = $('#pin')?.value?.trim();
  if (!pin) return;
  try {
    const r = await api('POST', { type: 'login', pin });
    S.token = r.token; S.me = r.me; LS.set('token', r.token); LS.set('me', r.me);
    S.data = null; S.modal = null; location.hash = '#/' + NAV[r.me.role][0]; boot();
  } catch (e) { toast(e.message, true); }
}
async function submitForm(form) {
  const kind = form.dataset.form;
  if (S.busy) return;
  if (kind === 'package') {
    const existing = S.modal && S.modal.includes(':') ? D().packages.find((p) => p.id === S.modal.split(':')[1]) : null;
    const op = { type: existing ? 'updatePackage' : 'addPackage', key: existing ? 'pk-' + existing.id + '-' + Date.now() : 'pk-' + crypto.randomUUID() };
    if (existing) op.packageId = existing.id;
    op.name = val('#m-name'); op.makkah = val('#m-makkah'); op.madinah = val('#m-madinah');
    op.prices = { quad: num('#m-quad'), triple: num('#m-triple'), double: num('#m-double') };
    if (!existing) { op.kind = val('#m-kind'); op.depart = val('#m-depart'); op.return = val('#m-return'); op.visaDeadline = val('#m-visa'); op.transport = val('#m-transport'); op.capacity = num('#m-cap'); }
    else op.status = val('#m-status');
    if (await doOp(op, t('ok.saved'))) { S.modal = null; render(); }
  } else if (kind === 'booking') {
    if (await doOp({ type: 'addBooking', key: 'bk-' + crypto.randomUUID(), packageId: val('#m-pkg'), clientId: val('#m-client'), roomType: val('#m-room'), persons: num('#m-persons'), notes: val('#m-notes') }, t('ok.saved'))) { S.modal = null; render(); }
  } else if (kind === 'client') {
    const existing = S.modal && S.modal.includes(':') ? S.modal.split(':')[1] : null;
    const op = { type: existing ? 'updateClient' : 'addClient', key: 'cl-' + crypto.randomUUID() };
    if (existing) op.clientId = existing;
    op.name = val('#m-name'); op.phone = val('#m-phone'); op.passportNo = val('#m-pass');
    if (await doOp(op, t('ok.saved'))) { S.modal = null; render(); }
  } else if (kind === 'payment') {
    if (await doOp({ type: 'addPayment', key: 'py-' + crypto.randomUUID(), bookingId: val('#m-booking'), amount: num('#m-amount'), method: val('#m-method') }, t('ok.paid'))) { S.modal = null; render(); }
  }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  if (e.target.closest('.modal') && el.dataset.act === 'bg' && !e.target.classList.contains('modal-bg') && !el.classList.contains('btn')) return;
  if (el.dataset.act === 'bg' && e.target.closest('.modal') && !e.target.classList.contains('modal-bg') && !el.closest('.mhead')) return;
  e.preventDefault(); const fn = ACT[el.dataset.act]; if (fn) fn(e, el);
});
document.addEventListener('submit', (e) => { e.preventDefault(); submitForm(e.target); });
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && S.modal) { S.modal = null; render(); }
  if (e.key === 'Enter' && document.activeElement && document.activeElement.id === 'pin') { e.preventDefault(); doLogin(); }
});
window.addEventListener('hashchange', () => { S.modal = null; render(); });
boot();

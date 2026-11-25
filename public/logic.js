// Manasik business rules. This file runs verbatim in the browser, the API and the tests.
export const TZ = 'Africa/Cairo';
export const MAX_AMOUNT = 10000000;
export const ROLES = ['manager', 'agent', 'docs', 'accountant', 'leader'];
export const PKG_KINDS = ['umrah', 'hajj'];
export const ROOM_TYPES = ['quad', 'triple', 'double'];
export const BOOKING_STAGES = ['reserved', 'confirmed', 'traveling', 'completed'];
export const DOC_KINDS = ['passport', 'visa', 'vaccination', 'photo'];
export const DOC_STAGES = ['missing', 'received', 'submitted', 'approved'];
export const CONFIRM_MIN_PCT = 20; // a booking confirms only once 20% is paid
export const DOCS_SOON_DAYS = 14; // warn when a departure is this near with unfinished documents
export const PAY_SOON_DAYS = 21; // warn when a departure is this near with a balance
export const DEPART_SOON_DAYS = 7;
export const DEMO_USERS = [
  { pin: '1111', label: 'Agency manager', labelAr: 'مدير الوكالة' },
  { pin: '2222', label: 'Booking agent', labelAr: 'موظف الحجوزات' },
  { pin: '3333', label: 'Documents officer', labelAr: 'مسؤول التأشيرات' },
  { pin: '4444', label: 'Accountant', labelAr: 'محاسب' },
  { pin: '5555', label: 'Group leader (read-only)', labelAr: 'مشرف الرحلة (اطلاع فقط)' },
];

export class UserError extends Error {}
export class PermError extends Error {}

const parse = (d) => Date.parse(d + 'T00:00:00Z');
export const dayKey = (ts) => new Date(ts).toLocaleDateString('en-CA', { timeZone: TZ });
export const addDays = (k, n) => new Date(parse(k) + n * 864e5).toISOString().slice(0, 10);
export const monthOf = (k) => k.slice(0, 7);
export const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
export const isKey = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));

const oneOf = (v, list, msg) => { if (!list.includes(v)) throw new UserError(msg); return v; };
const need = (user, roles) => { if (!roles.includes(user.role)) throw new PermError('You do not have permission to do this'); };
const nextId = (s, p) => `${p}${(s.counters[p] = (s.counters[p] || 0) + 1)}`;
const audit = (s, user, now, action, detail) => { s.audit.unshift({ ts: now, userId: user.id, name: user.name, action, detail: String(detail).slice(0, 200) }); if (s.audit.length > 400) s.audit.length = 400; };
const once = (s, op, fn) => {
  if (op.key !== undefined && (typeof op.key !== 'string' || op.key.length < 4 || op.key.length > 64)) throw new UserError('Bad request');
  if (op.key && s.keys.includes(op.key)) return { duplicate: true };
  const r = fn(); if (op.key) { s.keys.push(op.key); if (s.keys.length > 600) s.keys.shift(); } return r;
};
const str = (v, min, max, label) => { if (typeof v !== 'string' || v.trim().length < min || v.length > max) throw new UserError(label + ' is not valid'); return v.trim(); };
const optStr = (v, max, label) => (v === undefined || v === null || v === '' ? '' : str(v, 1, max, label));
const intIn = (v, min, max, label) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw new UserError(label + ' is not valid'); return n; };
const find = (arr, id, label) => { const x = arr.find((a) => a.id === id); if (!x) throw new UserError(label + ' not found'); return x; };
const txDate = (op, now) => { const d = op.date || dayKey(now); if (!isKey(d)) throw new UserError('The date is not valid'); if (d > dayKey(now)) throw new UserError('The date cannot be in the future'); return d; };

const getPackage = (s, id) => find(s.packages, id, 'Package');
const getClient = (s, id) => find(s.clients, id, 'Client');
const getBooking = (s, id) => find(s.bookings, id, 'Booking');
export const activeBookings = (s, pkgId) => s.bookings.filter((b) => b.packageId === pkgId && b.status !== 'cancelled');
export const seatsTaken = (s, pkgId) => activeBookings(s, pkgId).reduce((x, b) => x + b.persons, 0);
export const bookingPaid = (s, b) => s.payments.filter((p) => p.bookingId === b.id).reduce((x, p) => x + p.amount, 0);
export const bookingBalance = (s, b) => b.amount - bookingPaid(s, b);
export const priceFor = (pkg, roomType) => pkg.prices[roomType];

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- operations ----------
export const OP_ROLES = {
  addClient: ['manager', 'agent'], updateClient: ['manager', 'agent'],
  addPackage: ['manager'], updatePackage: ['manager'],
  addBooking: ['manager', 'agent'], cancelBooking: ['manager'], confirmBooking: ['manager', 'agent'],
  setTraveling: ['manager'], completeBooking: ['manager'],
  updateDocument: ['manager', 'docs'],
  addPayment: ['manager', 'accountant'],
};

export const OPS = {
  addClient(s, op, { user, now }) {
    need(user, OP_ROLES.addClient);
    return once(s, op, () => {
      const c = { id: nextId(s, 'cl'), name: str(op.name, 3, 80, 'Name'), phone: optStr(op.phone, 30, 'Phone'), passportNo: optStr(op.passportNo, 20, 'Passport number'), birthdate: op.birthdate ? oneOf(isKey(op.birthdate) ? op.birthdate : null, [op.birthdate], 'Birthdate') : '', notes: optStr(op.notes, 200, 'Notes'), createdAt: now };
      if (s.clients.some((x) => x.name.toLowerCase() === c.name.toLowerCase())) throw new UserError('A client with this name exists');
      s.clients.push(c); audit(s, user, now, 'addClient', `${c.id} ${c.name}`); return { clientId: c.id };
    });
  },
  updateClient(s, op, { user, now }) {
    need(user, OP_ROLES.updateClient);
    const c = getClient(s, op.clientId);
    Object.assign(c, { name: str(op.name, 3, 80, 'Name'), phone: optStr(op.phone, 30, 'Phone'), passportNo: optStr(op.passportNo, 20, 'Passport number'), notes: optStr(op.notes, 200, 'Notes') });
    audit(s, user, now, 'updateClient', c.id); return {};
  },
  addPackage(s, op, { user, now }) {
    need(user, OP_ROLES.addPackage);
    return once(s, op, () => {
      const depart = oneOf(isKey(op.depart) ? op.depart : null, [op.depart], 'Departure date');
      const ret = oneOf(isKey(op.return) ? op.return : null, [op.return], 'Return date');
      if (ret <= depart) throw new UserError('The return must be after the departure');
      const visaDeadline = op.visaDeadline ? oneOf(isKey(op.visaDeadline) ? op.visaDeadline : null, [op.visaDeadline], 'Visa deadline') : addDays(depart, -14);
      if (visaDeadline >= depart) throw new UserError('The visa deadline must be before the departure');
      const prices = {};
      for (const rt of ROOM_TYPES) prices[rt] = intIn(op.prices && op.prices[rt], 1000, MAX_AMOUNT, 'Price');
      const p = { id: nextId(s, 'p'), name: str(op.name, 3, 80, 'Name'), kind: oneOf(op.kind, PKG_KINDS, 'Unknown package kind'), depart, return: ret, visaDeadline, makkah: str(op.makkah, 3, 80, 'Makkah hotel'), madinah: optStr(op.madinah, 80, 'Madinah hotel'), transport: oneOf(op.transport, ['air', 'bus'], 'Unknown transport'), capacity: intIn(op.capacity, 5, 500, 'Capacity'), prices, status: 'open', createdAt: now };
      s.packages.push(p); audit(s, user, now, 'addPackage', `${p.id} ${p.name}`); return { packageId: p.id };
    });
  },
  updatePackage(s, op, { user, now }) {
    need(user, OP_ROLES.updatePackage);
    const p = getPackage(s, op.packageId);
    const prices = {};
    for (const rt of ROOM_TYPES) prices[rt] = intIn(op.prices && op.prices[rt], 1000, MAX_AMOUNT, 'Price');
    Object.assign(p, { name: str(op.name, 3, 80, 'Name'), makkah: str(op.makkah, 3, 80, 'Makkah hotel'), madinah: optStr(op.madinah, 80, 'Madinah hotel'), prices });
    if (op.status !== undefined) p.status = oneOf(op.status, ['open', 'closed'], 'Unknown package status');
    audit(s, user, now, 'updatePackage', p.id); return {};
  },
  addBooking(s, op, { user, now }) {
    need(user, OP_ROLES.addBooking);
    return once(s, op, () => {
      const p = getPackage(s, op.packageId);
      if (p.status !== 'open') throw new UserError('This package is closed');
      if (p.depart <= dayKey(now)) throw new UserError('This package has already departed');
      const c = getClient(s, op.clientId);
      const roomType = oneOf(op.roomType, ROOM_TYPES, 'Unknown room type');
      const persons = intIn(op.persons, 1, 6, 'Travelers');
      if (seatsTaken(s, p.id) + persons > p.capacity) throw new UserError('Not enough seats left on this package');
      const b = { id: nextId(s, 'b'), code: `MN-${String(++s.counters.bookingNo).padStart(4, '0')}`, packageId: p.id, clientId: c.id, roomType, persons, rate: priceFor(p, roomType), amount: priceFor(p, roomType) * persons, status: 'reserved', notes: optStr(op.notes, 200, 'Notes'), by: user.id, createdAt: now, confirmedAt: null };
      s.bookings.push(b);
      for (const kind of DOC_KINDS) s.documents.push({ id: nextId(s, 'd'), bookingId: b.id, kind, status: 'missing', by: '', ts: now });
      audit(s, user, now, 'addBooking', `${b.code} ${c.name} × ${persons}`); return { bookingId: b.id, code: b.code, amount: b.amount };
    });
  },
  confirmBooking(s, op, { user, now }) {
    need(user, OP_ROLES.confirmBooking);
    const b = getBooking(s, op.bookingId);
    if (b.status !== 'reserved') throw new UserError('Only a reserved booking can be confirmed');
    if (bookingPaid(s, b) * 100 < b.amount * CONFIRM_MIN_PCT) throw new UserError('A booking confirms only after 20% is paid');
    b.status = 'confirmed'; b.confirmedAt = now;
    audit(s, user, now, 'confirmBooking', b.code); return {};
  },
  setTraveling(s, op, { user, now }) {
    need(user, OP_ROLES.setTraveling);
    const p = getPackage(s, op.packageId);
    if (p.depart > dayKey(now)) throw new UserError('This package has not departed yet');
    for (const b of activeBookings(s, p.id)) {
      if (b.status === 'reserved') throw new UserError('There are unconfirmed bookings on this package');
      if (b.status === 'confirmed') b.status = 'traveling';
    }
    p.status = 'closed';
    audit(s, user, now, 'setTraveling', p.name); return {};
  },
  completeBooking(s, op, { user, now }) {
    need(user, OP_ROLES.completeBooking);
    const b = getBooking(s, op.bookingId);
    if (b.status !== 'traveling') throw new UserError('Only a traveling booking can be completed');
    if (bookingBalance(s, b) > 0) throw new UserError('This booking still has a balance');
    for (const d of s.documents.filter((x) => x.bookingId === b.id)) if (d.status !== 'approved') throw new UserError('This booking still has unfinished documents');
    b.status = 'completed';
    audit(s, user, now, 'completeBooking', b.code); return {};
  },
  cancelBooking(s, op, { user, now }) {
    need(user, OP_ROLES.cancelBooking);
    const b = getBooking(s, op.bookingId);
    if (b.status === 'cancelled') throw new UserError('This booking is already cancelled');
    if (b.status === 'completed') throw new UserError('A completed booking cannot be cancelled');
    b.status = 'cancelled';
    audit(s, user, now, 'cancelBooking', `${b.code}${bookingPaid(s, b) > 0 ? ' refund owed' : ''}`); return {};
  },
  updateDocument(s, op, { user, now }) {
    need(user, OP_ROLES.updateDocument);
    const d = find(s.documents, op.documentId, 'Document');
    const b = getBooking(s, d.bookingId);
    if (b.status === 'cancelled' || b.status === 'completed') throw new UserError('This booking is no longer active');
    const st = oneOf(op.status, DOC_STAGES, 'Unknown document status');
    if (DOC_STAGES.indexOf(st) <= DOC_STAGES.indexOf(d.status)) throw new UserError('A document only moves forward');
    d.status = st; d.by = user.id; d.ts = now;
    audit(s, user, now, 'updateDocument', `${b.code} ${d.kind} → ${st}`); return {};
  },
  addPayment(s, op, { user, now }) {
    need(user, OP_ROLES.addPayment);
    return once(s, op, () => {
      const b = getBooking(s, op.bookingId);
      if (b.status === 'cancelled') throw new UserError('This booking is cancelled');
      if (b.status === 'completed') throw new UserError('This booking is completed');
      const amt = intIn(op.amount, 1, MAX_AMOUNT, 'Amount');
      if (amt > bookingBalance(s, b)) throw new UserError('That is more than the booking balance');
      const p = { id: nextId(s, 'pay'), bookingId: b.id, method: oneOf(op.method, ['cash', 'card', 'transfer'], 'Unknown method'), amount: amt, date: txDate(op, now), by: user.id, ts: now };
      s.payments.push(p);
      audit(s, user, now, 'addPayment', `${b.code} ${amt}`); return { paymentId: p.id, balance: bookingBalance(s, b) };
    });
  },
};

export function applyOp(s, op, ctx) {
  const fn = Object.prototype.hasOwnProperty.call(OPS, op && op.type) ? OPS[op.type] : null;
  if (!fn) throw new UserError('Unknown action');
  return fn(s, op, ctx);
}

// ---------- reports ----------
export function monthReport(s, m) {
  const inM = (k) => monthOf(k) === m;
  const bs = s.bookings.filter((b) => inM(dayKey(b.createdAt)) && b.status !== 'cancelled');
  const pays = s.payments.filter((p) => inM(p.date));
  return { month: m, bookings: bs.length, persons: bs.reduce((x, b) => x + b.persons, 0), booked: bs.reduce((x, b) => x + b.amount, 0), collected: pays.reduce((x, p) => x + p.amount, 0) };
}

// ---------- view ----------
export function view(s, user, now) {
  const today = dayKey(now), m0 = monthOf(today);
  const money = ['manager', 'agent', 'accountant'].includes(user.role);
  const isLeader = user.role === 'leader';
  const cOf = (id) => s.clients.find((c) => c.id === id);
  const pOf = (id) => s.packages.find((p) => p.id === id);
  const packages = s.packages.map((p) => {
    const taken = seatsTaken(s, p.id);
    return { ...p, taken, free: p.capacity - taken, occupancy: Math.round((taken / p.capacity) * 100) };
  }).sort((a, b) => (a.depart < b.depart ? -1 : 1));
  const bookings = s.bookings.map((b) => {
    const base = { ...b, clientName: cOf(b.clientId)?.name || '', packageName: pOf(b.packageId)?.name || '', depart: pOf(b.packageId)?.depart || '', docsApproved: s.documents.filter((d) => d.bookingId === b.id && d.status === 'approved').length, docsTotal: DOC_KINDS.length };
    if (!money) { const { rate, amount, notes, ...rest } = base; return { ...rest, paid: 0, balance: 0 }; }
    return { ...base, paid: bookingPaid(s, b), balance: bookingBalance(s, b) };
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const documents = s.documents.map((d) => ({ ...d, code: getBooking(s, d.bookingId).code, clientName: cOf(getBooking(s, d.bookingId).clientId)?.name || '', packageName: pOf(getBooking(s, d.bookingId).packageId)?.name || '', depart: pOf(getBooking(s, d.bookingId).packageId)?.depart || '' }));
  const clients = isLeader ? [] : s.clients.map((c) => ({ ...c, bookings: s.bookings.filter((b) => b.clientId === c.id && b.status !== 'cancelled').length }));
  const byMonth = []; for (let i = 11; i >= 0; i--) byMonth.push(monthReport(s, addMonths(m0, -i)));
  const upcoming = packages.filter((p) => p.depart >= today && p.status === 'open');
  const openBalances = money ? s.bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'completed').reduce((x, b) => x + bookingBalance(s, b), 0) : 0;
  const totals = {
    openPackages: upcoming.length,
    departingThisWeek: packages.filter((p) => p.depart >= today && p.depart <= addDays(today, DEPART_SOON_DAYS)).length,
    activeBookings: s.bookings.filter((b) => !['cancelled', 'completed'].includes(b.status)).length,
    pilgrimsTraveling: s.bookings.filter((b) => b.status === 'traveling').reduce((x, b) => x + b.persons, 0),
    docsPending: s.documents.filter((d) => { const b = getBooking(s, d.bookingId); return !['cancelled', 'completed'].includes(b.status) && d.status !== 'approved'; }).length,
    bookedThisMonth: byMonth[11].booked,
    collectedThisMonth: byMonth[11].collected,
    outstanding: openBalances,
  };
  const insights = [];
  for (const p of upcoming) {
    const dd = daysBetween(today, p.depart);
    if (dd <= DEPART_SOON_DAYS) insights.push({ kind: 'departure_soon', packageId: p.id, name: p.name, days: dd });
    else if (p.occupancy >= 90) insights.push({ kind: 'almost_full', packageId: p.id, name: p.name, free: p.free });
    const vd = daysBetween(today, p.visaDeadline);
    if (vd >= 0 && vd <= 7) insights.push({ kind: 'visa_deadline', packageId: p.id, name: p.name, days: vd });
  }
  for (const b of s.bookings.filter((x) => !['cancelled', 'completed'].includes(x.status))) {
    const p = pOf(b.packageId); if (!p || p.depart < today) continue;
    const dd = daysBetween(today, p.depart);
    const pendingDocs = s.documents.filter((d) => d.bookingId === b.id && d.status !== 'approved').length;
    if (pendingDocs > 0 && dd <= DOCS_SOON_DAYS) insights.push({ kind: 'docs_missing', bookingId: b.id, code: b.code, n: pendingDocs, days: dd });
    if (money && bookingBalance(s, b) > 0 && dd <= PAY_SOON_DAYS) insights.push({ kind: 'balance_near_departure', bookingId: b.id, code: b.code, amount: bookingBalance(s, b), days: dd });
  }
  for (const b of s.bookings.filter((x) => x.status === 'cancelled' && bookingPaid(s, x) > 0)) if (money) insights.push({ kind: 'refund_owed', bookingId: b.id, code: b.code, amount: bookingPaid(s, b) });
  const perPackage = upcoming.map((p) => ({ id: p.id, name: p.name, depart: p.depart, taken: p.taken, capacity: p.capacity, occupancy: p.occupancy }));
  const out = {
    me: { id: user.id, name: user.name, nameAr: user.nameAr, role: user.role }, today, now,
    packages, bookings, documents: isLeader ? [] : documents, clients,
    reports: { byMonth, totals, perPackage },
    insights,
    audit: user.role === 'manager' ? s.audit.slice(0, 120) : [],
  };
  if (money) out.payments = s.payments.slice(-200).reverse();
  else out.payments = [];
  if (isLeader) {
    out.reports = { byMonth: [], totals: { openPackages: totals.openPackages, departingThisWeek: totals.departingThisWeek, pilgrimsTraveling: totals.pilgrimsTraveling }, perPackage };
    out.insights = out.insights.filter((i) => i.kind === 'departure_soon');
    out.clients = [];
  }
  if (user.role === 'docs') {
    out.payments = [];
    out.reports.byMonth = out.reports.byMonth.map((r) => ({ month: r.month, bookings: r.bookings, persons: r.persons, booked: 0, collected: 0 }));
    out.reports.totals = { ...out.reports.totals, bookedThisMonth: 0, collectedThisMonth: 0, outstanding: 0 };
    out.insights = out.insights.filter((i) => ['departure_soon', 'docs_missing', 'visa_deadline', 'almost_full'].includes(i.kind));
  }
  return out;
}

// ---------- deterministic sample agency ----------
export function seed(now) {
  const today = dayKey(now);
  const rnd = mulberry32(20261125);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const s = {
    users: [
      { id: 'u-mgr', pin: '1111', name: 'Khaled Mansour', nameAr: 'خالد منصور', role: 'manager' },
      { id: 'u-agent', pin: '2222', name: 'Rania Fouad', nameAr: 'رانيا فؤاد', role: 'agent' },
      { id: 'u-docs', pin: '3333', name: 'Tamer Aziz', nameAr: 'تامر عزيز', role: 'docs' },
      { id: 'u-acc', pin: '4444', name: 'Maha Salem', nameAr: 'مها سالم', role: 'accountant' },
      { id: 'u-leader', pin: '5555', name: 'Mahmoud Zaki', nameAr: 'محمود زكي', role: 'leader' },
    ],
    counters: { bookingNo: 0, b: 22, cl: 12, p: 7 }, keys: [], audit: [],
    clients: [], packages: [], bookings: [], documents: [], payments: [],
  };
  const mkClient = (id, name, phone, passportNo, birthdate) => s.clients.push({ id, name, phone, passportNo, birthdate, notes: '', createdAt: now - 300 * 864e5 });
  mkClient('cl1', 'Ahmed Abdelaziz', '0100555101', 'A1234001', '1978-03-12');
  mkClient('cl2', 'Fatma El-Sayed', '0100555102', 'A1234002', '1985-07-01');
  mkClient('cl3', 'Mohamed Gomaa', '0100555103', 'A1234003', '1969-11-25');
  mkClient('cl4', 'Aisha Ramadan', '0100555104', 'A1234004', '1990-02-14');
  mkClient('cl5', 'Youssef Hammad', '0100555105', 'A1234005', '1982-09-30');
  mkClient('cl6', 'Mariam Lotfy', '0100555106', 'A1234006', '1995-05-08');
  mkClient('cl7', 'Sayed El-Baz', '0100555107', 'A1234007', '1960-01-19');
  mkClient('cl8', 'Heba Mostafa', '0100555108', 'A1234008', '1988-12-03');
  mkClient('cl9', 'Omar Shaaban', '0100555109', 'A1234009', '1975-06-22');
  mkClient('cl10', 'Nour El-Din Ahmed', '0100555110', 'A1234010', '1992-04-17');
  mkClient('cl11', 'Samira Khalil', '0100555111', 'A1234011', '1966-08-27');
  mkClient('cl12', 'Tarek El-Husseini', '0100555112', 'A1234012', '1983-10-05');

  const mkPkg = (id, name, kind, dDepart, dReturn, dVisa, makkah, madinah, transport, capacity, quad, triple, double2, status = 'open') =>
    s.packages.push({ id, name, kind, depart: addDays(today, dDepart), return: addDays(today, dReturn), visaDeadline: addDays(today, dVisa), makkah, madinah, transport, capacity, prices: { quad, triple, double: double2 }, status, createdAt: now - (dDepart < 0 ? 200 : 60) * 864e5 });
  const hist = [
    ['Umrah Muharram 1447', -340, 40, 24500, 27600, 31800],
    ['Umrah Safar', -292, 38, 24900, 28100, 32300],
    ['Umrah Rabi Al-Awwal', -243, 42, 25400, 28700, 33000],
    ['Umrah Rabi Al-Thani', -195, 40, 25900, 29200, 33600],
    ['Umrah Jumada Al-Awwal', -130, 36, 25000, 28300, 32600],
    ['Umrah Jumada Al-Thani', -75, 44, 26200, 29500, 33900],
  ];
  hist.forEach(([nm, dd, cap, q, tr, db], i) => {
    mkPkg('ph' + (i + 1), nm, 'umrah', dd, dd + 13, dd - 15, 'Dar Al Eiman Royal', 'Dallah Taibah', 'air', cap, q, tr, db, 'closed');
  });
  mkPkg('p1', 'Umrah Shawwal 1447', 'umrah', -160, -147, -175, 'Hilton Suites Makkah', 'Madinah Mövenpick', 'air', 45, 26500, 29800, 34200, 'closed');
  mkPkg('p2', 'Umrah Dhul-Qada', 'umrah', -18, -5, -32, 'Swissotel Makkah', 'Pullman Zamzam Madinah', 'air', 40, 27900, 31500, 35900, 'closed');
  mkPkg('p3', 'Umrah Rajab Express', 'umrah', 5, 17, -9, 'Elaf Kinda Makkah', 'Saja Al Madinah', 'air', 45, 28400, 31900, 36600);
  mkPkg('p4', 'Umrah Ramadan First Ashra', 'umrah', 26, 40, 5, 'Makkah Towers', 'Anwar Al Madinah', 'air', 60, 34500, 38900, 44500);
  mkPkg('p5', 'Umrah Ramadan Last Ashra', 'umrah', 45, 59, 24, 'Fairmont Makkah', 'Shaza Al Madinah', 'air', 55, 39800, 44900, 52000);
  mkPkg('p6', 'Weekend Umrah by Bus', 'umrah', 12, 18, -2, 'Dar Al Eiman Grand', '', 'bus', 20, 9800, 11400, 13900);
  mkPkg('p7', 'Hajj 1447 Economy', 'hajj', 120, 134, 60, 'Azizia Camp', '', 'air', 90, 148000, 169000, 189000);

  const mkBooking = (id, pkgId, clientId, roomType, persons, status, dAgo, docsUpTo, payPlan) => {
    const p = s.packages.find((x) => x.id === pkgId);
    const b = { id, code: `MN-${String(++s.counters.bookingNo).padStart(4, '0')}`, packageId: pkgId, clientId, roomType, persons, rate: p.prices[roomType], amount: p.prices[roomType] * persons, status, notes: '', by: 'u-agent', createdAt: now - dAgo * 864e5, confirmedAt: status === 'reserved' ? null : now - (dAgo - 1) * 864e5 };
    s.bookings.push(b);
    for (const kind of DOC_KINDS) s.documents.push({ id: nextId(s, 'd'), bookingId: id, kind, status: docsUpTo === 'approved' ? 'approved' : docsUpTo === 'mixed' ? pick(['missing', 'received', 'submitted']) : docsUpTo, by: docsUpTo === 'missing' ? '' : 'u-docs', ts: now - Math.max(1, dAgo - 2) * 864e5 });
    let paid = 0;
    for (const [dOff, amount, method] of payPlan) {
      s.payments.push({ id: nextId(s, 'pay'), bookingId: id, method, amount, date: addDays(today, -dOff), by: 'u-acc', ts: now - dOff * 864e5 });
      paid += amount;
    }
    return b;
  };
  const full = (b) => [[Math.max(1, daysBetween(addDays(today, -150), today) - 3), Math.round(b.amount * 0.5), 'transfer'], [1, b.amount - Math.round(b.amount * 0.5), 'cash']];

  // historical completed groups, one about every month over the past year
  const hcl = ['cl1', 'cl2', 'cl3', 'cl4', 'cl5', 'cl6', 'cl7', 'cl8', 'cl9', 'cl10'];
  hist.forEach(([nm, dd], i) => {
    for (const j of [0, 1]) {
      const b = mkBooking(`bh${i}${j}`, 'ph' + (i + 1), hcl[(i * 2 + j) % hcl.length], pick(ROOM_TYPES), 1 + ((i + j) % 4), 'completed', -dd + 40, 'approved', []);
      const half = Math.round(b.amount * 0.5);
      mkPaySplit(s, b, today, [[-dd + 30, half, pick(['cash', 'transfer'])], [-dd + 8, b.amount - half, pick(['cash', 'card', 'transfer'])]]);
    }
  });
  // p1 completed pilgrims (paid in full over the past months)
  for (const [i, cid, rt, n] of [['b1', 'cl1', 'quad', 2], ['b2', 'cl2', 'double', 1], ['b3', 'cl3', 'triple', 3], ['b4', 'cl7', 'quad', 4], ['b5', 'cl11', 'double', 2]]) {
    const b = mkBooking(i, 'p1', cid, rt, n, 'completed', 170, 'approved', []);
    const half = Math.round(b.amount * 0.5);
    mkPaySplit(s, b, today, [[150, half, 'transfer'], [110, b.amount - half, 'cash']]);
  }
  // p2 traveling now (paid, docs approved)
  for (const [i, cid, rt, n] of [['b6', 'cl4', 'triple', 3], ['b7', 'cl5', 'double', 2], ['b8', 'cl9', 'quad', 2], ['b9', 'cl10', 'quad', 1]]) {
    const b = mkBooking(i, 'p2', cid, rt, n, 'traveling', 60, 'approved', []);
    const third = Math.round(b.amount / 3);
    mkPaySplit(s, b, today, [[55, third, 'cash'], [40, third, 'transfer'], [25, b.amount - 2 * third, 'card']]);
  }
  // p3 departs in 5 days: balances and unfinished documents
  mkBooking('b10', 'p3', 'cl6', 'double', 2, 'confirmed', 30, 'approved', [[28, 40000, 'transfer'], [10, 20000, 'cash']]);
  mkBooking('b11', 'p3', 'cl8', 'quad', 4, 'confirmed', 25, 'mixed', [[24, 30000, 'cash']]);
  mkBooking('b12', 'p3', 'cl12', 'triple', 3, 'reserved', 6, 'mixed', []);
  // p4 mid-booked
  mkBooking('b13', 'p4', 'cl1', 'quad', 3, 'confirmed', 20, 'mixed', [[18, 25000, 'transfer']]);
  mkBooking('b14', 'p4', 'cl3', 'double', 2, 'reserved', 9, 'missing', [[8, 15000, 'cash']]);
  mkBooking('b15', 'p4', 'cl5', 'triple', 2, 'reserved', 4, 'missing', []);
  // p5 early bookings
  mkBooking('b16', 'p5', 'cl2', 'double', 1, 'confirmed', 15, 'received', [[14, 15000, 'transfer']]);
  mkBooking('b17', 'p5', 'cl10', 'quad', 5, 'reserved', 3, 'missing', [[2, 30000, 'cash']]);
  // p6 bus, nearly full
  mkBooking('b18', 'p6', 'cl8', 'quad', 4, 'confirmed', 12, 'approved', [[11, 19600, 'cash'], [5, 19600, 'cash']]);
  mkBooking('b19', 'p6', 'cl9', 'quad', 8, 'confirmed', 10, 'approved', [[9, 40000, 'transfer'], [4, 38400, 'cash']]);
  mkBooking('b20', 'p6', 'cl12', 'quad', 7, 'confirmed', 8, 'submitted', [[7, 35000, 'cash'], [3, 33600, 'cash']]);
  // p7 hajj early
  mkBooking('b21', 'p7', 'cl7', 'double', 2, 'reserved', 12, 'received', [[10, 60000, 'transfer']]);
  // cancelled with a refund owed
  mkBooking('b22', 'p3', 'cl11', 'quad', 2, 'cancelled', 22, 'received', [[21, 10000, 'cash']]);

  const nameOf = (id) => s.users.find((x) => x.id === id)?.name || '';
  for (const b of s.bookings.filter((x) => x.status === 'completed')) audit(s, { id: 'u-mgr', name: nameOf('u-mgr') }, b.confirmedAt + 864e5, 'completeBooking', b.code);
  for (const b of s.bookings.filter((x) => x.confirmedAt)) audit(s, { id: 'u-agent', name: nameOf('u-agent') }, b.confirmedAt, 'confirmBooking', b.code);
  audit(s, { id: 'u-acc', name: nameOf('u-acc') }, now - 3 * 864e5, 'addPayment', 'MN-0019 33600');
  audit(s, { id: 'u-docs', name: nameOf('u-docs') }, now - 2 * 864e5, 'updateDocument', 'MN-0012 visa → submitted');
  return s;
}
function mkPaySplit(s, b, today, plan) { // plan: [daysAgo, amount, method]
  for (const [dOff, amount, method] of plan) s.payments.push({ id: nextId(s, 'pay'), bookingId: b.id, method, amount, date: addDays(today, -dOff), by: 'u-acc', ts: Date.now() - dOff * 864e5 });
}

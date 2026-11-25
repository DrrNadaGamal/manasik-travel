import test from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../public/logic.js';

const NOW = Date.UTC(2026, 10, 25, 12); // noon UTC
const today = L.dayKey(NOW);
const fresh = () => L.seed(NOW);
const u = (s, role) => s.users.find((x) => x.role === role);
const run = (s, role, op) => L.applyOp(s, op, { user: u(s, role), now: NOW });
const runAt = (s, role, op, now) => L.applyOp(s, op, { user: u(s, role), now });
const viewFor = (s, role) => L.view(s, u(s, role), NOW);
const k = () => 'testkey' + Math.random().toString(36).slice(2, 8);

test('seed is internally consistent', () => {
  const s = fresh();
  assert.equal(s.clients.length, 12);
  assert.equal(s.packages.length, 13);
  for (const b of s.bookings) {
    assert.ok(s.clients.some((c) => c.id === b.clientId), b.id + ' client');
    assert.ok(s.packages.some((p) => p.id === b.packageId), b.id + ' package');
    assert.ok(L.ROOM_TYPES.includes(b.roomType));
    assert.equal(b.amount, b.rate * b.persons, b.id + ' amount');
  }
  for (const d of s.documents) {
    assert.ok(s.bookings.some((b) => b.id === d.bookingId), d.id + ' booking');
    assert.ok(L.DOC_KINDS.includes(d.kind) && L.DOC_STAGES.includes(d.status));
  }
  for (const p of s.payments) assert.ok(s.bookings.some((b) => b.id === p.bookingId), p.id + ' booking');
  for (const b of s.bookings) assert.ok(L.bookingPaid(s, b) <= b.amount || b.status === 'cancelled', b.id + ' overpaid');
  assert.ok(s.bookings.some((b) => b.status === 'cancelled'), 'a cancelled booking');
  assert.ok(s.bookings.some((b) => b.status === 'traveling'), 'a traveling booking');
  const v = viewFor(s, 'manager');
  assert.equal(v.reports.byMonth.length, 12);
  assert.ok(v.reports.byMonth.every((m) => m.bookings > 0 || m.collected > 0), 'no empty report month');
  const kinds = v.insights.map((i) => i.kind);
  for (const kind of ['departure_soon', 'almost_full', 'visa_deadline', 'docs_missing', 'balance_near_departure', 'refund_owed']) assert.ok(kinds.includes(kind), 'insight ' + kind);
});

test('permissions: each role is refused outside its lane', () => {
  const s = fresh();
  const open = s.packages.find((p) => p.id === 'p3');
  const mkBooking = () => ({ type: 'addBooking', packageId: open.id, clientId: s.clients[0].id, roomType: 'quad', persons: 1, key: k() });
  const nb = run(s, 'manager', mkBooking());
  const b = s.bookings.find((x) => x.id === nb.bookingId);
  const ops = {
    agent: [
      { type: 'addPackage', name: 'X pkg', kind: 'umrah', depart: L.addDays(today, 60), return: L.addDays(today, 70), makkah: 'Hotel A', transport: 'air', capacity: 40, prices: { quad: 30000, triple: 36000, double: 45000 }, key: k() },
      { type: 'setTraveling', packageId: open.id },
      { type: 'completeBooking', bookingId: b.id },
      { type: 'cancelBooking', bookingId: b.id },
      { type: 'updateDocument', documentId: s.documents.find((d) => d.bookingId === b.id).id, status: 'received' },
      { type: 'addPayment', bookingId: b.id, amount: 1000, method: 'cash', key: k() },
    ],
    docs: [
      mkBooking(),
      { type: 'addClient', name: 'New Person One', key: k() },
      { type: 'addPayment', bookingId: b.id, amount: 1000, method: 'cash', key: k() },
      { type: 'cancelBooking', bookingId: b.id },
    ],
    accountant: [
      mkBooking(),
      { type: 'addClient', name: 'New Person Two', key: k() },
      { type: 'updateDocument', documentId: s.documents.find((d) => d.bookingId === b.id).id, status: 'received' },
      { type: 'cancelBooking', bookingId: b.id },
    ],
    leader: [
      mkBooking(),
      { type: 'addClient', name: 'New Person Three', key: k() },
      { type: 'addPayment', bookingId: b.id, amount: 1000, method: 'cash', key: k() },
      { type: 'updateDocument', documentId: s.documents.find((d) => d.bookingId === b.id).id, status: 'received' },
      { type: 'setTraveling', packageId: open.id },
      { type: 'cancelBooking', bookingId: b.id },
    ],
  };
  for (const [role, list] of Object.entries(ops))
    for (const op of list) assert.throws(() => run(s, role, op), (e) => e instanceof L.PermError, `${role} ${op.type}`);
});

test('capacity guard refuses overbooking', () => {
  const s = fresh(); // p6: 19 of 20 seats taken
  assert.equal(L.seatsTaken(s, 'p6'), 19);
  assert.throws(() => run(s, 'manager', { type: 'addBooking', packageId: 'p6', clientId: s.clients[0].id, roomType: 'quad', persons: 2, key: k() }), /seats/i);
  const r = run(s, 'manager', { type: 'addBooking', packageId: 'p6', clientId: s.clients[0].id, roomType: 'quad', persons: 1, key: k() });
  assert.ok(r.bookingId);
  assert.equal(L.seatsTaken(s, 'p6'), 20);
});

test('booking confirms only at 20% paid', () => {
  const s = fresh();
  const nb = run(s, 'manager', { type: 'addBooking', packageId: 'p3', clientId: s.clients[0].id, roomType: 'quad', persons: 1, key: k() });
  const b = s.bookings.find((x) => x.id === nb.bookingId);
  const below = Math.floor(b.amount * 0.19);
  run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: below, method: 'cash', key: k() });
  assert.throws(() => run(s, 'manager', { type: 'confirmBooking', bookingId: b.id }), /20%/);
  run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: Math.ceil(b.amount * 0.2) - below, method: 'card', key: k() });
  run(s, 'agent', { type: 'confirmBooking', bookingId: b.id });
  assert.equal(s.bookings.find((x) => x.id === b.id).status, 'confirmed');
  assert.throws(() => run(s, 'manager', { type: 'confirmBooking', bookingId: b.id }), L.UserError); // already confirmed
});

test('documents move forward only', () => {
  const s = fresh();
  const nb = run(s, 'manager', { type: 'addBooking', packageId: 'p3', clientId: s.clients[1].id, roomType: 'triple', persons: 1, key: k() });
  const b = s.bookings.find((x) => x.id === nb.bookingId);
  const docs = s.documents.filter((d) => d.bookingId === b.id);
  assert.equal(docs.length, 4);
  assert.ok(docs.every((d) => d.status === 'missing'));
  run(s, 'docs', { type: 'updateDocument', documentId: docs[0].id, status: 'received' });
  assert.equal(docs[0].status, 'received');
  assert.throws(() => run(s, 'docs', { type: 'updateDocument', documentId: docs[0].id, status: 'missing' }), L.UserError); // backward refused
  assert.throws(() => run(s, 'docs', { type: 'updateDocument', documentId: docs[0].id, status: 'received' }), L.UserError); // same stage refused
});

test('payment cannot exceed balance or land in the future', () => {
  const s = fresh();
  const b = s.bookings.find((x) => x.id === 'b12'); // reserved, balance 95700
  assert.throws(() => run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: b.amount + 1, method: 'cash', key: k() }), L.UserError);
  assert.throws(() => run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: 100, method: 'cash', date: L.addDays(today, 1), key: k() }), L.UserError);
  assert.throws(() => run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: 100, method: 'cheque', key: k() }), L.UserError);
  const r = run(s, 'accountant', { type: 'addPayment', bookingId: b.id, amount: 5000, method: 'transfer', key: k() });
  assert.equal(L.bookingBalance(s, b), b.amount - 5000);
  assert.ok(r.paymentId);
});

test('full lifecycle: travel and complete guards', () => {
  const s = fresh();
  const pkgId = run(s, 'manager', {
    type: 'addPackage', name: 'Test Hajj Wave', kind: 'hajj', depart: L.addDays(today, 3), return: L.addDays(today, 17),
    visaDeadline: L.addDays(today, -11), makkah: 'Hotel A', transport: 'air', capacity: 30,
    prices: { quad: 90000, triple: 110000, double: 140000 }, key: k(),
  }).packageId;
  const p = s.packages.find((x) => x.id === pkgId);
  const nb1 = run(s, 'manager', { type: 'addBooking', packageId: p.id, clientId: s.clients[2].id, roomType: 'double', persons: 2, key: k() });
  const b1 = s.bookings.find((x) => x.id === nb1.bookingId);
  const nb2 = run(s, 'manager', { type: 'addBooking', packageId: p.id, clientId: s.clients[3].id, roomType: 'quad', persons: 1, key: k() });
  const b2 = s.bookings.find((x) => x.id === nb2.bookingId);
  const NOW2 = NOW + 5 * 864e5; // after departure
  // cannot travel before departure day
  assert.throws(() => run(s, 'manager', { type: 'setTraveling', packageId: p.id }), L.UserError);
  run(s, 'accountant', { type: 'addPayment', bookingId: b1.id, amount: b1.amount, method: 'transfer', key: k() });
  run(s, 'manager', { type: 'confirmBooking', bookingId: b1.id });
  // cannot travel while a booking is still reserved
  assert.throws(() => runAt(s, 'manager', { type: 'setTraveling', packageId: p.id }, NOW2), L.UserError);
  run(s, 'accountant', { type: 'addPayment', bookingId: b2.id, amount: Math.ceil(b2.amount * 0.2), method: 'cash', key: k() });
  run(s, 'manager', { type: 'confirmBooking', bookingId: b2.id });
  runAt(s, 'manager', { type: 'setTraveling', packageId: p.id }, NOW2);
  assert.equal(s.packages.find((x) => x.id === p.id).status, 'closed');
  assert.equal(b1.status, 'traveling');
  // b2 has a balance: complete refused
  assert.throws(() => runAt(s, 'manager', { type: 'completeBooking', bookingId: b2.id }, NOW2), L.UserError);
  // b1 paid in full but documents unfinished: complete refused
  assert.throws(() => runAt(s, 'manager', { type: 'completeBooking', bookingId: b1.id }, NOW2), L.UserError);
  for (const d of s.documents.filter((x) => x.bookingId === b1.id))
    for (const st of ['received', 'submitted', 'approved']) runAt(s, 'docs', { type: 'updateDocument', documentId: d.id, status: st }, NOW2);
  runAt(s, 'manager', { type: 'completeBooking', bookingId: b1.id }, NOW2);
  assert.equal(b1.status, 'completed');
  // a completed booking cannot be cancelled or paid
  assert.throws(() => run(s, 'manager', { type: 'cancelBooking', bookingId: b1.id }), L.UserError);
  assert.throws(() => run(s, 'accountant', { type: 'addPayment', bookingId: b1.id, amount: 1, method: 'cash', key: k() }), L.UserError);
  // cancelled booking keeps its documents frozen
  run(s, 'manager', { type: 'cancelBooking', bookingId: b2.id });
  assert.throws(() => run(s, 'docs', { type: 'updateDocument', documentId: s.documents.find((d) => d.bookingId === b2.id).id, status: 'received' }), L.UserError);
});

test('cancel of a paid booking flags refund owed', () => {
  const s = fresh();
  const v = viewFor(s, 'manager');
  assert.ok(v.insights.some((i) => i.kind === 'refund_owed' && i.code === 'MN-0034'));
});

test('idempotency: a repeated key is a no-op', () => {
  const s = fresh();
  const key = k();
  const op = { type: 'addClient', name: 'Idem Client', phone: '0100', key };
  const r1 = run(s, 'manager', op);
  const n = s.clients.length;
  const r2 = run(s, 'manager', op);
  assert.deepEqual(r2, { duplicate: true });
  assert.equal(s.clients.length, n);
  assert.ok(r1.clientId);
  assert.throws(() => run(s, 'manager', { ...op, key: 'abc' }), L.UserError); // key too short
});

test('views: docs and leader never see money', () => {
  const s = fresh();
  for (const role of ['docs', 'leader']) {
    const v = viewFor(s, role);
    const j = JSON.stringify(v);
    assert.ok(!j.includes('"rate"'), role + ' rate');
    assert.ok(!j.includes('"amount"'), role + ' amount');
    assert.ok(v.bookings.every((b) => b.paid === 0 && b.balance === 0), role + ' booking money zeroed');
    assert.equal(v.payments.length, 0, role + ' payments');
    assert.ok(v.reports.byMonth.every((m) => m.booked === 0 && m.collected === 0), role + ' byMonth money');
    assert.ok(!v.insights.some((i) => i.kind === 'balance_near_departure' || i.kind === 'refund_owed'), role + ' money insights');
  }
  const vl = viewFor(s, 'leader');
  assert.equal(vl.documents.length, 0);
  assert.equal(vl.clients.length, 0);
  assert.ok(vl.bookings.length > 0, 'leader sees a manifest');
  assert.ok(!JSON.stringify(vl.reports).includes('outstanding'));
  const vd = viewFor(s, 'docs');
  assert.ok(vd.documents.length > 0 && vd.clients.length > 0);
  const va = viewFor(s, 'agent');
  assert.ok(JSON.stringify(va.bookings).includes('"rate"'), 'agent sees money');
  assert.equal(va.audit.length, 0, 'audit is manager-only');
  assert.ok(viewFor(s, 'manager').audit.length > 0);
});

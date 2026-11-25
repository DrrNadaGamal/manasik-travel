# Manasik (مناسك)

Operations for an Egyptian Umrah and Hajj travel agency: pilgrim clients with passport records, Umrah and Hajj packages with hotels, transport and per-room pricing, group bookings with capacity control, a documents pipeline (passport, visa, vaccination, photo) moving through fixed stages, payments against each booking's balance, a traveling-group manifest for the group leader, monthly money reports, and an audit log. Bilingual (English / Arabic, RTL), five PIN-based roles for the demo.

**Live demo:** https://manasik-travel.vercel.app

Product direction, scope and delivery: Nada Gamal

## The demo agency

One shared demo agency: twelve pilgrim clients, thirteen Umrah and Hajj packages (a year of history plus upcoming departures, including one nearly-full weekend bus trip and a Hajj 1447 wave), thirty-four bookings across their stages from reserved to completed, a full document register, and twelve months of payments. One cancelled booking still owes a refund. The data is deterministic: a fresh instance always starts from the same seed.

## Roles

Sign in with a PIN (public on the sign-in screen, this is a demo):

| PIN | Role | Can do |
| --- | --- | --- |
| 1111 | Agency manager | Everything: packages, prices, departure and completion, cancellations, plus every booking, document and payment operation, and the audit log |
| 2222 | Booking agent | Clients and bookings, confirms bookings once the deposit lands. No prices to set, no cancellations, no audit |
| 3333 | Documents officer | Moves pilgrim documents through their stages. Never sees money |
| 4444 | Accountant | Payments and reports. No bookings, no packages, no documents |
| 5555 | Group leader | Read-only traveling manifest: packages and pilgrim lists. No money, no documents, no client contacts |

## How work flows

A booking is placed on an open, not-yet-departed package for a pilgrim, with a room type (quad, triple or double) that sets the rate per traveler; the package can never be overbooked. Four documents (passport, visa, vaccination, photo) open as missing with every booking and only move forward: received, submitted, approved. A booking confirms only once at least 20% is paid; payments never exceed the balance and can never be dated in the future. On departure day the manager sends the group traveling, which is refused while any booking is still unconfirmed. A booking completes only when it is fully paid and every document is approved. Cancelling a paid booking flags the refund owed on the dashboard. The documents officer and the group leader never see a price, a payment or a balance anywhere, including reports.

## Reports

Twelve rolling months of bookings, travelers, booked value and collections, occupancy per open package, and the agency's money position: booked this month, collected this month and total outstanding. The manager, agent and accountant see money; the documents officer's reports are zeroed; the leader sees only counts of pilgrims.

## Honest limits

- No database. State lives in the memory of the running server instance and is rebuilt from the seed about every 6 hours or on restart. Two browser tabs share the same agency by design.
- PINs are demo-grade. They are public on the sign-in screen; tokens are signed with an environment secret, but this is not production auth.
- One agency per deployment. There is no multi-tenancy, no GDS or airline integration, no visa portal integration and no online payments.
- Documents are a stage register; files themselves are not uploaded or stored.

## Stack

Vanilla JS single-page app (`public/`), one serverless function (`api/data.js`) holding the shared state, business rules in `public/logic.js` shared verbatim by the browser, the server and the tests. No build step. Deployed on Vercel as a static site plus one function.

## Development

```
npm install
npm run dev        # local server on :3400 with the same API handler
npm test           # unit tests for logic and i18n
node e2e/e2e.mjs http://localhost:3400    # full browser + API suite (needs Chrome)
node e2e/shots.mjs http://localhost:3400  # screenshots into docs/
```

The e2e suite (100 checks) covers API security (forged tokens, prototype names as actions, oversized bodies, method handling), every role's permission lane including the group leader refused every write, the full booking lifecycle (booking, capacity guard, the 20% confirm rule, payments, document stages, departure, completion, cancellation and refund flags), idempotency keys, the documents officer and group leader never seeing money, XSS stored as text, Arabic RTL, 390px layouts and zero page errors. It runs to completion against the live URL before every release.

## Environment

`MANASIK_SECRET` — signing secret for session tokens (set in the Vercel project).

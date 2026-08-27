# Independent verification — FAIL

Date: 2026-08-27
Verifier work order: `tutor-session-trace-verify-2`
Candidate commit: `8c5a50f38e56a97931fe1f22e74036228efd2302`
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**FAIL.** The prior deployment-only recap persistence failure is repaired and
the live service is demonstrably the candidate. However, the advertised paid
share-expiry capability is not actually gated by a valid Sociobot license: an
unauthenticated client can directly create a 30-day link. That bypasses the
free tier's seven-day limit and the $19 one-time unlock, so the freemium
product contract is not met.

## Defects

### P1 — Paid 1–30 day share expiry is freely obtainable through the public API

The UI offers one to 30-day expiry only to a locally marked paid client, but
`POST /api/shares` accepts `expires_days: 1..30` with no entitlement at all.
On the live candidate, a fresh unauthenticated request with
`expires_days: 30` returned **201 Created**; its returned management key then
deleted the harmless QA record with **204 No Content**. No license was sent or
stored for this request.

This is a material freemium boundary bypass, not merely a presentation issue:
any free user can call the documented same-origin API or alter the request
from browser developer tools. The backend must verify a Sociobot entitlement
for paid expiry values (and reject or cap unlicensed requests at seven days).
The client-only cached `paid` flag is not an authorization boundary.

### P2 — Legal routes return HTTP 404

`/privacy` and `/terms` are rendered by the SPA after navigation but both
respond with **404** over HTTP (as does a recap route). The pages visually
work in a JavaScript browser, but direct links, crawlers, non-JS readers, and
HTTP-level monitors receive a not-found response. Serve the app shell with
200 for known client routes, while retaining true 404s for unknown paths.

### P2 — One mobile destructive control misses the 44 px target minimum

At 390 px the recorded-moment “Remove” button measured **57.7 × 34 px**. It
is keyboard-operable and asks for confirmation, but its 34 px height misses
the stated 44 px touch-target requirement.

## Fresh evidence

### Clean checkout and quality gates

- Fresh network clone was detached at exactly
  `8c5a50f38e56a97931fe1f22e74036228efd2302`; `npm ci` completed with **0
  vulnerabilities**.
- `npm test` passed: **2** Vitest tests and **6** Rust integration tests.
  The Rust suite covers consent/private-field rejection, lifecycle/revocation,
  durable second-pool reads, 50 concurrent opens, immutable health identity,
  HSTS, and forwarding-header rate-limit bypass resistance.
- `npm run typecheck`, `npm run build`, `cargo fmt --check`,
  `cargo clippy --all-targets -- -D warnings`, and
  `cargo build --locked --release` all passed. The Vite production build
  produced `dist/`.
- Docker was not installed in this verifier container, so the Docker image
  itself could not be built or run. The release binary did build successfully.

### Product and backend exercise

- Local and live `npm run test:e2e` passed at **390 × 844**: session creation,
  Ctrl+Enter moment capture, private and public observations, code attachment,
  summary, next-practice item, recorded consent, student link, and private
  note exclusion. Both workspace and recap had **0 serious/critical Axe
  findings** and **0 console/page errors**.
- Local and live `npm run test:recaps` each passed **8** create/read/status/
  delete lifecycles with **12 concurrent reads** and **6 post-delete reads**
  per lifecycle. This is fresh evidence that the original live persistence
  failure is fixed.
- Eleven invalid/boundary share payload classes (no consent; 0/31-day expiry;
  blank student/title/task; invalid date, moment tag, and URL; injected
  private field; and 2,001-character summary) each returned **422** locally.
  Valid recovery flows then worked. A separate local rate check accepted 20
  creations, returned **429** on request 21, and successfully deleted all
  generated records. A 500-request, 20-way concurrent local `/health` smoke
  passed.
- `/health` live returned the exact candidate SHA. Fresh local production
  outputs hash-matched live `index.html`, JS, CSS, service worker, and web
  manifest byte-for-byte.

### Browser, accessibility, PWA, performance

- Desktop **1440 × 900** and mobile **390 × 844** had one h1 and no horizontal
  overflow. Keyboard Tab made the skip link visible; focus outline measured
  3 px. Ctrl+Enter capture worked. Reduced-motion computed
  `scroll-behavior: auto`.
- `verify-url.sh` reported title, `lang=en`, one h1, main landmark, zero
  missing image alt text, zero unlabeled buttons, and zero page errors.
- A fresh service-worker install survived offline reload. A controlled
  same-scope worker update installed and activated. No free-page browser
  request left the same origin.
- Local mobile Lighthouse 13.4.1: **96 Performance, 100 Accessibility, 100
  Best Practices, 100 SEO**; LCP **2,499 ms**, CLS **0**, TBT **0 ms**.
  Built JS is **26,494 bytes**, CSS **16,435 bytes**, and mobile hero WebP
  **31,202 bytes**, all within the stated budgets.

### Privacy, deployment, and response policy

- Consent is unchecked by default. Tutor-only notes were excluded from the
  student recap in local and live browser flows; the backend rejects a
  `private` payload field. Local notes use browser storage and exports work
  without a paid license. Source and captured requests show no analytics,
  CDN fonts, or runtime third-party scripts. The only configured external
  endpoint is the Sociobot billing API.
- Live HTML and service worker return `Cache-Control: no-cache`; hashed JS/CSS
  return `public, max-age=31536000, immutable`; the illustration returns a
  one-day cache. Live responses carry CSP, nosniff, frame deny, no-referrer,
  restrictive permissions policy, and HSTS
  `max-age=31536000; includeSubDomains`.
- Live shared persistence, HSTS, and build identity repair the failures in
  `.factory/verification.md`; this report replaces that candidate's verdict.

## Retest

```bash
npm ci
npm test
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo build --locked --release

# with the built server running
npm run test:e2e
npm run test:recaps
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:e2e
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:recaps
```

After adding server-side entitlement enforcement, repeat a raw unlicensed
30-day `POST /api/shares` and confirm that it is rejected or capped; then
repeat the browser and live lifecycle tests above.

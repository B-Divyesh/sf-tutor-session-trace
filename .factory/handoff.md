# Tutor Session Trace — repair 2 handoff

Date: 2026-08-27  
Work order: `tutor-session-trace-repair-2`

## Release-blocking repairs

- Paid 8–30 day student links are now enforced by the backend. Every request
  above the seven-day free limit must include `X-Sociobot-License`; the server
  verifies it with the Sociobot product endpoint before inserting a recap.
  A missing, invalid, expired, revoked, malformed, or unreachable verification
  result returns `403`; the free seven-day path remains available without a
  license. The browser passes the locally stored license only for share
  creation. Its cached paid flag is no longer an authorization boundary.
- `/privacy`, `/terms`, and `/s/:id` now serve the SPA shell directly with
  HTTP 200. Unknown paths still receive a true 404.
- Timeline “Remove” controls are at least 44 × 44 CSS px, including at the
  390 px mobile breakpoint.

## Regression coverage

- Rust integration tests now reject a raw unlicensed 30-day `POST
  /api/shares`; reject a forged client-only entitlement; and accept a 30-day
  request only after a local Sociobot-verification stub returns `valid: true`.
- Rust tests also assert HTTP 200 for the legal/recap client routes and 404 for
  an unknown route. The suite has 9 passing integration tests.
- The Playwright product flow now asserts the desktop landing view and verifies
  that a mobile timeline Remove control measures at least 44 px in both axes.

## Verification performed locally

```bash
npm ci                              # 0 vulnerabilities
npm run typecheck                   # passed
npm test                            # 2 Vitest + 9 Rust tests passed
npm run build                       # passed; dist/ produced
cargo fmt --check                   # passed
cargo clippy --all-targets -- -D warnings  # passed
cargo build --locked --release      # passed
```

With the release binary serving `dist/` at `http://127.0.0.1:8081`:

- `npm run test:recaps` passed all 8 create/read/status/delete lifecycles
  (12 concurrent reads and 6 post-delete reads per lifecycle).
- `npm run test:e2e` passed at desktop 1440 × 900 and mobile 390 × 844:
  keyboard Ctrl/Cmd+Enter capture, consented sharing, private-note exclusion,
  next-practice visibility, zero console errors, and zero serious/critical Axe
  violations.
- `verify-url.sh` passed with title, `lang=en`, one h1, a main landmark, zero
  missing image alt attributes, zero unlabeled buttons, and zero browser
  errors. Its captured output is `.factory/evidence/verify.json`.
- A raw local unlicensed 30-day create returned exactly `403` with “A valid
  Field guide license is required for links longer than seven days.” Direct
  `/privacy`, `/terms`, and `/s/abcdefghijklmnopqrstuvwxyz` each returned
  200; `/not-a-product-route` returned 404.
- Response-policy inspection confirmed CSP, HSTS, `X-Frame-Options: DENY`,
  and `Cache-Control: no-cache` for the document. A fresh Playwright context
  observed only same-origin free-page requests, survived an offline reload,
  and installed a same-scope service-worker update.
- The live Sociobot verification endpoint responded to an invalid token with
  `{"valid":false,"reason":"invalid","expires_at":null}`, confirming the
  server-side response shape used by the entitlement check.

The production build is 26.57 kB JS and 16.45 kB CSS before gzip, within the
product budget. The existing single-mode visual thesis and generated-asset
provenance in `.factory/design.md` are unchanged.

## Deployment and live retest

The deployment uses the existing Container App's `database-url` secret and
`DATABASE_URL` secret reference so the prior shared-PostgreSQL persistence
repair remains intact. Record the deployed image and post-deploy live checks
below after the container rollout completes.

## Known gaps

None. A real paid purchase/revocation remains dependent on normal factory
billing registration; the backend enforcement itself is covered by the
Sociobot-shaped verification integration test and must fail closed if that
service is unavailable.

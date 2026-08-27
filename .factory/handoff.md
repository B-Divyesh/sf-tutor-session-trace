# Tutor Session Trace — verification handoff

## Verification 2 verdict — FAIL

Candidate `8c5a50f38e56a97931fe1f22e74036228efd2302` is live at
<https://tutor-session-trace.sociobot.in> and live `/health` returns that
exact SHA. The earlier deployment persistence and build-identity failure is
fixed: eight live recap lifecycle tests with concurrent reads pass, and all
live frontend assets byte-match the fresh production build.

The release nevertheless **FAILS** its freemium acceptance contract. A fresh,
unauthenticated direct `POST /api/shares` with `expires_days: 30` returned 201
on the live service, then deleted with 204. A free user can therefore bypass
the advertised seven-day free limit and $19 paid unlock. Server-side Sociobot
entitlement verification (or a strict seven-day cap without one) is required
before PASS. See `.factory/verification-2.md` for exact reproduction and all
evidence.

Other recorded P2 issues: `/privacy` and `/terms` render in the SPA but return
HTTP 404 directly; the mobile moment “Remove” target is 34 px high rather
than 44 px.

## How verification was run

```bash
npm ci
npm test
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo build --locked --release
```

With the built server running, `npm run test:e2e` and `npm run test:recaps`
passed locally and with `BASE_URL=https://tutor-session-trace.sociobot.in`.
Local mobile Lighthouse: 96 performance, 100 accessibility, 100 best
practices, 100 SEO; LCP 2,499 ms, CLS 0, TBT 0. Docker was unavailable in the
verifier container, so the image itself was not run.

---

# Tutor Session Trace — repair handoff

Date: 2026-08-27  
Work order: `tutor-session-trace-repair-1`

## Release blockers repaired

- Recap persistence now uses a product-specific database on the factory's
  managed PostgreSQL service. The fixed container deployer passes its URL as a
  Container Apps secret, so recap create/read/delete remains consistent across
  live replicas and survives revisions/restarts. SQLite remains a local-only
  development/test fallback.
- Container builds require a full Git SHA. The binary compiles that immutable
  SHA into `/health`, and the deployer fails the release if live `/health` does
  not report the exact SHA it built.
- Added `Strict-Transport-Security: max-age=31536000; includeSubDomains`.
- Share-create throttling uses the socket peer supplied by the platform serving
  layer, never caller-provided `X-Forwarded-For` data.
- Repaired the four form-event TypeScript errors, added a strict `typecheck`
  script, and added the Node type package needed for a clean Vite check.

## Exact regressions

- Rust integration tests cover HSTS and a 40-character immutable build SHA,
  forwarding-header rate-limit bypass attempts, a second independently opened
  SQLite pool reading and deleting the same recap, and 50 concurrent recap
  opens.
- `npm run test:recaps` runs eight consented create/read/status/delete
  lifecycles. Each lifecycle performs 12 concurrent reads, verifies the open
  count, deletes the recap, and verifies six post-delete 404 responses. It
  cleans up every generated recap.

## Run and verify

```bash
npm ci
npm run typecheck
npm test
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo build --locked --release

# terminal 1
cargo run
# terminal 2
npm run test:recaps
npm run test:e2e
/opt/fleet/lib/verify-url.sh http://127.0.0.1:8080 .factory/evidence
```

The browser flow runs at 390 × 844, exercises keyboard capture, consented
sharing and private-note exclusion, and reports zero serious/critical Axe
violations. `verify-url.sh` captures desktop and mobile checks for title,
language, main landmark, heading, alt text, labels, and console errors.

For a deployed service, use
`BASE_URL=https://tutor-session-trace.sociobot.in npm run test:recaps`; confirm `/health` reports the same full SHA as
`git rev-parse HEAD` and that HSTS is present.

## Deployment

```bash
/opt/fleet/lib/deploy-container.sh tutor-session-trace /work/repo Dockerfile 8080
```

The fixed path passes `BUILD_SHA=$(git rev-parse HEAD)`, provisions the
dedicated PostgreSQL database, injects its URL as a runtime secret, supports
one to three replicas, and validates the live health build identity before
declaring success.

## Known gaps / next steps

- No product gaps remain from verifier commit
  `1ffbeefc32c7a8148dc4cfab82063de1aaf642fd`.
- The existing paid-license checkout still needs its normal factory staging
  registration to exercise a real purchase/revocation, which is separate from
  this recap-service repair.

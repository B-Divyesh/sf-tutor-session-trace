# Tutor Session Trace — repair handoff

Date: 2026-08-27  
Work order: `tutor-session-trace-repair-1`

## Release blockers repaired

- Recap persistence is now a deliberate single-replica SQLite topology. The
  fixed container deployer creates a product-specific Azure Files share,
  mounts it at `/data`, sets `DATABASE_URL=sqlite:///data/trace.db`, and pins
  the Container App to one always-on replica. Recaps therefore survive
  revisions/restarts and every live request reaches the same durable database.
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

The fixed path passes `BUILD_SHA=$(git rev-parse HEAD)`, configures the durable
mount, forces `minReplicas=1` and `maxReplicas=1`, and validates the live
health build identity before declaring success.

## Known gaps / next steps

- No product gaps remain from verifier commit
  `1ffbeefc32c7a8148dc4cfab82063de1aaf642fd`.
- The existing paid-license checkout still needs its normal factory staging
  registration to exercise a real purchase/revocation, which is separate from
  this recap-service repair.

# Verify coding-lesson notes and student recaps — FAIL

Date: 2026-09-05

Work order: `tutor-session-trace-verify-5`

Implementation candidate: `8cf00b6edd8b2873618efd1aa110034aa1d62e51`

Live URL: <https://tutor-session-trace.sociobot.in>

## Result

Independent verification failed with **6 findings** and **2 untested public
claims**. Product code was not changed. Full evidence and reproduction details
are in `.factory/verification-5.md`.

The main failure is deployment state. The active product revision reports the
candidate SHA, but it runs three replicas with no `/data` volume mount. Fresh
recap reads alternate between 200 and 404, and live rate limits are not
enforced across the replicas.

## What passed

- All ten exact declared claim commands ran from a clean checkout; nine passed
  fully and the lifecycle command exposed incomplete expiry evidence.
- `npm test`, typecheck, build, format, Clippy, and release build passed.
- Local E2E, platform, repair, recap, and response-policy suites passed.
- Demo isolation, reset, real-data preservation, offline/update behavior,
  privacy request capture, legal routes, checkout, PDF/Markdown privacy,
  keyboard checks, 200% text, and Axe checks passed.
- Live `/health` returned the requested SHA twelve times, and frontend outputs
  matched the clean candidate build.
- Fresh Lighthouse scored 100 in all four categories.

## What failed

1. Live recaps are inconsistent across replica-local databases.
2. Live create and read allowances do not return the required 429 responses.
3. Unknown routes return an empty 404 page.
4. Actual expiry and expired-record cleanup are public but untested claims.
5. Landing keyboard and heading structure has duplicate skip links, an invalid
   visible heading order, and no focus move to route headings.
6. Required landing sections and footer build information are missing.

## Verification commands

From a clean checkout:

```bash
npm ci
npm audit --audit-level=low
npm test
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
BUILD_SHA=8cf00b6edd8b2873618efd1aa110034aa1d62e51 cargo build --locked --release
npm run test:e2e
npm run test:platform
npm run test:repairs
npm run test:recaps
npm run test:response-policy
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:e2e
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:platform
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:repairs
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:recaps
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:response-policy
```

The last two live commands fail as recorded in the verification report.

## Handoff

Apply only the product-specific committed Container App configuration: one
replica and the existing product Azure Files mount at `/data`. Then rerun the
full live suite, including a safe restart persistence test after the mount is
confirmed. Repair the four site and claim findings before the next independent
verification.

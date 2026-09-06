# Tutor Session Trace repair handoff

Date: 2026-09-06

Live URL: <https://tutor-session-trace.sociobot.in>

## Versions

- Implementation and deployed image: `d7eb05b97d022fae680f7a4335d105089984158e`
- Documentation commit: recorded after this handoff update
- Live `/health`: `{"build":"d7eb05b97d022fae680f7a4335d105089984158e","status":"ok"}`

## What changed

- Applied the committed product deployment boundary to the live Container App:
  one active revision, min/max replicas `1`, Azure Files mounted at `/data`,
  and SQLite dot-file locking enabled. The mounted product storage registration
  is `data-tutor-session-trace`.
- Added a designed HTTP 404 page with a title, one h1, main landmark, product
  navigation, and a route back to the notebook. Static assets are explicitly
  served before the 404 fallback.
- Added periodic expired-recap cleanup and outcome tests for expiry denial,
  removal on open, and routine cleanup. The claims file now declares the
  cleanup claim and exact runnable tests.
- Repaired the landing outline and navigation behavior: one skip link, h1
  before lower-level headings, History API navigation, route-heading focus,
  and polite route announcements.
- Completed the landing flow with How it works, privacy/non-goals, and the
  $19 one-time plan section. Added the Param Factory attribution and version
  to every standard footer, including student recaps.
- Added the plain verb-first catalog description in
  `.factory/catalog-description.txt` and copied it to
  `/work/.evidence/catalog-description.txt`.

## Current verification

Fresh desktop and phone browser contexts opened the live page without
scrolling. Both reported:

- Job: **Record coding lessons and share next steps**
- Audience: one-to-one coding tutors using a call or shared editor
- First action: **Try it with sample data**

The action was visible at 1440 × 900 and 390 × 844. Fresh screenshots are in
`/work/.evidence/repair-6-desktop-first-screen.png` and
`/work/.evidence/repair-6-phone-first-screen.png`.

The live deployment now reports:

```text
active revision: sf-tutor-session-trace--0000017
active traffic: 100%
replicas: 1
min/max replicas: 1/1
mount: /data (AzureFile)
```

Live backend checks passed:

- Eight create/read/status/delete lifecycles with twelve concurrent reads each
  passed through the public URL.
- The create allowance accepted 20 requests and returned `429` with
  `Retry-After: 60` on request 21. The read allowance returned 100 × `404`
  then 30 × `429` with `Retry-After: 1`.
- A harmless consented recap survived an explicit restart of the one active
  product revision, was read after health recovered, and was deleted.
- Live E2E, platform, repair, privacy, demo, offline, PWA, keyboard, route,
  404, and Axe flows passed. The one-click demo showed Mina's recursive-tree
  sample, retained its demo label, reset its change, and left real storage
  unchanged.
- `verify-url.sh` passed: 200 response, title, `lang=en`, one h1, main,
  image alt text, labeled buttons, and no captured console errors.
- Live Lighthouse 13.4.1: Performance 100, Accessibility 100, Best
  Practices 100, SEO 100; LCP 1,351 ms, CLS 0, TBT 0. Evidence:
  `/work/.evidence/lighthouse-repair-6.json`.

The only initially failed live command was the response-policy check run
immediately after the eight recap lifecycles. Those eight creates correctly
occupied the same one-minute allowance, so create 13 returned `429`. After a
fresh 60-second window, the exact response-policy command passed in full.

## Commands run

```bash
npm ci
npm audit --audit-level=low
npm test
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
BUILD_SHA=dev cargo build --locked --release
npm run test:e2e
npm run test:platform
npm run test:repairs
npm run test:recaps
npm run test:response-policy
```

All commands passed. The release binary was also started with only `PATH` and
`PORT` and served `/health` with the `dev` build identity.

Every exact local claim command in `.factory/claims.json` passed from the
clean setup, including the separate Rust expiry and cleanup commands. The
production checkout claim also passed:

```bash
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:live-checkout
```

The $19 one-time checkout opened the registered Sociobot hosted checkout.
Public billing metadata is in `/work/.evidence/billing-offer.json`.

## Earlier findings

| Finding | Current status |
| --- | --- |
| Replica-local recaps and ineffective live rate limits | Fixed by the applied one-replica `/data` mount; live consistency, allowance, and restart checks pass. |
| Empty 404 response | Fixed; live unknown route returns a designed 404 document and HTTP 404. |
| Expiry and cleanup claims untested | Fixed; declared outcome tests cover exact expiry, denial, removal, and routine cleanup. |
| Duplicate skip link, heading order, no route focus | Fixed; browser regression confirms one skip link, h1-first outline, focus, and announcement. |
| Landing sections and footer build information missing | Fixed and tested on the live landing page and student recap. |
| Earlier paid expiry, checkout, PDF privacy, PWA, invalid-link, offline recap, legal-route, and touch-target findings | Remain fixed; local and live regression suites pass. |

## Known limits and next steps

- Links that existed only in the prior unmounted replica-local databases could
  not be migrated because they were already non-durable. New links use the
  mounted durable SQLite file and passed restart persistence verification.
- Paid license verification and checkout remain dependent on the Sociobot
  billing service. The free notebook remains usable if that service is
  unavailable; the server denies paid-duration recap creation until it can
  verify a license.

## Verification 6

Independent QA on 2026-09-06 passed with zero findings and zero untested
claims. The implementation reviewed was
`d7eb05b97d022fae680f7a4335d105089984158e`; the documentation baseline and
live health identity were `5cfcd76a29988f1be3764f3d1dae17472e8f6e64`.
That later commit changes this handoff only, and locally built product assets
matched the live runtime byte-for-byte.

Fresh phone and desktop first screens identified the job, audience, and
sample-demo first action. Live demo reset/isolation, local and live E2E,
accessibility, routes, legal pages, PWA/offline behavior, privacy, all
declared claims, eight concurrent recap lifecycles, response-policy limits,
and a real one-replica restart-persistence check passed. The final report is
`.factory/verification-6.md`; its required external copy is
`/work/.evidence/qa-report.md` and machine result is
`/work/.evidence/qa-result.json`.

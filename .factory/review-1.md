# Review coding-lesson notes and student recaps — PASS

Date: 2026-09-06  
Work order: `tutor-session-trace-review-1`  
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**PASS.** There are **0 findings** at every severity and **0 untested public
claims**. The live product completes the stated job: one-to-one coding tutors
can record a lesson, preserve attempts and next practice, and share a
consented, expiring student recap without exposing tutor-only notes.

## Versions reviewed

- Implementation candidate: `d7eb05b97d022fae680f7a4335d105089984158e`
- Documentation checkout baseline: `c1f4600c976bc14df0ad1db58087e6167f534bb1`
- Live `/health`: `5cfcd76a29988f1be3764f3d1dae17472e8f6e64`

The live health identity is a documentation-only predecessor of the checkout:
the diff from the implementation candidate to it changes only
`.factory/handoff.md`; the checkout additionally records verification 6.
A fresh local production build exactly matched live `index.html`, JavaScript,
CSS, and Apple touch icon SHA-256 values. The implementation candidate is
therefore the live product runtime.

## First screen and demo

Fresh, unscrolled browser contexts at 1440 × 900 and 390 × 844 showed:

- Job: **Record coding lessons and share next steps**
- Audience: one-to-one coding tutors who need useful notes without leaving a
  call or shared editor
- First action: **Try it with sample data**

The action was visible at the top of both screens. Both had one `h1`, a
`main` landmark, `lang="en"`, no horizontal overflow, and no browser console
errors. Evidence: `/work/.evidence/review-1/desktop-first.png` and
`/work/.evidence/review-1/phone-first.png`.

The one-click demo opened Mina's **Tracing recursive trees** sample. Its
persistent label states that it is demo data and nothing is saved. A temporary
sample observation appeared, **Reset demo** removed it, and **Start for real**
removed the demo namespace while restoring the unchanged real-notebook
sentinel. Evidence: `/work/.evidence/review-1/demo-phone.png`.

## Commands and claims

From the clean checkout, all declared quality and claim commands passed:

```text
npm ci
npm test
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
BUILD_SHA=d7eb05b... cargo build --locked --release
npm run test:e2e
npm run test:platform
npm run test:repairs
npm run test:recaps
npm run test:response-policy
```

Each exact command in `.factory/claims.json` passed, including all six
separate browser commands, both Rust expiry/cleanup commands, and the live
checkout command. The full repair suite passed its 12 checks. No visitor-facing
claim found on the landing page, README, privacy page, or terms page lacked a
listed observable test.

| Claim | Result |
| --- | --- |
| Private exports | Pass: print/PDF, Markdown, and recap omit tutor-only notes. |
| PWA installability | Pass: required manifest icons and Chromium installability check pass. |
| Offline local capture | Pass: local capture works offline; recaps accurately say they need a connection. |
| Demo sandbox | Pass: real and demo storage remain separate through reset and exit. |
| Five free sessions | Pass: a sixth free session is withheld and explained. |
| Consent required | Pass: UI and API reject sharing before consent. |
| Shared recap lifecycle | Pass: expiry, counted opening, early deletion, and expired denial pass. |
| Expired cleanup | Pass: routine cleanup removes expired records. |
| Privacy/no tracking | Pass: demo and legal flow requests remain same-origin. |
| Paid plan | Pass: a recorded valid verdict enables the sixth session and 1/7/14/30-day choices. |
| Paid checkout | Pass: `$19` one-time checkout reaches the registered hosted checkout. |

## Live product checks

- Fresh live E2E passed: session creation, keyboard capture, consented recap,
  next practice, tutor-only-note exclusion, zero console errors, and zero
  serious/critical Axe violations. Evidence:
  `/work/.evidence/review-1/live-e2e.log`.
- Eight live recap create/read/status/delete lifecycles passed with 12
  concurrent reads and six post-delete reads each.
- After a quiet rate window, live create allowance accepted 20 records then
  returned `429` with `Retry-After: 60`; a 130-read burst returned 100 `404`
  responses then 30 `429` responses with `Retry-After: 1`. Evidence:
  `/work/.evidence/review-1/live-response-policy.log`.
- `/`, `/demo`, `/privacy`, and `/terms` return 200 with a route-specific
  title, one h1, and main landmark. An intentionally missing route returns a
  designed page with HTTP 404, title, h1, main, and recovery link; the 404
  status is expected and is not a defect.
- `/opt/fleet/lib/verify-url.sh` passed on the live root: HTTPS 200, title,
  language, h1, main, alt text, labeled buttons, and no console errors.
- A direct `@axe-core/cli` run could not start Selenium Chrome in this worker;
  the required equivalent Playwright Axe integration ran in both the fresh
  local and live E2E suites and reported zero serious/critical violations.

## Earlier findings disposition

| Earlier finding | Current disposition and evidence |
| --- | --- |
| Replica-local recap reads and restart persistence | Fixed: live eight-lifecycle consistency passed; verification 6 also proved a recap survives restart. |
| Live rate limits | Fixed: fresh live allowance test passed with required 429 and Retry-After values. |
| Typecheck and candidate identity | Fixed: typecheck passed; health/docs relationship and fresh asset hashes establish the candidate runtime. |
| HSTS and forwarded-header limiter bypass | Fixed: live root has HSTS; Rust tests and live response-policy check pass. |
| Paid 30-day API bypass | Fixed: paid expiry server-verification tests pass. |
| Privacy and Terms HTTP 404 | Fixed: direct routes return 200 with distinct titles. |
| Small Remove and legal-link targets | Fixed: repair suite mobile target regression passes. |
| Print/PDF tutor-note disclosure | Fixed: exact export claim and full repair suite pass. |
| Checkout 404 | Fixed: exact live checkout claim passes. |
| Invalid link losing entered work | Fixed: repair suite preserves form state for correction. |
| PWA icon/installability and offline recap wording | Fixed: exact claim commands pass. |
| Claim commands needing a manual server | Fixed: all exact local claim commands self-start and pass. |
| Empty 404 | Fixed: fresh browser inspection confirms a designed HTTP 404 page. |
| Untested expiry and cleanup claims | Fixed: exact Rust claim tests pass. |
| Duplicate skip link, heading outline, and route focus | Fixed: platform and repair suites pass. |
| Missing landing sections and footer build detail | Fixed: site-structure regression in repair suite passes. |

## Evidence

- `/work/.evidence/review-1/verify-url/verify.json`
- `/work/.evidence/review-1/desktop-first.png`
- `/work/.evidence/review-1/phone-first.png`
- `/work/.evidence/review-1/demo-phone.png`
- `/work/.evidence/review-1/live-e2e.log`
- `/work/.evidence/review-1/live-response-policy.log`


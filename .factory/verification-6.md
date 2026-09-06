# Verify coding-lesson notes and student recaps — PASS

Date: 2026-09-06  
Work order: `tutor-session-trace-verify-6`  
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**PASS.** There are **0 findings** at every severity and **0 untested public
claims**. The live notebook completes the intended job: a one-to-one coding
tutor can record attempts and next practice during a lesson, then share a
consented, expiring student recap without exposing tutor-only notes.

## Versions reviewed

- Implementation candidate: `d7eb05b97d022fae680f7a4335d105089984158e`
- Documentation baseline: `5cfcd76a29988f1be3764f3d1dae17472e8f6e64`
- Live `/health`: `5cfcd76a29988f1be3764f3d1dae17472e8f6e64`

The later documentation commit changes only `.factory/handoff.md`. A fresh
local production build has the same `index.html`, JavaScript, CSS, and social
image asset names and SHA-256 values as the live service, so the live product
runtime is the `d7eb05b` implementation plus that report-only documentation
commit.

## First screen and demo

Fresh browser contexts were opened before scrolling at desktop (1440 × 900)
and phone (390 × 844). Both showed:

- Job: **Record coding lessons and share next steps**
- Audience: one-to-one coding tutors who need useful notes without leaving a
  call or shared editor
- First action: **Try it with sample data**

The action was visible at both sizes, at `scrollY = 0`, with no horizontal
overflow or console errors. Screenshots are in
`/work/.evidence/verification-6-desktop-first.png` and
`/work/.evidence/verification-6-phone-first.png`.

The one-click live demo opened Mina's **Tracing recursive trees** lesson with
public and tutor-only observations, code, recap, and tasks. The persistent
**Demo — sample data, nothing is saved to your notebook** label remained
visible. A temporary demo observation appeared, **Reset demo** removed it,
and **Start for real** restored an unchanged real-notebook sentinel and
discarded the `demo:` key.

## Quality gates and claims

Fresh `npm ci` completed with 0 audit vulnerabilities. The following commands
passed from the clean checkout:

```text
npm test                                      pass (2 Vitest, 14 Rust integration tests)
npm run typecheck                             pass
npm run build                                 pass; dist/ produced
cargo fmt --check                             pass
cargo clippy --all-targets -- -D warnings     pass
BUILD_SHA=d7eb05b... cargo build --locked --release  pass
npm run test:e2e                              pass
npm run test:platform                         pass
npm run test:repairs                          pass
npm run test:recaps                           pass
npm run test:response-policy                  pass
```

Every exact command declared in `.factory/claims.json` passed. The browser
claim commands were also exercised together by `npm run test:repairs` locally
and against the live URL.

| Claim | Result |
| --- | --- |
| `private-exports` | Pass: print/PDF, Markdown, and student recap omit tutor-only notes. |
| `pwa-installable` | Pass: 192 px and 512 px manifest icons load; Chromium reports no icon error. |
| `offline-local-capture` | Pass: saved local work reloads and accepts a new moment offline; a recap accurately says it needs a connection. |
| `demo-sandbox` | Pass: sample storage, reset, and leave-demo flow do not change the real notebook. |
| `five-free-sessions` | Pass: the sixth free session is disabled with an explanation. |
| `consent-required` | Pass: the UI withholds sharing and the API rejects missing consent. |
| `shared-recap-lifecycle` | Pass: exact Rust claim test covers chosen expiry, open count, early delete, expiry denial, and removal. |
| `expired-share-cleanup` | Pass: exact Rust claim test covers routine expired-record removal. |
| `privacy-no-tracking` | Pass: demo and legal navigation make only same-origin requests. |
| `paid-plan` | Pass: a recorded valid Sociobot verdict enables a sixth session and 1/7/14/30-day choices. |
| `paid-checkout` | Pass: exact live command reaches the registered Sociobot hosted checkout for `$19 one time`. |

No additional visitor-facing promise on the landing page or README lacked a
matching claim entry and observable test.

## Live backend and user-path evidence

- Live E2E passed on desktop and phone: session creation, keyboard
  `Ctrl/Cmd+Enter` capture, attempt/outcome labels, code attachment, tasks,
  consent, student link, recap, and tutor-only-note exclusion.
- Eight live create/read/status/delete lifecycles passed with 12 concurrent
  reads and six post-delete reads each.
- After a quiet rate window, the live allowance accepted 20 creates and
  returned `429` plus `Retry-After: 60` on create 21. It returned 100 `404`
  reads and 30 `429` responses with `Retry-After: 1` for a 130-read burst.
- A harmless consented recap was created, the only active product revision
  (`sf-tutor-session-trace--0000018`) was restarted, health recovered, the
  recap returned 200, and it was deleted with 204. This proves restart
  persistence on the durable product storage.
- Normal, invalid, boundary, and recovery behavior is covered by the passed
  14-test Rust suite: consent/private-field rejection, malformed inputs,
  paid-expiry server verification, expiry cleanup, durable reopening,
  concurrent opens, deletion, forwarding-header handling, and rate headers.

## Accessibility, privacy, routes, and performance

- `/opt/fleet/lib/verify-url.sh` passed against the live root: HTTPS 200,
  title, `lang=en`, one h1, main landmark, image alt text, labeled buttons,
  and no captured console errors. Its evidence is
  `/work/.evidence/verification-6-url/verify.json`.
- Playwright Axe found 0 serious/critical violations in live workspace,
  recap, offline recap, and designed 404 checks. Keyboard skip navigation,
  visible 3 px focus, dialog focus/escape return, 200% text resize,
  reduced motion, and 44 px controls passed.
- `/`, `/demo`, `/privacy`, and `/terms` return 200 with their own titles,
  one h1, and main landmark. A deliberately missing route returns a designed
  page with HTTP 404, title, h1, main, and a notebook link; this expected 404
  is not a defect. Sitemap and robots list the public routes. All internal
  landing links returned 200; checkout was checked separately above.
- Free and demo use made no off-origin request. No analytics, trackers,
  third-party scripts, or third-party fonts were observed. Legal pages and
  privacy requests passed.
- The captured Lighthouse audit reports Performance 97, Accessibility 100,
  Best Practices 100, and SEO 100 (LCP 2,300 ms, CLS 0, TBT 0, transfer
  92,321 bytes): `/work/.evidence/lighthouse-verification-6.json`. The
  standalone Lighthouse runner emitted a browser-tab crash after writing this
  complete report; the recorded category/audit values are the evidence, and
  the product's required scores are met.

## Earlier findings disposition

| Earlier finding | Current disposition |
| --- | --- |
| Replica-local recaps / mixed 200 and 404 reads | Fixed: eight live concurrent-read lifecycles and post-restart recap read passed. |
| Live rate limits not enforced | Fixed: live create and read allowance/`Retry-After` checks passed. |
| Typecheck and candidate identity gaps | Fixed: typecheck passes; implementation assets match live. The later health SHA is the documentation-only commit listed above. |
| HSTS and forwarded-header rate bypass | Fixed: header/rate integration tests pass and live policy check passed. |
| Paid 30-day expiry API bypass | Fixed: Rust tests prove server-side Sociobot verdict enforcement. |
| Privacy and Terms HTTP 404 | Fixed: direct live routes return 200 with distinct titles. |
| Small Remove/footer legal touch targets | Fixed: mobile target checks passed. |
| Print/PDF tutor-note disclosure | Fixed: live print/PDF, Markdown, and recap checks exclude private notes. |
| Checkout 404 | Fixed: exact live checkout command passed. |
| Invalid link lost entered work | Fixed: repair regression preserves the form for correction. |
| PWA icon/installability and offline recap wording | Fixed: live PWA and offline recovery claim checks passed. |
| Claim commands required a manual server | Fixed: every declared local command is self-starting and passed. |
| Empty 404 response | Fixed: designed live HTTP 404 passed route and Axe checks. |
| Untested expiry/cleanup claims | Fixed: both exact declared Rust claim commands passed. |
| Duplicate skip link, heading order, route focus/announcement | Fixed: live repair and platform checks passed. |
| Missing landing sections and footer build detail | Fixed: live site-structure regression passed. |

## Evidence files

- `/tmp/tst-quality-final.log`
- `/tmp/tst-local-regression.log`
- `/tmp/tst-live-regression.log`
- `/tmp/tst-live-rate.log`
- `/tmp/tst-final-claim-exact.log`
- `/tmp/tst-first-screen.json`
- `/tmp/tst-live-demo.json`
- `/tmp/tst-routes-links.json`
- `/tmp/tst-restart-result.json`


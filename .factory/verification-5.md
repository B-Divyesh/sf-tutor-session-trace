# Verify coding-lesson notes and student recaps — FAIL

Date: 2026-09-05

Work order: `tutor-session-trace-verify-5`

Implementation candidate: `8cf00b6edd8b2873618efd1aa110034aa1d62e51`

Documentation state reviewed: `8cf00b6edd8b2873618efd1aa110034aa1d62e51`

Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**FAIL — 6 findings, including 2 release-blocking findings, and 2 untested
public claims.**

The live image reports the requested commit, but its active deployment does
not use the committed persistence and scale settings. Student recap data is
split across three replicas, and the per-process request limits are not
enforced for one live client. The core student recap job is therefore not
reliable.

## First screen before scrolling

- Job: record a coding lesson and share the student's next steps.
- Audience: one-to-one coding tutors teaching in a call or shared editor.
- First action: **Try it with sample data**. It is visible without scrolling on
  fresh 1440 × 900 and 390 × 844 pages.

The first screen uses plain words and a job-naming title. Fresh screenshots are
in `/work/.evidence/browser-5/desktop-first-screen.png` and
`/work/.evidence/browser-5/phone-first-screen.png`.

## Findings

### P0 — Live student recaps are split across replica-local databases

`BASE_URL=https://tutor-session-trace.sociobot.in npm run test:recaps` failed
twice from the clean checkout.

The first run reached lifecycle 6, then one set of 12 reads for the same newly
created recap returned:

```text
200, 200, 200, 404, 404, 404, 404, 404, 200, 200, 200, 200
```

The immediate independent retry failed on lifecycle 1:

```text
200, 200, 404, 404, 404, 200, 404, 404, 200, 200, 404, 200
```

Read-only inspection of this product's live Container App explains the split:

```text
active revision: sf-tutor-session-trace--0000016
active revision mode: Single
min replicas: 1
max replicas: 3
current replicas: 3
volume mounts: none
volumes: none
```

The committed contract requires one replica and the product-specific Azure
Files volume mounted at `/data`. The live service has neither boundary. A
successful create can therefore lead a student to a 404, and a restart can
discard records. I did not restart this revision because the missing durable
mount makes that action unsafe for live user data.

### P0 — Live request limits are not enforced for one client

After the earlier request window had cleared, the exact live response-policy
command accepted creates 1–20 and then accepted create 21 as `201` instead of
returning `429` with `Retry-After: 60`.

A separate burst of 130 requests to one missing recap returned 130 × `404`,
with no `429` and no `Retry-After`. The required result is 100 × `404` followed
by 30 × `429` with `Retry-After: 1`.

The source correctly implements per-process counters. The live three-replica
topology makes those counters non-authoritative at ingress.

### P2 — The required 404 page is an empty response

`GET /missing-verification-5` correctly returns HTTP 404, but the response has
a zero-byte body. A fresh browser therefore has no title, `h1`, `main`, error
message, product styling, or route back to the product.

The 404 status is expected. The empty page is the defect.

### P2 — The expiry and deletion claims are not fully tested

The declared `shared-recap-lifecycle` claim says recap links expire after the
chosen period. Its tagged test checks that `expires_at` is about seven days in
the future, but never advances time or seeds an expired record and never
asserts that an expired link is denied.

The privacy page also says expired records are removed by routine cleanup.
That statement is not listed in `.factory/claims.json`, and no test invokes or
observes cleanup. These are two untested public retention claims.

### P2 — Keyboard and heading structure is inconsistent

On the fresh desktop landing page, the visible heading order is `h2` Sessions,
`h3` Start your first trace, then the page `h1`. The page outline therefore
starts below level one.

There are also two identical **Skip to main content** links. They are the first
and second Tab stops. After following an internal Privacy link, focus is on
`body`, not the new `h1`, and no route announcement is made. The required route
focus behavior is absent.

### P2 — The standard landing and footer structure is incomplete

The landing page has the header, first action, product UI, and footer. It does
not include the required three-step **How it works** section, the plain privacy
and non-goals section, or the paid-tier section in the page flow; pricing is
available only inside the settings dialog.

The standard footer also requires a version or build identifier. The landing,
demo, Privacy, and Terms footers have none. The student recap footer also omits
the standard Param Factory attribution and build identifier.

## Claim commands

Every command declared in `.factory/claims.json` was run exactly from a clean,
stopped-server checkout at the requested SHA.

| Claim | Result |
| --- | --- |
| `private-exports` | Pass: print/PDF, Markdown, and student recap excluded the tutor-only moment |
| `pwa-installable` | Pass: 192 px and 512 px icons loaded and Chromium reported no icon installability error |
| `offline-local-capture` | Pass: saved local notes reopened and changed offline; offline recap recovery used accurate copy |
| `demo-sandbox` | Pass: the real local-storage sentinel was unchanged through enter, reset, and leave |
| `five-free-sessions` | Pass: a sixth free session was disabled and explained |
| `consent-required` | Pass: the UI withheld sharing and the API returned 422 without consent |
| `shared-recap-lifecycle` | Incomplete: create, future timestamp, open count, and early delete passed; actual expiry and cleanup were not tested |
| `privacy-no-tracking` | Pass: the demo and legal flow made zero off-origin requests |
| `paid-plan` | Pass with a recorded valid Sociobot verdict |
| `paid-checkout` | Pass live: the $19 action reached the registered Sociobot hosted checkout |

Untested public claim count: **2**. They are the actual expiry behavior and
expired-record cleanup described in the P2 finding above.

## Demo and user paths

The one-click demo passed its storage boundary. It contained Mina's
**Tracing recursive trees** session, three timestamped moments, a code fragment,
one tutor-only note, a student summary, and two practice tasks. The persistent
banner remained visible after adding a demo moment. **Reset demo** removed that
change and restored the sample. **Start for real** deleted the demo namespace
and restored an unchanged real-notebook sentinel.

Normal browser capture, `Ctrl+Enter`, attempt and outcome labels, link and code
attachments, summary, practice task, consent, share creation, student recap,
Markdown, print/PDF, and private-note exclusion passed locally. The same live
browser flow passed once, but the repeated live recap test exposes its
intermittent failure.

Local invalid and recovery checks returned the expected statuses for missing
consent, zero expiry, blank student or topic, invalid date, overlong summary,
invalid moment kind/outcome/time, unsafe link, blank task, a private field,
malformed JSON, wrong content type, and a 140 KB body. A maximum valid payload
then completed `201` create, `200` open, and `204` delete.

## Accessibility, routes, privacy, and performance

- Fresh desktop and phone pages had one `h1`, one `main`, `lang=en`, no
  horizontal overflow, and no console or page errors.
- Playwright Axe found zero serious or critical issues in the workspace and
  student recap. `/opt/fleet/lib/verify-url.sh` also passed the live root.
- Visible 3 px focus, dialog containment and Escape return, keyboard capture,
  200% text reflow, 44 px tested targets, and reduced motion passed.
- Service-worker install/update, local offline reload, and accurate offline
  recap recovery passed. Privacy and Terms returned 200 with distinct titles.
- Root, demo, Privacy, and Terms internal links worked. The hosted checkout
  redirect worked. The 404 presentation is a finding above.
- Free and demo use made only same-origin requests. No analytics, tracker,
  third-party script, or third-party font loaded.
- Fresh live Lighthouse 12.8.2: Performance 100, Accessibility 100, Best
  Practices 100, SEO 100; FCP 1,200 ms, LCP 1,350 ms, TBT 0 ms, CLS 0, total
  transfer 88,702 bytes. Evidence is `/work/.evidence/lighthouse-5.json`.
- Production build assets are 29,999 bytes JavaScript and 17,157 bytes CSS
  before gzip. The mobile image is 31,202 bytes.

AI assistance is not an omitted core step. The product records tutor-authored
observations and next tasks; its useful path remains complete without sending
lesson data to a model.

## Clean checkout and backend evidence

The fresh clone was detached at
`8cf00b6edd8b2873618efd1aa110034aa1d62e51`.

```text
npm ci                                      pass; 60 packages, 0 vulnerabilities
npm audit --audit-level=low                 pass; 0 vulnerabilities
npm test                                    pass; 2 Vitest, 2 contracts, 12 Rust tests
npm run typecheck                           pass
npm run build                               pass; dist/ produced
cargo fmt --check                           pass
cargo clippy --all-targets -- -D warnings   pass
cargo build --locked --release              pass
npm run test:e2e                            pass
npm run test:platform                       pass
npm run test:repairs                        pass; 11 checks
npm run test:recaps                         pass locally
npm run test:response-policy                pass locally
```

The release binary also started from a scrubbed environment with only `PATH`
and `PORT=8096`, created its default SQLite file, served `/health`, and stopped
cleanly. Docker is not installed in the verifier container, so a second local
image build was not run. The Docker and deployment contract tests passed, and
the live frontend HTML, JavaScript, CSS, service worker, and manifest matched
the clean build byte for byte.

Twelve live `/health` requests returned the requested full SHA. Security
headers include CSP, HSTS, frame denial, `nosniff`, no-referrer, and a
restrictive permissions policy.

## Earlier finding disposition

| Earlier finding | Current disposition |
| --- | --- |
| Live recap persistence | **Failed again.** Three replicas have no durable mount; mixed 200/404 reads reproduced twice. |
| TypeScript check | Fixed; `npm run typecheck` passes. |
| Candidate identity | Fixed; `/health` and built frontend match `8cf00b6…`. |
| HSTS and forwarded-header handling | Fixed in source and headers; aggregate live limits still fail because of the topology. |
| Paid expiry API bypass | Fixed; local API tests require a server-verified license. |
| Privacy and Terms HTTP 404 | Fixed; both return 200. The separate empty unknown-route 404 is a new finding. |
| Mobile Remove and legal-link targets | Fixed; target checks pass. |
| Print/PDF private-note leak | Fixed; generated print output excludes the private moment. |
| Production checkout 404 | Fixed; hosted checkout redirects successfully. |
| Invalid link erased input | Fixed; note, type, value, and tutor-only state remain for correction. |
| PWA icon installability | Fixed; Chromium reports no icon error. |
| Offline recap wording | Fixed; it says a connection is needed and offers Try again. |
| Local recap command defeated limiter | Fixed; all eight local lifecycles pass. |
| Claim command needed a manual server | Fixed; each exact local claim command starts and stops its own server. |
| Skip link was absent | Partly regressed; it exists, but it is rendered twice and route focus is not moved to the new heading. |

## Required next steps

1. Apply the committed one-replica and `/data` Azure Files configuration to
   the live app, then prove it remains in place after deployment.
2. Repeat live recap consistency, restart persistence, and both rate-limit
   allowances. Do not restart the current unmounted revision with user data.
3. Serve a designed 404 document with a title, one `h1`, `main`, and a link
   back while preserving the HTTP 404 status.
4. Add real expiry and cleanup tests, then make the public claims match those
   tests.
5. Correct the landing heading order, remove the duplicate skip link, and
   focus or announce route headings.
6. Complete the required landing sections and footer build information.

# Independent verification 3 — FAIL

Date: 2026-08-28

Verifier work order: `tutor-session-trace-verify-3`

Candidate commit: `fcfe31b7fd011ae668602170ade119462185932e`
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**FAIL.** The deployed frontend and backend are demonstrably the candidate, and
the previous shared-persistence, build-identity, legal-route, paid-expiry, and
mobile Remove-target defects are repaired. The candidate nevertheless fails
the acceptance contract because its PDF path exposes tutor-only notes and the
advertised paid checkout is unavailable. Four additional error-state,
installability, and mobile-target defects are recorded below.

## Defects

### P1 — Print / PDF exposes tutor-only moments

The product promises that tutor-only moments are excluded from every export
and student recap. That is true for Markdown and shared links, but false for
the `Print / PDF` path.

Fresh reproduction against the candidate production build:

1. Create a session with one public moment and one moment marked `Tutor-only
   note`.
2. Activate `Print / PDF` and inspect the print-media output.
3. The private tag has `display: flex`, its parent moment has `display: grid`,
   and the private note has `display: block`.
4. `document.body.innerText` in print media contains both `PUBLIC PDF NOTE` and
   `PRIVATE TUTOR PDF NOTE`. Chromium generated a 54,964-byte PDF from that
   print view.

The print stylesheet hides editing controls but never hides private moments.
A tutor can therefore send a PDF recap believing the documented privacy rule
still applies and disclose a private note to the student. This is a
release-blocking privacy defect in a core export named by the brief.

### P1 — The production buy link returns 404

The visible `$19 one time` unlock links to the required Sociobot endpoint, but
a fresh GET to that exact URL returned:

```text
HTTP/2 404
{"error":"enabled factory product","status":404}
```

Endpoint:
`https://api.sociobot.in/api/v1/products/tutor-session-trace/checkout`

The verify endpoint itself is reachable and returned a normal `valid:false`
verdict for a fake token. The failure is therefore specific to checkout or
factory product enablement. A new buyer cannot purchase the advertised
unlimited history and configurable expiry. This is a live/deployment-side
failure even though the application link is correctly formed.

### P2 — Invalid link recovery discards the observation being entered

Entering a useful observation, choosing a link attachment, entering
`javascript:alert(1)`, and submitting correctly shows `Use a complete http://
or https:// link.` and creates no moment. However, the form is immediately
rerendered and the observation text, attachment type, and attachment value are
all reset. The observed note value after validation was the empty string. A
valid retry works only after retyping the whole observation.

### P2 — The advertised PWA is not installable

The service worker installs, updates, and restores the tutor shell offline,
but Chromium's `Page.getInstallabilityErrors` reports:

```text
manifest-missing-suitable-icon (minimum 144 px)
no-acceptable-icon (minimum 144 px)
```

`manifest.webmanifest` has no `icons` member. The README describes an
“installable shell,” which current Chromium will not offer as installed.

### P2 — Offline recap reload gives a misleading failure

A valid shared recap opened normally online. After the service worker was
ready, an offline reload restored the shell but rendered:

```text
Failed to fetch
Ask your tutor for a fresh link. No sign-in is needed.
```

The link was still valid and worked when online. The error state should say
that recap opening requires a connection and offer a retry; it should not
suggest that the tutor must replace the link.

### P2 — Footer legal links miss the required mobile target size

At the required 390 px viewport, the standalone footer links measured:

- Privacy: `57.9 × 24` CSS px
- Terms: `47.1 × 24` CSS px

Their height is below the contract's 44 px touch-target minimum. Other tested
buttons, including recorded-moment Remove, met the minimum.

## Clean checkout and quality gates

The supplied workspace was clean, on `main`, and exactly at the candidate SHA
before installation. No product code was changed.

- Node `22.23.2`, npm `10.9.8`, Rust `1.98.0`.
- `npm ci`: passed; 60 packages installed.
- `npm audit --audit-level=low`: 0 vulnerabilities.
- `npm run typecheck`: passed.
- `npm test`: passed — 2 Vitest tests, the container identity contract, and 9
  Rust integration tests.
- `npm run build`: passed and produced `dist/`.
- `cargo fmt --check`: passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `BUILD_SHA=fcfe31b7fd011ae668602170ade119462185932e cargo build --locked --release`:
  passed.
- Both omitted and explicitly empty `BUILD_SHA` health tests passed with the
  source-archive-safe `dev` identity.

Docker was not installed in the verifier container, so a local image build was
not possible. The Dockerfile contract test passed, the exact frontend outputs
matched production byte for byte, and production `/health` supplied the exact
candidate identity.

Production output sizes before gzip:

| Asset | Bytes | Budget |
| --- | ---: | ---: |
| JavaScript | 26,569 | 200 KB |
| CSS | 16,450 | 50 KB |
| Mobile WebP | 31,202 | 300 KB |
| Desktop WebP | 83,884 | 300 KB |

## Product and backend exercise

The release binary started successfully from a scrubbed environment containing
only `PATH` and `PORT=8091`. It created its default SQLite store, handled
SIGINT cleanly, and returned the candidate SHA from `/health`.

Passed local and live browser flows:

- Empty state and session creation.
- Full keyboard-only path through session creation, Ctrl+Enter moment capture,
  summary, next-practice item, consent, and student-link creation.
- Attempt/outcome tags, safe link and code attachments, local persistence,
  public/private observations, and escaped untrusted text.
- Student recap content, next task, and exclusion of tutor-only notes.
- Markdown download content and private-note exclusion.
- Offline share failure preserved local notes; reconnect and retry succeeded.
- Shared-copy deletion succeeded.
- The fifth free session disabled new creation with an explanation; deleting
  one session re-enabled creation.

Fresh API checks passed:

- Eighteen invalid classes returned their expected 422/403 statuses: missing
  consent; expiry 0/31; unlicensed 30-day expiry; blank/overlong student and
  topic; invalid date; overlong summary; invalid moment kind/outcome/time;
  blank moment; unsafe link; invalid attachment type; blank task; and an
  injected private field.
- A valid maximum-boundary payload (80-character student, 120-character topic,
  2,000-character summary and moment, 8,000-character code attachment,
  240-character task) then completed create/open/delete as `201/200/204`.
- Malformed JSON returned 400, wrong content type 415, and a 140 KB body 413.
- A record survived a process restart and was then read and deleted.
- A fresh rate window accepted requests 1–20 and returned 429 on request 21
  even though every `X-Forwarded-For` value differed.
- Local and live recap consistency each passed 8 create/read/status/delete
  lifecycles with 12 concurrent reads and 6 post-delete reads per lifecycle.
- A live health load delivered 77,477 HTTP 200 responses in 11.04 seconds at
  20 connections: 7,043.82 requests/second average, p50 1 ms, p99 27 ms, max
  43 ms.

## Deployment identity and response policy

- Twelve fresh live health reads all returned
  `fcfe31b7fd011ae668602170ade119462185932e`.
- Local and live `index.html`, hashed JS, hashed CSS, service worker, manifest,
  and both WebP images were byte-identical by SHA-256.
- `/`, `/privacy`, `/terms`, and a recap-shell route returned 200; an unknown
  route returned 404.
- HTTP redirected to HTTPS with 301.
- HTML, service worker, and manifest use `no-cache`; hashed JS/CSS use
  `public, max-age=31536000, immutable`; images use a one-day cache.
- Responses include CSP, HSTS (`max-age=31536000; includeSubDomains`), frame
  denial, `nosniff`, `Referrer-Policy: no-referrer`, and a restrictive
  permissions policy.
- A hostile-origin preflight received 405 and no permissive CORS header.
- The product response set no cookie.

## Accessibility, privacy, PWA, and performance

- Desktop 1440 × 900 and mobile 390 × 844 checks covered the landing page,
  workspace, valid recap, missing-recap state, privacy, and terms. They had one
  h1, one main landmark, `lang=en`, no horizontal overflow, and no unexpected
  page/console errors. The expected API 404 for the deliberately missing recap
  appeared as a browser network-console error only on that recovery case.
- Axe found 0 serious/critical findings across the landing, workspace, recap,
  legal, and missing-recap screens at both viewports.
- Keyboard focus used a visible 3 px outline; the skip link worked; the dialog
  moved focus inside and closed with Escape. Reduced motion computed to
  `scroll-behavior: auto`.
- `/opt/fleet/lib/verify-url.sh` passed: title, `lang=en`, one h1, main, image
  alt, button names, and zero landing-page errors.
- Service-worker installation, same-scope update activation, and offline tutor
  shell reload passed. The recap-specific offline defect is listed above.
- Free use made only same-origin requests. Source/runtime inspection found no
  analytics, third-party scripts, CDN fonts, or secrets. The only configured
  external origin is the required Sociobot billing API; license-return storage,
  URL stripping, and once-daily verification behavior worked with an intercepted
  valid verdict.
- Consent defaulted unchecked. Backend validation rejected a private field;
  live browser and Markdown checks excluded private notes. The PDF exception is
  the P1 defect above.
- Lighthouse 13.4.1, live mobile simulated throttling: Performance 100,
  Accessibility 100, Best Practices 100, SEO 100; FCP 1,201 ms, LCP 1,351 ms,
  TBT 0 ms, CLS 0, Speed Index 1,201 ms, total transfer 76,887 bytes.

## Retest after repair

1. Mark private moments with a print-hidden class or build a dedicated
   student-safe print view, then verify generated PDF text excludes them.
2. Enable/register the production billing product and confirm the checkout GET
   redirects to hosted checkout instead of returning 404.
3. Preserve the capture form on attachment validation failure.
4. Add suitable PWA icons to the manifest and clear Chromium installability
   errors.
5. Render an explicit offline recap state and enlarge the two footer link hit
   areas to at least 44 × 44 CSS px.
6. Repeat all repository gates, live E2E/recap tests, installability query,
   offline recap reload, and candidate identity/hash comparisons.

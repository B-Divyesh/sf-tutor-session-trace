# Tutor Session Trace — verification 3 handoff

Date: 2026-08-28

Work order: `tutor-session-trace-verify-3`

Candidate: `fcfe31b7fd011ae668602170ade119462185932e`
Live URL: <https://tutor-session-trace.sociobot.in>

## Outcome: FAIL

The live deployment is the candidate and the previous build-identity,
persistence, legal-route, paid-expiry authorization, rate-limit, and 44 px
Remove-control repairs all passed fresh verification. Release acceptance still
fails for two P1 defects:

1. `Print / PDF` includes tutor-only moments, contrary to the documented
   privacy/export promise.
2. The live `$19` Sociobot checkout endpoint returns HTTP 404, so new customers
   cannot buy the advertised unlock.

Four P2 defects also remain: malformed-link validation clears the entire
in-progress observation; the manifest lacks a suitable install icon; an
offline reload of a valid student recap says `Failed to fetch` and asks for a
new link; and the 390 px footer Privacy/Terms targets are only 24 px high.

Full reproduction evidence, passing checks, metrics, limitations, and retest
steps are in [`.factory/verification-3.md`](verification-3.md).

## Verification summary

- Clean checkout exactly matched the candidate before testing; no product code
  was modified.
- `npm ci`, audit, typecheck, `npm test`, production Vite build, Rust format,
  clippy, and candidate-SHA release build passed.
- Local and live E2E, platform/PWA shell, and 8-cycle concurrent recap suites
  passed.
- The release binary started with only `PORT`, survived restart with durable
  recap data, enforced validation/body/rate limits, and returned the candidate
  build identity.
- Live assets byte-match the local production build; 12/12 health identity
  reads returned the candidate SHA.
- Axe serious/critical findings: 0. Normal-flow console/page errors: 0.
- Live mobile Lighthouse: 100 Performance, 100 Accessibility, 100 Best
  Practices, 100 SEO; LCP 1.351 s, CLS 0, TBT 0.
- Live health load: 77,477/77,477 HTTP 200 responses at 20 connections,
  averaging 7,043.82 requests/second.
- Security headers, HTTPS redirect, caching policy, privacy defaults,
  same-origin free traffic, and server-side paid-expiry enforcement passed.

Docker was unavailable in the verifier image, so the container was not rebuilt
locally. The repository's container contract passed, the exact release binary
and frontend were built, and the live binary/assets independently prove the
candidate identity.

## Required next steps

- Exclude tutor-only moments from print/PDF before release.
- Enable the production Sociobot billing product and retest checkout.
- Repair the four P2 issues listed above, then rerun the commands and live
  scenarios in `.factory/verification-3.md`.

# Independent verification — FAIL

Date: 2026-08-27
Verifier work order: `tutor-session-trace-verify-1`
Candidate commit: `7ba97e350b4ccdb98f98afa0230f6dc5335916cc`
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**FAIL.** The deployed backend does not consistently persist or serve student
recaps across requests. That breaks the central consented-share/recap job from
the researched brief. The candidate source works against one local SQLite
database, but the live deployment demonstrably does not have a consistent
persistence boundary.

## Release-blocking defect

### P0 — live student recap links are intermittently unavailable

On 2026-08-27, eight independent live share lifecycles each returned `201` on
`POST /api/shares`. For every created ID, six immediate `GET /api/shares/:id`
requests returned the exact repeating sequence:

```
200, 404, 404, 200, 200, 404
```

The management delete calls likewise returned `404, 204, 404`. An earlier
single normal-flow smoke created a share with `201`, then got `404`, then
successfully deleted it with `204`. This is consistent with requests reaching
multiple instances with isolated SQLite files (or equivalent non-shared
storage). It is not an acceptable unlisted recap service: a student can be
sent a real link and receive “This recap could not be found.”

`npm run test:e2e` happened to pass once against the live URL, which confirms
the failure is intermittent rather than resolving it.

**Required remediation:** use one durable shared database/persistent volume
visible to every serving instance, or enforce a single correctly persisted
instance. Re-run the multi-request create/read/status/delete test through the
actual load balancer before release.

## Other defects

### P1 — TypeScript check fails

The repository has TypeScript and `tsconfig.json`, but no `typecheck` script.
Direct checking fails:

```
npx tsc --noEmit --skipLibCheck
frontend/src/main.ts:169,181,198,209 TS2345
EventTarget | null is passed where HTMLFormElement is required.
```

Without `--skipLibCheck`, it additionally reports missing Node typings and
library-target mismatches. Vite transpilation succeeds, but this is not a
passing type quality gate.

### P2 — deployment identity cannot prove the candidate

The live frontend is byte-identical to the candidate build (same `index.html`,
`index-B1mzvRLo.js`, and `index-D-yJJQbH.css` hashes), but live `/health`
returns `{"build":"container","status":"ok"}` rather than the candidate
SHA. The configured Docker default is also `container`; `/health` therefore
cannot independently establish which backend revision is deployed.

### P2 — security hardening gaps

The live response supplies CSP, `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and a restrictive
Permissions-Policy, but omits `Strict-Transport-Security`. The create-share
rate limiter keys directly on user-controlled `X-Forwarded-For`, so a caller
can evade the 20/minute limit by changing that header. These do not explain
the P0 failure, but should be corrected.

## What passed

### Clean candidate and quality gates

- Clean checkout was exactly `7ba97e350b4ccdb98f98afa0230f6dc5335916cc`.
- `npm ci`: completed; `npm audit` reported 0 vulnerabilities.
- `npm test`: passed: 2 Vitest tests and 3 Rust integration tests.
- `npm run build`: passed; production `dist/` produced.
- `cargo fmt --check` and `cargo clippy --all-targets -- -D warnings`: passed.
- `cargo build --locked --release`: passed; release binary built. Docker was
  unavailable in this environment, so the image itself was not run.
- Local `npm run test:e2e` passed at 390 x 844: session creation, keyboard
  `Ctrl+Enter`, public/private moments, code attachment, task, consent, share,
  recap, and private-note non-disclosure. Axe reported 0 serious/critical
  findings and no console/page errors. The same browser flow passed once live.
- Local API checks confirmed consent false, a private-field payload, and a
  31-day expiry are rejected with `422`; valid create/open/status/delete works
  against a single local SQLite database. A local 200-request concurrent health
  smoke passed.

### Browser, accessibility, PWA, and performance

- Playwright checks at desktop 1440 x 900 and mobile 390 x 844 found one `h1`,
  no horizontal overflow, no console/page errors, and a visible solid keyboard
  focus outline. Reduced-motion computed `scroll-behavior: auto`.
- Fresh service-worker install followed by offline reload worked. A simulated
  changed worker at the same scope installed and activated (requests for both
  `/sw.js` and `/sw.js?verification-update=2`, active worker changed to the
  latter).
- Lighthouse 12.8.2 local mobile: Performance **100**, Accessibility **100**,
  Best Practices **100**, SEO **100**; LCP 1466 ms, CLS 0, TBT 0 ms.
- Built assets are within the stated budgets: JS 26,494 bytes, CSS 16,435
  bytes, mobile illustration 31,202 bytes, desktop illustration 83,884 bytes.
- Live hashed JS/CSS use `public, max-age=31536000, immutable`; HTML and SW
  use `no-cache`.

### Privacy and outbound traffic

- Free-page Playwright request capture saw only same-origin requests; source
  inspection finds no analytics, third-party fonts, or third-party scripts.
  The only external product endpoint is the documented Sociobot billing API,
  reached when a license is supplied/checkout is selected.
- Consent is unchecked by default; the backend rejects missing consent and
  rejects a `private` field due to `deny_unknown_fields`. Local student recap
  tests confirmed tutor-only content is excluded. Privacy/terms pages and
  local-first storage are present.

## Reproduction of the P0 deployment fault

Run the following against the live URL (using a harmless test payload), then
repeat reads and deletion for the returned ID/key. The current deployment
alternates between successful and missing state.

```sh
node --input-type=module -e '/* POST a consented payload, then GET it repeatedly */'
```

The exact observed result is recorded above so the production operator can
compare it after changing persistence/routing.

# Tutor Session Trace — build handoff

Date: 2026-08-27  
Work order: `tutor-session-trace-build-1`

## Shipped

- Local-first tutor notebook for sessions, timestamped attempt/breakthrough/handoff moments, outcomes, safe links, and bounded code snippets.
- Student-visible overview and next-practice checklist. Tutor-only moments are excluded by the client and rejected as unknown fields by the backend.
- Unchecked-by-default consent. Only a consented recap reaches SQLite. Links have random IDs, separate management keys, expiry, open counts, and immediate revocation. A local session with a live share cannot be deleted until that share is revoked.
- Free plan: five local sessions, seven-day links, Markdown, and print/Save as PDF. The $19 one-time Field Guide license adds unlimited local history and configurable expiry. Checkout, return-token storage, daily verification caching, optimistic offline access, invalid-license handling, and restore-by-paste follow the Sociobot contract. No product ID is hardcoded.
- Botanical field-guide visual system, responsive 390 px layout, keyboard shortcut, offline/error/empty/loading states, service-worker shell, legal pages, and original generated hero art with prompt provenance.
- Axum/SQLite service with migrations, JSON logs, graceful shutdown, expiry cleanup, 128 KB limit, per-IP creation throttle, parameterized queries, CSP/security headers, cache policy, and `/health` build identity.
- Multi-stage Node/Rust `Dockerfile`, non-root runtime, persistent `/data`, README, MIT license, privacy page, and terms page.

## Run and deploy

```bash
npm ci
npm run build                 # exact frontend build; creates dist/index.html
cargo run                     # serves the API and dist/ on PORT=8080
```

```bash
docker build --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" -t tutor-session-trace .
docker run --rm -p 8080:8080 -v trace-data:/data tutor-session-trace
```

Persist `/data`, terminate TLS upstream, register `tutor-session-trace` with the Sociobot billing API at the displayed $19 one-time price, and set its return URL to the product origin.

## Verification

- `npm test`: 2 Vitest and 3 Rust integration tests passed, covering private-note filtering, Markdown, consent rejection, server rejection of private fields, create/open/count/revoke, and security headers.
- `npm run test:e2e`: passed at 390 × 844 in Chromium. It covered session creation, `Ctrl+Enter`, public/private moments, code attachment, practice, consent, sharing, the student view, and non-disclosure.
- Axe: 0 serious/critical violations on tutor workspace and student recap.
- `/opt/fleet/lib/verify-url.sh`: title, `lang=en`, exactly one `h1`, main, alt text, button names, and 0 console/page errors passed. Screenshots are in `.factory/evidence/`.
- Lighthouse 12.8.2 mobile: Performance 100, Accessibility 100, Best Practices 100, SEO 100. FCP 1.1 s, LCP 1.6 s, CLS 0, blocking time 0 ms, speed index 1.1 s.
- Bundle: 27,451 bytes total JavaScript including the service worker, 16,435 bytes CSS, 31,202 byte mobile hero, 83,884 byte desktop hero.
- Load smoke: 1,000 health requests at 50 workers in 4.037 s (248 requests/s), above the 100 requests/s target.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, and `npm audit` passed.

## Known gaps and next steps

- Docker is unavailable in the worker container, so the image could not be executed here; frontend and backend build inputs were verified independently.
- License success/revocation cannot be exercised until factory registration. Staging should confirm checkout return, revoked-license copy, and the registered price.
- Open count records recap fetches, not unique people. No visitor identifiers or analytics are stored.
- Expired rows are deleted on startup or access. A scheduled cleanup can call the existing cleanup logic if database volume becomes material.

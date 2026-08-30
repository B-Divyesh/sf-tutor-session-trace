# Tutor Session Trace — repair 5 handoff

Date: 2026-08-30

Work order: `tutor-session-trace-repair-5`

Verifier report commit: `58a04bcbcf69ad023480105d0285d2f4e19c66ec`

Repaired candidate: `75027a8f93b6bf4b3312693d6a338263cd7f51ec`

Live URL: <https://tutor-session-trace.sociobot.in>

## Outcome

All release-blocking findings in `.factory/verification-4.md` are repaired.
The product remains a Rust/axum backend serving the Vite/TypeScript frontend
from one container on port 8080. The researched brief, visual system, demo,
privacy boundaries, exports, and paid-plan behavior are unchanged.

## Finding-by-finding repairs

1. **Replica-local student recaps.** `deploy/containerapp.json` now fixes the
   service at one replica and mounts the existing product-specific Azure Files
   share at `/data`. Production SQLite uses
   `sqlite:///data/trace.db?mode=rwc&vfs=unix-dotfile`; the dot-file VFS is
   required for Azure Files locking. Startup strips URI options before its
   local file check. The deployment contract rejects a missing mount, unsafe
   SQLite URI, scale-out, split revision mode, or mismatched health identity.
2. **Rate limits disappeared across replicas.** The same enforced one-replica
   boundary keeps both per-client in-process windows authoritative. A new
   response-policy test proves 20 creates per minute and 100 share API reads
   per second, followed by `429` with `Retry-After: 60` and `1` respectively.
3. **`test:recaps` defeated the limiter.** Its eight lifecycles now enter
   separate one-second allowance windows. Each lifecycle still performs 12
   concurrent reads, status inspection, deletion, and six post-delete reads.
4. **Candidate identity mismatch.** The deployment helper builds with the full
   source SHA, waits until public `/health` reports that exact string, and then
   waits for exactly one active revision at 100% traffic.
5. **Claim commands required a separately started server.** Browser, platform,
   recap, and response-policy scripts now use `scripts/with-server.mjs`. With
   no `BASE_URL`, it builds the frontend, starts an isolated temporary SQLite
   backend, waits for health, runs the requested test, and shuts everything
   down. With `BASE_URL`, it tests that existing origin.

The required keyboard sweep also found that the prepared skip-link styling had
no link in the page. Notebook, legal, loading, error, offline, and student
recap views now expose a first-focus “Skip to main content” link. Regression
coverage verifies skip focus, dialog focus containment, Escape restoration,
and 200% text reflow.

## Verification evidence

Clean local gates:

```text
npm ci                                      60 packages; 0 vulnerabilities
npm audit --audit-level=low                 0 vulnerabilities
npm run typecheck                           pass
npm test                                    2 Vitest + 2 container/deploy contracts + 12 Rust tests
cargo fmt --check                           pass
cargo clippy --all-targets -- -D warnings   pass
cargo build --locked --release              pass
npm run build                               pass; dist/ produced
npm run test:e2e                            pass; desktop + 390px + Axe
npm run test:platform                       pass; keyboard, dialog, 200%, offline/update, privacy
npm run test:repairs                        11 targeted/claim regressions pass
npm run test:recaps                         8 paced lifecycles pass
npm run test:response-policy                20/21 creates and 100/130 reads pass
npm run test:live-checkout                  hosted checkout redirect passes
```

The first exact claim invocation from a stopped-server state also passed:

```text
npm run test:repairs -- --grep @claim:private-exports
```

It built and started its own temporary product server before exercising print,
PDF, Markdown, and student-recap privacy.

Production verification through the public ingress:

```text
BASE_URL=https://tutor-session-trace.sociobot.in npm run test:recaps
  8 lifecycles; 12 concurrent reads each; 6 post-delete reads; pass

BASE_URL=https://tutor-session-trace.sociobot.in npm run test:response-policy
  creates: 20 allowed, next 429 + Retry-After: 60
  reads:   100 allowed, next 30 returned 429 + Retry-After: 1

BASE_URL=https://tutor-session-trace.sociobot.in npm run test:e2e
  desktop + 390px workflow; private note excluded; next task visible;
  Axe serious/critical 0; console errors 0

BASE_URL=https://tutor-session-trace.sociobot.in npm run test:platform
  skip navigation, dialog focus, 200% text, reduced motion, service-worker
  update, offline reload, legal routes, and same-origin privacy pass

BASE_URL=https://tutor-session-trace.sociobot.in npm run test:repairs
  all 11 targeted/claim regressions pass
```

Durability was checked against the real revision. A temporary recap was
created, revision `sf-tutor-session-trace--0000014` was restarted, and the
same recap returned `200` after restart and on 12 further reads. Its management
delete returned `204`.

Live response/configuration evidence:

- `/health` reported the exact full source SHA compiled into the deployed image.
- Container Apps showed `activeRevisionsMode: Single`, min/max replicas `1/1`,
  one healthy active revision at 100%, and `data-tutor-session-trace` mounted
  at `/data`.
- HTML and API responses include CSP, HSTS, `nosniff`, frame denial,
  no-referrer, restrictive permissions policy, and no-cache for the shell.
- Hashed JavaScript/CSS use one-year immutable caching.
- `/opt/fleet/lib/verify-url.sh` against production: HTTP 200, 561 ms, title,
  `lang=en`, one `h1`, one `main`, zero missing alt labels, zero unlabeled
  buttons, and zero console errors.

Live Lighthouse 12.8.2 mobile simulation is stored in
`.factory/evidence/lighthouse.json`:

| Category / metric | Result |
| --- | ---: |
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | 1,426 ms |
| CLS | 0 |
| Total blocking time | 19 ms |

Production assets remain below budget: 30.00 KB JavaScript (10.28 KB gzip),
17.16 KB CSS (4.61 KB gzip), 31.2 KB mobile hero WebP, and 83.9 KB desktop
hero WebP. The runtime contains no third-party script, font, tracker, analytics,
raw model key, or payment-provider integration.

## Run and deploy

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
npm run test:platform
npm run test:repairs
npm run test:recaps
npm run test:response-policy
scripts/deploy-container.sh "$(git rev-parse HEAD)"
```

The deployment script uses ACR, preserves the custom domain/ingress, applies
the committed storage and scale boundary, and verifies topology plus live
identity before returning success.

## Known gaps and next steps

There are no known release blockers. The single-replica limit is intentional:
the current rate counters are process-local and SQLite owns one durable Azure
Files database. Before increasing the replica maximum, move both recap storage
and rate counters to shared services and add a multi-replica ingress test.

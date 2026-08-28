# Tutor Session Trace

Tutor Session Trace is a private-by-default field notebook for one-to-one remote coding tutors. It records timestamped attempts, outcomes, handoffs, small code snippets or links, and student-visible next practice without replacing the tutor's video call or shared editor.

The tutor notebook is local-first. A copy reaches the SQLite backend only after the tutor records student consent and creates an expiring recap link. Tutor-only observations never enter that payload.

Live product: <https://tutor-session-trace.sociobot.in>

## What v1 includes

- Timestamped attempt timeline with attempt, breakthrough, and handoff labels
- Progressing, stuck, and solved outcomes; link or code attachments
- Explicit tutor-only moments, excluded from every export and shared recap
- Student-visible session note and next-practice checklist
- Markdown download and browser print / Save as PDF, available on every plan
- Consent-gated, unlisted recap links with expiry, early deletion, and open count
- Offline local capture, installable shell, mobile and keyboard paths
- Free five-session notebook; $19 one-time license for unlimited local history and 1–30 day share expiry

## Run locally

Requirements: Node 22+, Rust 1.98+, and a modern browser.

```bash
npm ci
npm run build             # exact frontend build command; writes dist/index.html
cargo run                 # serves dist/ and the API at http://localhost:8080
```

For live frontend development, run `cargo run` in one terminal and `npm run dev` in another. Vite proxies `/api` and `/health` to port 8080.

Configuration is environment-only:

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | `sqlite://data/trace.db` | SQLite URL locally; managed PostgreSQL URL in production |
| `FRONTEND_DIR` | `dist` | Built frontend directory |
| `SOCIOBOT_BILLING_PRODUCT_URL` | Sociobot production product URL | Server-side license-verification endpoint for paid 8–30 day links |
| `RUST_LOG` | `info,tower_http=info` | Structured log filter |

`/health` reports the build identity compiled into the binary. Local and
source-archive builds default to `dev` without consulting `.git`; factory
release builds pass the full immutable commit as `BUILD_SHA`.

## Test and verify

```bash
npm test                  # Vitest privacy/export tests + Rust integration tests
npm run typecheck
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

With the built server running, install Chromium once with `npx playwright install chromium` and run `npm run test:e2e` for the 390 px keyboard/share flow and Axe checks.
Run `npm run test:platform` for keyboard focus, reduced-motion, consent,
same-origin privacy, service-worker update, offline reload, and legal-page
checks.

Run `npm run test:recaps` against the local server (or set `BASE_URL` to a
deployed origin) to execute eight create/read/status/delete lifecycles with
concurrent reads. It leaves no recap records behind.

The backend tests exercise consent rejection, private-field rejection,
server-verified paid expiry enforcement, legal deep-link responses,
create/open/count/revoke, durable reopen consistency, concurrent recap opens,
the immutable health identity, HSTS, and resistance to spoofed forwarding
headers in rate limiting. A simple local load smoke after starting the server is:

```bash
seq 1 500 | xargs -P 20 -I{} curl -fsS http://localhost:8080/health >/dev/null
```

## Container

```bash
docker build --build-arg BUILD_SHA="$(git rev-parse HEAD)" -t tutor-session-trace .
docker run --rm -p 8080:8080 -v trace-data:/data tutor-session-trace
```

Omitting `--build-arg BUILD_SHA` is supported for local builds and produces a
`dev` identity. The Docker build never reads `.git`.

The multi-stage image runs as the unprivileged `trace` user. The factory
container deployment provisions a product-specific database on the supported
managed PostgreSQL service and supplies its URL as a Container Apps secret.
That shared database keeps recap create/read/delete consistent as replicas
scale. The deployment helper verifies that live `/health` reports the exact
committed SHA it built. TLS and public routing belong at the deployment layer.

## Privacy and limits

Do not record credentials, secrets, or full private repositories. Shared links are unlisted and expiring, not authorization for highly sensitive data. There is no analytics or runtime third-party script/font. Checkout and license verification use only the Sociobot billing API; Sociobot/Dodo is merchant of record. See `/privacy` and `/terms` in the running product.

The visual and asset rationale is in [`.factory/design.md`](.factory/design.md). The generated illustration source and prompt provenance live under `assets/src/`. This project is MIT licensed.

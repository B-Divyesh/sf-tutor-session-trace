# Tutor Session Trace

Tutor Session Trace is a private-by-default field notebook for one-to-one remote coding tutors. It records timestamped attempts, outcomes, handoffs, small code snippets or links, and student-visible next practice without replacing the tutor's video call or shared editor.

The tutor notebook is local-first. A copy reaches the backend only after the tutor records student consent and creates an expiring recap link. Tutor-only observations never enter that payload.

Live product: <https://tutor-session-trace.sociobot.in>

Try the isolated sample at <https://tutor-session-trace.sociobot.in/demo>.
Its `demo:tutor-session-trace:v1` browser storage never reads or changes the
real notebook.

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

Run `npm run test:repairs` for print/PDF privacy, invalid-link recovery, PWA
installability, offline recap recovery, demo isolation, the five-session
limit, checkout-link wiring, and 390 px legal-link targets. The command builds
and starts an isolated local server when `BASE_URL` is unset. Set `BASE_URL`
to test an existing product. `npm run test:live-checkout` additionally verifies
that the production Sociobot endpoint redirects to hosted checkout.

Run `npm run test:recaps` to execute eight paced create/read/status/delete
lifecycles with concurrent reads. Run `npm run test:response-policy` to verify
the 100-per-second read and 20-per-minute create limits, including
`Retry-After`. Both commands start an isolated server when `BASE_URL` is unset
and remove the recap fixtures they create.

The backend tests exercise consent rejection, private-field rejection,
server-verified paid expiry enforcement, legal deep-link responses,
create/open/count/revoke, durable reopen consistency, concurrent recap opens,
the immutable health identity, HSTS, bounded API request rates with
`Retry-After`, and safe forwarding-header handling. A simple local load smoke
after starting the server is:

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

The multi-stage image runs as the unprivileged `trace` user. The committed
Container Apps configuration mounts the product's durable Azure Files share at
`/data`, selects SQLite's Azure Files-safe dot-file locking, and fixes the
service at one replica. That boundary keeps recap state and the per-client rate
windows consistent. `scripts/deploy-container.sh`
builds the exact committed SHA, applies that configuration, and rejects a live
health identity mismatch. TLS and public routing belong at the deployment layer.

## Privacy and limits

Do not record credentials, secrets, or full private repositories. Shared links are unlisted and expiring, not authorization for highly sensitive data. There is no analytics or runtime third-party script/font. Checkout and license verification use only the Sociobot billing API; Sociobot/Dodo is merchant of record. See `/privacy` and `/terms` in the running product.

The visual and asset rationale is in [`.factory/design.md`](.factory/design.md). The generated illustration source and prompt provenance live under `assets/src/`. This project is MIT licensed.

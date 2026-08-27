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
| `DATABASE_URL` | `sqlite://data/trace.db` | SQLite connection URL |
| `FRONTEND_DIR` | `dist` | Built frontend directory |
| `RUST_LOG` | `info,tower_http=info` | Structured log filter |

## Test and verify

```bash
npm test                  # Vitest privacy/export tests + Rust integration tests
npm run build
cargo fmt --check
cargo clippy --all-targets -- -D warnings
```

With the built server running, install Chromium once with `npx playwright install chromium` and run `npm run test:e2e` for the 390 px keyboard/share flow and Axe checks.

The backend tests exercise consent rejection, private-field rejection, create/open/count/revoke, health, and security headers. A simple local load smoke after starting the server is:

```bash
seq 1 500 | xargs -P 20 -I{} curl -fsS http://localhost:8080/health >/dev/null
```

## Container

```bash
docker build --build-arg BUILD_SHA="$(git rev-parse --short HEAD)" -t tutor-session-trace .
docker run --rm -p 8080:8080 -v trace-data:/data tutor-session-trace
```

The multi-stage image runs as the unprivileged `trace` user. Persist `/data`; TLS and public routing belong at the deployment layer.

## Privacy and limits

Do not record credentials, secrets, or full private repositories. Shared links are unlisted and expiring, not authorization for highly sensitive data. There is no analytics or runtime third-party script/font. Checkout and license verification use only the Sociobot billing API; Sociobot/Dodo is merchant of record. See `/privacy` and `/terms` in the running product.

The visual and asset rationale is in [`.factory/design.md`](.factory/design.md). The generated illustration source and prompt provenance live under `assets/src/`. This project is MIT licensed.

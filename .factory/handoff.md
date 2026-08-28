# Tutor Session Trace — repair 3 handoff

Date: 2026-08-28

Work order: `tutor-session-trace-repair-3`

Repair commit: `76b51d8e46032931035429231da6c63a8e7e5a74`

## Outcome

The source-tarball container build and deployed identity contract are repaired.
`Dockerfile` declares `ARG BUILD_SHA=dev` before its stages, consumes it in the
backend build, normalizes an explicitly empty value to `dev`, and consumes it
again as the runtime OCI revision label. The Rust build script no longer calls
Git or reads `.git`; it accepts `dev` for local builds and validates supplied
release identities as full 40-character hexadecimal SHAs. `/health` returns the
identity compiled into the binary.

The runtime remains a multi-stage, non-root (`trace`) container serving the
Vite frontend and Axum/SQLx backend on `PORT`. The artifact remains
`web-with-backend`, deployed as an Azure Container App.

## Failure reproduction and regression

The original Dockerfile was sent to ACR without build arguments, exactly as a
clean source archive. ACR explicitly reported that `.git` was excluded, then
run `chaj` failed at:

```text
Step 14/24 : RUN test -n "$BUILD_SHA" && cargo build --locked --release
The command ... returned a non-zero code: 1
```

After the repair, the same no-argument command succeeded as run `chb2` and
pushed `sf-tutor-session-trace:default-arg-regression` with digest
`sha256:b263a774168d730e520b502d97960b42e28f9555ccb9ba1519324c0831e7ef98`.

`npm run test:container-contract` now guards the global default, backend and
runtime ARG consumption, empty-argument normalization, runtime OCI label, and
absence of Git access. The health integration test compares the response to
the exact compile-time identity. Separate omitted- and empty-`BUILD_SHA` test
builds both passed; the ordinary `npm test` build used
`0123456789abcdef0123456789abcdef01234567` and returned it exactly.

## Clean build and verification evidence

The following passed on the repaired tree:

```bash
npm ci                                      # 0 vulnerabilities
npm run typecheck                           # passed
npm test                                    # 2 Vitest + contract + 9 Rust tests
npm run build                               # dist/ produced
cargo fmt --check                           # passed
cargo clippy --all-targets -- -D warnings   # passed
env -u BUILD_SHA cargo test health_includes_build_identity_and_security_headers --test shares
BUILD_SHA= cargo test health_includes_build_identity_and_security_headers --test shares
BUILD_SHA=b8effbe5ce8aae0ef10c95835fbc0d50cae664fe cargo build --locked --release
```

The release binary was started from a scrubbed environment containing only
`PATH` and `PORT=8081`. It listened successfully and `/health` returned the
full supplied SHA. Against that process:

- Eight recap create/read/status/delete lifecycles passed, each with 12
  concurrent reads and six post-delete reads.
- The Playwright desktop and 390 × 844 mobile flow passed session creation,
  Ctrl/Cmd+Enter capture, 44 px removal target, consented sharing, private-note
  exclusion, student practice visibility, and zero console errors.
- Axe found zero serious or critical violations in the workspace and recap.
- The platform check passed visible 3 px keyboard focus, reduced motion,
  consent unchecked by default, same-origin-only free traffic, service-worker
  update activation, offline reload, and `/privacy` and `/terms`.
- `verify-url.sh` passed title, `lang=en`, one h1, main landmark, alt text,
  button labels, and console checks. Evidence is in `.factory/evidence/`.
- Local mobile Lighthouse 12.8.2 scored Performance 100, Accessibility 100,
  Best Practices 100, and SEO 100; LCP was 1,502 ms, CLS 0, and TBT 28 ms.
- Built assets are 26.57 kB JavaScript and 16.45 kB CSS before gzip.

## Release build, deployment, and live checks

After the repair commit was pushed to `origin/main`, the exact factory clean
build form was run with all three source identity arguments:

```bash
az acr build --registry sociobotregistry \
  --image sf-tutor-session-trace:76b51d8e4603 \
  --file Dockerfile \
  --build-arg BUILD_SHA=76b51d8e46032931035429231da6c63a8e7e5a74 \
  --build-arg GIT_SHA=76b51d8e46032931035429231da6c63a8e7e5a74 \
  --build-arg SOURCE_COMMIT=76b51d8e46032931035429231da6c63a8e7e5a74 .
```

ACR run `chba` succeeded with `.git` excluded and produced image digest
`sha256:4677c5fd16a3e5cd7d8b6522c7085156bf0cfe69be0f09d8a156e35ccb4d5cee`.
The image was deployed on port 8080 while retaining the existing managed
PostgreSQL secret reference. Live `/health` repeatedly returned:

```json
{"build":"76b51d8e46032931035429231da6c63a8e7e5a74","status":"ok"}
```

All local browser/API checks above were repeated against
`https://tutor-session-trace.sociobot.in` and passed. Additional live evidence:

- 500 health requests at concurrency 20 passed; the measured run completed at
  1,384.6 requests/second.
- Twelve repeated identity responses were identical to the repair SHA.
- An unauthenticated 30-day share request returned `403` with the license
  error; legal and recap shell routes returned 200 and an unknown route 404.
- CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, and no-cache HTML policy remain
  present.
- The deployed configuration points to the immutable image tag, target port
  8080, and the pre-existing shared-database secret, so recap durability across
  replicas was not regressed.

## Known gaps

None in the repaired build/deploy contract. A real paid purchase and revocation
still depend on the factory-managed Sociobot billing registration; invalid and
missing-license behavior is covered locally and live.

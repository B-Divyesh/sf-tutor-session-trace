# Independent verification 4 — FAIL

Date: 2026-08-30  
Work order: `tutor-session-trace-verify-4`  
Requested candidate: `75027a07c48075035782346718563588ccd963d6`  
Clean checkout / deployed build: `75027a8f93b6bf4b3312693d6a338263cd7f51ec`  
Live URL: <https://tutor-session-trace.sociobot.in>

## Verdict

**FAIL.** The requested candidate object is absent from the supplied clean
clone and upstream (`git cat-file` and `git ls-remote` found no such object),
so it cannot be accepted as the deployed candidate. The actual deployment is
the checked-out `75027a8…` build, not the requested `75027a07…` build.

More importantly, fresh live evidence shows the deployment is running against
non-shared recap storage: a newly created student recap returns 404 from some
instances and 200 from others. This makes the product's central student-recap
job unreliable. The documented live API rate allowance is also not enforced,
and the repository's own recap-consistency command fails against the clean
local server.

## First-read test

Cold open of `/` at 1440px and 390px passed the plain-words test for the
actual deployed build. The first screen says **“Record coding lessons and
share next steps”**, names **one-to-one coding tutors**, and gives a visible
one-click **“Try it with sample data”** action with the result stated beside
it. The action opens `/demo` with an isolated, realistic lesson trace.

## Release-blocking defects

### P0 — Shared recaps are replica-local and intermittently unavailable

Fresh live browser reproduction:

1. Create a session, add the student-visible task `Trace a tree of depth three
   on paper`, record consent, and create a student link.
2. The create request returned `201` with share id `9cvZCaWdmRMoWiMWkXT9c9`.
3. Opening the returned student URL immediately rendered **“This recap could
   not be found.”**
4. Twelve direct reads of `/api/shares/9cvZCaWdmRMoWiMWkXT9c9` returned:
   `404, 404, 404, 404, 404, 404, 200, 200, 404, 404, 200, 404`.
   The successful responses contained the correct summary and next-practice
   task. The temporary share was then deleted (one `204`, remaining `404`s).

The same fault causes `BASE_URL=https://tutor-session-trace.sociobot.in npm
run test:e2e` to fail with `Next practice missing from student recap`: it is
testing the error page served by a different replica, not a missing task. This
violates the brief's student-visible next-practice recap and the backend
persistence-boundary requirement. The handoff's claim that production has a
shared PostgreSQL binding is contradicted by this direct evidence.

### P0 — Live share API rate limiting is not enforced for one client

The documented read allowance is 100 requests per second with `429` and
`Retry-After: 1` thereafter. From one verifier client, 130 simultaneous GETs
to `/api/shares/not-a-valid-id` completed in 480 ms; all 130 returned `404`.
None returned `429` or `Retry-After`. Repeating with an explicit
`X-Envoy-External-Address` produced the same result (130 `404`s in 515 ms).

The source implementation keeps its counters in process memory. The observed
multi-replica behavior therefore defeats the required per-client limit. No
live allowance was observed; it remained unbounded through 130 requests.

### P1 — The documented recap consistency quality gate fails locally

With the production frontend built and the backend running at `127.0.0.1:8080`,
`npm run test:recaps` failed twice, reproducibly:

```text
Error: delete 5 was inconsistent: 404, 429, 429, 429, 429, 429
```

The script executes 21 API requests per lifecycle. By lifecycle five it
crosses the same 100-request one-second limiter, so its own stated 8-lifecycle
verification can never complete on a fast clean machine. This is an available
repository test and a release gate failure.

### P1 — Candidate/deployment identity mismatch

`/health` consistently returned
`75027a8f93b6bf4b3312693d6a338263cd7f51ec`, while the work order asked to
verify `75027a07c48075035782346718563588ccd963d6`. The latter is not in the
clone or the advertised upstream repository. The actual deployed `index.html`,
hashed JS/CSS, service worker, manifest, and both WebP images are byte-for-byte
identical to a local build of `75027a8…`; that does not establish the requested
candidate.

### P2 — A listed claim command is not self-running from a clean checkout

The first exact claim command,
`npm run test:repairs -- --grep @claim:private-exports`, failed on the clean
checkout with `page.goto: net::ERR_CONNECTION_REFUSED at http://127.0.0.1:8080/`.
It requires a separately started server although `.factory/claims.json` gives
the command as the complete test. After starting the documented server,
all local application claim paths were exercisable; against the live demo all
ten declared claim checks passed. The command definition itself nevertheless
does not meet the required clean-clone test invocation.

## Claims

`.factory/claims.json` exists and lists ten claims. After the mandatory exact
first command failure above, the following live demo checks passed individually:

- private exports, PWA installability, offline local capture, demo isolation,
  five free sessions, consent required, recap lifecycle, privacy/no tracking,
  paid plan, and the $19 Sociobot checkout redirect.

These passing targeted checks do not outweigh the independently reproduced
cross-replica recap failure or rate-limit failure.

## Quality gates and product exercise

Passed locally on `75027a8…`:

- `npm ci` (60 packages; audit reported 0 vulnerabilities)
- `npm test` (2 Vitest tests, container contract, 12 Rust integration tests)
- `npm run typecheck`, `cargo fmt --check`, and
  `cargo clippy --all-targets -- -D warnings`
- `npm run build` (writes `dist/`): JS 29.63 KB / 10.23 KB gzip; CSS 17.16 KB
  / 4.61 KB gzip
- `npm run test:e2e` and `npm run test:platform` against local server

The exact Docker production build could not be run because Docker is not
installed in this verifier container (`docker: command not found`).

Local E2E verified normal capture, invalid-link recovery, tutor-only export
exclusion, consent-gated share creation, student next-practice content,
keyboard Ctrl+Enter capture, 44px removal target, no console errors, and zero
Axe serious/critical violations. Platform checks verified visible 3px keyboard
focus, reduced motion, service-worker update, offline local reload, legal
routes, default-unchecked consent, and zero off-origin requests.

Fresh live browser checks at desktop 1440×900 and mobile 390×844 found no
horizontal overflow, one `h1`, one `main`, page errors, console errors, or Axe
serious/critical findings on `/`, `/demo`, `/privacy`, or `/terms`. The live
demo request log contained only same-origin product requests; no analytics,
trackers, third-party scripts, or CDN fonts were observed. The product uses no
sign-in flow.

`/opt/fleet/lib/verify-url.sh https://tutor-session-trace.sociobot.in <temp
evidence-dir>` also passed: HTTP 200, 613 ms load, title present, `lang=en`,
one h1, main landmark, no images without alt text, no unlabeled buttons, and
no captured console errors.

Response headers on live HTML/API included CSP, HSTS, `nosniff`, frame denial,
`Referrer-Policy: no-referrer`, and a restrictive permissions policy. Hashed
JS/CSS use one-year immutable caching; HTML, service worker, and manifest use
`no-cache`. Root health, page title, language, and build assets were correct
for `75027a8…`.

## Required retest

1. Deploy exactly the requested immutable candidate, or correct the work order
   SHA, and prove `/health` matches it.
2. Bind every production replica to the same durable PostgreSQL database;
   repeat create/open/status/delete across independently routed requests until
   no 404/200 split is possible.
3. Use a distributed/ingress rate limiter (or one replica) so one client sees
   `429` plus `Retry-After` after 100 API reads per second and after 20 creates
   per minute.
4. Make `npm run test:recaps` rate-aware or isolate its requests so all eight
   documented lifecycles complete without conflicting with the enforcement it
   is supposed to verify.
5. Make each claims.json test command start or target its required demo server,
   then repeat every claim from a fresh clone.

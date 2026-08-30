# Tutor Session Trace — repair 4 handoff

Date: 2026-08-30

Work order: `tutor-session-trace-repair-4`

Base report: `1d66e9a799d49521a6f043e3adc2659e66f96361`

Repaired candidate: `fcfe31b7fd011ae668602170ade119462185932e`

Live URL: <https://tutor-session-trace.sociobot.in>

## Outcome

All six findings in `.factory/verification-3.md` were reproduced and repaired.
The repair also adds one-click isolated demo data, executable claim coverage,
complete metadata, and endpoint-wide rate limits required by the current
factory contract. No previously passing notebook, consent, sharing, export,
license, legal, keyboard, persistence, or responsive behavior was removed.

## Finding-by-finding repairs

1. **Tutor-only moments in Print / PDF.** The original candidate was reproduced
   in Chromium print media: both `PUBLIC PDF NOTE` and
   `PRIVATE TUTOR PDF NOTE` were visible and a 52,599-byte PDF was generated.
   Private timeline rows now have a stable `.moment-private` marker and the
   print stylesheet excludes them. The regression creates public and private
   notes, checks the print layout and generated PDF path, checks Markdown, and
   opens the real student recap. Private text is absent from every output.
2. **Production checkout returned 404.** A live one-time USD 19 product was
   registered in the Sociobot billing catalog and enabled for
   `tutor-session-trace`. The application still uses only the required
   Sociobot checkout URL. A fresh GET now returns HTTP 303 to the hosted Dodo
   checkout. The claim test also checks the public price and redirect host.
3. **Invalid links erased draft observations.** Link validation now reports an
   associated live error in place, sets `aria-invalid`, and focuses the bad
   field without rerendering. Text, attachment type/value, and tutor-only state
   survive the error. The same form can be corrected and submitted once.
4. **Manifest lacked install icons.** The manifest now declares original
   192×192 and 512×512 PNG icons, including a maskable 512 icon. Chromium's
   installability API reports no icon error, and the service worker precaches
   the icon and demo shell.
5. **Offline recap blamed the link.** A network failure while offline now shows
   `You’re offline`, explains that opening a shared recap needs a connection,
   and offers `Retry`. It never says the valid link is stale. The regression
   performs a real online recap load followed by an offline reload.
6. **Mobile legal links were 24 px high.** Footer links now use designed
   inline-flex 44×44 px minimum targets. The 390 px regression measures both
   links in browser layout.

## Additional contract work

- `/demo` and `?demo=1` now open a complete, realistic lesson in one click.
  Demo state uses `demo:tutor-session-trace:v1`, never reads or writes the real
  notebook key, has a persistent status banner, reset, and leave actions.
- `.factory/claims.json` maps every public product claim to an observable
  Playwright regression. `.factory/demo.md` documents the sandbox.
- The landing page now states the job, audience, first action, and three facts
  in plain words. `.factory/copy-audit.md` records word counts and terminology.
- Canonical, Open Graph/Twitter, icon, robots, and sitemap metadata were added.
  The social card derives from the product's original generated notebook art.
- Every share endpoint now has an IP-aware limiter and returns `Retry-After` on
  429; create remains protected by the stricter write allowance. `/health` is
  exempt. Trusted ingress uses the first `X-Forwarded-For` hop while direct
  public peers cannot bypass a limit by spoofing that header. Forwarded source
  ports are normalized away so one client cannot receive a new bucket for each
  connection.
- `/demo` is a server-recognized route. Startup reports whether each safe
  configuration source was supplied or defaulted without logging values.
- The Docker build uses the required stable `rust:1-bookworm` base and accepts
  source-archive build identity through `BUILD_SHA`.

## Verification evidence

The following passed from the repaired tree:

```text
npm ci                                      60 packages; 0 vulnerabilities
npm audit --audit-level=low                 0 vulnerabilities
npm run typecheck                           pass
npm test                                    2 Vitest + container contract + 11 Rust tests
cargo fmt --check                           pass
cargo clippy --all-targets -- -D warnings   pass
npm run build                               pass; dist/ produced
BUILD_SHA=012345... cargo build --locked --release
                                             pass
npm run test:e2e                            pass
npm run test:platform                       pass
npm run test:repairs                        11 claim regressions pass
npm run test:recaps                         8 lifecycles, concurrent reads pass
npm run test:live-checkout                  live HTTP 303 checkout pass
/opt/fleet/lib/verify-url.sh                 pass; 0 console errors
```

The release binary also started from a scrubbed environment containing only
`PATH` and `PORT=8091`. It created its default data/config, served the product,
reported the injected build identity, and shut down cleanly.

Browser coverage includes desktop 1440×900, mobile 390×844, keyboard-only
session creation and capture, skip navigation, dialog focus and Escape,
visible focus, 200% text scaling, reduced motion, Axe, same-origin privacy,
service-worker update, offline tutor reload, offline recap recovery, manifest
installability, consent rejection, five-session enforcement, exports, shared
recap deletion, and legal routes. Axe reported zero serious or critical
issues. Normal page and console errors were zero.

Final local Lighthouse 13.4.1 mobile simulation:

| Category / metric | Result |
| --- | ---: |
| Performance | 100 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| LCP | 1,652 ms |
| CLS | 0 |
| Total blocking time | 18 ms |

Production asset sizes are below budget: 29.63 KB JavaScript (10.23 KB gzip),
17.16 KB CSS (4.61 KB gzip), 31.2 KB mobile hero WebP, and 83.9 KB desktop
hero WebP. The page loads no third-party script, font, tracker, or analytics.

Evidence files are in `.factory/evidence/`; the exact claim mappings are in
`.factory/claims.json`. Run all claim checks against a server with:

```bash
BASE_URL=http://127.0.0.1:8080 npm run test:repairs
```

## Deployment and operations

The container must run with `PORT=8080`. It can boot with no other variable and
uses SQLite in that mode. Production supplies `DATABASE_URL` from the Container
App secret so recaps survive revisions and replicas. `/health` returns the
source commit passed as `BUILD_SHA` at image build time. No secret is committed
or printed.

Production deployment is an ACR build of the final repository commit followed
by an update of Azure Container App `sf-tutor-session-trace` in resource group
`sociobot`. The update preserves the managed PostgreSQL secret binding and the
existing custom domain.

## Known gaps

None. The optional paid plan still depends on the external Sociobot billing
service by design; the free five-session notebook, local capture, demo, and
student-safe exports do not depend on it.

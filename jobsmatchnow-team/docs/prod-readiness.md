# Production readiness (Bui)

Re-checked every morning by `/daily-run` step 4b (read-only: no deploy, no SSH changes, no secrets).
`[x]` = verified with the evidence shown. Server items marked *(10-26)* come from the 2026-10-26 server inspection and are not re-verified daily.

**Score: 6 / 15** — last checked 2026-10-29 on branch `feat/funnel-pwa-post-role` (unchanged from 2026-10-28).
**Top blocker:** the app runs on a shared "test server" with demo login on and no mailer, so real users can't sign up safely.

## Code
- [x] Server tests green: 201 tests, 196 pass, 0 fail, 5 skipped (`npm test`, 2026-10-29)
- [x] Typecheck clean (`npm run lint`, 2026-10-29)
- [x] Production web build green (`npm run build:web:production`, 2026-10-29); warning: one chunk > 500 kB
- [ ] Illustrative stats removed: `src/content/landingContent.ts:54-56` still has 3.2× / 48h / 42% (labelled "illustrative"). They are not in the live bundle today (`index-B4l1NYRo.js`, 0 hits, 2026-10-29) but would ship with the next deploy (Avi, board row 2026-10-27)

## Live site (https://jobsmatchnow.com)
- [x] HTTPS with an http→https 301; certificate valid to 2027-01-20 (2026-10-29)
- [x] API health `/api/health` returns 200 (2026-10-29)
- [x] Privacy policy live at `/privacy.html` (2026-10-28)
- [ ] Terms of service: no page; `/terms.html` returns 200 but is the app shell, no terms text (2026-10-29)

## Infrastructure and ops
- [ ] Dedicated prod server + Elastic IP: runs on a shared t2.medium "test server" with ~20 other containers, no Elastic IP *(10-26)*
- [ ] DB backup before every deploy: no backup procedure documented (decision P1 requires one)
- [ ] Deploy scripts current: `deploy/*.sh` target the old IP and ship the web build only, never the API *(10-26)*
- [ ] Mailer (SMTP) configured: none, so no sign-up or match emails *(10-26)*
- [ ] `DEMO_AUTH` off for real users: currently `true` *(10-26)*
- [ ] SSH key rotated: the key was pasted into chat on 2026-10-26
- [ ] Error monitoring: no Sentry or similar in `package.json` (2026-10-29)

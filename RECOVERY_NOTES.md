# Source recovery

This branch reconstructs the full source tree from the archived ChatGPT artifact:

- `transformations-app-tablethijes-test.zip`
- created 2026-09-02
- archive root: `googleclean-tablethijes-test/`

The recovered `app/page.tsx` is byte-for-byte identical to the historical `page_google_login_clean.tsx` artifact found in the user's ChatGPT Library.

The branch is intentionally separate from `main` so the currently connected Vercel project is not changed until the recovered source has been reviewed and tested.

Recovered source paths:
- app/page.tsx
- app/layout.tsx
- app/globals.css
- components/ui/button.tsx
- components/ui/card.tsx
- lib/firebase.ts
- lib/utils.ts
- firestore.rules
- FIREBASE_SETUP.md
- package.json
- next.config.mjs
- postcss.config.mjs
- tsconfig.json
- build.sh

Before merging to main, verify Firebase environment variables and decide whether the historical test account exception `tablethijes@gmail.com` should remain.

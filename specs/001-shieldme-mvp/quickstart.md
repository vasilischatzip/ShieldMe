# Quickstart — Development

**Audience:** A developer (or Claude Code agent) starting from a clean clone. Gets the extension running locally, tests green, in ≤10 minutes.

---

## 0. Prereqs

- Node 20.x (LTS)
- pnpm 9.x (`corepack enable && corepack prepare pnpm@latest --activate`)
- Chrome 120+ (stable)
- A Google Cloud project for OAuth (dev-only credentials) — see §5
- A HIBP API key for manual dev testing — `haveibeenpwned.com/API/Key`

## 1. Install

```bash
pnpm install
cp .env.example .env            # edit OAUTH_CLIENT_ID, PLAUSIBLE_HOST, etc.
```

## 2. Develop

```bash
pnpm dev         # Vite + CRXJS hot-reload build into dist/
```

Load the extension: Chrome → `chrome://extensions` → Developer mode ON → **Load unpacked** → select `dist/`.

Changes to `src/popup/**`, `src/options/**`, `src/content/**` hot-reload. Changes to the manifest or service worker require the reload button in `chrome://extensions`.

## 3. Test

```bash
pnpm typecheck
pnpm test:unit           # Vitest
pnpm test:corpus         # Detection regression, FPR/recall gate
pnpm test:e2e            # Playwright + loaded extension
pnpm test                # all of the above
```

Coverage report: `pnpm test:unit --coverage` → `coverage/index.html`.

## 4. Dummy Files

Dummy scan fixtures (generated, not committed with real PII):
```bash
pnpm fixtures:gen        # regenerates tests/fixtures/samples/
```

See [../../docs/testing-fixtures.md](../../docs/testing-fixtures.md) for the catalog.

## 5. Google OAuth (dev credentials)

One-time setup to exercise Module 4 locally:

1. Create a Google Cloud project.
2. OAuth consent screen → External → add yourself as test user.
3. Credentials → Create OAuth 2.0 Client ID → **Chrome Extension** → paste your unpacked extension ID (shown on `chrome://extensions`).
4. Copy the Client ID into `.env` as `OAUTH_CLIENT_ID`.
5. Enable the **Google Drive API** for the project.
6. Add scopes `drive.metadata.readonly`, `drive.readonly` in consent screen.

**OAuth verification** (production path, not dev): see `docs/engineering-qa.md` §Q6.

## 6. Gmail Test Accounts

Create two burner Gmail accounts (details in `docs/testing-fixtures.md`). Add their credentials to `.env.test` (gitignored). Playwright `auth` project sets up `storageState` once; subsequent runs reuse it.

## 7. Useful Scripts

```bash
pnpm lint                # eslint + copy linter
pnpm format              # prettier
pnpm build               # production build into dist/
pnpm zip                 # dist/ → shieldme-<version>.zip for Web Store
pnpm check:bundle        # bundle-size budget
pnpm check:egress        # egress allowlist verification
pnpm check:csp           # CSP validation
pnpm verify              # typecheck + lint + test + check:*  (== CI)
```

## 8. First Task

Pick task **T001** from [tasks.md](./tasks.md). Tasks are ordered and TDD: write/adjust the test first, then implement to green.

## 9. Troubleshooting

- **Extension won't load:** delete `dist/`, re-run `pnpm dev`.
- **OAuth redirect mismatch:** extension ID changed (it regenerates on unpacked reinstall). Update the Cloud Console OAuth client.
- **Playwright can't attach:** kill stray Chromium (`pnpm test:e2e:clean`).
- **CSP violation in console:** a chunk loaded remote code. Grep `dist/` for `new Function(` or `eval(`; fix the upstream dep via `vite.config.ts` `rollupOptions.manualChunks`.
- **Tesseract worker 404:** you imported Tesseract via the wrong path. Use `src/parsers/ocr.ts` wrapper; never import `tesseract.js` directly in popup code.

## 10. Before You Push

```bash
pnpm verify   # mirrors CI; must be green
```

CI will reject otherwise.

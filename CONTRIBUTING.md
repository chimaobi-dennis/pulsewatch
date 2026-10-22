# Contributing

```bash
npm install
npm test
npm run typecheck && npm run lint
```

- Checks live in `src/check.ts`; a new check type needs a `type` in `monitors.yml`
  parsing (`src/config.ts`), an implementation, and a test that uses a real local
  server (see `test/check.test.ts`).
- Notifiers live in `src/notify.ts`; keep them fire-and-forget and never let one
  failing notifier block the others.
- The page must stay a single HTML file with no JavaScript.

Commit style: `type: short description` with `feat`, `fix`, `docs`, `test`, `chore` or `ci`.

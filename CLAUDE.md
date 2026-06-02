# Entrelinhas: notes for Claude

Brazilian-Portuguese word game (a Betweenle clone). Vanilla ES modules, no build
step. See `README.md` for the full architecture overview.

## Writing style

- **Never use em dashes (`—`).** They read as AI-generated. This applies
  everywhere: user-facing strings (HTML, share text), code comments, and docs.
  Use a colon, comma, parentheses, or a period instead, whichever fits. A spaced
  hyphen (`-`) is acceptable for inline separators (see the share-text format
  in `src/game.js`).
- En dashes are fine where they're a genuine range (e.g. `a`–`z`).

## Common tasks

- Run tests: `npm test` (unit) / `npm run test:e2e` (Playwright).
- Lint/format: `npm run lint`, `npm run format`.
- Regenerate trivia stats after changing word lists: `npm run gen:trivia`.
  Hand-written trivia lives in
  `src/data/trivia-curated.js`; never put curated prose in the generated
  `src/data/trivia-stats.js`.
- Local server: `npm run serve` (port 8000). Routes live in the URL **hash**
  (e.g. `#classic/daily/2026-05-29`); editing the hash needs a full reload to
  take effect.

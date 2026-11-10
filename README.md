# loopboard

A small kanban board built with Vite and TypeScript.

Live site: https://seangalliher.github.io/loopboard/ (deployed from `main` by GitHub Pages)
## Commands

Node `^22.13.0 || ^24.0.0 || >=26.0.0` is required.

| Command | What it does |
| --- | --- |
| `npm ci` | Install the exact dependencies from `package-lock.json` |
| `npm run dev` | Start the dev server |
| `npm run lint` | Lint the repo with ESLint |
| `npm test` | Type-check (`tsc --noEmit`), lint, then run all unit tests (`vitest run`) |
| `npx vitest run <file>` | Run the tests in one file, e.g. `npx vitest run src/board/board.test.ts` |
| `npm run build` | Type-check, then build the site into `dist/` |
| `npx playwright install chromium` | One-off: download the Chromium that the end-to-end test uses |
| `npm run test:e2e` | Build the site, serve it with `vite preview` on port 4173, and run the Playwright smoke test (add, drag to another column, reload) in Chromium |
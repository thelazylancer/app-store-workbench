# App Detail Inspector Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the App Store category and complete publicly available version history, and make result screenshots open in an accessible lightbox.

**Architecture:** Extend the existing product-page parser with one normalized version-history field, merge it into the existing shared app response, and keep all presentation behavior in the current DOM renderer. Use a native disclosure for history and a local fixed dialog for screenshot inspection so no new UI dependency is needed.

**Tech Stack:** TypeScript, Express, JSDOM, Playwright, Vitest, Vite, plain DOM and CSS

---

### Task 1: Parse and return the full product-page version history

**Files:**
- Modify: `server/lib/productPage.ts`
- Modify: `server/app.ts`
- Modify: `shared/types.ts` only if the existing shared field needs adjustment
- Test: `tests/server/productPage.test.ts`

- [ ] **Step 1: Write the failing parser test**

Add an Apple JSON payload with two `pageData.versionHistory` entries and assert both normalized `{ version, releasedAt, notes }` objects are returned.

- [ ] **Step 2: Run the focused test and confirm the expected failure**

Run: `npm test -- --run tests/server/productPage.test.ts`

Expected: the existing parser returns no version history.

- [ ] **Step 3: Implement the minimal parser and merge**

Parse `pageData.versionHistory` alongside `pageData.addOns`, return an empty list when the data is absent or malformed, and let `server/app.ts` replace the lookup fallback only when the product page has valid entries.

- [ ] **Step 4: Run focused server tests**

Run: `npm test -- --run tests/server/productPage.test.ts tests/server/searchAppsApi.test.ts`

Expected: all focused tests pass.

### Task 2: Add the version timeline and screenshot lightbox

**Files:**
- Modify: `src/lib/renderResults.ts`
- Modify: `src/styles.css`
- Test: `tests/frontend/renderResults.test.ts`

- [ ] **Step 1: Write failing frontend tests**

Assert that multiple versions render with their dates and notes, clicking a screenshot opens a dialog, next/previous changes the active image, and `Escape` closes it.

- [ ] **Step 2: Run the focused frontend test and confirm failure**

Run: `npm test -- --run tests/frontend/renderResults.test.ts`

Expected: no version timeline or lightbox exists yet.

- [ ] **Step 3: Implement the minimal DOM interactions**

Render a native disclosure list for all version entries. Wrap screenshots in buttons and add one local dialog per inspector with focus restoration, click-outside close, keyboard navigation, and a visible image counter.

- [ ] **Step 4: Add responsive and focus styling**

Keep the thumbnail grid stable, constrain the dialog image to the viewport, provide visible focus rings, and prevent page scrolling while the dialog is open.

- [ ] **Step 5: Run focused frontend tests**

Run: `npm test -- --run tests/frontend/renderResults.test.ts`

Expected: all focused frontend tests pass.

### Task 3: Verify the user workflow

**Files:**
- No new files

- [ ] **Step 1: Run the full test suite and production build**

Run: `npm test && npm run build`

Expected: all tests pass and Vite produces `dist/` successfully.

- [ ] **Step 2: Run a live Evin API check**

Confirm the response contains `Lifestyle`, more than one version entry, and `found` for both `4.99` and `9.99`.

- [ ] **Step 3: Run a browser workflow check**

Search `Evin` at `http://localhost:5173/`, verify the version history and category are visible, click a screenshot, verify the dialog and navigation, then close with `Escape`.

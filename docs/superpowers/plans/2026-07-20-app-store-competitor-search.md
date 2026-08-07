# App Store Competitor Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web tool that searches the US App Store for one or more app names and shows App Store URL, icon, description, screenshots, and best-effort `4.99` / `9.99` hints.

**Architecture:** Use a small TypeScript frontend served by Vite and a thin Express backend API. The frontend owns input parsing and screenshot-first rendering; the backend owns Apple lookup, conservative match classification, and IAP hint normalization.

**Tech Stack:** Node.js, TypeScript, Vite, Express, Vitest, Supertest

---

## Preconditions

- Current workspace is not a git repository. Commit steps below apply after `git init` if version control is desired.
- Target runtime: Node.js 20+
- Default App Store storefront: `us`

## File Structure

- Create: `package.json`
  Responsibility: scripts, dependencies, dev dependencies
- Create: `tsconfig.json`
  Responsibility: shared TypeScript compiler settings for frontend and backend
- Create: `vite.config.ts`
  Responsibility: Vite config with `/api` proxy to local backend during development and `jsdom` test environment for frontend tests
- Create: `index.html`
  Responsibility: single-page app shell
- Create: `src/main.ts`
  Responsibility: bootstraps UI, wires form submit to backend request
- Create: `src/styles.css`
  Responsibility: screenshot-first layout and state styling
- Create: `src/lib/parseQueries.ts`
  Responsibility: normalize textarea input into ordered query names
- Create: `src/lib/api.ts`
  Responsibility: typed frontend call to `POST /api/search-apps`
- Create: `src/lib/renderResults.ts`
  Responsibility: render matched, uncertain, no-match, and failed result cards
- Create: `shared/types.ts`
  Responsibility: shared request and response contracts between frontend and backend
- Create: `server/app.ts`
  Responsibility: Express app factory with dependency injection for testability
- Create: `server/index.ts`
  Responsibility: dev server entrypoint and port binding
- Create: `server/lib/appleLookup.ts`
  Responsibility: request US App Store search results and normalize raw Apple payloads into public app summaries
- Create: `server/lib/matchResults.ts`
  Responsibility: conservative classification into `matched`, `uncertain_match`, `no_match`
- Create: `server/lib/iapHints.ts`
  Responsibility: return the v1 `unavailable` IAP hint block because the chosen Apple search data source does not expose IAP metadata
- Create: `tests/frontend/parseQueries.test.ts`
  Responsibility: input normalization behavior tests
- Create: `tests/frontend/renderResults.test.ts`
  Responsibility: DOM rendering tests for result states
- Create: `tests/server/matchResults.test.ts`
  Responsibility: result-classification tests
- Create: `tests/server/searchAppsApi.test.ts`
  Responsibility: API contract tests with injected lookup/hint fakes
- Create: `tests/server/iapHints.test.ts`
  Responsibility: IAP hint normalization tests

## Task 1: Bootstrap Tooling And Input Parsing

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/main.ts`
- Create: `src/styles.css`
- Create: `src/lib/parseQueries.ts`
- Test: `tests/frontend/parseQueries.test.ts`

- [ ] **Step 1: Create project scripts and write the failing input test**

`package.json` should include these scripts:

```json
{
  "scripts": {
    "dev:web": "vite",
    "dev:server": "tsx watch server/index.ts",
    "dev": "concurrently \"npm:dev:server\" \"npm:dev:web\"",
    "build": "vite build",
    "test": "vitest run"
  }
}
```

Install dependencies immediately after writing `package.json`:

```bash
npm install express
npm install -D typescript vite vitest supertest tsx concurrently @types/express @types/node @types/supertest jsdom
```

Write this failing test in `tests/frontend/parseQueries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseQueries } from "../../src/lib/parseQueries";

describe("parseQueries", () => {
  it("preserves order and duplicates while trimming empty items", () => {
    expect(parseQueries(" Funce ,\n\nFunce\nAnother App ")).toEqual([
      "Funce",
      "Funce",
      "Another App",
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/frontend/parseQueries.test.ts`
Expected: FAIL with module-not-found or exported-function-not-found for `parseQueries`

- [ ] **Step 3: Write the minimal implementation**

Implement `src/lib/parseQueries.ts`:

```ts
export function parseQueries(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
```

Create the minimal UI shell:

- `index.html` with a root container and a script tag for `src/main.ts`
- `src/main.ts` rendering:
  - page title
  - textarea
  - search button
  - empty results container
- `src/styles.css` with stable widths, screenshot-card container, button, textarea, and basic empty state styling
- `vite.config.ts` with frontend dev server proxy:

```ts
export default defineConfig({
  test: {
    environment: "jsdom",
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/frontend/parseQueries.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json vite.config.ts index.html src/main.ts src/styles.css src/lib/parseQueries.ts tests/frontend/parseQueries.test.ts
git commit -m "chore: bootstrap app competitor search"
```

## Task 2: Define Shared Types And Match Classification

**Files:**
- Create: `shared/types.ts`
- Create: `server/lib/matchResults.ts`
- Test: `tests/server/matchResults.test.ts`

- [ ] **Step 1: Write the failing classification test**

Write `tests/server/matchResults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { classifyCandidates } from "../../server/lib/matchResults";

const candidates = [
  {
    name: "Funce AI",
    developer: "A Dev",
    appStoreUrl: "https://a",
    iconUrl: "https://img/a.png",
    description: "desc a",
    screenshotUrls: [],
  },
  {
    name: "Funce Daily",
    developer: "B Dev",
    appStoreUrl: "https://b",
    iconUrl: "https://img/b.png",
    description: "desc b",
    screenshotUrls: [],
  },
];

describe("classifyCandidates", () => {
  it("returns matched for a clearly dominant prefix match with no close competitor", () => {
    const result = classifyCandidates("Funce", [
      { name: "Funce AI", developer: "A Dev", appStoreUrl: "https://a", iconUrl: "https://img/a.png", description: "desc a", screenshotUrls: [] },
      { name: "Weather Notes", developer: "B Dev", appStoreUrl: "https://b", iconUrl: "https://img/b.png", description: "desc b", screenshotUrls: [] },
    ]);

    expect(result.status).toBe("matched");
    expect(result.app?.name).toBe("Funce AI");
  });

  it("returns uncertain_match when multiple close name matches exist", () => {
    const result = classifyCandidates("Funce", candidates);

    expect(result.status).toBe("uncertain_match");
    expect(result.app?.name).toBe("Funce AI");
    expect(result.alternates).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/matchResults.test.ts`
Expected: FAIL because `classifyCandidates` does not exist

- [ ] **Step 3: Write the minimal implementation**

Define `shared/types.ts` with:

- `SearchAppsRequest`
- `LookupCandidate`
- `MatchedApp`
- `AlternateApp`
- `IapHints`
- `SearchResult`
- `SearchAppsResponse`

Implement `server/lib/matchResults.ts` with a conservative classifier:

```ts
export type LookupCandidate = {
  name: string;
  developer: string;
  appStoreUrl: string;
  iconUrl: string;
  description: string;
  screenshotUrls: string[];
};

export type MatchedApp = LookupCandidate;

export type AlternateApp = Pick<LookupCandidate, "name" | "developer" | "appStoreUrl">;

function toMatchedApp(candidate: LookupCandidate): MatchedApp {
  return {
    name: candidate.name,
    developer: candidate.developer,
    appStoreUrl: candidate.appStoreUrl,
    iconUrl: candidate.iconUrl,
    description: candidate.description,
    screenshotUrls: candidate.screenshotUrls,
  };
}

function toAlternateApp(candidate: LookupCandidate): AlternateApp {
  return {
    name: candidate.name,
    developer: candidate.developer,
    appStoreUrl: candidate.appStoreUrl,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function classifyCandidates(query: string, candidates: LookupCandidate[]): SearchResult {
  const normalizedQuery = query.toLowerCase();
  const wholeWord = new RegExp(`(^|\\s)${escapeRegExp(normalizedQuery)}(\\s|$)`);
  const normalized = candidates.map((candidate) => ({
    ...candidate,
    normalizedName: candidate.name.toLowerCase(),
  }));

  const exact = normalized.filter((candidate) => candidate.normalizedName === normalizedQuery);
  if (exact.length === 1) {
    return {
      query,
      status: "matched",
      app: toMatchedApp(exact[0]),
      alternates: [],
      iapHints: null,
      message: null,
    };
  }

  const plausible = normalized.filter(
    (candidate) =>
      normalizedQuery.length >= 4 &&
      (
        candidate.normalizedName.startsWith(normalizedQuery) ||
        wholeWord.test(candidate.normalizedName) ||
        (normalizedQuery.length >= 5 && candidate.normalizedName.includes(normalizedQuery))
      )
  );

  if (plausible.length === 1) {
    return {
      query,
      status: "matched",
      app: toMatchedApp(plausible[0]),
      alternates: [],
      iapHints: null,
      message: null,
    };
  }

  if (plausible.length > 0) {
    return {
      query,
      status: "uncertain_match",
      app: toMatchedApp(plausible[0]),
      alternates: plausible.slice(1, 3).map(toAlternateApp),
      iapHints: null,
      message: "Possible match found; review alternates",
    };
  }

  return {
    query,
    status: "no_match",
    app: null,
    alternates: [],
    iapHints: null,
    message: "No App Store match found in US store",
  };
}
```

Add one more test case to `tests/server/matchResults.test.ts`:

```ts
it("returns matched for a dominant substring match when the query is specific enough", () => {
  const result = classifyCandidates("tracker", [
    { name: "Daily Habit Tracker", developer: "A Dev", appStoreUrl: "https://a", iconUrl: "https://img/a.png", description: "desc a", screenshotUrls: [] },
    { name: "Weather Notes", developer: "B Dev", appStoreUrl: "https://b", iconUrl: "https://img/b.png", description: "desc b", screenshotUrls: [] },
  ]);

  expect(result.status).toBe("matched");
  expect(result.app?.name).toBe("Daily Habit Tracker");
});

it("returns no_match for short or weak substrings that do not clear the minimum threshold", () => {
  const result = classifyCandidates("ce", [
    { name: "Funce AI", developer: "A Dev", appStoreUrl: "https://a", iconUrl: "https://img/a.png", description: "desc a", screenshotUrls: [] },
  ]);

  expect(result.status).toBe("no_match");
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/matchResults.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/types.ts server/lib/matchResults.ts tests/server/matchResults.test.ts
git commit -m "feat: add conservative match classification"
```

## Task 3: Build The Search API With Injected Apple Lookup

**Files:**
- Create: `server/app.ts`
- Create: `server/index.ts`
- Create: `server/lib/appleLookup.ts`
- Test: `tests/server/searchAppsApi.test.ts`

- [ ] **Step 1: Write the failing API contract test**

Write `tests/server/searchAppsApi.test.ts`:

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app";

describe("POST /api/search-apps", () => {
  it("returns one result per input name in the same order", async () => {
    const app = createApp({
      lookupAppStore: async (query) => {
        if (query === "Funce") {
          return [{ name: "Funce", developer: "A Dev", appStoreUrl: "https://a", iconUrl: "https://i", description: "desc", screenshotUrls: [] }];
        }
        return [];
      },
      buildIapHints: async () => ({ "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" }),
    });

    const response = await request(app)
      .post("/api/search-apps")
      .send({ names: ["Funce", "Missing App"] });

    expect(response.status).toBe(200);
    expect(response.body.results.map((item: any) => item.query)).toEqual(["Funce", "Missing App"]);
    expect(response.body.results.map((item: any) => item.status)).toEqual(["matched", "no_match"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/searchAppsApi.test.ts`
Expected: FAIL because `createApp` does not exist

- [ ] **Step 3: Write the minimal implementation**

Implement `server/app.ts` as an app factory:

- call `app.use(express.json())` before registering routes
- validate that `names` is an array of strings
- preserve input order
- for each query:
  - call `lookupAppStore(query, "us")`
  - pass candidates into `classifyCandidates`
  - if status is `matched` or `uncertain_match`, attach the v1 `unavailable` IAP hint block
  - if lookup throws, return `search_failed`

Core route shape:

```ts
app.use(express.json());

app.post("/api/search-apps", async (req, res) => {
  const names = Array.isArray(req.body?.names) ? req.body.names : null;
  if (!names || !names.every((item) => typeof item === "string")) {
    return res.status(400).json({ message: "names must be an array of strings" });
  }

  const results = [];
  for (const query of names) {
    try {
      const candidates = await deps.lookupAppStore(query, "us");
      const result = classifyCandidates(query, candidates);
      if (result.app) {
        result.iapHints = await deps.buildIapHints();
      }
      results.push(result);
    } catch {
      results.push({
        query,
        status: "search_failed",
        app: null,
        alternates: [],
        iapHints: null,
        message: "Search failed",
      });
    }
  }

  res.json({ results });
});
```

Implement `server/index.ts` to listen on `3001`.

During Task 3, before `server/lib/iapHints.ts` exists, wire a temporary local fallback:

```ts
createApp({
  lookupAppStore,
  buildIapHints: async () => ({
    "4.99": "unavailable",
    "9.99": "unavailable",
    source: "best_effort",
  }),
});
```

When Task 5 is complete, `server/index.ts` must construct the app with the real dependencies:

```ts
createApp({
  lookupAppStore,
  buildIapHints,
});
```

Implement `server/lib/appleLookup.ts` with a single responsibility:

- call the Apple search endpoint with `term=<query>`, `country=us`, and `entity=software`
- map raw payload fields into `LookupCandidate`
- throw on fetch failure or non-OK responses so backend errors surface as `search_failed`
- return an empty array when Apple returns no results

Concrete field mapping example:

- `trackName -> name`
- `sellerName -> developer`
- `trackViewUrl -> appStoreUrl`
- `artworkUrl512` or highest available artwork URL -> `iconUrl`
- `description -> description`
- screenshot URL array field -> `screenshotUrls`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/searchAppsApi.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/app.ts server/index.ts server/lib/appleLookup.ts tests/server/searchAppsApi.test.ts
git commit -m "feat: add app store search api"
```

## Task 4: Render Screenshot-First Result Cards

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/lib/renderResults.ts`
- Modify: `src/main.ts`
- Modify: `src/styles.css`
- Test: `tests/frontend/renderResults.test.ts`

- [ ] **Step 1: Write the failing DOM-rendering test**

Write `tests/frontend/renderResults.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { renderResults } from "../../src/lib/renderResults";

describe("renderResults", () => {
  it("renders a screenshot-first card for a matched app", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "matched",
        app: {
          name: "Funce",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          screenshotUrls: ["https://example.com/1.png", "https://example.com/2.png"],
        },
        alternates: [],
        iapHints: { "4.99": "found", "9.99": "not_found", source: "best_effort" },
        message: null,
      },
    ]);

    expect(host.textContent).toContain("Funce");
    expect(host.textContent).toContain("A Dev");
    expect(host.querySelectorAll("img")).toHaveLength(3);
    expect(host.querySelector("a")?.getAttribute("href")).toContain("apps.apple.com");
  });

  it("renders alternates for an uncertain match", () => {
    const host = document.createElement("div");

    renderResults(host, [
      {
        query: "Funce",
        status: "uncertain_match",
        app: {
          name: "Funce AI",
          developer: "A Dev",
          appStoreUrl: "https://apps.apple.com/us/app/funce-ai",
          iconUrl: "https://example.com/icon.png",
          description: "A short description",
          screenshotUrls: [],
        },
        alternates: [
          {
            name: "Funce Daily",
            developer: "B Dev",
            appStoreUrl: "https://apps.apple.com/us/app/funce-daily",
          },
        ],
        iapHints: { "4.99": "unavailable", "9.99": "unavailable", source: "best_effort" },
        message: "Possible match found; review alternates",
      },
    ]);

    expect(host.textContent).toContain("Possible match found; review alternates");
    expect(host.textContent).toContain("Funce Daily");
  });

  it("renders explicit text for no_match and search_failed states", () => {
    const host = document.createElement("div");

    renderResults(host, [
      { query: "Missing App", status: "no_match", app: null, alternates: [], iapHints: null, message: "No App Store match found in US store" },
      { query: "Broken App", status: "search_failed", app: null, alternates: [], iapHints: null, message: "Search failed" },
    ]);

    expect(host.textContent).toContain("No App Store match found in US store");
    expect(host.textContent).toContain("Search failed");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/frontend/renderResults.test.ts`
Expected: FAIL because `renderResults` does not exist

- [ ] **Step 3: Write the minimal implementation**

Implement `src/lib/api.ts`:

```ts
export async function searchApps(names: string[]) {
  const response = await fetch("/api/search-apps", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });

  if (!response.ok) {
    throw new Error("Search request failed");
  }

  return response.json();
}
```

Implement `src/lib/renderResults.ts` to render:

- query label
- app icon
- app name and developer
- App Store link
- description text
- horizontal screenshot strip
- `IAP hints` line
- alternate candidates section when `status === "uncertain_match"`
- explicit message block when `status` is `no_match` or `search_failed`

Wire `src/main.ts` to:

- read textarea value
- call `parseQueries`
- show `Searching...`
- call `searchApps`
- pass results to `renderResults`
- show a request-level error message when `/api/search-apps` fails before any result payload returns

Update `src/styles.css` for:

- fixed-width cards with responsive collapse on mobile
- icon and screenshot sizing that does not shift layout
- horizontal screenshot scrolling
- status badges for `matched`, `uncertain_match`, `no_match`, `search_failed`

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/frontend/renderResults.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/api.ts src/lib/renderResults.ts src/main.ts src/styles.css tests/frontend/renderResults.test.ts
git commit -m "feat: render app store competitor results"
```

## Task 5: Add IAP Hint Resolution And Final Verification

**Files:**
- Create: `server/lib/iapHints.ts`
- Modify: `server/app.ts`
- Modify: `server/index.ts`
- Test: `tests/server/iapHints.test.ts`
- Modify: `tests/server/searchAppsApi.test.ts`

- [ ] **Step 1: Write the failing IAP hint test**

Write `tests/server/iapHints.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildIapHints } from "../../server/lib/iapHints";

describe("buildIapHints", () => {
  it("returns unavailable for v1 because iTunes Search API does not expose IAP offers", async () => {
    await expect(buildIapHints()).resolves.toEqual({
      "4.99": "unavailable",
      "9.99": "unavailable",
      source: "best_effort",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/iapHints.test.ts`
Expected: FAIL because `buildIapHints` does not exist

- [ ] **Step 3: Write the minimal implementation**

Implement `server/lib/iapHints.ts`:

```ts
export async function buildIapHints() {
  return {
    "4.99": "unavailable",
    "9.99": "unavailable",
    source: "best_effort",
  } as const;
}
```

Update `server/app.ts` so only `matched` and `uncertain_match` results get the fixed v1 unavailable hint block, and preserve `null` for `no_match` and `search_failed`.

Update `server/index.ts` to import the real `buildIapHints` from `server/lib/iapHints.ts` and pass it into `createApp(...)`.

Update `tests/server/searchAppsApi.test.ts` with one extra case:

- a successful app result with `unavailable` hints still returns `matched`
- a thrown lookup dependency returns `search_failed`

- [ ] **Step 4: Run the targeted tests and full suite**

Run: `npm test -- tests/server/iapHints.test.ts`
Expected: PASS

Run: `npm test -- tests/server/searchAppsApi.test.ts`
Expected: PASS

Run: `npm test`
Expected: PASS for all frontend and backend tests

Manual verification:

1. Run `npm install`
2. Run `npm run dev`
3. Open the local Vite URL
4. Search:
   - `Funce`
   - `Funce, Missing App`
   - a weak-match query that should surface alternates
   - two real app names on separate lines
5. Confirm:
   - one card per input query, in the same order
   - US App Store link opens
   - icon, description, and screenshots render
   - uncertain-match cards show alternates
   - no-match and failed states are visible
   - missing IAP hints do not break the card

- [ ] **Step 5: Commit**

```bash
git add server/lib/iapHints.ts server/app.ts tests/server/iapHints.test.ts tests/server/searchAppsApi.test.ts
git commit -m "feat: add iap hint normalization"
```

## Task 6: Final Cleanup And Runbook

**Files:**
- Modify: `src/main.ts`
- Modify: `src/lib/renderResults.ts`
- Modify: `src/styles.css`

- [ ] **Step 1: Write the failing regression test for empty-state behavior**

Add a test to `tests/frontend/renderResults.test.ts`:

```ts
it("renders a distinct empty-submission state before any results exist", () => {
  const host = document.createElement("div");
  renderResults(host, [], false);
  expect(host.textContent).toContain("Paste one or more app names");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/frontend/renderResults.test.ts`
Expected: FAIL because the empty-submission state text is missing

- [ ] **Step 3: Write the minimal implementation**

Refine the UI so it distinguishes:

- initial empty state before any search
- submitted search with no matches
- submitted search with some failures

Keep the code small:

- `src/main.ts` tracks whether a search has been submitted
- `renderResults` accepts `(host, results, hasSearched)`
- `src/styles.css` gets one clear empty-state block and one warning-state block

- [ ] **Step 4: Run test and smoke-check the app**

Run: `npm test -- tests/frontend/renderResults.test.ts`
Expected: PASS

Run: `npm test`
Expected: PASS

Run: `npm run dev`
Expected: frontend and backend both start without port or proxy errors

- [ ] **Step 5: Commit**

```bash
git add src/main.ts src/lib/renderResults.ts src/styles.css tests/frontend/renderResults.test.ts
git commit -m "feat: polish app competitor search states"
```

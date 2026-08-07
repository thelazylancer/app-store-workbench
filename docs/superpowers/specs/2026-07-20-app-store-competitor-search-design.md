# App Store Competitor Search Design

Date: 2026-07-20

## Goal

Build a small local web tool for competitor research on iOS apps.

The user provides one or more competitor names. The tool searches the US App Store and shows the store page information the user cares about:

- App Store URL
- App icon/logo
- App description
- App Store screenshots
- Optional IAP hints for `4.99` and `9.99` when they can be inferred

This is a page-display tool. Export, account systems, saved history, sorting, and advanced filtering are out of scope for the first version.

## Scope

### In scope

- Single-name search
- Multi-name batch search
- US App Store search only
- Search input accepts either:
  - one app name per line
  - comma-separated app names
- Screenshot-first result cards
- Best-effort `4.99` / `9.99` hint detection
- Per-input result status for success, no match, and partial failure

### Out of scope

- CSV or JSON export
- Region switching in the first version
- Login or persistence
- Full in-app purchase catalog extraction
- Hard filtering on `4.99` or `9.99`
- Local image lightbox or screenshot download

## Recommended Approach

Use a single-page frontend plus a thin local backend proxy.

Why this approach:

- It keeps the UI simple.
- It avoids binding the browser directly to Apple search calls.
- It gives one place to normalize Apple results into a stable UI contract.
- It leaves room for future enrichment of IAP hints without changing the page structure.

## Architecture

### Frontend

A single page with:

- a textarea-like search input
- a search action
- a results area

The frontend is responsible for:

- parsing raw input into app-name queries
- sending the query list to the backend
- rendering one result card per input name
- showing loading, empty, and error states
- preserving the original input order in the rendered results

### Backend

A small HTTP service with one primary endpoint:

- `POST /api/search-apps`

Request body:

```json
{
  "names": ["Funce", "Another App"]
}
```

Response shape:

```json
{
  "results": [
    {
      "query": "Funce",
      "status": "matched",
      "app": {
        "name": "Funce",
        "developer": "Example Dev",
        "appStoreUrl": "https://apps.apple.com/us/app/...",
        "iconUrl": "https://...",
        "description": "App description",
        "screenshotUrls": ["https://...", "https://..."]
      },
      "alternates": [],
      "iapHints": {
        "4.99": "found",
        "9.99": "not_found",
        "source": "best_effort"
      },
      "message": null
    }
  ]
}
```

Contract rules for every result object:

- `query`: always present
- `status`: always present
- `app`: present for `matched` and `uncertain_match`; `null` for `no_match` and `search_failed`
- `alternates`: always present; empty array unless `status` is `uncertain_match`
- `iapHints`: present for `matched` and `uncertain_match`; `null` for `no_match` and `search_failed`
- `message`: `null` for clean `matched`; required for `uncertain_match`, `no_match`, and `search_failed`

Example uncertain match:

```json
{
  "query": "Funce",
  "status": "uncertain_match",
  "app": {
    "name": "Funce AI Chat",
    "developer": "Example Dev",
    "appStoreUrl": "https://apps.apple.com/us/app/...",
    "iconUrl": "https://...",
    "description": "App description",
    "screenshotUrls": ["https://..."]
  },
  "alternates": [
    {
      "name": "Funce Daily",
      "developer": "Other Dev",
      "appStoreUrl": "https://apps.apple.com/us/app/..."
    }
  ],
  "iapHints": {
    "4.99": "unavailable",
    "9.99": "unavailable",
    "source": "best_effort"
  },
  "message": "Possible match found; review alternates"
}
```

Example no match:

```json
{
  "query": "Missing App",
  "status": "no_match",
  "app": null,
  "alternates": [],
  "iapHints": null,
  "message": "No App Store match found in US store"
}
```

The backend is responsible for:

- querying Apple search endpoints for the US storefront
- choosing the best match for each input name
- returning alternate candidates when confidence is weak
- extracting the fields needed by the UI
- attempting best-effort IAP hint detection
- preserving result order to match the request order

## Search and Matching Rules

Each input name is handled independently.

### Input normalization

The frontend:

- splits on newlines and commas
- trims whitespace
- removes empty items
- preserves duplicates and original order exactly after trimming and empty-item removal

Input caveat:

- app names containing literal commas are not supported in the first version
- newline-separated input is the safest format for batch searches

### Candidate retrieval

For each normalized name, the backend requests App Store search results for the US storefront.

### Match ranking

Ranking is based on:

1. app name exact match
2. app name substring or prefix match
3. developer-name support as a weak tie-breaker

Minimal decision rule:

- `matched`: exact name match, or a clearly dominant prefix or substring match with no close competing candidate
- `uncertain_match`: at least one plausible candidate exists, but there is a close competing candidate or weak name evidence
- `no_match`: no plausible candidate clears the minimum acceptance threshold

### Returned match behavior

Use `status` as the single contract for match handling:

- `matched`: one accepted app result, no alternates required
- `uncertain_match`: one primary app candidate plus up to two alternates
- `no_match`: no candidate is acceptable enough to show as a result
- `search_failed`: the lookup request failed before a usable candidate decision could be made

Rules:

- If the backend accepts one result with strong enough name evidence, return `status: "matched"`.
- If the backend finds a plausible primary candidate but the evidence is not strong enough for a clean match, return `status: "uncertain_match"` and include up to two alternates.
- If candidates exist but none clear the minimum acceptance threshold, return `status: "no_match"`.
- If the search request itself fails, return `status: "search_failed"`.

The first version should favor understandable behavior over aggressive fuzzy matching. A false positive is worse than a no-match result for this tool.

## Result Card Design

Use screenshot-first cards.

Each card shows:

- query name
- matched app name
- developer name
- App Store link
- icon/logo
- short description block
- horizontally scrollable screenshots
- IAP hint summary

If alternates exist, show them in a compact secondary area under the main card, clearly labeled as uncertain matches.

## IAP Hint Strategy

`4.99` and `9.99` are hints, not gating criteria.

The first version must keep this step narrow:

- use only data reachable from the same Apple result payload or directly linked Apple-accessible metadata already fetched for the matched app
- do not add general store-page scraping, third-party scraping, or multi-source enrichment in v1
- if the chosen Apple-accessible data path does not expose usable IAP information, stop and return `unavailable`

Rules:

- If a price hint is found, mark it as `found`.
- If a price hint is not found, mark it as `not_found`.
- If the hint lookup path is unavailable for that result, mark it as `unavailable`.
- `found`, `not_found`, and `unavailable` apply per price key, so `4.99` and `9.99` can differ within the same result.

The UI should never treat missing IAP hints as a failed app search.

## States and Error Handling

The page only needs a small set of states:

- idle
- searching
- results shown
- no results or errors

Batch searches must degrade gracefully:

- one query failing must not block other query results
- one query with missing IAP hints must still render its store data

Per-result statuses:

- `matched`
- `uncertain_match`
- `no_match`
- `search_failed`

Messages should be explicit, for example:

- `No App Store match found in US store`
- `Search failed`
- `IAP hints unavailable`

## Data Flow

1. User enters one or more app names.
2. Frontend normalizes the input into a query array.
3. Frontend sends `POST /api/search-apps`.
4. Backend searches the US App Store for each query.
5. Backend ranks candidates and builds normalized result objects.
6. Backend attempts best-effort IAP hint enrichment.
7. Frontend renders one screenshot-first card per query.

## Testing and Verification

First-version verification should cover these cases:

1. A single app name with a clear App Store result.
2. Multiple app names in one request.
3. Mixed success where one app is real and one does not exist.
4. A result where store metadata renders but IAP hints are absent.
5. A weak match case where alternates are shown.

Minimum acceptance checks:

- the page accepts both single and batch input
- US store links are returned
- icon, description, and screenshots render when present
- no-match cases are visible and not silently dropped
- missing `4.99` or `9.99` hints do not crash the result card

## Success Criteria

The first version is successful when:

- the user can paste one or many app names into a local page
- the tool returns a clear card per input name
- each successful card shows App Store URL, icon, description, and screenshots from the US store
- the tool surfaces `4.99` and `9.99` only as best-effort hints
- failed or ambiguous matches are clearly labeled instead of hidden

## Implementation Notes for Planning

The implementation plan should stay small and likely break into:

1. scaffold local web app and backend
2. build search API and result normalization
3. build screenshot-first UI
4. add status handling and best-effort IAP hints
5. verify with real app-name inputs

No additional features should be added unless they are required to satisfy the scope above.

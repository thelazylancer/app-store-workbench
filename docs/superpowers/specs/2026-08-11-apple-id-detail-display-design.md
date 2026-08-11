# Apple ID Detail Display Design

Date: 2026-08-11

## Goal

Show the numeric Apple App Store ID (`trackId`) for each matched app in the detail inspector after a search.

## Scope

- Read `trackId` from the existing Apple Search API response.
- Normalize a positive integer `trackId` as an optional numeric `appleId` field in the shared app result types.
- Explicitly preserve the field when `classifyCandidates` constructs a `MatchedApp`.
- Render an `Apple ID` row in the existing `商店信息` section.
- Keep the app matched when Apple does not return a numeric `trackId`; render `未提供` for the detail row.
- Do not add Bundle ID display or change the search/matching strategy.

## Data Flow

The backend already fetches Apple Search results in `server/lib/appleLookup.ts`. It will add the optional `trackId` to the response shape and map it to `appleId`. Since `MatchedApp` extends `LookupCandidate`, the field will flow through `classifyCandidates` without additional matching logic.

The frontend will read `result.app.appleId` in `src/lib/renderResults.ts`, convert a valid number to text, and append one `Apple ID` row to the existing store information list. Missing, null, zero, negative, non-integer, or non-numeric IDs will render `未提供` rather than breaking the inspector. The row applies to matched and uncertain-match detail inspectors; no-match and search-failed results remain unchanged.

## Testing

- Add a server lookup test proving a numeric Apple `trackId` becomes `appleId` and malformed values are omitted.
- Add a classifier regression test proving `appleId` survives `MatchedApp` construction.
- Add frontend renderer tests proving a valid Apple ID appears and a missing/malformed ID renders `未提供` for a detail inspector.
- Keep existing fixture objects valid by making the new field optional.
- Run the focused tests, full Vitest suite, and Vite build.

## Success Criteria

- Searching a real app displays its numeric Apple ID in the detail page.
- Existing App Store URL, screenshots, IAP, version history, matching states, and no-match states remain unchanged.
- Tests and production build pass.

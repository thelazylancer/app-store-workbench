# App Detail Inspector Enhancements Design

Date: 2026-08-05

## Goal

Make the App Store research workbench faster to scan while giving users a complete view of the Apple data that is actually available: category, version history, and enlarged screenshot inspection.

## Scope

- Keep the existing US-only search and Chinese workbench layout.
- Preserve the category returned by Apple lookup and show an explicit fallback when it is unavailable.
- Read all version entries exposed by the App Store product-page payload. Keep the lookup version as a fallback when the product page does not expose history.
- Make every screenshot a keyboard-accessible trigger for one shared lightbox with previous/next controls, counter, `Escape` close, and click-outside close.
- Keep the existing IAP and match-status behavior unchanged.

## Data Flow

Apple lookup supplies the normalized app identity, category, screenshots, and current-version fallback. The US product-page request supplies `pageData.versionHistory` and `pageData.addOns`. The backend replaces the fallback version list only when the product page returns at least one valid history entry, then the frontend renders the normalized list.

Version history is described as the complete history exposed by the current public App Store response. Missing history is a valid unavailable state, not an error.

## Interaction Design

The inspector keeps the latest version in the compact store-information area and adds a native disclosure section for the full history. Each entry shows version, release date, and release notes without forcing the user to navigate away from the result.

The screenshot strip uses real buttons around the images so the action is discoverable and keyboard reachable. The lightbox is a fixed dialog with a stable image frame, a visible counter, close control, and previous/next controls. It restores focus to the clicked thumbnail after closing and locks page scrolling while open.

## Verification

- Parser tests cover Apple JSON version history and existing HTML IAP extraction.
- Frontend tests cover the version timeline, screenshot trigger, navigation, and close behavior.
- Full Vitest suite and Vite build must pass.
- A live `Evin` search must show its category, multiple version entries, and both `$4.99` and `$9.99` hints; a browser check must open and close the screenshot lightbox.

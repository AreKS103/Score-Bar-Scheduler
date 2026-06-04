# AI Architecture & Coding Mistakes Log
*Local project memory. Logs failed assumptions, broken code, and context errors.*
## Log Entries

### 2026-05-24
- **The Error:** Roland Garros tennis matches were restored but appeared under the WTA/ATP tour bucket instead of the French Open/Roland Garros competition.
- **The Mistake:** Treated the ESPN tennis endpoint (`tennis/atp` or `tennis/wta`) as the authoritative competition label, even though ESPN returns Grand Slam events with both men's and women's draws inside both endpoints.
- **The Rule:** For tennis, classify by tournament name and ESPN grouping/draw metadata first; use the endpoint only as a fetch source. Grand Slams need their own schedule sections, and singles/doubles/mixed draws should be retained when ESPN provides real competitor names.

### 2026-05-24
- **The Error:** The first mobile calendar fix did not appear on the live iPhone embed, and the calendar tab still had dead space after switching from the taller list view.
- **The Mistake:** Fixed the iframe renderer but did not remove the WordPress wrapper's stale layout prefetch and hard-coded `480px` tab-switch height; also measured iframe height from `documentElement.scrollHeight`, which can preserve the old viewport height instead of shrinking to the new content.
- **The Rule:** For iframe UI fixes, update both the embedded document and the parent wrapper. Measure the actual content root for auto-height, remove stale prefetch/reset scripts, and verify the plugin build/release path when PHP wrappers change.

### 2026-06-03
- **The Error:** Cambodia National Team fixtures were added from SportsDB source probes but did not appear in the actual `/api/events` response for June 3-6.
- **The Mistake:** Verified direct SportsDB endpoints and a standalone script, but did not test the integrated route; the route called team JSON endpoints after heavy SportsDB fan-outs, hit 429 rate limits, and `sdbFetch` silently returned empty arrays.
- **The Rule:** For SportsDB additions, always verify the real `/api/events` response for the requested date window. Avoid adding extra JSON API calls behind heavy fan-outs; prefer cached page-derived data or existing cached endpoints, and log 429s instead of silently swallowing them.

### 2026-06-04
- **The Error:** Cambodia fixtures could display raw SportsDB UTC times on the live app instead of the user's selected timezone.
- **The Mistake:** Verified the server conversion for one timezone, but did not audit the full settings-to-route path or prove the resolved timezone in the API response.
- **The Rule:** For timezone bugs, verify provider source timezone, route `timeZone` param, API resolved timezone, and final `event.date/time` together. Preserve provider UTC timestamps (`isoDate`) so every displayed time can be rechecked against the requested IANA timezone.

### 2026-06-04
- **The Error:** Same-account/org schedule selections flickered selected/unselected because remote or fetched full snapshots were auto-saved back as local removal diffs.
- **The Mistake:** Treated every store change as user intent, even when the change came from realtime, embed switching, or server snapshot application; the selection row was also user-scoped while the workflow was org-shared.
- **The Rule:** Selection sync must distinguish explicit local edits from programmatic remote state. Persist operation diffs through a server-owned authoritative scope, and never auto-save remote/fetch/snapshot-applied absent keys as removals.

### 2026-06-04
- **The Error:** Clearing all selections from the `Homepage` embed appeared to work briefly, then the old selections reappeared.
- **The Mistake:** The debounced autosave called `saveSelectionToSupabase(state)` without the active embed target, so the empty clear was saved to the default slot while the `Homepage` row kept its old selected matches.
- **The Rule:** Every selection save path must pass the resolved embed target. When debugging embed-specific sync, compare the intended embed row and the default row in Supabase before changing merge logic.

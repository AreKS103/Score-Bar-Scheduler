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

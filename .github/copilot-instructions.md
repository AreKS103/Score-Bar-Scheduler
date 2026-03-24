# Score Bar Scheduler — Copilot Instructions

## What this project is
A **Next.js 14 (App Router) SaaS dashboard** that lets bar/venue owners build weekly sports schedules, preview them, and publish them to their WordPress site. The dashboard lives on Vercel; schedules are rendered inside an iframe on WordPress via a custom plugin.

**Production URL:** `https://score-bar-scheduler.vercel.app`  
**Local dev:** `http://localhost:3000`

---

## Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router), TypeScript |
| Styling | **Tailwind CSS v4 + CSS Modules** — no `@apply`, no Chakra/MUI |
| UI primitives | Radix UI (`radix-ui`), Lucide icons |
| Auth & DB | Supabase (`@supabase/ssr`) — SSR client for server, browser client for components |
| State | Zustand stores (`lib/store.ts`, `lib/favoritesStore.ts`, `lib/themeStore.ts`, `lib/timezoneStore.ts`) |
| Data fetching | Direct `fetch` in API routes; SWR not used except in `fetchAllSports.ts` |
| WordPress | PHP plugin in `wordpress-plugin/` — embeds via iframe shortcode + Elementor widget |

---

## Project Structure

```
src/
  app/
    schedule/page.tsx       ← Main dashboard page (ALL state lives here)
    embed/[apiKey]/         ← Public iframe endpoint — NO auth
    login/page.tsx          ← Auth page (auto-redirects if session valid)
    api/
      events/route.ts       ← Aggregates ESPN + SportsDB + OpenF1 sports data
      schedule-history/     ← CRUD for published_schedules table
      scheduled-publish/    ← Future-dated publish queue
      embed-instances/      ← WordPress embed instance registry
      keys/generate/        ← API key generation (hashed)
      plugin/verify/        ← WordPress plugin handshake
      publish/              ← Triggers WordPress update
      custom-events/        ← User-created manual events
      auth/                 ← Supabase auth callbacks + delete-account
  components/
    SportFilter.tsx         ← Left sidebar: sport/league selector, favorites, drag-reorder
    MatchCard.tsx           ← Individual match item
    LeagueSection.tsx       ← Groups matches by league
    PreviewPanel.tsx        ← Right panel: live HTML preview (DOMPurify sanitized)
    PublishButton.tsx       ← Publish/schedule/undo/history controls
    UserProfileMenu.tsx     ← Bottom-left avatar, theme toggle, settings, logout
    SettingsModal.tsx       ← API key, account, timezone, WordPress integration
    BusinessInfoModal.tsx   ← Business name/logo/website
    AddMatchModal.tsx       ← Custom event creation
    EditMatchModal.tsx      ← Custom event editing
    DateRangeCalendar.tsx   ← Week date range picker
  lib/
    fetchAllSports.ts       ← Reads from events API, merges ESPN+SportsDB+F1
    store.ts                ← Main Zustand schedule store
    generateHTML.ts         ← Builds HTML for COPY only (NOT served by embed)
    renderEmbed.ts          ← Embed iframe HTML (list layout) ← WHAT IS LIVE
    renderCalendar.ts       ← Embed iframe HTML (calendar layout) ← WHAT IS LIVE
    api/espn.ts             ← ESPN unofficial scoreboard API
    api/sportsdb.ts         ← TheSportsDB free key
    api/openf1.ts           ← OpenF1 F1 session data
  types/index.ts            ← MatchEvent, SportConfig, ESPN types, store types
wordpress-plugin/
  scorebar-scheduler.php
  includes/
    settings.php            ← API key verify + settings page
    shortcode.php           ← [scorebar_schedule] shortcode
    elementor-widget.php    ← Elementor widget + controls
    elementor-editor-sync.js← postMessage bridge for Elementor preview
supabase/migrations/        ← 001–020, applied in order
```

---

## Key Architectural Rules

### Embed rendering
- `generateHTML.ts` output is **NEVER served** to visitors — it is only used for the "Copy HTML" button in the dashboard.
- The live embed (`/embed/[apiKey]`) calls `renderEmbed.ts` (list) or `renderCalendar.ts` (calendar) at request time from the stored `events_snapshot` JSONB.
- Changing `renderEmbed.ts` or `renderCalendar.ts` requires **Vercel redeploy + user must re-publish** their schedule to pick up changes.

### Authentication
- Middleware (`src/middleware.ts` → `lib/supabase/middleware.ts`) handles session refresh on every request.
- `/embed/*` and `/api/*` routes are **public** — no auth redirect.
- Use `createClient()` from `lib/supabase/client.ts` in client components; `createClient()` from `lib/supabase/server.ts` in API routes/server actions.
- Login page auto-redirects to `/schedule` if session is already valid.

### API Key security
- Keys are `sb_live_` + 48 hex chars (plaintext shown once on generation).
- Only the **SHA-256 hash** is stored in `user_api_keys.key_hash`.
- The embed route hashes the incoming key to look up the user — never stores/compares plaintext.

### Supabase tables (latest schema after migration 020)
- `favorites` — user's sport/league order
- `published_schedules` — schedule snapshots with `embed_target`, up to **50 per embed** (MAX_HISTORY=50)
- `scheduled_publishes` — future-dated publish queue with `embed_target`
- `embed_instances` — registered WordPress embeds (display_id, embed_id, widget_id, site_url)
- `user_api_keys` — hashed API key + connected_site
- `custom_events` — user manual events keyed by `embed_id`
- `user_selections` — per-embed saved selections
- `business_info` — business name, logo URL, website, phone, description
- Storage bucket: `business-logos` (public, 5 MB, images only)

### WordPress plugin ↔ App connection
1. User generates API key in SettingsModal (shown once).
2. Paste key into WordPress plugin settings page → plugin POSTs to `/api/plugin/verify`.
3. Shortcode / Elementor widget builds `<iframe src="/embed/{key}?embedId=...&layout=...">`.
4. Embed route hashes key → finds `user_id` → returns live HTML.

### embed_target / publish target
- Each WordPress embed has a `display_id` (friendly name like "Homepage").
- `publishTarget` in the dashboard is the `embed_id` or `display_id` for the selected embed.
- History, scheduled publishes, and undo are all **scoped per embed_target**.

---

## Coding Conventions

- **All components are `'use client'`** unless they are pure server API routes.
- **No Tailwind `@apply`** — utility classes only in JSX.
- **No hardcoded API keys** — use `process.env.NEXT_PUBLIC_*` or server-only `process.env.*`.
- Error boundaries: API routes return `NextResponse.json({ error: '...' }, { status: NNN })`.
- Use `cn()` from `lib/utils.ts` for conditional class names.
- Icons: always from `lucide-react`.
- Zustand stores: use selectors (`useStore(s => s.field)`) to avoid unnecessary re-renders.
- When adding a new Supabase table, create a new migration file `NNN_description.sql` with full RLS policies.
- DOMPurify is used before any `dangerouslySetInnerHTML` (`PreviewPanel.tsx`).

---

## Environment Variables

```
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-only, for admin operations
NEXT_PUBLIC_SPORTSDB_KEY=123     # free tier
SCOREBAR_APP_VERCEL_DOMAIN=score-bar-scheduler.vercel.app
```

---

## Common Patterns

### Adding a new API route
```ts
// src/app/api/my-feature/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // ...
}
```

### Adding a new modal
- Create `src/components/MyModal.tsx` with `'use client'`
- Props: `isOpen: boolean; onClose: () => void`
- Add state to `schedule/page.tsx`: `const [myModalOpen, setMyModalOpen] = useState(false)`
- Render at bottom of page JSX alongside other modals

### Adding a new migration
- Create `supabase/migrations/021_description.sql`
- Always include `enable row level security` + policies
- Apply via Supabase Dashboard → SQL Editor

---

## Dev Workflow

- `npm run dev` — starts Next.js dev server (uses `--webpack` flag)
- Build outputs to `%LOCALAPPDATA%/scorebarschedule-next` (outside OneDrive to avoid EBUSY)
- Never copy `node_modules` between machines — always `npm ci`
- WordPress plugin zip is built with `npm run build:plugin`
- League logos downloaded with `npm run download:league-logos`

---

## What NOT to do

- Do **not** serve `html_content` from `published_schedules` in the embed route — always re-render from `events_snapshot`.
- Do **not** add auth checks to `/embed/*` routes — they are intentionally public.
- Do **not** store plaintext API keys anywhere — only hashes.
- Do **not** use `dangerouslySetInnerHTML` without `DOMPurify.sanitize()`.
- Do **not** use wildcard `'*'` in `postMessage` — derive the target origin from the iframe's `src`.
- Do **not** add Tailwind `@apply` or import global utility CSS.
- Do **not** create new Supabase queries without RLS policies.

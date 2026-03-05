# SCORE Sports Bar — Schedule Admin

Admin tool for **SCORE Sports Bar & Grill** (Phnom Penh, Cambodia). Fetches upcoming sports matches from ESPN, OpenF1, and TheSportsDB, lets staff curate the weekly schedule, then pushes formatted HTML to the WordPress website.

## Features

- **Multi-source fetch**: ESPN (12+ football leagues, UFC, AFL), OpenF1 (F1 races), TheSportsDB (MotoGP, NRL, CPL)
- **Smart scheduling**: All times converted to ICT (Phnom Penh, UTC+7) with optional local-timezone toggle
- **Cross-referencing**: Deduplicates matches that appear in multiple APIs
- **Curation tools**: Select/deselect, star highlights, league spotlights, assign screen tags
- **Bulk operations**: Batch select/deselect per league, bulk tagging
- **Manual entry**: Add custom matches for events not covered by APIs
- **HTML generator**: Produces WordPress-ready HTML grouped by sport → league → date
- **WordPress push**: One-click publish via custom REST endpoint (server-side credentials only)
- **Preview panel**: Resizable side panel with live preview, reorderable leagues, copy HTML

## Setup

### 1. Install & Run

```bash
git clone https://github.com/AreKS103/Score-Bar-Scheduler.git
cd Score-Bar-Scheduler
npm install
cp .env.example .env.local   # fill in WP credentials
npm run dev
```

Open http://localhost:3000

### 2. Environment Variables

Create `.env.local` with:

```env
WP_SITE_URL=https://scorekh.com
WP_USERNAME=your_wp_username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

Credentials are **server-side only** — never exposed to the browser.

### 3. WordPress Setup (One-Time)

1. **Install PHP Snippet**: Paste the Score Schedule REST endpoint code into WPCode Lite (or `functions.php`). This creates:
   - `POST /wp-json/score/v1/schedule` — receives HTML
   - `[score_schedule]` shortcode — renders it on the page

2. **Elementor Page (ID: 327)**:
   - Add a single HTML Widget containing: `[score_schedule]`
   - Save & Publish

3. **Application Password**:
   - WP Admin → Users → Your Profile → Application Passwords
   - Create one named "Score Admin App"
   - Add to `.env.local`

No extra plugins required — Application Passwords are built into WordPress 5.6+.

## Project Structure

```
src/
├── app/
│   ├── layout.tsx              # Root layout (dark mode)
│   ├── page.tsx                # Redirects to /schedule
│   ├── globals.css             # Theme variables + scrollbar
│   ├── schedule/page.tsx       # Main schedule curation view
│   ├── preview/page.tsx        # Full-page HTML preview
│   ├── settings/page.tsx       # Redirects to /schedule (modal)
│   └── api/
│       ├── publish/route.ts    # POST — push HTML to WordPress
│       ├── delete-schedule/    # POST — clear published schedule
│       └── test-connection/    # GET  — verify WP credentials
├── components/
│   ├── MatchCard.tsx           # Individual match row
│   ├── LeagueSection.tsx       # Grouped league block
│   ├── AddMatchModal.tsx       # Manual entry form
│   ├── PreviewPanel.tsx        # Rendered HTML preview
│   ├── PublishButton.tsx       # Split publish + delete dropdown
│   ├── SettingsModal.tsx       # Timezone + WP connection modal
│   ├── SearchField.tsx         # Fuzzy search (Fuse.js)
│   ├── SportFilter.tsx         # Sidebar sport/league filter
│   └── DateRangeCalendar.tsx   # Date range picker
├── lib/
│   ├── api/
│   │   ├── espn.ts             # ESPN scoreboard API
│   │   ├── openf1.ts           # OpenF1 sessions API
│   │   └── sportsdb.ts        # TheSportsDB league API
│   ├── config.ts               # Sports config + league ordering
│   ├── fetchAllSports.ts       # Parallel fetch + cross-reference
│   ├── generateHTML.ts         # HTML output engine
│   ├── store.ts                # Zustand schedule store
│   ├── timezone.ts             # UTC → ICT conversion helpers
│   ├── timezoneStore.ts        # Zustand timezone preferences
│   └── utils.ts                # cn() Tailwind merge helper
└── types/
    └── index.ts                # All TypeScript interfaces
```

## Security

- WordPress credentials stored **server-side only** (`WP_USERNAME`, `WP_APP_PASSWORD`)
- API routes validate input size (max 500 KB), content type, and return proper error codes
- Security headers: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`
- No client-side credential storage — all WP operations proxied through Next.js API routes
- HTML output sanitised via `escapeHTML()` before WordPress injection

## Tech Stack

- **Next.js 16** (App Router, React Compiler)
- **React 19** + **TypeScript 5**
- **Tailwind CSS 4** (oklch dark theme)
- **Zustand 5** (state management)
- **date-fns + date-fns-tz** (timezone handling)
- **Lucide React** (icons)
- **Fuse.js** (fuzzy search)
- **shadcn/ui** (Radix-based components)

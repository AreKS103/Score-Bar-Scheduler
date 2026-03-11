-- ScoreBarSchedule — User Preferences table
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────

-- 3. User preferences — KV store for settings (theme, timezone, etc.)
create table if not exists public.user_preferences (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.user_preferences enable row level security;
create policy "own_prefs_select" on public.user_preferences for select using (auth.uid() = user_id);
create policy "own_prefs_insert" on public.user_preferences for insert with check (auth.uid() = user_id);
create policy "own_prefs_update" on public.user_preferences for update using (auth.uid() = user_id);

-- 4. User selections — persists event selections across devices
create table if not exists public.user_selections (
  user_id           uuid primary key references auth.users(id) on delete cascade,
  selections        jsonb not null default '{}',
  league_order      text[] not null default '{}',
  featured_leagues  jsonb not null default '{}',
  updated_at        timestamptz not null default now()
);
alter table public.user_selections enable row level security;
create policy "own_sel_select" on public.user_selections for select using (auth.uid() = user_id);
create policy "own_sel_insert" on public.user_selections for insert with check (auth.uid() = user_id);
create policy "own_sel_update" on public.user_selections for update using (auth.uid() = user_id);

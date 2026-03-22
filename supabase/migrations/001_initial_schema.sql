-- Scheduler — Supabase Schema
-- Run in Supabase Dashboard → SQL Editor → New Query
-- ─────────────────────────────────────────────────

-- 1. Favorites — stores user's ordered favorite sport IDs
create table if not exists public.favorites (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  favorite_order text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.favorites enable row level security;
create policy "own_favorites_select" on public.favorites for select using (auth.uid() = user_id);
create policy "own_favorites_insert" on public.favorites for insert with check (auth.uid() = user_id);
create policy "own_favorites_update" on public.favorites for update using (auth.uid() = user_id);

-- 2. Published schedule snapshots — up to 4 weeks of history
create table if not exists public.published_schedules (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  week_label       text not null,
  date_range_start text not null,
  date_range_end   text not null,
  html_content     text not null,
  events_snapshot  jsonb not null,
  league_order     text[] not null default '{}',
  featured_leagues jsonb not null default '{}',
  published_at     timestamptz not null default now()
);
alter table public.published_schedules enable row level security;
create policy "own_schedules_select" on public.published_schedules for select using (auth.uid() = user_id);
create policy "own_schedules_insert" on public.published_schedules for insert with check (auth.uid() = user_id);
create policy "own_schedules_delete" on public.published_schedules for delete using (auth.uid() = user_id);
create index if not exists idx_pub_sched_user_date on public.published_schedules (user_id, published_at desc);

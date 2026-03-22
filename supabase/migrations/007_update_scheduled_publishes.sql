-- 007_update_scheduled_publishes.sql
ALTER TABLE public.scheduled_publishes 
ADD COLUMN IF NOT EXISTS events_snapshot JSONB,
ADD COLUMN IF NOT EXISTS date_range_start TEXT,
ADD COLUMN IF NOT EXISTS date_range_end TEXT,
ADD COLUMN IF NOT EXISTS league_order TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS featured_leagues JSONB DEFAULT '{}';

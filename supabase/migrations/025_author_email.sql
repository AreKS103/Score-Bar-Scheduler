-- Add author_email column to published_schedules so history can show who published each schedule.
-- Uses IF NOT EXISTS so it's safe to run multiple times.
ALTER TABLE published_schedules ADD COLUMN IF NOT EXISTS author_email text;

-- Store the org-wide timezone on the organizations table.
-- The org creator sets this; all org members inherit it so published
-- schedules are consistent regardless of each member's local timezone.
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'UTC';

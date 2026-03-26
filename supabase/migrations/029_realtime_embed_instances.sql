-- Enable Supabase Realtime for the embed_instances table.
-- This allows the frontend to receive WebSocket push notifications when
-- embed instances are inserted, updated, or deleted (e.g. WordPress beacon
-- registering a new embed, or another device renaming/removing one).
ALTER PUBLICATION supabase_realtime ADD TABLE public.embed_instances;

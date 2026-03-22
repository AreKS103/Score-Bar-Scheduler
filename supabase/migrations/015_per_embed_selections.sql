-- Migration 015: Scope user_selections per embed instance.
--
-- Previously the table held one row per user (user_id as PRIMARY KEY).
-- Now it holds one row per (user_id, embed_target) so each embed has its own
-- independent set of selected matches / league order / featured leagues.
--
-- embed_target = ''       → the "global / All-embeds" slot (backwards-compat row
--                            for users who have not yet registered any embeds)
-- embed_target = '#1'     → auto-labelled first unnamed embed
-- embed_target = 'sidebar'→ named embed with embed_id='sidebar'

-- 1. Drop the old single-column primary key
ALTER TABLE user_selections DROP CONSTRAINT user_selections_pkey;

-- 2. Add the embed_target discriminator column.
--    Existing rows (old global state) receive '' so they stay accessible.
ALTER TABLE user_selections
  ADD COLUMN IF NOT EXISTS embed_target TEXT NOT NULL DEFAULT '';

-- 3. New composite primary key
ALTER TABLE user_selections
  ADD PRIMARY KEY (user_id, embed_target);

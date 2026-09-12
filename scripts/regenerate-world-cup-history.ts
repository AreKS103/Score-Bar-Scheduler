import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { generateHTML } from '../src/lib/generateHTML';
import { WORLD_CUP_SPORT_ID } from '../src/lib/worldCup';
import type { MatchEvent } from '../src/types';

loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Supabase environment variables are not configured');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main(): Promise<void> {
  const { data: rows, error } = await supabase
    .from('published_schedules')
    .select('id, embed_target, events_snapshot, league_order, featured_leagues, html_content')
    .like('html_content', `%${WORLD_CUP_SPORT_ID}%`);

  if (error) throw new Error(error.message);

  let updated = 0;
  for (const row of rows ?? []) {
    const events = Array.isArray(row.events_snapshot)
      ? (row.events_snapshot as MatchEvent[]).filter((event) => event?.sportId !== WORLD_CUP_SPORT_ID)
      : [];
    const leagueOrder = Array.isArray(row.league_order) ? row.league_order as string[] : [];
    const featuredLeagues = row.featured_leagues && typeof row.featured_leagues === 'object'
      ? row.featured_leagues as Record<string, string>
      : {};
    const htmlContent = generateHTML(
      events,
      leagueOrder,
      new Map(Object.entries(featuredLeagues)),
      typeof row.embed_target === 'string' ? row.embed_target : undefined,
    );

    const { error: updateError } = await supabase
      .from('published_schedules')
      .update({ html_content: htmlContent, events_snapshot: events })
      .eq('id', row.id);
    if (updateError) throw new Error(`Failed to regenerate ${row.id}: ${updateError.message}`);
    updated++;
  }

  const { count, error: verifyError } = await supabase
    .from('published_schedules')
    .select('id', { count: 'exact', head: true })
    .like('html_content', `%${WORLD_CUP_SPORT_ID}%`);
  if (verifyError) throw new Error(verifyError.message);
  if ((count ?? 0) !== 0) throw new Error(`${count} stale World Cup HTML rows remain`);

  console.log(`Regenerated ${updated} published schedule histories`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

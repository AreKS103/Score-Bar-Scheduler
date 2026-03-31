import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const admin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * GET /api/org/creator-settings
 *
 * Returns the org **creator's** WordPress connection and timezone so that
 * non-creator members can display the connected site (read-only) and use
 * the creator's timezone for publishing.
 *
 * Response:
 *  { isCreator, creatorConnectedSite, orgTimezone }
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Find user's active org
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id, organizations(id, created_by, timezone)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!membership?.organizations) {
      return NextResponse.json({ isCreator: true, creatorConnectedSite: null, orgTimezone: null });
    }

    const orgs = membership.organizations as unknown as { id: string; created_by: string; timezone: string }[] | { id: string; created_by: string; timezone: string };
    const org = Array.isArray(orgs) ? orgs[0] : orgs;
    if (!org) {
      return NextResponse.json({ isCreator: true, creatorConnectedSite: null, orgTimezone: null });
    }
    const isCreator = org.created_by === user.id;

    // Fetch the creator's connected_site from user_api_keys
    let creatorConnectedSite: string | null = null;
    const { data: keyRow } = await admin
      .from('user_api_keys')
      .select('connected_site')
      .eq('user_id', org.created_by)
      .single();
    creatorConnectedSite = keyRow?.connected_site ?? null;

    return NextResponse.json({
      isCreator,
      creatorConnectedSite,
      orgTimezone: org.timezone || null,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

/**
 * PATCH /api/org/creator-settings
 *
 * Allows the org **creator** to update the org timezone.
 * Body: { timezone: string }
 */
export async function PATCH(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { timezone } = await req.json();
    if (!timezone || typeof timezone !== 'string') {
      return NextResponse.json({ error: 'timezone is required' }, { status: 400 });
    }

    // Validate timezone string length and format
    if (timezone.length > 100) {
      return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 });
    }
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return NextResponse.json({ error: 'Invalid timezone identifier' }, { status: 400 });
    }

    // Verify user is the org creator
    const { data: membership } = await admin
      .from('organization_members')
      .select('organization_id, organizations(id, created_by)')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (!membership?.organizations) {
      return NextResponse.json({ error: 'No organization found' }, { status: 404 });
    }

    const patchOrgs = membership.organizations as unknown as { id: string; created_by: string }[] | { id: string; created_by: string };
    const org = Array.isArray(patchOrgs) ? patchOrgs[0] : patchOrgs;
    if (!org || org.created_by !== user.id) {
      return NextResponse.json({ error: 'Only the org creator can change the timezone' }, { status: 403 });
    }

    const { error } = await admin
      .from('organizations')
      .update({ timezone })
      .eq('id', org.id);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

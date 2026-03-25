import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgs, createOrg, ensureUserHasOrg } from '@/lib/supabase/org';
import { createClient as createAdminClient } from '@supabase/supabase-js';

/** GET /api/org — list user's organizations. ?bootstrap=true to auto-create if none exist. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const bootstrap = req.nextUrl.searchParams.get('bootstrap') === 'true';

    if (bootstrap) {
      try {
        await ensureUserHasOrg(user.id, user.email);
      } catch {
        // Migration may not be applied yet — return empty gracefully
        return NextResponse.json({ organizations: [] });
      }
    }

    try {
      const orgs = await getUserOrgs(user.id);
      return NextResponse.json({ organizations: orgs });
    } catch {
      return NextResponse.json({ organizations: [] });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** POST /api/org — create a new organization */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { name } = await req.json();
    if (!name || typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Organization name is required' }, { status: 400 });
    }

    const org = await createOrg(user.id, name.trim());
    return NextResponse.json({ organization: org });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** PATCH /api/org — rename an organization */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orgId, name } = await req.json();
    if (!orgId || !name?.trim()) {
      return NextResponse.json({ error: 'orgId and name are required' }, { status: 400 });
    }

    const adminClient = createAdminClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify the user is a member of this org
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { error } = await adminClient
      .from('organizations')
      .update({ name: name.trim() })
      .eq('id', orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}


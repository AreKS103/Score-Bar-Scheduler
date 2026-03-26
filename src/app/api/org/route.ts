import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getUserOrgs, createOrg, activateUserInvites, slugify } from '@/lib/supabase/org';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** GET /api/org — list user's organizations. ?bootstrap=true to activate pending invites. */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const bootstrap = req.nextUrl.searchParams.get('bootstrap') === 'true';

    if (bootstrap) {
      try {
        await activateUserInvites(user.id);
      } catch {
        // Non-fatal: continue without invite activation
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

    // Verify the user is a member of this org
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const newSlug = slugify(name.trim());
    const { error } = await adminClient
      .from('organizations')
      .update({ name: name.trim(), slug: newSlug })
      .eq('id', orgId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, slug: newSlug });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/** DELETE /api/org — delete an organization (owner only) */
export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { orgId } = await req.json();
    if (!orgId) return NextResponse.json({ error: 'orgId is required' }, { status: 400 });

    // Verify the user is an owner of this org
    const { data: membership } = await adminClient
      .from('organization_members')
      .select('role')
      .eq('organization_id', orgId)
      .eq('user_id', user.id)
      .single();

    if (!membership || membership.role !== 'owner') {
      return NextResponse.json({ error: 'Only the org owner can delete it' }, { status: 403 });
    }

    // Nullify organization_id on related tables so data isn't lost
    const tables = [
      'user_api_keys',
      'embed_instances',
      'published_schedules',
      'user_selections',
      'scheduled_publishes',
      'custom_events',
      'business_info',
    ] as const;
    await Promise.allSettled(
      tables.map(table =>
        adminClient
          .from(table)
          .update({ organization_id: null })
          .eq('organization_id', orgId)
      )
    );

    // Delete all members first (FK constraint)
    await adminClient
      .from('organization_members')
      .delete()
      .eq('organization_id', orgId);

    // Delete the org
    const { error } = await adminClient
      .from('organizations')
      .delete()
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

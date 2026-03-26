import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

const adminClient = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/**
 * POST /api/org/invites/accept — accept a pending org invite.
 * Body: { inviteId: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { inviteId } = await req.json();
    if (!inviteId) return NextResponse.json({ error: 'inviteId is required' }, { status: 400 });

    // Verify the invite belongs to this user and is still pending
    const { data: invite, error: fetchErr } = await adminClient
      .from('organization_members')
      .select('id, user_id, status, organization_id')
      .eq('id', inviteId)
      .single();

    if (fetchErr || !invite) {
      return NextResponse.json({ error: 'Invite not found' }, { status: 404 });
    }

    if (invite.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (invite.status !== 'invited') {
      return NextResponse.json({ error: 'This invite has already been accepted' }, { status: 409 });
    }

    // Check if the user is already an active member of another org
    const { data: existingMemberships } = await adminClient
      .from('organization_members')
      .select('id, organization_id')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (existingMemberships && existingMemberships.length > 0) {
      return NextResponse.json(
        { error: 'You are already a member of an organization. Leave it first before joining another.' },
        { status: 409 },
      );
    }

    // Accept: set status to active
    const { error: updateErr } = await adminClient
      .from('organization_members')
      .update({ status: 'active' })
      .eq('id', inviteId);

    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, orgId: invite.organization_id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

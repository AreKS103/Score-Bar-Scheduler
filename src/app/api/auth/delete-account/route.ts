import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export async function DELETE() {
  // Authenticate the request
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
  }

  const adminClient = createAdminClient(url, serviceKey);

  // Clean up orgs: delete orgs where this user is the sole member
  const { data: memberships } = await adminClient
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id);

  if (memberships) {
    for (const m of memberships) {
      const { count } = await adminClient
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', m.organization_id);

      if (count === 1) {
        // Sole member — delete the entire org (cascades members + SET NULL on data)
        await adminClient
          .from('organizations')
          .delete()
          .eq('id', m.organization_id);
      } else {
        // Other members exist — just remove this user's membership
        await adminClient
          .from('organization_members')
          .delete()
          .eq('organization_id', m.organization_id)
          .eq('user_id', user.id);
      }
    }
  }

  // Use admin client to delete the user (only admin can call deleteUser)
  const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

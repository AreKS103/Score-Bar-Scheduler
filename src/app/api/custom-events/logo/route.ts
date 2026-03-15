import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'custom-league-logos';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'custom-league';
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const form = await req.formData();
    const file = form.get('file');
    const leagueLabel = String(form.get('leagueLabel') ?? 'custom-league');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 });
    }

    const safeLabel = sanitizeSegment(leagueLabel);
    const path = `${user.id}/${safeLabel}-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, {
        contentType: file.type || 'image/webp',
        upsert: false,
      });

    if (uploadError) {
      console.error('[CustomLogoUpload] storage upload failed', uploadError.message);
      return NextResponse.json(
        {
          error: uploadError.message || 'Storage upload failed',
          details: uploadError.name || 'storage_error',
        },
        { status: 500 }
      );
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({
      success: true,
      path,
      publicUrl: data.publicUrl,
    });
  } catch (err) {
    console.error('[CustomLogoUpload] route error', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
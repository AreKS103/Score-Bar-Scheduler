import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const BUCKET = 'custom-league-logos';
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;

// Magic byte signatures for allowed image formats
const IMAGE_SIGNATURES: Array<{ bytes: number[]; offset?: number }> = [
  { bytes: [0x89, 0x50, 0x4E, 0x47] },       // PNG
  { bytes: [0xFF, 0xD8, 0xFF] },               // JPEG
  { bytes: [0x47, 0x49, 0x46, 0x38] },         // GIF (87a/89a)
  { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 }, // WebP (RIFF header, checked with WEBP at offset 8)
];

async function isValidImageContent(file: File): Promise<boolean> {
  try {
    const buffer = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (buffer.length < 3) return false;

    // Reject SVG: starts with '<' (0x3C) — SVG can contain embedded scripts
    if (buffer[0] === 0x3C) return false;

    // Check RIFF/WEBP specifically
    if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
      // Verify WEBP marker at offset 8
      return buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50;
    }

    // Check other signatures
    return IMAGE_SIGNATURES.some(sig =>
      sig.bytes.every((byte, i) => buffer[(sig.offset ?? 0) + i] === byte)
    );
  } catch {
    return false;
  }
}

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

    // Reject SVG explicitly — even with correct MIME it can contain embedded scripts
    if (file.type === 'image/svg+xml' || file.type === 'image/svg') {
      return NextResponse.json({ error: 'SVG files are not allowed' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 400 });
    }

    // Validate actual file content matches an allowed image format (magic bytes)
    if (!(await isValidImageContent(file))) {
      return NextResponse.json({ error: 'File content is not a valid image (PNG, JPEG, GIF, or WebP)' }, { status: 400 });
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
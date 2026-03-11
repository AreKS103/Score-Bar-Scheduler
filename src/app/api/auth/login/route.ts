import { NextResponse } from 'next/server';

// Auth is now handled client-side via Supabase. Kept as stub.
export async function POST() {
  return NextResponse.json(
    { error: 'Auth is handled via Supabase. Use the login page.' },
    { status: 410 }
  );
}

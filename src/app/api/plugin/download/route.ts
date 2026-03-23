import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

export async function GET() {
  try {
    const zipPath = path.join(process.cwd(), 'scorebar-scheduler.zip');
    const buffer = await readFile(zipPath);
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': 'attachment; filename="scorebar-scheduler.zip"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Plugin zip not found' }, { status: 404 });
  }
}

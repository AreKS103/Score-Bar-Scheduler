import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const hasGoogle = !!process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  const hasGroq = !!process.env.GROQ_API_KEY;

  return NextResponse.json({
    status: hasGoogle || hasGroq ? 'ok' : 'no_provider',
    providers: {
      google: hasGoogle,
      groq: hasGroq,
    },
  });
}

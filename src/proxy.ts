import { NextRequest, NextResponse } from 'next/server';

const PROTECTED_PATHS = ['/schedule', '/preview', '/settings'];
const LOGIN_PATH = '/login';
const COOKIE_NAME = 'score_session';

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Never protect API routes, login page, or static assets
  if (
    pathname.startsWith('/api') ||
    pathname === LOGIN_PATH ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  // Check if this is a protected route
  const isProtected = PROTECTED_PATHS.some((p) => pathname.startsWith(p));
  if (!isProtected) {
    // Root "/" redirects to /schedule, which will be caught on next request
    return NextResponse.next();
  }

  // Verify session cookie
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL(LOGIN_PATH, req.url));
  }

  const valid = await verifyToken(token);
  if (!valid) {
    const res = NextResponse.redirect(new URL(LOGIN_PATH, req.url));
    res.cookies.delete(COOKIE_NAME);
    return res;
  }

  return NextResponse.next();
}

async function verifyToken(token: string): Promise<boolean> {
  try {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx < 0) return false;

    const payloadB64 = token.slice(0, dotIdx);
    const sig = token.slice(dotIdx + 1);
    if (!payloadB64 || !sig) return false;

    const payload = atob(payloadB64);
    const parts = payload.split('|');
    if (parts.length < 2) return false;

    const exp = Number(parts[parts.length - 1]);
    if (isNaN(exp) || Date.now() > exp) return false;

    const secret = process.env.AUTH_SECRET || 'score-admin-default-secret';
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const sigBuf = await crypto.subtle.sign(
      'HMAC',
      key,
      new TextEncoder().encode(payload),
    );

    const expectedSig = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return sig === expectedSig;
  } catch {
    return false;
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};

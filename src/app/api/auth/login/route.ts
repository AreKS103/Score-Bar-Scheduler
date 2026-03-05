import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

const COOKIE_NAME = 'score_session';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days in ms

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 });
    }

    const validEmail = process.env.ADMIN_EMAIL;
    const validPassword = process.env.ADMIN_PASSWORD;

    if (!validEmail || !validPassword) {
      return NextResponse.json(
        { error: 'Admin credentials not configured on server' },
        { status: 500 },
      );
    }

    // Constant-time comparison using SHA-256 hashes (same-length buffers)
    const emailHash = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
    const validEmailHash = crypto
      .createHash('sha256')
      .update(validEmail.toLowerCase().trim())
      .digest('hex');
    const emailMatch = crypto.timingSafeEqual(
      Buffer.from(emailHash),
      Buffer.from(validEmailHash),
    );

    const passHash = crypto.createHash('sha256').update(password).digest('hex');
    const validPassHash = crypto.createHash('sha256').update(validPassword).digest('hex');
    const passMatch = crypto.timingSafeEqual(
      Buffer.from(passHash),
      Buffer.from(validPassHash),
    );

    if (!emailMatch || !passMatch) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Create HMAC-signed session token
    const exp = Date.now() + SESSION_TTL;
    const payload = `${email.toLowerCase().trim()}|${exp}`;
    const secret = process.env.AUTH_SECRET || 'score-admin-default-secret';
    const sig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const token = `${Buffer.from(payload).toString('base64')}.${sig}`;

    const res = NextResponse.json({ ok: true });
    res.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
      path: '/',
    });

    return res;
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

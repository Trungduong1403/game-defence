import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import db from '@/lib/db';
import { signToken } from '@/lib/auth';

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { username, password } = body;

  if (!username || !password) {
    return NextResponse.json({ error: 'Username and password are required' }, { status: 400 });
  }
  if (typeof username !== 'string' || username.length < 3 || username.length > 16) {
    return NextResponse.json({ error: 'Username must be 3–16 characters' }, { status: 400 });
  }
  if (!/^[a-zA-Z0-9_]+$/.test(username)) {
    return NextResponse.json({ error: 'Username: letters, numbers and underscore only' }, { status: 400 });
  }
  if (typeof password !== 'string' || password.length < 4) {
    return NextResponse.json({ error: 'Password must be at least 4 characters' }, { status: 400 });
  }

  const hash = bcrypt.hashSync(password, 10);

  try {
    const result = db
      .prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)')
      .run(username, hash);

    const token = signToken({ userId: result.lastInsertRowid as number, username });
    return NextResponse.json({ username, token }, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

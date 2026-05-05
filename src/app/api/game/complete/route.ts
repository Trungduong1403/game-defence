import { NextResponse } from 'next/server';
import db from '@/lib/db';
import { verifyToken, getTokenFromRequest } from '@/lib/auth';

export async function POST(req: Request) {
  const token = getTokenFromRequest(req);
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const payload = verifyToken(token);
  if (!payload) return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const { mapId, mapName, stars, clearTime } = body;

  if (
    typeof mapId !== 'number' || mapId < 0 ||
    typeof mapName !== 'string' ||
    typeof stars !== 'number' || stars < 1 || stars > 3 ||
    typeof clearTime !== 'number' || clearTime <= 0
  ) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  // Upsert: keep the best record per (user, map).
  // Better = more stars; on equal stars, faster time wins.
  db.prepare(`
    INSERT INTO map_completions (user_id, map_id, map_name, stars, clear_time)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(user_id, map_id) DO UPDATE SET
      stars = CASE WHEN excluded.stars > stars THEN excluded.stars ELSE stars END,
      clear_time = CASE
        WHEN excluded.stars > stars THEN excluded.clear_time
        WHEN excluded.stars = stars AND excluded.clear_time < clear_time THEN excluded.clear_time
        ELSE clear_time
      END,
      map_name = excluded.map_name,
      completed_at = CASE
        WHEN (excluded.stars > stars)
          OR (excluded.stars = stars AND excluded.clear_time < clear_time)
        THEN CURRENT_TIMESTAMP
        ELSE completed_at
      END
  `).run(payload.userId, mapId, mapName, Math.round(stars), clearTime);

  return NextResponse.json({ success: true });
}

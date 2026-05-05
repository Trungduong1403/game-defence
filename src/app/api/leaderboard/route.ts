import { NextResponse } from 'next/server';
import db from '@/lib/db';

export interface LeaderboardRow {
  username: string;
  maps_cleared: number;
  total_time: number;
  highest_map_id: number;
  highest_map_name: string;
  best_stars: number;
}

export async function GET() {
  const rows = db.prepare(`
    SELECT
      u.username,
      COUNT(mc.id)          AS maps_cleared,
      SUM(mc.clear_time)    AS total_time,
      MAX(mc.map_id)        AS highest_map_id,
      (
        SELECT map_name FROM map_completions
        WHERE user_id = u.id
        ORDER BY map_id DESC LIMIT 1
      )                     AS highest_map_name,
      ROUND(AVG(mc.stars), 1) AS avg_stars
    FROM users u
    INNER JOIN map_completions mc ON mc.user_id = u.id
    GROUP BY u.id, u.username
    ORDER BY maps_cleared DESC, total_time ASC
    LIMIT 100
  `).all() as LeaderboardRow[];

  return NextResponse.json(rows, {
    headers: { 'Cache-Control': 'no-store' },
  });
}

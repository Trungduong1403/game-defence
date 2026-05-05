'use client';

import { useEffect, useState } from 'react';

interface LeaderboardRow {
  username: string;
  maps_cleared: number;
  total_time: number;
  highest_map_id: number;
  highest_map_name: string;
  avg_stars: number;
}

function Stars({ count }: { count: number }) {
  const full = Math.floor(count);
  const half = count - full >= 0.5;
  return (
    <span style={{ letterSpacing: 2 }}>
      {[1, 2, 3].map(i => (
        <span key={i} style={{
          color: i <= full ? '#FFD700' : (i === full + 1 && half ? '#FFD700' : '#444'),
          textShadow: i <= full ? '0 0 8px #FFD700' : 'none',
          opacity: i === full + 1 && half ? 0.6 : 1,
        }}>★</span>
      ))}
    </span>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

const RANK_STYLE: Record<number, { color: string; label: string; shadow: string }> = {
  1: { color: '#FFD700', label: '🥇', shadow: '0 0 16px #FFD70088' },
  2: { color: '#C0C0C0', label: '🥈', shadow: '0 0 12px #C0C0C088' },
  3: { color: '#CD7F32', label: '🥉', shadow: '0 0 10px #CD7F3288' },
};

export default function LeaderboardPage() {
  const [rows, setRows] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [blink, setBlink] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      const data = await res.json();
      setRows(data);
      setLastUpdate(new Date().toLocaleTimeString('vi-VN'));
    } catch {
      // silent
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const t = setInterval(() => setBlink(b => !b), 600);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0a0a1a 0%, #0f0f2e 50%, #0a0a1a 100%)',
      fontFamily: '"Press Start 2P", monospace',
      color: '#e0e0e0',
      padding: '20px 16px 60px',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Scanline overlay */}
      <div style={{
        position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
        background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)',
      }} />

      {/* Stars background */}
      {[...Array(30)].map((_, i) => (
        <div key={i} style={{
          position: 'fixed',
          top: `${Math.sin(i * 37) * 50 + 50}%`,
          left: `${Math.sin(i * 73) * 50 + 50}%`,
          width: i % 3 === 0 ? 3 : 2,
          height: i % 3 === 0 ? 3 : 2,
          borderRadius: '50%',
          background: '#ffffff',
          opacity: 0.2 + (i % 5) * 0.1,
          pointerEvents: 'none',
        }} />
      ))}

      <div style={{ position: 'relative', zIndex: 1, maxWidth: 900, margin: '0 auto' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 10, color: '#4a9eff', letterSpacing: 4, marginBottom: 8 }}>
            ═══════════════════════
          </div>
          <h1 style={{
            fontSize: 'clamp(14px, 3vw, 22px)',
            color: '#FFD700',
            textShadow: '0 0 20px #FFD70088, 2px 2px 0 #7a5800',
            margin: '8px 0',
            letterSpacing: 2,
          }}>
            THE LAST BORDER
          </h1>
          <div style={{ fontSize: 9, color: '#4a9eff', letterSpacing: 6, marginBottom: 4 }}>
            ★ HALL OF FAME ★
          </div>
          <div style={{ fontSize: 10, color: '#4a9eff', letterSpacing: 4 }}>
            ═══════════════════════
          </div>
        </div>

        {/* Refresh bar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, fontSize: 7, color: '#555' }}>
          <span>AUTO REFRESH: 30s {blink ? '▮' : '▯'}</span>
          {lastUpdate && <span>UPDATED: {lastUpdate}</span>}
          <button onClick={load} style={{
            background: 'none', border: '1px solid #333', color: '#4a9eff',
            fontFamily: '"Press Start 2P", monospace', fontSize: 7,
            padding: '4px 8px', cursor: 'pointer',
          }}>↺ RELOAD</button>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, fontSize: 10, color: '#4a9eff' }}>
            LOADING{blink ? '...' : '   '}
          </div>
        ) : rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 10, color: '#555', marginBottom: 12 }}>NO DATA YET</div>
            <div style={{ fontSize: 7, color: '#333 ' }}>BE THE FIRST TO CONQUER THE BORDER</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            {/* Header row */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '48px 1fr 90px 90px 120px 80px',
              gap: 0,
              background: '#0d1f3c',
              border: '2px solid #1a3a6e',
              padding: '10px 12px',
              fontSize: 7,
              color: '#4a9eff',
              letterSpacing: 1,
              marginBottom: 4,
            }}>
              <span>RANK</span>
              <span>PLAYER</span>
              <span style={{ textAlign: 'center' }}>MAPS</span>
              <span style={{ textAlign: 'center' }}>TIME</span>
              <span style={{ textAlign: 'center' }}>TOP MAP</span>
              <span style={{ textAlign: 'center' }}>STARS</span>
            </div>

            {/* Rows */}
            {rows.map((row, i) => {
              const rank = i + 1;
              const rs = RANK_STYLE[rank];
              return (
                <div key={row.username} style={{
                  display: 'grid',
                  gridTemplateColumns: '48px 1fr 90px 90px 120px 80px',
                  gap: 0,
                  padding: '10px 12px',
                  marginBottom: 3,
                  background: rank <= 3
                    ? `linear-gradient(90deg, ${rs.color}18 0%, transparent 100%)`
                    : i % 2 === 0 ? '#0d0d1a' : '#0a0a15',
                  border: rank <= 3 ? `1px solid ${rs.color}44` : '1px solid #1a1a2e',
                  transition: 'all 0.2s',
                  fontSize: 8,
                  alignItems: 'center',
                }}>
                  {/* Rank */}
                  <span style={{
                    color: rs ? rs.color : '#555',
                    textShadow: rs ? rs.shadow : 'none',
                    fontSize: rank <= 3 ? 14 : 9,
                  }}>
                    {rank <= 3 ? rs.label : `#${rank}`}
                  </span>

                  {/* Username */}
                  <span style={{
                    color: rs ? rs.color : '#e0e0e0',
                    textShadow: rs ? rs.shadow : 'none',
                    fontSize: 9,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {row.username}
                  </span>

                  {/* Maps cleared */}
                  <span style={{ textAlign: 'center', color: '#4a9eff' }}>
                    {row.maps_cleared}
                  </span>

                  {/* Time */}
                  <span style={{ textAlign: 'center', color: '#aaa', fontSize: 7 }}>
                    {formatTime(row.total_time)}
                  </span>

                  {/* Highest map */}
                  <span style={{ textAlign: 'center', color: '#aaa', fontSize: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {row.highest_map_name || `MAP ${row.highest_map_id}`}
                  </span>

                  {/* Stars */}
                  <span style={{ textAlign: 'center' }}>
                    <Stars count={row.avg_stars} />
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div style={{ textAlign: 'center', marginTop: 40, fontSize: 7, color: '#222' }}>
          <div>INSERT COIN TO CONTINUE</div>
          <div style={{ marginTop: 8 }}>
            <a href="/" style={{ color: '#333', textDecoration: 'none' }}>◄ BACK TO GAME</a>
          </div>
        </div>
      </div>
    </div>
  );
}

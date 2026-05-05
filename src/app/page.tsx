'use client';

import { useState, useEffect, useRef } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────────
type AuthUser = { username: string; token: string };
interface LbRow {
  username: string;
  maps_cleared: number;
  total_time: number;
  highest_map_id: number;
  highest_map_name: string;
  avg_stars: number;
}

// ── Helpers (module-level, no browser APIs) ────────────────────────────────────
function fmtTime(sec: number) {
  if (!sec || sec <= 0) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

// ── Component ──────────────────────────────────────────────────────────────────
export default function GamePage() {
  const [user, setUser]                 = useState<AuthUser | null>(null);
  const [showAuth, setShowAuth]         = useState(false);
  const [authTab, setAuthTab]           = useState<'login' | 'register'>('login');
  const [authError, setAuthError]       = useState('');
  const [authBusy, setAuthBusy]         = useState(false);
  const [showLb, setShowLb]             = useState(false);
  const [lb, setLb]                     = useState<LbRow[]>([]);
  const [lbLoading, setLbLoading]       = useState(false);
  const [reactToast, setReactToast]     = useState('');
  const toastTimer                      = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Refs shared with the game useEffect
  const userRef     = useRef<AuthUser | null>(null);
  const gameWinRef  = useRef<((mapId: number, mapName: string, stars: number, clearTime: number) => void) | null>(null);

  // Keep userRef in sync with state
  useEffect(() => { userRef.current = user; }, [user]);

  // Restore session from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('tlb_user');
      if (stored) setUser(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  // Set up the win-save callback the game can call
  useEffect(() => {
    gameWinRef.current = (mapId, mapName, stars, clearTime) => {
      const u = userRef.current;
      if (!u) return;
      fetch('/api/game/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${u.token}` },
        body: JSON.stringify({ mapId, mapName, stars, clearTime }),
      })
        .then(r => r.ok ? showReactToast(`✅ Score saved! (${u.username})`) : null)
        .catch(() => {});
    };
  }, []);

  function showReactToast(msg: string) {
    setReactToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setReactToast(''), 3200);
  }

  // ── Auth handlers ──────────────────────────────────────────────────────────
  async function handleAuth(e: React.FormEvent<HTMLFormElement>, mode: 'login' | 'register') {
    e.preventDefault();
    setAuthError(''); setAuthBusy(true);
    const fd = new FormData(e.currentTarget);
    const username = (fd.get('username') as string).trim();
    const password = fd.get('password') as string;
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.error ?? 'Error'); return; }
      const u: AuthUser = { username: data.username, token: data.token };
      setUser(u);
      localStorage.setItem('tlb_user', JSON.stringify(u));
      setShowAuth(false);
      showReactToast(`👋 Welcome, ${u.username}!`);
    } catch { setAuthError('Network error'); }
    finally { setAuthBusy(false); }
  }

  function handleLogout() {
    setUser(null);
    localStorage.removeItem('tlb_user');
  }

  async function openLeaderboard() {
    setShowLb(true); setLbLoading(true);
    try {
      const res = await fetch('/api/leaderboard');
      setLb(await res.json());
    } catch { setLb([]); }
    finally { setLbLoading(false); }
  }

  // ── GAME ENGINE (runs once after mount) ───────────────────────────────────
  useEffect(() => {
    // ── AUDIO ──────────────────────────────────────────────────────────────
    const AudioSys = (() => {
      let ctx: AudioContext | null = null; let enabled = false;
      function init() {
        if (!ctx) { ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); enabled = true; }
        if (ctx.state === 'suspended') ctx.resume();
      }
      function playTone(freq: number, type: OscillatorType, dur: number, vol = 0.1, slide: number | null = null) {
        if (!enabled || !ctx) return;
        const osc = ctx.createOscillator(); const gain = ctx.createGain();
        osc.type = type; osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (slide) osc.frequency.exponentialRampToValueAtTime(slide, ctx.currentTime + dur);
        gain.gain.setValueAtTime(vol, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + dur);
        osc.start(); osc.stop(ctx.currentTime + dur);
      }
      return {
        init,
        build: ()         => playTone(300, 'square',   0.1,  0.1,  150),
        shootArrow: ()    => playTone(600, 'triangle', 0.1,  0.05, 800),
        shootIce: ()      => playTone(800, 'sine',     0.2,  0.05, 1200),
        shootFire: ()     => playTone(150, 'sawtooth', 0.3,  0.1,  50),
        shootLightning:() => playTone(400, 'sawtooth', 0.1,  0.1,  900),
        heroSlash: ()     => playTone(500, 'square',   0.15, 0.1,  200),
        coin: ()          => playTone(1200,'sine',     0.1,  0.05, 1800),
        hitWood: ()       => playTone(100, 'square',   0.1,  0.1),
        horn: ()          => playTone(150, 'sawtooth', 1.5,  0.2,  140),
        error: ()         => playTone(150, 'square',   0.2,  0.1,  100),
        countdown: ()     => playTone(880, 'sine',     0.1,  0.1),
        go: ()            => playTone(1760,'sine',     0.3,  0.1),
      };
    })();

    // ── CONFIGS ────────────────────────────────────────────────────────────
    const CFG = { CELL: 40, COLS: 24, ROWS: 12, GATE_COL: 23, GATE_ROW_START: 3, GATE_ROW_END: 8, WAVES: 20, START_GOLD: 200, MAX_HP: 10 };
    const THEMES = [
      { bg: '#2d4c1e', path: '#3a5f27', obs: ['Pine', 'Rock', 'Log', 'Vines'] },
      { bg: '#d2b48c', path: '#e3c598', obs: ['Palm', 'Cactus', 'Cracks', 'Bones'] },
      { bg: '#4a4a4a', path: '#3a3a3a', obs: ['Grave', 'DeadTree', 'FireTrap', 'Skull'] },
      { bg: '#a2c2e0', path: '#d5e8f5', obs: ['IceCrystal', 'FrozenLake', 'Stalactite'] },
      { bg: '#2c3e50', path: '#1a252f', obs: ['Bush', 'Abyss', 'DarkCrystal', 'BrokenPillar'] },
    ];
    const MAP_NAMES = [
      ['Whispering Woods','Mossy Thicket','Verdant Glade','Emerald Canopy','Tangled Roots','Hidden Grove','Heart of the Forest'],
      ['Scorched Sands','Mirage Dunes','Sunbone Valley','Crimson Oasis','Shifting Wastes','Dust Devil Basin',"Pharaoh's Tomb"],
      ['Bone Ash Path','Cursed Graveyard','Blood River','Hollow Ruins','Shadow Moor',"Wraith's Domain",'Necromancer Seat'],
      ['Crystal Cavern','Frostbite Ridge','Shivering Lake','Glacier Maw','Permafrost Depths','Icicle Hollow','Frozen Core'],
      ['Lost Echoes','Silent Abyss','Void Fragments','Shattered Pillars','Obsidian Path','Twilight Zone','The Last Gate'],
    ];
    const MAPS: any[] = [];
    for (let p = 0; p < 5; p++)
      for (let m = 0; m < 7; m++) {
        const gi = p * 7 + m;
        MAPS.push({ id: gi, name: MAP_NAMES[p][m], theme: THEMES[p], obsCount: 10 + Math.floor(gi * 1.5) });
      }

    const TOWER_STATS: any = {
      Wall:      { cost: 10,  hp: 5,  name: 'Barrier',        desc: 'Blocks path. 5 HP.' },
      Archer:    { cost: 50,  hp: 8,  name: 'Archer Tower',   desc: 'Fast single target.',
        levels: [{ dmg:40, cd:1.0, range:3 },{ dmg:80, cd:0.8, range:3.5, upCost:100 },{ dmg:120, cd:0.6, range:4, upCost:200 }] },
      Ice:       { cost: 100, hp: 8,  name: 'Ice Crystal',    desc: 'Splash slow.',
        levels: [{ dmg:5,  cd:1.5, range:1.0, slow:0.5, slowTime:5, splash:1.5 },{ dmg:15, cd:1.5, range:1.5, slow:0.6, slowTime:5, splash:2, upCost:200 },{ dmg:35, cd:1.5, range:2.0, slow:0.7, slowTime:5, splash:2.5, upCost:400 }] },
      Fire:      { cost: 100, hp: 8,  name: 'Fire Mortar',    desc: 'Heavy splash damage.',
        levels: [{ dmg:50,  cd:2.0, range:1.0, splash:2 },{ dmg:120, cd:1.8, range:1.5, splash:3, upCost:200 },{ dmg:300, cd:1.5, range:2.0, splash:4, upCost:400 }] },
      Lightning: { cost: 150, hp: 8,  name: 'Lightning Coil', desc: 'Stuns enemies.',
        levels: [{ dmg:40,  cd:3.0, range:1.5, stunTime:0.5 },{ dmg:80,  cd:2.5, range:2.0, stunTime:1.0, upCost:250 },{ dmg:160, cd:2.0, range:2.5, stunTime:1.5, upCost:400 }] },
      Hero:      { cost: 500, hp: 10, name: 'Paladin Hero',   desc: 'Powerful aura buffs.',
        levels: [
          { dmg:150, cd:1.2, range:3,   name:'Lv1: Archer +30 Dmg' },
          { dmg:150, cd:1.2, range:3.5, name:'Lv2: Ice Slow +5s',   upCost:600 },
          { dmg:150, cd:1.2, range:4,   name:'Lv3: Fire +50 Dmg',   upCost:700 },
          { dmg:150, cd:1.2, range:4.5, name:'Lv4: All +1 Rng',     upCost:850 },
          { dmg:150, cd:1.2, range:5,   name:'Lv5: All +0.2s Spd',  upCost:1000 },
        ] },
    };
    const WAVE_TYPES = [
      {n:'Ogre',color:'#27ae60'},{n:'Wolf',color:'#7f8c8d'},{n:'Skeleton',color:'#ecf0f1'},{n:'Spider',color:'#8e44ad'},
      {n:'Armored',color:'#34495e'},{n:'Banshee',color:'#9b59b6'},{n:'Treant',color:'#8e6d3b'},{n:'Snowman',color:'#fff'},
      {n:'Harpy',color:'#e67e22',fly:true},{n:'Miniboss',color:'#c0392b',boss:true},{n:'Dire Wolf',color:'#2c3e50'},
      {n:'Gargoyle',color:'#555'},{n:'Golem',color:'#d35400'},{n:'Wyrm',color:'#3498db',fly:true},
      {n:'Boss',color:'#8b0000',boss:true},{n:'Yeti',color:'#bdc3c7'},{n:'Dark Treant',color:'#2c3e50'},
      {n:'Hell Ogre',color:'#c0392b'},{n:'Dragon',color:'#e74c3c',fly:true},{n:'FINAL BOSS',color:'#000',boss:true},
    ];

    // ── GAME STATE ─────────────────────────────────────────────────────────
    const canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
    const ctx2d  = canvas.getContext('2d')!;
    let unlockedMaps = parseInt(localStorage.getItem('tb_unlocked') || '0') || 0;
    unlockedMaps = 34;
    let playerName = 'Guest', gameTime = 0, currentMapIdx = 0, gameState = 'MENU';
    let gold = CFG.START_GOLD, hp = CFG.MAX_HP, wave = 0;
    let gameSpeedMultiplier = 1, isPaused = false;
    let grid: number[][] = [], mapObstacles: any[] = [];
    let towers: any[] = [], enemies: any[] = [], projectiles: any[] = [], particles: any[] = [];
    let buildSelection: string | null = null, selectedTower: any = null;
    let isWaveActive = false, waveTotalSpawned = 0, waveSpawnCount = 0;
    let spawnTimer = 0, autoWaveTimer = 0;
    let previousWaveGoldTotal = 0, currentWaveGoldTotal = 0;
    let globalUpgradeActive = false, lastTime = 0;
    let currentWaveConfig: any = null, waveSpawnActive = false, rafId = 0;
    const distFn = (x1:number,y1:number,x2:number,y2:number) => Math.hypot(x1-x2,y1-y2);

    // ── COST HELPERS ───────────────────────────────────────────────────────
    function getBuildCost(type: string) {
      if (type === 'Wall') return TOWER_STATS.Wall.cost;
      if (type === 'Hero') return 500;
      return Math.floor(TOWER_STATS[type].cost * (globalUpgradeActive ? 1.5 : 1));
    }
    function getUpgradeCost(t: any) {
      const nxt = TOWER_STATS[t.type].levels[t.level + 1]; if (!nxt) return 0;
      if (t.type === 'Hero') { const ec=[750,1000,1250,1500]; return t.isElite ? ec[t.level] : nxt.upCost; }
      return Math.floor(nxt.upCost * t.costMultiplier);
    }
    function getSellRefund(t: any, active: boolean) {
      let spent = 0;
      if (t.type === 'Wall') { spent = TOWER_STATS.Wall.cost; }
      else if (t.type === 'Hero') {
        spent = 500;
        const nc=[600,700,850,1000]; const ec=[750,1000,1250,1500];
        for (let i=0;i<t.level;i++) spent += t.isElite ? ec[i] : nc[i];
      } else {
        spent = Math.floor(TOWER_STATS[t.type].cost * t.costMultiplier);
        for (let i=0;i<t.level;i++) spent += Math.floor(TOWER_STATS[t.type].levels[i+1].upCost * t.costMultiplier);
      }
      return Math.floor(spent * (active ? 0.5 : 1.0));
    }

    // ── PATHFINDING ────────────────────────────────────────────────────────
    function findPath(sx:number,sy:number,tx:number,ty:number): [number,number][]|null {
      const open: any[] = [{x:sx,y:sy,g:0,h:Math.abs(sx-tx)+Math.abs(sy-ty),p:null}];
      const closed = new Set<string>();
      while (open.length) {
        open.sort((a,b)=>(a.g+a.h)-(b.g+b.h));
        const c=open.shift(); const k=`${c.x},${c.y}`;
        if (closed.has(k)) continue; closed.add(k);
        if (c.x===tx && c.y>=CFG.GATE_ROW_START && c.y<=CFG.GATE_ROW_END) {
          const path:[number,number][]=[];let t=c;while(t.p){path.push([t.x,t.y]);t=t.p;} return path.reverse();
        }
        for (const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
          const nx=c.x+dx,ny=c.y+dy;
          if (nx>=0&&nx<CFG.COLS&&ny>=0&&ny<CFG.ROWS) {
            const isGate=nx===CFG.GATE_COL&&ny>=CFG.GATE_ROW_START&&ny<=CFG.GATE_ROW_END;
            if ((grid[nx][ny]===0||isGate)&&!closed.has(`${nx},${ny}`))
              open.push({x:nx,y:ny,g:c.g+1,h:Math.abs(nx-tx)+Math.abs(ny-ty),p:c});
          }
        }
      } return null;
    }
    function updateGlobalPath() { enemies.forEach(e=>e.recalcPath()); }

    // ── MAP GENERATION ─────────────────────────────────────────────────────
    function generateMap() {
      const cfg=MAPS[currentMapIdx];
      grid=Array(CFG.COLS).fill(null).map(()=>Array(CFG.ROWS).fill(0));
      mapObstacles=[];
      let seed=currentMapIdx*12345;
      const rng=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
      const noise=Array(CFG.COLS).fill(null).map(()=>Array(CFG.ROWS).fill(0));
      for(let i=0;i<30;i++){
        const cx=Math.floor(rng()*CFG.COLS),cy=Math.floor(rng()*CFG.ROWS);
        for(let r=-2;r<=2;r++) for(let c=-2;c<=2;c++)
          if(cx+c>=0&&cx+c<CFG.COLS&&cy+r>=0&&cy+r<CFG.ROWS&&rng()>0.3) noise[cx+c][cy+r]=1;
      }
      cfg.terrainMap=noise;
      let obsPlaced=0,attempts=0;
      while(obsPlaced<cfg.obsCount&&attempts<1000){
        attempts++;
        const x=Math.floor(rng()*(CFG.COLS-4))+2,y=Math.floor(rng()*CFG.ROWS);
        if(grid[x][y]!==0) continue; grid[x][y]=1;
        let ok=true;
        for(const sy of [2,6,10]){if(!findPath(0,sy,CFG.GATE_COL,Math.floor(CFG.ROWS/2))){ok=false;break;}}
        if(ok){mapObstacles.push({x,y,type:cfg.theme.obs[Math.floor(rng()*cfg.theme.obs.length)]});obsPlaced++;}
        else grid[x][y]=0;
      }
      updateGlobalPath();
    }

    // ── CLASSES ────────────────────────────────────────────────────────────
    class Enemy {
      x:number;y:number;cx:number;cy:number;cfg:any;maxHp:number;hp:number;
      baseSpd:number;fly:boolean;boss:boolean;goldDrop:number;active:boolean;
      path:any;pathIdx:number;slowTimer:number;slowMult:number;stunTimer:number;
      lightningHits:number;lightningEliteHits:number;blockTimer:number;state:string;
      targetObj:any;attackCooldown:number;phaseOffset:number;heroHitCount:number;
      constructor(x:number,y:number,cfg:any){
        this.x=x;this.y=y;this.cx=x;this.cy=y;
        this.cfg=cfg;this.maxHp=cfg.hp;this.hp=cfg.hp;
        this.baseSpd=cfg.spd;this.fly=cfg.fly;this.boss=cfg.boss;
        this.goldDrop=cfg.goldDrop;this.active=true;
        this.path=[];this.pathIdx=0;this.slowTimer=0;this.slowMult=1;this.stunTimer=0;
        this.lightningHits=0;this.lightningEliteHits=0;
        this.blockTimer=0;this.state='WALKING';this.targetObj=null;this.attackCooldown=0;
        this.phaseOffset=Math.random()*Math.PI*2;this.heroHitCount=0;
        this.recalcPath();
      }
      recalcPath(){
        if(this.fly){this.path=[[CFG.GATE_COL,5.5]];this.pathIdx=0;return;}
        const ty=Math.max(CFG.GATE_ROW_START,Math.min(Math.floor(this.y),CFG.GATE_ROW_END));
        const p=findPath(Math.round(this.x),Math.round(this.y),CFG.GATE_COL,ty);
        if(p&&p.length>0){this.path=p;this.pathIdx=0;this.state='WALKING';this.blockTimer=0;}
        else{this.path=null;if(this.state==='WALKING')this.state='BLOCKED';}
      }
      update(dt:number){
        if(this.stunTimer>0){this.stunTimer-=dt;return;}
        if(this.slowTimer>0){this.slowTimer-=dt;if(this.slowTimer<=0)this.slowMult=1;}
        let spd=this.baseSpd*this.slowMult;
        if(!this.fly) spd*=(1+0.3*Math.sin(performance.now()*0.005+this.phaseOffset));
        if(this.state==='BLOCKED'){
          this.blockTimer+=dt;
          if(this.blockTimer>=5.0){this.state='ATTACKING';this.findBlockTarget();} return;
        }
        if(this.state==='ATTACKING'){
          if(!this.targetObj||this.targetObj.hp<=0){this.recalcPath();if(this.path)this.state='WALKING';else this.findBlockTarget();return;}
          const dx=this.targetObj.cx-this.x,dy=this.targetObj.cy-this.y,d=Math.hypot(dx,dy);
          if(d>0.8){this.x+=(dx/d)*spd*dt;this.y+=(dy/d)*spd*dt;}
          else{
            this.attackCooldown-=dt;
            if(this.attackCooldown<=0){
              AudioSys.hitWood();this.targetObj.hp-=1;createParticle(this.targetObj.cx,this.targetObj.cy,'slash');this.attackCooldown=1.0;
              this.x+=dx*0.2;this.y+=dy*0.2;
              setTimeout(()=>{if(this.active){this.x-=dx*0.2;this.y-=dy*0.2;}},100);
              if(this.targetObj.hp<=0){removeTower(this.targetObj.cx,this.targetObj.cy);this.targetObj=null;this.recalcPath();}
            }
          } return;
        }
        if(this.path&&this.pathIdx<this.path.length){
          const tx=this.path[this.pathIdx][0],ty=this.path[this.pathIdx][1];
          const dx=tx-this.x,dy=ty-this.y,d=Math.hypot(dx,dy);
          if(d<0.1){this.x=tx;this.y=ty;this.pathIdx++;}
          else{this.x+=(dx/d)*spd*dt;this.y+=(dy/d)*spd*dt;}
        } else if(this.path&&this.pathIdx>=this.path.length){
          this.active=false;AudioSys.error();
          if(this.boss){hp=0;}else{hp--;}
          if(hp<=0) handleGameOver(false);
        }
      }
      findBlockTarget(){
        let md=999,tgt=null;
        towers.forEach(t=>{const d=distFn(this.x,this.y,t.cx,t.cy);if(d<md){md=d;tgt=t;}});
        this.targetObj=tgt;
      }
      takeDamage(amount:number,_type:string){
        this.hp-=amount;
        if(this.hp<=0&&this.active){
          this.active=false;
          const g=this.boss?previousWaveGoldTotal:this.goldDrop;
          gold+=g;currentWaveGoldTotal+=g;AudioSys.coin();createFloatingText(this.x,this.y,`+${g}`,'#ffd700');
        }
      }
      applyStun(t:number){this.stunTimer=Math.max(this.stunTimer,t);}
    }

    class Tower {
      cx:number;cy:number;type:string;level:number;isElite:boolean;
      costMultiplier:number;maxHp:number;hp:number;cdTimer:number;heroHitCount:number;
      constructor(cx:number,cy:number,type:string,isElite=false){
        this.cx=cx;this.cy=cy;this.type=type;this.level=0;this.isElite=isElite;
        this.costMultiplier=(isElite&&type!=='Wall')?1.5:1;
        this.maxHp=TOWER_STATS[type].hp;this.hp=TOWER_STATS[type].hp;this.cdTimer=0;this.heroHitCount=0;
      }
      getStats(){
        if(this.type==='Wall') return {dmg:0,cd:0,range:0};
        const s={...TOWER_STATS[this.type].levels[this.level]};
        const p1=towers.find((t:any)=>t.type==='Hero'&&!t.isElite);
        const p2=towers.find((t:any)=>t.type==='Hero'&&t.isElite);
        let ab=0,ib=0,fb=0,rb=0,sb=0;
        if(p1){const lv=p1.level;if(lv>=0)ab+=30;if(lv>=1)ib+=5;if(lv>=2)fb+=50;if(lv>=3)rb+=1;if(lv>=4)sb+=0.2;}
        if(p2){const lv=p2.level;if(lv>=0)ab+=60;if(lv>=1)ib+=10;if(lv>=2)fb+=100;if(lv>=3)rb+=2;if(lv>=4)sb+=0.4;}
        if(this.type==='Archer') s.dmg+=ab;
        if(this.type==='Ice') s.slowTime+=ib;
        if(this.type==='Fire') s.dmg+=fb;
        s.range+=rb; s.cd=Math.max(0.1,s.cd-sb);
        if(this.isElite){s.dmg*=2;if(this.type==='Ice')s.slowTime+=1;if(this.type==='Lightning')s.stunTime+=1;}
        return s;
      }
      update(dt:number){
        if(this.type==='Wall') return; this.cdTimer-=dt;
        if(this.cdTimer<=0){
          const tgt=this.findTarget();
          if(tgt){
            this.shoot(tgt);this.cdTimer=this.getStats().cd;
            if(this.type==='Hero'&&this.level===0){
              this.heroHitCount++;
              if(this.heroHitCount>=4){
                this.heroHitCount=0;createParticle(tgt.x,tgt.y,'holy_hammer');
                enemies.forEach(e=>{if(distFn(tgt.x,tgt.y,e.x,e.y)<=1.5)e.takeDamage(this.getStats().dmg*0.5,'magic');});
              }
            }
          }
        }
      }
      findTarget(){
        const s=this.getStats();
        const ir=enemies.filter(e=>distFn(this.cx,this.cy,e.x,e.y)<=s.range);
        if(!ir.length) return null;
        if(this.type==='Ice'){const ns=ir.filter(e=>e.slowMult===1);if(ns.length)return ns.sort((a:any,b:any)=>a.hp-b.hp)[0];}
        else if(this.type==='Lightning'){const mv=ir.filter(e=>e.stunTimer<=0);if(mv.length)return mv.sort((a:any,b:any)=>b.hp-a.hp)[0];}
        return ir.sort((a:any,b:any)=>b.x-a.x)[0];
      }
      shoot(tgt:any){
        projectiles.push(new Projectile(this.cx,this.cy,tgt,this.type,this.getStats(),this.isElite));
        if(this.type==='Archer')      AudioSys.shootArrow();
        else if(this.type==='Ice')    AudioSys.shootIce();
        else if(this.type==='Fire')   AudioSys.shootFire();
        else if(this.type==='Lightning') AudioSys.shootLightning();
        else if(this.type==='Hero')   AudioSys.heroSlash();
      }
    }

    class Projectile {
      x:number;y:number;target:any;type:string;stats:any;spd:number;active:boolean;isElite:boolean;
      constructor(x:number,y:number,target:any,type:string,stats:any,isElite:boolean){
        this.x=x;this.y=y;this.target=target;this.type=type;this.stats=stats;this.spd=8;this.active=true;this.isElite=isElite;
      }
      update(dt:number){
        if(!this.target.active){this.active=false;return;}
        const dx=this.target.x-this.x,dy=this.target.y-this.y,d=Math.hypot(dx,dy);
        if(d<0.2||this.type==='Lightning'){this.hit();}
        else{this.x+=(dx/d)*this.spd*dt;this.y+=(dy/d)*this.spd*dt;}
      }
      hit(){
        this.active=false;const t=this.target;
        if(this.type==='Archer'||this.type==='Hero'){t.takeDamage(this.stats.dmg,'phys');createParticle(t.x,t.y,this.type==='Hero'?'slash':'hit');}
        else if(this.type==='Ice'){
          createParticle(t.x,t.y,'ice_splash',this.stats.splash);
          enemies.forEach(e=>{if(distFn(t.x,t.y,e.x,e.y)<=this.stats.splash){e.takeDamage(this.stats.dmg,'magic');let s=this.stats.slow;if(e.boss)s-=0.2;e.slowMult=1-s;e.slowTimer=this.stats.slowTime;}});
        } else if(this.type==='Fire'){
          createParticle(t.x,t.y,'fire_splash',this.stats.splash);
          enemies.forEach(e=>{if(distFn(t.x,t.y,e.x,e.y)<=this.stats.splash)e.takeDamage(this.stats.dmg,'magic');});
        } else if(this.type==='Lightning'){
          t.takeDamage(this.stats.dmg,'magic');createParticle(t.x,t.y,'lightning');
          if(t.boss){
            if(this.isElite){t.lightningEliteHits=(t.lightningEliteHits||0)+1;if(t.lightningEliteHits>=3){t.applyStun(1.0);t.lightningEliteHits=0;}}
            else{t.lightningHits=(t.lightningHits||0)+1;if(t.lightningHits>=5){t.applyStun(0.3);t.lightningHits=0;}}
          } else t.applyStun(this.stats.stunTime);
        }
      }
    }

    class Particle {
      x:number;y:number;type:string;size:number;text:string;color:string;life:number;active:boolean;
      constructor(x:number,y:number,type:string,size=1,text='',color=''){
        this.x=x;this.y=y;this.type=type;this.size=size;this.text=text;this.color=color;
        this.life=type==='text'?3.0:1.0;this.active=true;
      }
      update(dt:number){this.life-=dt*(this.type==='text'?0.33:2.0);if(this.type==='text')this.y-=dt*0.5;if(this.life<=0)this.active=false;}
    }
    function createParticle(x:number,y:number,type:string,size=1){particles.push(new Particle(x,y,type,size));}
    function createFloatingText(x:number,y:number,text:string,color:string){particles.push(new Particle(x,y,'text',1,text,color));}

    // ── UI ─────────────────────────────────────────────────────────────────
    function showToast(msg:string){
      const t=document.getElementById('toast')!;
      t.innerText=msg;t.style.opacity='1';
      setTimeout(()=>{t.style.opacity='0';},2000);
    }
    function fmtGameTime(s:number){return`${Math.floor(s/60).toString().padStart(2,'0')}:${Math.floor(s%60).toString().padStart(2,'0')}`;}

    function updateUI(){
      (document.getElementById('ui-gold')!).innerText=Math.floor(gold).toString();
      (document.getElementById('ui-hp')!).innerText=hp.toString();
      (document.getElementById('ui-wave')!).innerText=Math.min(wave,CFG.WAVES).toString();
      (document.getElementById('ui-time')!).innerText=fmtGameTime(gameTime);
      document.querySelectorAll('.build-btn').forEach(btn=>{
        const type=btn.getAttribute('data-type')!;
        const cost=getBuildCost(type);
        (btn.querySelector('.b-cost')! as HTMLElement).innerText=cost+'g';
        if(gold<cost) btn.classList.add('disabled'); else btn.classList.remove('disabled');
      });
      const gBtn=document.getElementById('btn-global-tech') as HTMLButtonElement;
      if(!globalUpgradeActive) gBtn.disabled=gold<1000;
      if(selectedTower) updateInfoPanel();
    }

    function updateInfoPanel(){
      let title='Commander',desc='Select to build.';
      const upBtn=document.getElementById('btn-upgrade') as HTMLButtonElement;
      const sellBtn=document.getElementById('btn-sell') as HTMLButtonElement;
      upBtn.disabled=true;sellBtn.disabled=true;
      if(selectedTower){
        const st=TOWER_STATS[selectedTower.type];title=st.name;
        if(selectedTower.type==='Wall'){
          desc=`HP: ${selectedTower.hp}/${st.hp}`;
          sellBtn.disabled=false;sellBtn.innerHTML=isWaveActive?'💰 Sell (50%)':'💰 Sell (100%)';
        } else {
          const s=selectedTower.getStats();
          const elite=selectedTower.isElite?" <span style='color:#e74c3c'>(ELITE)</span>":'';
          let tt='Single';if(selectedTower.type==='Ice'||selectedTower.type==='Fire')tt='AOE';if(selectedTower.type==='Hero')tt='Single/AOE';
          desc=`Lvl: ${selectedTower.level+1}${elite} | Target: ${tt}<br/>`;
          desc+=`Dmg: ${Math.floor(s.dmg)} | Spd: ${s.cd.toFixed(1)}s | Rng: ${s.range.toFixed(1)}`;
          if(s.slowTime) desc+=` | Slow: ${Math.floor(s.slow*100)}% (${s.slowTime}s)`;
          if(s.stunTime) desc+=` | Stun: ${s.stunTime.toFixed(1)}s`;
          if(selectedTower.type==='Hero'){desc+=`<br/>Aura: ${st.levels[selectedTower.level].name}`;if(selectedTower.isElite)desc+=" <span style='color:#e74c3c'>(x2)</span>";}
          const nxt=st.levels[selectedTower.level+1];
          if(nxt){const uc=getUpgradeCost(selectedTower);desc+=`<br/>Up Cost: ${uc}g`;upBtn.disabled=gold<uc;}
          else desc+='<br/>MAX LEVEL';
          if(selectedTower.type==='Hero'){sellBtn.disabled=true;sellBtn.innerHTML='🚫 Cannot Sell';}
          else{sellBtn.disabled=false;sellBtn.innerHTML=isWaveActive?'💰 Sell (50%)':'💰 Sell (100%)';}
        }
        upBtn.innerHTML='⬆️ Upgrade';
      } else if(buildSelection){
        const st=TOWER_STATS[buildSelection];const cost=getBuildCost(buildSelection);
        title=`Build: ${st.name}`;desc=`Cost: ${cost}g<br/>${st.desc}`;
        if(buildSelection!=='Wall'){
          const s=st.levels[0];let tt='Single';
          if(buildSelection==='Ice'||buildSelection==='Fire')tt='AOE';if(buildSelection==='Hero')tt='Single/AOE';
          desc+=`<br/><span style="font-size:14px;color:#95a5a6;">Target: ${tt} | Dmg: ${s.dmg} | Spd: ${s.cd}s | Rng: ${s.range}`;
          if(s.slowTime) desc+=` | Slow: ${Math.floor(s.slow*100)}%`;if(s.stunTime) desc+=` | Stun: ${s.stunTime}s`;
          desc+='</span>';
        }
      }
      document.getElementById('info-content')!.innerHTML=`<div class="info-title">${title}</div><div class="info-desc">${desc}</div>`;
    }

    // ── TOWER OPS ──────────────────────────────────────────────────────────
    function removeTower(cx:number,cy:number){towers=towers.filter((t:any)=>t.cx!==cx||t.cy!==cy);grid[cx][cy]=0;}
    function upgradeTower(){
      if(!selectedTower||selectedTower.type==='Wall') return;
      const nxt=TOWER_STATS[selectedTower.type].levels[selectedTower.level+1];
      if(nxt){
        const uc=getUpgradeCost(selectedTower);
        if(uc>0&&gold>=uc){gold-=uc;selectedTower.level++;AudioSys.build();createFloatingText(selectedTower.cx,selectedTower.cy,'UPGRADED','#2ecc71');updateUI();updateInfoPanel();}
      }
    }
    function sellTower(){
      if(!selectedTower) return;
      gold+=getSellRefund(selectedTower,isWaveActive);AudioSys.coin();
      removeTower(selectedTower.cx,selectedTower.cy);selectedTower=null;
      updateGlobalPath();updateUI();updateInfoPanel();
    }

    // ── GAME OVER / WIN ────────────────────────────────────────────────────
    function handleGameOver(win:boolean){
      gameState=win?'VICTORY':'GAMEOVER';
      const scr=document.getElementById('result-screen')!;
      const titleEl=document.getElementById('result-title')!;
      const starsEl=document.getElementById('result-stars')!;
      const nextBtn=document.getElementById('res-btn-next')! as HTMLElement;
      (document.getElementById('result-player')!).innerText='Player: '+playerName;
      scr.style.display='flex';

      if(win){
        (document.getElementById('result-time-disp')!).style.display='block';
        (document.getElementById('result-time-disp')!).innerText='Clear Time: '+fmtGameTime(gameTime);
        titleEl.innerText='VICTORY';(titleEl as HTMLElement).style.color='#2ecc71';
        const starsCount=hp>=10?3:(hp>=5?2:1);
        starsEl.innerText='⭐'.repeat(starsCount)+'☆'.repeat(3-starsCount);
        nextBtn.style.display='inline-block';
        if(currentMapIdx>=unlockedMaps){unlockedMaps=currentMapIdx+1;localStorage.setItem('tb_unlocked',unlockedMaps.toString());}

        // ── Save to backend ───────────────────────────────────────────────
        gameWinRef.current?.(currentMapIdx, MAPS[currentMapIdx].name, starsCount, gameTime);

        // Show "login to save" hint if not logged in
        const hint=document.getElementById('result-login-hint')!;
        if(userRef.current) hint.style.display='none';
        else hint.style.display='block';
      } else {
        (document.getElementById('result-time-disp')!).style.display='none';
        titleEl.innerText='GAME OVER';(titleEl as HTMLElement).style.color='#e74c3c';
        starsEl.innerText='☠️';nextBtn.style.display='none';
        (document.getElementById('result-login-hint')!).style.display='none';
      }
    }

    // ── WAVE MANAGEMENT ────────────────────────────────────────────────────
    function startNextWave(){
      wave++;isWaveActive=true;spawnTimer=0;
      previousWaveGoldTotal=currentWaveGoldTotal;currentWaveGoldTotal=0;
      let td:any={...WAVE_TYPES[(wave-1)%WAVE_TYPES.length]};
      const isBoss=td.boss,isFly=td.fly;
      const themeIdx=Math.floor(currentMapIdx/7);
      if(themeIdx===1){if(td.n==='Snowman'){td.n='Bọ Cạp';td.color='#d35400';}if(td.n==='Yeti'){td.n='Rết';td.color='#8b0000';}}
      else if(themeIdx===3){
        if(td.n==='Ogre'||td.n==='Armored'){td.n='Gấu Bắc Cực';td.color='#ecf0f1';}
        else if(td.n==='Wolf'||td.n==='Spider'){td.n='Chim Cánh Cụt';td.color='#2d3436';}
        else if(td.n==='Golem'||td.n==='Treant'){td.n='Voi Ma Mút';td.color='#8b4513';}
        else if(td.n==='Harpy'||td.n==='Wyrm'){td.n='Rồng Băng';td.color='#74b9ff';}
      }
      if(isBoss){
        const bN=[['Ma Cây','Nhện Xanh','Gorilla Khổng Lồ'],['Bọ Cạp Chúa','Nhện Đỏ','Xà Vương'],['Skeleton Vua','Nhện Đen','Chúa Tể Zombie'],['Gấu Chúa','Ma Mút Bạo Chúa','Rồng Băng Tối Thượng'],['Kẻ Lưu Đày','Ác Thần Bóng Tối','Chúa Tể Hư Không']];
        const bC=[['#8e6d3b','#16a085','#2d3436'],['#d35400','#c0392b','#27ae60'],['#ecf0f1','#2c3e50','#7f8c8d'],['#fff','#8b4513','#74b9ff'],['#8e44ad','#2c3e50','#000']];
        const bl=wave===10?0:(wave===15?1:2);td.n=bN[themeIdx][bl];td.color=bC[themeIdx][bl];
      }
      let hpMod=(wave<=3?100:100*Math.pow(1.25,wave-3))*(wave<=3?1:(1+currentMapIdx*0.15));
      if(currentMapIdx>=7&&wave>=4){for(let w=4;w<=wave;w++){if(w<=10)hpMod*=1.1;else if(w<=15)hpMod*=1.2;else if(w<=19)hpMod*=1.3;}}
      else{if(wave>=11&&!isFly&&!isBoss)hpMod*=2;if(wave>=14)hpMod*=Math.pow(1.2,wave-13);}
      if(isBoss){hpMod*=6;if(wave===15)hpMod*=1.5;if(wave===20)hpMod*=2;hpMod*=0.8;}
      if(isFly) hpMod*=0.5;
      let baseSpd=0.8+wave*0.02+(wave<=3?0:currentMapIdx*0.01);
      if(isFly)baseSpd*=1.2;if(isBoss)baseSpd*=0.8;
      waveTotalSpawned=0;
      if(isBoss)waveSpawnCount=1;else if(isFly)waveSpawnCount=25;
      else if(wave<=3)waveSpawnCount=10;else if(wave<=8)waveSpawnCount=30;
      else if(wave<=13)waveSpawnCount=45;else if(wave<=18)waveSpawnCount=45;else waveSpawnCount=10;
      let gBonus=wave<=2?2:wave<=5?3:wave<=9?5:wave<=12?6:wave<=15?7:9;
      let gDrop=(10+(wave-1)*3)+gBonus;if(isFly)gDrop*=2;
      currentWaveConfig={name:td.n,color:td.color,hp:hpMod,spd:baseSpd,fly:isFly,boss:isBoss,goldDrop:gDrop};
      updateUI();
      (document.getElementById('btn-wave')!).innerText='Wave Active';
      (document.getElementById('btn-wave')!).className='wave-btn disabled';
      const cd=document.getElementById('countdown-overlay')!;
      cd.style.display='flex';cd.innerText='3';AudioSys.countdown();
      setTimeout(()=>{cd.innerText='2';AudioSys.countdown();},1000/gameSpeedMultiplier);
      setTimeout(()=>{cd.innerText='1';AudioSys.countdown();},2000/gameSpeedMultiplier);
      setTimeout(()=>{cd.style.display='none';AudioSys.go();if(isBoss)AudioSys.horn();waveSpawnActive=true;},3000/gameSpeedMultiplier);
    }
    function handleWaveButton(){
      if(isWaveActive||wave>=CFG.WAVES) return;
      if(autoWaveTimer>0){autoWaveTimer=0;startNextWave();return;}
      startNextWave();
    }
    function startGame(idx:number){
      currentMapIdx=idx;gameState='PLAYING';
      document.getElementById('main-menu')!.style.display='none';
      document.getElementById('result-screen')!.style.display='none';
      gold=CFG.START_GOLD;hp=CFG.MAX_HP;wave=0;gameTime=0;
      isWaveActive=false;enemies=[];projectiles=[];particles=[];towers=[];
      buildSelection=null;selectedTower=null;
      previousWaveGoldTotal=0;currentWaveGoldTotal=0;globalUpgradeActive=false;
      document.getElementById('btn-global-tech')!.style.display='block';
      generateMap();updateUI();updateInfoPanel();
      (document.getElementById('btn-wave')!).innerText='Start Wave 1';
      (document.getElementById('btn-wave')!).className='wave-btn';
      lastTime=performance.now();
    }

    // ── GAME LOOP ──────────────────────────────────────────────────────────
    function update(dt:number){
      if(isWaveActive&&waveSpawnActive&&waveTotalSpawned<waveSpawnCount&&currentWaveConfig){
        spawnTimer-=dt;
        if(spawnTimer<=0){
          const sy=currentWaveConfig.boss?6:[2,6,10][waveTotalSpawned%3];
          enemies.push(new Enemy(0,sy,currentWaveConfig));waveTotalSpawned++;
          spawnTimer=currentWaveConfig.boss?999:(currentWaveConfig.fly?1.5:1.0);
          if(waveTotalSpawned>=waveSpawnCount)waveSpawnActive=false;
        }
      }
      enemies.forEach(e=>e.update(dt));towers.forEach(t=>t.update(dt));
      projectiles.forEach(p=>p.update(dt));particles.forEach(p=>p.update(dt));
      enemies=enemies.filter(e=>e.active);projectiles=projectiles.filter(p=>p.active);particles=particles.filter(p=>p.active);
      if(isWaveActive&&waveTotalSpawned>=waveSpawnCount&&enemies.length===0){
        isWaveActive=false;gold+=50;currentWaveGoldTotal+=50;
        AudioSys.coin();createFloatingText(CFG.COLS/2,CFG.ROWS/2,'+50 Bonus','#ffd700');
        if(wave>=CFG.WAVES) handleGameOver(true);
        else{autoWaveTimer=3.0;(document.getElementById('btn-wave')!).innerText='⏳ Skip Wait';(document.getElementById('btn-wave')!).className='wave-btn skip';}
      }
      if(!isWaveActive&&autoWaveTimer>0){autoWaveTimer-=dt;if(autoWaveTimer<=0)startNextWave();}
      updateUI();
    }
    function gameLoop(ts:number){
      let dt=(ts-lastTime)/1000;lastTime=ts;if(dt>0.1)dt=0.1;
      if(gameState==='PLAYING'&&!isPaused){if(isWaveActive)gameTime+=dt*gameSpeedMultiplier;update(dt*gameSpeedMultiplier);}
      if(gameState!=='MENU') drawGame(ts);
      rafId=requestAnimationFrame(gameLoop);
    }

    // ── INTERACTION ────────────────────────────────────────────────────────
    function handleCanvasClick(e:MouseEvent|TouchEvent){
      if(gameState!=='PLAYING') return;
      const rect=canvas.getBoundingClientRect();
      const sx=canvas.width/rect.width,sy=canvas.height/rect.height;
      let cx2:number,cy2:number;
      if('touches' in e&&e.touches.length>0){cx2=e.touches[0].clientX;cy2=e.touches[0].clientY;e.preventDefault();}
      else{cx2=(e as MouseEvent).clientX;cy2=(e as MouseEvent).clientY;}
      const cx=Math.floor((cx2-rect.left)*sx/CFG.CELL);
      const cy=Math.floor((cy2-rect.top)*sy/CFG.CELL);
      if(cx<0||cx>=CFG.COLS||cy<0||cy>=CFG.ROWS) return;
      const hit=towers.find((t:any)=>t.cx===cx&&t.cy===cy);
      if(hit){selectedTower=hit;document.querySelectorAll('.build-btn').forEach(b=>b.classList.remove('selected'));buildSelection=null;updateInfoPanel();return;}
      if(buildSelection&&grid[cx][cy]===0){
        if(cx===0||cx===CFG.GATE_COL) return;
        const cost=getBuildCost(buildSelection);
        if(gold>=cost){
          grid[cx][cy]=2;
          let ok=true;
          for(const sy2 of [2,6,10]){if(!findPath(0,sy2,CFG.GATE_COL,Math.floor(CFG.ROWS/2))){ok=false;break;}}
          for(const en of enemies){if(!en.fly&&!findPath(Math.round(en.x),Math.round(en.y),CFG.GATE_COL,Math.floor(CFG.ROWS/2))){ok=false;break;}}
          if(!ok){grid[cx][cy]=0;AudioSys.error();showToast('Cannot block path completely!');return;}
          gold-=cost;AudioSys.build();towers.push(new Tower(cx,cy,buildSelection,globalUpgradeActive));
          updateGlobalPath();updateUI();
          if(buildSelection==='Hero'){document.querySelectorAll('.build-btn').forEach(b=>b.classList.remove('selected'));buildSelection=null;}
        } else AudioSys.error();
      } else if(!buildSelection){selectedTower=null;updateInfoPanel();}
    }

    // ── RENDERING ──────────────────────────────────────────────────────────
    function drawBar(x:number,y:number,pct:number,color:string){ctx2d.fillStyle='#000';ctx2d.fillRect(x,y,40,5);ctx2d.fillStyle=color;ctx2d.fillRect(x+1,y+1,38*Math.max(0,pct),3);}

    function drawObstacle(x:number,y:number,type:string,time:number){
      ctx2d.fillStyle='rgba(0,0,0,0.5)';ctx2d.beginPath();ctx2d.ellipse(x+20,y+35,18,8,0,0,Math.PI*2);ctx2d.fill();
      if(type==='Pine'){ctx2d.fillStyle='#1e3f20';ctx2d.beginPath();ctx2d.moveTo(x+20,y-5);ctx2d.lineTo(x,y+30);ctx2d.lineTo(x+40,y+30);ctx2d.fill();ctx2d.fillStyle='#27ae60';ctx2d.beginPath();ctx2d.moveTo(x+20,y-5);ctx2d.lineTo(x+10,y+30);ctx2d.lineTo(x+30,y+30);ctx2d.fill();}
      else if(type==='Rock'){ctx2d.fillStyle='#555';ctx2d.beginPath();ctx2d.arc(x+20,y+25,14,0,Math.PI*2);ctx2d.fill();ctx2d.fillStyle='#7f8c8d';ctx2d.beginPath();ctx2d.arc(x+17,y+22,10,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Log'){ctx2d.fillStyle='#5c3a21';ctx2d.fillRect(x+5,y+15,30,12);ctx2d.fillStyle='#8b4513';ctx2d.fillRect(x+5,y+15,30,6);}
      else if(type==='Vines'){ctx2d.strokeStyle='#2ecc71';ctx2d.lineWidth=3;ctx2d.beginPath();ctx2d.moveTo(x,y+15);ctx2d.quadraticCurveTo(x+20,y+30,x+40,y+15);ctx2d.stroke();}
      else if(type==='Palm'){ctx2d.fillStyle='#d35400';ctx2d.beginPath();ctx2d.moveTo(x+18,y+10);ctx2d.quadraticCurveTo(x+25,y+20,x+18,y+35);ctx2d.lineTo(x+22,y+35);ctx2d.quadraticCurveTo(x+28,y+20,x+22,y+10);ctx2d.fill();ctx2d.fillStyle='#27ae60';ctx2d.beginPath();ctx2d.ellipse(x+10,y+12,12,4,Math.PI/4,0,Math.PI*2);ctx2d.fill();ctx2d.beginPath();ctx2d.ellipse(x+30,y+12,12,4,-Math.PI/4,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Cactus'){ctx2d.fillStyle='#27ae60';ctx2d.fillRect(x+16,y+5,8,30);ctx2d.fillRect(x+8,y+15,8,6);ctx2d.fillRect(x+24,y+20,8,6);}
      else if(type==='Cracks'){ctx2d.strokeStyle='#8b4513';ctx2d.lineWidth=2;ctx2d.beginPath();ctx2d.moveTo(x+5,y+10);ctx2d.lineTo(x+15,y+20);ctx2d.lineTo(x+10,y+30);ctx2d.stroke();}
      else if(type==='Bones'){ctx2d.fillStyle='#ecf0f1';ctx2d.beginPath();ctx2d.ellipse(x+20,y+25,12,4,-Math.PI/6,0,Math.PI*2);ctx2d.fill();ctx2d.beginPath();ctx2d.ellipse(x+20,y+25,12,4,Math.PI/6,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Grave'){ctx2d.fillStyle='#7f8c8d';ctx2d.beginPath();ctx2d.arc(x+20,y+15,12,0,Math.PI,true);ctx2d.fillRect(x+8,y+15,24,15);ctx2d.fill();ctx2d.strokeStyle='#2c3e50';ctx2d.lineWidth=2;ctx2d.beginPath();ctx2d.moveTo(x+20,y+8);ctx2d.lineTo(x+20,y+22);ctx2d.moveTo(x+15,y+12);ctx2d.lineTo(x+25,y+12);ctx2d.stroke();}
      else if(type==='DeadTree'){ctx2d.strokeStyle='#2c3e50';ctx2d.lineWidth=4;ctx2d.lineCap='round';ctx2d.beginPath();ctx2d.moveTo(x+20,y+35);ctx2d.lineTo(x+20,y+15);ctx2d.stroke();ctx2d.lineWidth=2;ctx2d.beginPath();ctx2d.moveTo(x+20,y+20);ctx2d.lineTo(x+10,y+5);ctx2d.moveTo(x+20,y+25);ctx2d.lineTo(x+32,y+10);ctx2d.stroke();}
      else if(type==='FireTrap'){const fY=Math.sin(time*0.01)*5;ctx2d.fillStyle='#2c3e50';ctx2d.beginPath();ctx2d.ellipse(x+20,y+30,15,6,0,0,Math.PI*2);ctx2d.fill();ctx2d.fillStyle='rgba(243,156,18,0.8)';ctx2d.beginPath();ctx2d.moveTo(x+10,y+30);ctx2d.lineTo(x+20,y+10+fY);ctx2d.lineTo(x+30,y+30);ctx2d.fill();}
      else if(type==='Skull'){ctx2d.fillStyle='#bdc3c7';ctx2d.beginPath();ctx2d.arc(x+20,y+20,10,0,Math.PI*2);ctx2d.fill();ctx2d.fillStyle='#2c3e50';ctx2d.beginPath();ctx2d.arc(x+16,y+18,3,0,Math.PI*2);ctx2d.arc(x+24,y+18,3,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Bush'){ctx2d.fillStyle='#1e824c';ctx2d.beginPath();ctx2d.arc(x+20,y+22,12,0,Math.PI*2);ctx2d.arc(x+12,y+25,8,0,Math.PI*2);ctx2d.arc(x+28,y+25,8,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Abyss'){const g=ctx2d.createRadialGradient(x+20,y+25,2,x+20,y+25,15);g.addColorStop(0,'#000');g.addColorStop(1,'rgba(44,62,80,0)');ctx2d.fillStyle=g;ctx2d.beginPath();ctx2d.ellipse(x+20,y+25,18,10,0,0,Math.PI*2);ctx2d.fill();}
      else if(type==='DarkCrystal'){ctx2d.fillStyle='#8e44ad';ctx2d.beginPath();ctx2d.moveTo(x+20,y+5);ctx2d.lineTo(x+10,y+25);ctx2d.lineTo(x+20,y+35);ctx2d.lineTo(x+30,y+25);ctx2d.fill();}
      else if(type==='BrokenPillar'){ctx2d.fillStyle='#7f8c8d';ctx2d.fillRect(x+12,y+10,16,25);ctx2d.fillStyle='#2c3e50';ctx2d.beginPath();ctx2d.moveTo(x+12,y+10);ctx2d.lineTo(x+20,y+18);ctx2d.lineTo(x+28,y+10);ctx2d.fill();}
      else if(type==='IceCrystal'){ctx2d.fillStyle='rgba(116,185,255,0.8)';ctx2d.beginPath();ctx2d.moveTo(x+20,y);ctx2d.lineTo(x+10,y+20);ctx2d.lineTo(x+20,y+40);ctx2d.lineTo(x+30,y+20);ctx2d.fill();}
      else if(type==='FrozenLake'){ctx2d.fillStyle='rgba(129,236,236,0.6)';ctx2d.beginPath();ctx2d.ellipse(x+20,y+25,18,10,0,0,Math.PI*2);ctx2d.fill();}
      else if(type==='Stalactite'){ctx2d.fillStyle='#dfe6e9';ctx2d.beginPath();ctx2d.moveTo(x+10,y+35);ctx2d.lineTo(x+20,y+5);ctx2d.lineTo(x+30,y+35);ctx2d.fill();}
    }

    function drawTowerDetailed(t:any,time:number){
      const px=t.cx*CFG.CELL,py=t.cy*CFG.CELL;
      if(t.type==='Wall'){
        ctx2d.fillStyle='#654321';ctx2d.fillRect(px+5,py+8,30,24);ctx2d.fillStyle='#8b4513';ctx2d.fillRect(px+2,py+12,36,4);ctx2d.fillRect(px+2,py+24,36,4);
        ctx2d.fillStyle='#654321';ctx2d.beginPath();ctx2d.moveTo(px+10,py+8);ctx2d.lineTo(px+15,py);ctx2d.lineTo(px+20,py+8);ctx2d.fill();
        ctx2d.beginPath();ctx2d.moveTo(px+20,py+8);ctx2d.lineTo(px+25,py);ctx2d.lineTo(px+30,py+8);ctx2d.fill();
      } else {
        if(t.isElite){ctx2d.shadowBlur=15;ctx2d.shadowColor='#9b59b6';}
        ctx2d.fillStyle=t.isElite?'#8e44ad':'#2c3e50';ctx2d.fillRect(px+5,py+20,30,15);ctx2d.shadowBlur=0;
        ctx2d.fillStyle='#1a252f';ctx2d.fillRect(px+2,py+35,36,5);
        if(t.type==='Archer'){
          ctx2d.fillStyle='#8b4513';ctx2d.fillRect(px+8,py+10,4,15);ctx2d.fillRect(px+28,py+10,4,15);
          ctx2d.fillStyle='#d35400';ctx2d.beginPath();ctx2d.moveTo(px,py+10);ctx2d.lineTo(px+20,py-5);ctx2d.lineTo(px+40,py+10);ctx2d.fill();
          ctx2d.fillStyle='#fff';ctx2d.font='14px sans-serif';ctx2d.fillText('🏹',px+10,py+25);
        } else if(t.type==='Ice'){
          ctx2d.save();ctx2d.translate(px+20,py+10);ctx2d.translate(0,Math.sin(time*0.005)*3);
          ctx2d.fillStyle='rgba(116,185,255,0.9)';ctx2d.beginPath();ctx2d.moveTo(0,-14);ctx2d.lineTo(10,0);ctx2d.lineTo(0,14);ctx2d.lineTo(-10,0);ctx2d.fill();
          ctx2d.fillStyle='rgba(255,255,255,0.6)';ctx2d.beginPath();ctx2d.moveTo(0,-14);ctx2d.lineTo(4,0);ctx2d.lineTo(0,14);ctx2d.fill();ctx2d.restore();
        } else if(t.type==='Fire'){
          ctx2d.fillStyle='#2d3436';ctx2d.beginPath();ctx2d.arc(px+20,py+15,12,0,Math.PI*2);ctx2d.fill();
          ctx2d.fillStyle='#000';ctx2d.beginPath();ctx2d.arc(px+20,py+12,8,0,Math.PI*2);ctx2d.fill();
          ctx2d.fillStyle=Math.random()>0.5?'#e74c3c':'#f1c40f';ctx2d.beginPath();ctx2d.arc(px+20,py+12,4+Math.random()*3,0,Math.PI*2);ctx2d.fill();
        } else if(t.type==='Lightning'){
          ctx2d.fillStyle='#7f8c8d';ctx2d.fillRect(px+16,py+5,8,15);ctx2d.fillStyle='#f1c40f';ctx2d.beginPath();ctx2d.arc(px+20,py+5,6,0,Math.PI*2);ctx2d.fill();
          if(Math.random()>0.6){ctx2d.strokeStyle='#fff';ctx2d.lineWidth=1.5;ctx2d.beginPath();ctx2d.moveTo(px+20,py+5);ctx2d.lineTo(px+20+(Math.random()-0.5)*25,py+5+(Math.random()-0.5)*25);ctx2d.stroke();}
        } else if(t.type==='Hero'){
          ctx2d.fillStyle='#f1c40f';ctx2d.fillRect(px+12,py+5,16,15);ctx2d.fillStyle='#e74c3c';ctx2d.fillRect(px+8,py+5,6,15);
          ctx2d.fillStyle='#fff';ctx2d.font='14px sans-serif';ctx2d.fillText('👑',px+11,py+6);
          if(t.level>=1){ctx2d.strokeStyle='rgba(241,196,15,0.6)';ctx2d.lineWidth=2;ctx2d.beginPath();ctx2d.arc(px+20,py+20,20+Math.sin(time*0.005)*3,0,Math.PI*2);ctx2d.stroke();}
        }
        ctx2d.fillStyle=t.isElite?'#e74c3c':'#f1c40f';ctx2d.font='12px sans-serif';ctx2d.fillText('★'.repeat(t.level+1),px+5,py+38);
      }
      if(t.hp<t.maxHp) drawBar(px,py-5,t.hp/t.maxHp,'#2ecc71');
    }

    function drawEnemyDetailed(e:any,time:number){
      const px=e.x*CFG.CELL,py=e.y*CFG.CELL,cx=px+20,cy=py+20;
      ctx2d.save();ctx2d.translate(cx,cy);
      const name:string=e.cfg.name;
      const wobble=e.fly?0:Math.sin(time*0.01+e.phaseOffset)*3;
      const flap=(e.fly||name.includes('Rồng'))?Math.sin(time*0.02+e.phaseOffset)*15:0;
      ctx2d.fillStyle='rgba(0,0,0,0.5)';ctx2d.beginPath();ctx2d.ellipse(0,15,e.boss?22:12,5,0,0,Math.PI*2);ctx2d.fill();
      ctx2d.translate(0,wobble);
      ctx2d.save();
      const bigBoss=e.boss&&(name.includes('Nhện')||name.includes('Ma Cây')||name.includes('Skeleton')||name.includes('Rồng')||name.includes('Bọ Cạp')||name.includes('Gorilla')||name.includes('Xà Vương')||name.includes('Zombie')||name.includes('Gấu')||name.includes('Ma Mút'));
      if(bigBoss) ctx2d.scale(1.5,1.5);

      if(name.includes('Bọ Cạp')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.fillRect(-10,-5,20,10);ctx2d.strokeStyle=e.cfg.color;ctx2d.lineWidth=3;
        ctx2d.beginPath();ctx2d.moveTo(-10,0);ctx2d.quadraticCurveTo(-20,-15,-5,-20);ctx2d.stroke();
        ctx2d.fillStyle='#e74c3c';ctx2d.beginPath();ctx2d.arc(-5,-20,3,0,Math.PI*2);ctx2d.fill();
      } else if(name.includes('Rết')){
        ctx2d.fillStyle=e.cfg.color;
        for(let i=0;i<4;i++){const sw=Math.sin(time*0.02+e.phaseOffset-i*0.5)*3;ctx2d.beginPath();ctx2d.arc(0,10-i*8+sw,6,0,Math.PI*2);ctx2d.fill();}
      } else if(name.includes('Xà Vương')||name.includes('Rắn')){
        ctx2d.strokeStyle=e.cfg.color;ctx2d.lineWidth=6;ctx2d.beginPath();ctx2d.moveTo(-10,10);ctx2d.quadraticCurveTo(0,-10,10,5);ctx2d.quadraticCurveTo(15,-15,5,-15);ctx2d.stroke();
        ctx2d.fillStyle='#e74c3c';ctx2d.fillRect(5,-17,4,2);
      } else if(name.includes('Gấu Bắc Cực')||name.includes('Gấu Chúa')){
        ctx2d.fillStyle='#ffffff';ctx2d.fillRect(-14,-10,28,20);ctx2d.fillRect(8,-16,12,12);
        ctx2d.fillStyle='#ecf0f1';ctx2d.beginPath();ctx2d.arc(-10,-10,4,0,Math.PI*2);ctx2d.arc(-2,-10,4,0,Math.PI*2);ctx2d.fill();
      } else if(name.includes('Chim Cánh Cụt')){
        const wd=Math.sin(time*0.02+e.phaseOffset)*8;
        ctx2d.translate(0,Math.abs(wd)*0.3);ctx2d.rotate(wd*0.02);
        ctx2d.fillStyle='#2d3436';ctx2d.beginPath();ctx2d.ellipse(0,0,12,16,0,0,Math.PI*2);ctx2d.fill();
        ctx2d.fillStyle='#ffffff';ctx2d.beginPath();ctx2d.ellipse(0,3,8,11,0,0,Math.PI*2);ctx2d.fill();
        ctx2d.fillStyle='#e17055';ctx2d.beginPath();ctx2d.moveTo(-4,-8);ctx2d.lineTo(4,-8);ctx2d.lineTo(0,-3);ctx2d.fill();
      } else if(name.includes('Ma Mút')||name.includes('Mút')){
        const step=Math.sin(time*0.015+e.phaseOffset)*5;
        ctx2d.fillStyle='#8b4513';ctx2d.beginPath();ctx2d.ellipse(-2,0,18,14,0,0,Math.PI*2);ctx2d.fill();
        ctx2d.fillStyle='#5c3a21';ctx2d.fillRect(-14+step,10,6,10);ctx2d.fillRect(-6-step,12,6,10);ctx2d.fillRect(4+step,12,6,10);ctx2d.fillRect(12-step,10,6,10);
        ctx2d.beginPath();ctx2d.arc(12,-5,10,0,Math.PI*2);ctx2d.fill();
        ctx2d.strokeStyle='#ecf0f1';ctx2d.lineWidth=3;ctx2d.beginPath();ctx2d.moveTo(14,-2);ctx2d.quadraticCurveTo(24,6,26,-6);ctx2d.stroke();
      } else if(name.includes('Ogre')||name.includes('Armored')||name.includes('Golem')||name.includes('Yeti')||name.includes('Gorilla')||name.includes('Zombie')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.fillRect(-12,-15,24,28);ctx2d.fillStyle='#fff';ctx2d.fillRect(-5,-10,4,4);ctx2d.fillRect(5,-10,4,4);
      } else if(name.includes('Wolf')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.fillRect(-15,-5,30,15);const lw=Math.sin(time*0.02+e.phaseOffset)*5;ctx2d.fillRect(-12+lw,10,4,8);ctx2d.fillRect(8-lw,10,4,8);ctx2d.fillRect(10,-12,12,10);
      } else if(name.includes('Spider')||name.includes('Nhện')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.beginPath();ctx2d.arc(0,5,12,0,Math.PI*2);ctx2d.fill();ctx2d.beginPath();ctx2d.arc(0,-5,8,0,Math.PI*2);ctx2d.fill();
        ctx2d.strokeStyle=e.cfg.color;ctx2d.lineWidth=3;const lw2=Math.sin(time*0.03)*5;
        for(const si of[-1,1]){ctx2d.beginPath();ctx2d.moveTo(si*8,0);ctx2d.lineTo(si*18,5+lw2);ctx2d.lineTo(si*25,15-lw2);ctx2d.stroke();}
      } else if(name.includes('Banshee')||name.includes('Skeleton')||name.includes('Skull')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.globalAlpha=0.8;
        ctx2d.beginPath();ctx2d.arc(0,-5,12,0,Math.PI,true);ctx2d.quadraticCurveTo(12,15,8,15);ctx2d.quadraticCurveTo(0,10,-2,15);ctx2d.quadraticCurveTo(-12,10,-10,15);ctx2d.fill();
        ctx2d.fillStyle='#000';ctx2d.beginPath();ctx2d.arc(-4,-5,3,0,Math.PI*2);ctx2d.arc(4,-5,3,0,Math.PI*2);ctx2d.fill();ctx2d.globalAlpha=1;
      } else if(name.includes('Treant')||name.includes('Ma Cây')){
        ctx2d.fillStyle='#8e6d3b';ctx2d.fillRect(-10,-5,20,20);ctx2d.fillStyle='#27ae60';ctx2d.beginPath();ctx2d.arc(0,-15,18,0,Math.PI*2);ctx2d.fill();
      } else if(e.fly||name.includes('Rồng')||name.includes('Dragon')){
        ctx2d.fillStyle=e.cfg.color;ctx2d.beginPath();ctx2d.moveTo(0,-10);ctx2d.lineTo(-25,-10+flap);ctx2d.lineTo(0,0);ctx2d.fill();ctx2d.beginPath();ctx2d.moveTo(0,-10);ctx2d.lineTo(25,-10+flap);ctx2d.lineTo(0,0);ctx2d.fill();ctx2d.fillRect(-8,-12,16,20);
      } else if(e.boss){
        ctx2d.fillStyle='#222';ctx2d.beginPath();ctx2d.moveTo(-20,-25);ctx2d.lineTo(-30,20);ctx2d.lineTo(30,20);ctx2d.lineTo(20,-25);ctx2d.fill();
        ctx2d.fillStyle=e.cfg.color;ctx2d.fillRect(-22,-25,44,45);
        ctx2d.fillStyle='#f1c40f';ctx2d.beginPath();ctx2d.moveTo(-22,-25);ctx2d.lineTo(-15,-45);ctx2d.lineTo(0,-25);ctx2d.lineTo(15,-45);ctx2d.lineTo(22,-25);ctx2d.fill();
        ctx2d.shadowBlur=10;ctx2d.shadowColor='#f00';ctx2d.fillStyle='#f00';ctx2d.fillRect(-10,-15,8,6);ctx2d.fillRect(2,-15,8,6);ctx2d.shadowBlur=0;
      } else {
        ctx2d.fillStyle=e.cfg.color;const b=Math.sin(time*0.015+e.phaseOffset)*2;ctx2d.translate(0,b);
        ctx2d.fillRect(-10,10,8,10);ctx2d.fillRect(2,10,8,10);
        ctx2d.beginPath();ctx2d.ellipse(0,5,16,12,0,0,Math.PI*2);ctx2d.fill();
        ctx2d.beginPath();ctx2d.ellipse(0,-8,14,10,0,0,Math.PI*2);ctx2d.fill();
        ctx2d.beginPath();ctx2d.ellipse(0,-20,8,8,0,0,Math.PI*2);ctx2d.fill();
        const aw=Math.sin(time*0.01+e.phaseOffset)*6;
        ctx2d.beginPath();ctx2d.ellipse(-16,-5+aw,6,12,Math.PI/8,0,Math.PI*2);ctx2d.fill();
        ctx2d.beginPath();ctx2d.ellipse(16,-5-aw,6,12,-Math.PI/8,0,Math.PI*2);ctx2d.fill();
        ctx2d.fillStyle='#fff';ctx2d.fillRect(-4,-22,3,3);ctx2d.fillRect(2,-22,3,3);
      }
      ctx2d.restore();
      if(e.stunTimer>0){ctx2d.font='16px sans-serif';ctx2d.fillText('⚡',-8,-35);}
      else if(e.slowTimer>0){ctx2d.font='16px sans-serif';ctx2d.fillText('❄️',-8,-35);}
      if(e.state==='BLOCKED'){ctx2d.fillStyle='#fff';ctx2d.font='20px monospace';ctx2d.fillText('?',-5,-40);}
      ctx2d.translate(-cx,-cy);drawBar(px,py-(e.boss?20:8),e.hp/e.maxHp,e.boss?'#8b0000':'#e74c3c');
      ctx2d.restore();
    }

    function drawProjectile(p:any,time:number){
      const px=p.x*CFG.CELL+20,py=p.y*CFG.CELL+20;ctx2d.save();ctx2d.translate(px,py);
      if(p.type==='Archer'){const a=Math.atan2(p.target.y-p.y,p.target.x-p.x);ctx2d.rotate(a);ctx2d.fillStyle='#ecf0f1';ctx2d.fillRect(-10,-1,20,2);ctx2d.fillStyle='#e74c3c';ctx2d.fillRect(-12,-3,4,6);}
      else if(p.type==='Ice'){ctx2d.rotate(time*0.01);ctx2d.font='18px sans-serif';ctx2d.fillText('❄️',-9,6);}
      else if(p.type==='Fire'){ctx2d.fillStyle='#2d3436';ctx2d.beginPath();ctx2d.arc(0,0,6,0,Math.PI*2);ctx2d.fill();ctx2d.fillStyle='#f1c40f';ctx2d.fillRect(3,-11,2,2);}
      else if(p.type==='Hero'){const a=Math.atan2(p.target.y-p.y,p.target.x-p.x);ctx2d.rotate(a);ctx2d.fillStyle='#bdc3c7';ctx2d.fillRect(-10,-2,20,4);ctx2d.fillStyle='#f1c40f';ctx2d.fillRect(-5,-6,4,12);}
      else if(p.type==='Lightning'){
        ctx2d.strokeStyle=p.isElite?'#9b59b6':'#f1c40f';ctx2d.lineWidth=2;
        const tpx=p.target.x*CFG.CELL+20,tpy=p.target.y*CFG.CELL+20;
        ctx2d.translate(-px,-py);ctx2d.beginPath();ctx2d.moveTo(px,py);ctx2d.lineTo(px+(tpx-px)/2+(Math.random()-0.5)*15,py+(tpy-py)/2+(Math.random()-0.5)*15);ctx2d.lineTo(tpx,tpy);ctx2d.stroke();
      }
      ctx2d.restore();
    }

    function drawParticle(p:any){
      const px=p.x*CFG.CELL+20,py=p.y*CFG.CELL+20;ctx2d.globalAlpha=Math.max(0,p.life);
      if(p.type==='text'){ctx2d.fillStyle=p.color;ctx2d.font="bold 20px 'VT323'";ctx2d.fillText(p.text,px-10,py);}
      else if(p.type==='slash'){ctx2d.strokeStyle='#fff';ctx2d.lineWidth=3;ctx2d.beginPath();ctx2d.moveTo(px-10,py-10);ctx2d.lineTo(px+10,py+10);ctx2d.stroke();}
      else if(p.type==='hit'){ctx2d.fillStyle='#f39c12';ctx2d.beginPath();ctx2d.arc(px,py,5,0,Math.PI*2);ctx2d.fill();}
      else if(p.type==='ice_splash'){ctx2d.fillStyle='rgba(116,185,255,0.5)';ctx2d.beginPath();ctx2d.arc(px,py,p.size*CFG.CELL,0,Math.PI*2);ctx2d.fill();}
      else if(p.type==='fire_splash'){ctx2d.fillStyle='rgba(231,76,60,0.6)';ctx2d.beginPath();ctx2d.arc(px,py,p.size*CFG.CELL,0,Math.PI*2);ctx2d.fill();}
      else if(p.type==='lightning'){ctx2d.strokeStyle='#f1c40f';ctx2d.lineWidth=4;ctx2d.beginPath();ctx2d.moveTo(px,py-40);ctx2d.lineTo(px-10,py-20);ctx2d.lineTo(px+10,py);ctx2d.lineTo(px,py+20);ctx2d.stroke();}
      else if(p.type==='holy_hammer'){ctx2d.fillStyle='rgba(241,196,15,0.4)';ctx2d.beginPath();ctx2d.arc(px,py,1.5*CFG.CELL,0,Math.PI*2);ctx2d.fill();ctx2d.fillStyle='#f1c40f';ctx2d.font='30px sans-serif';ctx2d.fillText('🔨',px-15,py+10);}
      ctx2d.globalAlpha=1;
    }

    function drawGame(time:number){
      ctx2d.clearRect(0,0,canvas.width,canvas.height);
      const cfg=MAPS[currentMapIdx];
      ctx2d.fillStyle=cfg.theme.bg;ctx2d.fillRect(0,0,canvas.width,canvas.height);
      ctx2d.fillStyle=cfg.theme.path;
      for(let c=0;c<CFG.COLS;c++) for(let r=0;r<CFG.ROWS;r++) if(cfg.terrainMap&&cfg.terrainMap[c][r]===1) ctx2d.fillRect(c*CFG.CELL,r*CFG.CELL,CFG.CELL,CFG.CELL);
      ctx2d.strokeStyle='rgba(255,255,255,0.05)';
      for(let i=0;i<=CFG.COLS;i++){ctx2d.beginPath();ctx2d.moveTo(i*CFG.CELL,0);ctx2d.lineTo(i*CFG.CELL,canvas.height);ctx2d.stroke();}
      for(let i=0;i<=CFG.ROWS;i++){ctx2d.beginPath();ctx2d.moveTo(0,i*CFG.CELL);ctx2d.lineTo(canvas.width,i*CFG.CELL);ctx2d.stroke();}
      ctx2d.fillStyle='rgba(142,68,173,0.3)';ctx2d.fillRect(CFG.GATE_COL*CFG.CELL,CFG.GATE_ROW_START*CFG.CELL,CFG.CELL,(CFG.GATE_ROW_END-CFG.GATE_ROW_START+1)*CFG.CELL);
      ctx2d.fillStyle='#8e44ad';ctx2d.fillRect(CFG.GATE_COL*CFG.CELL+35,CFG.GATE_ROW_START*CFG.CELL,5,(CFG.GATE_ROW_END-CFG.GATE_ROW_START+1)*CFG.CELL);
      mapObstacles.forEach(o=>drawObstacle(o.x*CFG.CELL,o.y*CFG.CELL,o.type,time));
      towers.forEach(t=>drawTowerDetailed(t,time));
      enemies.forEach(en=>drawEnemyDetailed(en,time));
      projectiles.forEach(p=>drawProjectile(p,time));
      particles.forEach(p=>drawParticle(p));
      if(selectedTower){
        ctx2d.strokeStyle='#ffd700';ctx2d.lineWidth=3;ctx2d.strokeRect(selectedTower.cx*CFG.CELL,selectedTower.cy*CFG.CELL,CFG.CELL,CFG.CELL);
        if(selectedTower.type!=='Wall'){ctx2d.fillStyle='rgba(255,215,0,0.1)';ctx2d.beginPath();ctx2d.arc(selectedTower.cx*CFG.CELL+20,selectedTower.cy*CFG.CELL+20,selectedTower.getStats().range*CFG.CELL,0,Math.PI*2);ctx2d.fill();}
      }
    }

    // ── MAP LIST ───────────────────────────────────────────────────────────
    function renderMapList(themeIdx:number){
      const ml=document.getElementById('map-list')!;ml.innerHTML='';
      for(let m=0;m<7;m++){
        const gi=themeIdx*7+m,locked=gi>unlockedMaps;
        const btn=document.createElement('div');
        btn.className=`map-btn${locked?' locked':''}${gi===currentMapIdx?' selected':''}`;
        btn.innerHTML=`<div class="map-num">${locked?'🔒':('M'+(gi+1))}</div><div class="map-name">${MAPS[gi].name}</div>`;
        if(!locked) btn.onclick=()=>{
          currentMapIdx=gi;
          document.querySelectorAll('.map-btn').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');
          (document.getElementById('btn-start-game') as HTMLButtonElement).disabled=false;
          generateMap();drawGame(0);
        };
        ml.appendChild(btn);
      }
    }

    // ── RESIZE ─────────────────────────────────────────────────────────────
    function resizeGame(){
      const wr=document.getElementById('game-wrapper')!,gc=document.getElementById('game-container')!;
      const scale=Math.min(wr.clientWidth/960,wr.clientHeight/640)*0.98;
      gc.style.transform=`scale(${scale})`;
    }
    window.addEventListener('resize',resizeGame); resizeGame();

    // ── BIND UI ────────────────────────────────────────────────────────────
    const themeSelect=document.getElementById('theme-select') as HTMLSelectElement;
    themeSelect.addEventListener('change',e=>renderMapList(parseInt((e.target as HTMLSelectElement).value)));
    renderMapList(0);generateMap();drawGame(0);

    document.getElementById('btn-start-game')!.onclick=()=>{
      AudioSys.init();
      playerName=(document.getElementById('input-player-name') as HTMLInputElement).value.trim()||'Guest';
      (document.getElementById('ui-player-name')!).innerText=playerName;
      startGame(currentMapIdx);
    };
    document.getElementById('btn-back-menu')!.onclick=()=>{gameState='MENU';document.getElementById('main-menu')!.style.display='flex';};
    [1,2,3].forEach(s=>{
      document.getElementById(`btn-speed-${s}`)!.onclick=(e)=>{
        gameSpeedMultiplier=s;
        document.querySelectorAll('#top-bar .controls button').forEach(b=>b.classList.remove('active'));
        (e.target as HTMLElement).classList.add('active');
      };
    });
    document.getElementById('btn-pause')!.onclick=(e)=>{
      isPaused=!isPaused;(e.target as HTMLElement).innerText=isPaused?'▶️':'⏸️';(e.target as HTMLElement).classList.toggle('active');
    };
    document.querySelectorAll('.build-btn').forEach(btn=>{
      btn.addEventListener('click',()=>{
        AudioSys.init();
        const type=btn.getAttribute('data-type')!;
        if(gold<getBuildCost(type)){AudioSys.error();return;}
        if(type==='Hero'){
          if(!globalUpgradeActive&&towers.some((t:any)=>t.type==='Hero'&&!t.isElite)){AudioSys.error();showToast('Only 1 Hero before Elite!');return;}
          if(globalUpgradeActive&&towers.some((t:any)=>t.type==='Hero'&&t.isElite)){AudioSys.error();showToast('Only 1 Elite Hero!');return;}
        }
        document.querySelectorAll('.build-btn').forEach(b=>b.classList.remove('selected'));
        btn.classList.add('selected');buildSelection=type;selectedTower=null;updateInfoPanel();
      });
    });
    document.getElementById('btn-global-tech')!.onclick=()=>{
      if(gold>=1000&&!globalUpgradeActive){gold-=1000;globalUpgradeActive=true;AudioSys.build();document.getElementById('btn-global-tech')!.style.display='none';createFloatingText(CFG.COLS/2,CFG.ROWS/2,'ELITE TECH ACTIVATED','#9b59b6');updateUI();}
      else AudioSys.error();
    };
    canvas.addEventListener('mousedown',handleCanvasClick as EventListener);
    canvas.addEventListener('touchstart',handleCanvasClick as EventListener,{passive:false});
    document.getElementById('btn-upgrade')!.onclick=upgradeTower;
    document.getElementById('btn-sell')!.onclick=sellTower;
    document.getElementById('btn-wave')!.onclick=handleWaveButton;
    document.getElementById('res-btn-menu')!.onclick=()=>{document.getElementById('result-screen')!.style.display='none';document.getElementById('main-menu')!.style.display='flex';gameState='MENU';};
    document.getElementById('res-btn-retry')!.onclick=()=>{document.getElementById('result-screen')!.style.display='none';startGame(currentMapIdx);};
    document.getElementById('res-btn-next')!.onclick=()=>{
      document.getElementById('result-screen')!.style.display='none';
      if(currentMapIdx+1<MAPS.length){currentMapIdx++;themeSelect.value=Math.floor(currentMapIdx/7).toString();renderMapList(Math.floor(currentMapIdx/7));startGame(currentMapIdx);}
    };

    lastTime=performance.now();
    rafId=requestAnimationFrame(gameLoop);
    return()=>{cancelAnimationFrame(rafId);window.removeEventListener('resize',resizeGame);};
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* React toast (outside game container) */}
      {reactToast && <div className="react-toast">{reactToast}</div>}

      {/* ── Auth Modal ─────────────────────────────────────────────────── */}
      {showAuth && (
        <div className="modal-overlay" onClick={() => setShowAuth(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAuth(false)}>✕</button>
            <div className="modal-title">⚔️ PLAYER LOGIN</div>
            <div className="tab-btns">
              <button className={`tab-btn${authTab === 'login' ? ' active' : ''}`}
                onClick={() => { setAuthTab('login'); setAuthError(''); }}>Login</button>
              <button className={`tab-btn${authTab === 'register' ? ' active' : ''}`}
                onClick={() => { setAuthTab('register'); setAuthError(''); }}>Register</button>
            </div>
            <form onSubmit={e => handleAuth(e, authTab)}>
              <div className="input-group">
                <label>Username</label>
                <input name="username" type="text" required autoFocus autoComplete="username"
                  placeholder={authTab === 'register' ? '3-16 chars, a-z 0-9 _' : 'your username'} />
              </div>
              <div className="input-group">
                <label>Password</label>
                <input name="password" type="password" required autoComplete={authTab === 'login' ? 'current-password' : 'new-password'}
                  placeholder={authTab === 'register' ? 'min 4 characters' : 'your password'} />
              </div>
              {authError && <div className="form-error">⚠️ {authError}</div>}
              <button type="submit" className="auth-submit" disabled={authBusy}>
                {authBusy ? '...' : authTab === 'login' ? 'LOGIN' : 'CREATE ACCOUNT'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ── Leaderboard Modal ──────────────────────────────────────────── */}
      {showLb && (
        <div className="modal-overlay" onClick={() => setShowLb(false)}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowLb(false)}>✕</button>
            <div className="modal-title">🏆 LEADERBOARD</div>
            {lbLoading ? (
              <p style={{ textAlign: 'center', color: '#888', fontSize: 20 }}>Loading…</p>
            ) : (
              <table className="lb-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Player</th>
                    <th>Maps</th>
                    <th>Highest Map</th>
                    <th>Total Time</th>
                    <th>Avg ⭐</th>
                  </tr>
                </thead>
                <tbody>
                  {lb.map((row, i) => (
                    <tr key={row.username} className={row.username === user?.username ? 'lb-you' : ''}>
                      <td className="lb-rank">
                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                      </td>
                      <td>{row.username}{row.username === user?.username ? ' 👈' : ''}</td>
                      <td>{row.maps_cleared}</td>
                      <td style={{ fontSize: 14 }}>{row.highest_map_name || '—'}</td>
                      <td>{fmtTime(row.total_time)}</td>
                      <td>{row.avg_stars ?? '—'}</td>
                    </tr>
                  ))}
                  {lb.length === 0 && (
                    <tr><td colSpan={6} className="lb-empty">No records yet. Be the first!</td></tr>
                  )}
                </tbody>
              </table>
            )}
            <p style={{ textAlign: 'center', color: '#555', fontSize: 15, marginTop: 16 }}>
              Ranked by maps cleared · tiebreak: total time (lower = faster)
            </p>
          </div>
        </div>
      )}

      {/* ── Game ──────────────────────────────────────────────────────────── */}
      <div id="game-wrapper">
        <div id="game-container">

          {/* Main Menu */}
          <div id="main-menu" style={{ display: 'flex' }}>
            <h1>THE LAST BORDER<br /><span style={{ fontSize: 18, color: '#ccc' }}>BREAKING DAWN</span></h1>
            <div className="menu-group">
              <label>Player Name:</label>
              <input type="text" id="input-player-name" className="name-input" defaultValue="Guest" maxLength={12} />
            </div>
            <div className="menu-group">
              <label>Select Region:</label>
              <select id="theme-select">
                <option value="0">Page 1: Deep Forest</option>
                <option value="1">Page 2: Dried Desert</option>
                <option value="2">Page 3: Dead Land</option>
                <option value="3">Page 4: Frozen Cave</option>
                <option value="4">Page 5: Forgotten Land</option>
              </select>
            </div>
            <div className="map-grid" id="map-list" />
            <button id="btn-start-game" className="btn-large">START BATTLE</button>

            {/* Auth strip (bottom-left) */}
            <div className="menu-auth-strip">
              {user ? (
                <>
                  <span className="auth-username">👤 {user.username}</span>
                  <button className="icon-btn" title="Logout" onClick={handleLogout}>🚪</button>
                </>
              ) : (
                <button className="icon-btn" onClick={() => { setShowAuth(true); setAuthError(''); }}>
                  👤 Login / Register
                </button>
              )}
              <button className="icon-btn" title="Leaderboard" onClick={openLeaderboard}>🏆 Leaderboard</button>
            </div>

            <div className="menu-tools">
              <button className="icon-btn" id="btn-save" title="Save">💾</button>
            </div>
          </div>

          {/* Top Bar */}
          <div id="top-bar">
            <div className="stat-group">
              <button id="btn-back-menu" style={{ background: '#c0392b', border: '1px solid #e74c3c', color: 'white', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>🔙</button>
              <span className="player-info">👤 <span id="ui-player-name">Guest</span></span>
              <span className="time-info">⏱️ <span id="ui-time">00:00</span></span>
              <span className="gold">🪙 <span id="ui-gold">200</span></span>
              <span className="hp">❤️ <span id="ui-hp">10</span></span>
              <span>W: <span id="ui-wave">0</span>/20</span>
            </div>
            <div className="controls">
              <button id="btn-speed-1" className="active">x1</button>
              <button id="btn-speed-2">x2</button>
              <button id="btn-speed-3">x3</button>
              <button id="btn-pause">⏸️</button>
            </div>
          </div>

          {/* Canvas */}
          <div id="canvas-container">
            <canvas id="gameCanvas" width={960} height={480} />
            <div id="countdown-overlay" style={{ display: 'none' }}>3</div>
          </div>

          {/* Bottom Panel */}
          <div id="bottom-panel">
            <div id="build-menu">
              <div className="build-btn" data-type="Wall"><div className="b-icon">🧱</div>Barrier<div className="b-cost">10g</div></div>
              <div className="build-btn" data-type="Archer"><div className="b-icon">🏹</div>Archer<div className="b-cost">50g</div></div>
              <div className="build-btn" data-type="Ice"><div className="b-icon">❄️</div>Ice<div className="b-cost">100g</div></div>
              <div className="build-btn" data-type="Fire"><div className="b-icon">💣</div>Fire<div className="b-cost">100g</div></div>
              <div className="build-btn" data-type="Lightning"><div className="b-icon">⚡</div>Lightning<div className="b-cost">150g</div></div>
              <div className="build-btn" data-type="Hero"><div className="b-icon">👑</div>Paladin<div className="b-cost">500g</div></div>
            </div>
            <div id="info-menu">
              <div id="info-content">
                <div className="info-title">Commander</div>
                <div className="info-desc">Select to build.</div>
              </div>
            </div>
            <div id="action-menu">
              <button id="btn-upgrade" className="action-btn" disabled>⬆️ Upgrade</button>
              <button id="btn-sell" className="action-btn sell" disabled>💰 Sell</button>
              <button id="btn-global-tech" className="action-btn" style={{ background: '#8e44ad', borderColor: '#9b59b6' }}>🌟 Elite (1000g)</button>
            </div>
            <div id="wave-control">
              <button id="btn-wave" className="wave-btn">Start Wave 1</button>
            </div>
          </div>

          {/* Result Screen */}
          <div id="result-screen" style={{ display: 'none' }}>
            <div id="result-title" style={{ color: '#2ecc71' }}>VICTORY</div>
            <div id="result-player">Player: Guest</div>
            <div id="result-time-disp">Clear Time: 00:00</div>
            <div id="result-stars">⭐⭐⭐</div>
            {/* Login-to-save hint */}
            <div id="result-login-hint" style={{ display: 'none', color: '#f39c12', fontFamily: "'VT323', monospace", fontSize: 20, marginBottom: 8 }}>
              👤 <span style={{ cursor: 'pointer', textDecoration: 'underline' }}
                onClick={() => { setShowAuth(true); setAuthError(''); }}>
                Login to save your score to the leaderboard!
              </span>
            </div>
            <div>
              <button id="res-btn-menu" className="res-btn btn-menu">Main Menu</button>
              <button id="res-btn-retry" className="res-btn btn-retry">Retry</button>
              <button id="res-btn-next" className="res-btn btn-next">Next Map</button>
            </div>
          </div>

          <div id="toast" className="toast" style={{ opacity: 0 }} />
        </div>
      </div>
    </>
  );
}

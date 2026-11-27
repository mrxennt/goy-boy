import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound } from './lib/canvas';

const W = 800;
const H = 520;
const R = 17;
const TANK_SPEED = 195;

type Rect = { x: number; y: number; w: number; h: number };
type Tank = { x: number; y: number; angle: number; hp: number; cooldown: number; rapid: number; invuln: number; alive: boolean };
type Bullet = { x: number; y: number; vx: number; vy: number; owner: 1 | 2 };
type Pickup = { x: number; y: number; kind: 'rapid'; alive: boolean };

const WALLS: Rect[] = [
  { x: 210, y: 110, w: 26, h: 148 },
  { x: 210, y: 330, w: 26, h: 110 },
  { x: 564, y: 90, w: 26, h: 150 },
  { x: 564, y: 320, w: 26, h: 120 },
  { x: 370, y: 242, w: 80, h: 40 },
];

const SPAWNS = {
  p1: { x: 100, y: H / 2, angle: 0 },
  p2: { x: W - 100, y: H / 2, angle: Math.PI },
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type Data = {
  p1: Tank;
  p2: Tank;
  bullets: Bullet[];
  rounds: { p1: number; p2: number };
  pickup: Pickup | null;
  pickupTimer: number;
  roundOver: boolean;
  over: boolean;
  message: string;
};

const freshTank = (spawn: { x: number; y: number; angle: number }): Tank => ({
  x: spawn.x,
  y: spawn.y,
  angle: spawn.angle,
  hp: 3,
  cooldown: 0,
  rapid: 0,
  invuln: 1500,
  alive: true,
});

const freshGame = (): Data => ({
  p1: freshTank(SPAWNS.p1),
  p2: freshTank(SPAWNS.p2),
  bullets: [],
  rounds: { p1: 0, p2: 0 },
  pickup: null,
  pickupTimer: 5000,
  roundOver: false,
  over: false,
  message: 'Erster auf zwei Runden gewinnt. F und . schießen.',
});

export default function BattleArena({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const data = useRef<Data>(freshGame());
  const keys = useRef<Set<string>>(new Set());
  const [ui, setUi] = useState({ p1: 3, p2: 3, r1: 0, r2: 0, message: '' });
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const resetTimer = useRef<number | null>(null);

  const sync = () => {
    setUi({
      p1: data.current.p1.hp,
      p2: data.current.p2.hp,
      r1: data.current.rounds.p1,
      r2: data.current.rounds.p2,
      message: data.current.message,
    });
  };

  function reset() {
    if (resetTimer.current) window.clearTimeout(resetTimer.current);
    data.current = freshGame();
    sync();
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function resolveWalls(tank: Tank) {
    tank.x = clamp(tank.x, 34, W - 34);
    tank.y = clamp(tank.y, 34, H - 34);
    for (const wall of WALLS) {
      const nx = clamp(tank.x, wall.x, wall.x + wall.w);
      const ny = clamp(tank.y, wall.y, wall.y + wall.h);
      const dx = tank.x - nx;
      const dy = tank.y - ny;
      const distance = Math.hypot(dx, dy);
      if (distance > 0.001 && distance < R) {
        tank.x += (dx / distance) * (R - distance);
        tank.y += (dy / distance) * (R - distance);
      } else if (distance <= 0.001) {
        tank.y = wall.y - R;
      }
    }
  }

  function shoot(player: 1 | 2) {
    const g = data.current;
    const tank = player === 1 ? g.p1 : g.p2;
    if (g.roundOver || g.over || tank.hp <= 0 || tank.cooldown > 0) return;
    tank.cooldown = tank.rapid > 0 ? 210 : 560;
    const speed = 470;
    g.bullets.push({
      x: tank.x + Math.cos(tank.angle) * (R + 6),
      y: tank.y + Math.sin(tank.angle) * (R + 6),
      vx: Math.cos(tank.angle) * speed,
      vy: Math.sin(tank.angle) * speed,
      owner: player,
    });
    sfx.click();
  }

  function endRound(winner: 1 | 2) {
    const g = data.current;
    if (g.roundOver) return;
    g.roundOver = true;
    g.rounds[winner === 1 ? 'p1' : 'p2'] += 1;
    g.message = `Punkt für Spieler ${winner}!`;
    sync();
    sfx.win();
    if (g.rounds.p1 >= 2 || g.rounds.p2 >= 2) {
      g.over = true;
      finishRef.current(
        0,
        g.rounds.p1 >= 2 ? `Spieler 1 gewinnt ${g.rounds.p1}:${g.rounds.p2}` : `Spieler 2 gewinnt ${g.rounds.p2}:${g.rounds.p1}`,
      );
      return;
    }
    resetTimer.current = window.setTimeout(() => {
      const next = data.current;
      next.p1 = freshTank(SPAWNS.p1);
      next.p2 = freshTank(SPAWNS.p2);
      next.bullets = [];
      next.roundOver = false;
      next.message = 'Neue Runde!';
      sync();
    }, 1600);
  }

  function damage(target: Tank, attacker: 1 | 2) {
    if (target.invuln > 0 || target.hp <= 0) return;
    target.hp -= 1;
    target.invuln = 900;
    sfx.hit();
    sync();
    if (target.hp <= 0) endRound(attacker);
  }

  function update(dtMs: number) {
    const g = data.current;
    const dt = Math.min(46, dtMs) / 1000;
    if (g.over) return;

    g.p1.cooldown = Math.max(0, g.p1.cooldown - dtMs);
    g.p2.cooldown = Math.max(0, g.p2.cooldown - dtMs);
    g.p1.rapid = Math.max(0, g.p1.rapid - dtMs);
    g.p2.rapid = Math.max(0, g.p2.rapid - dtMs);
    g.p1.invuln = Math.max(0, g.p1.invuln - dtMs);
    g.p2.invuln = Math.max(0, g.p2.invuln - dtMs);

    if (!g.roundOver) {
      const held = keys.current;
      let dx = 0;
      let dy = 0;
      if (held.has('a')) dx -= 1;
      if (held.has('d')) dx += 1;
      if (held.has('w')) dy -= 1;
      if (held.has('s')) dy += 1;
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        g.p1.x += (dx / length) * TANK_SPEED * dt;
        g.p1.y += (dy / length) * TANK_SPEED * dt;
        g.p1.angle = Math.atan2(dy, dx);
        resolveWalls(g.p1);
      }

      dx = 0;
      dy = 0;
      if (held.has('arrowleft')) dx -= 1;
      if (held.has('arrowright')) dx += 1;
      if (held.has('arrowup')) dy -= 1;
      if (held.has('arrowdown')) dy += 1;
      if (dx || dy) {
        const length = Math.hypot(dx, dy);
        g.p2.x += (dx / length) * TANK_SPEED * dt;
        g.p2.y += (dy / length) * TANK_SPEED * dt;
        g.p2.angle = Math.atan2(dy, dx);
        resolveWalls(g.p2);
      }
    }

    g.bullets = g.bullets.filter((bullet) => {
      bullet.x += bullet.vx * dt;
      bullet.y += bullet.vy * dt;
      if (bullet.x < 0 || bullet.x > W || bullet.y < 0 || bullet.y > H) return false;
      for (const wall of WALLS) {
        if (bullet.x > wall.x && bullet.x < wall.x + wall.w && bullet.y > wall.y && bullet.y < wall.y + wall.h) return false;
      }
      const target = bullet.owner === 1 ? g.p2 : g.p1;
      if (Math.hypot(bullet.x - target.x, bullet.y - target.y) < R + 3) {
        damage(target, bullet.owner);
        return false;
      }
      return true;
    });

    g.pickupTimer -= dtMs;
    if (!g.pickup && g.pickupTimer <= 0) {
      const spot = { x: 380 + Math.random() * 60, y: 120 + Math.random() * 260 };
      g.pickup = { ...spot, kind: 'rapid', alive: true };
      g.pickupTimer = 11000;
    }
    if (g.pickup) {
      for (const [index, tank] of [g.p1, g.p2].entries()) {
        if (Math.hypot(tank.x - g.pickup.x, tank.y - g.pickup.y) < R + 14) {
          tank.rapid = 7000;
          g.pickup = null;
          g.message = `Spieler ${index + 1} hat Schnellfeuer!`;
          sync();
          sfx.pick();
          break;
        }
      }
    }
  }

  function drawTank(ctx: CanvasRenderingContext2D, tank: Tank, color: string, glow: string) {
    if (tank.hp <= 0) return;
    const blink = tank.invuln > 0 && Math.floor(performance.now() / 100) % 2 === 0;
    ctx.save();
    ctx.globalAlpha = blink ? 0.45 : 1;
    ctx.translate(tank.x, tank.y);
    ctx.rotate(tank.angle);
    ctx.shadowColor = glow;
    ctx.shadowBlur = 18;
    fillRound(ctx, -18, -15, 34, 30, 9, color);
    fillRound(ctx, 8, -4, 22, 8, 4, '#e2e8f0');
    ctx.restore();
    ctx.globalAlpha = 1;
    if (tank.rapid > 0) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tank.x, tank.y, R + 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const g = data.current;
    drawBackdrop(ctx, W, H, 'rgba(76, 29, 149, 0.3)');

    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(167, 139, 250, 0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(18, 18, W - 36, H - 36);

    for (const wall of WALLS) {
      fillRound(ctx, wall.x, wall.y, wall.w, wall.h, 6, '#232742');
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 6);
      ctx.stroke();
    }

    if (g.pickup) {
      ctx.save();
      ctx.translate(g.pickup.x, g.pickup.y);
      ctx.rotate(performance.now() / 700);
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 18;
      fillRound(ctx, -11, -11, 22, 22, 4, '#facc15');
      ctx.restore();
      drawText(ctx, '⚡', g.pickup.x, g.pickup.y, 13, '#1f2937', 'center', '800');
    }

    drawTank(ctx, g.p1, '#fbbf24', '#f59e0b');
    drawTank(ctx, g.p2, '#22d3ee', '#0891b2');

    for (const bullet of g.bullets) {
      ctx.save();
      ctx.shadowColor = bullet.owner === 1 ? '#fbbf24' : '#22d3ee';
      ctx.shadowBlur = 16;
      ctx.fillStyle = bullet.owner === 1 ? '#fef3c7' : '#cffafe';
      ctx.beginPath();
      ctx.arc(bullet.x, bullet.y, 4.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawText(ctx, 'P1', 30, 30, 11, '#fbbf24', 'left', '800');
    drawText(ctx, 'P2', W - 30, 30, 11, '#22d3ee', 'right', '800');
    for (let i = 0; i < Math.max(0, g.p1.hp); i += 1) fillRound(ctx, 30 + i * 20, 44, 14, 8, 3, '#fbbf24');
    for (let i = 0; i < Math.max(0, g.p2.hp); i += 1) fillRound(ctx, W - 44 - i * 20, 44, 14, 8, 3, '#22d3ee');
  }

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'],
    down: (key) => {
      const normalised = key.length === 1 ? key.toLowerCase() : key.toLowerCase();
      keys.current.add(normalised);
      if (normalised === 'f') shoot(1);
      if (normalised === '.' || normalised === ',') shoot(2);
    },
    up: (key) => keys.current.delete(key.length === 1 ? key.toLowerCase() : key.toLowerCase()),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  const control = (key: string, down: boolean) => {
    if (down) keys.current.add(key);
    else keys.current.delete(key);
  };

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#fbbf24' }}>P1 ❤{ui.p1} · {ui.r1}</span>
          <span className="gstatus" style={{ color: '#22d3ee' }}>P2 ❤{ui.p2} · {ui.r2}</span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="arena-pad">
          <div className="arena-group">
            <span>P1</span>
            <button type="button" className="touch-btn" onPointerDown={() => control('w', true)} onPointerUp={() => control('w', false)} onPointerLeave={() => control('w', false)}>
              ▲
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('a', true)} onPointerUp={() => control('a', false)} onPointerLeave={() => control('a', false)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('s', true)} onPointerUp={() => control('s', false)} onPointerLeave={() => control('s', false)}>
              ▼
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('d', true)} onPointerUp={() => control('d', false)} onPointerLeave={() => control('d', false)}>
              ▶
            </button>
            <button type="button" className="touch-btn fire" onClick={() => shoot(1)}>
              F
            </button>
          </div>
          <div className="arena-group">
            <span>P2</span>
            <button type="button" className="touch-btn" onPointerDown={() => control('arrowup', true)} onPointerUp={() => control('arrowup', false)} onPointerLeave={() => control('arrowup', false)}>
              ▲
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('arrowleft', true)} onPointerUp={() => control('arrowleft', false)} onPointerLeave={() => control('arrowleft', false)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('arrowdown', true)} onPointerUp={() => control('arrowdown', false)} onPointerLeave={() => control('arrowdown', false)}>
              ▼
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => control('arrowright', true)} onPointerUp={() => control('arrowright', false)} onPointerLeave={() => control('arrowright', false)}>
              ▶
            </button>
            <button type="button" className="touch-btn fire" onClick={() => shoot(2)}>
              .
            </button>
          </div>
        </div>
        <p className="game-hint">{ui.message || 'Spieler 1: WASD + F · Spieler 2: Pfeiltasten + Punkt'}</p>
      </div>
    </GameStage>
  );
}

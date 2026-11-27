import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const COLS = 9;
const ROWS = 4;

type Invader = { col: number; row: number; alive: boolean };
type Bullet = { x: number; y: number };

const COLORS = ['#f472b6', '#a78bfa', '#60a5fa', '#4ade80'];

export default function SpaceInvaders({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const keys = useRef<Set<string>>(new Set());
  const player = useRef({ x: W / 2, y: H - 44, w: 46, cooldown: 0 });
  const formation = useRef({ x: 0, y: 0, dir: 1, speed: 26 });
  const invaders = useRef<Invader[]>([]);
  const playerBullets = useRef<Bullet[]>([]);
  const enemyBullets = useRef<Bullet[]>([]);
  const lives = useRef(3);
  const wave = useRef(1);
  const scored = useRef(0);
  const shotTimer = useRef(800);
  const stars = useRef(Array.from({ length: 60 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: Math.random() * 1.6 + 0.4 })));

  function spawnWave() {
    invaders.current = [];
    for (let row = 0; row < ROWS; row += 1) {
      for (let col = 0; col < COLS; col += 1) invaders.current.push({ col, row, alive: true });
    }
    formation.current = { x: 0, y: 0, dir: 1, speed: 26 + (wave.current - 1) * 8 };
    playerBullets.current = [];
    enemyBullets.current = [];
    player.current.x = W / 2;
    shotTimer.current = 900;
  }

  function reset() {
    lives.current = 3;
    wave.current = 1;
    scored.current = 0;
    session.setScore(0);
    spawnWave();
  }

  function invaderPos(col: number, row: number) {
    return {
      x: 108 + col * 58 + formation.current.x,
      y: 84 + row * 48 + formation.current.y,
    };
  }

  function gameOver() {
    sfx.hit();
    session.finish(scored.current, 'Game Over');
  }

  function update(dtMs: number) {
    const dt = Math.min(50, dtMs) / 1000;
    const p = player.current;
    if (keys.current.has('ArrowLeft') || keys.current.has('a') || keys.current.has('A')) p.x -= 380 * dt;
    if (keys.current.has('ArrowRight') || keys.current.has('d') || keys.current.has('D')) p.x += 380 * dt;
    p.x = Math.max(30, Math.min(W - 30, p.x));
    p.cooldown = Math.max(0, p.cooldown - dtMs);

    if ((keys.current.has(' ') || keys.current.has('ArrowUp')) && p.cooldown <= 0 && playerBullets.current.length < 2) {
      playerBullets.current.push({ x: p.x, y: p.y - 22 });
      p.cooldown = 300;
      sfx.click();
    }

    playerBullets.current = playerBullets.current.filter((bullet) => {
      bullet.y -= 620 * dt;
      if (bullet.y < 40) return false;
      for (const invader of invaders.current) {
        if (!invader.alive) continue;
        const pos = invaderPos(invader.col, invader.row);
        if (Math.abs(pos.x - bullet.x) < 24 && Math.abs(pos.y - bullet.y) < 20) {
          invader.alive = false;
          scored.current += 10 * (ROWS - invader.row) + wave.current * 5;
          session.setScore(scored.current);
          sfx.hit();
          return false;
        }
      }
      return true;
    });

    // formation movement
    const alive = invaders.current.filter((invader) => invader.alive);
    if (!alive.length) {
      wave.current += 1;
      scored.current += 50;
      session.setScore(scored.current);
      spawnWave();
      sfx.win();
      return;
    }

    const form = formation.current;
    form.x += form.dir * (form.speed + (COLS * ROWS - alive.length) * 0.9) * dt;
    let minX = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const invader of alive) {
      const pos = invaderPos(invader.col, invader.row);
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x);
      maxY = Math.max(maxY, pos.y);
    }
    if (maxX > W - 48 && form.dir > 0) {
      form.dir = -1;
      form.y += 20;
    } else if (minX < 48 && form.dir < 0) {
      form.dir = 1;
      form.y += 20;
    }

    if (maxY > H - 96) {
      gameOver();
      return;
    }

    // enemy fire
    shotTimer.current -= dtMs;
    if (shotTimer.current <= 0) {
      shotTimer.current = Math.max(260, 950 - wave.current * 70 - (COLS * ROWS - alive.length) * 12);
      const shooters = new Map<number, Invader>();
      for (const invader of alive) {
        const current = shooters.get(invader.col);
        if (!current || invader.row > current.row) shooters.set(invader.col, invader);
      }
      const list = [...shooters.values()];
      if (list.length) {
        const shooter = list[Math.floor(Math.random() * list.length)];
        const pos = invaderPos(shooter.col, shooter.row);
        enemyBullets.current.push({ x: pos.x, y: pos.y + 18 });
      }
    }

    enemyBullets.current = enemyBullets.current.filter((bullet) => {
      bullet.y += 330 * dt;
      if (bullet.y > H) return false;
      if (Math.abs(bullet.x - p.x) < 22 && Math.abs(bullet.y - p.y) < 24) {
        lives.current -= 1;
        sfx.hit();
        if (lives.current <= 0) {
          gameOver();
          return false;
        }
        return false;
      }
      return true;
    });
  }

  function drawInvader(x: number, y: number, color: string, row: number, time: number) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const wobble = Math.sin(time / 400 + row) * 2;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    fillRound(ctx, x - 16, y - 9 + wobble, 32, 16, 7, color);
    fillRound(ctx, x - 10, y - 16 + wobble, 20, 9, 5, color);
    // tentacles
    ctx.fillRect(x - 16, y + 7 + wobble, 5, 6);
    ctx.fillRect(x + 11, y + 7 + wobble, 5, 6);
    ctx.fillRect(x - 5, y + 7 + wobble, 4, 4);
    ctx.fillRect(x + 2, y + 7 + wobble, 4, 4);
    ctx.restore();
    ctx.fillStyle = '#0b0c14';
    ctx.beginPath();
    ctx.arc(x - 6, y - 2 + wobble, 2.2, 0, Math.PI * 2);
    ctx.arc(x + 6, y - 2 + wobble, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const time = performance.now();
    drawBackdrop(ctx, W, H, 'rgba(37, 99, 235, 0.28)');

    for (const star of stars.current) {
      ctx.fillStyle = `rgba(255,255,255,${0.15 + star.s * 0.25})`;
      ctx.fillRect(star.x, (star.y + time * 0.008 * star.s) % H, star.s, star.s);
    }

    for (const invader of invaders.current) {
      if (!invader.alive) continue;
      const pos = invaderPos(invader.col, invader.row);
      drawInvader(pos.x, pos.y, COLORS[invader.row % COLORS.length], invader.row, time);
    }

    const p = player.current;
    ctx.save();
    ctx.shadowColor = 'rgba(34, 211, 238, 0.9)';
    ctx.shadowBlur = 20;
    fillRound(ctx, p.x - 20, p.y - 8, 40, 20, 6, '#22d3ee');
    fillRound(ctx, p.x - 6, p.y - 22, 12, 18, 4, '#a5f3fc');
    ctx.restore();

    for (const bullet of playerBullets.current) {
      glowCircle(ctx, bullet.x, bullet.y, 3.4, '#67e8f9', 16);
      ctx.fillStyle = '#ecfeff';
      ctx.fillRect(bullet.x - 1, bullet.y - 10, 2, 14);
    }
    for (const bullet of enemyBullets.current) {
      glowCircle(ctx, bullet.x, bullet.y, 3.4, '#fb7185', 14);
      ctx.fillStyle = '#ffe4e6';
      ctx.fillRect(bullet.x - 1, bullet.y - 7, 2, 12);
    }

    drawText(ctx, `Welle ${wave.current}`, 20, 26, 13, '#9aa0b5', 'left', '700');
    for (let i = 0; i < lives.current; i += 1) {
      fillRound(ctx, W - 28 - i * 28, 18, 20, 14, 4, '#4ade80');
      fillRound(ctx, W - 22 - i * 28, 12, 8, 8, 2, '#86efac');
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: [' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp'],
    down: (key) => keys.current.add(key.length === 1 ? key.toLowerCase() : key),
    up: (key) => keys.current.delete(key.length === 1 ? key.toLowerCase() : key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="touch-pad">
          <button type="button" className="touch-btn left" onPointerDown={() => keys.current.add('ArrowLeft')} onPointerUp={() => keys.current.delete('ArrowLeft')} onPointerLeave={() => keys.current.delete('ArrowLeft')} aria-label="Links">
            ◀
          </button>
          <button
            type="button"
            className="touch-btn right"
            onPointerDown={() => keys.current.add('ArrowRight')}
            onPointerUp={() => keys.current.delete('ArrowRight')}
            onPointerLeave={() => keys.current.delete('ArrowRight')}
            aria-label="Rechts"
          >
            ▶
          </button>
          <button type="button" className="touch-btn fire" onPointerDown={() => keys.current.add(' ')} onPointerUp={() => keys.current.delete(' ')} aria-label="Schießen">
            ●
          </button>
        </div>
        <p className="game-hint">← → bewegen · Leertaste schießen</p>
      </div>
    </GameStage>
  );
}

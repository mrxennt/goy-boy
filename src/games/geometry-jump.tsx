import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const GROUND = 432;
const PLAYER_X = 150;

type Obstacle = { x: number; w: number; h: number; kind: 'spike' | 'block'; hue: number };

export default function GeometryJump({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const player = useRef({ y: GROUND - 32, vy: 0, rotation: 0, onGround: true });
  const obstacles = useRef<Obstacle[]>([]);
  const distance = useRef(0);
  const scored = useRef(0);
  const stars = useRef(Array.from({ length: 40 }, () => ({ x: Math.random() * W, y: Math.random() * 380, s: Math.random() * 2 + 0.6 })));
  const dead = useRef(false);

  function spawnAhead() {
    const last = obstacles.current[obstacles.current.length - 1];
    let cursor = last ? last.x + last.w : W + 60;
    let guard = 0;
    while (cursor < W + 620 && guard < 14) {
      guard += 1;
      cursor += 250 + Math.random() * 170;
      if (Math.random() < 0.58) {
        const run = Math.random() < 0.35 ? 2 : 1;
        for (let i = 0; i < run; i += 1) {
          obstacles.current.push({
            x: cursor + i * 31,
            w: 30,
            h: 34 + Math.random() * 8,
            kind: 'spike',
            hue: 330 + Math.random() * 30,
          });
        }
        cursor += run * 31;
      } else {
        const tall = Math.random() < 0.4;
        obstacles.current.push({
          x: cursor,
          w: 38,
          h: tall ? 74 : 42,
          kind: 'block',
          hue: 265 + Math.random() * 30,
        });
        cursor += 38;
      }
    }
  }

  function reset() {
    player.current = { y: GROUND - 32, vy: 0, rotation: 0, onGround: true };
    obstacles.current = [];
    distance.current = 0;
    scored.current = 0;
    dead.current = false;
    session.setScore(0);
    spawnAhead();
  }

  function speed() {
    return Math.min(600, 330 + distance.current * 0.014);
  }

  function jump() {
    const p = player.current;
    if (session.status !== 'playing' || dead.current) return;
    if (p.onGround) {
      p.vy = -735;
      p.onGround = false;
      sfx.click();
    }
  }

  function die() {
    if (dead.current) return;
    dead.current = true;
    sfx.hit();
    session.finish(scored.current, 'Crash!');
  }

  function update(dtMs: number) {
    const dt = Math.min(40, dtMs) / 1000;
    const p = player.current;
    p.vy += 2150 * dt;
    p.y += p.vy * dt;
    if (!p.onGround) p.rotation += dt * 5.6;

    if (p.y >= GROUND - 32) {
      p.y = GROUND - 32;
      p.vy = 0;
      if (!p.onGround) p.rotation = Math.round(p.rotation / (Math.PI / 2)) * (Math.PI / 2);
      p.onGround = true;
    }

    const dx = speed() * dt;
    distance.current += dx;
    for (const obstacle of obstacles.current) obstacle.x -= dx;
    obstacles.current = obstacles.current.filter((obstacle) => obstacle.x + obstacle.w > -40);

    if (!obstacles.current.length || obstacles.current[obstacles.current.length - 1].x < W + 200) spawnAhead();

    const nextScore = Math.floor(distance.current / 12);
    if (nextScore !== scored.current) {
      scored.current = nextScore;
      session.setScore(scored.current);
    }

    // collision
    const left = PLAYER_X - 14;
    const right = PLAYER_X + 14;
    const top = p.y - 14;
    const bottom = p.y + 14;
    for (const obstacle of obstacles.current) {
      if (obstacle.x > right || obstacle.x + obstacle.w < left) continue;
      if (obstacle.kind === 'block') {
        const obstacleTop = GROUND - obstacle.h;
        if (bottom > obstacleTop + 4 && top < GROUND) {
          die();
          return;
        }
      } else {
        const obstacleTop = GROUND - obstacle.h;
        const inset = 6;
        if (bottom > obstacleTop + inset && top < GROUND) {
          const relative = (PLAYER_X - obstacle.x) / obstacle.w;
          if (relative > 0.2 && relative < 0.8) {
            die();
            return;
          }
        }
      }
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(59, 7, 100, 0.5)', '#0a0716');

    for (const star of stars.current) {
      ctx.fillStyle = `rgba(196, 181, 253, ${0.2 + star.s * 0.2})`;
      ctx.fillRect((star.x - (distance.current * 0.12) % W + W) % W, star.y, star.s, star.s);
    }

    // neon horizon
    const horizon = ctx.createLinearGradient(0, 300, 0, GROUND);
    horizon.addColorStop(0, 'rgba(139, 92, 246, 0)');
    horizon.addColorStop(1, 'rgba(139, 92, 246, 0.22)');
    ctx.fillStyle = horizon;
    ctx.fillRect(0, 300, W, GROUND - 300);

    // floor
    ctx.fillStyle = '#100a22';
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.save();
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#a855f7';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();
    ctx.restore();

    for (let x = -((distance.current * 1) % 60); x < W; x += 60) {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, GROUND);
      ctx.lineTo(x - 40, H);
      ctx.stroke();
    }

    for (const obstacle of obstacles.current) {
      const top = GROUND - obstacle.h;
      ctx.save();
      ctx.shadowColor = `hsl(${obstacle.hue} 90% 60%)`;
      ctx.shadowBlur = 16;
      if (obstacle.kind === 'spike') {
        ctx.beginPath();
        ctx.moveTo(obstacle.x, GROUND);
        ctx.lineTo(obstacle.x + obstacle.w / 2, top);
        ctx.lineTo(obstacle.x + obstacle.w, GROUND);
        ctx.closePath();
        const grad = ctx.createLinearGradient(obstacle.x, top, obstacle.x, GROUND);
        grad.addColorStop(0, '#fdf2f8');
        grad.addColorStop(1, `hsl(${obstacle.hue} 90% 55%)`);
        ctx.fillStyle = grad;
        ctx.fill();
      } else {
        const grad = ctx.createLinearGradient(obstacle.x, top, obstacle.x + obstacle.w, GROUND);
        grad.addColorStop(0, `hsl(${obstacle.hue} 90% 68%)`);
        grad.addColorStop(1, `hsl(${obstacle.hue + 20} 90% 45%)`);
        fillRound(ctx, obstacle.x, top, obstacle.w, obstacle.h, 6, grad);
      }
      ctx.restore();
    }

    // player cube
    const p = player.current;
    ctx.save();
    ctx.translate(PLAYER_X, p.y);
    ctx.rotate(p.rotation);
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 24;
    const grad = ctx.createLinearGradient(-16, -16, 16, 16);
    grad.addColorStop(0, '#67e8f9');
    grad.addColorStop(1, '#8b5cf6');
    fillRound(ctx, -15, -15, 30, 30, 7, grad);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(PLAYER_X - 4, p.y - 4, 8, 8);

    // ground shadow
    glowCircle(ctx, PLAYER_X, GROUND + 4, 10, 'rgba(168, 85, 247, 0.5)', 22);

    drawText(ctx, `${scored.current} m`, 24, 28, 16, '#e9d5ff', 'left', '800');
    drawText(ctx, `${Math.round(speed())} px/s`, W - 24, 28, 12, '#9aa0b5', 'right', '600');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: [' ', 'ArrowUp'],
    down: (key) => {
      if (key === ' ' || key === 'ArrowUp' || key === 'w') jump();
    },
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} onPointerDown={jump} />
        <p className="game-hint">Leertaste / Klick / Tippen zum Springen · Stacheln und Blöcke kosten einen Versuch</p>
      </div>
    </GameStage>
  );
}

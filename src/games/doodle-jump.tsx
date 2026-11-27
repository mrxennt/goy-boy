import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;

type Platform = { x: number; y: number; w: number; type: 'normal' | 'moving' | 'break'; vx: number };

export default function DoodleJump({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const player = useRef({ x: W / 2, y: 420, vy: -640 });
  const platforms = useRef<Platform[]>([]);
  const keys = useRef<Set<string>>(new Set());
  const camera = useRef(0);
  const scored = useRef(0);
  const bestHeight = useRef(0);
  const dead = useRef(false);

  function gapForHeight() {
    return Math.min(108, 66 + camera.current / 260);
  }

  function addPlatform(y: number) {
    const w = 68 + Math.random() * 34;
    const roll = Math.random();
    const type: Platform['type'] = roll < 0.14 ? 'break' : roll < 0.28 ? 'moving' : 'normal';
    platforms.current.push({
      x: 20 + Math.random() * (W - 40 - w),
      y,
      w,
      type,
      vx: type === 'moving' ? (Math.random() < 0.5 ? -46 : 46) : 0,
    });
  }

  function reset() {
    platforms.current = [{ x: W / 2 - 70, y: 476, w: 140, type: 'normal', vx: 0 }];
    for (let i = 1; i <= 10; i += 1) addPlatform(476 - i * 64);
    player.current = { x: W / 2, y: 430, vy: -640 };
    camera.current = 0;
    scored.current = 0;
    bestHeight.current = 0;
    dead.current = false;
    session.setScore(0);
  }

  function update(dtMs: number) {
    const dt = Math.min(40, dtMs) / 1000;
    const p = player.current;
    const left = keys.current.has('ArrowLeft') || keys.current.has('a');
    const right = keys.current.has('ArrowRight') || keys.current.has('d');
    if (left) p.x -= 400 * dt;
    if (right) p.x += 400 * dt;
    if (p.x < -16) p.x = W + 16;
    if (p.x > W + 16) p.x = -16;

    const previousBottom = p.y + 18;
    p.vy += 1450 * dt;
    p.y += p.vy * dt;
    const bottom = p.y + 18;

    if (p.vy > 0) {
      for (const platform of platforms.current) {
        if (previousBottom <= platform.y + 2 && bottom >= platform.y && Math.abs(p.x - (platform.x + platform.w / 2)) < platform.w / 2 + 12) {
          if (platform.type === 'break') {
            platform.y = -9999;
            continue;
          }
          p.vy = -700;
          sfx.point();
          break;
        }
      }
    }

    if (p.y < 250) {
      const shift = 250 - p.y;
      p.y = 250;
      camera.current += shift;
      for (const platform of platforms.current) platform.y += shift;
      bestHeight.current = Math.max(bestHeight.current, camera.current);
      const nextScore = Math.floor(bestHeight.current / 8);
      if (nextScore !== scored.current) {
        scored.current = nextScore;
        session.setScore(scored.current);
      }
    }

    let topmost = Infinity;
    for (const platform of platforms.current) topmost = Math.min(topmost, platform.y);
    while (topmost > -80) {
      const y = topmost - gapForHeight() - Math.random() * 26;
      addPlatform(y);
      topmost = y;
    }

    for (const platform of platforms.current) {
      if (platform.vx) {
        platform.x += platform.vx * dt;
        if (platform.x < 6 || platform.x + platform.w > W - 6) platform.vx *= -1;
      }
    }

    platforms.current = platforms.current.filter((platform) => platform.y < H + 80);

    if (p.y > H + 60 && !dead.current) {
      dead.current = true;
      sfx.hit();
      session.finish(scored.current, 'Abgestürzt!');
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(91, 33, 182, 0.3)', '#080611');

    // dotted background
    for (let i = 0; i < 28; i += 1) {
      const x = (i * 137 + camera.current * 0.08) % W;
      const y = (i * 91 + camera.current * 0.16) % H;
      ctx.fillStyle = 'rgba(196, 181, 253, 0.14)';
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const platform of platforms.current) {
      if (platform.y < -40 || platform.y > H + 40) continue;
      const grad = ctx.createLinearGradient(platform.x, platform.y, platform.x + platform.w, platform.y + 14);
      if (platform.type === 'break') {
        grad.addColorStop(0, '#fb923c');
        grad.addColorStop(1, '#c2410c');
      } else if (platform.type === 'moving') {
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(1, '#1d4ed8');
      } else {
        grad.addColorStop(0, '#4ade80');
        grad.addColorStop(1, '#15803d');
      }
      ctx.save();
      ctx.shadowColor = platform.type === 'break' ? 'rgba(251,146,60,0.7)' : 'rgba(74,222,128,0.5)';
      ctx.shadowBlur = 12;
      fillRound(ctx, platform.x, platform.y, platform.w, 13, 6, grad);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(platform.x + 5, platform.y + 2, platform.w - 10, 2);
    }

    const p = player.current;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(performance.now() / 140) * 1.4);
    glowCircle(ctx, 0, 0, 17, '#a3e635', 24);
    const bodyGrad = ctx.createLinearGradient(-16, -18, 16, 18);
    bodyGrad.addColorStop(0, '#d9f99d');
    bodyGrad.addColorStop(1, '#4ade80');
    fillRound(ctx, -16, -16, 32, 34, 12, bodyGrad);
    ctx.fillStyle = '#0b1a0b';
    ctx.beginPath();
    ctx.arc(-6, -4, 3.4, 0, Math.PI * 2);
    ctx.arc(6, -4, 3.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b1a0b';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    if (p.vy < 0) {
      ctx.arc(0, 3, 5, 0.15 * Math.PI, 0.85 * Math.PI);
    } else {
      ctx.arc(0, 9, 4, 1.15 * Math.PI, 1.85 * Math.PI);
    }
    ctx.stroke();
    ctx.restore();

    drawText(ctx, `${scored.current} m`, 22, 28, 16, '#ede9fe', 'left', '800');
    drawText(ctx, `BEST ${session.best}`, W - 22, 28, 11, '#9aa0b5', 'right', '700');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowLeft', 'ArrowRight'],
    down: (key) => keys.current.add(key.length === 1 ? key.toLowerCase() : key),
    up: (key) => keys.current.delete(key.length === 1 ? key.toLowerCase() : key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  const hold = (key: string, down: boolean) => {
    if (down) keys.current.add(key);
    else keys.current.delete(key);
  };

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="touch-pad two">
          <button type="button" className="touch-btn left" onPointerDown={() => hold('ArrowLeft', true)} onPointerUp={() => hold('ArrowLeft', false)} onPointerLeave={() => hold('ArrowLeft', false)} aria-label="Links">
            ◀
          </button>
          <button type="button" className="touch-btn right" onPointerDown={() => hold('ArrowRight', true)} onPointerUp={() => hold('ArrowRight', false)} onPointerLeave={() => hold('ArrowRight', false)} aria-label="Rechts">
            ▶
          </button>
        </div>
        <p className="game-hint">← → bewegen · grüne Plattformen halten, orange brechen, blaue bewegen sich</p>
      </div>
    </GameStage>
  );
}

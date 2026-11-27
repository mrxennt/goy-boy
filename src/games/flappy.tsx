import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const BIRD_X = 210;
const GROUND = H - 48;

type Pipe = { x: number; gap: number; gapHeight: number; scored: boolean };

export default function Flappy({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const bird = useRef({ y: H / 2, vy: 0 });
  const pipes = useRef<Pipe[]>([]);
  const scored = useRef(0);
  const distance = useRef(0);
  const speed = useRef(215);
  const flapAnim = useRef(0);
  const dead = useRef(false);

  function reset() {
    bird.current = { y: H / 2, vy: 0 };
    pipes.current = [
      { x: W + 60, gap: H / 2, gapHeight: 168, scored: false },
      { x: W + 60 + 280, gap: H / 2 - 40, gapHeight: 168, scored: false },
      { x: W + 60 + 560, gap: H / 2 + 50, gapHeight: 168, scored: false },
    ];
    scored.current = 0;
    distance.current = 0;
    speed.current = 215;
    flapAnim.current = 0;
    dead.current = false;
    session.setScore(0);
  }

  function flap() {
    if (session.status !== 'playing' || dead.current) return;
    bird.current.vy = -420;
    flapAnim.current = 1;
    sfx.click();
  }

  function die() {
    if (dead.current) return;
    dead.current = true;
    sfx.hit();
    session.finish(scored.current, 'Game Over');
  }

  function update(dtMs: number) {
    const dt = Math.min(40, dtMs) / 1000;
    const b = bird.current;
    b.vy += 1450 * dt;
    b.y += b.vy * dt;
    flapAnim.current = Math.max(0, flapAnim.current - dt * 2.6);

    if (b.y < 18) {
      b.y = 18;
      b.vy = 0;
    }
    if (b.y + 16 >= GROUND) {
      b.y = GROUND - 16;
      die();
      return;
    }

    speed.current = Math.min(360, speed.current + dt * 4);
    distance.current += speed.current * dt;
    for (const pipe of pipes.current) {
      pipe.x -= speed.current * dt;
      if (!pipe.scored && pipe.x + 44 < BIRD_X - 14) {
        pipe.scored = true;
        scored.current += 1;
        session.setScore(scored.current);
        sfx.point();
      }
    }
    if (pipes.current.length && pipes.current[pipes.current.length - 1].x < W - 270) {
      const lastGap = pipes.current[pipes.current.length - 1]?.gap ?? H / 2;
      pipes.current.push({
        x: W + 40,
        gap: Math.max(120, Math.min(GROUND - 120, lastGap + (Math.random() - 0.5) * 190)),
        gapHeight: Math.max(140, 168 - scored.current * 1.4),
        scored: false,
      });
    }
    pipes.current = pipes.current.filter((pipe) => pipe.x > -100);

    const boxLeft = BIRD_X - 15;
    const boxRight = BIRD_X + 15;
    const boxTop = b.y - 13;
    const boxBottom = b.y + 13;
    for (const pipe of pipes.current) {
      const left = pipe.x;
      const right = pipe.x + 74;
      const gapTop = pipe.gap - pipe.gapHeight / 2;
      const gapBottom = pipe.gap + pipe.gapHeight / 2;
      if (boxRight > left && boxLeft < right && (boxTop < gapTop || boxBottom > gapBottom)) {
        die();
        return;
      }
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(14, 116, 144, 0.3)', '#071019');

    // parallax skyline
    const offset = (distance.current * 0.18) % 160;
    ctx.fillStyle = 'rgba(30, 41, 59, 0.55)';
    for (let i = -1; i < 7; i += 1) {
      const x = i * 160 - offset;
      const h = 60 + ((i * 53) % 90);
      ctx.fillRect(x, GROUND - h, 90, h);
    }

    for (const pipe of pipes.current) {
      const gapTop = pipe.gap - pipe.gapHeight / 2;
      const gapBottom = pipe.gap + pipe.gapHeight / 2;
      const grad = ctx.createLinearGradient(pipe.x, 0, pipe.x + 74, 0);
      grad.addColorStop(0, '#4ade80');
      grad.addColorStop(0.5, '#22c55e');
      grad.addColorStop(1, '#15803d');
      ctx.save();
      ctx.shadowColor = 'rgba(34, 197, 94, 0.55)';
      ctx.shadowBlur = 16;
      fillRound(ctx, pipe.x, 0, 74, gapTop, 8, grad);
      fillRound(ctx, pipe.x, gapBottom, 74, GROUND - gapBottom, 8, grad);
      ctx.restore();
      fillRound(ctx, pipe.x - 6, gapTop - 22, 86, 22, 6, '#15803d');
      fillRound(ctx, pipe.x - 6, gapBottom, 86, 22, 6, '#15803d');
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(pipe.x + 10, 0, 5, gapTop);
      ctx.fillRect(pipe.x + 10, gapBottom, 5, GROUND - gapBottom);
    }

    // ground
    const groundGrad = ctx.createLinearGradient(0, GROUND, 0, H);
    groundGrad.addColorStop(0, '#134e4a');
    groundGrad.addColorStop(1, '#052e2b');
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    ctx.lineTo(W, GROUND);
    ctx.stroke();
    for (let x = -((distance.current * 1.2) % 40); x < W; x += 40) {
      ctx.fillStyle = 'rgba(74, 222, 128, 0.14)';
      ctx.fillRect(x, GROUND + 8, 20, 3);
    }

    // bird
    const b = bird.current;
    ctx.save();
    ctx.translate(BIRD_X, b.y);
    ctx.rotate(Math.max(-0.5, Math.min(0.9, b.vy / 700)));
    glowCircle(ctx, 0, 0, 17, '#fbbf24', 26);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.ellipse(-1, 2, 12, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    const wingLift = 4 + flapAnim.current * 10;
    ctx.fillStyle = '#fffbeb';
    ctx.beginPath();
    ctx.ellipse(-3, 2, 9, wingLift, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(7, -5, 4.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111827';
    ctx.beginPath();
    ctx.arc(8.4, -5, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(15, 1);
    ctx.lineTo(25, 4);
    ctx.lineTo(15, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    drawText(ctx, String(scored.current), W / 2, 58, 42, 'rgba(255,255,255,0.9)', 'center', '800');
    drawText(ctx, 'BEST ' + session.best, W - 20, 24, 11, '#9aa0b5', 'right', '700');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: [' ', 'ArrowUp'],
    down: (key) => {
      if (key === ' ' || key === 'ArrowUp') flap();
    },
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onPointerDown={() => flap()}
        />
        <p className="game-hint">Leertaste, ↑ oder Tippen – jeder Schlag hält dich oben.</p>
      </div>
    </GameStage>
  );
}

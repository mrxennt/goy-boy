import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const PADDLE_Y = H - 44;
const WALL = 10;

type Brick = { x: number; y: number; w: number; h: number; alive: boolean; hue: number };
type Ball = { x: number; y: number; vx: number; vy: number; r: number; stuck: boolean };
type Capsule = { x: number; y: number; kind: 'wide' | 'multi' };

const ROWS = 5;
const COLS = 9;

function makeBricks(): Brick[] {
  const bricks: Brick[] = [];
  const gap = 6;
  const totalGap = gap * (COLS - 1);
  const bw = (W - WALL * 2 - totalGap) / COLS;
  const bh = 26;
  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      bricks.push({
        x: WALL + col * (bw + gap),
        y: 76 + row * (bh + 8),
        w: bw,
        h: bh,
        alive: true,
        hue: 190 + row * 24,
      });
    }
  }
  return bricks;
}

export default function Breakout({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const paddle = useRef({ x: W / 2, w: 116, target: W / 2 });
  const balls = useRef<Ball[]>([]);
  const bricks = useRef<Brick[]>(makeBricks());
  const capsules = useRef<Capsule[]>([]);
  const lives = useRef(3);
  const level = useRef(1);
  const scored = useRef(0);
  const activeKeys = useRef<Set<string>>(new Set());
  const boardCleared = useRef(false);

  function resetBall() {
    balls.current = [{ x: paddle.current.x, y: PADDLE_Y - 12, vx: 0, vy: 0, r: 8, stuck: true }];
  }

  function reset() {
    paddle.current = { x: W / 2, w: 116, target: W / 2 };
    bricks.current = makeBricks();
    capsules.current = [];
    lives.current = 3;
    level.current = 1;
    scored.current = 0;
    boardCleared.current = false;
    session.setScore(0);
    resetBall();
  }

  function launch() {
    const ball = balls.current[0];
    if (!ball || !ball.stuck) return;
    ball.stuck = false;
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * 0.5;
    const speed = 360 + level.current * 18;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    sfx.point();
  }

  function loseLife() {
    lives.current -= 1;
    sfx.hit();
    if (lives.current <= 0) {
      session.finish(scored.current, 'Game Over');
      return;
    }
    resetBall();
  }

  function nextLevel() {
    level.current += 1;
    scored.current += 100;
    session.setScore(scored.current);
    bricks.current = makeBricks();
    capsules.current = [];
    boardCleared.current = false;
    resetBall();
    sfx.win();
  }

  function update(dtMs: number) {
    const dt = Math.min(50, dtMs) / 1000;
    const p = paddle.current;
    const keys = activeKeys.current;
    if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) p.target -= 760 * dt;
    if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) p.target += 760 * dt;
    p.target = Math.max(WALL + p.w / 2, Math.min(W - WALL - p.w / 2, p.target));
    p.x += (p.target - p.x) * Math.min(1, dt * 22);

    for (const ball of balls.current) {
      if (ball.stuck) {
        ball.x = p.x;
        ball.y = PADDLE_Y - ball.r - 4;
        continue;
      }
      const steps = 2;
      for (let s = 0; s < steps; s += 1) {
        ball.x += (ball.vx * dt) / steps;
        ball.y += (ball.vy * dt) / steps;

        if (ball.x - ball.r < WALL) {
          ball.x = WALL + ball.r;
          ball.vx = Math.abs(ball.vx);
        }
        if (ball.x + ball.r > W - WALL) {
          ball.x = W - WALL - ball.r;
          ball.vx = -Math.abs(ball.vx);
        }
        if (ball.y - ball.r < 52) {
          ball.y = 52 + ball.r;
          ball.vy = Math.abs(ball.vy);
        }

        if (
          ball.vy > 0 &&
          ball.y + ball.r >= PADDLE_Y &&
          ball.y - ball.r <= PADDLE_Y + 16 &&
          Math.abs(ball.x - p.x) <= p.w / 2 + ball.r
        ) {
          const rel = Math.max(-1, Math.min(1, (ball.x - p.x) / (p.w / 2)));
          const speed = Math.min(720, Math.hypot(ball.vx, ball.vy) * 1.03 + 6);
          const angle = rel * 1.05;
          ball.vx = Math.sin(angle) * speed;
          ball.vy = -Math.abs(Math.cos(angle) * speed);
          ball.y = PADDLE_Y - ball.r - 1;
          sfx.click();
        }

        for (const brick of bricks.current) {
          if (!brick.alive) continue;
          const nearestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.w));
          const nearestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.h));
          const dx = ball.x - nearestX;
          const dy = ball.y - nearestY;
          if (dx * dx + dy * dy > ball.r * ball.r) continue;

          brick.alive = false;
          scored.current += 10;
          session.setScore(scored.current);
          sfx.point();

          const overlapX = ball.x < brick.x + brick.w / 2 ? ball.x + ball.r - brick.x : brick.x + brick.w - (ball.x - ball.r);
          const overlapY = ball.y < brick.y + brick.h / 2 ? ball.y + ball.r - brick.y : brick.y + brick.h - (ball.y - ball.r);
          if (overlapX < overlapY) {
            ball.vx = -ball.vx;
            ball.x += ball.vx > 0 ? overlapX + 1 : -(overlapX + 1);
          } else {
            ball.vy = -ball.vy;
            ball.y += ball.vy > 0 ? overlapY + 1 : -(overlapY + 1);
          }

          if (Math.random() < 0.16) {
            capsules.current.push({
              x: brick.x + brick.w / 2,
              y: brick.y + brick.h / 2,
              kind: Math.random() < 0.55 ? 'wide' : 'multi',
            });
          }
          break;
        }
      }

      if (ball.y - ball.r > H + 20) {
        balls.current = balls.current.filter((b) => b !== ball);
      }
    }

    if (!balls.current.length) {
      loseLife();
    }

    capsules.current = capsules.current.filter((capsule) => {
      capsule.y += 150 * dt;
      const caught =
        capsule.y > PADDLE_Y - 10 &&
        capsule.y < PADDLE_Y + 24 &&
        Math.abs(capsule.x - p.x) < p.w / 2 + 18;
      if (caught) {
        if (capsule.kind === 'wide') {
          p.w = 168;
        } else {
          const base = balls.current[0];
          if (base) {
            const speed = Math.hypot(base.vx, base.vy) || 380;
            balls.current.push(
              { ...base, vx: speed * 0.7, vy: -speed * 0.7 },
              { ...base, vx: -speed * 0.7, vy: -speed * 0.7 },
            );
          }
        }
        sfx.pick();
        return false;
      }
      return capsule.y < H + 20;
    });

    if (!boardCleared.current && bricks.current.every((brick) => !brick.alive)) {
      boardCleared.current = true;
      nextLevel();
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(88, 28, 135, 0.35)');

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.strokeRect(WALL, 50, W - WALL * 2, H - 50);

    for (const brick of bricks.current) {
      if (!brick.alive) continue;
      const grad = ctx.createLinearGradient(brick.x, brick.y, brick.x + brick.w, brick.y + brick.h);
      grad.addColorStop(0, `hsl(${brick.hue} 85% 62%)`);
      grad.addColorStop(1, `hsl(${brick.hue + 26} 85% 48%)`);
      ctx.save();
      ctx.shadowColor = `hsla(${brick.hue} 90% 60% / 0.55)`;
      ctx.shadowBlur = 12;
      fillRound(ctx, brick.x, brick.y, brick.w, brick.h, 6, grad);
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(brick.x + 4, brick.y + 4, brick.w - 8, 2);
    }

    const p = paddle.current;
    const paddleGrad = ctx.createLinearGradient(p.x - p.w / 2, 0, p.x + p.w / 2, 0);
    paddleGrad.addColorStop(0, '#22d3ee');
    paddleGrad.addColorStop(0.5, '#a78bfa');
    paddleGrad.addColorStop(1, '#f472b6');
    ctx.save();
    ctx.shadowColor = 'rgba(167, 139, 250, 0.85)';
    ctx.shadowBlur = 22;
    fillRound(ctx, p.x - p.w / 2, PADDLE_Y, p.w, 14, 7, paddleGrad);
    ctx.restore();

    for (const ball of balls.current) {
      glowCircle(ctx, ball.x, ball.y, ball.r, '#e0f2fe', 24);
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.r * 0.55, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const capsule of capsules.current) {
      fillRound(ctx, capsule.x - 14, capsule.y - 9, 28, 18, 6, capsule.kind === 'wide' ? '#facc15' : '#22d3ee');
      drawText(ctx, capsule.kind === 'wide' ? 'W' : 'M', capsule.x, capsule.y, 11, '#0b0c14', 'center', '800');
    }

    // HUD
    drawText(ctx, `Level ${level.current}`, W - 18, 28, 13, '#9aa0b5', 'right', '700');
    for (let i = 0; i < Math.max(0, lives.current); i += 1) {
      glowCircle(ctx, 24 + i * 22, 28, 6, '#f472b6', 12);
    }
    if (balls.current.some((ball) => ball.stuck)) {
      drawText(ctx, 'Klick oder Leertaste zum Starten', W / 2, H - 84, 13, '#c4b5fd', 'center', '600');
    }
    if (p.w > 120) {
      drawText(ctx, 'WIDE', 18, 54, 10, '#facc15', 'left', '800');
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowLeft', 'ArrowRight', ' '],
    down: (key) => {
      activeKeys.current.add(key);
      if (key === ' ') launch();
    },
    up: (key) => activeKeys.current.delete(key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  const movePaddle = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    paddle.current.target = ((clientX - rect.left) / rect.width) * W;
  };

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onPointerMove={(event) => movePaddle(event.clientX)}
          onPointerDown={(event) => {
            movePaddle(event.clientX);
            if (session.status === 'playing') launch();
          }}
        />
        <p className="game-hint">Maus oder ← → · Leertaste startet den Ball · Power-ups: W = breiter, M = Multiball</p>
      </div>
    </GameStage>
  );
}

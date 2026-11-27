import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const PADDLE_W = 13;
const PADDLE_H = 86;
const WIN_SCORE = 7;

export default function Pong2P({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const left = useRef({ y: H / 2 });
  const right = useRef({ y: H / 2 });
  const ball = useRef({ x: W / 2, y: H / 2, vx: 0, vy: 0 });
  const keys = useRef<Set<string>>(new Set());
  const serve = useRef(900);
  const scores = useRef({ left: 0, right: 0 });
  const [display, setDisplay] = useState({ left: 0, right: 0 });
  const dead = useRef(false);

  function resetBall(direction: number) {
    ball.current = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    serve.current = 850;
    const angle = (Math.random() - 0.5) * 0.6;
    window.setTimeout(() => {
      ball.current.vx = Math.cos(angle) * 380 * direction;
      ball.current.vy = Math.sin(angle) * 380;
    }, 0);
    serveDirection.current = direction;
  }

  const serveDirection = useRef(1);

  function reset() {
    left.current = { y: H / 2 };
    right.current = { y: H / 2 };
    ball.current = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    scores.current = { left: 0, right: 0 };
    serve.current = 900;
    serveDirection.current = Math.random() < 0.5 ? 1 : -1;
    dead.current = false;
    setDisplay({ left: 0, right: 0 });
  }

  function point(scorer: 'left' | 'right') {
    scores.current[scorer] += 1;
    setDisplay({ ...scores.current });
    sfx.point();
    if (scores.current[scorer] >= WIN_SCORE) {
      dead.current = true;
      sfx.win();
      session.finish(0, scorer === 'left' ? `Spieler 1 gewinnt ${scores.current.left}:${scores.current.right}` : `Spieler 2 gewinnt ${scores.current.right}:${scores.current.left}`);
      return;
    }
    resetBall(scorer === 'left' ? 1 : -1);
  }

  function update(dtMs: number) {
    if (dead.current) return;
    const dt = Math.min(46, dtMs) / 1000;
    const held = keys.current;
    const speed = 470;

    if (held.has('w') || held.has('W')) left.current.y -= speed * dt;
    if (held.has('s') || held.has('S')) left.current.y += speed * dt;
    if (held.has('ArrowUp')) right.current.y -= speed * dt;
    if (held.has('ArrowDown')) right.current.y += speed * dt;

    left.current.y = Math.max(PADDLE_H / 2 + 8, Math.min(H - PADDLE_H / 2 - 8, left.current.y));
    right.current.y = Math.max(PADDLE_H / 2 + 8, Math.min(H - PADDLE_H / 2 - 8, right.current.y));

    if (serve.current > 0) {
      serve.current -= dtMs;
      if (serve.current <= 0) {
        const angle = (Math.random() - 0.5) * 0.5;
        ball.current.vx = Math.cos(angle) * 390 * serveDirection.current;
        ball.current.vy = Math.sin(angle) * 390;
      }
      return;
    }

    const b = ball.current;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.y < 12) {
      b.y = 12;
      b.vy = Math.abs(b.vy);
      sfx.click();
    }
    if (b.y > H - 12) {
      b.y = H - 12;
      b.vy = -Math.abs(b.vy);
      sfx.click();
    }

    const leftX = 34;
    const rightX = W - 34;
    if (b.vx < 0 && b.x - 9 < leftX + PADDLE_W / 2 && b.x > leftX - 20 && Math.abs(b.y - left.current.y) < PADDLE_H / 2 + 9) {
      const relative = (b.y - left.current.y) / (PADDLE_H / 2);
      const speedNow = Math.min(820, Math.hypot(b.vx, b.vy) * 1.06);
      b.vx = Math.abs(Math.cos(relative * 0.9) * speedNow);
      b.vy = Math.sin(relative * 0.9) * speedNow;
      b.x = leftX + PADDLE_W / 2 + 10;
      sfx.hit();
    }
    if (b.vx > 0 && b.x + 9 > rightX - PADDLE_W / 2 && b.x < rightX + 20 && Math.abs(b.y - right.current.y) < PADDLE_H / 2 + 9) {
      const relative = (b.y - right.current.y) / (PADDLE_H / 2);
      const speedNow = Math.min(820, Math.hypot(b.vx, b.vy) * 1.06);
      b.vx = -Math.abs(Math.cos(relative * 0.9) * speedNow);
      b.vy = Math.sin(relative * 0.9) * speedNow;
      b.x = rightX - PADDLE_W / 2 - 10;
      sfx.hit();
    }

    if (b.x < -20) point('right');
    if (b.x > W + 20) point('left');
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(76, 29, 149, 0.35)');

    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.setLineDash([12, 16]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 40);
    ctx.lineTo(W / 2, H - 40);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255,255,255,0.09)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, W - 32, H - 32);

    const drawPaddle = (x: number, y: number, color: string) => {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
      fillRound(ctx, x - PADDLE_W / 2, y - PADDLE_H / 2, PADDLE_W, PADDLE_H, 6, color);
      ctx.restore();
    };
    drawPaddle(34, left.current.y, '#facc15');
    drawPaddle(W - 34, right.current.y, '#22d3ee');

    glowCircle(ctx, ball.current.x, ball.current.y, 9, '#f8fafc', 26);
    ctx.fillStyle = '#a78bfa';
    ctx.beginPath();
    ctx.arc(ball.current.x, ball.current.y, 5, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, String(scores.current.left), W / 2 - 80, 74, 52, 'rgba(250, 204, 21, 0.85)', 'center', '800');
    drawText(ctx, String(scores.current.right), W / 2 + 80, 74, 52, 'rgba(34, 211, 238, 0.85)', 'center', '800');
    drawText(ctx, 'SPIELER 1', 22, H - 30, 10, 'rgba(250,204,21,0.7)', 'left', '700');
    drawText(ctx, 'SPIELER 2', W - 22, H - 30, 10, 'rgba(34,211,238,0.7)', 'right', '700');

    if (serve.current > 0) {
      drawText(ctx, 'Aufschlag…', W / 2, H / 2 + 70, 14, '#c4b5fd', 'center', '600');
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', ' '],
    down: (key) => keys.current.add(key),
    up: (key) => keys.current.delete(key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#facc15' }}>P1 <b>{display.left}</b></span>
          <span className="gstatus" style={{ color: '#22d3ee' }}>P2 <b>{display.right}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <p className="game-hint">Spieler 1: W / S · Spieler 2: ↑ / ↓ · Erster mit 7 Punkten gewinnt.</p>
      </div>
    </GameStage>
  );
}

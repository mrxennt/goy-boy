import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawGrid, fillRound, glowCircle, roundRectPath } from './lib/canvas';

const CELL = 32;
const COLS = 24;
const ROWS = 15;
const W = COLS * CELL;
const H = ROWS * CELL;

type Vec = { x: number; y: number };

function freeCells(body: Vec[]): Vec[] {
  const cells: Vec[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      if (!body.some((segment) => segment.x === x && segment.y === y)) cells.push({ x, y });
    }
  }
  return cells;
}

function spawnFood(body: Vec[]): Vec {
  const cells = freeCells(body);
  return cells[Math.floor(Math.random() * cells.length)] ?? { x: 0, y: 0 };
}

export default function Snake({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const body = useRef<Vec[]>([{ x: 8, y: 7 }]);
  const direction = useRef<Vec>({ x: 1, y: 0 });
  const queue = useRef<Vec[]>([]);
  const food = useRef<Vec>({ x: 16, y: 7 });
  const acc = useRef(0);
  const stepMs = useRef(165);
  const scored = useRef(0);
  const eating = useRef(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(13, 148, 136, 0.22)');
    drawGrid(ctx, W, H, CELL, 'rgba(255,255,255,0.035)');

    // food
    const pulse = 1 + Math.sin(performance.now() / 220) * 0.1;
    const fx = food.current.x * CELL + CELL / 2;
    const fy = food.current.y * CELL + CELL / 2;
    glowCircle(ctx, fx, fy, 10 * pulse, '#4ade80', 26);
    ctx.fillStyle = '#dcfce7';
    ctx.beginPath();
    ctx.arc(fx - 3, fy - 4, 2.4, 0, Math.PI * 2);
    ctx.fill();

    // snake
    const total = body.current.length;
    body.current.forEach((segment, index) => {
      const t = index / Math.max(1, total - 1);
      const x = segment.x * CELL + 2;
      const y = segment.y * CELL + 2;
      const size = CELL - 4;
      const grad = ctx.createLinearGradient(x, y, x + size, y + size);
      grad.addColorStop(0, index === 0 ? '#a7f3d0' : `rgba(34, 211, 238, ${0.95 - t * 0.4})`);
      grad.addColorStop(1, index === 0 ? '#34d399' : `rgba(74, 222, 128, ${0.9 - t * 0.45})`);
      ctx.save();
      if (index === 0) {
        ctx.shadowColor = 'rgba(74, 222, 128, 0.8)';
        ctx.shadowBlur = 18;
      }
      fillRound(ctx, x, y, size, size, index === 0 ? 10 : 7, grad);
      ctx.restore();
      if (index === 0) {
        const cx = x + size / 2;
        const cy = y + size / 2;
        const dx = direction.current.x * 5;
        const dy = direction.current.y * 5;
        ctx.fillStyle = '#052e16';
        if (direction.current.x !== 0) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy - 5, 2.6, 0, Math.PI * 2);
          ctx.arc(cx + dx, cy + 5, 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx - 5, cy + dy, 2.6, 0, Math.PI * 2);
          ctx.arc(cx + 5, cy + dy, 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    if (eating.current > 0) {
      const p = eating.current;
      ctx.save();
      ctx.globalAlpha = p;
      ctx.strokeStyle = '#86efac';
      ctx.lineWidth = 2;
      roundRectPath(ctx, (W - 160) / 2, 16, 160, 30, 15);
      ctx.stroke();
      ctx.restore();
      eating.current = Math.max(0, p - 0.04);
    }
  }

  function reset() {
    body.current = [
      { x: 8, y: 7 },
      { x: 7, y: 7 },
      { x: 6, y: 7 },
    ];
    direction.current = { x: 1, y: 0 };
    queue.current = [];
    food.current = spawnFood(body.current);
    acc.current = 0;
    stepMs.current = 165;
    scored.current = 0;
    session.setScore(0);
    draw();
  }

  function turn(next: Vec) {
    const base = queue.current.length ? queue.current[queue.current.length - 1] : direction.current;
    if (next.x === -base.x && next.y === -base.y) return;
    if (next.x === base.x && next.y === base.y) return;
    if (queue.current.length < 2) queue.current.push(next);
  }

  function die() {
    sfx.hit();
    session.finish(scored.current, 'Game Over');
  }

  function tick() {
    const nextDirection = queue.current.shift();
    if (nextDirection) direction.current = nextDirection;
    const head = body.current[0];
    const nx = head.x + direction.current.x;
    const ny = head.y + direction.current.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      die();
      return;
    }
    const willEat = nx === food.current.x && ny === food.current.y;
    const limit = willEat ? body.current.length : body.current.length - 1;
    for (let i = 0; i < limit; i += 1) {
      if (body.current[i].x === nx && body.current[i].y === ny) {
        die();
        return;
      }
    }

    body.current = [{ x: nx, y: ny }, ...body.current];
    if (willEat) {
      scored.current += 10;
      session.setScore(scored.current);
      sfx.point();
      eating.current = 1;
      stepMs.current = Math.max(72, stepMs.current - 4);
      food.current = spawnFood(body.current);
    } else {
      body.current.pop();
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '],
    down: (key) => {
      if (key === 'ArrowUp' || key === 'w' || key === 'W') turn({ x: 0, y: -1 });
      else if (key === 'ArrowDown' || key === 's' || key === 'S') turn({ x: 0, y: 1 });
      else if (key === 'ArrowLeft' || key === 'a' || key === 'A') turn({ x: -1, y: 0 });
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') turn({ x: 1, y: 0 });
    },
  });

  useRafLoop((dt) => {
    acc.current += dt;
    if (acc.current >= stepMs.current) {
      acc.current = 0;
      tick();
    }
    draw();
  }, session.status === 'playing');

  const padPress = (dx: number, dy: number) => {
    turn({ x: dx, y: dy });
  };

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={(event) => {
            const start = touchStart.current;
            if (!start) return;
            const touch = event.changedTouches[0];
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) < 18 && Math.abs(dy) < 18) return;
            if (Math.abs(dx) > Math.abs(dy)) padPress(Math.sign(dx), 0);
            else padPress(0, Math.sign(dy));
            touchStart.current = null;
          }}
        />
        <div className="touch-pad" aria-label="Richtungstasten">
          <button type="button" className="touch-btn up" onClick={() => padPress(0, -1)} aria-label="Hoch">
            ▲
          </button>
          <button type="button" className="touch-btn left" onClick={() => padPress(-1, 0)} aria-label="Links">
            ◀
          </button>
          <button type="button" className="touch-btn down" onClick={() => padPress(0, 1)} aria-label="Runter">
            ▼
          </button>
          <button type="button" className="touch-btn right" onClick={() => padPress(1, 0)} aria-label="Rechts">
            ▶
          </button>
        </div>
        <p className="game-hint">Pfeiltasten / WASD · auf dem Smartphone wischen oder D-Pad nutzen</p>
      </div>
    </GameStage>
  );
}

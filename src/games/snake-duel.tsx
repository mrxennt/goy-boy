import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawGrid, drawText, fillRound, glowCircle } from './lib/canvas';

const CELL = 30;
const COLS = 22;
const ROWS = 14;
const W = COLS * CELL;
const H = ROWS * CELL;
const STEP_MS = 145;

type Vec = { x: number; y: number };

type SnakeState = {
  body: Vec[];
  dir: Vec;
  queue: Vec[];
  alive: boolean;
  eaten: number;
  color: string;
  glow: string;
};

function createSnake(start: Vec, dir: Vec, color: string, glow: string): SnakeState {
  return {
    body: [start, { x: start.x - dir.x, y: start.y - dir.y }, { x: start.x - dir.x * 2, y: start.y - dir.y * 2 }],
    dir,
    queue: [],
    alive: true,
    eaten: 0,
    color,
    glow,
  };
}

function freeCells(a: Vec[], b: Vec[]): Vec[] {
  const cells: Vec[] = [];
  for (let y = 0; y < ROWS; y += 1) {
    for (let x = 0; x < COLS; x += 1) {
      const taken = [...a, ...b].some((segment) => segment.x === x && segment.y === y);
      if (!taken) cells.push({ x, y });
    }
  }
  return cells;
}

function spawnFood(a: Vec[], b: Vec[]): Vec {
  const cells = freeCells(a, b);
  return cells[Math.floor(Math.random() * cells.length)] ?? { x: 1, y: 1 };
}

function turn(snake: SnakeState, next: Vec) {
  const base = snake.queue.length ? snake.queue[snake.queue.length - 1] : snake.dir;
  if (next.x === -base.x && next.y === -base.y) return;
  if (next.x === base.x && next.y === base.y) return;
  if (snake.queue.length < 2) snake.queue.push(next);
}

export default function SnakeDuel({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const p1 = useRef<SnakeState>(createSnake({ x: 4, y: 3 }, { x: 1, y: 0 }, '#4ade80', 'rgba(74, 222, 128, 0.75)'));
  const p2 = useRef<SnakeState>(createSnake({ x: COLS - 5, y: ROWS - 4 }, { x: -1, y: 0 }, '#f472b6', 'rgba(244, 114, 182, 0.75)'));
  const food = useRef<Vec>({ x: 10, y: 6 });
  const acc = useRef(0);
  const over = useRef(false);
  const tickCount = useRef(0);

  function reset() {
    p1.current = createSnake({ x: 4, y: 3 }, { x: 1, y: 0 }, '#4ade80', 'rgba(74, 222, 128, 0.75)');
    p2.current = createSnake({ x: COLS - 5, y: ROWS - 4 }, { x: -1, y: 0 }, '#f472b6', 'rgba(244, 114, 182, 0.75)');
    food.current = spawnFood(p1.current.body, p2.current.body);
    acc.current = 0;
    over.current = false;
    tickCount.current = 0;
    session.setScore(0);
    draw();
  }

  function drawSnake(snake: SnakeState) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const total = snake.body.length;
    snake.body.forEach((segment, index) => {
      const t = index / Math.max(1, total - 1);
      const x = segment.x * CELL + 2;
      const y = segment.y * CELL + 2;
      const size = CELL - 4;
      ctx.save();
      ctx.globalAlpha = snake.alive ? 0.98 - t * 0.35 : 0.35;
      if (index === 0) {
        ctx.shadowColor = snake.glow;
        ctx.shadowBlur = 16;
      }
      fillRound(ctx, x, y, size, size, index === 0 ? 9 : 6, snake.color);
      ctx.restore();
      if (index === 0) {
        ctx.fillStyle = '#0b1020';
        const cx = x + size / 2;
        const cy = y + size / 2;
        const dx = snake.dir.x * 5;
        const dy = snake.dir.y * 5;
        if (snake.dir.x !== 0) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy - 5, 2.4, 0, Math.PI * 2);
          ctx.arc(cx + dx, cy + 5, 2.4, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(cx - 5, cy + dy, 2.4, 0, Math.PI * 2);
          ctx.arc(cx + 5, cy + dy, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(76, 29, 149, 0.3)');
    drawGrid(ctx, W, H, CELL, 'rgba(255,255,255,0.035)');

    const fx = food.current.x * CELL + CELL / 2;
    const fy = food.current.y * CELL + CELL / 2;
    const pulse = 1 + Math.sin(performance.now() / 220) * 0.12;
    glowCircle(ctx, fx, fy, 9 * pulse, '#facc15', 22);
    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(fx, fy, 4.5, 0, Math.PI * 2);
    ctx.fill();

    drawSnake(p1.current);
    drawSnake(p2.current);

    drawText(ctx, `P1 ${p1.current.eaten}`, 14, 24, 16, 'rgba(74, 222, 128, 0.95)', 'left', '800');
    drawText(ctx, `P2 ${p2.current.eaten}`, W - 14, 24, 16, 'rgba(244, 114, 182, 0.95)', 'right', '800');

    if (!p1.current.alive || !p2.current.alive) {
      drawText(ctx, 'Runde beendet', W / 2, H / 2 + 6, 22, '#e9d5ff', 'center', '800');
    }
  }

  function finishRound() {
    if (over.current) return;
    over.current = true;
    const a = p1.current;
    const b = p2.current;
    let label: string;
    if (a.alive && !b.alive) label = `Spieler 1 gewinnt ${a.eaten}:${b.eaten}`;
    else if (b.alive && !a.alive) label = `Spieler 2 gewinnt ${b.eaten}:${a.eaten}`;
    else label = `Unentschieden ${a.eaten}:${b.eaten}`;
    if (a.alive !== b.alive) sfx.win();
    else sfx.lose();
    session.setScore(Math.max(a.eaten, b.eaten) * 10);
    session.finish(Math.max(a.eaten, b.eaten) * 10, label);
  }

  function moveSnake(snake: SnakeState, other: SnakeState): 'ok' | 'dead' | 'ate' {
    const nextDirection = snake.queue.shift();
    if (nextDirection) snake.dir = nextDirection;
    const head = snake.body[0];
    const nx = head.x + snake.dir.x;
    const ny = head.y + snake.dir.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return 'dead';
    if (other.body[0].x === nx && other.body[0].y === ny) return 'dead';
    if (other.body.some((segment) => segment.x === nx && segment.y === ny)) return 'dead';

    const eats = food.current.x === nx && food.current.y === ny;
    const limit = eats ? snake.body.length : snake.body.length - 1;
    for (let i = 0; i < limit; i += 1) {
      if (snake.body[i].x === nx && snake.body[i].y === ny) return 'dead';
    }

    snake.body = [{ x: nx, y: ny }, ...snake.body];
    if (eats) {
      snake.eaten += 1;
      food.current = spawnFood(p1.current.body, p2.current.body);
      return 'ate';
    }
    snake.body.pop();
    return 'ok';
  }

  function tick() {
    if (over.current) return;
    tickCount.current += 1;

    const aResult = moveSnake(p1.current, p2.current);
    const bResult = moveSnake(p2.current, p1.current);

    if (aResult === 'dead') p1.current.alive = false;
    if (bResult === 'dead') p2.current.alive = false;
    if (aResult === 'ate' || bResult === 'ate') {
      sfx.point();
      session.setScore(Math.max(p1.current.eaten, p2.current.eaten) * 10);
    } else if (aResult === 'dead' || bResult === 'dead') {
      sfx.hit();
    }
    if (!p1.current.alive || !p2.current.alive) finishRound();
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'w', 'a', 's', 'd'],
    down: (key) => {
      if (key === 'w' || key === 'W') turn(p1.current, { x: 0, y: -1 });
      else if (key === 's' || key === 'S') turn(p1.current, { x: 0, y: 1 });
      else if (key === 'a' || key === 'A') turn(p1.current, { x: -1, y: 0 });
      else if (key === 'd' || key === 'D') turn(p1.current, { x: 1, y: 0 });
      else if (key === 'ArrowUp') turn(p2.current, { x: 0, y: -1 });
      else if (key === 'ArrowDown') turn(p2.current, { x: 0, y: 1 });
      else if (key === 'ArrowLeft') turn(p2.current, { x: -1, y: 0 });
      else if (key === 'ArrowRight') turn(p2.current, { x: 1, y: 0 });
    },
  });

  useRafLoop((dt) => {
    acc.current += dt;
    if (acc.current >= STEP_MS) {
      acc.current = 0;
      tick();
    }
    draw();
  }, session.status === 'playing');

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#4ade80' }}>
            P1 <b>{p1.current.eaten}</b>
          </span>
          <span className="gstatus" style={{ color: '#f472b6' }}>
            P2 <b>{p2.current.eaten}</b>
          </span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <p className="game-hint">
          Spieler 1: WASD · Spieler 2: Pfeiltasten · Wer zuerst in Wand, sich selbst oder den Gegner läuft, verliert.
        </p>
      </div>
    </GameStage>
  );
}

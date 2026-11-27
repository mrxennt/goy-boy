import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useRafLoop } from '../lib/hooks';
import { makeRng, type Rng } from '../lib/rng';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, glowCircle } from './lib/canvas';

/** Bubble shooter on a fixed grid: the board is discrete, so nothing reshapes. */

const W = 640;
const H = 640;
const R = 17;
const STEP_X = R * 2;
const ROW_H = Math.round(R * Math.sqrt(3));
const COLS = 18;
const ROWS = 15;
const TOP = 34;
const LEFT = (W - COLS * STEP_X) / 2 + STEP_X / 2;
const SHOOTER = { x: W / 2, y: H - 40 };
const SPEED = 560;

const COLORS = ['#f472b6', '#38bdf8', '#facc15', '#4ade80', '#a78bfa', '#fb923c'];

type Bubble = { color: number; x: number; y: number } | null;

function cellX(row: number, col: number) {
  const offset = row % 2 === 1 ? STEP_X / 2 : 0;
  return LEFT + col * STEP_X + offset;
}
function cellY(row: number) {
  return TOP + row * ROW_H;
}
function rowCols(row: number) {
  return row % 2 === 1 ? COLS - 1 : COLS;
}

function neighbours(row: number, col: number): [number, number][] {
  const odd = row % 2 === 1;
  const candidates: [number, number][] = odd
    ? [[row, col - 1], [row, col + 1], [row - 1, col], [row - 1, col + 1], [row + 1, col], [row + 1, col + 1]]
    : [[row, col - 1], [row, col + 1], [row - 1, col - 1], [row - 1, col], [row + 1, col - 1], [row + 1, col]];
  return candidates.filter(([r, c]) => r >= 0 && r < ROWS && c >= 0 && c < rowCols(r));
}

function emptyBoard(): Bubble[][] {
  return Array.from({ length: ROWS }, (_, row) => Array.from({ length: rowCols(row) }, () => null));
}

function randomRow(rng: Rng, palette: number[]): Bubble[] {
  return Array.from({ length: COLS }, () => ({ color: palette[Math.floor(rng() * palette.length)], x: 0, y: 0 }));
}

export default function Bubble({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const board = useRef<Bubble[][]>(emptyBoard());
  const shot = useRef<{ x: number; y: number; vx: number; vy: number; color: number } | null>(null);
  const next = useRef(0);
  const current = useRef(0);
  const aim = useRef(Math.PI / 2);
  const over = useRef(false);
  const shots = useRef(0);
  const [ui, setUi] = useState({ next: 0, current: 0, message: 'Zielen mit der Maus oder den Pfeiltasten, schießen mit Klick/Enter.' });
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const statusRef = useRef(session.status);
  statusRef.current = session.status;

  const palette = useRef<number[]>([0, 1, 2, 3, 4]);

  function reset() {
    const rng = session.daily ? makeRng(session.daily.seed) : Math.random;
    const grid = emptyBoard();
    for (let row = 0; row < 4; row += 1) {
      const line = randomRow(rng, palette.current);
      line.forEach((bubble, col) => (grid[row][col] = bubble));
    }
    board.current = grid;
    shot.current = null;
    current.current = Math.floor(rng() * palette.current.length);
    next.current = Math.floor(rng() * palette.current.length);
    over.current = false;
    shots.current = 0;
    setUi({ next: next.current, current: current.current, message: 'Zielen und schießen – drei gleiche Farben platzen.' });
    session.setScore(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, session.daily?.seed]);

  function lowestFilledRow() {
    let lowest = -1;
    board.current.forEach((line, row) => line.forEach((bubble) => {
      if (bubble && row > lowest) lowest = row;
    }));
    return lowest;
  }

  function addBubble(row: number, col: number, color: number) {
    const grid = board.current;
    if (!grid[row] || col >= rowCols(row)) return;
    grid[row][col] = { color, x: cellX(row, col), y: cellY(row) };
    const cluster = sameCluster(row, col);
    if (cluster.length >= 3) {
      cluster.forEach(([r, c]) => (grid[r][c] = null));
      shots.current += cluster.length;
      sfx.point();
      // drop bubbles that no longer hang on the ceiling
      const floating = floatingCells();
      floating.forEach(([r, c]) => (grid[r][c] = null));
      session.setScore(shots.current + floating.length * 2);
      setUi((value) => ({ ...value, message: `${cluster.length} geplatzt${floating.length ? `, ${floating.length} fallen gelassen` : ''}.` }));
    } else {
      sfx.click();
      setUi((value) => ({ ...value, message: 'Klebt an – weiter geht\'s.' }));
    }
    spawn();
    checkEnd();
  }

  function spawn() {
    current.current = next.current;
    next.current = Math.floor(Math.random() * palette.current.length);
    setUi((value) => ({ ...value, current: current.current, next: next.current }));
  }

  function sameCluster(row: number, col: number): [number, number][] {
    const grid = board.current;
    const start = grid[row]?.[col];
    if (!start) return [];
    const seen = new Set<string>([`${row},${col}`]);
    const stack: [number, number][] = [[row, col]];
    const out: [number, number][] = [];
    while (stack.length) {
      const [r, c] = stack.pop()!;
      out.push([r, c]);
      neighbours(r, c).forEach(([nr, nc]) => {
        const bubble = grid[nr]?.[nc];
        if (!bubble || bubble.color !== start.color) return;
        const key = `${nr},${nc}`;
        if (seen.has(key)) return;
        seen.add(key);
        stack.push([nr, nc]);
      });
    }
    return out;
  }

  function floatingCells(): [number, number][] {
    const grid = board.current;
    const anchored = new Set<string>();
    const stack: [number, number][] = [];
    grid[0].forEach((bubble, col) => {
      if (bubble) {
        anchored.add(`0,${col}`);
        stack.push([0, col]);
      }
    });
    while (stack.length) {
      const [r, c] = stack.pop()!;
      neighbours(r, c).forEach(([nr, nc]) => {
        if (!grid[nr]?.[nc] || anchored.has(`${nr},${nc}`)) return;
        anchored.add(`${nr},${nc}`);
        stack.push([nr, nc]);
      });
    }
    const floating: [number, number][] = [];
    grid.forEach((line, row) => line.forEach((bubble, col) => {
      if (bubble && !anchored.has(`${row},${col}`)) floating.push([row, col]);
    }));
    return floating;
  }

  function checkEnd() {
    const filled = board.current.flat().filter(Boolean).length;
    if (!filled) {
      over.current = true;
      sfx.win();
      setUi((value) => ({ ...value, message: 'Brett leer – perfekt!' }));
      window.setTimeout(() => finishRef.current(2000, 'Brett leer geräumt'), 400);
      return;
    }
    if (lowestFilledRow() >= ROWS - 4) {
      over.current = true;
      sfx.lose();
      setUi((value) => ({ ...value, message: 'Die Blasen sind unten angekommen.' }));
      window.setTimeout(() => finishRef.current(shots.current, 'Die Blasen erreichen die Linie'), 400);
    }
  }

  function fire() {
    if (shot.current || over.current || statusRef.current !== 'playing') return;
    const angle = aim.current;
    shot.current = {
      x: SHOOTER.x,
      y: SHOOTER.y,
      vx: Math.cos(angle) * SPEED,
      vy: Math.sin(angle) * SPEED,
      color: current.current,
    };
    sfx.pick();
  }

  function step(dtMs: number) {
    const ball = shot.current;
    if (!ball) return;
    const dt = Math.min(34, dtMs) / 1000;
    const steps = 3;
    for (let i = 0; i < steps; i += 1) {
      ball.x += (ball.vx * dt) / steps;
      ball.y += (ball.vy * dt) / steps;
      if (ball.x - R < 10) {
        ball.x = 10 + R;
        ball.vx = Math.abs(ball.vx);
      }
      if (ball.x + R > W - 10) {
        ball.x = W - 10 - R;
        ball.vx = -Math.abs(ball.vx);
      }
      if (ball.y - R < TOP - ROW_H / 2) {
        land(ball);
        return;
      }
      const hit = board.current.some((line, row) =>
        line.some((bubble, col) => bubble && Math.hypot(cellX(row, col) - ball.x, cellY(row) - ball.y) < R * 1.8),
      );
      if (hit) {
        land(ball);
        return;
      }
    }
  }

  function land(ball: { x: number; y: number; color: number }) {
    // snap to the nearest free cell that touches the impact point
    let bestRow = -1;
    let bestCol = -1;
    let bestDist = Infinity;
    board.current.forEach((line, row) => line.forEach((_, col) => {
      if (board.current[row][col]) return;
      const dist = Math.hypot(cellX(row, col) - ball.x, cellY(row) - ball.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestRow = row;
        bestCol = col;
      }
    }));
    shot.current = null;
    const spot = bestRow >= 0 ? { row: bestRow, col: bestCol, dist: bestDist } : null;
    if (!spot || spot.dist > R * 2.4) {
      setUi((value) => ({ ...value, message: 'Daneben – nächste Blase.' }));
      spawn();
      return;
    }
    addBubble(spot.row, spot.col, ball.color);
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(30, 58, 138, 0.35)', '#060912');

    // fixed ceiling and firing line
    ctx.fillStyle = 'rgba(148, 163, 184, 0.18)';
    ctx.fillRect(0, TOP - ROW_H / 2 - 2, W, 2);
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(0, cellY(ROWS - 4));
    ctx.lineTo(W, cellY(ROWS - 4));
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.35)';
    ctx.stroke();
    ctx.setLineDash([]);

    board.current.forEach((line, row) =>
      line.forEach((bubble, col) => {
        if (!bubble) return;
        drawBubble(ctx, cellX(row, col), cellY(row), bubble.color);
      }),
    );

    // aim guide
    if (!shot.current && !over.current) {
      ctx.save();
      ctx.strokeStyle = 'rgba(226, 232, 240, 0.35)';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.moveTo(SHOOTER.x, SHOOTER.y);
      ctx.lineTo(SHOOTER.x + Math.cos(aim.current) * 230, SHOOTER.y + Math.sin(aim.current) * 230);
      ctx.stroke();
      ctx.restore();
    }

    if (shot.current) drawBubble(ctx, shot.current.x, shot.current.y, shot.current.color);
    drawBubble(ctx, SHOOTER.x - 40, SHOOTER.y, current.current);

    drawText(ctx, 'NÄCHSTE', W - 40, SHOOTER.y - 22, 9, 'rgba(148, 163, 184, 0.8)', 'right', '800');
    drawBubble(ctx, W - 40, SHOOTER.y + 8, next.current);
    drawText(ctx, `${shots.current}`, 26, SHOOTER.y, 18, '#e2e8f0', 'left', '900');
  }

  function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, color: number) {
    const hex = COLORS[color] ?? '#94a3b8';
    glowCircle(ctx, x, y, R - 1, hex, 8);
    const grad = ctx.createRadialGradient(x - 5, y - 6, 2, x, y, R);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.45, hex);
    grad.addColorStop(1, 'rgba(15, 23, 42, 0.6)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(x, y, R - 1, 0, Math.PI * 2);
    ctx.fill();
  }

  useRafLoop((dt) => {
    if (statusRef.current === 'playing' && !over.current) step(dt);
    draw();
  }, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function pointAt(clientX: number, clientY: number) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    const angle = Math.atan2(y - SHOOTER.y, x - SHOOTER.x);
    aim.current = Math.max(Math.PI * 0.12, Math.min(Math.PI * 0.88, angle));
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (statusRef.current !== 'playing') return;
      if (event.key === 'ArrowLeft') {
        aim.current = Math.max(Math.PI * 0.12, aim.current - 0.09);
        event.preventDefault();
      } else if (event.key === 'ArrowRight') {
        aim.current = Math.min(Math.PI * 0.88, aim.current + 0.09);
        event.preventDefault();
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        fire();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Blasen <b>{shots.current}</b></span>
          <span className="gstatus">Reihe <b>{Math.max(0, lowestFilledRow() + 1)}</b>/{ROWS - 3}</span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas bubble-canvas"
          style={{ maxWidth: Math.min(W, 560) }}
          onPointerMove={(event) => pointAt(event.clientX, event.clientY)}
          onPointerDown={(event) => {
            pointAt(event.clientX, event.clientY);
            fire();
          }}
        />
        <p className="game-hint">{ui.message}</p>
      </div>
    </GameStage>
  );
}



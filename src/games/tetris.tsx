import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound } from './lib/canvas';

const COLS = 10;
const ROWS = 20;
const CELL = 26;
const BOARD_X = 14;
const BOARD_Y = 12;
const W = 430;
const H = BOARD_Y * 2 + ROWS * CELL;
const SIDE_X = BOARD_X + COLS * CELL + 24;

type Piece = { shape: number[][]; color: string; x: number; y: number };

const SHAPES: { shape: number[][]; color: string }[] = [
  { shape: [[1, 1, 1, 1]], color: '#22d3ee' },
  {
    shape: [
      [1, 1],
      [1, 1],
    ],
    color: '#facc15',
  },
  {
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
    color: '#a855f7',
  },
  {
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
    color: '#4ade80',
  },
  {
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
    color: '#f87171',
  },
  {
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
    color: '#60a5fa',
  },
  {
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
    color: '#fb923c',
  },
];

const emptyBoard = (): string[][] => Array.from({ length: ROWS }, () => Array<string>(COLS).fill(''));

function makePiece(): Piece {
  const template = SHAPES[Math.floor(Math.random() * SHAPES.length)];
  return {
    shape: template.shape.map((row) => [...row]),
    color: template.color,
    x: Math.floor((COLS - template.shape[0].length) / 2),
    y: 0,
  };
}

export default function Tetris({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const board = useRef<string[][]>(emptyBoard());
  const piece = useRef<Piece>(makePiece());
  const next = useRef<Piece>(makePiece());
  const dropTimer = useRef(0);
  const scored = useRef(0);
  const lines = useRef(0);
  const [level, setLevel] = useState(1);
  const [lineCount, setLineCount] = useState(0);
  const dead = useRef(false);

  function reset() {
    board.current = emptyBoard();
    piece.current = makePiece();
    next.current = makePiece();
    dropTimer.current = 0;
    scored.current = 0;
    lines.current = 0;
    dead.current = false;
    setLevel(1);
    setLineCount(0);
    session.setScore(0);
  }

  function collides(shape: number[][], px: number, py: number) {
    for (let r = 0; r < shape.length; r += 1) {
      for (let c = 0; c < shape[r].length; c += 1) {
        if (!shape[r][c]) continue;
        const x = px + c;
        const y = py + r;
        if (x < 0 || x >= COLS || y >= ROWS) return true;
        if (y >= 0 && board.current[y][x]) return true;
      }
    }
    return false;
  }

  function spawn() {
    piece.current = next.current;
    next.current = makePiece();
    if (collides(piece.current.shape, piece.current.x, piece.current.y)) {
      dead.current = true;
      sfx.hit();
      session.finish(scored.current, 'Game Over');
    }
  }

  function lockPiece() {
    const p = piece.current;
    p.shape.forEach((row, r) => {
      row.forEach((value, c) => {
        if (!value) return;
        const y = p.y + r;
        const x = p.x + c;
        if (y >= 0 && y < ROWS && x >= 0 && x < COLS) board.current[y][x] = p.color;
      });
    });

    let cleared = 0;
    board.current = board.current.filter((row) => {
      if (row.every((cell) => cell)) {
        cleared += 1;
        return false;
      }
      return true;
    });
    while (board.current.length < ROWS) board.current.unshift(Array<string>(COLS).fill(''));

    if (cleared > 0) {
      const points = [0, 100, 300, 500, 800][cleared] ?? 800;
      scored.current += points * level;
      lines.current += cleared;
      setLineCount(lines.current);
      setLevel(1 + Math.floor(lines.current / 10));
      session.setScore(scored.current);
      sfx.win();
    } else {
      sfx.click();
    }
    spawn();
  }

  function moveHorizontal(direction: number) {
    const p = piece.current;
    if (session.status !== 'playing' || dead.current) return;
    if (!collides(p.shape, p.x + direction, p.y)) p.x += direction;
  }

  function rotate() {
    const p = piece.current;
    if (session.status !== 'playing' || dead.current) return;
    const rotated = p.shape[0].map((_, index) => p.shape.map((row) => row[index]).reverse());
    for (const offset of [0, -1, 1, -2, 2]) {
      if (!collides(rotated, p.x + offset, p.y)) {
        p.shape = rotated;
        p.x += offset;
        sfx.click();
        return;
      }
    }
  }

  function softDrop() {
    const p = piece.current;
    if (session.status !== 'playing' || dead.current) return;
    if (!collides(p.shape, p.x, p.y + 1)) {
      p.y += 1;
      scored.current += 1;
      session.setScore(scored.current);
    } else {
      lockPiece();
    }
    dropTimer.current = 0;
  }

  function hardDrop() {
    const p = piece.current;
    if (session.status !== 'playing' || dead.current) return;
    let distance = 0;
    while (!collides(p.shape, p.x, p.y + 1)) {
      p.y += 1;
      distance += 1;
    }
    scored.current += distance * 2;
    session.setScore(scored.current);
    lockPiece();
    sfx.hit();
  }

  function update(dtMs: number) {
    if (dead.current) return;
    const interval = Math.max(90, 780 - (level - 1) * 62);
    dropTimer.current += dtMs;
    if (dropTimer.current >= interval) {
      dropTimer.current = 0;
      const p = piece.current;
      if (!collides(p.shape, p.x, p.y + 1)) p.y += 1;
      else lockPiece();
    }
  }

  function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = color;
    ctx.shadowBlur = 10;
    fillRound(ctx, x + 1, y + 1, size - 2, size - 2, 5, color);
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.fillRect(x + 4, y + 4, size - 8, 2);
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(76, 29, 149, 0.34)');

    fillRound(ctx, BOARD_X - 4, BOARD_Y - 4, COLS * CELL + 8, ROWS * CELL + 8, 10, 'rgba(9, 10, 18, 0.9)');
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c += 1) {
      ctx.beginPath();
      ctx.moveTo(BOARD_X + c * CELL, BOARD_Y);
      ctx.lineTo(BOARD_X + c * CELL, BOARD_Y + ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r += 1) {
      ctx.beginPath();
      ctx.moveTo(BOARD_X, BOARD_Y + r * CELL);
      ctx.lineTo(BOARD_X + COLS * CELL, BOARD_Y + r * CELL);
      ctx.stroke();
    }

    board.current.forEach((row, r) => {
      row.forEach((color, c) => {
        if (!color) return;
        drawCell(ctx, BOARD_X + c * CELL, BOARD_Y + r * CELL, CELL, color);
      });
    });

    const p = piece.current;
    let ghostY = p.y;
    while (!collides(p.shape, p.x, ghostY + 1)) ghostY += 1;
    if (ghostY !== p.y) {
      p.shape.forEach((row, r) => {
        row.forEach((value, c) => {
          if (!value) return;
          fillRound(ctx, BOARD_X + (p.x + c) * CELL + 2, BOARD_Y + (ghostY + r) * CELL + 2, CELL - 4, CELL - 4, 4, 'rgba(255,255,255,0.07)');
        });
      });
    }

    p.shape.forEach((row, r) => {
      row.forEach((value, c) => {
        if (!value) return;
        const y = p.y + r;
        if (y < 0) return;
        drawCell(ctx, BOARD_X + (p.x + c) * CELL, BOARD_Y + y * CELL, CELL, p.color);
      });
    });

    // side panel
    drawText(ctx, 'NEXT', SIDE_X, BOARD_Y + 14, 10, '#9aa0b5', 'left', '800');
    fillRound(ctx, SIDE_X - 4, BOARD_Y + 26, 112, 88, 8, 'rgba(255,255,255,0.04)');
    const nx = SIDE_X + 14;
    const ny = BOARD_Y + 46;
    next.current.shape.forEach((row, r) => {
      row.forEach((value, c) => {
        if (!value) return;
        fillRound(ctx, nx + c * 18, ny + r * 18, 16, 16, 3, next.current.color);
      });
    });

    drawText(ctx, 'LEVEL', SIDE_X, BOARD_Y + 146, 10, '#9aa0b5', 'left', '800');
    drawText(ctx, String(level), SIDE_X, BOARD_Y + 172, 26, '#c4b5fd', 'left', '800');
    drawText(ctx, 'LINES', SIDE_X, BOARD_Y + 214, 10, '#9aa0b5', 'left', '800');
    drawText(ctx, String(lines.current), SIDE_X, BOARD_Y + 240, 22, '#e9d5ff', 'left', '800');
    drawText(ctx, 'SCORE', SIDE_X, BOARD_Y + 282, 10, '#9aa0b5', 'left', '800');
    drawText(ctx, String(scored.current), SIDE_X, BOARD_Y + 308, 20, '#fbbf24', 'left', '800');

    drawText(ctx, '← →', SIDE_X, H - 78, 10, '#9aa0b5', 'left', '600');
    drawText(ctx, 'bewegen', SIDE_X, H - 64, 10, '#6b7391', 'left', '600');
    drawText(ctx, '↑', SIDE_X, H - 44, 10, '#9aa0b5', 'left', '600');
    drawText(ctx, 'drehen', SIDE_X + 16, H - 44, 10, '#6b7391', 'left', '600');
    drawText(ctx, '␣', SIDE_X, H - 24, 10, '#9aa0b5', 'left', '600');
    drawText(ctx, 'drop', SIDE_X + 16, H - 24, 10, '#6b7391', 'left', '600');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '],
    down: (key) => {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') moveHorizontal(-1);
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') moveHorizontal(1);
      else if (key === 'ArrowUp' || key === 'w' || key === 'W') rotate();
      else if (key === 'ArrowDown' || key === 's' || key === 'S') softDrop();
      else if (key === ' ') hardDrop();
    },
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage game={game} session={session} hud={<span className="gstatus">LV {level} · {lineCount} Reihen</span>}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="tetris-pad">
          <button type="button" className="touch-btn" onClick={() => moveHorizontal(-1)} aria-label="Links">
            ◀
          </button>
          <button type="button" className="touch-btn" onClick={rotate} aria-label="Drehen">
            ⟳
          </button>
          <button type="button" className="touch-btn" onClick={() => moveHorizontal(1)} aria-label="Rechts">
            ▶
          </button>
          <button type="button" className="touch-btn" onClick={softDrop} aria-label="Runter">
            ▼
          </button>
          <button type="button" className="touch-btn fire wide" onClick={hardDrop} aria-label="Sofort fallen">
            ⤓ Drop
          </button>
        </div>
        <p className="game-hint">← → bewegen · ↑ drehen · ↓ sanft fallen · Leertaste sofort fallen</p>
      </div>
    </GameStage>
  );
}

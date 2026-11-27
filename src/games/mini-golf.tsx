import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const FIELD = { x: 70, y: 66, w: 660, h: 392 };
const R = 9;

type Rect = { x: number; y: number; w: number; h: number };
type Hole = { tee: { x: number; y: number }; cup: { x: number; y: number }; walls: Rect[]; par: number };

const HOLES: Hole[] = [
  { tee: { x: 150, y: 430 }, cup: { x: 660, y: 110 }, par: 2, walls: [] },
  {
    tee: { x: 140, y: 430 },
    cup: { x: 670, y: 110 },
    par: 3,
    walls: [{ x: 300, y: 250, w: 28, h: 200 }],
  },
  {
    tee: { x: 130, y: 120 },
    cup: { x: 680, y: 430 },
    par: 3,
    walls: [
      { x: 260, y: 66, w: 30, h: 250 },
      { x: 260, y: 316, w: 260, h: 28 },
      { x: 520, y: 200, w: 30, h: 160 },
    ],
  },
  {
    tee: { x: 130, y: 430 },
    cup: { x: 690, y: 430 },
    par: 4,
    walls: [
      { x: 300, y: 150, w: 30, h: 220 },
      { x: 470, y: 250, w: 30, h: 208 },
      { x: 470, y: 250, w: 180, h: 28 },
    ],
  },
  {
    tee: { x: 150, y: 430 },
    cup: { x: 640, y: 150 },
    par: 4,
    walls: [
      { x: 320, y: 66, w: 26, h: 280 },
      { x: 320, y: 346, w: 240, h: 26 },
      { x: 534, y: 250, w: 26, h: 130 },
      { x: 560, y: 122, w: 90, h: 26 },
    ],
  },
];

export default function MiniGolf({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const ball = useRef({ x: HOLES[0].tee.x, y: HOLES[0].tee.y, vx: 0, vy: 0 });
  const holeIndex = useRef(0);
  const strokes = useRef(0);
  const totalStrokes = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const sunk = useRef(false);
  const sinkTimer = useRef(0);
  const [ui, setUi] = useState({ hole: 1, strokes: 0, total: 0, message: 'Ziehe vom Ball weg und lass los.' });
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const sync = (message?: string) => {
    setUi({
      hole: holeIndex.current + 1,
      strokes: strokes.current,
      total: totalStrokes.current,
      message: message ?? ui.message,
    });
  };

  function loadHole(index: number) {
    const hole = HOLES[index];
    ball.current = { x: hole.tee.x, y: hole.tee.y, vx: 0, vy: 0 };
    strokes.current = 0;
    sunk.current = false;
    sinkTimer.current = 0;
    setUi({
      hole: index + 1,
      strokes: 0,
      total: totalStrokes.current,
      message: `Bahn ${index + 1} · Par ${hole.par}`,
    });
  }

  function reset() {
    holeIndex.current = 0;
    totalStrokes.current = 0;
    loadHole(0);
    session.setScore(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function bounceOffRect(rect: Rect) {
    const b = ball.current;
    if (b.x + R <= rect.x || b.x - R >= rect.x + rect.w || b.y + R <= rect.y || b.y - R >= rect.y + rect.h) return;
    const left = b.x + R - rect.x;
    const right = rect.x + rect.w - (b.x - R);
    const top = b.y + R - rect.y;
    const bottom = rect.y + rect.h - (b.y - R);
    const min = Math.min(left, right, top, bottom);
    if (min === left) {
      b.x = rect.x - R;
      b.vx = -Math.abs(b.vx) * 0.78;
    } else if (min === right) {
      b.x = rect.x + rect.w + R;
      b.vx = Math.abs(b.vx) * 0.78;
    } else if (min === top) {
      b.y = rect.y - R;
      b.vy = -Math.abs(b.vy) * 0.78;
    } else {
      b.y = rect.y + rect.h + R;
      b.vy = Math.abs(b.vy) * 0.78;
    }
    sfx.click();
  }

  function update(dtMs: number) {
    const dt = Math.min(46, dtMs) / 1000;
    const b = ball.current;

    if (sunk.current) {
      sinkTimer.current += dtMs;
      if (sinkTimer.current > 900) {
        if (holeIndex.current >= HOLES.length - 1) {
          const score = Math.max(50, 900 - totalStrokes.current * 22);
          session.finish(score, `Runde beendet mit ${totalStrokes.current} Schlägen`);
          sunk.current = false;
        } else {
          holeIndex.current += 1;
          loadHole(holeIndex.current);
        }
      }
      return;
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    const damping = Math.pow(0.32, dt);
    b.vx *= damping;
    b.vy *= damping;
    if (Math.hypot(b.vx, b.vy) < 5) {
      b.vx = 0;
      b.vy = 0;
    }

    if (b.x - R < FIELD.x) {
      b.x = FIELD.x + R;
      b.vx = Math.abs(b.vx) * 0.8;
    }
    if (b.x + R > FIELD.x + FIELD.w) {
      b.x = FIELD.x + FIELD.w - R;
      b.vx = -Math.abs(b.vx) * 0.8;
    }
    if (b.y - R < FIELD.y) {
      b.y = FIELD.y + R;
      b.vy = Math.abs(b.vy) * 0.8;
    }
    if (b.y + R > FIELD.y + FIELD.h) {
      b.y = FIELD.y + FIELD.h - R;
      b.vy = -Math.abs(b.vy) * 0.8;
    }

    const hole = HOLES[holeIndex.current];
    for (const wall of hole.walls) bounceOffRect(wall);

    const distance = Math.hypot(b.x - hole.cup.x, b.y - hole.cup.y);
    if (distance < 16 && Math.hypot(b.vx, b.vy) < 430) {
      sunk.current = true;
      b.vx = 0;
      b.vy = 0;
      b.x = hole.cup.x;
      b.y = hole.cup.y;
      totalStrokes.current += strokes.current;
      session.setScore(Math.max(0, 900 - totalStrokes.current * 22));
      sfx.win();
      setUi({
        hole: holeIndex.current + 1,
        strokes: strokes.current,
        total: totalStrokes.current,
        message: `Eingelocht mit ${strokes.current} Schlägen!`,
      });
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const hole = HOLES[holeIndex.current];
    const b = ball.current;
    drawBackdrop(ctx, W, H, 'rgba(6, 78, 59, 0.32)', '#04120f');

    // fairway
    const grass = ctx.createLinearGradient(FIELD.x, FIELD.y, FIELD.x + FIELD.w, FIELD.y + FIELD.h);
    grass.addColorStop(0, '#0f3d2e');
    grass.addColorStop(1, '#0a2a22');
    fillRound(ctx, FIELD.x, FIELD.y, FIELD.w, FIELD.h, 46, grass);
    ctx.save();
    ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
    ctx.lineWidth = 3;
    ctx.shadowColor = 'rgba(74, 222, 128, 0.4)';
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.roundRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h, 46);
    ctx.stroke();
    ctx.restore();

    for (const wall of hole.walls) {
      fillRound(ctx, wall.x, wall.y, wall.w, wall.h, 7, '#1f2937');
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(wall.x, wall.y, wall.w, wall.h, 7);
      ctx.stroke();
    }

    // cup
    ctx.save();
    ctx.shadowColor = '#0f172a';
    ctx.shadowBlur = 16;
    ctx.fillStyle = '#020617';
    ctx.beginPath();
    ctx.arc(hole.cup.x, hole.cup.y, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hole.cup.x, hole.cup.y, 17, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(hole.cup.x, hole.cup.y);
    ctx.lineTo(hole.cup.x, hole.cup.y - 52);
    ctx.stroke();
    ctx.fillStyle = '#f87171';
    ctx.beginPath();
    ctx.moveTo(hole.cup.x, hole.cup.y - 52);
    ctx.lineTo(hole.cup.x + 30, hole.cup.y - 44);
    ctx.lineTo(hole.cup.x, hole.cup.y - 34);
    ctx.closePath();
    ctx.fill();

    // aim
    if (drag.current && pointer.current) {
      const dx = b.x - pointer.current.x;
      const dy = b.y - pointer.current.y;
      const power = Math.min(1, Math.hypot(dx, dy) / 180);
      const length = 30 + power * 90;
      const angle = Math.atan2(dy, dx);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.85)';
      ctx.lineWidth = 3;
      ctx.setLineDash([7, 6]);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x + Math.cos(angle) * length, b.y + Math.sin(angle) * length);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = power > 0.75 ? '#f87171' : power > 0.4 ? '#fbbf24' : '#4ade80';
      fillRound(ctx, FIELD.x + 20, FIELD.y + FIELD.h - 26, 160 * power, 8, 4, ctx.fillStyle as string);
      drawText(ctx, `${Math.round(power * 100)}%`, FIELD.x + 190, FIELD.y + FIELD.h - 22, 11, '#cbd5e1', 'left', '700');
    }

    // ball
    glowCircle(ctx, b.x, b.y + 3, R + 2, 'rgba(0,0,0,0.45)', 10);
    const ballGrad = ctx.createRadialGradient(b.x - 3, b.y - 4, 2, b.x, b.y, R + 2);
    ballGrad.addColorStop(0, '#ffffff');
    ballGrad.addColorStop(1, '#cbd5e1');
    ctx.fillStyle = ballGrad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, `Bahn ${holeIndex.current + 1}/${HOLES.length}`, 22, 26, 14, '#d1fae5', 'left', '800');
    drawText(ctx, `Schläge ${strokes.current} · Par ${hole.par}`, 22, 46, 11, '#9aa0b5', 'left', '700');
    drawText(ctx, `Gesamt ${totalStrokes.current}`, W - 22, 26, 13, '#c4b5fd', 'right', '800');
  }

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  const toLogical = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: ((clientX - rect.left) / rect.width) * W, y: ((clientY - rect.top) / rect.height) * H };
  };

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Bahn <b>{ui.hole}</b>/{HOLES.length}</span>
          <span className="gstatus">Schläge <b>{ui.strokes}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onPointerDown={(event) => {
            if (sunk.current || session.status !== 'playing') return;
            if (ball.current.vx !== 0 || ball.current.vy !== 0) return;
            drag.current = toLogical(event.clientX, event.clientY);
            pointer.current = drag.current;
          }}
          onPointerMove={(event) => {
            if (!drag.current) return;
            pointer.current = toLogical(event.clientX, event.clientY);
          }}
          onPointerUp={(event) => {
            if (!drag.current) return;
            const position = toLogical(event.clientX, event.clientY);
            const dx = ball.current.x - position.x;
            const dy = ball.current.y - position.y;
            const power = Math.min(1, Math.hypot(dx, dy) / 180);
            if (power > 0.06) {
              const angle = Math.atan2(dy, dx);
              ball.current.vx = Math.cos(angle) * power * 780;
              ball.current.vy = Math.sin(angle) * power * 780;
              strokes.current += 1;
              sfx.pick();
              sync(`Bahn ${holeIndex.current + 1} · ${strokes.current} Schläge`);
            }
            drag.current = null;
            pointer.current = null;
          }}
          onPointerLeave={() => {
            drag.current = null;
            pointer.current = null;
          }}
        />
        <p className="game-hint">{ui.message} In den fünf Bahnen zählt jeder Schlag.</p>
      </div>
    </GameStage>
  );
}

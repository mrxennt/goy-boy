import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound } from './lib/canvas';

const W = 520;
const H = 620;
const BLOCK_H = 30;
const MAX_BLOCKS = 16;
const BASE_W = 260;
const START_Y = H - 90;

type Block = { x: number; w: number; y: number };

export default function Stacker({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const [ui, setUi] = useState({ height: 0, perfect: 0, message: 'Tippen oder Leertaste setzt den Stein ab.' });

  const stack = useRef<Block[]>([]);
  const moving = useRef({ x: W / 2 - BASE_W / 2, w: BASE_W, dir: 1, speed: 210 });
  const time = useRef(0);
  const perfectRun = useRef(0);
  const over = useRef(false);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const statusRef = useRef(session.status);
  statusRef.current = session.status;

  function reset() {
    stack.current = [{ x: W / 2 - BASE_W / 2, w: BASE_W, y: START_Y }];
    moving.current = { x: -60, w: BASE_W, dir: 1, speed: 210 };
    time.current = 0;
    perfectRun.current = 0;
    over.current = false;
    setUi({ height: 0, perfect: 0, message: 'Tippen oder Leertaste setzt den Stein ab.' });
    session.setScore(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function drop() {
    if (over.current || statusRef.current !== 'playing') return;
    const top = stack.current[stack.current.length - 1];
    const block = moving.current;
    const left = Math.max(top.x, block.x);
    const right = Math.min(top.x + top.w, block.x + block.w);
    const width = right - left;

    if (width <= 6) {
      over.current = true;
      const height = stack.current.length - 1;
      sfx.lose();
      const label = height === 0 ? 'Der Turm steht nicht mal aus einem Stein' : `Turmhöhe ${height}`;
      setUi((value) => ({ ...value, message: 'Verpasst – der Turm fällt.' }));
      window.setTimeout(() => finishRef.current(stack.current.length * 30, label), 420);
      return;
    }

    const perfect = Math.abs(left - top.x) < 5 && Math.abs(width - top.w) < 5;
    if (perfect) {
      perfectRun.current += 1;
      sfx.point();
    } else {
      perfectRun.current = 0;
      sfx.hit();
    }

    const y = top.y - BLOCK_H;
    stack.current.push({ x: left, w: perfect ? top.w : width, y });
    const height = stack.current.length - 1;
    session.setScore(height * 10 + perfectRun.current * 5);
    setUi({
      height,
      perfect: perfectRun.current,
      message: perfect ? (perfectRun.current > 1 ? `Perfekt! ${perfectRun.current}× in Folge` : 'Perfekt!') : `Getroffen · ${Math.round(width)} px breit`,
    });

    // camera: keep the whole stack visible in a fixed frame
    const shift = stack.current.length >= MAX_BLOCKS - 1 ? BLOCK_H : 0;
    if (shift) {
      stack.current = stack.current.map((block) => ({ ...block, y: block.y + BLOCK_H }));
    }
    const last = stack.current[stack.current.length - 1];
    moving.current = {
      x: last.x + 20,
      w: last.w,
      dir: 1,
      speed: Math.min(560, 210 + stack.current.length * 24),
    };
    moving.current.x = Math.max(-last.w + 40, Math.min(W - 40, moving.current.x));
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' && event.key !== ' ') return;
      if (statusRef.current !== 'playing') return;
      event.preventDefault();
      drop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(76, 29, 149, 0.35)', '#07060f');

    // tower
    stack.current.forEach((block, index) => {
      const hue = 265 - Math.min(140, index * 7);
      const grad = ctx.createLinearGradient(block.x, block.y, block.x, block.y + BLOCK_H);
      grad.addColorStop(0, `hsl(${hue} 90% 68%)`);
      grad.addColorStop(1, `hsl(${hue} 80% 46%)`);
      fillRound(ctx, block.x, block.y, block.w, BLOCK_H - 4, 5, grad);
    });

    // moving block
    if (!over.current) {
      const block = moving.current;
      const y = stack.current[stack.current.length - 1].y - BLOCK_H;
      const grad = ctx.createLinearGradient(block.x, y, block.x, y + BLOCK_H);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(1, '#f59e0b');
      ctx.save();
      ctx.shadowColor = 'rgba(253, 224, 71, 0.8)';
      ctx.shadowBlur = 16;
      fillRound(ctx, block.x, y, block.w, BLOCK_H - 4, 5, grad);
      ctx.restore();
    }

    drawText(ctx, `${stack.current.length - 1}`, W / 2, 54, 44, '#ffffff', 'center', '900');
    drawText(ctx, 'HÖHE', W / 2, 92, 11, 'rgba(196, 181, 253, 0.8)', 'center', '800');
    drawText(ctx, `Tempo ${Math.round(moving.current.speed)}`, 18, 26, 11, 'rgba(148, 163, 184, 0.8)', 'left', '700');
    if (ui.perfect > 1) drawText(ctx, `${ui.perfect}× perfekt`, W - 18, 26, 12, '#a5f3fc', 'right', '800');
  }

  useRafLoop((dt) => {
    if (statusRef.current !== 'playing' || over.current) {
      draw();
      return;
    }
    time.current += dt;
    const block = moving.current;
    block.x += block.dir * block.speed * (Math.min(34, dt) / 1000);
    if (block.x < -60) {
      block.x = -60;
      block.dir = 1;
    }
    if (block.x + block.w > W + 60) {
      block.x = W + 60 - block.w;
      block.dir = -1;
    }
    draw();
  }, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Höhe <b>{ui.height}</b></span>
          <span className="gstatus">Perfekt <b>{ui.perfect}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas stacker-canvas"
          style={{ maxWidth: W }}
          onPointerDown={(event) => {
            event.preventDefault();
            drop();
          }}
        />
        <p className="game-hint">{ui.message}</p>
      </div>
    </GameStage>
  );
}

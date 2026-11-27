import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawGrid, drawText, fillRound } from './lib/canvas';

/** Split-screen race: two lanes share one fixed canvas, both sides never reshape. */

const W = 900;
const H = 480;
const LANE_W = W / 2;
const CAR_W = 30;
const CAR_H = 46;
const ROAD_TOP = 20;
const ROAD_BOTTOM = H - 20;
const FINISH_LINES = 4000;

type Car = { x: number; y: number; speed: number; dist: number; color: string };

export default function SplitRace({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const p1 = useRef<Car>({ x: 0, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#22d3ee' });
  const p2 = useRef<Car>({ x: 0, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#f472b6' });
  const offset = useRef(0);
  const obstacles = useRef<{ lane: 0 | 1; x: number; y: number; w: number }[]>([]);
  const acc = useRef(0);
  const done = useRef<string | null>(null);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const statusRef = useRef(session.status);
  statusRef.current = session.status;

  function reset() {
    p1.current = { x: LANE_W / 2 - CAR_W / 2 - 40, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#22d3ee' };
    p2.current = { x: LANE_W + LANE_W / 2 - CAR_W / 2 + 40, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#f472b6' };
    offset.current = 0;
    obstacles.current = [];
    for (let y = -200; y > -FINISH_LINES; y -= 260) {
      obstacles.current.push({ lane: (Math.random() < 0.5 ? 0 : 1) as 0 | 1, x: 0, y, w: 46 });
    }
    done.current = null;
    session.setScore(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function laneBounds(lane: 0 | 1) {
    return { left: lane * LANE_W + 16, right: (lane + 1) * LANE_W - 16 - CAR_W };
  }

  function nudge(car: Car, delta: number) {
    car.x += delta;
  }

  function step(dtMs: number) {
    if (done.current) return;
    const dt = Math.min(34, dtMs) / 1000;
    const a = p1.current;
    const b = p2.current;
    // automatic speed-up, steering is the game
    a.speed = Math.min(460, a.speed + 120 * dt);
    b.speed = Math.min(460, b.speed + 120 * dt);
    a.y -= a.speed * dt * 0.55;
    b.y -= b.speed * dt * 0.55;
    offset.current += a.speed * dt * 0.55;
    a.dist += a.speed * dt;
    b.dist += b.speed * dt;

    obstacles.current.forEach((obstacle) => {
      const car = obstacle.lane === 0 ? a : b;
      const carLeft = car.x;
      const carRight = car.x + CAR_W;
      const obstacleLeft = obstacle.lane * LANE_W + LANE_W / 2 - obstacle.w / 2;
      if (
        car.y < obstacle.y + 40 &&
        car.y + CAR_H > obstacle.y &&
        carRight > obstacleLeft &&
        carLeft < obstacleLeft + obstacle.w
      ) {
        car.speed = 120;
        sfx.hit();
      }
    });

    // each car is bound to its own lane column; its coordinate is global
    const clampLane = (car: Car, lane: 0 | 1) => {
      const { left, right } = laneBounds(lane);
      car.x = Math.max(left, Math.min(right, car.x));
    };
    clampLane(a, 0);
    clampLane(b, 1);

    if (a.dist >= FINISH_LINES) {
      done.current = 'Spieler 1 gewinnt das Rennen!';
      sfx.win();
      finishRef.current(1000, done.current);
    } else if (b.dist >= FINISH_LINES) {
      done.current = 'Spieler 2 gewinnt das Rennen!';
      sfx.win();
      finishRef.current(1000, done.current);
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(30, 27, 75, 0.6)', '#05060c');
    drawGrid(ctx, W, LANE_W * 0 + H, 40, 'rgba(255,255,255,0.02)');

    [0, 1].forEach((lane) => {
      const left = lane * LANE_W;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(left + 8, 0, LANE_W - 16, H);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      for (let y = -1; y < H; y += 48) {
        const yy = (y + (offset.current % 48)) % (H + 48);
        ctx.fillRect(left + LANE_W / 2 - 2, yy, 4, 26);
      }
      ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
      ctx.fillRect(left + 8, 0, 3, H);
      ctx.fillRect(left + LANE_W - 11, 0, 3, H);
    });

    obstacles.current.forEach((obstacle) => {
      const screenY = ROAD_BOTTOM - CAR_H - 10 + obstacle.y + offset.current;
      if (screenY < -50 || screenY > H + 50) return;
      const x = obstacle.lane * LANE_W + LANE_W / 2 - obstacle.w / 2;
      fillRound(ctx, x, screenY, obstacle.w, 40, 6, 'rgba(248, 113, 113, 0.85)');
    });
    [p1.current, p2.current].forEach((car, index) => {
      const lane = index as 0 | 1;
      fillRound(ctx, car.x, car.y, CAR_W, CAR_H, 7, car.color);
      fillRound(ctx, car.x + 5, car.y + 8, CAR_W - 10, 12, 3, 'rgba(8, 11, 22, 0.75)');
      drawText(ctx, `${Math.round((car.dist / FINISH_LINES) * 100)}%`, lane * LANE_W + LANE_W / 2, 40, 16, car.color, 'center', '900');
    });

    drawText(ctx, 'P1  W/S', LANE_W / 2, H - 14, 11, 'rgba(34, 211, 238, 0.8)', 'center', '800');
    drawText(ctx, 'P2  ↑/↓', LANE_W + LANE_W / 2, H - 14, 11, 'rgba(244, 114, 182, 0.8)', 'center', '800');
    ctx.fillStyle = 'rgba(226, 232, 240, 0.35)';
    ctx.fillRect(LANE_W - 2, 0, 4, H);

    if (done.current) {
      fillRound(ctx, LANE_W - 220, H / 2 - 32, 440, 64, 14, 'rgba(6, 6, 12, 0.85)');
      drawText(ctx, done.current, LANE_W, H / 2, 20, '#e2e8f0', 'center', '900');
    }
  }

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'w', 's'],
    down: (key) => {
      if (key === 'd' || key === 'D') nudge(p1.current, 26);
      if (key === 'a' || key === 'A') nudge(p1.current, -26);
      if (key === 'ArrowRight') nudge(p2.current, 26);
      if (key === 'ArrowLeft') nudge(p2.current, -26);
      if (key === 'w' || key === 'W' || key === 'ArrowUp') {
        const car = key === 'w' || key === 'W' ? p1.current : p2.current;
        car.speed = Math.min(520, car.speed + 60);
      }
      if (key === 's' || key === 'S' || key === 'ArrowDown') {
        const car = key === 's' || key === 'S' ? p1.current : p2.current;
        car.speed = Math.max(80, car.speed - 120);
      }
    },
  });

  useRafLoop((dt) => {
    if (statusRef.current === 'playing') step(dt);
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
          <span className="gstatus" style={{ color: '#22d3ee' }}>P1 <b>{Math.round(p1.current.dist)}</b> m</span>
          <span className="gstatus" style={{ color: '#f472b6' }}>P2 <b>{Math.round(p2.current.dist)}</b> m</span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas race2p-canvas" style={{ maxWidth: W }} />
        <div className="pong-touch">
          <div className="pong-pad arena-group">
            <span>P1</span>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p1.current, -26)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p1.current, 26)}>
              ▶
            </button>
          </div>
          <div className="pong-pad arena-group">
            <span>P2</span>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p2.current, -26)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p2.current, 26)}>
              ▶
            </button>
          </div>
        </div>
        <p className="game-hint">Spieler 1: A/D lenken · Spieler 2: ←/→ lenken · Rote Hindernisse bremsen euch aus.</p>
      </div>
    </GameStage>
  );
}

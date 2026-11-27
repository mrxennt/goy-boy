import { useEffect, useRef, useState } from 'react';
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
/* the car sits at a fixed screen height; the road scrolls underneath it */
const CAR_Y = ROAD_BOTTOM - CAR_H - 10;
const OBSTACLE_H = 40;

export default function SplitRace({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const p1 = useRef<Car>({ x: 0, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#22d3ee' });
  const p2 = useRef<Car>({ x: 0, y: ROAD_BOTTOM - CAR_H - 10, speed: 0, dist: 0, color: '#f472b6' });
  /* one scroll per lane, so a crash in lane 0 does not move lane 1 */
  const scroll = useRef<[number, number]>([0, 0]);
  const obstacles = useRef<{ lane: 0 | 1; y: number; w: number; hit: boolean }[]>([]);
  const lastHitSfx = useRef(0);
  const done = useRef<string | null>(null);
  /* the meters are drawn from state: reading the refs in JSX would freeze them */
  const [meters, setMeters] = useState({ p1: 0, p2: 0 });
  const lastMeter = useRef(0);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const statusRef = useRef(session.status);
  statusRef.current = session.status;

  function reset() {
    // both cars start in the middle of their lane, right in the obstacle line,
    // so steering around the blocks is the whole game
    const startX = (lane: 0 | 1) => lane * LANE_W + LANE_W / 2 - CAR_W / 2;
    p1.current = { x: startX(0), y: CAR_Y, speed: 0, dist: 0, color: '#22d3ee' };
    p2.current = { x: startX(1), y: CAR_Y, speed: 0, dist: 0, color: '#f472b6' };
    scroll.current = [0, 0];
    obstacles.current = [];
    for (let y = -260; y > -FINISH_LINES; y -= 260) {
      obstacles.current.push({ lane: (Math.random() < 0.5 ? 0 : 1) as 0 | 1, y, w: 46, hit: false });
    }
    done.current = null;
    lastMeter.current = 0;
    setMeters({ p1: 0, p2: 0 });
    session.setScore(0);
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function laneBounds(lane: 0 | 1) {
    return { left: lane * LANE_W + 16, right: (lane + 1) * LANE_W - 16 - CAR_W };
  }

  function nudge(car: Car, lane: 0 | 1, delta: number) {
    const { left, right } = laneBounds(lane);
    car.x = Math.max(left, Math.min(right, car.x + delta));
  }

  function step(dtMs: number) {
    if (done.current) return;
    const dt = Math.min(34, dtMs) / 1000;
    const a = p1.current;
    const b = p2.current;
    // automatic speed-up, avoiding the obstacles is the game
    a.speed = Math.min(460, a.speed + 120 * dt);
    b.speed = Math.min(460, b.speed + 120 * dt);
    a.dist += a.speed * dt;
    b.dist += b.speed * dt;
    scroll.current = [scroll.current[0] + a.speed * dt * 0.55, scroll.current[1] + b.speed * dt * 0.55];

    [a, b].forEach((car, index) => {
      const lane = index as 0 | 1;
      const { left, right } = laneBounds(lane);
      car.x = Math.max(left, Math.min(right, car.x));
      car.y = CAR_Y;
    });

    // obstacles live in road coordinates; the screen position follows the lane's own scroll
    obstacles.current.forEach((obstacle) => {
      const car = obstacle.lane === 0 ? a : b;
      const screenY = CAR_Y + obstacle.y + scroll.current[obstacle.lane];
      const obstacleLeft = obstacle.lane * LANE_W + LANE_W / 2 - obstacle.w / 2;
      const overlap =
        car.y < screenY + OBSTACLE_H &&
        car.y + CAR_H > screenY &&
        car.x + CAR_W > obstacleLeft &&
        car.x < obstacleLeft + obstacle.w;
      if (!overlap) {
        obstacle.hit = false;
        return;
      }
      car.speed = Math.max(90, car.speed * 0.6);
      if (!obstacle.hit) {
        obstacle.hit = true;
        const now = performance.now();
        if (now - lastHitSfx.current > 220) {
          lastHitSfx.current = now;
          sfx.hit();
        }
      }
    });

    if (performance.now() - lastMeter.current > 140) {
      lastMeter.current = performance.now();
      setMeters({ p1: Math.round(a.dist), p2: Math.round(b.dist) });
      session.setScore(Math.max(Math.round(a.dist), Math.round(b.dist)));
    }

    if (a.dist >= FINISH_LINES && b.dist >= FINISH_LINES) {
      done.current = 'Unentschieden – gleichauf im Ziel!';
      sfx.point();
      finishRef.current(600, done.current);
    } else if (a.dist >= FINISH_LINES) {
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
    drawGrid(ctx, W, H, 40, 'rgba(255,255,255,0.02)');

    [0, 1].forEach((lane) => {
      const left = lane * LANE_W;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(left + 8, 0, LANE_W - 16, H);
      ctx.fillStyle = 'rgba(148, 163, 184, 0.5)';
      for (let y = -1; y < H; y += 48) {
        const yy = (y + (scroll.current[lane] % 48)) % (H + 48);
        ctx.fillRect(left + LANE_W / 2 - 2, yy, 4, 26);
      }
      ctx.fillStyle = 'rgba(226, 232, 240, 0.25)';
      ctx.fillRect(left + 8, 0, 3, H);
      ctx.fillRect(left + LANE_W - 11, 0, 3, H);
    });

    obstacles.current.forEach((obstacle) => {
      const screenY = CAR_Y + obstacle.y + scroll.current[obstacle.lane];
      if (screenY < -60 || screenY > H + 60) return;
      const x = obstacle.lane * LANE_W + LANE_W / 2 - obstacle.w / 2;
      fillRound(ctx, x, screenY, obstacle.w, OBSTACLE_H, 6, 'rgba(248, 113, 113, 0.85)');
    });
    [p1.current, p2.current].forEach((car, index) => {
      const lane = index as 0 | 1;
      fillRound(ctx, car.x, car.y, CAR_W, CAR_H, 7, car.color);
      fillRound(ctx, car.x + 5, car.y + 8, CAR_W - 10, 12, 3, 'rgba(8, 11, 22, 0.75)');
      drawText(ctx, `${Math.round((car.dist / FINISH_LINES) * 100)}%`, lane * LANE_W + LANE_W / 2, 40, 16, car.color, 'center', '900');
    });

    drawText(ctx, 'P1  A/D', LANE_W / 2, H - 14, 11, 'rgba(34, 211, 238, 0.8)', 'center', '800');
    drawText(ctx, 'P2  ←/→', LANE_W + LANE_W / 2, H - 14, 11, 'rgba(244, 114, 182, 0.8)', 'center', '800');
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
      if (key === 'd' || key === 'D') nudge(p1.current, 0, 26);
      if (key === 'a' || key === 'A') nudge(p1.current, 0, -26);
      if (key === 'ArrowRight') nudge(p2.current, 1, 26);
      if (key === 'ArrowLeft') nudge(p2.current, 1, -26);
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
          <span className="gstatus" style={{ color: '#22d3ee' }}>P1 <b>{meters.p1}</b> m</span>
          <span className="gstatus" style={{ color: '#f472b6' }}>P2 <b>{meters.p2}</b> m</span>
        </>
      }
    >
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas race2p-canvas" style={{ maxWidth: W }} />
        <div className="pong-touch">
          <div className="pong-pad arena-group">
            <span>P1</span>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p1.current, 0, -26)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p1.current, 0, 26)}>
              ▶
            </button>
          </div>
          <div className="pong-pad arena-group">
            <span>P2</span>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p2.current, 1, -26)}>
              ◀
            </button>
            <button type="button" className="touch-btn" onPointerDown={() => nudge(p2.current, 1, 26)}>
              ▶
            </button>
          </div>
        </div>
        <p className="game-hint">Spieler 1: A/D lenken · Spieler 2: ←/→ lenken · Rote Hindernisse bremsen euch aus.</p>
      </div>
    </GameStage>
  );
}

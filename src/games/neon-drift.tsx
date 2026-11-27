import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const ROAD_HALF = 215;
const CAR_SCREEN_Y = H - 132;

type Cone = { worldY: number; offset: number };

const roadCenter = (worldY: number) => W / 2 + Math.sin(worldY / 460) * 150 + Math.sin(worldY / 165) * 38;

export default function NeonDrift({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const car = useRef({ x: W / 2, speed: 180, angle: 0, health: 100 });
  const keys = useRef<Set<string>>(new Set());
  const travelled = useRef(0);
  const cones = useRef<Cone[]>([]);
  const nextCone = useRef(700);
  const scored = useRef(0);
  const drift = useRef(0);
  const dead = useRef(false);
  const skid = useRef<{ x: number; y: number; life: number }[]>([]);

  function reset() {
    car.current = { x: W / 2, speed: 180, angle: 0, health: 100 };
    travelled.current = 0;
    cones.current = [];
    nextCone.current = 700;
    scored.current = 0;
    drift.current = 0;
    dead.current = false;
    skid.current = [];
    session.setScore(0);
  }

  function crash() {
    if (dead.current) return;
    dead.current = true;
    sfx.hit();
    session.finish(scored.current, 'Wrack geschrottet');
  }

  function update(dtMs: number) {
    const dt = Math.min(46, dtMs) / 1000;
    const c = car.current;
    const holding = keys.current;
    const accel = holding.has('ArrowUp') || holding.has('w') ? 260 : 0;
    const braking = holding.has('ArrowDown') || holding.has('s') ? 420 : 0;
    const drifting = holding.has(' ');
    c.speed = Math.max(70, Math.min(560, c.speed + accel * dt - braking * dt - (drifting ? 40 * dt : 0)));

    const steer = (holding.has('ArrowRight') || holding.has('d') ? 1 : 0) - (holding.has('ArrowLeft') || holding.has('a') ? 1 : 0);
    c.angle += (steer * 0.45 - c.angle) * Math.min(1, dt * 8);
    c.x += steer * (drifting ? 300 : 230) * dt;

    travelled.current += c.speed * dt;
    const playerWorldY = travelled.current + (H - CAR_SCREEN_Y);
    const center = roadCenter(playerWorldY);
    const offset = c.x - center;
    const offRoad = Math.abs(offset) > ROAD_HALF - 22;
    if (offRoad) {
      c.health -= 22 * dt;
      c.speed *= 1 - 0.9 * dt;
      if (Math.random() < 0.4) skid.current.push({ x: c.x, y: CAR_SCREEN_Y + 14, life: 500 });
    }

    if (drifting && steer !== 0 && !offRoad) {
      drift.current += c.speed * dt * 0.8;
      if (Math.random() < 0.6) skid.current.push({ x: c.x + (Math.random() - 0.5) * 20, y: CAR_SCREEN_Y + 16, life: 420 });
    }

    c.x = Math.max(30, Math.min(W - 30, c.x));

    if (travelled.current > nextCone.current) {
      nextCone.current += 320 + Math.random() * 320;
      cones.current.push({ worldY: travelled.current + 900, offset: (Math.random() - 0.5) * (ROAD_HALF * 1.7) });
    }
    cones.current = cones.current.filter((cone) => cone.worldY > travelled.current - 120);

    for (const cone of cones.current) {
      const screenY = H - (cone.worldY - travelled.current);
      if (screenY < CAR_SCREEN_Y - 26 || screenY > CAR_SCREEN_Y + 26) continue;
      const coneX = roadCenter(cone.worldY) + cone.offset;
      if (Math.abs(coneX - c.x) < 24) {
        cone.worldY = -1;
        c.health -= 24;
        c.speed *= 0.72;
        sfx.hit();
      }
    }
    cones.current = cones.current.filter((cone) => cone.worldY > 0);

    skid.current = skid.current.filter((mark) => {
      mark.life -= dtMs;
      mark.y += 40 * dt;
      return mark.life > 0;
    });

    const nextScore = Math.floor(travelled.current / 12 + drift.current / 18);
    if (nextScore !== scored.current) {
      scored.current = nextScore;
      session.setScore(scored.current);
    }

    if (c.health <= 0) crash();
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const c = car.current;
    drawBackdrop(ctx, W, H, 'rgba(190, 24, 93, 0.22)', '#070510');

    // neon grid horizon
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 14; i += 1) {
      const y = 40 + i * 34 + ((travelled.current * 0.4) % 34);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // road polygon
    const left: { x: number; y: number }[] = [];
    const right: { x: number; y: number }[] = [];
    for (let screenY = H + 10; screenY >= -10; screenY -= 8) {
      const worldY = travelled.current + (H - screenY);
      const center = roadCenter(worldY);
      left.push({ x: center - ROAD_HALF, y: screenY });
      right.push({ x: center + ROAD_HALF, y: screenY });
    }
    ctx.beginPath();
    left.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
    [...right].reverse().forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
    const roadGrad = ctx.createLinearGradient(0, 0, 0, H);
    roadGrad.addColorStop(0, '#131528');
    roadGrad.addColorStop(1, '#1b1d33');
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // edges
    for (const edge of [left, right]) {
      ctx.beginPath();
      edge.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
      ctx.strokeStyle = '#a855f7';
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 16;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // lane dashes
    for (let worldY = Math.floor(travelled.current / 70) * 70; worldY < travelled.current + H + 200; worldY += 70) {
      const screenY = H - (worldY - travelled.current);
      if (screenY < -20 || screenY > H + 20) continue;
      for (const shift of [-ROAD_HALF / 2, ROAD_HALF / 2]) {
        fillRound(ctx, roadCenter(worldY) + shift - 2, screenY, 4, 18, 2, 'rgba(255,255,255,0.22)');
      }
    }

    // skid marks
    for (const mark of skid.current) {
      ctx.fillStyle = `rgba(244, 114, 182, ${Math.min(0.4, mark.life / 900)})`;
      ctx.fillRect(mark.x - 6, mark.y, 4, 10);
      ctx.fillRect(mark.x + 3, mark.y, 4, 10);
    }

    // cones
    for (const cone of cones.current) {
      const screenY = H - (cone.worldY - travelled.current);
      if (screenY < -30 || screenY > H + 30) continue;
      const x = roadCenter(cone.worldY) + cone.offset;
      const scale = 0.7 + (screenY / H) * 0.5;
      ctx.save();
      ctx.shadowColor = '#fb923c';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#fb923c';
      ctx.beginPath();
      ctx.moveTo(x, screenY - 20 * scale);
      ctx.lineTo(x + 11 * scale, screenY + 8 * scale);
      ctx.lineTo(x - 11 * scale, screenY + 8 * scale);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fff7ed';
      ctx.fillRect(x - 6 * scale, screenY - 4 * scale, 12 * scale, 3);
    }

    // car
    const playerWorldY = travelled.current + (H - CAR_SCREEN_Y);
    const roadAngle = Math.atan2(roadCenter(playerWorldY + 40) - roadCenter(playerWorldY - 40), 80);
    ctx.save();
    ctx.translate(c.x, CAR_SCREEN_Y);
    ctx.rotate(c.angle * 0.5 + roadAngle * 0.35);
    ctx.shadowColor = '#22d3ee';
    ctx.shadowBlur = 26;
    const bodyGrad = ctx.createLinearGradient(-20, -34, 20, 34);
    bodyGrad.addColorStop(0, '#67e8f9');
    bodyGrad.addColorStop(1, '#4338ca');
    fillRound(ctx, -19, -34, 38, 68, 10, bodyGrad);
    ctx.shadowBlur = 0;
    fillRound(ctx, -14, -20, 28, 22, 6, 'rgba(4, 17, 27, 0.85)');
    fillRound(ctx, -14, 6, 28, 16, 5, 'rgba(4, 17, 27, 0.7)');
    glowCircle(ctx, -12, 30, 4, '#fef08a', 12);
    glowCircle(ctx, 12, 30, 4, '#fef08a', 12);
    ctx.restore();

    // speed + health
    drawText(ctx, `${Math.round(c.speed / 2)} km/h`, W - 22, 26, 15, '#c4b5fd', 'right', '800');
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    fillRound(ctx, 20, 16, 150, 12, 6, 'rgba(255,255,255,0.12)');
    fillRound(ctx, 20, 16, Math.max(0, 150 * (c.health / 100)), 12, 6, c.health > 40 ? '#4ade80' : '#f87171');
    drawText(ctx, `DRIFT ${Math.floor(drift.current / 10)}`, 20, 48, 11, '#f9a8d4', 'left', '800');
    drawText(ctx, 'DISTANZ ' + Math.floor(travelled.current / 10) + ' m', 20, H - 20, 11, '#9aa0b5', 'left', '700');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '],
    down: (key) => keys.current.add(key.length === 1 ? key.toLowerCase() : key),
    up: (key) => keys.current.delete(key.length === 1 ? key.toLowerCase() : key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  const control = (key: string, down: boolean) => {
    if (down) keys.current.add(key);
    else keys.current.delete(key);
  };

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="drift-pad">
          <button type="button" className="touch-btn" onPointerDown={() => control('ArrowLeft', true)} onPointerUp={() => control('ArrowLeft', false)} onPointerLeave={() => control('ArrowLeft', false)} aria-label="Links">
            ◀
          </button>
          <button type="button" className="touch-btn" onPointerDown={() => control('ArrowUp', true)} onPointerUp={() => control('ArrowUp', false)} onPointerLeave={() => control('ArrowUp', false)} aria-label="Gas">
            ▲
          </button>
          <button type="button" className="touch-btn" onPointerDown={() => control('ArrowDown', true)} onPointerUp={() => control('ArrowDown', false)} onPointerLeave={() => control('ArrowDown', false)} aria-label="Bremse">
            ▼
          </button>
          <button type="button" className="touch-btn" onPointerDown={() => control(' ', true)} onPointerUp={() => control(' ', false)} onPointerLeave={() => control(' ', false)} aria-label="Drift">
            DRIFT
          </button>
          <button type="button" className="touch-btn" onPointerDown={() => control('ArrowRight', true)} onPointerUp={() => control('ArrowRight', false)} onPointerLeave={() => control('ArrowRight', false)} aria-label="Rechts">
            ▶
          </button>
        </div>
        <p className="game-hint">↑ Gas · ↓ Bremse · ← → lenken · Leertaste driften. Offroad kostet Substanz.</p>
      </div>
    </GameStage>
  );
}

import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;
const HORIZON = 165;

type ObType = 'low' | 'high' | 'block';
type Obstacle = { lane: number; z: number; type: ObType };
type Coin = { lane: number; z: number; taken: boolean };

const scaleFor = (z: number) => 300 / (z + 300);
const laneX = (lane: number, z: number) => W / 2 + (lane - 1) * 205 * scaleFor(z);
const depthY = (z: number) => HORIZON + (H - HORIZON - 20) * scaleFor(z);

export default function EndlessRunner({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const player = useRef({ lane: 1, target: 1, jump: 0, vy: 0, slide: 0 });
  const obstacles = useRef<Obstacle[]>([]);
  const coins = useRef<Coin[]>([]);
  const travelled = useRef(0);
  const speed = useRef(440);
  const scored = useRef(0);
  const nextSpawn = useRef(800);
  const coinCount = useRef(0);
  const dead = useRef(false);
  const deathAt = useRef(0);

  function reset() {
    player.current = { lane: 1, target: 1, jump: 0, vy: 0, slide: 0 };
    obstacles.current = [];
    coins.current = [];
    travelled.current = 0;
    speed.current = 440;
    scored.current = 0;
    nextSpawn.current = 850;
    coinCount.current = 0;
    dead.current = false;
    deathAt.current = 0;
    session.setScore(0);
  }

  function jump() {
    const p = player.current;
    if (session.status !== 'playing' || dead.current) return;
    if (p.jump <= 0) {
      p.vy = 1250;
      sfx.click();
    }
  }

  function slide() {
    const p = player.current;
    if (session.status !== 'playing' || dead.current) return;
    if (p.jump > 0) {
      p.vy = -1500;
    } else {
      p.slide = 480;
      sfx.pick();
    }
  }

  function move(direction: number) {
    const p = player.current;
    p.target = Math.max(0, Math.min(2, p.target + direction));
    sfx.click();
  }

  function die() {
    if (dead.current) return;
    dead.current = true;
    deathAt.current = performance.now();
    sfx.hit();
    session.finish(scored.current, 'Gestolpert!');
  }

  function update(dtMs: number) {
    const dt = Math.min(46, dtMs) / 1000;
    const p = player.current;
    if (dead.current) return;

    speed.current = Math.min(880, speed.current + 5 * dt);
    travelled.current += speed.current * dt;

    p.lane += (p.target - p.lane) * Math.min(1, dt * 12);
    if (p.jump > 0 || p.vy !== 0) {
      p.jump = Math.max(0, p.jump + p.vy * dt);
      p.vy -= 3400 * dt;
      if (p.jump <= 0) {
        p.jump = 0;
        p.vy = 0;
      }
    }
    p.slide = Math.max(0, p.slide - dtMs);

    for (const obstacle of obstacles.current) obstacle.z -= speed.current * dt;
    for (const coin of coins.current) coin.z -= speed.current * dt;

    if (travelled.current > nextSpawn.current) {
      nextSpawn.current += 210 + Math.random() * 240;
      const lane = Math.floor(Math.random() * 3);
      const roll = Math.random();
      const type: ObType = roll < 0.4 ? 'low' : roll < 0.72 ? 'high' : 'block';
      obstacles.current.push({ lane, z: 1600, type });
      if (Math.random() < 0.65) {
        const coinLane = Math.random() < 0.5 ? lane : (lane + 1) % 3;
        coins.current.push({ lane: coinLane, z: 1600 + 160, taken: false });
      }
      if (Math.random() < 0.25) {
        coins.current.push({ lane: (lane + 2) % 3, z: 1600 + 60, taken: false });
      }
    }

    obstacles.current = obstacles.current.filter((obstacle) => obstacle.z > -40);
    coins.current = coins.current.filter((coin) => coin.z > -40);

    obstacles.current.forEach((obstacle) => {
      if (obstacle.z > 46 || obstacle.z < -10) return;
      if (Math.abs(p.lane - obstacle.lane) > 0.45) return;
      const jumpedOver = p.jump > 40;
      const sliding = p.slide > 0;
      if (obstacle.type === 'low' && jumpedOver) return;
      if (obstacle.type === 'high' && sliding) return;
      if (obstacle.type === 'block') die();
      else if (obstacle.type === 'low' && !jumpedOver) die();
      else if (obstacle.type === 'high' && !sliding) die();
    });

    for (const coin of coins.current) {
      if (coin.taken || coin.z > 46 || coin.z < -6) continue;
      if (Math.abs(p.lane - coin.lane) < 0.5) {
        coin.taken = true;
        coinCount.current += 1;
        sfx.point();
      }
    }

    const nextScore = Math.floor(travelled.current / 10) + coinCount.current * 15;
    if (nextScore !== scored.current) {
      scored.current = nextScore;
      session.setScore(scored.current);
    }
  }

  function drawObstacle(obstacle: Obstacle) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const scale = scaleFor(obstacle.z);
    const x = laneX(obstacle.lane, obstacle.z);
    const y = depthY(obstacle.z);
    const width = 120 * scale;
    if (obstacle.type === 'low') {
      fillRound(ctx, x - width / 2, y - 34 * scale, width, 34 * scale, 6 * scale, '#f472b6');
      fillRound(ctx, x - width / 2, y - 40 * scale, width, 6 * scale, 3 * scale, '#fbcfe8');
    } else if (obstacle.type === 'high') {
      fillRound(ctx, x - width / 2, y - 120 * scale, width, 26 * scale, 4 * scale, '#fbbf24');
      fillRound(ctx, x - width / 2, y - 120 * scale, 6 * scale, 100 * scale, 2 * scale, '#fde68a');
      fillRound(ctx, x + width / 2 - 6 * scale, y - 120 * scale, 6 * scale, 100 * scale, 2 * scale, '#fde68a');
    } else {
      fillRound(ctx, x - width / 2, y - 120 * scale, width, 120 * scale, 8 * scale, '#7c3aed');
      fillRound(ctx, x - width / 2, y - 120 * scale, width, 12 * scale, 6 * scale, '#c4b5fd');
    }
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(30, 64, 175, 0.3)', '#050812');

    // stars
    for (let i = 0; i < 40; i += 1) {
      const x = (i * 137) % W;
      const y = (i * 71) % HORIZON;
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fillRect(x, y, 1.6, 1.6);
    }

    // road
    ctx.beginPath();
    ctx.moveTo(W / 2 - 390, H);
    ctx.lineTo(W / 2 - 60, HORIZON);
    ctx.lineTo(W / 2 + 60, HORIZON);
    ctx.lineTo(W / 2 + 390, H);
    ctx.closePath();
    const roadGrad = ctx.createLinearGradient(0, HORIZON, 0, H);
    roadGrad.addColorStop(0, '#1e1b4b');
    roadGrad.addColorStop(1, '#0b1020');
    ctx.fillStyle = roadGrad;
    ctx.fill();

    // lane lines
    for (const lane of [0.5, 1.5]) {
      ctx.beginPath();
      ctx.moveTo(W / 2 + (lane - 1) * 120, HORIZON);
      ctx.lineTo(W / 2 + (lane - 1) * 390, H);
      ctx.strokeStyle = 'rgba(139, 92, 246, 0.35)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // moving stripes
    const stripeOffset = (travelled.current * 1.4) % 120;
    for (let i = 0; i < 10; i += 1) {
      const t = (i + stripeOffset / 120) / 10;
      const y = HORIZON + (H - HORIZON) * t * t;
      ctx.fillStyle = `rgba(167,139,250,${0.06 + t * 0.12})`;
      ctx.fillRect(W / 2 - 380 * t - 2, y, 4, 10 * t + 2);
      ctx.fillRect(W / 2 + 380 * t - 2, y, 4, 10 * t + 2);
    }

    const sortedObstacles = [...obstacles.current].sort((a, b) => b.z - a.z);
    for (const obstacle of sortedObstacles) {
      if (obstacle.z > 1500 || obstacle.z < -20) continue;
      drawObstacle(obstacle);
    }

    for (const coin of coins.current) {
      if (coin.taken || coin.z > 1500 || coin.z < -20) continue;
      const scale = scaleFor(coin.z);
      const x = laneX(coin.lane, coin.z);
      const y = depthY(coin.z) - 60 * scale;
      ctx.save();
      ctx.shadowColor = '#fde047';
      ctx.shadowBlur = 16;
      ctx.fillStyle = '#facc15';
      ctx.beginPath();
      ctx.ellipse(x, y, 13 * scale, 13 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#fef9c3';
      ctx.beginPath();
      ctx.ellipse(x, y, 7 * scale, 8 * scale, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const p = player.current;
    const px = laneX(p.lane, 0);
    const py = depthY(0) - p.jump;
    const sliding = p.slide > 0;
    ctx.save();
    ctx.translate(px, py);
    glowCircle(ctx, 0, -8, sliding ? 26 : 18, '#22d3ee', 22);
    const bodyH = sliding ? 26 : 58;
    fillRound(ctx, -18, -bodyH, 36, bodyH, 12, '#0ea5e9');
    fillRound(ctx, -18, -bodyH, 36, 14, 8, '#a5f3fc');
    const headY = sliding ? -34 : -bodyH - 12;
    ctx.fillStyle = '#e0f2fe';
    ctx.beginPath();
    ctx.arc(0, headY, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(4, headY - 1, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawText(ctx, `${Math.floor(travelled.current / 10)} m`, 22, 26, 15, '#e0e7ff', 'left', '800');
    drawText(ctx, `🪙 ${coinCount.current}`, W - 22, 26, 14, '#fde68a', 'right', '700');
    drawText(ctx, `${Math.round(speed.current / 10)} km/h`, 22, 48, 11, '#9aa0b5', 'left', '600');
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '],
    down: (key) => {
      if (key === 'ArrowLeft' || key === 'a' || key === 'A') move(-1);
      else if (key === 'ArrowRight' || key === 'd' || key === 'D') move(1);
      else if (key === 'ArrowUp' || key === 'w' || key === 'W' || key === ' ') jump();
      else if (key === 'ArrowDown' || key === 's' || key === 'S') slide();
    },
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas
          ref={canvasRef}
          className="game-canvas"
          style={{ maxWidth: W }}
          onTouchStart={() => jump()}
        />
        <div className="drift-pad">
          <button type="button" className="touch-btn" onClick={() => move(-1)} aria-label="Linke Spur">
            ◀
          </button>
          <button type="button" className="touch-btn" onClick={jump} aria-label="Springen">
            ▲
          </button>
          <button type="button" className="touch-btn" onClick={slide} aria-label="Sliden">
            ▼
          </button>
          <button type="button" className="touch-btn" onClick={() => move(1)} aria-label="Rechte Spur">
            ▶
          </button>
        </div>
        <p className="game-hint">← → Spur wechseln · ↑ springen · ↓ sliden · pinke Hürde springen, gelbe Leiste sliden</p>
      </div>
    </GameStage>
  );
}

import { useEffect, useRef } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, glowCircle } from './lib/canvas';

const W = 800;
const H = 520;

type Rock = { x: number; y: number; vx: number; vy: number; r: number; angle: number; spin: number; shape: number[] };
type Bullet = { x: number; y: number; vx: number; vy: number; life: number };

const wrap = (value: number, max: number) => ((value % max) + max) % max;

export default function Asteroids({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);

  const keys = useRef<Set<string>>(new Set());
  const ship = useRef({ x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, cooldown: 0, invuln: 2000 });
  const bullets = useRef<Bullet[]>([]);
  const rocks = useRef<Rock[]>([]);
  const lives = useRef(3);
  const level = useRef(1);
  const scored = useRef(0);

  function makeRock(x: number, y: number, r: number, speedBoost = 1): Rock {
    const angle = Math.random() * Math.PI * 2;
    const speed = (20 + Math.random() * 40) * speedBoost;
    const shape = Array.from({ length: 9 }, () => 0.72 + Math.random() * 0.42);
    return {
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      angle: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 1.4,
      shape,
    };
  }

  function spawnWave() {
    rocks.current = [];
    const count = 3 + level.current;
    for (let i = 0; i < count; i += 1) {
      let x = Math.random() * W;
      let y = Math.random() * H;
      while (Math.hypot(x - ship.current.x, y - ship.current.y) < 180) {
        x = Math.random() * W;
        y = Math.random() * H;
      }
      rocks.current.push(makeRock(x, y, 26 + Math.random() * 18, 1 + (level.current - 1) * 0.12));
    }
  }

  function reset() {
    ship.current = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: -Math.PI / 2, cooldown: 0, invuln: 2000 };
    bullets.current = [];
    lives.current = 3;
    level.current = 1;
    scored.current = 0;
    session.setScore(0);
    spawnWave();
  }

  function shoot() {
    const s = ship.current;
    if (s.cooldown > 0) return;
    s.cooldown = 190;
    bullets.current.push({
      x: s.x + Math.cos(s.angle) * 16,
      y: s.y + Math.sin(s.angle) * 16,
      vx: Math.cos(s.angle) * 620 + s.vx * 0.4,
      vy: Math.sin(s.angle) * 620 + s.vy * 0.4,
      life: 900,
    });
    sfx.click();
  }

  function hitShip() {
    const s = ship.current;
    if (s.invuln > 0) return;
    lives.current -= 1;
    sfx.hit();
    if (lives.current <= 0) {
      session.finish(scored.current, 'Game Over');
      return;
    }
    s.x = W / 2;
    s.y = H / 2;
    s.vx = 0;
    s.vy = 0;
    s.invuln = 2200;
  }

  function update(dtMs: number) {
    const dt = Math.min(50, dtMs) / 1000;
    const s = ship.current;
    s.cooldown = Math.max(0, s.cooldown - dtMs);
    s.invuln = Math.max(0, s.invuln - dtMs);

    if (keys.current.has('ArrowLeft') || keys.current.has('a')) s.angle -= 3.4 * dt;
    if (keys.current.has('ArrowRight') || keys.current.has('d')) s.angle += 3.4 * dt;
    if (keys.current.has('ArrowUp') || keys.current.has('w')) {
      s.vx += Math.cos(s.angle) * 300 * dt;
      s.vy += Math.sin(s.angle) * 300 * dt;
      if (Math.random() < 0.5) {
        // engine trail dots handled visually
      }
    }
    if (keys.current.has(' ')) shoot();

    s.vx *= 0.995;
    s.vy *= 0.995;
    s.x = wrap(s.x + s.vx * dt, W);
    s.y = wrap(s.y + s.vy * dt, H);

    bullets.current = bullets.current.filter((bullet) => {
      bullet.x = wrap(bullet.x + bullet.vx * dt, W);
      bullet.y = wrap(bullet.y + bullet.vy * dt, H);
      bullet.life -= dtMs;
      return bullet.life > 0;
    });

    for (const rock of rocks.current) {
      rock.x = wrap(rock.x + rock.vx * dt, W);
      rock.y = wrap(rock.y + rock.vy * dt, H);
      rock.angle += rock.spin * dt;
    }

    // bullet hits
    const spawned: Rock[] = [];
    const remainingBullets = [...bullets.current];
    rocks.current = rocks.current.filter((rock) => {
      for (let i = 0; i < remainingBullets.length; i += 1) {
        const bullet = remainingBullets[i];
        if (Math.hypot(bullet.x - rock.x, bullet.y - rock.y) < rock.r) {
          remainingBullets.splice(i, 1);
          scored.current += Math.round(80 - rock.r);
          session.setScore(scored.current);
          sfx.hit();
          if (rock.r > 26) {
            const childR = rock.r * 0.58;
            spawned.push(makeRock(rock.x, rock.y, childR, 1.3), makeRock(rock.x, rock.y, childR, 1.3));
          }
          return false;
        }
      }
      return true;
    });
    bullets.current = remainingBullets;
    if (spawned.length) rocks.current.push(...spawned);

    // ship collision
    for (const rock of rocks.current) {
      if (Math.hypot(rock.x - s.x, rock.y - s.y) < rock.r + 11) {
        hitShip();
        break;
      }
    }

    if (!rocks.current.length) {
      level.current += 1;
      scored.current += 100;
      session.setScore(scored.current);
      ship.current.invuln = 1500;
      spawnWave();
      sfx.win();
    }
  }

  function drawRock(rock: Rock) {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.save();
    ctx.translate(rock.x, rock.y);
    ctx.rotate(rock.angle);
    ctx.beginPath();
    rock.shape.forEach((factor, index) => {
      const angle = (index / rock.shape.length) * Math.PI * 2;
      const px = Math.cos(angle) * rock.r * factor;
      const py = Math.sin(angle) * rock.r * factor;
      if (index === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.fillStyle = 'rgba(76, 29, 149, 0.35)';
    ctx.fill();
    ctx.strokeStyle = '#c4b5fd';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(167, 139, 250, 0.8)';
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(190, 24, 93, 0.18)');

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    for (let i = 0; i < 8; i += 1) {
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 60 + i * 46, 0, Math.PI * 2);
      ctx.stroke();
    }

    rocks.current.forEach(drawRock);

    const s = ship.current;
    if (s.invuln <= 0 || Math.floor(performance.now() / 120) % 2 === 0) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      ctx.beginPath();
      ctx.moveTo(18, 0);
      ctx.lineTo(-13, -11);
      ctx.lineTo(-7, 0);
      ctx.lineTo(-13, 11);
      ctx.closePath();
      ctx.fillStyle = '#f0abfc';
      ctx.shadowColor = '#e879f9';
      ctx.shadowBlur = 20;
      ctx.fill();
      ctx.restore();
    }

    for (const bullet of bullets.current) {
      glowCircle(ctx, bullet.x, bullet.y, 2.6, '#fef08a', 14);
    }

    drawText(ctx, `Level ${level.current}`, 20, 26, 13, '#9aa0b5', 'left', '700');
    for (let i = 0; i < lives.current; i += 1) {
      ctx.save();
      ctx.translate(W - 30 - i * 26, 26);
      ctx.beginPath();
      ctx.moveTo(8, 0);
      ctx.lineTo(-6, -5);
      ctx.lineTo(-6, 5);
      ctx.closePath();
      ctx.fillStyle = '#f0abfc';
      ctx.fill();
      ctx.restore();
    }
  }

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useKeys({
    active: session.status === 'playing',
    prevent: [' ', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown'],
    down: (key) => keys.current.add(key.length === 1 ? key.toLowerCase() : key),
    up: (key) => keys.current.delete(key.length === 1 ? key.toLowerCase() : key),
  });

  useRafLoop((dt) => {
    update(dt);
    draw();
  }, session.status === 'playing');

  const hold = (key: string, down: boolean) => {
    if (down) keys.current.add(key);
    else keys.current.delete(key);
  };

  return (
    <GameStage game={game} session={session}>
      <div className="game-wrap">
        <canvas ref={canvasRef} className="game-canvas" style={{ maxWidth: W }} />
        <div className="touch-pad">
          <button type="button" className="touch-btn left" onPointerDown={() => hold('ArrowLeft', true)} onPointerUp={() => hold('ArrowLeft', false)} onPointerLeave={() => hold('ArrowLeft', false)} aria-label="Links drehen">
            ↺
          </button>
          <button type="button" className="touch-btn up" onPointerDown={() => hold('ArrowUp', true)} onPointerUp={() => hold('ArrowUp', false)} onPointerLeave={() => hold('ArrowUp', false)} aria-label="Schub">
            ▲
          </button>
          <button type="button" className="touch-btn fire" onPointerDown={() => hold(' ', true)} onPointerUp={() => hold(' ', false)} aria-label="Schießen">
            ●
          </button>
          <button type="button" className="touch-btn right" onPointerDown={() => hold('ArrowRight', true)} onPointerUp={() => hold('ArrowRight', false)} onPointerLeave={() => hold('ArrowRight', false)} aria-label="Rechts drehen">
            ↻
          </button>
        </div>
        <p className="game-hint">← → drehen · ↑ Schub · Leertaste schießen. Das Schiff fliegt mit Trägheit weiter.</p>
      </div>
    </GameStage>
  );
}

import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useDifficulty, useKeys, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound, glowCircle } from './lib/canvas';

const W = 900;
const H = 540;

const GOAL_W = 150;
const PADDLE_W = 138;
const PUCK_R = 17;

type Mode = '2p' | 'ai';

type Puck = { x: number; y: number; vx: number; vy: number };
type Paddle = { x: number; y: number; px: number; py: number; moving: boolean };

const GOAL_TOP = (H - GOAL_W) / 2;
const GOAL_BOTTOM = (H + GOAL_W) / 2;

function clampPaddle(paddle: Paddle, side: 'left' | 'right') {
  // the paddle stays on its own half, fully inside the rink
  const minX = side === 'left' ? PADDLE_W / 2 + 10 : W / 2 + 10;
  const maxX = side === 'left' ? W / 2 - 10 : W - PADDLE_W / 2 - 10;
  paddle.x = Math.max(minX, Math.min(maxX, paddle.x));
  paddle.y = Math.max(92, Math.min(H - 92, paddle.y));
}

export default function AirHockey({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const [storedMode, setMode] = useDifficulty('air-hockey', '2p');
  const mode = storedMode === 'ai' ? 'ai' : '2p';
  const [score, setScore] = useState({ p1: 0, p2: 0 });
  const [message, setMessage] = useState('Schläger ziehen und die Scheibe anspielen – ein schneller Schläger schießt härter.');

  const left = useRef<Paddle>({ x: 92, y: H / 2, px: 92, py: H / 2, moving: false });
  const right = useRef<Paddle>({ x: W - 92, y: H / 2, px: W - 92, py: H / 2, moving: false });
  const puck = useRef<Puck>({ x: W / 2, y: H / 2, vx: 0, vy: 0 });
  const grab = useRef<{ hand: 0 | 1; side: 'left' | 'right'; dx: number; dy: number } | null>(null);
  const scores = useRef({ p1: 0, p2: 0 });
  const winner = useRef<string | null>(null);
  const elapsed = useRef(0);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const isAi = mode === 'ai';

  function resetRound(direction: 1 | -1, label: string) {
    puck.current = {
      x: W / 2,
      y: H / 2 + (Math.random() * 120 - 60),
      vx: 300 * direction,
      vy: (Math.random() * 200 - 100),
    };
    grab.current = null;
    setMessage(label);
  }

  function resetAll() {
    scores.current = { p1: 0, p2: 0 };
    setScore({ p1: 0, p2: 0 });
    winner.current = null;
    elapsed.current = 0;
    left.current = { x: 92, y: H / 2, px: 92, py: H / 2, moving: false };
    right.current = { x: W - 92, y: H / 2, px: W - 92, py: H / 2, moving: false };
    resetRound(Math.random() < 0.5 ? 1 : -1, 'Serviert – wer zuerst sieben Tore hat, gewinnt.');
  }

  useEffect(() => {
    resetAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function goal(scorer: 1 | 2) {
    const next = { ...scores.current };
    if (scorer === 1) next.p1 += 1;
    else next.p2 += 1;
    scores.current = next;
    setScore(next);
    session.setScore(Math.max(next.p1, next.p2));
    if (next.p1 >= 7 || next.p2 >= 7) {
      winner.current = next.p1 >= 7 ? 'Spieler 1' : next.p2 >= 7 ? (isAi ? 'Die KI' : 'Spieler 2') : null;
      sfx.win();
      setMessage(`${winner.current} gewinnt das Spiel ${next.p1}:${next.p2}!`);
      window.setTimeout(() => {
        finishRef.current(Math.max(next.p1, next.p2) * 100 + 400, `${winner.current} gewinnt ${next.p1}:${next.p2}`);
      }, 700);
      return;
    }
    sfx.point();
    setMessage(scorer === 1 ? `Tor für Spieler 1 – ${next.p1}:${next.p2}` : `Tor für ${isAi ? 'die KI' : 'Spieler 2'} – ${next.p1}:${next.p2}`);
    resetRound(scorer === 1 ? -1 : 1, `Anstoß nach dem Treffer · ${next.p1}:${next.p2}`);
  }

  function step(dtMs: number) {
    const dt = Math.min(34, dtMs) / 1000;
    elapsed.current += dtMs;
    const b = puck.current;
    const l = left.current;
    const r = right.current;

    // AI paddle tracks the puck with a human amount of lag
    if (isAi) {
      const targetY = b.x > W / 2 ? b.y : H / 2 + Math.sin(elapsed.current / 700) * 70;
      const targetX = b.x > W / 2 ? Math.min(W - 108, Math.max(W / 2 + 30, b.x + 74)) : W - 120;
      r.px = r.x;
      r.py = r.y;
      r.x += (targetX - r.x) * Math.min(1, dt * 5.5);
      r.y += (targetY - r.y) * Math.min(1, dt * 6.5);
      r.moving = Math.abs(r.x - r.px) + Math.abs(r.y - r.py) > 0.5;
    }
    clampPaddle(l, 'left');
    clampPaddle(r, 'right');

    // distance each paddle really travelled since the last frame — the hit power
    // comes from this, never from a stale saved position
    const ldx = l.x - l.px;
    const ldy = l.y - l.py;
    const rdx = r.x - r.px;
    const rdy = r.y - r.py;

    b.x += b.vx * dt;
    b.y += b.vy * dt;

    // top and bottom rails
    if (b.y - PUCK_R < 8) {
      b.y = 8 + PUCK_R;
      b.vy = Math.abs(b.vy) * 0.94;
      sfx.click();
    }
    if (b.y + PUCK_R > H - 8) {
      b.y = H - 8 - PUCK_R;
      b.vy = -Math.abs(b.vy) * 0.94;
      sfx.click();
    }

    const inGoal = b.y > GOAL_TOP && b.y < GOAL_BOTTOM;

    // side rails, with the two goal mouths
    if (!inGoal) {
      if (b.x - PUCK_R < 8) {
        b.x = 8 + PUCK_R;
        b.vx = Math.abs(b.vx) * 0.94;
        sfx.click();
      }
      if (b.x + PUCK_R > W - 8) {
        b.x = W - 8 - PUCK_R;
        b.vx = -Math.abs(b.vx) * 0.94;
        sfx.click();
      }
    }
    if (b.x + PUCK_R < 0) {
      goal(2);
      return;
    }
    if (b.x - PUCK_R > W) {
      goal(1);
      return;
    }

    // paddle collisions: mostly the front face, occasionally a side surprise
    if (b.x < W / 2 + 40) collide(b, l, 'left', ldx, ldy);
    if (b.x > W / 2 - 40) collide(b, r, 'right', rdx, rdy);

    // keep the puck lively
    if (Math.hypot(b.vx, b.vy) < 160) {
      b.vx *= 1.01;
      b.vy *= 1.01;
    }
    const speed = Math.hypot(b.vx, b.vy);
    if (speed > 1150) {
      b.vx = (b.vx / speed) * 1150;
      b.vy = (b.vy / speed) * 1150;
    }

    l.px = l.x;
    l.py = l.y;
    r.px = r.x;
    r.py = r.y;
  }

  function collide(b: Puck, paddle: Paddle, side: 'left' | 'right', handDx: number, handDy: number) {
    const halfW = PADDLE_W / 2;
    const halfH = PUCK_R + 3;
    const dx = b.x - paddle.x;
    const dy = b.y - paddle.y;
    if (Math.abs(dx) > PUCK_R + halfW || Math.abs(dy) > PUCK_R + halfH) return;
    const dir = side === 'left' ? 1 : -1;
    if (dx * dir > 0) {
      // struck on the face: power and angle follow the hand movement of this frame
      const handSpeed = Math.hypot(handDx, handDy) * 60;
      const power = 470 + Math.min(430, handSpeed * 0.35);
      const angle = Math.max(-0.72, Math.min(0.72, (dy / halfH) * 0.72));
      b.vx = dir * Math.cos(angle) * power;
      b.vy = Math.sin(angle) * power * 0.6 + handDy * 22;
      // push the puck clear of the face so it can never stick inside the paddle
      b.x = paddle.x + dir * (PUCK_R + halfW + 1);
    } else {
      // struck from the side: the puck is knocked back out instead of passing
      b.x = paddle.x + (dx > 0 ? PUCK_R + halfW : -(PUCK_R + halfW));
      b.vx = dx > 0 ? Math.abs(b.vx) * 0.8 : -Math.abs(b.vx) * 0.8;
      b.vy = b.vy * 0.8 + (paddle.y - b.y) * 4;
    }
    b.y = Math.max(10 + PUCK_R, Math.min(H - 10 - PUCK_R, b.y));
    sfx.hit();
  }

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const b = puck.current;
    drawBackdrop(ctx, W, H, 'rgba(37, 99, 235, 0.28)', '#070b16');

    // rink
    ctx.save();
    ctx.strokeStyle = 'rgba(148, 197, 255, 0.35)';
    ctx.lineWidth = 3;
    ctx.strokeRect(8, 8, W - 16, H - 16);
    ctx.beginPath();
    ctx.moveTo(W / 2, 8);
    ctx.lineTo(W / 2, H - 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 70, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // goals
    fillRound(ctx, 0, GOAL_TOP, 14, GOAL_W, 6, 'rgba(74, 222, 128, 0.28)');
    fillRound(ctx, W - 14, GOAL_TOP, 14, GOAL_W, 6, 'rgba(244, 114, 182, 0.28)');

    // paddles (fixed size, never scaled by state)
    drawPaddle(ctx, left.current, '#22d3ee');
    drawPaddle(ctx, right.current, isAi ? '#fb7185' : '#f472b6');

    // puck
    glowCircle(ctx, b.x, b.y, PUCK_R, '#e2e8f0', 12);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.arc(b.x, b.y, PUCK_R * 0.55, 0, Math.PI * 2);
    ctx.fill();

    drawText(ctx, `${score.p1}`, W / 2 - 48, 40, 30, 'rgba(34, 211, 238, 0.9)', 'center', '900');
    drawText(ctx, `${score.p2}`, W / 2 + 48, 40, 30, 'rgba(244, 114, 182, 0.9)', 'center', '900');
    drawText(ctx, 'bis 7', W / 2, 40, 11, 'rgba(203, 213, 225, 0.6)', 'center', '700');
    drawText(ctx, isAi ? 'DU' : 'SPIELER 1', 26, H / 2, 13, 'rgba(34, 211, 238, 0.8)', 'left', '800');
    drawText(ctx, isAi ? 'KI' : 'SPIELER 2', W - 26, H / 2, 13, 'rgba(244, 114, 182, 0.8)', 'right', '800');
  }

  useRafLoop((dt) => {
    if (winner.current) {
      draw();
      return;
    }
    step(dt);
    draw();
  }, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, mode]);

  // keyboard paddles: player 1 is W/S, player 2 (or the AI's stand-in) is ↑/↓
  useKeys({
    active: session.status === 'playing' && !isAi,
    prevent: ['ArrowUp', 'ArrowDown', 'w', 's'],
    down: (key) => {
      if (key === 'w' || key === 'W') left.current.y -= 46;
      if (key === 's' || key === 'S') left.current.y += 46;
      if (key === 'ArrowUp') right.current.y -= 46;
      if (key === 'ArrowDown') right.current.y += 46;
    },
  });

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
          <span className="gstatus">S1 <b>{score.p1}</b></span>
          <span className="gstatus">{isAi ? 'KI' : 'S2'} <b>{score.p2}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          <button
            type="button"
            className={`gbtn ${mode === '2p' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('2p');
              resetAll();
            }}
          >
            👥 2 Spieler
          </button>
          <button
            type="button"
            className={`gbtn ${mode === 'ai' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('ai');
              resetAll();
            }}
          >
            🤖 Gegen KI
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="game-canvas hockey-canvas"
          style={{ maxWidth: W }}
          onPointerDown={(event) => {
            if (session.status !== 'playing' || winner.current || grab.current) return;
            const point = toLogical(event.clientX, event.clientY);
            const side: 'left' | 'right' = point.x < W / 2 ? 'left' : 'right';
            if (side === 'right' && isAi) return;
            const paddle = side === 'left' ? left.current : right.current;
            // grab where the player touched: no jump of the paddle, and never of the puck
            const near = Math.hypot(point.x - paddle.x, point.y - paddle.y) < 110;
            grab.current = {
              hand: side === 'left' ? 0 : 1,
              side,
              dx: near ? paddle.x - point.x : 0,
              dy: near ? paddle.y - point.y : 0,
            };
            paddle.x = point.x + grab.current.dx;
            paddle.y = point.y + grab.current.dy;
            clampPaddle(paddle, side);
            // a click that places the paddle somewhere new must not count as a swing
            paddle.px = paddle.x;
            paddle.py = paddle.y;
            (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
          }}
          onPointerMove={(event) => {
            const current = grab.current;
            if (!current) return;
            const point = toLogical(event.clientX, event.clientY);
            const paddle = current.side === 'left' ? left.current : right.current;
            paddle.x = point.x + current.dx;
            paddle.y = point.y + current.dy;
            clampPaddle(paddle, current.side);
          }}
          onPointerUp={() => {
            grab.current = null;
          }}
          onPointerCancel={() => {
            grab.current = null;
          }}
        />
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

function drawPaddle(ctx: CanvasRenderingContext2D, paddle: Paddle, color: string) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  fillRound(ctx, paddle.x - PADDLE_W / 2, paddle.y - PUCK_R - 3, PADDLE_W, (PUCK_R + 3) * 2, 18, color);
  ctx.restore();
  fillRound(ctx, paddle.x - PADDLE_W / 2 + 8, paddle.y - PUCK_R + 3, PADDLE_W - 16, (PUCK_R - 3) * 2, 12, 'rgba(8, 11, 22, 0.35)');
}

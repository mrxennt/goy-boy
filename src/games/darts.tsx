import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useCanvasSize, useDifficulty, useRafLoop } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { drawBackdrop, drawText, fillRound } from './lib/canvas';

const W = 760;
const H = 560;

const CX = W / 2;
const CY = 268;
const R_BULL = 13;
const R_25 = 29;
const R_TRIPLE_IN = 92;
const R_TRIPLE_OUT = 107;
const R_DOUBLE_IN = 162;
const R_DOUBLE_OUT = 178;

const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];

type Throw = { score: number; double: boolean; ring: string; angle: number; radius: number; at: number };
type Visit = { darts: Throw[]; total: number; bust: boolean; after: number };

function scoring(angle: number, radius: number): { score: number; double: boolean; ring: string } {
  if (radius > R_DOUBLE_OUT) return { score: 0, double: false, ring: 'Daneben' };
  if (radius <= R_BULL) return { score: 50, double: false, ring: 'Bull' };
  if (radius <= R_25) return { score: 25, double: false, ring: '25' };
  // 0 rad points up, segments run clockwise in steps of 18°
  const step = Math.PI / 10;
  const fromTop = (angle + Math.PI / 2 + step / 2 + Math.PI * 2) % (Math.PI * 2);
  const index = Math.floor(fromTop / step) % 20;
  const base = SEGMENTS[index];
  if (radius >= R_TRIPLE_IN && radius <= R_TRIPLE_OUT) return { score: base * 3, double: false, ring: 'Triple' };
  if (radius >= R_DOUBLE_IN && radius <= R_DOUBLE_OUT) return { score: base * 2, double: true, ring: 'Double' };
  return { score: base, double: false, ring: 'Single' };
}

export default function Darts({ session, game }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useCanvasSize(canvasRef, W, H);
  const [mode, setMode] = useDifficulty('darts', 'solo');
  const [ui, setUi] = useState({
    remaining: [501, 501],
    turn: 0,
    dartsLeft: 3,
    visit: [] as Visit[],
    message: 'Auf die Scheibe tippen oder klicken. Schluss ist auf einem Doppel.',
    last: null as Throw | null,
  });
  const remaining = useRef<[number, number]>([501, 501]);
  const turn = useRef(0);
  const throwLeft = useRef(3);
  const visitStart = useRef(501);
  const allDarts = useRef<Throw[]>([]);
  const over = useRef(false);
  const aiTimer = useRef(0);
  const throwsThisVisit = useRef<Throw[]>([]);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const isAi = mode === 'ai';

  function resetGame() {
    remaining.current = [501, 501];
    turn.current = 0;
    throwLeft.current = 3;
    visitStart.current = 501;
    allDarts.current = [];
    throwsThisVisit.current = [];
    over.current = false;
    aiTimer.current = 0;
    setUi({
      remaining: [501, 501],
      turn: 0,
      dartsLeft: 3,
      visit: [],
      message: 'Auf die Scheibe tippen oder klicken. Schluss ist auf einem Doppel.',
      last: null,
    });
  }

  useEffect(() => {
    resetGame();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  function endVisit(before: number, after: number, bust: boolean, darts: Throw[]): Visit {
    return { darts, total: bust ? 0 : before - after, bust, after };
  }

  function throwAt(angle: number, radius: number) {
    if (over.current || session.status !== 'playing') return;
    if (isAi && turn.current === 1) return;
    const hit = scoring(angle, radius);
    const player = turn.current;
    const board = [...remaining.current];
    const before = board[player];
    const next = before - hit.score;
    const bust = next < 0 || next === 1 || (next === 0 && !hit.double);
    throwLeft.current -= 1;
    allDarts.current.push({ ...hit, angle, radius, at: performance.now() });
    throwsThisVisit.current.push({ ...hit, angle, radius, at: performance.now() });

    if (bust) sfx.error();
    else if (hit.score >= 40) sfx.win();
    else if (hit.score > 0) sfx.point();
    else sfx.click();

    if (!bust) {
      board[player] = next;
      remaining.current = [board[0], board[1]];
    } else {
      board[player] = before;
    }

    if (next === 0 && !bust) {
      over.current = true;
      const winner = player === 0 ? 'Du' : isAi ? 'Die KI' : 'Spieler 2';
      const dartsUsed = throwsThisVisit.current.length;
      setUi((value) => ({
        ...value,
        remaining: [board[0], board[1]],
        last: { ...hit, angle, radius, at: performance.now() },
        message: `${winner} checkt aus! ${dartsUsed} Darts im letzten Aufruf.`,
      }));
      sfx.win();
      window.setTimeout(() => finishRef.current(1200 - allDarts.current.length * 25, `${winner} gewinnt 501`), 800);
      return;
    }

    const visitDone = throwLeft.current <= 0 || bust;
    if (visitDone) {
      const visit = endVisit(before, board[player], bust, throwsThisVisit.current);
      const remainingAfter = [board[0], board[1]];
      turn.current = player === 0 ? 1 : 0;
      throwLeft.current = 3;
      throwsThisVisit.current = [];
      visitStart.current = remainingAfter[turn.current];
      setUi((value) => ({
        ...value,
        remaining: remainingAfter,
        turn: turn.current,
        dartsLeft: 3,
        visit: [visit, ...value.visit].slice(0, 8),
        last: { ...hit, angle, radius, at: performance.now() },
        message: bust
          ? `Bust! ${before} bleiben stehen, ${turn.current === 0 ? 'du bist' : 'der nächste ist'} dran.`
          : visit.total > 0
            ? `${visit.total} in diesem Aufruf · ${remainingAfter[turn.current]} übrig für ${turn.current === 0 ? 'dich' : isAi ? 'die KI' : 'Spieler 2'}.`
            : 'Kein Treffer – nächster Aufruf.',
      }));
      session.setScore(Math.max(0, 501 - Math.min(board[0], board[1])));
      return;
    }

    setUi((value) => ({
      ...value,
      remaining: [board[0], board[1]],
      dartsLeft: throwLeft.current,
      last: { ...hit, angle, radius, at: performance.now() },
      message:
        hit.score === 0
          ? 'Daneben – nächster Dart.'
          : `${hit.score}${hit.ring === 'Triple' ? ' (Triple)' : hit.ring === 'Double' ? ' (Double)' : hit.ring === 'Bull' ? ' – Bull!' : ''} · ${board[player]} übrig.`,
    }));
    session.setScore(Math.max(0, 501 - Math.min(board[0], board[1])));
  }

  function aiThrow() {
    const left = remaining.current[1];
    const step = Math.PI / 10;
    const aimSegment = (segment: number, spread: number) => -Math.PI / 2 + SEGMENTS.indexOf(segment) * step + (Math.random() - 0.5) * spread;
    let angle: number;
    let radius: number;
    if (left > 60) {
      // big scores: triple twenty
      angle = aimSegment(20, 0.1);
      radius = (R_TRIPLE_IN + R_TRIPLE_OUT) / 2 + (Math.random() - 0.5) * 24;
    } else if (left <= 40 && left % 2 === 0) {
      // checkout attempt on a double
      angle = aimSegment(left / 2, 0.09);
      radius = (R_DOUBLE_IN + R_DOUBLE_OUT) / 2 + (Math.random() - 0.5) * 16;
    } else {
      // leave an even number below 41 for the next dart
      const segment = [20, 19, 18, 16, 12].find((value) => left - value <= 40 && (left - value) % 2 === 0) ?? 10;
      angle = aimSegment(segment, 0.12);
      radius = left <= 40 ? (R_TRIPLE_OUT + R_DOUBLE_IN) / 2 : (R_TRIPLE_IN + R_TRIPLE_OUT) / 2 - (left <= 40 ? 0 : 30);
    }
    throwAt(angle, radius);
  }

  useRafLoop((dt) => {
    if (!isAi || over.current || turn.current !== 1) {
      aiTimer.current = 0;
      return;
    }
    aiTimer.current += dt;
    if (aiTimer.current > 900 + Math.random() * 500) {
      aiTimer.current = -100000; // wait for the state update to land
      aiThrow();
    }
  }, session.status === 'playing' && isAi);

  function draw() {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawBackdrop(ctx, W, H, 'rgba(15, 23, 42, 0.5)', '#060810');
    // fixed-size board: the geometry never depends on game state
    ctx.save();
    ctx.translate(CX, CY);
    const rings: { from: number; to: number; color: string }[] = [
      { from: R_TRIPLE_OUT, to: R_DOUBLE_IN, color: '#141a2c' },
      { from: R_TRIPLE_IN, to: R_TRIPLE_OUT, color: '#0f1424' },
      { from: R_DOUBLE_IN, to: R_DOUBLE_OUT, color: '#0f1424' },
      { from: R_25, to: R_TRIPLE_IN, color: '#0f1424' },
    ];
    rings.forEach((ring) => {
      ctx.beginPath();
      ctx.arc(0, 0, ring.to, 0, Math.PI * 2);
      ctx.arc(0, 0, ring.from, 0, Math.PI * 2, true);
      ctx.fillStyle = ring.color;
      ctx.fill();
    });
    const step = Math.PI / 10;
    for (let i = 0; i < 20; i += 1) {
      const start = -Math.PI / 2 - step / 2 + i * step;
      const end = start + step;
      const isEven = i % 2 === 0;
      // pie slices, alternating
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R_DOUBLE_OUT, start, end);
      ctx.closePath();
      ctx.fillStyle = isEven ? '#1b2338' : '#e2e8f0';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R_DOUBLE_IN, start, end);
      ctx.closePath();
      ctx.fillStyle = isEven ? '#1b2338' : '#e2e8f0';
      ctx.fill();
      // number labels
      const labelAngle = start + step / 2;
      drawText(
        ctx,
        String(SEGMENTS[i]),
        Math.cos(labelAngle) * (R_DOUBLE_OUT + 20),
        Math.sin(labelAngle) * (R_DOUBLE_OUT + 20) + 4,
        13,
        'rgba(226, 232, 240, 0.75)',
        'center',
        '800',
      );
    }
    // doubles and triples: red/green bands over the black/cream sectors
    for (let i = 0; i < 20; i += 1) {
      const start = -Math.PI / 2 - step / 2 + i * step;
      const end = start + step;
      const isEven = i % 2 === 0;
      const band = isEven ? '#166534' : '#b91c1c';
      ctx.beginPath();
      ctx.arc(0, 0, R_DOUBLE_OUT, start, end);
      ctx.arc(0, 0, R_DOUBLE_IN, start, end, true);
      ctx.closePath();
      ctx.fillStyle = band;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R_TRIPLE_OUT, start, end);
      ctx.arc(0, 0, R_TRIPLE_IN, start, end, true);
      ctx.closePath();
      ctx.fill();
    }
    // bull
    ctx.beginPath();
    ctx.arc(0, 0, R_25, 0, Math.PI * 2);
    ctx.fillStyle = '#166534';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R_BULL, 0, Math.PI * 2);
    ctx.fillStyle = '#b91c1c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, R_DOUBLE_OUT, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // darts in the board stay where they hit
    allDarts.current.forEach((dart) => {
      ctx.save();
      ctx.translate(Math.cos(dart.angle) * dart.radius, Math.sin(dart.angle) * dart.radius);
      ctx.rotate(dart.angle + Math.PI / 2);
      fillRound(ctx, -2, 0, 4, 22, 2, '#cbd5e1');
      fillRound(ctx, -5, -10, 10, 12, 3, '#f472b6');
      ctx.restore();
    });
    ctx.restore();

    const active = turn.current;
    drawText(ctx, '501', 26, 30, 15, 'rgba(148, 163, 184, 0.9)', 'left', '800');
    drawText(ctx, `${ui.remaining[0]}`, 26, 62, 30, active === 0 ? '#67e8f9' : '#cbd5e1', 'left', '900');
    drawText(ctx, isAi ? 'KI' : 'S2', W - 26, 30, 15, 'rgba(148, 163, 184, 0.9)', 'right', '800');
    drawText(ctx, `${ui.remaining[1]}`, W - 26, 62, 30, active === 1 ? '#f9a8d4' : '#cbd5e1', 'right', '900');

    // visit history always uses six rows, so the panel cannot grow mid-game
    drawText(ctx, 'LETZTE AUFRUFE', 60, 402, 10, 'rgba(148, 163, 184, 0.7)', 'left', '800');
    drawText(ctx, 'REST', 258, 402, 10, 'rgba(148, 163, 184, 0.7)', 'right', '800');
    for (let i = 0; i < 6; i += 1) {
      const entry = ui.visit[i];
      const y = 428 + i * 21;
      fillRound(ctx, 54, y - 10, 210, 19, 6, i % 2 ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.06)');
      drawText(ctx, entry ? (entry.bust ? 'Bust' : `${entry.total}`) : '–', 64, y, 11, entry?.bust ? '#fca5a5' : '#e2e8f0', 'left', '800');
      drawText(ctx, entry ? `${entry.after}` : '', 258, y, 10, 'rgba(148, 163, 184, 0.8)', 'right', '700');
    }

    drawText(ctx, `Darts übrig: ${ui.dartsLeft}`, W - 60, 380, 13, '#e2e8f0', 'right', '800');
    if (ui.last) {
      drawText(
        ctx,
        ui.last.score ? `${ui.last.ring} · ${ui.last.score}` : 'Daneben',
        W - 60,
        406,
        12,
        ui.last.score ? '#a5b4fc' : '#94a3b8',
        'right',
        '700',
      );
    }
  }

  useRafLoop(draw, session.status === 'playing');

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, mode]);

  const throwFromPointer = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * W;
    const y = ((clientY - rect.top) / rect.height) * H;
    const dx = x - CX;
    const dy = y - CY;
    const radius = Math.hypot(dx, dy) * (1 + Math.random() * 0.06);
    const angle = Math.atan2(dy, dx) + (Math.random() - 0.5) * 0.08;
    throwAt(angle, Math.min(R_DOUBLE_OUT + 30, radius));
  };

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Du <b>{ui.remaining[0]}</b></span>
          <span className="gstatus">{isAi ? 'KI' : 'S2'} <b>{ui.remaining[1]}</b></span>
          <span className="gstatus">Darts <b>{ui.dartsLeft}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          <button
            type="button"
            className={`gbtn ${mode === 'solo' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('solo');
              resetGame();
            }}
          >
            🎯 Solo 501
          </button>
          <button
            type="button"
            className={`gbtn ${mode === 'ai' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('ai');
              resetGame();
            }}
          >
            🤖 Gegen KI
          </button>
          <button
            type="button"
            className={`gbtn ${mode === '2p' ? 'is-active' : ''}`}
            onClick={() => {
              setMode('2p');
              resetGame();
            }}
          >
            👥 2 Spieler
          </button>
        </div>
        <canvas
          ref={canvasRef}
          className="game-canvas darts-canvas"
          style={{ maxWidth: W }}
          onPointerDown={(event) => throwFromPointer(event.clientX, event.clientY)}
        />
        <p className="game-hint">{ui.message}</p>
      </div>
    </GameStage>
  );
}

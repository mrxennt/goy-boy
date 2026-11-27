import { useCallback, useEffect, useRef, useState } from 'react';
import { getBest, recordScore, startPlay, addPlayTime, useAppState } from './store';
import { sfx } from './sound';

export type GameStatus = 'idle' | 'playing' | 'paused' | 'over';
export type GameResult = { score: number; isRecord: boolean } | null;

/** Runs a requestAnimationFrame loop only while `active` is true. */
export function useRafLoop(callback: (dt: number, time: number) => void, active: boolean) {
  const cbRef = useRef(callback);
  cbRef.current = callback;
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      cbRef.current(dt, now);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active]);
}

type KeyHandlers = {
  down?: (key: string, event: KeyboardEvent) => void;
  up?: (key: string, event: KeyboardEvent) => void;
  active?: boolean;
  prevent?: string[];
};

export function useKeys({ down, up, active = true, prevent = [] }: KeyHandlers) {
  const downRef = useRef(down);
  const upRef = useRef(up);
  downRef.current = down;
  upRef.current = up;
  const preventKey = prevent.join('|');
  useEffect(() => {
    if (!active) return;
    const blocked = preventKey ? preventKey.split('|') : [];
    const onDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (blocked.includes(event.key)) event.preventDefault();
      downRef.current?.(event.key, event);
    };
    const onUp = (event: KeyboardEvent) => {
      upRef.current?.(event.key, event);
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [active, preventKey]);
}

export function useCanvasSize(ref: React.RefObject<HTMLCanvasElement>, logicalWidth: number, logicalHeight: number) {
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = logicalWidth * dpr;
    canvas.height = logicalHeight * dpr;
    const ctx = canvas.getContext('2d');
    ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  }, [ref, logicalWidth, logicalHeight]);
}

/** Shared session/score/achievement plumbing for every game. */
export function useGame(gameId: string) {
  const app = useAppState();
  const best = app.records[gameId]?.best ?? 0;
  const [status, setStatus] = useState<GameStatus>('idle');
  const [score, setScore] = useState(0);
  const [result, setResult] = useState<GameResult>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [run, setRun] = useState(1);
  const started = useRef(false);

  useEffect(() => {
    if (status !== 'playing') return;
    const startedAt = performance.now();
    return () => {
      addPlayTime(gameId, performance.now() - startedAt);
    };
  }, [status, gameId]);

  const start = useCallback(() => {
    if (!started.current) {
      started.current = true;
      startPlay(gameId);
    }
    sfx.start();
    setScore(0);
    setResult(null);
    setOutcome(null);
    setRun((r) => r + 1);
    setStatus('playing');
  }, [gameId]);

  const pause = useCallback(() => setStatus((s) => (s === 'playing' ? 'paused' : s)), []);
  const resume = useCallback(() => setStatus((s) => (s === 'paused' ? 'playing' : s)), []);

  const restart = useCallback(() => {
    if (!started.current) {
      started.current = true;
      startPlay(gameId);
    }
    setScore(0);
    setResult(null);
    setOutcome(null);
    setRun((r) => r + 1);
    setStatus('playing');
    sfx.click();
  }, [gameId]);

  const finish = useCallback(
    (finalScore: number, label?: string) => {
      const previousBest = getBest(gameId);
      const { isRecord } = recordScore(gameId, Math.max(0, Math.round(finalScore)));
      setScore(Math.max(0, Math.round(finalScore)));
      setOutcome(label ?? null);
      setResult({ score: Math.max(0, Math.round(finalScore)), isRecord: isRecord && finalScore > previousBest });
      setStatus('over');
      sfx.lose();
    },
    [gameId],
  );

  return {
    status,
    score,
    setScore,
    best,
    result,
    outcome,
    run,
    start,
    pause,
    resume,
    restart,
    finish,
  };
}

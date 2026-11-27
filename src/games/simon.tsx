import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

const PADS = [
  { id: 0, label: '▲', freq: 329.63, color: 'simon-green' },
  { id: 1, label: '◀', freq: 261.63, color: 'simon-red' },
  { id: 2, label: '▶', freq: 392.0, color: 'simon-blue' },
  { id: 3, label: '▼', freq: 523.25, color: 'simon-yellow' },
];

const KEYS: Record<string, number> = { ArrowUp: 0, w: 0, ArrowLeft: 1, a: 1, ArrowRight: 2, d: 2, ArrowDown: 3, s: 3 };

export default function Simon({ session, game }: GameProps) {
  const [sequence, setSequence] = useState<number[]>([]);
  const [flash, setFlash] = useState<number | null>(null);
  const [phase, setPhase] = useState<'idle' | 'show' | 'input' | 'wrong'>('idle');
  const [cursor, setCursor] = useState(0);
  const [best, setBest] = useState(0);
  const [message, setMessage] = useState('Merke dir die Reihenfolge. Jede Runde kommt ein Schritt dazu.');
  const timers = useRef<number[]>([]);
  const sequenceRef = useRef<number[]>([]);
  const cursorRef = useRef(0);
  const phaseRef = useRef<'idle' | 'show' | 'input' | 'wrong'>('idle');
  const bestRef = useRef(0);
  sequenceRef.current = sequence;
  cursorRef.current = cursor;
  phaseRef.current = phase;
  bestRef.current = best;

  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timers.current.push(id);
    return id;
  };
  const clearTimers = () => {
    timers.current.forEach((id) => window.clearTimeout(id));
    timers.current = [];
  };
  useEffect(() => () => clearTimers(), []);

  function playStep(index: number) {
    const step = sequenceRef.current[index];
    setFlash(step);
    sfx.play(step === 0 ? 'pick' : step === 1 ? 'point' : step === 2 ? 'hover' : 'level');
    later(() => setFlash(null), 260);
    if (index < sequenceRef.current.length - 1) later(() => playStep(index + 1), 420);
    else later(() => setPhase('input'), 260);
  }

  function startRound(seq: number[]) {
    clearTimers();
    sequenceRef.current = seq;
    setSequence(seq);
    setCursor(0);
    setPhase('show');
    setMessage(`Runde ${seq.length}: sieh genau hin …`);
    later(() => playStep(0), 500);
  }

  function nextRound(current: number[]) {
    const step = Math.floor(Math.random() * 4);
    startRound([...current, step]);
  }

  function begin() {
    setBest(0);
    setFlash(null);
    startRound([Math.floor(Math.random() * 4)]);
  }

  function fail(seqLength: number) {
    clearTimers();
    setPhase('wrong');
    sfx.error();
    const reached = Math.max(0, seqLength - 1);
    setMessage(`Falsch! Du hast ${reached} Schritt${reached === 1 ? '' : 'e'} geschafft.`);
    later(() => {
      sfx.lose();
      session.finish(reached * 50, `${reached} Schritte gemerkt`);
    }, 700);
  }

  function tap(pad: number) {
    if (phaseRef.current !== 'input' || session.status !== 'playing') return;
    setFlash(pad);
    sfx.play(pad === 0 ? 'pick' : pad === 1 ? 'point' : pad === 2 ? 'hover' : 'level');
    later(() => setFlash(null), 180);
    const expected = sequenceRef.current[cursorRef.current];
    if (pad !== expected) {
      fail(sequenceRef.current.length);
      return;
    }
    const nextCursor = cursorRef.current + 1;
    setCursor(nextCursor);
    if (nextCursor >= sequenceRef.current.length) {
      const reached = sequenceRef.current.length;
      setBest((value) => Math.max(value, reached));
      setPhase('show');
      session.setScore(reached * 50);
      setMessage(`Richtig! ${reached} Schritt${reached === 1 ? '' : 'e'} – noch einer mehr.`);
      later(() => nextRound(sequenceRef.current), 620);
    }
  }

  useEffect(() => {
    clearTimers();
    setSequence([]);
    setCursor(0);
    setBest(0);
    setFlash(null);
    setPhase('idle');
    setMessage('Merke dir die Reihenfolge. Jede Runde kommt ein Schritt dazu.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const pad = KEYS[event.key] ?? KEYS[event.key.toLowerCase()];
      if (pad === undefined) return;
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      tap(pad);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Runde <b>{Math.max(0, sequence.length - 1)}</b></span>
          <span className="gstatus">Best <b>{best}</b></span>
          <span className="gstatus">{phase === 'input' ? 'Du bist dran' : phase === 'show' ? 'Schau hin' : phase === 'wrong' ? 'Falsch' : 'Bereit'}</span>
        </>
      }
    >
      <div className="game-wrap">
        <div className={`simon ${phase === 'wrong' ? 'is-wrong' : ''}`}>
          <div className="simon-grid">
            {PADS.map((pad) => (
              <button
                key={pad.id}
                type="button"
                className={`simon-pad ${pad.color} ${flash === pad.id ? 'is-flash' : ''}`}
                onClick={() => tap(pad.id)}
                aria-label={`Feld ${pad.label}`}
              >
                <span aria-hidden>{pad.label}</span>
              </button>
            ))}
            <div className="simon-center">
              {phase === 'idle' ? (
                <button type="button" className="btn btn-primary btn-sm" onClick={begin}>
                  Start
                </button>
              ) : (
                <b>{Math.max(0, sequence.length - 1)}</b>
              )}
            </div>
          </div>
        </div>
        <p className="game-hint">{message} Tasten: ↑ ← → ↓ oder W A D S.</p>
      </div>
    </GameStage>
  );
}

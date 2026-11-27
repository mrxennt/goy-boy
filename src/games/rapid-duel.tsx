import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

/** One-minute micro duels: five puzzles in a row, tap the answer. */

type Round = {
  prompt: string;
  options: string[];
  answer: string;
  kind: string;
};

const ROUNDS: ((level: number) => Round)[] = [
  // biggest number wins
  (level) => {
    const max = level < 2 ? 20 : level < 4 ? 60 : 400;
    const numbers = Array.from({ length: 4 }, () => 1 + Math.floor(Math.random() * max));
    return { prompt: 'Welche Zahl ist am größten?', options: numbers.map(String), answer: String(Math.max(...numbers)), kind: 'Vergleichen' };
  },
  // count the dots, shown as a fixed-length dot row
  (level) => {
    const count = 3 + Math.floor(Math.random() * Math.min(9, 3 + level * 2));
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const candidate = Math.max(1, count + (Math.floor(Math.random() * 5) - 2));
      if (candidate !== count) wrong.add(candidate);
    }
    const options = [String(count), ...Array.from(wrong).map(String)];
    return { prompt: `Wie viele Punkte?  ${'● '.repeat(count).trim()}`, options: shuffle(options), answer: String(count), kind: 'Zählen' };
  },
  // name the colour of the word, not the word (Stroop)
  (level) => {
    const colors = [
      { name: 'Rot', hex: '#ef4444' },
      { name: 'Grün', hex: '#22c55e' },
      { name: 'Blau', hex: '#3b82f6' },
      { name: 'Gelb', hex: '#eab308' },
    ];
    const pick = colors[Math.floor(Math.random() * colors.length)];
    const others = colors.filter((color) => color.name !== pick.name).map((color) => color.name);
    const word = level > 2 && Math.random() < 0.7 ? colors.filter((color) => color.name !== pick.name)[0].name : pick.name;
    return { prompt: `In welcher Farbe steht „${word}"?`, options: shuffle([pick.name, ...others.slice(0, 3)]), answer: pick.name, kind: 'Farbe', };
  },
  // mental arithmetic
  (level) => {
    const a = 2 + Math.floor(Math.random() * (level < 2 ? 8 : 18));
    const b = 2 + Math.floor(Math.random() * (level < 2 ? 8 : 14));
    const plus = Math.random() < 0.6;
    const answer = plus ? a + b : Math.max(a, b) - Math.min(a, b);
    const wrong = new Set<number>();
    while (wrong.size < 3) {
      const candidate = answer + (Math.floor(Math.random() * 7) - 3);
      if (candidate !== answer && candidate > 0) wrong.add(candidate);
    }
    return {
      prompt: plus ? `${a} + ${b} = ?` : `${Math.max(a, b)} − ${Math.min(a, b)} = ?`,
      options: shuffle([String(answer), ...Array.from(wrong).map(String)]),
      answer: String(answer),
      kind: 'Rechnen',
    };
  },
  // only one of these is a real German word
  () => {
    const pairs = [
      ['Haus', 'Huas', 'Hauss', 'Hasu'],
      ['Tisch', 'Tisxh', 'Tishc', 'Tisc'],
      ['Wolke', 'Wolge', 'Wloke', 'Wolke'],
      ['Apfel', 'Affel', 'Apfl', 'Appel'],
      ['Sonne', 'Sone', 'Sonnen', 'Sohne'],
      ['Fenster', 'Fentser', 'Fenstr', 'Fenster'],
    ];
    const entry = pairs[Math.floor(Math.random() * pairs.length)];
    // randomise which decoy spelling is shown around the real word
    const wrong = shuffle(entry.slice(1)).slice(0, 3).map((word) => (word === entry[0] ? word + 'x' : word));
    return { prompt: 'Welches Wort ist richtig geschrieben?', options: shuffle([entry[0], ...wrong]), answer: entry[0], kind: 'Rechtschreibung' };
  },
];

function shuffle<T>(items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

const POINTS_PER_ROUND = 100;

export default function RapidDuel({ session, game }: GameProps) {
  const [roundIndex, setRoundIndex] = useState(0);
  const [round, setRound] = useState<Round>(() => ROUNDS[0](0));
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [turn, setTurn] = useState<1 | 2>(1);
  const [timeLeft, setTimeLeft] = useState(90);
  const [message, setMessage] = useState('Spieler 1 beginnt. Tippt die richtige Antwort an.');
  const [flash, setFlash] = useState<'ok' | 'bad' | null>(null);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;
  const over = useRef(false);
  /* one answer per round: a double tap must not count twice */
  const locked = useRef(false);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  function newRound(index: number, difficulty: number) {
    const kind = index % ROUNDS.length;
    setRound(ROUNDS[kind](difficulty));
  }

  useEffect(() => {
    over.current = false;
    locked.current = false;
    setScores({ p1: 0, p2: 0 });
    scoresRef.current = { p1: 0, p2: 0 };
    setRoundIndex(0);
    setTimeLeft(90);
    setTurn(1);
    setFlash(null);
    newRound(0, 0);
    setMessage('Spieler 1 beginnt. Tippt die richtige Antwort an.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run]);

  useEffect(() => {
    if (session.status !== 'playing' || over.current) return;
    const timer = window.setInterval(() => {
      setTimeLeft((value) => {
        if (value <= 1) {
          window.clearInterval(timer);
          over.current = true;
          const current = scoresRef.current;
          const label =
            current.p1 === current.p2
              ? `Unentschieden ${current.p1}:${current.p2}`
              : current.p1 > current.p2
                ? `Spieler 1 gewinnt ${current.p1}:${current.p2}`
                : `Spieler 2 gewinnt ${current.p2}:${current.p1}`;
          setMessage(`Zeit! ${label}`);
          if (current.p1 === current.p2) sfx.lose();
          else sfx.win();
          window.setTimeout(() => finishRef.current(Math.max(current.p1, current.p2), label), 600);
          return 0;
        }
        return value - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [session.status]);

  function answer(option: string) {
    if (over.current || locked.current || session.status !== 'playing') return;
    locked.current = true;
    const correct = option === round.answer;
    if (correct) {
      sfx.point();
      const next = { ...scoresRef.current };
      if (turn === 1) next.p1 += POINTS_PER_ROUND;
      else next.p2 += POINTS_PER_ROUND;
      scoresRef.current = next;
      setScores(next);
      session.setScore(Math.max(next.p1, next.p2));
      setFlash('ok');
      setMessage(`Richtig für Spieler ${turn}!`);
      const nextIndex = roundIndex + 1;
      const difficulty = Math.floor(nextIndex / 3);
      window.setTimeout(() => {
        setRoundIndex(nextIndex);
        newRound(nextIndex, difficulty);
        setFlash(null);
        setMessage(`Spieler ${turn === 1 ? 2 : 1} ist dran.`);
        setTurn(turn === 1 ? 2 : 1);
        locked.current = false;
      }, 500);
    } else {
      sfx.error();
      setFlash('bad');
      setMessage(`Falsch – die Antwort wäre „${round.answer}". Spieler ${turn === 1 ? 2 : 1} ist dran.`);
      window.setTimeout(() => {
        setFlash(null);
        setTurn(turn === 1 ? 2 : 1);
        locked.current = false;
      }, 520);
    }
  }

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: flash === 'ok' && turn === 1 ? '#86efac' : '#f472b6' }}>S1 <b>{scores.p1}</b></span>
          <span className="gstatus" style={{ color: flash === 'ok' && turn === 2 ? '#86efac' : '#38bdf8' }}>S2 <b>{scores.p2}</b></span>
          <span className={`gstatus ${timeLeft <= 15 ? 'warn' : ''}`}>⏱ <b>{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</b></span>
        </>
      }
    >
      <div className={`rapid ${flash === 'ok' ? 'is-ok' : flash === 'bad' ? 'is-bad' : ''}`}>
        <p className="rapid-kicker">
          {round.kind} · Spieler {turn} · Runde {roundIndex + 1}
        </p>
        <p className="rapid-prompt">{round.prompt}</p>
        <div className="rapid-options">
          {round.options.map((option) => (
            <button key={option} type="button" className="rapid-option" onClick={() => answer(option)}>
              {option}
            </button>
          ))}
        </div>
        <p className="rapid-message">{message}</p>
      </div>
      <p className="game-hint" style={{ marginTop: 10 }}>
        90 Sekunden, abwechselnd · richtige Antwort = 100 Punkte, danach ist der andere dran.
      </p>
    </GameStage>
  );
}

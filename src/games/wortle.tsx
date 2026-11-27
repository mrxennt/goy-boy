import { useEffect, useMemo, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useKeys } from '../lib/hooks';
import { sfx } from '../lib/sound';
import { choice } from '../lib/utils';
import type { GameProps } from './types';

type Mark = 'correct' | 'present' | 'absent';
type Guess = { word: string; marks: Mark[] };

const WORDS = [
  'APFEL', 'BAUER', 'BAUCH', 'BAUEN', 'BIRNE', 'BLUME', 'BODEN', 'BRAND', 'BRUST', 'BRIEF',
  'DACHS', 'DECKE', 'DICKE', 'DRECK', 'DRUCK', 'DUNST', 'DURST', 'EIMER', 'EISEN', 'ENDET',
  'ENGEL', 'ERBSE', 'ERDEN', 'ESSEN', 'FADEN', 'FARBE', 'FAUST', 'FEDER', 'FEUER', 'FISCH',
  'FLUSS', 'FOLGE', 'FORST', 'FRAGE', 'FREMD', 'FROST', 'FUCHS', 'GABEL', 'GEHEN', 'GEIST',
  'GLATT', 'GROSS', 'GRUFT', 'GRUND', 'GURKE', 'HAFEN', 'HALDE', 'HALLE', 'HALLO', 'HEBEL',
  'HEFTE', 'HEIDE', 'HEISS', 'HILFE', 'HIRSE', 'HOFFE', 'HONIG', 'HORDE', 'INSEL', 'JACKE',
  'JAGEN', 'JUNGE', 'JUWEL', 'KAMEL', 'KAMIN', 'KAMPF', 'KANAL', 'KANTE', 'KARTE', 'KASSE',
  'KATZE', 'KAUEN', 'KERZE', 'KETTE', 'KISTE', 'KLEID', 'KLEIN', 'KRAFT', 'KRANK', 'KREIS',
  'KREUZ', 'KRIEG', 'KRONE', 'KUGEL', 'KUNST', 'KURVE', 'LAGER', 'LAMPE', 'LAUNE', 'LEBEN',
  'LEERE', 'LEHRE', 'LEISE', 'LICHT', 'LINIE', 'LINKS', 'LISTE', 'MACHT', 'MAGEN', 'MAUER',
  'MEILE', 'MESSE', 'MILCH', 'MINZE', 'MITTE', 'MUTIG', 'NACHT', 'NAGEL', 'NARBE', 'NEBEL',
  'NEFFE', 'NICHT', 'NIERE', 'NOTIZ', 'OFFEN', 'ONKEL', 'ORDEN', 'PANNE', 'PARTY', 'PAUSE',
  'PFEIL', 'PFERD', 'PISTE', 'PLATZ', 'PREIS', 'PROBE', 'PUPPE', 'QUARK', 'RADIO', 'REGEN',
  'REIHE', 'REISE', 'ROSEN', 'RUNDE', 'SACHE', 'SAMEN', 'SAUER', 'SCHAF', 'SCHAL', 'SEELE',
  'SEIFE', 'SEITE', 'SEGEL', 'SEHEN', 'SONNE', 'SORGE', 'SPIEL', 'SPORT', 'STADT', 'STARK',
  'STEIN', 'STERN', 'STOFF', 'STOLZ', 'STROM', 'SUMME', 'SUPPE', 'TAFEL', 'TANTE', 'TASSE',
  'TASTE', 'TEICH', 'TIGER', 'TINTE', 'TISCH', 'TORTE', 'TRAUM', 'TREUE', 'UNTEN', 'VATER',
  'VOGEL', 'VORNE', 'WACHS', 'WAGEN', 'WEILE', 'WEISE', 'WEISS', 'WELLE', 'WESEN', 'WIESE',
  'WOCHE', 'WOLKE', 'WORTE', 'ZIEGE', 'ZIRKUS',
];

const VALID = new Set(WORDS);
const KEYS = ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'];

function evaluate(guess: string, target: string): Mark[] {
  const marks: Mark[] = Array(5).fill('absent');
  const pool: (string | null)[] = target.split('');
  for (let i = 0; i < 5; i += 1) {
    if (guess[i] === target[i]) {
      marks[i] = 'correct';
      pool[i] = null;
    }
  }
  for (let i = 0; i < 5; i += 1) {
    if (marks[i] === 'correct') continue;
    const found = pool.indexOf(guess[i]);
    if (found >= 0) {
      marks[i] = 'present';
      pool[found] = null;
    }
  }
  return marks;
}

export default function Wortle({ session, game }: GameProps) {
  const [target, setTarget] = useState(() => choice(WORDS));
  const [guesses, setGuesses] = useState<Guess[]>([]);
  const [current, setCurrent] = useState('');
  const [note, setNote] = useState('Errate das 5-Buchstaben-Wort in sechs Versuchen.');
  const [done, setDone] = useState(false);

  useEffect(() => {
    setTarget(choice(WORDS));
    setGuesses([]);
    setCurrent('');
    setDone(false);
    setNote('Errate das 5-Buchstaben-Wort in sechs Versuchen.');
  }, [session.run]);

  const letterState = useMemo(() => {
    const map = new Map<string, Mark>();
    const priority: Record<Mark, number> = { absent: 1, present: 2, correct: 3 };
    for (const guess of guesses) {
      guess.word.split('').forEach((letter, index) => {
        const mark = guess.marks[index];
        const existing = map.get(letter);
        if (!existing || priority[mark] > priority[existing]) map.set(letter, mark);
      });
    }
    return map;
  }, [guesses]);

  function submit() {
    if (done || session.status !== 'playing') return;
    if (current.length < 5) {
      setNote('Es fehlen noch Buchstaben.');
      sfx.error();
      return;
    }
    if (!VALID.has(current)) {
      setNote('Dieses Wort kennt die Liste nicht. Versuch ein anderes.');
      sfx.error();
      return;
    }
    const marks = evaluate(current, target);
    const next = [...guesses, { word: current, marks }];
    setGuesses(next);
    setCurrent('');
    if (current === target) {
      setDone(true);
      setNote(`Richtig! ${target} in ${next.length} Versuchen.`);
      sfx.win();
      session.finish((7 - next.length) * 100, `Gelöst in ${next.length}/6`);
    } else if (next.length >= 6) {
      setDone(true);
      setNote(`Schade – das Wort war ${target}.`);
      sfx.lose();
      session.finish(0, `Das Wort war ${target}`);
    } else {
      setNote(next.length === 5 ? 'Letzter Versuch!' : `${6 - next.length} Versuche übrig.`);
      sfx.click();
    }
  }

  function press(key: string) {
    if (done || session.status !== 'playing') return;
    if (key === 'ENTER') submit();
    else if (key === 'BACK') setCurrent((value) => value.slice(0, -1));
    else if (/^[A-Z]$/.test(key) && current.length < 5) {
      setCurrent((value) => value + key);
      sfx.click();
    }
  }

  useKeys({
    active: session.status === 'playing',
    down: (key) => {
      if (key === 'Enter') press('ENTER');
      else if (key === 'Backspace') press('BACK');
      else if (/^[a-zA-Z]$/.test(key)) press(key.toUpperCase());
    },
  });

  return (
    <GameStage game={game} session={session} hud={<span className="gstatus">Versuch <b>{Math.min(6, guesses.length + 1)}</b> / 6</span>}>
      <div className="game-wrap wortle-wrap">
        <div className="wortle-board">
          {Array.from({ length: 6 }, (_, row) => {
            const guess = guesses[row];
            const isCurrent = row === guesses.length && !done;
            return (
              <div key={row} className="wortle-row">
                {Array.from({ length: 5 }, (__, col) => {
                  const letter = guess ? guess.word[col] : isCurrent ? current[col] ?? '' : '';
                  const mark = guess ? guess.marks[col] : null;
                  return (
                    <div
                      key={col}
                      className={`wortle-tile ${mark ? `is-${mark}` : ''} ${letter && !mark ? 'is-filled' : ''}`}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className={`wortle-note ${done ? (guesses[guesses.length - 1]?.word === target ? 'is-win' : 'is-lose') : ''}`}>{note}</p>

        <div className="wortle-keyboard">
          {KEYS.map((row, index) => (
            <div key={row} className="wortle-keyrow">
              {index === 2 ? (
                <button type="button" className="wortle-key wide" onClick={() => press('ENTER')}>
                  Enter
                </button>
              ) : null}
              {row.split('').map((letter) => (
                <button
                  key={letter}
                  type="button"
                  className={`wortle-key ${letterState.has(letter) ? `is-${letterState.get(letter)}` : ''}`}
                  onClick={() => press(letter)}
                >
                  {letter}
                </button>
              ))}
              {index === 2 ? (
                <button type="button" className="wortle-key wide" onClick={() => press('BACK')} aria-label="Löschen">
                  ⌫
                </button>
              ) : null}
            </div>
          ))}
        </div>
        <p className="game-hint">Grün = richtig, Gelb = im Wort, Grau = nicht enthalten.</p>
      </div>
    </GameStage>
  );
}

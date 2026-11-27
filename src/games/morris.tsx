import { useEffect, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import {
  ADJ,
  BLACK,
  FIGURE,
  WHITE,
  applyAction,
  chooseMorrisAction,
  legalTargets,
  move,
  other,
  place,
  placementTargets,
  remove,
  removable,
  startState,
  type MorrisState,
} from './lib/morris';

const LEVELS = {
  easy: { depth: 1, slip: 0.3, label: 'Leicht' },
  medium: { depth: 2, slip: 0.1, label: 'Mittel' },
  hard: { depth: 3, slip: 0.06, label: 'Stark' },
} as const;
type LevelId = keyof typeof LEVELS;

/**
 * The drawn lines are exactly the board's own neighbour pairs — the same graph the
 * rules use, so a line on screen always is a legal move and the figure stays fixed.
 */
const EDGES: [number, number][] = (() => {
  const links: [number, number][] = [];
  ADJ.forEach((neighbours, from) => {
    neighbours.forEach((to) => {
      if (to > from) links.push([from, to]);
    });
  });
  return links;
})();

const SIZE = 460;
const PAD = 30;

export default function Morris({ session, game }: GameProps) {
  const [stored, setLevel] = useDifficulty('morris', 'medium');
  const levelId = (stored in LEVELS ? stored : 'medium') as LevelId;
  const [state, setState] = useState<MorrisState>(startState);
  const [selected, setSelected] = useState<number | null>(null);
  const [message, setMessage] = useState('Platziere deine neun Steine. Drei in einer Reihe = eine Mühle.');
  const [lastPoint, setLastPoint] = useState<number | null>(null);
  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;
  const aiTimer = useRef<number | null>(null);

  useEffect(() => {
    setState(startState());
    setSelected(null);
    setLastPoint(null);
    setMessage('Platziere deine neun Steine. Drei in einer Reihe = eine Mühle.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, levelId]);

  useEffect(() => () => {
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
  }, []);

  useEffect(() => {
    if (!state.winner) return;
    const humanWon = state.winner === WHITE;
    setMessage(humanWon ? 'Du gewinnst die Partie!' : 'Die KI gewinnt die Partie.');
    if (humanWon) sfx.win();
    else sfx.lose();
    window.setTimeout(() => finishRef.current(humanWon ? 900 : 0, humanWon ? 'Partie gewonnen' : 'Partie verloren'), 700);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.winner]);

  // AI turn — it waits so it never looks like a machine firing instantly
  useEffect(() => {
    if (state.winner || state.turn !== BLACK || session.status !== 'playing') return;
    if (aiTimer.current) window.clearTimeout(aiTimer.current);
    const delay = 640 + Math.random() * 820;
    aiTimer.current = window.setTimeout(() => {
      const action = chooseMorrisAction(state, LEVELS[levelId].depth, LEVELS[levelId].slip);
      if (!action) return;
      const next = applyAction(state, action);
      setState(next);
      setLastPoint(action.to);
      setMessage(action.kind === 'remove' ? 'Die KI kassiert einen deiner Steine.' : 'Die KI zieht.');
      sfx.click();
      // a captured piece keeps the ball with the AI until its removal is done
      if (next.removals > 0 && next.turn === BLACK) {
        window.setTimeout(() => {
          setState((current) => {
            if (current.removals <= 0 || current.turn !== BLACK) return current;
            const options = removable(current.board, WHITE);
            const pick = options[Math.floor(Math.random() * options.length)];
            const after = remove(current, pick);
            setMessage('Die KI nimmt dir einen Stein weg.');
            return after;
          });
        }, 420);
      }
    }, delay);
    return () => {
      if (aiTimer.current) window.clearTimeout(aiTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, levelId, session.status]);

  function clickPoint(index: number) {
    if (state.winner || state.turn !== WHITE || session.status !== 'playing') return;
    if (state.removals > 0) {
      const options = removable(state.board, BLACK);
      if (!options.includes(index)) {
        setMessage('Wähle einen schwarzen Stein (keine Mühle, wenn es andere gibt).');
        sfx.error();
        return;
      }
      setState(remove(state, index));
      setSelected(null);
      setMessage('Stein geschlagen – du bist weiter dran.');
      sfx.hit();
      return;
    }
    if (selected !== null) {
      const targets = legalTargets(state, selected);
      if (targets.includes(index)) {
        setState(move(state, selected, index));
        setLastPoint(index);
        setSelected(null);
        sfx.pick();
        return;
      }
    }
    if (state.board[index] === WHITE) {
      if (placementTargets(state).length) {
        setState(place(state, index));
        setLastPoint(index);
        sfx.pick();
        return;
      }
      setSelected(index === selected ? null : index);
      sfx.click();
      return;
    }
    if (state.board[index] === null) {
      if (placementTargets(state).includes(index)) {
        setState(place(state, index));
        setLastPoint(index);
        sfx.pick();
        return;
      }
      if (selected !== null) {
        const targets = legalTargets(state, selected);
        if (targets.includes(index)) {
          setState(move(state, selected, index));
          setLastPoint(index);
          setSelected(null);
          sfx.pick();
        }
      }
    }
    setSelected(null);
  }

  const targets = selected !== null ? legalTargets(state, selected) : [];
  const toX = (value: number) => PAD + value * (SIZE - PAD * 2);
  const toY = (value: number) => PAD + value * (SIZE - PAD * 2);
  const isRemoval = state.removals > 0 && state.turn === WHITE;
  const removableSet = isRemoval ? removable(state.board, BLACK) : [];
  const handWhite = state.placed < 18 ? 9 - Math.floor(state.placed / 2) : state.white;
  const handBlack = state.placed < 18 ? 9 - Math.floor((state.placed + 1) / 2) : state.black;

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus" style={{ color: '#fef9c3' }}>Du <b>{handWhite}</b></span>
          <span className="gstatus" style={{ color: '#cbd5e1' }}>KI <b>{handBlack}</b></span>
          <span className="gstatus">
            {state.winner ? 'Partie beendet' : state.turn === WHITE ? (isRemoval ? 'Stein wählen' : 'Du bist dran') : 'KI am Zug'}
          </span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          {(Object.keys(LEVELS) as LevelId[]).map((id) => (
            <button key={id} type="button" className={`gbtn ${levelId === id ? 'is-active' : ''}`} onClick={() => setLevel(id)}>
              {LEVELS[id].label}
            </button>
          ))}
        </div>

        <div className="morris-wrap">
          <svg className="morris-board" viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Mühle-Brett">
            {EDGES.map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={toX(FIGURE[a].x)}
                y1={toY(FIGURE[a].y)}
                x2={toX(FIGURE[b].x)}
                y2={toY(FIGURE[b].y)}
                className="morris-line"
              />
            ))}
            {FIGURE.map((position, index) => {
              const piece = state.board[index];
              const isTarget = targets.includes(index);
              const isRemovable = removableSet.includes(index);
              return (
                <circle
                  key={index}
                  cx={toX(position.x)}
                  cy={toY(position.y)}
                  /* every point has the same fixed tap area, filled or not */
                  r={26}
                  className={[
                    'morris-dot',
                    piece === WHITE ? 'is-white' : piece === BLACK ? 'is-black' : 'is-empty',
                    selected === index ? 'is-selected' : '',
                    isTarget ? 'is-target' : '',
                    isRemovable ? 'is-removable' : '',
                    lastPoint === index ? 'is-last' : '',
                  ].join(' ')}
                  onClick={() => clickPoint(index)}
                >
                  <title>{`Punkt ${index + 1}`}</title>
                </circle>
              );
            })}
          </svg>
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

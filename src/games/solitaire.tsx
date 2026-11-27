import { useEffect, useMemo, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { useDifficulty } from '../lib/hooks';
import { consumeResume, loadRun, saveRun } from '../lib/runs';
import { makeRng } from '../lib/rng';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';
import { RANKS, createDeck, deal, drawCard, isRed, moveCards, won, type Card, type Pile, type SolitaireState } from './lib/solitaire';

type Selection = { pile: Pile; count: number } | null;
type SavedSolitaire = { state: SolitaireState; seconds: number };

function cardLabel(card: Card) {
  return `${RANKS[card.rank - 1]}${card.suit}`;
}

export default function Solitaire({ session, game }: GameProps) {
  const [mode, setMode] = useDifficulty('solitaire', 'draw1');
  const [state, setState] = useState<SolitaireState>(() => deal(createDeck()));
  const [selection, setSelection] = useState<Selection>(null);
  const [seconds, setSeconds] = useState(0);
  const [message, setMessage] = useState('Ziehe Karten: eine Karte aufbauen (rot/schwarz abwechselnd, absteigend), Ass auf die Fundamente.');
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (session.daily) {
      setState(deal(createDeck(makeRng(session.daily.seed))));
      setSeconds(0);
      setMessage('Tages-Partie: gleiche Mischung für alle – wie schnell bist du fertig?');
      return;
    }
    if (consumeResume('solitaire')) {
      const saved = loadRun<SavedSolitaire>('solitaire');
      if (saved?.state && Array.isArray(saved.state.tableau) && saved.state.tableau.length === 7) {
        setState(saved.state);
        setSeconds(saved.seconds ?? 0);
        setMessage('Partie fortgesetzt – genau da weiterspielen.');
        return;
      }
    }
    setState(deal(createDeck()));
    setSeconds(0);
    setMessage('Ziehe Karten: eine Karte aufbauen (rot/schwarz abwechselnd, absteigend), Ass auf die Fundamente.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.run, session.daily?.seed]);

  useEffect(() => {
    if (session.status !== 'playing' || done) return;
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [session.status, done]);

  useEffect(() => {
    saveRun<SavedSolitaire>('solitaire', { state, seconds });
  }, [state, seconds]);

  const finished = useMemo(() => won(state), [state]);

  useEffect(() => {
    if (!finished || done) return;
    setDone(true);
    sfx.win();
    window.setTimeout(() => session.finish(Math.max(200, 2000 - seconds), `Gelöst in ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`), 600);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);

  const newDeal = () => {
    setState(deal(createDeck(session.daily ? makeRng(session.daily.seed) : Math.random)));
    setSelection(null);
    setSeconds(0);
    setDone(false);
    setMessage('Neue Partie gemischt.');
    sfx.click();
  };

  const stock = () => {
    const next = drawCard(state);
    setState(next);
    setSelection(null);
    sfx.pick();
  };

  function samePile(a: Pile, b: Pile) {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'tableau' && b.kind === 'tableau') return a.index === b.index;
    if (a.kind === 'foundation' && b.kind === 'foundation') return a.index === b.index;
    return true;
  }

  function clickCard(pile: Pile, count: number) {
    if (done || session.status !== 'playing') return;
    if (selection) {
      if (samePile(selection.pile, pile)) {
        setSelection(null);
        return;
      }
      const next = moveCards(state, selection.pile, selection.count, pile);
      if (next === state) {
        sfx.error();
        setMessage('Dieser Zug ist nicht erlaubt.');
        setSelection(null);
        return;
      }
      setState(next);
      setSelection(null);
      setMessage('Zug gespielt.');
      sfx.click();
      return;
    }
    const from = pile.kind === 'tableau' ? state.tableau[pile.index] : pile.kind === 'waste' ? state.waste : pile.kind === 'foundation' ? state.foundations[pile.index] : [];
    const card = from[from.length - 1];
    if (!card || !card.face) return;
    setSelection({ pile, count: count > 0 ? count : 1 });
    sfx.pick();
  }

  function clickEmpty(pile: Pile) {
    if (done || session.status !== 'playing') return;
    if (!selection) {
      setMessage('Wähle zuerst eine Karte.');
      return;
    }
    const next = moveCards(state, selection.pile, selection.count, pile);
    if (next === state) {
      sfx.error();
      setMessage('Dort kann nichts hin.');
      setSelection(null);
      return;
    }
    setState(next);
    setSelection(null);
    setMessage('Zug gespielt.');
    sfx.click();
  }

  const tableauMax = Math.max(...state.tableau.map((pile) => pile.length), 1);

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className="gstatus">Punkte <b>{state.score}</b></span>
          <span className="gstatus">Züge <b>{state.moves}</b></span>
          <span className="gstatus">⏱ <b>{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}</b></span>
        </>
      }
    >
      <div className="game-wrap">
        <div className="game-toolbar">
          <button type="button" className={`gbtn ${mode === 'draw1' ? 'is-active' : ''}`} onClick={() => setMode('draw1')}>
            Eine Karte
          </button>
          <button type="button" className={`gbtn ${mode === 'draw3' ? 'is-active' : ''}`} onClick={() => setMode('draw3')}>
            Drei Karten
          </button>
          <button type="button" className="gbtn" onClick={newDeal}>
            🎲 Neue Partie
          </button>
        </div>

        <div className="solitaire">
          <div className="solitaire-top">
            <div className="solitaire-slot">
              <button
                type="button"
                className={`sol-card is-back ${state.stock.length ? '' : 'is-empty'}`}
                onClick={stock}
                aria-label="Karte ziehen"
              >
                {state.stock.length ? <span aria-hidden>◆</span> : <span aria-hidden>↺</span>}
              </button>
              <small>{state.stock.length}</small>
            </div>
            <div className="solitaire-slot">
              <button
                type="button"
                className={`sol-card ${state.waste.length ? (isRed(state.waste[state.waste.length - 1].suit) ? 'is-red' : '') : 'is-empty'} ${selection && samePile(selection.pile, { kind: 'waste' }) ? 'is-selected' : ''}`}
                onClick={() => clickCard({ kind: 'waste' }, 1)}
                aria-label="Ablage"
              >
                {state.waste.length ? cardLabel(state.waste[state.waste.length - 1]) : ''}
              </button>
            </div>
            <div className="solitaire-spacer" />
            {state.foundations.map((pile, index) => (
              <div className="solitaire-slot" key={index}>
                <button
                  type="button"
                  className={`sol-card ${pile.length ? (isRed(pile[pile.length - 1].suit) ? 'is-red' : '') : 'is-empty'} ${selection && samePile(selection.pile, { kind: 'foundation', index }) ? 'is-selected' : ''}`}
                  onClick={() => (pile.length ? clickCard({ kind: 'foundation', index }, 1) : clickEmpty({ kind: 'foundation', index }))}
                  aria-label={`Fundament ${index + 1}`}
                >
                  {pile.length ? cardLabel(pile[pile.length - 1]) : 'A'}
                </button>
              </div>
            ))}
          </div>

          <div className="solitaire-tableau">
            {state.tableau.map((pile, index) => (
              <div
                key={index}
                className="sol-column"
                style={{ ['--sol-rows' as string]: tableauMax }}
                onClick={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (!pile.length) clickEmpty({ kind: 'tableau', index });
                }}
              >
                {pile.length === 0 ? (
                  <button type="button" className="sol-card is-empty sol-target" onClick={() => clickEmpty({ kind: 'tableau', index })} aria-label={`Spalte ${index + 1} leer`} />
                ) : null}
                {pile.map((card, row) => (
                  <button
                    key={row}
                    type="button"
                    className={`sol-card sol-stack ${card.face ? '' : 'is-back'} ${card.face && isRed(card.suit) ? 'is-red' : ''} ${selection && samePile(selection.pile, { kind: 'tableau', index }) && row >= pile.length - selection.count ? 'is-selected' : ''}`}
                    style={{ ['--row' as string]: row }}
                    onClick={() => clickCard({ kind: 'tableau', index }, pile.length - row)}
                    aria-label={`${card.face ? cardLabel(card) : 'verdeckt'} in Spalte ${index + 1}`}
                  >
                    {card.face ? cardLabel(card) : ''}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <p className="game-hint">{message}</p>
      </div>
    </GameStage>
  );
}

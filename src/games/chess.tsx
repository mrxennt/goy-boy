import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GameStage } from '../components/GameStage';
import { sfx } from '../lib/sound';
import type { GameProps } from './types';

type Color = 'w' | 'b';
type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
type Piece = { type: PieceType; color: Color };
type Square = { r: number; c: number };
type Move = { from: Square; to: Square; promotion?: PieceType; castle?: 'K' | 'Q'; enPassant?: boolean };
type Castling = { wK: boolean; wQ: boolean; bK: boolean; bQ: boolean };
type State = {
  board: (Piece | null)[][];
  turn: Color;
  castling: Castling;
  enPassant: Square | null;
};

/**
 * Solid glyphs for both colours: identical shapes keep every piece the same
 * size, while the colour classes decide white vs black. The U+FE0E variation
 * selector forces text presentation, so the glyphs never turn into the black
 * emoji chess pieces.
 */
const GLYPH: Record<PieceType, string> = {
  k: '♚\uFE0E',
  q: '♛\uFE0E',
  r: '♜\uFE0E',
  b: '♝\uFE0E',
  n: '♞\uFE0E',
  p: '♟\uFE0E',
};
const VALUE: Record<PieceType, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const KNIGHT_STEPS = [
  [1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1],
];
const KING_STEPS = [
  [1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1],
];

const inside = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const same = (a: Square, b: Square) => a.r === b.r && a.c === b.c;

function initialBoard(): (Piece | null)[][] {
  const back: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array<Piece | null>(8).fill(null));
  for (let c = 0; c < 8; c += 1) {
    board[0][c] = { type: back[c], color: 'b' };
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
    board[7][c] = { type: back[c], color: 'w' };
  }
  return board;
}

const initialState = (): State => ({
  board: initialBoard(),
  turn: 'w',
  castling: { wK: true, wQ: true, bK: true, bQ: true },
  enPassant: null,
});

const cloneBoard = (board: (Piece | null)[][]) => board.map((row) => [...row]);

export function isAttacked(board: (Piece | null)[][], r: number, c: number, by: Color): boolean {
  const pawnDir = by === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const pr = r + pawnDir;
    const pc = c + dc;
    if (inside(pr, pc)) {
      const piece = board[pr][pc];
      if (piece && piece.color === by && piece.type === 'p') return true;
    }
  }
  for (const [dr, dc] of KNIGHT_STEPS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inside(nr, nc)) continue;
    const piece = board[nr][nc];
    if (piece && piece.color === by && piece.type === 'n') return true;
  }
  for (const [dr, dc] of KING_STEPS) {
    const nr = r + dr;
    const nc = c + dc;
    if (!inside(nr, nc)) continue;
    const piece = board[nr][nc];
    if (piece && piece.color === by && piece.type === 'k') return true;
  }
  const rays: [number, number, PieceType[]][] = [
    [1, 0, ['r', 'q']],
    [-1, 0, ['r', 'q']],
    [0, 1, ['r', 'q']],
    [0, -1, ['r', 'q']],
    [1, 1, ['b', 'q']],
    [1, -1, ['b', 'q']],
    [-1, 1, ['b', 'q']],
    [-1, -1, ['b', 'q']],
  ];
  for (const [dr, dc, types] of rays) {
    let nr = r + dr;
    let nc = c + dc;
    while (inside(nr, nc)) {
      const piece = board[nr][nc];
      if (piece) {
        if (piece.color === by && types.includes(piece.type)) return true;
        break;
      }
      nr += dr;
      nc += dc;
    }
  }
  return false;
}

function kingSquare(board: (Piece | null)[][], color: Color): Square | null {
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (piece && piece.type === 'k' && piece.color === color) return { r, c };
    }
  }
  return null;
}

export function inCheck(state: State, color: Color): boolean {
  const king = kingSquare(state.board, color);
  if (!king) return false;
  return isAttacked(state.board, king.r, king.c, color === 'w' ? 'b' : 'w');
}

function pseudoMoves(state: State, color: Color): Move[] {
  const moves: Move[] = [];
  const { board } = state;
  const add = (from: Square, to: Square, extra: Partial<Move> = {}) => {
    if (!inside(to.r, to.c)) return;
    moves.push({ from, to, ...extra });
  };

  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece || piece.color !== color) continue;
      const from = { r, c };

      if (piece.type === 'p') {
        const dir = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;
        const promoRow = color === 'w' ? 0 : 7;
        const pushPawn = (to: Square, extra: Partial<Move> = {}) => {
          if (to.r === promoRow) {
            for (const promotion of ['q', 'r', 'b', 'n'] as PieceType[]) add(from, to, { ...extra, promotion });
          } else add(from, to, extra);
        };
        const one = r + dir;
        if (inside(one, c) && !board[one][c]) {
          pushPawn({ r: one, c });
          const two = r + 2 * dir;
          if (r === startRow && !board[two][c]) add(from, { r: two, c });
        }
        for (const dc of [-1, 1]) {
          const nr = r + dir;
          const nc = c + dc;
          if (!inside(nr, nc)) continue;
          const target = board[nr][nc];
          if (target && target.color !== color) pushPawn({ r: nr, c: nc });
          else if (!target && state.enPassant && state.enPassant.r === nr && state.enPassant.c === nc) {
            add(from, { r: nr, c: nc }, { enPassant: true });
          }
        }
      } else if (piece.type === 'n' || piece.type === 'k') {
        const steps = piece.type === 'n' ? KNIGHT_STEPS : KING_STEPS;
        for (const [dr, dc] of steps) {
          const nr = r + dr;
          const nc = c + dc;
          if (!inside(nr, nc)) continue;
          const target = board[nr][nc];
          if (!target || target.color !== color) add(from, { r: nr, c: nc });
        }
        if (piece.type === 'k') {
          const homeRow = color === 'w' ? 7 : 0;
          if (r === homeRow && c === 4 && !isAttacked(board, r, c, color === 'w' ? 'b' : 'w')) {
            const enemy = color === 'w' ? 'b' : 'w';
            const kingSide = color === 'w' ? state.castling.wK : state.castling.bK;
            const queenSide = color === 'w' ? state.castling.wQ : state.castling.bQ;
            if (kingSide && !board[homeRow][5] && !board[homeRow][6]) {
              const rook = board[homeRow][7];
              if (rook && rook.type === 'r' && rook.color === color && !isAttacked(board, homeRow, 5, enemy) && !isAttacked(board, homeRow, 6, enemy)) {
                add(from, { r: homeRow, c: 6 }, { castle: 'K' });
              }
            }
            if (queenSide && !board[homeRow][3] && !board[homeRow][2] && !board[homeRow][1]) {
              const rook = board[homeRow][0];
              if (rook && rook.type === 'r' && rook.color === color && !isAttacked(board, homeRow, 3, enemy) && !isAttacked(board, homeRow, 2, enemy)) {
                add(from, { r: homeRow, c: 2 }, { castle: 'Q' });
              }
            }
          }
        }
      } else {
        const directions: [number, number][] = [];
        if (piece.type === 'r' || piece.type === 'q') directions.push([1, 0], [-1, 0], [0, 1], [0, -1]);
        if (piece.type === 'b' || piece.type === 'q') directions.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        for (const [dr, dc] of directions) {
          let nr = r + dr;
          let nc = c + dc;
          while (inside(nr, nc)) {
            const target = board[nr][nc];
            if (!target) add(from, { r: nr, c: nc });
            else {
              if (target.color !== color) add(from, { r: nr, c: nc });
              break;
            }
            nr += dr;
            nc += dc;
          }
        }
      }
    }
  }
  return moves;
}

export function applyMove(state: State, move: Move): State {
  const board = cloneBoard(state.board);
  const piece = board[move.from.r][move.from.c];
  if (!piece) return state;
  board[move.from.r][move.from.c] = null;
  board[move.to.r][move.to.c] = move.promotion ? { type: move.promotion, color: piece.color } : piece;

  if (move.enPassant) board[move.from.r][move.to.c] = null;

  if (move.castle === 'K') {
    board[move.to.r][5] = board[move.to.r][7];
    board[move.to.r][7] = null;
  } else if (move.castle === 'Q') {
    board[move.to.r][3] = board[move.to.r][0];
    board[move.to.r][0] = null;
  }

  const castling: Castling = { ...state.castling };
  if (piece.type === 'k') {
    if (piece.color === 'w') {
      castling.wK = false;
      castling.wQ = false;
    } else {
      castling.bK = false;
      castling.bQ = false;
    }
  }
  if (piece.type === 'r') {
    if (move.from.r === 7 && move.from.c === 0) castling.wQ = false;
    if (move.from.r === 7 && move.from.c === 7) castling.wK = false;
    if (move.from.r === 0 && move.from.c === 0) castling.bQ = false;
    if (move.from.r === 0 && move.from.c === 7) castling.bK = false;
  }
  if (move.to.r === 7 && move.to.c === 0) castling.wQ = false;
  if (move.to.r === 7 && move.to.c === 7) castling.wK = false;
  if (move.to.r === 0 && move.to.c === 0) castling.bQ = false;
  if (move.to.r === 0 && move.to.c === 7) castling.bK = false;

  const enPassant =
    piece.type === 'p' && Math.abs(move.to.r - move.from.r) === 2
      ? { r: (move.to.r + move.from.r) / 2, c: move.from.c }
      : null;

  return { board, turn: state.turn === 'w' ? 'b' : 'w', castling, enPassant };
}

export function legalMoves(state: State, color: Color): Move[] {
  const result: Move[] = [];
  for (const move of pseudoMoves(state, color)) {
    const next = applyMove(state, move);
    if (!inCheck(next, color)) result.push(move);
  }
  return result;
}

function evaluateBoard(board: (Piece | null)[][], color: Color): number {
  let score = 0;
  for (let r = 0; r < 8; r += 1) {
    for (let c = 0; c < 8; c += 1) {
      const piece = board[r][c];
      if (!piece) continue;
      const sign = piece.color === color ? 1 : -1;
      let value = VALUE[piece.type];
      const center = 3.5;
      value += Math.round((3.5 - Math.abs(r - center)) * 3 + (3.5 - Math.abs(c - center)) * 3);
      if (piece.type === 'p') value += piece.color === 'w' ? (6 - r) * 8 : (r - 1) * 8;
      score += sign * value;
    }
  }
  return score;
}

function negamax(state: State, depth: number, alpha: number, beta: number): number {
  if (depth === 0) return evaluateBoard(state.board, state.turn);
  const moves = legalMoves(state, state.turn);
  if (!moves.length) return inCheck(state, state.turn) ? -90000 - depth : 0;
  moves.sort((a, b) => {
    const targetA = state.board[a.to.r][a.to.c];
    const targetB = state.board[b.to.r][b.to.c];
    return (targetB ? VALUE[targetB.type] : 0) - (targetA ? VALUE[targetA.type] : 0);
  });
  let best = -Infinity;
  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, depth - 1, -beta, -alpha);
    if (score > best) best = score;
    if (score > alpha) alpha = score;
    if (alpha >= beta) break;
  }
  return best;
}

function chooseAiMove(state: State): Move | null {
  const moves = legalMoves(state, 'b');
  if (!moves.length) return null;
  let bestScore = -Infinity;
  let bestMoves: Move[] = [];
  for (const move of moves) {
    const next = applyMove(state, move);
    const score = -negamax(next, 2, -Infinity, Infinity);
    if (score > bestScore + 4) {
      bestScore = score;
      bestMoves = [move];
    } else if (Math.abs(score - bestScore) <= 4) {
      bestMoves.push(move);
    }
  }
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? moves[0];
}

/* Bedenkzeit wie bei einem Menschen: Grundzeit plus mehr Zeit, wenn es viele
   Zugmöglichkeiten, Schlagoptionen oder ein Schach zu bedenken gibt – plus
   etwas Streuung, damit es nie mechanisch wirkt. */
function thinkingDelayFor(state: State): number {
  const moves = legalMoves(state, 'b');
  const captures = moves.filter((move) => state.board[move.to.r][move.to.c] || move.enPassant).length;
  const base = 700;
  const complexity = Math.min(moves.length * 26, 420) + captures * 55 + (inCheck(state, 'b') ? 320 : 0);
  const jitter = Math.random() * 500;
  const hesitation = Math.random() < 0.15 ? 400 + Math.random() * 800 : 0;
  return Math.min(Math.round(base + complexity + jitter + hesitation), 2800);
}

function outcomeOf(state: State): string | null {
  const moves = legalMoves(state, state.turn);
  if (moves.length) return null;
  if (inCheck(state, state.turn)) {
    return state.turn === 'w' ? 'Schachmatt – Schwarz gewinnt' : 'Schachmatt – Weiß gewinnt';
  }
  return 'Remis – Patt, keine Züge mehr';
}

export default function Chess({ session, game }: GameProps) {
  const [history, setHistory] = useState<State[]>([initialState()]);
  const [selected, setSelected] = useState<Square | null>(null);
  const [lastMove, setLastMove] = useState<Move | null>(null);
  const [thinking, setThinking] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(null);
  const state = history[history.length - 1];

  const boardMoves = useMemo(
    () => (state.turn === 'w' ? legalMoves(state, 'w') : []),
    [state],
  );

  const checkedKing = useMemo(() => {
    if (!inCheck(state, state.turn)) return null;
    return kingSquare(state.board, state.turn);
  }, [state]);

  const reset = useCallback(() => {
    setHistory([initialState()]);
    setSelected(null);
    setLastMove(null);
    setThinking(false);
    setResult(null);
    setPromotion(null);
  }, []);

  useEffect(() => {
    reset();
  }, [session.run, reset]);

  const finishRef = useRef(session.finish);
  finishRef.current = session.finish;

  const finishWith = useCallback((label: string) => {
    setResult(label);
    setThinking(false);
    finishRef.current(0, label);
  }, []);

  const commitMove = useCallback(
    (move: Move) => {
      const next = applyMove(state, move);
      setHistory((list) => [...list, next]);
      setLastMove(move);
      setSelected(null);
      setPromotion(null);
      const piece = state.board[move.from.r][move.from.c];
      if (state.board[move.to.r][move.to.c] || move.enPassant) sfx.hit();
      else if (piece?.type === 'k') sfx.click();
      else sfx.pick();
      const outcome = outcomeOf(next);
      if (outcome) finishWith(outcome);
    },
    [state, finishWith],
  );

  useEffect(() => {
    if (session.status !== 'playing' || result) return;
    if (state.turn !== 'b') return;
    setThinking(true);
    const timer = window.setTimeout(() => {
      const move = chooseAiMove(state);
      setThinking(false);
      if (!move) {
        finishWith(outcomeOf(state) ?? 'Partie beendet');
        return;
      }
      const next = applyMove(state, move);
      setHistory((list) => [...list, next]);
      setLastMove(move);
      const outcome = outcomeOf(next);
      if (outcome) finishWith(outcome);
    }, thinkingDelayFor(state));
    return () => {
      window.clearTimeout(timer);
      setThinking(false);
    };
  }, [state, session.status, result, finishWith]);

  function handleSquare(r: number, c: number) {
    if (session.status !== 'playing' || result || state.turn !== 'w' || thinking || promotion) return;
    const piece = state.board[r][c];
    if (selected) {
      const candidates = boardMoves.filter((move) => same(move.from, selected) && move.to.r === r && move.to.c === c);
      if (candidates.length) {
        const withPromotion = candidates.filter((move) => move.promotion);
        if (withPromotion.length) {
          setPromotion({ from: selected, to: { r, c } });
          return;
        }
        commitMove(candidates[0]);
        return;
      }
    }
    if (piece && piece.color === 'w') {
      setSelected({ r, c });
      sfx.click();
    } else {
      setSelected(null);
    }
  }

  function undo() {
    if (thinking || session.status !== 'playing') return;
    setHistory((list) => (list.length > 2 ? list.slice(0, list.length - 2) : list));
    setLastMove(null);
    setSelected(null);
    setResult(null);
    setPromotion(null);
    sfx.click();
  }

  const turnLabel = result
    ? result
    : state.turn === 'w'
      ? inCheck(state, 'w')
        ? 'Schach! Du bist am Zug.'
        : 'Du bist am Zug (Weiß)'
      : thinking
        ? 'KI denkt…'
        : 'KI ist am Zug';

  return (
    <GameStage
      game={game}
      session={session}
      hud={
        <>
          <span className={`gstatus ${state.turn === 'w' ? 'is-turn' : ''}`}>⚪ Du</span>
          <span className={`gstatus ${state.turn === 'b' ? 'is-turn' : ''}`}>⚫ KI</span>
          {inCheck(state, state.turn) && !result ? <span className="gstatus warn">Schach</span> : null}
        </>
      }
    >
      <div className="game-wrap chess-wrap">
        <div className="game-toolbar">
          <button type="button" className="gbtn" onClick={undo} disabled={history.length <= 2}>
            ↶ Zug zurück
          </button>
          <span className="gstatus">{turnLabel}</span>
        </div>

        <div className="chess-board" role="grid" aria-label="Schachbrett">
          {Array.from({ length: 8 }, (_, r) =>
            Array.from({ length: 8 }, (_, c) => {
              const piece = state.board[r][c];
              const isSelected = selected?.r === r && selected?.c === c;
              const isTarget = selected ? boardMoves.some((move) => same(move.from, selected) && move.to.r === r && move.to.c === c) : false;
              const isLast = lastMove && ((lastMove.from.r === r && lastMove.from.c === c) || (lastMove.to.r === r && lastMove.to.c === c));
              const isChecked = checkedKing?.r === r && checkedKing?.c === c;
              return (
                <button
                  key={`${r}-${c}`}
                  type="button"
                  role="gridcell"
                  className={[
                    'chess-square',
                    (r + c) % 2 === 0 ? 'is-light' : 'is-dark',
                    isSelected ? 'is-selected' : '',
                    isLast ? 'is-last' : '',
                    isChecked ? 'is-check' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => handleSquare(r, c)}
                  aria-label={`${'abcdefgh'[c]}${8 - r}`}
                >
                  {piece ? (
                    <span className={`chess-piece ${piece.color === 'w' ? 'is-white' : 'is-black'}`}>{GLYPH[piece.type]}</span>
                  ) : null}
                  {isTarget ? <span className={`chess-target ${piece ? 'is-capture' : ''}`} /> : null}
                  {c === 0 ? <span className="chess-coord rank">{8 - r}</span> : null}
                  {r === 7 ? <span className="chess-coord file">{'abcdefgh'[c]}</span> : null}
                </button>
              );
            }),
          )}
        </div>

        {promotion ? (
          <div className="promotion-bar">
            <span>Umwandlung wählen:</span>
            {(['q', 'r', 'b', 'n'] as PieceType[]).map((type) => (
              <button
                key={type}
                type="button"
                className="promotion-btn"
                onClick={() => {
                  const move = boardMoves.find(
                    (candidate) =>
                      same(candidate.from, promotion.from) &&
                      candidate.to.r === promotion.to.r &&
                      candidate.to.c === promotion.to.c &&
                      candidate.promotion === type,
                  );
                  if (move) commitMove(move);
                }}
              >
                {GLYPH[type]}
              </button>
            ))}
          </div>
        ) : null}

        <p className="game-hint">Klicke eine weiße Figur und dann das Zielfeld. Alle Regeln inklusive Rochade, En Passant und Umwandlung.</p>
      </div>
    </GameStage>
  );
}

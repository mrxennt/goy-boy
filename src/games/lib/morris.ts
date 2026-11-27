/**
 * Nine Men's Morris (Mühle) rules — pure, DOM-free logic so it can be tested.
 *
 * A board is an array of 24 points. Each point is `null` or a player id
 * (`WHITE` starts the game, `BLACK` is the opponent).
 */

export const WHITE = 1;
export const BLACK = 2;
export type Player = typeof WHITE | typeof BLACK;
export type Point = Player | null;
export type Board = Point[];

/** The 24 points of the standard board, clockwise starting top-left. */
export const ADJ: number[][] = [
  [1, 9], // 0
  [0, 2, 4], // 1
  [1, 14], // 2
  [4, 10], // 3
  [1, 3, 5, 7], // 4
  [4, 13], // 5
  [7, 11], // 6
  [4, 6, 8], // 7
  [7, 12], // 8
  [0, 10, 21], // 9
  [3, 9, 11, 18], // 10
  [6, 10, 15], // 11
  [8, 13, 17], // 12
  [5, 12, 14, 20], // 13
  [2, 13, 23], // 14
  [11, 16], // 15
  [15, 17, 19], // 16
  [12, 16], // 17
  [10, 19], // 18
  [16, 18, 20, 22], // 19
  [13, 19], // 20
  [9, 22], // 21
  [19, 21, 23], // 22
  [14, 22], // 23
];

export const LINES: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [9, 10, 11],
  [12, 13, 14],
  [15, 16, 17],
  [18, 19, 20],
  [21, 22, 23],
  [0, 9, 21],
  [3, 10, 18],
  [6, 11, 15],
  [1, 4, 7],
  [16, 19, 22],
  [8, 12, 17],
  [5, 13, 20],
  [2, 14, 23],
];

/**
 * Point index → fixed position on a 0..1 square (three concentric rings).
 * The coordinates never depend on game state, so the figure can never reshape.
 */
export const FIGURE: { x: number; y: number }[] = [
  // three concentric squares inset by 0, 1/6 and 1/3 — the classic board, exactly
  // matching ADJ: index order is top-left → top-middle → top-right, then the rows below
  { x: 0, y: 0 }, { x: 0.5, y: 0 }, { x: 1, y: 0 },
  { x: 1 / 6, y: 1 / 6 }, { x: 0.5, y: 1 / 6 }, { x: 5 / 6, y: 1 / 6 },
  { x: 1 / 3, y: 1 / 3 }, { x: 0.5, y: 1 / 3 }, { x: 2 / 3, y: 1 / 3 },
  { x: 0, y: 0.5 }, { x: 1 / 6, y: 0.5 }, { x: 1 / 3, y: 0.5 }, { x: 2 / 3, y: 0.5 }, { x: 5 / 6, y: 0.5 }, { x: 1, y: 0.5 },
  { x: 1 / 3, y: 2 / 3 }, { x: 0.5, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
  { x: 1 / 6, y: 5 / 6 }, { x: 0.5, y: 5 / 6 }, { x: 5 / 6, y: 5 / 6 },
  { x: 0, y: 1 }, { x: 0.5, y: 1 }, { x: 1, y: 1 },
];

export function emptyBoard(): Board {
  return Array.from({ length: 24 }, () => null);
}

export function other(player: Player): Player {
  return player === WHITE ? BLACK : WHITE;
}

export function count(board: Board, player: Player): number {
  return board.filter((point) => point === player).length;
}

export function madeLine(board: Board, point: number, player: Player): boolean {
  return LINES.some((line) => line.includes(point) && line.every((cell) => board[cell] === player));
}

export function allInLines(board: Board, player: Player): boolean {
  return count(board, player) > 0 && board.every((cell, index) => cell !== player || LINES.some((line) => line.includes(index)));
}

export function canFly(board: Board, player: Player): boolean {
  return count(board, player) === 3;
}

export function removable(board: Board, player: Player): number[] {
  const targets = board.map((cell, index) => (cell === player ? index : -1)).filter((index) => index >= 0);
  const free = targets.filter((index) => !LINES.some((line) => line.includes(index) && line.every((cell) => board[cell] === player)));
  return free.length ? free : targets;
}

export type Phase = 'place' | 'move' | 'fly';

export type MorrisState = {
  board: Board;
  turn: Player;
  white: number;
  black: number;
  /** Points placed so far, to derive the phase for both sides. */
  placed: number;
  /** Opponent pieces still to remove after closing a line. */
  removals: number;
  winner: Player | null;
};

export function startState(): MorrisState {
  return { board: emptyBoard(), turn: WHITE, white: 9, black: 9, placed: 0, removals: 0, winner: null };
}

export function phaseOf(state: MorrisState): Phase {
  if (state.placed < 18) return 'place';
  return canFly(state.board, state.turn) ? 'fly' : 'move';
}

export function legalTargets(state: MorrisState, from: number): number[] {
  if (state.winner || state.removals > 0) return [];
  if (state.board[from] !== state.turn) return [];
  const spot = phaseOf(state);
  if (spot === 'place') return [];
  const targets = spot === 'fly' ? state.board.map((cell, index) => (cell === null ? index : -1)).filter((i) => i >= 0) : ADJ[from];
  return targets.filter((to) => state.board[to] === null);
}

export function placementTargets(state: MorrisState): number[] {
  if (state.winner || state.removals > 0 || phaseOf(state) !== 'place') return [];
  return state.board.map((cell, index) => (cell === null ? index : -1)).filter((index) => index >= 0);
}

function afterAction(state: MorrisState, board: Board, point: number, moved: boolean): MorrisState {
  const player = state.turn;
  const closed = madeLine(board, point, player);
  const base: MorrisState = {
    ...state,
    board,
    // the hand sizes equal the pieces on the board, so they always match
    white: board.filter((cell) => cell === WHITE).length,
    black: board.filter((cell) => cell === BLACK).length,
    placed: moved ? state.placed : state.placed + 1,
    removals: closed ? 1 : 0,
    turn: player,
  };
  if (!closed) return finishTurn(base);
  return base;
}

/** Ends the current turn: settles removals, detects losses and hands over. */
export function finishTurn(state: MorrisState): MorrisState {
  if (state.removals > 0) return state;
  const player = state.turn;
  if (count(state.board, player) < 3 && state.placed >= 18) {
    return { ...state, winner: other(player), turn: other(player) };
  }
  if (state.placed >= 18) {
    const opponent = other(player);
    const free = state.board.some((cell) => cell === null) || canFly(state.board, opponent);
    const canMove = free && state.board.some((cell, index) => cell === opponent && legalTargets({ ...state, turn: opponent }, index).length > 0);
    if (!canMove) return { ...state, winner: player, turn: opponent };
  }
  return { ...state, turn: other(player) };
}

export function isTerminal(state: MorrisState): boolean {
  return Boolean(state.winner) || (state.placed >= 18 && actionsFor(state).length === 0);
}

export function place(state: MorrisState, point: number): MorrisState {
  if (!placementTargets(state).includes(point)) return state;
  const board = [...state.board];
  board[point] = state.turn;
  return afterAction(state, board, point, false);
}

export function move(state: MorrisState, from: number, to: number): MorrisState {
  if (!legalTargets(state, from).includes(to)) return state;
  const board = [...state.board];
  board[to] = state.turn;
  board[from] = null;
  return afterAction(state, board, to, true);
}

export function remove(state: MorrisState, point: number): MorrisState {
  if (state.removals <= 0) return state;
  const opponent = other(state.turn);
  if (!removable(state.board, opponent).includes(point)) return state;
  const board = [...state.board];
  board[point] = null;
  const withRemoval: MorrisState = {
    ...state,
    board,
    white: opponent === WHITE ? state.white - 1 : state.white,
    black: opponent === BLACK ? state.black - 1 : state.black,
    removals: 0,
  };
  if (opponent === WHITE ? withRemoval.white < 3 : withRemoval.black < 3) {
    return { ...withRemoval, winner: state.turn, turn: other(state.turn) };
  }
  return finishTurn(withRemoval);
}

export type Action = { kind: 'place' | 'move' | 'remove'; from?: number; to: number };

/** Every legal action for the side to move — used by the UI and the AI. */
export function actionsFor(state: MorrisState): Action[] {
  if (state.winner) return [];
  if (state.removals > 0) return removable(state.board, other(state.turn)).map((to) => ({ kind: 'remove' as const, to }));
  if (phaseOf(state) === 'place') return placementTargets(state).map((to) => ({ kind: 'place' as const, to }));
  const list: Action[] = [];
  state.board.forEach((cell, from) => {
    if (cell !== state.turn) return;
    legalTargets(state, from).forEach((to) => list.push({ kind: 'move' as const, from, to }));
  });
  return list;
}

export function applyAction(state: MorrisState, action: Action): MorrisState {
  if (action.kind === 'remove') return remove(state, action.to);
  if (action.kind === 'place') return place(state, action.to);
  return move(state, action.from ?? -1, action.to);
}

function evaluate(state: MorrisState, me: Player): number {
  const foe = other(me);
  let score = (count(state.board, me) - count(state.board, foe)) * 12;
  score += ((me === WHITE ? state.white : state.black) - (foe === WHITE ? state.white : state.black)) * 2;
  if (state.winner === me) score += 1000;
  if (state.winner === foe) score -= 1000;
  const mobility = (player: Player) => actionsFor({ ...state, turn: player, removals: 0 }).length;
  score += (mobility(me) - mobility(foe)) * 2;
  return score;
}

function search(state: MorrisState, me: Player, depth: number, alpha: number, beta: number): number {
  const options = actionsFor(state);
  const terminal = Boolean(state.winner) || (state.placed >= 18 && !options.length);
  if (terminal || depth === 0) return evaluate(state, me);
  const maxing = state.turn === me;
  let value = maxing ? -Infinity : Infinity;
  let a = alpha;
  let b = beta;
  for (const action of options) {
    const score = search(applyAction(state, action), me, depth - 1, a, b);
    if (maxing) {
      value = Math.max(value, score);
      a = Math.max(a, value);
    } else {
      value = Math.min(value, score);
      b = Math.min(b, value);
    }
    if (b <= a) break;
  }
  return value;
}

/** Alpha-beta search with random tie-breaking — it punishes real mistakes. */
export function chooseMorrisAction(state: MorrisState, depth = 2, slip = 0): Action | null {
  const me = state.turn;
  const options = actionsFor(state);
  if (!options.length) return null;
  const scored = options.map((action) => ({
    action,
    score: search(applyAction(state, action), me, depth - 1, -Infinity, Infinity) + Math.random() * 1.5,
  }));
  scored.sort((x, y) => y.score - x.score);
  if (slip > 0 && scored.length > 2 && Math.random() < slip) {
    return scored[1 + Math.floor(Math.random() * Math.min(3, scored.length - 1))].action;
  }
  return scored[0].action;
}

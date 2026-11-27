/**
 * Tic-tac-toe AI with three human-ish levels: a shallower search plus a real
 * chance of missing the best move, so every level can be beaten.
 */

export type Mark = 'X' | 'O';
export type Cell = Mark | null;
export type Level = 'easy' | 'normal' | 'hard';

export const LINES: number[][] = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export const LEVELS: Record<Level, { label: string; depth: number; slip: number; pace: number }> = {
  easy: { label: 'Leicht', depth: 2, slip: 0.55, pace: 0.7 },
  normal: { label: 'Mittel', depth: 4, slip: 0.22, pace: 1 },
  hard: { label: 'Stark', depth: 9, slip: 0.06, pace: 1.25 },
};

export function winner(board: Cell[]): Mark | 'draw' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
  }
  return board.every(Boolean) ? 'draw' : null;
}

/** Rough board feeling when the search is cut short: open twos and threes. */
export function heuristic(board: Cell[]): number {
  let score = 0;
  LINES.forEach(([a, b, c]) => {
    const line = [board[a], board[b], board[c]];
    const o = line.filter((cell) => cell === 'O').length;
    const x = line.filter((cell) => cell === 'X').length;
    if (o && x) return;
    if (o) score += o === 2 ? 6 : 1;
    if (x) score -= x === 2 ? 8 : 1.5;
  });
  return score;
}

export function search(board: Cell[], player: Mark, depth: number): number {
  const result = winner(board);
  if (result === 'O') return 100 + depth;
  if (result === 'X') return -100 - depth;
  if (result === 'draw') return 0;
  if (depth <= 0) return heuristic(board);

  const scores: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    if (board[i]) continue;
    board[i] = player;
    scores.push(search(board, player === 'O' ? 'X' : 'O', depth - 1));
    board[i] = null;
  }
  return player === 'O' ? Math.max(...scores) : Math.min(...scores);
}

export function aiPick(board: Cell[], level: Level): number {
  const free = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
  if (!free.length) return -1;
  const config = LEVELS[level];
  const scored = free
    .map((move) => {
      const next = [...board];
      next[move] = 'O';
      return { move, score: search(next, 'X', config.depth - 1) };
    })
    .sort((a, b) => b.score - a.score);

  // even the strong one misses the very best move now and then
  if (scored.length > 1 && Math.random() < config.slip) {
    return scored[1 + Math.floor(Math.random() * (scored.length - 1))].move;
  }
  return scored[0].move;
}

/**
 * Connect Four rules and AI. Each level has its own search depth and a real
 * chance of overlooking the best column, so no level is unbeatable.
 */

export const ROWS = 6;
export const COLS = 7;
export const PLAYER = 1;
export const AI = 2;

export type Board = number[][];
export type AiLevel = 'easy' | 'normal' | 'hard';

export const AI_LEVELS: Record<
  AiLevel,
  { label: string; depth: number; slip: number; jitter: number }
> = {
  // jitter is how badly a level misjudges a position: it is what makes easy human-weak
  easy: { label: 'Leicht', depth: 1, slip: 0.5, jitter: 420 },
  normal: { label: 'Mittel', depth: 3, slip: 0.18, jitter: 110 },
  hard: { label: 'Stark', depth: 5, slip: 0.05, jitter: 25 },
};

export const emptyBoard = (): Board => Array.from({ length: ROWS }, () => Array<number>(COLS).fill(0));

export function dropRow(board: Board, col: number): number {
  for (let r = ROWS - 1; r >= 0; r -= 1) {
    if (board[r][col] === 0) return r;
  }
  return -1;
}

export function winningCells(board: Board, player: number): [number, number][] | null {
  const directions: [number, number][] = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (board[r][c] !== player) continue;
      for (const [dr, dc] of directions) {
        const cells: [number, number][] = [];
        for (let step = 0; step < 4; step += 1) {
          const nr = r + dr * step;
          const nc = c + dc * step;
          if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS || board[nr][nc] !== player) break;
          cells.push([nr, nc]);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

export function isFull(board: Board): boolean {
  return board[0].every((cell) => cell !== 0);
}

export function evaluateBoard(board: Board): number {
  let score = 0;
  const evaluateWindow = (window: number[]) => {
    const aiCount = window.filter((cell) => cell === AI).length;
    const playerCount = window.filter((cell) => cell === PLAYER).length;
    const empty = window.filter((cell) => cell === 0).length;
    if (aiCount === 4) score += 100000;
    else if (aiCount === 3 && empty === 1) score += 120;
    else if (aiCount === 2 && empty === 2) score += 14;
    else if (playerCount === 3 && empty === 1) score -= 160;
    else if (playerCount === 2 && empty === 2) score -= 18;
    else if (playerCount === 4) score -= 100000;
  };

  for (let r = 0; r < ROWS; r += 1) {
    for (let c = 0; c < COLS; c += 1) {
      if (c + 3 < COLS) evaluateWindow([board[r][c], board[r][c + 1], board[r][c + 2], board[r][c + 3]]);
      if (r + 3 < ROWS) evaluateWindow([board[r][c], board[r + 1][c], board[r + 2][c], board[r + 3][c]]);
      if (r + 3 < ROWS && c + 3 < COLS) evaluateWindow([board[r][c], board[r + 1][c + 1], board[r + 2][c + 2], board[r + 3][c + 3]]);
      if (r + 3 < ROWS && c - 3 >= 0) evaluateWindow([board[r][c], board[r + 1][c - 1], board[r + 2][c - 2], board[r + 3][c - 3]]);
    }
  }
  for (let r = 0; r < ROWS; r += 1) {
    if (board[r][3] === AI) score += 8;
    if (board[r][3] === PLAYER) score -= 8;
  }
  return score;
}

export function search(board: Board, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (winningCells(board, AI)) return 90000 + depth * 10;
  if (winningCells(board, PLAYER)) return -90000 - depth * 10;
  if (isFull(board) || depth === 0) return evaluateBoard(board);

  if (maximizing) {
    let best = -Infinity;
    for (let c = 0; c < COLS; c += 1) {
      const r = dropRow(board, c);
      if (r < 0) continue;
      board[r][c] = AI;
      best = Math.max(best, search(board, depth - 1, alpha, beta, false));
      board[r][c] = 0;
      alpha = Math.max(alpha, best);
      if (alpha >= beta) break;
    }
    return best;
  }

  let best = Infinity;
  for (let c = 0; c < COLS; c += 1) {
    const r = dropRow(board, c);
    if (r < 0) continue;
    board[r][c] = PLAYER;
    best = Math.min(best, search(board, depth - 1, alpha, beta, true));
    board[r][c] = 0;
    beta = Math.min(beta, best);
    if (alpha >= beta) break;
  }
  return best;
}

export function chooseColumn(board: Board, level: AiLevel): number {
  const valid = Array.from({ length: COLS }, (_, c) => c).filter((c) => dropRow(board, c) >= 0);
  if (!valid.length) return -1;
  const { depth, slip, jitter } = AI_LEVELS[level];
  const scored = valid
    .map((c) => {
      const r = dropRow(board, c);
      board[r][c] = AI;
      const raw = search(board, depth, -Infinity, Infinity, false);
      board[r][c] = 0;
      return { c, score: raw + (Math.random() * 2 - 1) * jitter };
    })
    .sort((a, b) => b.score - a.score);

  // a human overlooks the best column now and then — that is what keeps it beatable
  if (scored.length > 1 && Math.random() < slip) {
    const alternatives = scored.slice(1, level === 'easy' ? scored.length : 4);
    return alternatives[Math.floor(Math.random() * alternatives.length)].c;
  }
  const best = scored[0].score;
  // break equal-looking columns towards the middle instead of at random: random
  // tie-breaks made the deeper levels play as weakly as the shallow one
  const near = scored.filter((entry) => best - entry.score <= 6);
  return near.reduce((pick, entry) => (Math.abs(entry.c - COLS / 2) < Math.abs(pick.c - COLS / 2) ? entry : pick), near[0]).c;
}

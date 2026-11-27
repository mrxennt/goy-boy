/* Checkers / Dame rules — pure, DOM-free logic. */

export type Side = 'r' | 'b';
export type Piece = { side: Side; king: boolean };
export type Cell = Piece | null;
export type Board = Cell[];
export type Move = { from: number; to: number; captured: number | null };

const SIDE_PIECE = { r: 1, b: -1 } as const;
const DIRS: Record<Side, number[][]> = {
  r: [[-1, -1], [-1, 1]],
  b: [[1, -1], [1, 1]],
};
const KING_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];

export function rowOf(index: number) {
  return Math.floor(index / 8);
}
export function colOf(index: number) {
  return index % 8;
}
function indexOf(row: number, col: number) {
  return row * 8 + col;
}
function inside(row: number, col: number) {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function startBoard(): Board {
  const board: Board = Array.from({ length: 64 }, () => null);
  for (let row = 0; row < 8; row += 1) {
    for (let col = 0; col < 8; col += 1) {
      if ((row + col) % 2 !== 1) continue;
      if (row < 3) board[indexOf(row, col)] = { side: 'b', king: false };
      if (row > 4) board[indexOf(row, col)] = { side: 'r', king: false };
    }
  }
  return board;
}

function dirsFor(piece: Piece) {
  return piece.king ? KING_DIRS : DIRS[piece.side];
}

export function movesFrom(board: Board, index: number): { moves: Move[] } {
  const piece = board[index];
  if (!piece) return { moves: [] };
  const jumps: Move[] = [];
  const quiet: Move[] = [];
  for (const [dr, dc] of dirsFor(piece)) {
    const row = rowOf(index) + dr;
    const col = colOf(index) + dc;
    if (!inside(row, col)) continue;
    const target = indexOf(row, col);
    if (!board[target]) {
      quiet.push({ from: index, to: target, captured: null });
      continue;
    }
    if (board[target]!.side === piece.side) continue;
    const jumpRow = row + dr;
    const jumpCol = col + dc;
    if (!inside(jumpRow, jumpCol)) continue;
    const landing = indexOf(jumpRow, jumpCol);
    if (board[landing]) continue;
    jumps.push({ from: index, to: landing, captured: target });
  }
  return { moves: jumps.length ? jumps : quiet };
}

export function allMoves(board: Board, side: Side): Move[] {
  const list: Move[] = [];
  board.forEach((piece, index) => {
    if (!piece || piece.side !== side) return;
    list.push(...movesFrom(board, index).moves);
  });
  return list;
}

/** Forced capture rule: if any jump exists, only jumps are legal. */
export function legalMoves(board: Board, side: Side): Move[] {
  const list = allMoves(board, side);
  const jumps = list.filter((move) => move.captured !== null);
  return jumps.length ? jumps : list;
}

export function applyMove(board: Board, move: Move): Board {
  const next = [...board];
  const piece = next[move.from]!;
  next[move.from] = null;
  if (move.captured !== null) next[move.captured] = null;
  const row = rowOf(move.to);
  const king = piece.king || (piece.side === 'r' ? row === 0 : row === 7);
  next[move.to] = { side: piece.side, king };
  return next;
}

export function findWinner(board: Board, side: Side): Side | null {
  if (allMoves(board, side).length > 0) return null;
  return side === 'r' ? 'b' : 'r';
}

function evaluate(board: Board): number {
  let score = 0;
  board.forEach((piece, index) => {
    if (!piece) return;
    const value = piece.king ? 5 : 3;
    const advance = piece.side === 'r' ? 7 - rowOf(index) : rowOf(index);
    const center = 3.5 - Math.abs(colOf(index) - 3.5);
    const edge = colOf(index) === 0 || colOf(index) === 7 ? 0.4 : 0;
    score += SIDE_PIECE[piece.side] * (value + advance * 0.12 + center * 0.1 + edge);
  });
  return score;
}

function search(board: Board, side: Side, depth: number, alpha: number, beta: number): number {
  const moves = legalMoves(board, side);
  if (!moves.length) return side === 'r' ? -9999 : 9999;
  if (depth === 0) return evaluate(board);
  if (side === 'b') {
    let best = -Infinity;
    for (const move of moves) {
      best = Math.max(best, search(applyMove(board, move), 'r', depth - 1, alpha, beta));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }
  let best = Infinity;
  for (const move of moves) {
    best = Math.min(best, search(applyMove(board, move), 'b', depth - 1, alpha, beta));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

/** Best move for black (the AI sits on top and stands for the white pieces). */
export function chooseAiMove(board: Board, level: number, slip: number): Move | null {
  const moves = legalMoves(board, 'b');
  if (!moves.length) return null;
  const scored = moves.map((move) => ({ move, score: search(applyMove(board, move), 'r', level, -Infinity, Infinity) }));
  scored.sort((a, b) => b.score - a.score);
  if (slip > 0 && scored.length > 1 && Math.random() < slip) {
    return scored[1 + Math.floor(Math.random() * Math.min(2, scored.length - 1))].move;
  }
  return scored[0].move;
}


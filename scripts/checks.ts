/**
 * Engine checks for the pure game logic that is easy to break silently.
 * Run with `npm run test:logic` — bundled with the esbuild that ships with Vite,
 * so no extra dependency and no browser are needed.
 */
import assert from 'node:assert/strict';

import { applyMove, inCheck, legalMoves } from '../src/games/chess';
import { dailyGameFor, dateKey, dailySeed, shiftDay } from '../src/lib/daily';
import { hashString, makeRng, shuffled } from '../src/lib/rng';

type P = { type: string; color: 'w' | 'b' } | null;

function startPosition() {
  const board: P[][] = Array.from({ length: 8 }, () => Array<P>(8).fill(null));
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'] as const;
  back.forEach((type, c) => {
    board[0][c] = { type, color: 'b' };
    board[7][c] = { type, color: 'w' };
  });
  for (let c = 0; c < 8; c += 1) {
    board[1][c] = { type: 'p', color: 'b' };
    board[6][c] = { type: 'p', color: 'w' };
  }
  return { board, turn: 'w' as const, castling: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: null };
}

const results: { name: string; ok: boolean; error?: string }[] = [];
function check(name: string, run: () => void) {
  try {
    run();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}

check('chess: opening has 20 legal moves', () => {
  assert.equal(legalMoves(startPosition(), 'w').length, 20);
});

check('chess: no side starts in check', () => {
  assert.equal(inCheck(startPosition(), 'w'), false);
  assert.equal(inCheck(startPosition(), 'b'), false);
});

check('chess: e2-e4 then check detection on the open file', () => {
  const start = startPosition();
  const after = applyMove(start, { from: { r: 6, c: 4 }, to: { r: 4, c: 4 } });
  assert.equal(after.turn, 'b');
  assert.equal(after.board[4][4]?.type, 'p');
  assert.equal(after.board[6][4], null);
  assert.equal(inCheck(after, 'b'), false);
});

check('chess: king side castling moves both pieces', () => {
  const board: P[][] = Array.from({ length: 8 }, () => Array<P>(8).fill(null));
  board[7][4] = { type: 'k', color: 'w' };
  board[7][7] = { type: 'r', color: 'w' };
  board[0][4] = { type: 'k', color: 'b' };
  const state = { board, turn: 'w' as const, castling: { wK: true, wQ: false, bK: false, bQ: false }, enPassant: null };
  const move = legalMoves(state, 'w').find((candidate) => candidate.castle === 'K');
  assert.ok(move, 'castling move should be legal');
  const after = applyMove(state, move);
  assert.equal(after.board[7][6]?.type, 'k');
  assert.equal(after.board[7][5]?.type, 'r');
  assert.equal(after.board[7][7], null);
});

check('chess: checkmate ends the move list', () => {
  // Fool's mate position: 1. f3 e5 2. g4 Qh4#
  const board: P[][] = Array.from({ length: 8 }, () => Array<P>(8).fill(null));
  board[7][4] = { type: 'k', color: 'w' };
  board[7][3] = { type: 'q', color: 'w' };
  board[7][5] = { type: 'b', color: 'w' };
  board[7][6] = { type: 'n', color: 'w' };
  board[7][7] = { type: 'r', color: 'w' };
  board[5][5] = { type: 'p', color: 'w' };
  board[4][6] = { type: 'p', color: 'w' };
  for (const c of [0, 1, 2, 3, 4, 7]) board[6][c] = { type: 'p', color: 'w' };
  board[0][4] = { type: 'k', color: 'b' };
  board[0][7] = { type: 'r', color: 'b' };
  board[0][0] = { type: 'r', color: 'b' };
  board[4][7] = { type: 'q', color: 'b' };
  const state = { board, turn: 'w' as const, castling: { wK: false, wQ: false, bK: false, bQ: false }, enPassant: null };
  assert.equal(inCheck(state, 'w'), true);
  assert.equal(legalMoves(state, 'w').length, 0, 'white should have no legal reply');
});

check('rng: same seed gives the same sequence', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  const first = [a(), a(), a()];
  const second = [b(), b(), b()];
  assert.deepEqual(first, second);
  assert.notEqual(first[0], makeRng(43)());
});

check('rng: strings hash deterministically', () => {
  assert.equal(hashString('goy-boy'), hashString('goy-boy'));
  assert.notEqual(hashString('goy-boy'), hashString('goy-boy!'));
});

check('rng: shuffled keeps every entry', () => {
  const list = [1, 2, 3, 4, 5, 6];
  const out = shuffled(makeRng(7), list);
  assert.equal(out.length, list.length);
  assert.deepEqual([...out].sort(), list);
});

check('daily: game of the day is stable and seed is deterministic', () => {
  const today = dateKey(new Date(2026, 10, 27));
  assert.equal(today, '2026-11-27');
  assert.equal(dailyGameFor(today).id, dailyGameFor(today).id);
  assert.equal(dailySeed(today, '2048'), dailySeed(today, '2048'));
  assert.notEqual(dailySeed('2026-11-27', '2048'), dailySeed('2026-11-28', '2048'));
});

check('daily: shifting a date crosses month boundaries', () => {
  assert.equal(shiftDay('2026-11-01', -1), '2026-10-31');
  assert.equal(shiftDay('2026-12-31', 1), '2027-01-01');
});

const failed = results.filter((entry) => !entry.ok);
for (const entry of results) {
  console.log(`${entry.ok ? '✓' : '✗'} ${entry.name}${entry.error ? ` — ${entry.error}` : ''}`);
}
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (failed.length) process.exitCode = 1;

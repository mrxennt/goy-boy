/**
 * Logic checks for the new games (dame, mühle, solitaire, nonogramm und das
 * killer-sudoku-gitter). Bundled with the esbuild that ships with Vite, so no
 * extra dependency and no browser are needed.
 */
import { build } from 'esbuild';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const probe = 'scripts/.probe.ts';
mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync(
  probe,
  `import * as checkers from '../src/games/lib/checkers';
import * as morris from '../src/games/lib/morris';
import * as solitaire from '../src/games/lib/solitaire';
import * as nonogram from '../src/games/lib/nonogram';
import * as killer from '../src/games/lib/killer';
export { checkers, morris, solitaire, nonogram, killer };
`,
);

await build({
  entryPoints: [probe],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'error',
  outfile: 'node_modules/.cache/probe.mjs',
});

const { checkers, morris, solitaire, nonogram, killer } = await import(pathToFileURL('node_modules/.cache/probe.mjs').href);

const fails = [];
const check = (name, fn) => {
  try {
    fn();
  } catch (error) {
    fails.push(`${name} — ${error.message}`);
  }
};
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
/** Empty board with pieces: each entry is [index, side, king?]. */
const boardWith = (pieces) => {
  const board = checkers.startBoard().fill(null);
  pieces.forEach(([index, side, king]) => {
    board[index] = { side, king: Boolean(king) };
  });
  return board;
};

/* ---------------- Dame ---------------- */

check('dame: 12 pieces per side and 7 opening moves', () => {
  const board = checkers.startBoard();
  assert(board.filter((piece) => piece?.side === 'r').length === 12, 'blue count');
  assert(board.filter((piece) => piece?.side === 'b').length === 12, 'cream count');
  assert(checkers.legalMoves(board, 'r').length === 7, 'blue opening moves');
  assert(checkers.legalMoves(board, 'b').length === 7, 'cream opening moves');
});

check('dame: jumps are generated and quiet moves are suppressed', () => {
  // row numbers grow downwards: a blue piece on d5 jumps over e4 onto f3
  const board = boardWith([[35, 'r'], [28, 'b']]);
  const moves = checkers.movesFrom(board, 35).moves;
  assert(moves.some((move) => move.to === 21 && move.captured === 28), 'jump to f3 missing');
  const withQuiet = boardWith([[35, 'r'], [28, 'b'], [36, 'r']]);
  assert(checkers.legalMoves(withQuiet, 'r').every((move) => move.captured !== null), 'quiet move slipped through');
});

check('dame: a jump removes the captured piece', () => {
  const board = boardWith([[40, 'r'], [33, 'b']]);
  const jump = checkers.movesFrom(board, 40).moves.find((move) => move.captured !== null);
  assert(Boolean(jump), 'no jump');
  const after = checkers.applyMove(board, jump);
  assert(!after[33], 'captured piece still there');
  assert(after[jump.to]?.side === 'r', 'jumped piece not on the landing square');
});

check('dame: reaching the back row makes a king', () => {
  // a blue piece on b2 steps up to a1 and is crowned
  const board = boardWith([[9, 'r']]);
  const move = checkers.legalMoves(board, 'r').find((candidate) => checkers.rowOf(candidate.to) === 0);
  assert(Boolean(move), 'no move onto the back row');
  const after = checkers.applyMove(board, move);
  assert(after[move.to]?.side === 'r' && after[move.to]?.king, 'piece should be crowned');
});

check('dame: a side without pieces has lost', () => {
  const board = boardWith([[40, 'r']]);
  assert(checkers.findWinner(board, 'b') === 'r', 'cream should have lost');
  assert(checkers.findWinner(board, 'r') === null, 'blue should still be alive');
});

/* ---------------- Mühle ---------------- */

check('mühle: 24 distinct points inside the board', () => {
  const keys = new Set(morris.FIGURE.map((point) => `${point.x.toFixed(3)},${point.y.toFixed(3)}`));
  assert(keys.size === 24, `distinct points ${keys.size}`);
  morris.FIGURE.forEach((point) => {
    assert(point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1, 'point outside the board');
  });
});

check('mühle: every mill line is straight through its middle point', () => {
  morris.LINES.forEach((line) => {
    const [a, b, c] = line.map((index) => morris.FIGURE[index]);
    const midX = (a.x + c.x) / 2;
    const midY = (a.y + c.y) / 2;
    assert(Math.abs(midX - b.x) < 1e-9 && Math.abs(midY - b.y) < 1e-9, `line ${line.join('-')} is not straight`);
  });
});

check('mühle: board neighbours really sit next to each other', () => {
  const drawn = new Set();
  morris.ADJ.forEach((neighbours, from) =>
    neighbours.forEach((to) => drawn.add(from < to ? `${from}-${to}` : `${to}-${from}`)),
  );
  assert(drawn.size === 32, `expected 32 edges, got ${drawn.size}`);
  drawn.forEach((key) => {
    const [from, to] = key.split('-').map(Number);
    const a = morris.FIGURE[from];
    const b = morris.FIGURE[to];
    const straight = Math.abs(a.x - b.x) < 1e-9 || Math.abs(a.y - b.y) < 1e-9;
    assert(straight, `edge ${key} is drawn diagonally (${a.x},${a.y}) -> (${b.x},${b.y})`);
  });
});

check('mühle: closing a mill opens a removal and keeps the turn', () => {
  let state = morris.startState();
  [0, 9, 1, 10, 2].forEach((point) => {
    state = morris.place(state, point);
  });
  assert(state.removals === 1, 'no removal after closing 0-1-2');
  assert(state.turn === morris.WHITE, 'turn left the mill builder');
  const victims = morris.removable(state.board, morris.BLACK);
  assert(victims.length === 2, `removable ${victims.length}`);
  state = morris.remove(state, victims[0]);
  assert(state.removals === 0 && state.turn === morris.BLACK, 'turn not handed over');
});

check('mühle: the AI always answers with a legal action', () => {
  const action = morris.chooseMorrisAction(morris.startState(), 1);
  assert(action !== null && action.kind === 'place', 'no opening action');
});

/* ---------------- Solitaire ---------------- */

check('solitaire: 28 tableau cards, 24 stock cards, seven face up', () => {
  const state = solitaire.deal(solitaire.createDeck(() => 0.42));
  assert(state.tableau.length === 7, 'columns');
  assert(state.tableau.reduce((sum, pile) => sum + pile.length, 0) === 28, 'tableau cards');
  assert(state.stock.length === 24, `stock ${state.stock.length}`);
  assert(state.tableau.filter((pile) => pile[pile.length - 1].face).length === 7, 'face-up cards');
});

check('solitaire: red on black descends, same colour does not fit', () => {
  const state = solitaire.deal(solitaire.createDeck(() => 0.31));
  state.tableau = state.tableau.map(() => []);
  state.tableau[0] = [{ rank: 8, suit: 'S', face: true }];
  state.tableau[1] = [{ rank: 7, suit: 'H', face: true }];
  assert(solitaire.moveCards(state, { kind: 'tableau', index: 1 }, 1, { kind: 'tableau', index: 0 }).tableau[0].length === 2, 'red seven refused');
  state.tableau[2] = [{ rank: 7, suit: 'C', face: true }];
  assert(solitaire.moveCards(state, { kind: 'tableau', index: 2 }, 1, { kind: 'tableau', index: 0 }) === state, 'black seven accepted');
});

check('solitaire: only kings reach an empty column', () => {
  const state = solitaire.deal(solitaire.createDeck(() => 0.13));
  state.tableau = state.tableau.map(() => []);
  state.tableau[1] = [{ rank: 13, suit: 'C', face: true }];
  state.tableau[2] = [{ rank: 5, suit: 'D', face: true }];
  assert(solitaire.moveCards(state, { kind: 'tableau', index: 1 }, 1, { kind: 'tableau', index: 0 }).tableau[0].length === 1, 'king refused');
  assert(solitaire.moveCards(state, { kind: 'tableau', index: 2 }, 1, { kind: 'tableau', index: 0 }) === state, 'five accepted');
});

check('solitaire: draw one card, then recycle the waste', () => {
  let state = solitaire.deal(solitaire.createDeck(() => 0.77));
  const stock = state.stock.length;
  state = solitaire.drawCard(state);
  assert(state.stock.length === stock - 1 && state.waste.length === 1, 'first draw');
  for (let i = 0; i < stock - 1; i += 1) state = solitaire.drawCard(state);
  assert(state.stock.length === 0 && state.waste.length === stock, 'stock not emptied');
  state = solitaire.drawCard(state);
  assert(state.stock.length === stock && state.waste.length === 0, 'waste not recycled');
});

check('solitaire: thirteen cards per foundation is a win', () => {
  const state = solitaire.deal(solitaire.createDeck(() => 0.05));
  state.foundations = solitaire.SUITS.map((suit) =>
    Array.from({ length: 13 }, (_, rank) => ({ rank: rank + 1, suit, face: true })),
  );
  assert(solitaire.won(state), 'full board not recognised as won');
});

/* ---------------- Nonogramm ---------------- */

check('nonogramm: clues describe their own line', () => {
  assert(nonogram.cluesForLine([true, true, false, true, false]).join(',') === '2,1', 'clue 2,1');
  assert(nonogram.cluesForLine([false, false]).join(',') === '0', 'empty line');
});

check('nonogramm: the solver counts small grids correctly', () => {
  assert(nonogram.countSolutions([[3], [1, 1], [3]], [[3], [1, 1], [3]]) === 1, 'cross should have one solution');
  assert(nonogram.countSolutions([[1], [1], [1]], [[1], [1], [1]], 10) === 6, 'three singles should allow six placements');
});

check('nonogramm: generated puzzles fit their own clues', () => {
  const puzzle = nonogram.makePuzzle({ size: 8, seed: 4321, density: 0.42 });
  assert(puzzle.rows.length === 8, 'row count');
  assert(nonogram.matchesClues(puzzle, puzzle.solution.map((line) => line.slice())), 'solution does not match its clues');
});

/* ---------------- Killer-Sudoku ---------------- */

const units = (() => {
  const list = [];
  for (let i = 0; i < 9; i += 1) {
    list.push(Array.from({ length: 9 }, (_, j) => i * 9 + j));
    list.push(Array.from({ length: 9 }, (_, j) => j * 9 + i));
    const br = Math.floor(i / 3) * 3;
    const bc = (i % 3) * 3;
    list.push(Array.from({ length: 9 }, (_, j) => (br + Math.floor(j / 3)) * 9 + bc + (j % 3)));
  }
  return list;
})();

check('killer-sudoku: every row, column and block holds 1–9 once', () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const { puzzle } = killer.generateSheet(seed);
    units.forEach((unit, index) => {
      const values = unit.map((cell) => puzzle[cell]).sort((a, b) => a - b);
      assert(values.join('') === '123456789', `seed ${seed}, group ${index}`);
    });
  }
});

check('killer-sudoku: cages are connected, small and add up', () => {
  const { puzzle, cages } = killer.generateSheet(99);
  assert(cages.length > 20, `only ${cages.length} cages`);
  cages.forEach((cage) => {
    assert(cage.cells.length >= 1 && cage.cells.length <= 4, `cage size ${cage.cells.length}`);
    const sum = cage.cells.reduce((total, cell) => total + puzzle[cell], 0);
    assert(sum === cage.sum, `cage ${cage.sum} vs ${sum}`);
    const digits = cage.cells.map((cell) => puzzle[cell]);
    assert(new Set(digits).size === digits.length, 'cage repeats a digit');
    const seen = new Set([cage.cells[0]]);
    const stack = [cage.cells[0]];
    while (stack.length) {
      const cell = stack.pop();
      [cell - 9, cell + 9, cell - 1, cell + 1].forEach((next) => {
        if (next >= 0 && next < 81 && cage.cells.includes(next) && !seen.has(next)) {
          seen.add(next);
          stack.push(next);
        }
      });
    }
    assert(seen.size === cage.cells.length, 'cage is not connected');
  });
});

for (const line of fails) console.log(`✗ ${line}`);
console.log(fails.length ? `\n${fails.length} sheet checks failed` : 'all sheet checks passed');
process.exitCode = fails.length ? 1 : 0;

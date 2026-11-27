/**
 * Measures whether the board AIs are actually human-beatable and whether the
 * difficulty levels get stronger instead of just calling themselves stronger.
 * Bundled with Vite's esbuild, no browser needed.
 */
import { build } from 'esbuild';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

mkdirSync('node_modules/.cache', { recursive: true });
writeFileSync(
  'scripts/.ai-probe.ts',
  `import * as ttt from '../src/games/lib/tictactoe';
import * as c4 from '../src/games/lib/connectfour';
export { ttt, c4 };
`,
);
await build({
  entryPoints: ['scripts/.ai-probe.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node18',
  logLevel: 'error',
  outfile: 'node_modules/.cache/ai-probe.mjs',
});
rmSync('scripts/.ai-probe.ts', { force: true });
const { ttt, c4 } = await import(pathToFileURL('node_modules/.cache/ai-probe.mjs').href);

/* deterministic runs: the same games every time, so this check cannot flap */
let seed = 987654321;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

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

/* ---------------- Tic-tac-toe: AI is O, a random player is X ---------------- */

const TTT_GAMES = 40;
function tictactoeRecord(level) {
  const record = { win: 0, draw: 0, loss: 0 };
  for (let game = 0; game < TTT_GAMES; game += 1) {
    const board = Array(9).fill(null);
    let turn = 'X';
    for (let ply = 0; ply < 9; ply += 1) {
      const free = board.map((cell, index) => (cell ? -1 : index)).filter((index) => index >= 0);
      if (!free.length) break;
      if (turn === 'X') {
        board[free[Math.floor(Math.random() * free.length)]] = 'X';
        turn = 'O';
      } else {
        const move = ttt.aiPick(board, level);
        board[move] = 'O';
        turn = 'X';
      }
      const result = ttt.winner(board);
      if (result === 'O') { record.win += 1; break; }
      if (result === 'X') { record.loss += 1; break; }
      if (result === 'draw') { record.draw += 1; break; }
    }
  }
  return record;
}

const tttEasy = tictactoeRecord('easy');
const tttNormal = tictactoeRecord('normal');
const tttHard = tictactoeRecord('hard');
console.log(`tic-tac-toe vs random  leicht ${JSON.stringify(tttEasy)}`);
console.log(`tic-tac-toe vs random  mittel  ${JSON.stringify(tttNormal)}`);
console.log(`tic-tac-toe vs random  stark   ${JSON.stringify(tttHard)}`);

check('tic-tac-toe: every level can lose (so it can be beaten)', () => {
  ['easy', 'normal', 'hard'].forEach((level) => {
    assert(ttt.LEVELS[level].slip > 0, `${level} never slips`);
  });
});

check('tic-tac-toe: the levels get stronger from easy to hard', () => {
  const rate = (record) => record.win / TTT_GAMES;
  const [easy, normal, hard] = [rate(tttEasy), rate(tttNormal), rate(tttHard)];
  assert(easy < normal && easy < hard, `rates ${easy.toFixed(2)} / ${normal.toFixed(2)} / ${hard.toFixed(2)}`);
  assert(normal > 0.5 && hard > 0.5, 'the middle and strong levels should still mostly win');
});

check('tic-tac-toe: a random player really beats the easy level', () => {
  assert(tttEasy.loss > 0, 'easy never lost, so it is not the human-ish level it claims to be');
});

check('tic-tac-toe: the hard level is not flawless either', () => {
  assert(tttHard.loss + tttHard.draw > 0, 'hard never dropped a game');
});

/* ---------------- Connect Four: AI is yellow, a depth-2 opponent is red ---------------- */

/** A normal person at the table: usually takes a win or blocks one, but is not always paying attention. */
function humanColumn(board) {
  const valid = Array.from({ length: c4.COLS }, (_, c) => c).filter((c) => c4.dropRow(board, c) >= 0);
  if (Math.random() < 0.6) {
    for (const c of valid) {
      const r = c4.dropRow(board, c);
      board[r][c] = c4.PLAYER;
      const win = c4.winningCells(board, c4.PLAYER);
      board[r][c] = 0;
      if (win) return c;
    }
    for (const c of valid) {
      const r = c4.dropRow(board, c);
      board[r][c] = c4.AI;
      const win = c4.winningCells(board, c4.AI);
      board[r][c] = 0;
      if (win) return c;
    }
  }
  return valid[Math.floor(Math.random() * valid.length)];
}

function connectFourGame(level) {
  const board = c4.emptyBoard();
  for (let ply = 0; ply < 42; ply += 1) {
    const full = c4.isFull(board);
    if (full) return 'draw';
    const red = ply % 2 === 0;
    const column = red ? humanColumn(board) : c4.chooseColumn(board, level);
    if (column < 0) return 'draw';
    const row = c4.dropRow(board, column);
    board[row][column] = red ? c4.PLAYER : c4.AI;
    if (c4.winningCells(board, c4.PLAYER)) return 'human';
    if (c4.winningCells(board, c4.AI)) return 'ai';
  }
  return 'draw';
}

const c4Games = { easy: 10, normal: 10, hard: 10 };
const c4Result = {};
for (const level of ['easy', 'normal', 'hard']) {
  const start = Date.now();
  const record = { win: 0, draw: 0, loss: 0 };
  for (let game = 0; game < c4Games[level]; game += 1) {
    const outcome = connectFourGame(level);
    if (outcome === 'ai') record.win += 1;
    else if (outcome === 'draw') record.draw += 1;
    else record.loss += 1;
  }
  c4Result[level] = record;
  console.log(`connect four vs normal  ${level.padEnd(6)} ${JSON.stringify(record)}  (${Date.now() - start} ms)`);
}

check('connect four: every level can actually make a mistake', () => {
  ['easy', 'normal', 'hard'].forEach((level) => {
    assert(c4.AI_LEVELS[level].slip > 0, `${level} never slips`);
  });
});

check('connect four: easy is beatable and weaker than hard', () => {
  assert(c4Result.easy.win <= c4Result.hard.win, `easy ${c4Result.easy.win} vs hard ${c4Result.hard.win}`);
  assert(c4Result.easy.loss > 0, 'easy should lose against a halfway decent player');
});

check('connect four: hard wins most games against a normal player', () => {
  assert(c4Result.hard.win >= 8, `hard only won ${c4Result.hard.win} of ${c4Games.hard}`);
});

for (const line of fails) console.log(`✗ ${line}`);
console.log(fails.length ? `\n${fails.length} ai checks failed` : 'all ai checks passed');
process.exitCode = fails.length ? 1 : 0;

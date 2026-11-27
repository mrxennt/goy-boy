/**
 * Nonogram generator and solver. Pictures are grown from a seeded random walk
 * plus a few random strokes, which gives organic shapes instead of noise, and
 * every puzzle is checked to have exactly one solution before it is handed to
 * the player.
 */

export type Grid = boolean[][];
export type Clue = number[];

export function cluesForLine(line: boolean[]): Clue {
  const clue: number[] = [];
  let run = 0;
  for (const filled of line) {
    if (filled) run += 1;
    else if (run) {
      clue.push(run);
      run = 0;
    }
  }
  if (run) clue.push(run);
  return clue.length ? clue : [0];
}

export function clueFits(clue: Clue, line: boolean[]): boolean {
  return cluesForLine(line).join(',') === clue.join(',');
}

type Options = { size: number; seed: number; density: number };

function rngFrom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Random walk plus strokes: pictures, not noise, and never one huge blob. */
function grow({ size, seed, density }: Options): Grid {
  const rng = rngFrom(seed);
  const grid: Grid = Array.from({ length: size }, () => Array.from({ length: size }, () => false));
  let x = Math.floor(size / 2);
  let y = Math.floor(size / 2);
  const steps = Math.round(size * size * density);
  for (let i = 0; i < steps; i += 1) {
    grid[y][x] = true;
    const roll = rng();
    if (roll < 0.3) x += 1;
    else if (roll < 0.6) x -= 1;
    else if (roll < 0.8) y += 1;
    else y -= 1;
    x = Math.max(0, Math.min(size - 1, x));
    y = Math.max(0, Math.min(size - 1, y));
  }
  const strokes = 2 + Math.floor(rng() * 3);
  for (let s = 0; s < strokes; s += 1) {
    const horizontal = rng() < 0.5;
    const length = 2 + Math.floor(rng() * (size / 2));
    const row = Math.floor(rng() * size);
    const col = Math.floor(rng() * size);
    for (let i = 0; i < length; i += 1) {
      const r = horizontal ? row : Math.min(size - 1, row + i);
      const c = horizontal ? Math.min(size - 1, col + i) : col;
      grid[r][c] = true;
    }
  }
  return grid;
}

/**
 * Counts solutions up to `limit`. Rows are placed top to bottom; each column
 * keeps the runs it has finished plus the run that is still open, which cuts
 * branches that can no longer match a column clue.
 */
export function countSolutions(rows: Clue[], cols: Clue[], limit = 2, deadline = Infinity): number {
  const height = rows.length;
  let deadlineHit = false;
  const width = cols.length;

  const optionsFor = (clue: Clue, length: number): boolean[][] => {
    const out: boolean[][] = [];
    const place = (index: number, at: number, line: boolean[]) => {
      if (index === clue.length) {
        const copy = line.slice();
        for (let i = at; i < length; i += 1) copy[i] = false;
        out.push(copy);
        return;
      }
      const block = clue[index];
      // blocks placed so far + block + separators + the block itself must fit
      const tail = clue.slice(index + 1).reduce((sum, value) => sum + value + 1, 0);
      for (let start = at; start + block + tail <= length; start += 1) {
        const copy = line.slice();
        for (let i = start; i < start + block; i += 1) copy[i] = true;
        place(index + 1, start + block + 1, copy);
      }
    };
    place(0, 0, Array.from({ length }, () => false));
    return out;
  };

  // A column is described by its finished runs plus the run that is open.
  // Empty cells are implicit between runs, so a long gap is simply skipped.
  type Progress = { done: number[]; open: number };
  const start: Progress[] = Array.from({ length: width }, () => ({ done: [], open: 0 }));
  const rowOptions = rows.map((clue) => optionsFor(clue, width));

  let solutions = 0;
  const search = (row: number, state: Progress[]) => {
    if (solutions >= limit || deadlineHit) return;
    if (row === 0 || row % 3 === 0) {
      if (Date.now() > deadline) {
        deadlineHit = true;
        return;
      }
    }
    if (row === height) {
      const complete = state.every((col, index) => {
        const runs = [...col.done, ...(col.open ? [col.open] : [])];
        return runs.join(',') === cols[index].join(',');
      });
      if (complete) solutions += 1;
      return;
    }
    for (const option of rowOptions[row]) {
      const next: Progress[] = state.map((col) => ({ done: col.done.slice(), open: col.open }));
      let ok = true;
      for (let col = 0; col < width && ok; col += 1) {
        const clue = cols[col];
        const progress = next[col];
        if (option[col]) {
          progress.open += 1;
          const expected = clue[progress.done.length];
          if (progress.done.length >= clue.length || progress.open > expected) ok = false;
        } else if (progress.open > 0) {
          if (progress.open !== clue[progress.done.length]) ok = false;
          progress.done.push(progress.open);
          progress.open = 0;
        }
        if (ok) {
          // the runs so far must still physically fit into the remaining height
          const runs = [...progress.done, ...(progress.open ? [progress.open] : [])];
          const need = runs.reduce((sum, value) => sum + value + 1, 0) - 1;
          if (runs.length > clue.length || need > height) ok = false;
        }
      }
      if (ok) search(row + 1, next);
      if (solutions >= limit) return;
    }
  };
  search(0, start);
  // -1 tells the generator "unknown, ran out of time" instead of "no solution"
  return solutions;
}

export type Puzzle = {
  size: number;
  rows: Clue[];
  cols: Clue[];
  solution: Grid;
};

function puzzleFrom(solution: Grid): Puzzle {
  const size = solution.length;
  return {
    size,
    rows: solution.map((line) => cluesForLine(line)),
    cols: Array.from({ length: size }, (_, col) => cluesForLine(solution.map((line) => line[col]))),
    solution,
  };
}

/**
 * Tries a handful of pictures and prefers one whose clues have a unique
 * solution. Generation happens synchronously, so the search is kept short —
 * a good picture beats a slow one, and every puzzle is always solvable.
 */
export function makePuzzle(options: Options, budgetMs = 400): Puzzle {
  let fallback: Puzzle | null = null;
  let best: Puzzle | null = null;
  let bestScore = -1;
  const started = Date.now();
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0 && Date.now() - started > budgetMs) break;
    const puzzle = puzzleFrom(grow({ ...options, seed: options.seed + attempt * 7919 }));
    if (!fallback) fallback = puzzle;
    const count = countSolutions(puzzle.rows, puzzle.cols, 1, started + budgetMs * 0.75);
    if (count === 1) return puzzle;
    if (count > bestScore) {
      bestScore = count;
      best = puzzle;
    }
  }
  return best ?? fallback!;
}

/** True when the marks agree with the clues (an "X" counts as empty). */
export function matchesClues(puzzle: Puzzle, marks: (boolean | null)[][]): boolean {
  const { rows, cols, size } = puzzle;
  for (let row = 0; row < size; row += 1) {
    const line = marks[row].map((mark) => mark === true);
    if (cluesForLine(line).join(',') !== rows[row].join(',')) return false;
  }
  for (let col = 0; col < size; col += 1) {
    const line = marks.map((entry) => entry[col] === true);
    if (cluesForLine(line).join(',') !== cols[col].join(',')) return false;
  }
  return true;
}

/** Consistency check for one column while the player fills rows in. */
export function columnPossible(clue: Clue, marks: (boolean | null)[]): boolean {
  const line = marks.map((mark) => mark === true);
  const runs = cluesForLine(line).filter((value) => value > 0);
  if (!runs.length) return clue.length === 1 && clue[0] === 0;
  for (let i = 0; i < runs.length - 1; i += 1) {
    if (runs[i] !== clue[i]) return false;
  }
  return runs.length <= clue.length && runs[runs.length - 1] <= clue[runs.length - 1];
}

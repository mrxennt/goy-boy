/**
 * Killer-Sudoku sheet generation (solution grid + cages). Kept DOM-free so
 * the rules can be checked without a browser.
 */

export type Cage = { cells: number[]; sum: number; color: number };

function shuffle<T>(rng: () => number, items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A valid Sudoku: band + row-in-band·3 + column, then rows, columns and digits shuffled. */
export function solvedGrid(rng: () => number): number[] {
  const digitMap = shuffle(rng, [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  const bands = shuffle(rng, [0, 1, 2]);
  const stacks = shuffle(rng, [0, 1, 2]);
  const inner = shuffle(rng, [0, 1, 2]);
  const rows: number[] = [];
  bands.forEach((band) => inner.forEach((offset) => rows.push(band * 3 + offset)));
  const cols: number[] = [];
  stacks.forEach((stack) => inner.forEach((offset) => cols.push(stack * 3 + offset)));
  const grid: number[] = [];
  for (let row = 0; row < 9; row += 1) {
    for (let col = 0; col < 9; col += 1) {
      const r = rows[row];
      const c = cols[col];
      const value = Math.floor(r / 3) + (r % 3) * 3 + c;
      grid.push(digitMap[value % 9]);
    }
  }
  return grid;
}

export function generateSheet(seed: number): { puzzle: number[]; cages: Cage[] } {
  const rng = mulberry(seed);
  const puzzle = solvedGrid(rng);

  // Cages of 1–4 orthogonally connected cells. Two cells of the same row may
  // share a cage (that is normal in Killer Sudoku); what a cage must never do
  // is hold the same digit twice, or its clue alone would give numbers away.
  const owner = Array.from({ length: 81 }, () => -1);
  const rowOf = (cell: number) => Math.floor(cell / 9);
  const colOf = (cell: number) => cell % 9;
  const clashes = (cells: number[], cell: number) => cells.some((other) => puzzle[other] === puzzle[cell]);

  const cages: Cage[] = [];
  for (let start = 0; start < 81; start += 1) {
    if (owner[start] !== -1) continue;
    const size = 1 + Math.floor(rng() * 4);
    const cells = [start];
    owner[start] = cages.length;
    while (cells.length < size) {
      const frontier = new Set<number>();
      for (const cell of cells) {
        if (rowOf(cell) > 0) frontier.add(cell - 9);
        if (rowOf(cell) < 8) frontier.add(cell + 9);
        if (colOf(cell) > 0) frontier.add(cell - 1);
        if (colOf(cell) < 8) frontier.add(cell + 1);
      }
      const options = [...frontier].filter((cell) => owner[cell] === -1 && !clashes(cells, cell));
      if (!options.length) break;
      const next = options[Math.floor(rng() * options.length)];
      owner[next] = cages.length;
      cells.push(next);
    }
    const sum = cells.reduce((total, cell) => total + puzzle[cell], 0);
    cages.push({ cells, sum, color: cages.length % 5 });
  }
  return { puzzle, cages };
}

/**
 * Saved runs: a small LocalStorage side-channel so an interrupted round
 * (tab closed, device asleep) can be resumed from the player page.
 */

const STORAGE_KEY = 'goyboy.runs.v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 14;

export type SavedRun<T = unknown> = { data: T; at: number };

type Runs = Record<string, SavedRun>;

const pendingResume = new Set<string>();
const listeners = new Set<() => void>();

function read(): Runs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Runs;
    if (!parsed || typeof parsed !== 'object') return {};
    const now = Date.now();
    const clean: Runs = {};
    for (const [id, run] of Object.entries(parsed)) {
      if (!run || typeof run !== 'object') continue;
      if (!Number.isFinite(run.at) || now - run.at > MAX_AGE_MS) continue;
      clean[id] = run;
    }
    return clean;
  } catch {
    return {};
  }
}

function write(runs: Runs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    /* storage blocked — resuming is a convenience, not a requirement */
  }
  listeners.forEach((listener) => listener());
}

export function subscribeRuns(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function saveRun<T>(gameId: string, data: T) {
  const runs = read();
  runs[gameId] = { data, at: Date.now() };
  write(runs);
}

export function loadRun<T>(gameId: string): T | null {
  const run = read()[gameId];
  return run ? (run.data as T) : null;
}

export function hasRun(gameId: string): boolean {
  return Boolean(read()[gameId]);
}

export function clearRun(gameId: string) {
  const runs = read();
  if (!runs[gameId]) return;
  delete runs[gameId];
  write(runs);
}

/** Marks the next mount of `gameId` as a resume, so the game restores instead of resetting. */
export function markResume(gameId: string) {
  pendingResume.add(gameId);
}

/** True exactly once per `markResume` call. */
export function consumeResume(gameId: string): boolean {
  if (!pendingResume.has(gameId)) return false;
  pendingResume.delete(gameId);
  return true;
}

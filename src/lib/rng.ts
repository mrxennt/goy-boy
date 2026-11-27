/**
 * Deterministic randomness. Games use it for daily challenges and replays:
 * the same seed always produces the same sequence, so a seeded run is fair
 * for everybody and can be replayed.
 */

export type Rng = () => number;

/** mulberry32 — small, fast and good enough for game content. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a — turns a string such as "2026-11-27:2048" into a seed. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function pickFrom<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)];
}

export function shuffled<T>(rng: Rng, items: T[]): T[] {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

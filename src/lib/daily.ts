import { GAMES, type GameMeta } from '../data/games';
import { hashString } from './rng';

/** Games whose content can be generated from a seed, so a daily round is fair. */
export const DAILY_POOL = [
  '2048',
  'minesweeper',
  'sudoku',
  'snake',
  'wortle',
  'memory',
  'nonogram',
  'killer-sudoku',
  'solitaire',
  'bubble',
] as const;

/** Local calendar day as `YYYY-MM-DD` — the identity of a daily challenge. */
export function dateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDay(key: string, days: number): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

export function dailyGameFor(key: string): GameMeta {
  const pool = DAILY_POOL.map((id) => GAMES.find((game) => game.id === id)).filter(
    (game): game is GameMeta => Boolean(game),
  );
  const list = pool.length ? pool : GAMES;
  return list[hashString(`daily:${key}`) % list.length];
}

export function dailySeed(key: string, gameId: string): number {
  return hashString(`${key}:${gameId}`);
}

export function prettyDate(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, (month ?? 1) - 1, day ?? 1);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' });
}

export function isToday(key: string): boolean {
  return key === dateKey();
}

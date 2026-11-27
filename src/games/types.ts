import type { Dispatch, SetStateAction } from 'react';
import type { GameMeta } from '../data/games';
import type { GameResult, GameStatus } from '../lib/hooks';

export type GameSession = {
  status: GameStatus;
  score: number;
  setScore: Dispatch<SetStateAction<number>>;
  best: number;
  result: GameResult;
  outcome: string | null;
  run: number;
  start: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  finish: (score: number, label?: string) => void;
  /** Set on a daily challenge: the seed makes the round identical for everyone. */
  daily: { date: string; seed: number } | null;
};

export type GameProps = {
  session: GameSession;
  game: GameMeta;
};

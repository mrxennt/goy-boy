import type { ComponentType, LazyExoticComponent } from 'react';
import type { GameProps } from './types';

export const gameLoaders: Record<string, () => Promise<{ default: ComponentType<GameProps> }>> = {
  snake: () => import('./snake'),
  breakout: () => import('./breakout'),
  'space-invaders': () => import('./space-invaders'),
  asteroids: () => import('./asteroids'),
  flappy: () => import('./flappy'),
  'doodle-jump': () => import('./doodle-jump'),
  'geometry-jump': () => import('./geometry-jump'),
  '2048': () => import('./g2048'),
  minesweeper: () => import('./minesweeper'),
  sudoku: () => import('./sudoku'),
  tetris: () => import('./tetris'),
  memory: () => import('./memory'),
  wortle: () => import('./wortle'),
  chess: () => import('./chess'),
  'tictactoe-ai': () => import('./tictactoe-ai'),
  'connect-four': () => import('./connect-four'),
  'tower-defense': () => import('./tower-defense'),
  reversi: () => import('./reversi'),
  'neon-drift': () => import('./neon-drift'),
  'endless-runner': () => import('./endless-runner'),
  'mini-golf': () => import('./mini-golf'),
  'pong-2p': () => import('./pong-2p'),
  'tictactoe-2p': () => import('./tictactoe-2p'),
  'reaction-duel': () => import('./reaction-duel'),
  'battle-arena': () => import('./battle-arena'),
  'snake-duel': () => import('./snake-duel'),
  'air-hockey': () => import('./air-hockey'),
  darts: () => import('./darts'),
  nonogram: () => import('./nonogram'),
  solitaire: () => import('./solitaire'),
  stacker: () => import('./stacker'),
  checkers: () => import('./checkers'),
  simon: () => import('./simon'),
  morris: () => import('./morris'),
  'snake-ladders': () => import('./snake-ladders'),
  'rapid-duel': () => import('./rapid-duel'),
  'killer-sudoku': () => import('./killer-sudoku'),
  bubble: () => import('./bubble'),
  'split-race': () => import('./split-race'),
};

export function hasGameModule(id: string): boolean {
  return id in gameLoaders;
}

export type GameComponent = LazyExoticComponent<ComponentType<GameProps>>;

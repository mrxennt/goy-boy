import { useSyncExternalStore } from 'react';
import { GAME_MAP, GAMES, type Category } from '../data/games';
import { pushToast } from './toast';
import { configureSound, sfx } from './sound';

const STORAGE_KEY = 'goyboy.profile.v1';
const HISTORY_LIMIT = 60;
const XP_PER_LEVEL = 250;

export type Settings = { sfx: boolean; music: boolean; volume: number };
export type Profile = { name: string; avatar: string };
export type GameRecord = { plays: number; best: number; lastPlayed: number; ms: number };
export type HistoryEntry = { id: string; at: number; score: number };

export type State = {
  profile: Profile;
  favorites: string[];
  records: Record<string, GameRecord>;
  history: HistoryEntry[];
  played: string[];
  xp: number;
  achievements: string[];
  settings: Settings;
};

export const AVATARS = ['👾', '🐍', '🦊', '🐉', '🤖', '👻', '🦄', '🦉', '🐺', '🥷', '🧙', '🚀'];

const DEFAULT_STATE: State = {
  profile: { name: 'Player One', avatar: '👾' },
  favorites: [],
  records: {},
  history: [],
  played: [],
  xp: 0,
  achievements: [],
  settings: { sfx: true, music: false, volume: 0.5 },
};

export type Achievement = {
  id: string;
  name: string;
  desc: string;
  icon: string;
  xp: number;
  goal: number;
  value: (s: State, stats: DerivedStats) => number;
};

export type DerivedStats = {
  totalPlays: number;
  totalMs: number;
  bestScores: number;
  exploredCategories: number;
  uniqueGames: number;
  records: number;
  level: number;
};

export function deriveStats(s: State): DerivedStats {
  const records = Object.values(s.records);
  const totalPlays = records.reduce((sum, r) => sum + r.plays, 0);
  const totalMs = records.reduce((sum, r) => sum + r.ms, 0);
  const categories = new Set<Category>();
  s.played.forEach((id) => {
    const meta = GAME_MAP[id];
    if (meta) categories.add(meta.category);
  });
  return {
    totalPlays,
    totalMs,
    bestScores: records.filter((r) => r.best > 0).length,
    exploredCategories: categories.size,
    uniqueGames: new Set(s.played).size,
    records: records.filter((r) => r.best > 0).length,
    level: levelOf(s.xp),
  };
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-game',
    name: 'First Game',
    desc: 'Starte dein erstes Spiel.',
    icon: '🎮',
    xp: 50,
    goal: 1,
    value: (s, st) => Math.min(1, st.totalPlays),
  },
  {
    id: 'gamer',
    name: 'Gamer',
    desc: 'Spiele 10 Runden.',
    icon: '🕹️',
    xp: 120,
    goal: 10,
    value: (_s, st) => st.totalPlays,
  },
  {
    id: 'highscore-hunter',
    name: 'Highscore Hunter',
    desc: 'Stelle einen persönlichen Rekord auf.',
    icon: '🏆',
    xp: 100,
    goal: 1,
    value: (_s, st) => Math.min(1, st.records),
  },
  {
    id: 'explorer',
    name: 'Explorer',
    desc: 'Probiere jede Kategorie aus.',
    icon: '🧭',
    xp: 150,
    goal: 6,
    value: (_s, st) => st.exploredCategories,
  },
  {
    id: 'dedicated',
    name: 'Dedicated',
    desc: 'Spiele insgesamt 60 Minuten.',
    icon: '⏱️',
    xp: 200,
    goal: 60,
    value: (_s, st) => Math.floor(st.totalMs / 60000),
  },
  {
    id: 'collector',
    name: 'Collector',
    desc: 'Speichere 5 Spiele als Favoriten.',
    icon: '💜',
    xp: 90,
    goal: 5,
    value: (s) => s.favorites.length,
  },
  {
    id: 'level-5',
    name: 'Rising Star',
    desc: 'Erreiche Level 5.',
    icon: '⭐',
    xp: 180,
    goal: 5,
    value: (_s, st) => st.level,
  },
  {
    id: 'marathon',
    name: 'Marathon',
    desc: 'Spiele 25 Runden.',
    icon: '🔥',
    xp: 160,
    goal: 25,
    value: (_s, st) => st.totalPlays,
  },
  {
    id: 'allrounder',
    name: 'Allrounder',
    desc: 'Spiele alle 25 Spiele der Plattform.',
    icon: '🌐',
    xp: 400,
    goal: GAMES.length,
    value: (_s, st) => st.uniqueGames,
  },
  {
    id: 'night-owl',
    name: 'Nachteule',
    desc: 'Spiele nach Mitternacht.',
    icon: '🌙',
    xp: 80,
    goal: 1,
    value: (s) => (s.history.some((h) => new Date(h.at).getHours() < 5) ? 1 : 0),
  },
];

export function levelOf(xp: number): number {
  return 1 + Math.floor(xp / XP_PER_LEVEL);
}

export function levelProgress(xp: number): { level: number; into: number; goal: number; pct: number } {
  const level = levelOf(xp);
  const into = xp % XP_PER_LEVEL;
  return { level, into, goal: XP_PER_LEVEL, pct: Math.round((into / XP_PER_LEVEL) * 100) };
}

function sanitize(raw: unknown): State {
  const base: State = JSON.parse(JSON.stringify(DEFAULT_STATE)) as State;
  if (!raw || typeof raw !== 'object') return base;
  const data = raw as Partial<State>;
  if (data.profile && typeof data.profile.name === 'string') {
    base.profile = {
      name: data.profile.name.slice(0, 24) || DEFAULT_STATE.profile.name,
      avatar: typeof data.profile.avatar === 'string' ? data.profile.avatar : DEFAULT_STATE.profile.avatar,
    };
  }
  if (Array.isArray(data.favorites)) base.favorites = data.favorites.filter((id) => typeof id === 'string' && GAME_MAP[id]);
  if (Array.isArray(data.played)) base.played = data.played.filter((id) => typeof id === 'string' && GAME_MAP[id]);
  if (Array.isArray(data.history)) {
    base.history = data.history
      .filter((h) => h && typeof h.id === 'string' && GAME_MAP[h.id])
      .slice(0, HISTORY_LIMIT)
      .map((h) => ({ id: h.id, at: Number(h.at) || Date.now(), score: Number(h.score) || 0 }));
  }
  if (data.records && typeof data.records === 'object') {
    const records: Record<string, GameRecord> = {};
    for (const [id, value] of Object.entries(data.records)) {
      if (!GAME_MAP[id] || !value || typeof value !== 'object') continue;
      const rec = value as Partial<GameRecord>;
      records[id] = {
        plays: Math.max(0, Math.floor(Number(rec.plays) || 0)),
        best: Math.max(0, Number(rec.best) || 0),
        lastPlayed: Number(rec.lastPlayed) || 0,
        ms: Math.max(0, Number(rec.ms) || 0),
      };
    }
    base.records = records;
  }
  if (typeof data.xp === 'number' && Number.isFinite(data.xp)) base.xp = Math.max(0, Math.floor(data.xp));
  if (Array.isArray(data.achievements)) {
    base.achievements = data.achievements.filter((id) => ACHIEVEMENTS.some((a) => a.id === id));
  }
  if (data.settings && typeof data.settings === 'object') {
    base.settings = {
      sfx: data.settings.sfx !== false,
      music: data.settings.music === true,
      volume: typeof data.settings.volume === 'number' ? Math.min(1, Math.max(0, data.settings.volume)) : 0.5,
    };
  }
  return base;
}

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return sanitize(null);
    return sanitize(JSON.parse(raw));
  } catch {
    return sanitize(null);
  }
}

let state: State = load();
const listeners = new Set<() => void>();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* Storage full or blocked — the app keeps working in memory. */
  }
}

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getState(): State {
  return state;
}

export function useAppState(): State {
  return useSyncExternalStore(subscribe, getState);
}

function applyAchievements(next: State): State {
  let achievements = next.achievements;
  let xp = next.xp;
  const stats = deriveStats({ ...next, achievements });
  for (const a of ACHIEVEMENTS) {
    if (achievements.includes(a.id)) continue;
    if (a.value({ ...next, achievements }, stats) >= a.goal) {
      achievements = [...achievements, a.id];
      xp += a.xp;
      pushToast({
        kind: 'achievement',
        title: a.name,
        body: `Erfolg freigeschaltet · +${a.xp} XP`,
        icon: a.icon,
      });
      sfx.win();
    }
  }
  return { ...next, achievements, xp };
}

function commit(mutate: (s: State) => State, options: { sound?: boolean } = {}) {
  const prevLevel = levelOf(state.xp);
  const next = applyAchievements(mutate(state));
  state = next;
  persist();
  emit();
  const newLevel = levelOf(state.xp);
  if (newLevel > prevLevel) {
    pushToast({ kind: 'level', title: `Level ${newLevel}`, body: 'Neues Level erreicht!', icon: '⚡' });
    sfx.play('level');
  }
  if (options.sound) sfx.pick();
}

configureSound(state.settings);

export function toggleFavorite(id: string) {
  if (!GAME_MAP[id]) return;
  const isFav = state.favorites.includes(id);
  commit((s) => ({
    ...s,
    favorites: isFav ? s.favorites.filter((f) => f !== id) : [id, ...s.favorites],
  }));
  sfx.play(isFav ? 'error' : 'point');
  pushToast({
    kind: 'info',
    title: isFav ? 'Aus Favoriten entfernt' : 'Zu Favoriten hinzugefügt',
    body: GAME_MAP[id].name,
    icon: isFav ? '💔' : '💜',
  });
}

export function updateProfile(patch: Partial<Profile>) {
  commit((s) => ({
    ...s,
    profile: {
      name: patch.name !== undefined ? patch.name.slice(0, 24) : s.profile.name,
      avatar: patch.avatar ?? s.profile.avatar,
    },
  }));
}

export function updateSettings(patch: Partial<Settings>) {
  commit((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  configureSound(getState().settings);
}

export function startPlay(id: string) {
  if (!GAME_MAP[id]) return;
  const now = Date.now();
  commit((s) => {
    const rec = s.records[id] ?? { plays: 0, best: 0, lastPlayed: 0, ms: 0 };
    return {
      ...s,
      records: { ...s.records, [id]: { ...rec, plays: rec.plays + 1, lastPlayed: now } },
      played: s.played.includes(id) ? s.played : [...s.played, id],
      history: [{ id, at: now, score: 0 }, ...s.history].slice(0, HISTORY_LIMIT),
      xp: s.xp + 10,
    };
  });
}

export function addPlayTime(id: string, ms: number) {
  if (!GAME_MAP[id] || ms < 400) return;
  commit((s) => {
    const rec = s.records[id] ?? { plays: 0, best: 0, lastPlayed: Date.now(), ms: 0 };
    const gained = Math.min(Math.round(ms / 1000), 30);
    return {
      ...s,
      records: { ...s.records, [id]: { ...rec, ms: rec.ms + Math.round(ms) } },
      xp: s.xp + Math.max(1, Math.round(gained / 4)),
    };
  });
}

export function recordScore(id: string, score: number): { isRecord: boolean; previousBest: number } {
  if (!GAME_MAP[id]) return { isRecord: false, previousBest: 0 };
  const previousBest = state.records[id]?.best ?? 0;
  const isRecord = score > previousBest;
  commit((s) => {
    const rec = s.records[id] ?? { plays: 1, best: 0, lastPlayed: Date.now(), ms: 0 };
    const history = s.history.map((h, i) => (i === 0 && h.id === id ? { ...h, score } : h));
    return {
      ...s,
      records: { ...s.records, [id]: { ...rec, best: Math.max(rec.best, score), lastPlayed: Date.now() } },
      history,
      xp: s.xp + 5 + Math.min(45, Math.floor(score / 120)),
    };
  });
  if (isRecord && score > 0) {
    pushToast({ kind: 'record', title: 'Neuer Rekord!', body: `${GAME_MAP[id].name}: ${score} Punkte`, icon: '🏆' });
    sfx.play('win');
  }
  return { isRecord, previousBest };
}

export function resetProgress() {
  state = sanitize(null);
  persist();
  emit();
  configureSound(state.settings);
  pushToast({ kind: 'info', title: 'Fortschritt zurückgesetzt', body: 'Profil, Rekorde und Erfolge sind neu.', icon: '♻️' });
}

export function getBest(id: string): number {
  return state.records[id]?.best ?? 0;
}

export function totalPlaytimeMs(s: State): number {
  return Object.values(s.records).reduce((sum, r) => sum + r.ms, 0);
}

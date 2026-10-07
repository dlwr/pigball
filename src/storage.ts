import type { ScoreStorage } from "./game/game";
import type { RunData } from "./run/run";

const KEY = "pigball:high-score";

export const localScoreStorage: ScoreStorage = {
  load() {
    try {
      return Number(localStorage.getItem(KEY)) || 0;
    } catch {
      return 0;
    }
  },
  save(score) {
    try {
      localStorage.setItem(KEY, String(score));
    } catch {}
  },
};

const MUSIC_KEY = "pigball:music";

export const musicPreference = {
  load(): boolean {
    try {
      return localStorage.getItem(MUSIC_KEY) !== "off";
    } catch {
      return true;
    }
  },
  save(enabled: boolean): void {
    try {
      localStorage.setItem(MUSIC_KEY, enabled ? "on" : "off");
    } catch {}
  },
};

const RUN_KEY = "pigball:run";

export const runStorage = {
  load(): RunData | null {
    try {
      const data = JSON.parse(localStorage.getItem(RUN_KEY) ?? "null") as RunData | null;
      return data?.version === 1 ? data : null;
    } catch {
      return null;
    }
  },
  save(data: RunData): void {
    try {
      localStorage.setItem(RUN_KEY, JSON.stringify(data));
    } catch {}
  },
  clear(): void {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {}
  },
};

export const discardScores: ScoreStorage = {
  load: () => 0,
  save: () => {},
};

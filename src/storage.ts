import type { ScoreStorage } from "./game/game";

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

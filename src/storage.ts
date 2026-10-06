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

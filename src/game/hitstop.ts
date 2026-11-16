import type { GameEvent } from "./game";

const HEAVY_BUMPER_SPEED = 100;

export const hitStopSeconds = (event: GameEvent): number => {
  switch (event.kind) {
    case "bumper":
      return event.speed > HEAVY_BUMPER_SPEED ? 0.045 : 0;
    case "bank":
      return 0.06;
    case "shot":
      return 0.05 + event.speed * 0.01;
    case "skill":
      return 0.08;
    case "piggyBreak":
    case "jackpot":
    case "multiball":
      return 0.11;
    case "drain":
      return 0.18;
    default:
      return 0;
  }
};

import type { GameEventKind } from "../game/game";

export type SoundPriority = "major" | "minor";

const MAJOR = new Set<GameEventKind>([
  "shot",
  "bank",
  "lanes",
  "skill",
  "ramp",
  "multiball",
  "jackpot",
  "piggyBreak",
  "kickback",
  "kickbackLit",
  "extraBall",
  "shootAgain",
  "save",
  "drain",
  "tilt",
  "fever",
  "stageClear",
  "over",
]);

export const soundPriority = (kind: GameEventKind): SoundPriority => (MAJOR.has(kind) ? "major" : "minor");

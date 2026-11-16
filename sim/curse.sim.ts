import { it } from "vitest";
import type { Modifier } from "../src/game/game";
import { CURSES, CURSE_IDS } from "../src/run/curses";
import { SKILLS, playStage, quantiles } from "./bot";

it("curses", () => {
  const skill = SKILLS[process.env.SKILL ?? "average"];
  const n = Number(process.env.N ?? 150);
  const id = ["none", ...CURSE_IDS][Number(process.env.PART ?? 0)];
  if (!id) return;
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const modifiers: Modifier[] = id === "none" ? [] : [{ id, ...CURSES[id].effect }];
    scores.push(playStage({ balls: 2, target: null, modifiers }, skill, 5000 + i).score);
  }
  const sorted = [...scores].sort((a, b) => a - b);
  const trimmed = sorted.slice(Math.floor(n * 0.05), Math.ceil(n * 0.95));
  const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
  const [p10, p25, p50, p75] = quantiles(scores, [0.1, 0.25, 0.5, 0.75]);
  process.stdout.write(`RESULT ${JSON.stringify({ id, boss: !!CURSES[id]?.boss, p10, p25, p50, p75, mean: Math.round(mean) })}\n`);
}, 7200000);

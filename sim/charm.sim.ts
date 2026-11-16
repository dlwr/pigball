import { it } from "vitest";
import type { Modifier } from "../src/game/game";
import { CHARMS, CHARM_IDS } from "../src/run/charms";
import { SKILLS, playStage, quantiles } from "./bot";

it("charms", () => {
  const skill = SKILLS[process.env.SKILL ?? "average"];
  const n = Number(process.env.N ?? 150);
  const part = Number(process.env.PART ?? 0);
  const parts = Number(process.env.PARTS ?? 1);
  const ids = ["none", ...CHARM_IDS].filter((_, i) => i % parts === part);
  for (const id of ids) {
    const tally: Record<string, number> = {};
    const probe: Modifier = { id: "probe", score: (kind, points) => ((tally[kind] = (tally[kind] ?? 0) + points), points) };
    const scores: number[] = [];
    for (let i = 0; i < n; i++) {
      const modifiers: Modifier[] = id === "none" ? [probe] : [{ id, ...CHARMS[id].effect }, probe];
      scores.push(playStage({ balls: 2, target: null, modifiers }, skill, 5000 + i).score);
    }
    const sorted = [...scores].sort((a, b) => a - b);
    const trimmed = sorted.slice(Math.floor(n * 0.05), Math.ceil(n * 0.95));
    const mean = trimmed.reduce((s, v) => s + v, 0) / trimmed.length;
    const [p10, p25, p50, p75] = quantiles(scores, [0.1, 0.25, 0.5, 0.75]);
    const total = Object.values(tally).reduce((s, v) => s + v, 0);
    const share = Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +((v / total) * 100).toFixed(1)]));
    process.stdout.write(`RESULT ${JSON.stringify({ id, price: CHARMS[id]?.price ?? 0, rare: !!CHARMS[id]?.rare, p10, p25, p50, p75, mean: Math.round(mean), share: id === "none" ? share : undefined })}\n`);
  }
}, 7200000);

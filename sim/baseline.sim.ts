import { it } from "vitest";
import { SKILLS, playStage, quantiles } from "./bot";

it("baseline", () => {
  const skill = SKILLS[process.env.SKILL ?? "average"];
  const n = Number(process.env.N ?? 200);
  const balls = Number(process.env.BALLS ?? 2);
  const outs = Array.from({ length: n }, (_, i) => playStage({ balls, target: null }, skill, 5000 + i));
  const qs = [0.05, 0.1, 0.2, 0.3, 0.5, 0.7, 0.9];
  const q = quantiles(outs.map((o) => o.score), qs);
  const secs = quantiles(outs.map((o) => o.seconds), [0.1, 0.5, 0.9]);
  const ev = (k: string) => (outs.reduce((s, o) => s + (o.events[k] ?? 0), 0) / outs.length).toFixed(1);
  process.stdout.write(`RESULT ${skill.name} balls=${balls} n=${n} score ${qs.map((x, i) => `p${x * 100}=${Math.round(q[i])}`).join(" ")} | sec ${secs.map((s) => s.toFixed(0)).join("/")} | ramp ${ev("ramp")} shot ${ev("shot")} skill ${ev("skill")} bank ${ev("bank")} multiball ${ev("multiball")} jackpot ${ev("jackpot")} lanes ${ev("lanes")} piggyBreak ${ev("piggyBreak")} navelIn ${ev("navelIn")}\n`);
}, 3600000);

import { it } from "vitest";
import { CHARMS } from "../src/run/charms";
import { Run, STAGES } from "../src/run/run";
import { SKILLS, playStage, quantiles } from "./bot";

it("runs", () => {
  const skill = SKILLS[process.env.SKILL ?? "average"];
  const n = Number(process.env.N ?? 40);
  const seed0 = Number(process.env.SEED ?? 1);
  if (process.env.TARGETS) process.env.TARGETS.split(",").forEach((t, i) => (STAGES[i].target = Number(t)));
  const per = STAGES.map(() => ({ attempts: 0, clears: 0, ratio: [] as number[], truffles: [] as number[], charms: [] as number[], seconds: [] as number[], open: [] as number[] }));
  const shadow = process.env.SHADOW === "1";
  const sinks = process.env.SINKS !== "0";
  const reached: number[] = [];
  let wins = 0;
  for (let r = 0; r < n; r++) {
    const run = new Run(seed0 * 100000 + r);
    let k = 0;
    while (run.phase === "stage") {
      const stage = run.stage;
      const stageSeed = seed0 * 7919 + r * 131 + k++;
      const s = per[stage];
      if (shadow && !run.retrying) s.open.push(playStage({ ...run.stageRules(), target: null }, skill, stageSeed).score);
      const out = playStage(run.stageRules(), skill, stageSeed);
      s.attempts++;
      if (out.cleared) s.clears++;
      s.ratio.push(out.score / STAGES[stage].target);
      s.seconds.push(out.seconds);
      run.finishStage({ cleared: out.cleared, ballsLeft: out.ballsLeft, score: out.score });
      if (run.phase !== "shop") break;
      s.truffles.push(run.truffles);
      if (sinks) run.buyLife();
      for (;;) {
        if (sinks && run.charms.length >= run.slots) run.buySlot();
        const affordable = run.shop.offers.map((id, i) => ({ id, i })).filter(({ id }) => CHARMS[id].price <= run.truffles);
        if (run.charms.length >= run.slots || affordable.length === 0) break;
        affordable.sort((a, b) => CHARMS[b.id].price - CHARMS[a.id].price);
        run.buy(affordable[0].i);
      }
      s.charms.push(run.charms.length);
      run.nextStage();
    }
    if (run.phase === "won") wins++;
    reached.push(run.phase === "won" ? STAGES.length : run.stage);
  }
  const rows = per.map((s, i) => {
    const [r10, r50, r90] = quantiles(s.ratio.length ? s.ratio : [0], [0.1, 0.5, 0.9]);
    const med = (v: number[]) => (v.length ? quantiles(v, [0.5])[0] : 0);
    return { stage: i + 1, target: STAGES[i].target, attempts: s.attempts, clears: s.clears, r10: +r10.toFixed(2), r50: +r50.toFixed(2), r90: +r90.toFixed(2), truffles: med(s.truffles), charms: med(s.charms), sec: Math.round(med(s.seconds)), open: s.open };
  });
  process.stdout.write(`RESULT ${JSON.stringify({ skill: skill.name, n, wins, reached, rows })}\n`);
}, 3600000);

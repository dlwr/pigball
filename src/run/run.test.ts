import { describe, expect, it } from "vitest";
import { CHARMS } from "./charms";
import { PARTS, PART_IDS } from "./parts";
import { Run, STAGES } from "./run";

const clearStage = (run: Run, ballsLeft = 1, score = run.stageDef.target) => run.finishStage({ cleared: true, ballsLeft, score });

const failStage = (run: Run) => run.finishStage({ cleared: false, ballsLeft: 0, score: 0 });

const richRun = (seed = 1) => {
  const run = new Run(seed);
  clearStage(run);
  run.truffles = 100;
  return run;
};

describe("ラン", () => {
  it("ステージ1から、トリュフもおまじないもなしで始まる", () => {
    const run = new Run(1);
    expect([run.stage, run.truffles, run.charms, run.phase]).toEqual([0, 0, [], "stage"]);
  });

  it("全8ステージで、ボスは3・6・8番目", () => {
    expect(STAGES.map((s, i) => (s.boss ? i + 1 : 0)).filter(Boolean)).toEqual([3, 6, 8]);
  });

  it("目標スコアはステージが進むほど上がる", () => {
    expect(STAGES.every((s, i) => i === 0 || s.target > STAGES[i - 1].target)).toBe(true);
  });

  it("ステージのルールはボール2個と目標スコア", () => {
    const run = new Run(1);
    const rules = run.stageRules();
    expect([rules.balls, rules.target]).toEqual([2, STAGES[0].target]);
  });

  describe("ステージの終わり", () => {
    it("クリアするとトリュフがもらえてショップに進む", () => {
      const run = new Run(1);
      clearStage(run, 1);
      expect([run.truffles > 0, run.phase]).toEqual([true, "shop"]);
    });

    it("余ったボールが多いほどトリュフが多い", () => {
      const a = new Run(1);
      clearStage(a, 1);
      const b = new Run(1);
      clearStage(b, 2);
      expect(b.truffles).toBeGreaterThan(a.truffles);
    });

    it("目標を超えた分だけトリュフが増える", () => {
      const a = new Run(1);
      clearStage(a, 1, a.stageDef.target);
      const b = new Run(1);
      clearStage(b, 1, b.stageDef.target * 1.5);
      expect(b.truffles - a.truffles).toBe(5);
    });

    it("超えた分のトリュフには上限がある", () => {
      const a = new Run(1);
      clearStage(a, 1, a.stageDef.target);
      const b = new Run(1);
      clearStage(b, 1, b.stageDef.target * 100);
      expect(b.truffles - a.truffles).toBe(15);
    });

    it("命3つで始まる", () => {
      expect(new Run(1).lives).toBe(3);
    });

    it("届かなかったら命を1つ失い、トリュフなしでショップに進む", () => {
      const run = new Run(1);
      failStage(run);
      expect([run.lives, run.truffles, run.phase]).toEqual([2, 0, "shop"]);
    });

    it("届かなかったステージは、ショップのあとにやり直す", () => {
      const run = new Run(1);
      clearStage(run);
      run.nextStage();
      const curse = run.curse?.id;
      failStage(run);
      run.nextStage();
      expect([run.stage, run.curse?.id]).toEqual([1, curse]);
    });

    it("命がなくなったらランは終わる", () => {
      const run = new Run(1);
      for (let i = 0; i < 3; i++) {
        failStage(run);
        run.nextStage();
      }
      expect(run.phase).toBe("lost");
    });

    it("最後のステージをクリアするとランに勝つ", () => {
      const run = new Run(1);
      for (let i = 0; i < STAGES.length - 1; i++) {
        clearStage(run);
        run.nextStage();
      }
      clearStage(run);
      expect(run.phase).toBe("won");
    });

    it("次のステージに進むとステージ番号が上がる", () => {
      const run = new Run(1);
      clearStage(run);
      run.nextStage();
      expect([run.stage, run.phase]).toEqual([1, "stage"]);
    });
  });

  describe("呪い", () => {
    it("ステージ1には呪いがない", () => {
      expect(new Run(1).curse).toBeNull();
    });

    it("ステージ2からは呪いが付く", () => {
      const run = new Run(1);
      clearStage(run);
      run.nextStage();
      expect(run.curse).not.toBeNull();
    });

    it("ショップにいる間に、次のステージの呪いが分かる", () => {
      const run = new Run(1);
      clearStage(run);
      const upcoming = run.curse?.id;
      run.reroll();
      run.nextStage();
      expect([upcoming, run.curse?.id]).toEqual([run.curse?.id, expect.any(String)]);
    });

    it("ボスステージにはボス用の呪いが付く", () => {
      const run = new Run(1);
      for (let i = 0; i < 2; i++) {
        clearStage(run);
        run.nextStage();
      }
      expect(run.curse?.boss).toBe(true);
    });

    it("豚の神様を持っていると呪いはルールに入らない", () => {
      const run = new Run(1);
      clearStage(run);
      run.charms.push("pig-god");
      run.nextStage();
      expect(run.stageRules().modifiers?.map((m) => m.id)).not.toContain(run.curse?.id);
    });

    it("呪いはステージのルールに入る", () => {
      const run = new Run(1);
      clearStage(run);
      run.nextStage();
      expect(run.stageRules().modifiers?.map((m) => m.id)).toContain(run.curse?.id);
    });
  });

  describe("ショップ", () => {
    it("おまじないが3つ並ぶ", () => {
      expect(richRun().shop.offers).toHaveLength(3);
    });

    it("買うとトリュフが減って手に入る", () => {
      const run = richRun();
      const offer = run.shop.offers[0];
      run.buy(0);
      expect([run.truffles, run.charms]).toEqual([100 - CHARMS[offer].price, [offer]]);
    });

    it("持っているおまじないはステージのルールに入る", () => {
      const run = richRun();
      const offer = run.shop.offers[0];
      run.buy(0);
      run.nextStage();
      expect(run.stageRules().modifiers?.map((m) => m.id)).toContain(offer);
    });

    it("トリュフが足りなければ買えない", () => {
      const run = richRun();
      run.truffles = 0;
      run.buy(0);
      expect(run.charms).toEqual([]);
    });

    it("5つまでしか持てない", () => {
      const run = richRun();
      run.truffles = 1000;
      for (let i = 0; i < 8; i++) {
        if (run.shop.offers.length === 0) run.reroll();
        run.buy(0);
      }
      expect(run.charms).toHaveLength(5);
    });

    it("持っているおまじないは並ばない", () => {
      const run = richRun();
      const offer = run.shop.offers[0];
      run.buy(0);
      for (let i = 0; i < 20; i++) run.reroll();
      expect(run.shop.offers).not.toContain(offer);
    });

    it("売ると値段の半分が戻る", () => {
      const run = richRun();
      const offer = run.shop.offers[0];
      run.buy(0);
      const before = run.truffles;
      run.sell(offer);
      expect([run.truffles - before, run.charms]).toEqual([Math.floor(CHARMS[offer].price / 2), []]);
    });

    it("並べ直すと品揃えが変わり、次の並べ直しは高くなる", () => {
      const run = richRun();
      const before = [...run.shop.offers];
      const cost = run.shop.rerollCost;
      run.reroll();
      expect([run.shop.offers.join() !== before.join(), run.shop.rerollCost]).toEqual([true, cost + 1]);
    });

    it("キープした品は、並べ直しても残る", () => {
      const run = richRun();
      const offer = run.shop.offers[1];
      run.keep(1);
      run.reroll();
      expect(run.shop.offers[0]).toBe(offer);
    });

    it("キープした品は、次のショップにも並ぶ", () => {
      const run = richRun();
      const offer = run.shop.offers[2];
      run.keep(2);
      run.nextStage();
      clearStage(run);
      expect([run.shop.offers[0], run.shop.offers.length]).toEqual([offer, 3]);
    });

    it("キープは1つだけで、別の品をキープすると前のは外れる", () => {
      const run = richRun();
      run.keep(0);
      run.keep(1);
      expect(run.shop.kept).toBe(run.shop.offers[1]);
    });

    it("キープした品をもう一度選ぶと外れる", () => {
      const run = richRun();
      run.keep(0);
      run.keep(0);
      expect(run.shop.kept).toBeNull();
    });

    it("キープした品を買うとキープは外れる", () => {
      const run = richRun();
      run.keep(0);
      run.buy(0);
      expect(run.shop.kept).toBeNull();
    });

    it("たまにレアなおまじないが並ぶ", () => {
      const offers = Array.from({ length: 60 }, (_, seed) => richRun(seed).shop.offers).flat();
      const rares = offers.filter((id) => CHARMS[id].rare).length;
      expect(rares > 0 && rares < offers.length / 2).toBe(true);
    });

    it("同じシードなら同じ品揃えになる", () => {
      expect(richRun(42).shop.offers).toEqual(richRun(42).shop.offers);
    });
  });

  describe("部位", () => {
    it("中央に風車だけが入った台から始まる", () => {
      expect(new Run(1).stageRules().parts).toEqual({ center: "rotor" });
    });

    it("ショップには部位が1つ並ぶ", () => {
      expect(PART_IDS).toContain(richRun().shop.part);
    });

    it("部位を買って差込口を選ぶと、次のステージの台に入る", () => {
      const run = richRun();
      const part = run.shop.part!;
      run.buyPart("left");
      run.nextStage();
      expect(run.stageRules().parts).toEqual({ center: "rotor", left: part });
    });

    it("部位を買うとトリュフが減り、ショップからなくなる", () => {
      const run = richRun();
      const part = run.shop.part!;
      run.buyPart("left");
      expect([run.truffles, run.shop.part]).toEqual([100 - PARTS[part].price, null]);
    });

    it("埋まっている差込口に入れると、前の部位と入れ替わる", () => {
      const run = richRun();
      const part = run.shop.part!;
      run.buyPart("center");
      expect(run.parts.center).toBe(part);
    });

    it("トリュフが足りなければ入らない", () => {
      const run = richRun();
      run.truffles = 0;
      run.buyPart("left");
      expect(run.parts.left).toBeUndefined();
    });

    it("並べ直すと部位も並べ直される", () => {
      const parts = new Set<string | null>();
      const run = richRun();
      for (let i = 0; i < 10; i++) {
        run.truffles = 100;
        run.reroll();
        parts.add(run.shop.part);
      }
      expect(parts.size).toBeGreaterThan(1);
    });

    it("保存して復元しても台の部位は残る", () => {
      const run = richRun();
      const part = run.shop.part!;
      run.buyPart("right");
      expect(Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON()))).parts.right).toBe(part);
    });
  });

  describe("育つおまじない", () => {
    const growDuringStage = (run: Run, id: string, count: number) => {
      const modifier = run.stageRules().modifiers?.find((m) => m.id === id);
      modifier!.count = count;
    };

    const countOf = (run: Run, id: string) => run.stageRules().modifiers?.find((m) => m.id === id)?.count;

    it("ステージで育った分を、次のステージに持ち越す", () => {
      const run = new Run(1);
      run.charms.push("big-eater");
      growDuringStage(run, "big-eater", 4);
      clearStage(run);
      run.nextStage();
      expect(countOf(run, "big-eater")).toBe(4);
    });

    it("届かなかったステージで育った分も持ち越す", () => {
      const run = new Run(1);
      run.charms.push("big-eater");
      growDuringStage(run, "big-eater", 2);
      failStage(run);
      run.nextStage();
      expect(countOf(run, "big-eater")).toBe(2);
    });

    it("保存して復元しても育ち具合は残る", () => {
      const run = new Run(1);
      run.charms.push("big-eater");
      growDuringStage(run, "big-eater", 3);
      clearStage(run);
      const restored = Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON())));
      expect(restored.growth("big-eater")).toBe(3);
    });

    it("売ると育ち具合はなくなる", () => {
      const run = new Run(1);
      run.charms.push("big-eater");
      growDuringStage(run, "big-eater", 3);
      clearStage(run);
      run.sell("big-eater");
      expect(run.growth("big-eater")).toBe(0);
    });
  });

  it("保存して復元すると同じ状態に戻る", () => {
    const run = richRun(7);
    run.buy(0);
    run.reroll();
    const restored = Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON())));
    expect(restored.toJSON()).toEqual(run.toJSON());
  });

  it("命の入っていない古い保存データは、命3つで復元される", () => {
    const { lives: _lives, retrying: _retrying, ...old } = new Run(1).toJSON();
    expect(Run.fromJSON(old).lives).toBe(3);
  });

  it("復元したランは続きの品揃えも同じになる", () => {
    const run = richRun(7);
    const restored = Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON())));
    run.reroll();
    restored.reroll();
    expect(restored.shop.offers).toEqual(run.shop.offers);
  });
});

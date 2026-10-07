import { describe, expect, it } from "vitest";
import { CHARMS } from "./charms";
import { Run, STAGES } from "./run";

const clearStage = (run: Run, ballsLeft = 1) => run.finishStage({ cleared: true, ballsLeft });

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

    it("届かなかったらランは終わる", () => {
      const run = new Run(1);
      run.finishStage({ cleared: false, ballsLeft: 0 });
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

    it("ボスステージにはボス用の呪いが付く", () => {
      const run = new Run(1);
      for (let i = 0; i < 2; i++) {
        clearStage(run);
        run.nextStage();
      }
      expect(run.curse?.boss).toBe(true);
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

    it("同じシードなら同じ品揃えになる", () => {
      expect(richRun(42).shop.offers).toEqual(richRun(42).shop.offers);
    });
  });

  it("保存して復元すると同じ状態に戻る", () => {
    const run = richRun(7);
    run.buy(0);
    run.reroll();
    const restored = Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON())));
    expect(restored.toJSON()).toEqual(run.toJSON());
  });

  it("復元したランは続きの品揃えも同じになる", () => {
    const run = richRun(7);
    const restored = Run.fromJSON(JSON.parse(JSON.stringify(run.toJSON())));
    run.reroll();
    restored.reroll();
    expect(restored.shop.offers).toEqual(run.shop.offers);
  });
});

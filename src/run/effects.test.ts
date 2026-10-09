import { describe, expect, it } from "vitest";
import { Game } from "../game/game";
import { createParams } from "../physics/params";
import { CHARMS, CHARM_IDS } from "./charms";
import { CURSES, CURSE_IDS } from "./curses";

const DT = 1 / 960;

const storage = { load: () => 0, save: () => {} };

const placeBall = (game: Game, x: number, y: number, vx: number, vy: number) =>
  Object.assign(game.world.balls[0], { x, y, prevX: x, prevY: y, vx, vy });

const hitTarget = (game: Game) => {
  const target = game.layout.targets[0];
  placeBall(game, target.ax + 2, (target.ay + target.by) / 2, -60, 0);
  for (let i = 0; i < 48; i++) game.step(DT);
};

const drainBall = (game: Game) => {
  placeBall(game, 23, -4, 0, -10);
  game.step(DT);
};

const playBriefly = (game: Game) => {
  game.setPlunger(true);
  for (let i = 0; i < 960; i++) game.step(DT);
  game.setPlunger(false);
  for (let i = 0; i < 960 * 3; i++) game.step(DT);
};

describe("おまじない", () => {
  for (const id of CHARM_IDS) {
    it(`${CHARMS[id].name}を付けても台が動く`, () => {
      const game = new Game(createParams(), storage, { modifiers: [{ id, ...CHARMS[id].effect }] });
      playBriefly(game);
      expect(Number.isFinite(game.score)).toBe(true);
    });
  }
});

describe("呪い", () => {
  for (const id of CURSE_IDS) {
    it(`${CURSES[id].name}を付けても台が動く`, () => {
      const game = new Game(createParams(), storage, { modifiers: [{ id, ...CURSES[id].effect }] });
      playBriefly(game);
      expect(Number.isFinite(game.score)).toBe(true);
    });
  }
});

describe("ギミック連携のおまじない", () => {
  const withCharm = (id: string) => new Game(createParams(), storage, { modifiers: [{ id, ...CHARMS[id].effect }] });

  it("豚足フィーバー: 風車が勢いよく回っている間は点が1.5倍", () => {
    const game = withCharm("rotor-frenzy");
    game.world.rotors[0].omega = 10;
    game.addScore(100);
    expect(game.score).toBe(150);
  });

  it("豚足フィーバー: 風車が止まっていれば点はそのまま", () => {
    const game = withCharm("rotor-frenzy");
    game.addScore(100);
    expect(game.score).toBe(100);
  });

  it("へそ充電: へそに入るたびに倍率が1上がる", () => {
    const game = withCharm("navel-charge");
    const { navel } = game.layout;
    const ball = game.world.balls[0];
    Object.assign(ball, { x: navel.x, y: navel.y + 3, prevX: navel.x, prevY: navel.y + 3, vx: 0, vy: -20 });
    for (let i = 0; i < 300; i++) game.step(DT);
    expect(game.multiplier).toBe(2);
  });

  it("トンカチ: 貯金箱が3回で割れる", () => {
    const game = withCharm("piggy-crusher");
    expect(game.piggyHitsToBreak).toBe(3);
  });
});

describe("全体に掛かるレアなおまじない", () => {
  const withCharm = (id: string) => new Game(createParams(), storage, { modifiers: [{ id, ...CHARMS[id].effect }] });

  it("金の鼻: 全部の点が1.5倍", () => {
    const game = withCharm("golden-snout");
    game.addScore(100);
    expect(game.score).toBe(150);
  });

  it("豚の大群: マルチボール中は全部の点が2倍", () => {
    const game = withCharm("pig-horde");
    game.inMultiball = true;
    game.addScore(100);
    expect(game.score).toBe(200);
  });

  it("豚の大群: マルチボールでなければそのまま", () => {
    const game = withCharm("pig-horde");
    game.addScore(100);
    expect(game.score).toBe(100);
  });

  it("フィーバー体質: フィーバー中は全部の点がさらに2倍", () => {
    const game = withCharm("fever-body");
    game.feverTime = 5;
    game.addScore(100);
    expect(game.score).toBe(400);
  });

  it("倍々ゲーム: 倍率がもう一度掛かる", () => {
    const game = withCharm("double-down");
    game.multiplier = 3;
    game.addScore(100);
    expect(game.score).toBe(900);
  });
});

describe("ルールを壊すレアなおまじない", () => {
  const withCharm = (id: string) => new Game(createParams(), storage, { modifiers: [{ id, ...CHARMS[id].effect }] });

  it("双子の子豚: 打ち出すともう1匹出てくる", () => {
    const game = withCharm("twin-piglets");
    game.setPlunger(true);
    for (let i = 0; i < 960; i++) game.step(DT);
    game.setPlunger(false);
    let most = 0;
    for (let i = 0; i < 960 * 2; i++) {
      game.step(DT);
      most = Math.max(most, game.ballsInPlay);
    }
    expect(most).toBe(2);
  });

  it("照準の神: ボールを落としても光ったショットの段階が戻らない", () => {
    const game = withCharm("sight-god");
    hitTarget(game);
    drainBall(game);
    expect(game.shotLevel).toBe(2);
  });
});

describe("狙いのおまじない", () => {
  const withCharm = (id: string, count = 0) => new Game(createParams(), storage, { modifiers: [{ id, ...CHARMS[id].effect, count }] });

  const pointsOf = (game: Game, act: () => void) => {
    const before = game.score;
    act();
    return game.score - before;
  };

  it("一点狙い: 光ったショットの上乗せが2倍", () => {
    const game = withCharm("sharpshooter");
    expect(pointsOf(game, () => hitTarget(game))).toBe(500 + 2000 * 2);
  });

  it("畳みかけ: 光ったショットに当てると段階が2上がる", () => {
    const game = withCharm("follow-through");
    hitTarget(game);
    expect(game.shotLevel).toBe(3);
  });

  it("へそ照準: へそに入ると、次のショットも光る", () => {
    const game = withCharm("navel-sight");
    const { navel } = game.layout;
    placeBall(game, navel.x, navel.y + 3, 0, -20);
    for (let i = 0; i < 300; i++) game.step(DT);
    expect(game.litShots).toEqual(["target", "piggy", "ramp"]);
  });

  it("鼻息照準: バンパーからは点が出ない", () => {
    const game = withCharm("snort-sight");
    expect(game.rules.modifiers[0].score?.("bumper", 100, game)).toBe(0);
  });

  it("鼻息照準: バンパーに8回当てると、次のショットも光る", () => {
    const game = withCharm("snort-sight");
    const modifier = game.rules.modifiers[0];
    for (let i = 0; i < 8; i++) modifier.event?.("bumper", game);
    expect(game.litShots).toEqual(["target", "piggy", "ramp"]);
  });

  it("鼻息照準: 7回ではまだ光らない", () => {
    const game = withCharm("snort-sight");
    const modifier = game.rules.modifiers[0];
    for (let i = 0; i < 7; i++) modifier.event?.("bumper", game);
    expect(game.litShots).toHaveLength(2);
  });

  it("食べ盛り: 光ったショットに当てるたびに育つ", () => {
    const game = withCharm("big-eater");
    hitTarget(game);
    expect(game.rules.modifiers[0].count).toBe(1);
  });

  it("食べ盛り: 育った分だけ全部の点が増える", () => {
    const game = withCharm("big-eater", 4);
    game.addScore(100);
    expect(game.score).toBe(120);
  });
});

import { describe, expect, it } from "vitest";
import { Game } from "../game/game";
import { createParams } from "../physics/params";
import { CHARMS, CHARM_IDS } from "./charms";
import { CURSES, CURSE_IDS } from "./curses";

const storage = { load: () => 0, save: () => {} };
const DT = 1 / 960;

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

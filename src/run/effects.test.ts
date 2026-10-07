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

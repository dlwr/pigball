import { describe, expect, it } from "vitest";
import type { GameEventKind } from "../game/game";
import { soundPriority } from "./priority";

describe("効果音の優先順位", () => {
  const majors: GameEventKind[] = ["drain", "shot", "jackpot", "multiball", "skill", "fever", "stageClear", "over"];
  const minors: GameEventKind[] = ["bumper", "sling", "wall", "flipper", "spin", "rotor", "belly"];

  for (const kind of majors) {
    it(`${kind} は勝敗に関わる音として扱う`, () => {
      expect(soundPriority(kind)).toBe("major");
    });
  }

  for (const kind of minors) {
    it(`${kind} は当たり物の音として扱う`, () => {
      expect(soundPriority(kind)).toBe("minor");
    });
  }
});

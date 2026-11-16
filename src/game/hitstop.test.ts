import { describe, expect, it } from "vitest";
import type { GameEvent, GameEventKind } from "./game";
import { hitStopSeconds } from "./hitstop";

const event = (kind: GameEventKind, speed = 1): GameEvent => ({ kind, x: 0, y: 0, speed });

describe("ヒットストップの長さ", () => {
  it("速く当たった鼻は止める", () => {
    expect(hitStopSeconds(event("bumper", 150))).toBeGreaterThan(0);
  });

  it("ゆっくり当たった鼻は止めない", () => {
    expect(hitStopSeconds(event("bumper", 50))).toBe(0);
  });

  it("壁に当たっただけでは止めない", () => {
    expect(hitStopSeconds(event("wall", 400))).toBe(0);
  });

  it("点灯ショットは段が上がるほど長く止める", () => {
    const stops = [1, 3, 5].map((level) => hitStopSeconds(event("shot", level)));
    expect(stops).toEqual([...stops].sort((a, b) => a - b));
    expect(new Set(stops).size).toBe(3);
  });

  it("貯金箱を割ったときは鼻より長く止める", () => {
    expect(hitStopSeconds(event("piggyBreak"))).toBeGreaterThan(hitStopSeconds(event("bumper", 150)));
  });

  it("ボールを落としたときが一番長い", () => {
    const others: GameEventKind[] = ["bumper", "bank", "skill", "piggyBreak", "jackpot", "multiball"];
    const longest = Math.max(...others.map((kind) => hitStopSeconds(event(kind, 150))), hitStopSeconds(event("shot", 5)));
    expect(hitStopSeconds(event("drain"))).toBeGreaterThan(longest);
  });
});

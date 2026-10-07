import { describe, expect, it } from "vitest";
import { levelFor, notesAt, STEPS_PER_BAR, STEPS_PER_LOOP } from "./pattern";

const voicesAt = (step: number, level: 0 | 1 | 2) => notesAt(step, level).map((n) => n.voice);

const loopHas = (level: 0 | 1 | 2, voice: string) =>
  Array.from({ length: STEPS_PER_LOOP }, (_, step) => voicesAt(step, level)).some((voices) => voices.includes(voice as never));

describe("BGM のパターン", () => {
  it("発射待ちのあいだはキックが鳴らない", () => {
    expect(loopHas(0, "kick")).toBe(false);
  });

  it("プレイ中は拍の頭でキックが鳴る", () => {
    expect([0, 4, 8, 12].map((step) => voicesAt(step, 1).includes("kick"))).toEqual([true, true, true, true]);
  });

  it("プレイ中は2拍目と4拍目でスネアが鳴る", () => {
    expect([0, 4, 8, 12].map((step) => voicesAt(step, 1).includes("snare"))).toEqual([false, true, false, true]);
  });

  it("ベースは小節ごとにコードのルートを鳴らす", () => {
    const bassAt = (bar: number) => notesAt(bar * STEPS_PER_BAR, 1).find((n) => n.voice === "bass")?.freq.toFixed(1);
    expect([0, 1, 2, 3].map(bassAt)).toEqual(["110.0", "87.3", "130.8", "98.0"]);
  });

  it("リードはマルチボール中だけ鳴る", () => {
    expect([loopHas(1, "lead"), loopHas(2, "lead")]).toEqual([false, true]);
  });
});

describe("BGM の盛り上がり", () => {
  it("発射待ちは控えめ", () => {
    expect(levelFor("ready", false)).toBe(0);
  });

  it("プレイ中は通常", () => {
    expect(levelFor("playing", false)).toBe(1);
  });

  it("マルチボール中は最も盛り上がる", () => {
    expect(levelFor("playing", true)).toBe(2);
  });

  it("ゲームオーバーでは止まる", () => {
    expect(levelFor("over", false)).toBeNull();
  });
});

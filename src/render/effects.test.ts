import { afterEach, describe, expect, it, vi } from "vitest";
import { Shake } from "./effects";

afterEach(() => vi.restoreAllMocks());

describe("画面の揺れ", () => {
  it("小さい揺れは縦にだけ揺れる", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const shake = new Shake();
    shake.add(0.15);
    const [x, y] = shake.offset(0, 1);
    expect(x).toBe(0);
    expect(y).toBeGreaterThan(0);
  });

  it("大きい揺れは横にも揺れる", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const shake = new Shake();
    shake.add(0.5);
    const [x] = shake.offset(0, 1);
    expect(x).toBeGreaterThan(0);
  });

  it("時間がたつと収まる", () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    const shake = new Shake();
    shake.add(0.5);
    const [, before] = shake.offset(0, 1);
    const [, after] = shake.offset(0.1, 1);
    expect(after).toBeLessThan(before);
  });
});

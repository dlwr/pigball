import { describe, expect, it } from "vitest";
import { FixedStepper } from "./stepper";

describe("FixedStepper", () => {
  it("経過時間に応じた回数だけステップを回す", () => {
    const stepper = new FixedStepper(1 / 100, 50);
    let steps = 0;
    stepper.advance(0.035, () => steps++);
    expect(steps).toBe(3);
  });

  it("余りを次のフレームに持ち越す", () => {
    const stepper = new FixedStepper(1 / 100, 50);
    let steps = 0;
    stepper.advance(0.015, () => steps++);
    stepper.advance(0.015, () => steps++);
    expect(steps).toBe(3);
  });

  it("描画補間用に余りの割合を返す", () => {
    const stepper = new FixedStepper(1 / 100, 50);
    const alpha = stepper.advance(0.0125, () => {});
    expect(alpha).toBeCloseTo(0.25);
  });

  it("1フレームのステップ数を上限で打ち切り、溜まった時間を捨てる", () => {
    const stepper = new FixedStepper(1 / 100, 5);
    let steps = 0;
    stepper.advance(1, () => steps++);
    stepper.advance(0, () => steps++);
    expect(steps).toBe(5);
  });
});

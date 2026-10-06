export class FixedStepper {
  private accumulator = 0;

  constructor(
    readonly dt: number,
    private readonly maxSteps: number,
  ) {}

  advance(frameDt: number, step: (dt: number) => void): number {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.dt - 1e-12) {
      if (steps >= this.maxSteps) {
        this.accumulator = 0;
        break;
      }
      step(this.dt);
      this.accumulator -= this.dt;
      steps++;
    }
    return Math.max(0, this.accumulator) / this.dt;
  }

  reset(): void {
    this.accumulator = 0;
  }
}

import { describe, expect, it } from "vitest";
import { createParams } from "./params";
import { World, type FlipperDef } from "./world";

const DT = 1 / 960;

const run = (world: World, seconds: number, each?: () => void) => {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    world.step(DT);
    each?.();
  }
};

const leftFlipper: FlipperDef = {
  id: "left",
  x: 14.5,
  y: 12,
  length: 7,
  baseRadius: 1.1,
  tipRadius: 0.6,
  restAngle: -0.52,
  activeAngle: 0.52,
};

describe("World", () => {
  describe("静的な壁", () => {
    it("落ちてきたボールは床の上で静止する", () => {
      const world = new World(createParams());
      world.addSegment({ id: "floor", ax: 0, ay: 0, bx: 50, by: 0 });
      const ball = world.spawnBall(25, 10);
      run(world, 3);
      expect(ball.y).toBeCloseTo(ball.r, 1);
    });

    it("最高速のボールでも薄い壁をすり抜けない", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addSegment({ id: "wall", ax: 0, ay: 0, bx: 50, by: 0 });
      const ball = world.spawnBall(25, 5);
      ball.vy = -params.maxSpeed;
      run(world, 0.5);
      expect(ball.y).toBeGreaterThan(0);
    });

    it("無効化した壁は素通りする", () => {
      const world = new World(createParams());
      const seg = world.addSegment({ id: "target", ax: 0, ay: 0, bx: 50, by: 0 });
      seg.enabled = false;
      const ball = world.spawnBall(25, 3);
      run(world, 1);
      expect(ball.y).toBeLessThan(0);
    });

    it("一方通行の壁は法線側からは通れず、反対側からは通れる", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addSegment({ id: "gate", ax: 0, ay: 0, bx: 50, by: 0, oneWay: true });
      const up = world.spawnBall(10, -5);
      up.vy = 100;
      const down = world.spawnBall(40, 5);
      down.vy = -100;
      run(world, 0.3);
      expect(up.y).toBeGreaterThan(5);
      expect(down.y).toBeGreaterThan(0);
    });
  });

  describe("バンパー", () => {
    it("当たったボールを最低でもキック速度で弾き返す", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addBumper({ id: "pop", x: 25, y: 50, r: 2.5, kick: 100 });
      const ball = world.spawnBall(25, 60);
      ball.vy = -20;
      run(world, 0.6);
      expect(ball.vy).toBeGreaterThanOrEqual(99);
    });

    it("接触イベントを出す", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addBumper({ id: "pop", x: 25, y: 50, r: 2.5, kick: 100 });
      const ball = world.spawnBall(25, 60);
      ball.vy = -20;
      run(world, 0.6);
      expect(world.drainEvents().filter((e) => e.type === "contact" && e.id === "pop")).toHaveLength(1);
    });
  });

  describe("フリッパー", () => {
    it("押している間は上がりきった角度で止まる", () => {
      const world = new World(createParams());
      const flipper = world.addFlipper(leftFlipper);
      flipper.pressed = true;
      run(world, 0.2);
      expect(flipper.angle).toBeCloseTo(leftFlipper.activeAngle);
    });

    it("離すと元の角度に戻る", () => {
      const world = new World(createParams());
      const flipper = world.addFlipper(leftFlipper);
      flipper.pressed = true;
      run(world, 0.2);
      flipper.pressed = false;
      run(world, 0.2);
      expect(flipper.angle).toBeCloseTo(leftFlipper.restAngle);
    });

    it("右向きのフリッパーは上がるときに逆回転する", () => {
      const world = new World(createParams());
      const flipper = world.addFlipper({
        ...leftFlipper,
        id: "right",
        restAngle: Math.PI + 0.52,
        activeAngle: Math.PI - 0.52,
      });
      flipper.pressed = true;
      world.step(DT);
      expect(flipper.omega).toBeLessThan(0);
    });

    it("フリッパー上のボールを打つと台の上部まで飛ぶ", () => {
      const world = new World(createParams());
      const flipper = world.addFlipper(leftFlipper);
      const ball = world.spawnBall(19, 11);
      run(world, 0.05);
      flipper.pressed = true;
      let maxY = ball.y;
      run(world, 1.5, () => (maxY = Math.max(maxY, ball.y)));
      expect(maxY).toBeGreaterThan(60);
    });
  });

  describe("プランジャー", () => {
    it("引ききって離すとボールが台の上部まで飛ぶ", () => {
      const world = new World(createParams());
      const plunger = world.setPlunger({ ax: 46, bx: 50, restY: 3, travel: 3 });
      const ball = world.spawnBall(48, 3 + 1.35);
      plunger.held = true;
      run(world, 1.5);
      plunger.held = false;
      let maxY = ball.y;
      run(world, 1.5, () => (maxY = Math.max(maxY, ball.y)));
      expect(maxY).toBeGreaterThan(85);
    });

    it("少しだけ引いたときは弱く飛ぶ", () => {
      const world = new World(createParams());
      const plunger = world.setPlunger({ ax: 46, bx: 50, restY: 3, travel: 3 });
      const ball = world.spawnBall(48, 3 + 1.35);
      plunger.held = true;
      run(world, 0.2);
      plunger.held = false;
      let maxY = ball.y;
      run(world, 1.5, () => (maxY = Math.max(maxY, ball.y)));
      expect(maxY).toBeLessThan(40);
    });
  });

  it("プランジャーは引き量の上限までしか引けない", () => {
    const world = new World(createParams());
    const plunger = world.setPlunger({ ax: 46, bx: 50, restY: 3, travel: 3 });
    plunger.held = true;
    plunger.pullLimit = 0.4;
    run(world, 1.5);
    expect(plunger.pull).toBeCloseTo(0.4);
  });

  describe("センサー", () => {
    it("ボールが横切ったときに1回だけイベントを出す", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addSensor({ id: "lane", ax: 20, ay: 50, bx: 30, by: 50 });
      const ball = world.spawnBall(25, 40);
      ball.vy = 50;
      run(world, 0.5);
      expect(world.drainEvents().filter((e) => e.type === "sensor" && e.id === "lane")).toHaveLength(1);
    });
  });

  describe("ナッジ", () => {
    it("全ボールに速度を加える", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      const ball = world.spawnBall(25, 40);
      world.nudge(10, 5);
      expect([ball.vx, ball.vy]).toEqual([10, 5]);
    });
  });
});

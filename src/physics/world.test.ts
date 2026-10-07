import { describe, expect, it } from "vitest";
import { createParams } from "./params";
import { LAYER_FLOOR, LAYER_RAMP, World, type FlipperDef } from "./world";

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

  describe("ボール同士", () => {
    const zeroGravityWorld = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("正面からぶつかると止まっていたボールが押し出される", () => {
      const world = zeroGravityWorld();
      const a = world.spawnBall(10, 50);
      const b = world.spawnBall(20, 50);
      a.vx = 100;
      run(world, 0.2);
      expect(b.vx).toBeGreaterThan(80);
    });

    it("正面からぶつかるとぶつけたボールはほぼ止まる", () => {
      const world = zeroGravityWorld();
      const a = world.spawnBall(10, 50);
      world.spawnBall(20, 50);
      a.vx = 100;
      run(world, 0.2);
      expect(Math.abs(a.vx)).toBeLessThan(10);
    });

    it("床の上で並んでも重ならない", () => {
      const world = new World(createParams());
      world.addSegment({ id: "floor", ax: 0, ay: 0, bx: 50, by: 0 });
      world.addSegment({ id: "left", ax: 20, ay: 0, bx: 20, by: 20 });
      const a = world.spawnBall(21.5, 3);
      const b = world.spawnBall(22, 8);
      run(world, 3);
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r - 0.05);
    });

    it("違うレイヤーのボール同士はぶつからない", () => {
      const world = zeroGravityWorld();
      const a = world.spawnBall(10, 50);
      const b = world.spawnBall(20, 50);
      b.layer = LAYER_RAMP;
      a.vx = 100;
      run(world, 0.2);
      expect(b.vx).toBe(0);
    });
  });

  describe("レイヤー", () => {
    const noGravity = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("別レイヤーの壁はすり抜ける", () => {
      const world = noGravity();
      world.addSegment({ id: "rail", ax: 0, ay: 0, bx: 50, by: 0, layers: LAYER_RAMP });
      const ball = world.spawnBall(25, 5);
      ball.vy = -100;
      run(world, 0.3);
      expect(ball.y).toBeLessThan(0);
    });

    it("両レイヤーの壁はランプ上のボールにも当たる", () => {
      const world = noGravity();
      world.addSegment({ id: "rail", ax: 0, ay: 0, bx: 50, by: 0, layers: LAYER_FLOOR | LAYER_RAMP });
      const ball = world.spawnBall(25, 5);
      ball.layer = LAYER_RAMP;
      ball.vy = -100;
      run(world, 0.3);
      expect(ball.y).toBeGreaterThan(0);
    });

    it("ランプ上のボールはバンパーに当たらない", () => {
      const world = noGravity();
      world.addBumper({ id: "pop", x: 25, y: 50, r: 2.5, kick: 100 });
      const ball = world.spawnBall(25, 60);
      ball.layer = LAYER_RAMP;
      ball.vy = -50;
      run(world, 0.5);
      expect(ball.y).toBeLessThan(40);
    });

    it("ゲートを法線方向に横切ると移り先のレイヤーに移る", () => {
      const world = noGravity();
      world.addLayerGate({ id: "entry", ax: 0, ay: 0, bx: 50, by: 0, from: LAYER_FLOOR, to: LAYER_RAMP, reversible: true });
      const ball = world.spawnBall(25, -3);
      ball.vy = 100;
      run(world, 0.1);
      expect(ball.layer).toBe(LAYER_RAMP);
    });

    it("戻れるゲートを逆向きに横切ると元のレイヤーに戻る", () => {
      const world = noGravity();
      world.addLayerGate({ id: "entry", ax: 0, ay: 0, bx: 50, by: 0, from: LAYER_FLOOR, to: LAYER_RAMP, reversible: true });
      const ball = world.spawnBall(25, 3);
      ball.layer = LAYER_RAMP;
      ball.vy = -100;
      run(world, 0.1);
      expect(ball.layer).toBe(LAYER_FLOOR);
    });

    it("戻れないゲートは逆向きに横切ってもレイヤーが変わらない", () => {
      const world = noGravity();
      world.addLayerGate({ id: "exit", ax: 0, ay: 0, bx: 50, by: 0, from: LAYER_RAMP, to: LAYER_FLOOR, reversible: false });
      const ball = world.spawnBall(25, 3);
      ball.vy = -100;
      run(world, 0.1);
      expect(ball.layer).toBe(LAYER_FLOOR);
    });

    it("移り元のレイヤーにいないボールはゲートを横切っても移らない", () => {
      const world = noGravity();
      world.addLayerGate({ id: "exit", ax: 0, ay: 0, bx: 50, by: 0, from: LAYER_RAMP, to: LAYER_FLOOR, reversible: false });
      const ball = world.spawnBall(25, -3);
      ball.vy = 100;
      run(world, 0.1);
      expect(world.drainEvents().filter((e) => e.type === "gate")).toEqual([]);
    });

    it("レイヤーが移ったときにイベントを出す", () => {
      const world = noGravity();
      world.addLayerGate({ id: "entry", ax: 0, ay: 0, bx: 50, by: 0, from: LAYER_FLOOR, to: LAYER_RAMP, reversible: true });
      const ball = world.spawnBall(25, -3);
      ball.vy = 100;
      run(world, 0.1);
      expect(world.drainEvents().filter((e) => e.type === "gate").map((e) => e.id)).toEqual(["entry"]);
    });
  });
});

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

    it("尖った壁の端に少しずれて乗ったボールは止まらずに転がり落ちる", () => {
      const world = new World(createParams());
      world.addSegment({ id: "post", ax: 25, ay: 0, bx: 25, by: 20 });
      const ball = world.spawnBall(25.15, 20 + 1.36);
      run(world, 3);
      expect(ball.y).toBeLessThan(15);
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

  describe("泥んこ沼", () => {
    const mudDef = { id: "mud", x: 25, y: 50, r: 4, drag: 4 };

    const zeroGravityWorld = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("中を通るボールは減速する", () => {
      const world = zeroGravityWorld();
      world.addMud(mudDef);
      const ball = world.spawnBall(25, 50);
      ball.vx = 100;
      run(world, 0.03);
      expect(ball.vx).toBeLessThan(95);
    });

    it("外を通るボールは減速しない", () => {
      const world = zeroGravityWorld();
      world.addMud(mudDef);
      const ball = world.spawnBall(25, 70);
      ball.vx = 100;
      run(world, 0.03);
      expect(ball.vx).toBe(100);
    });

    it("中で止まりきらず、重力で抜け出す", () => {
      const world = new World(createParams());
      world.addMud(mudDef);
      const ball = world.spawnBall(25, 50);
      run(world, 3);
      expect(ball.y).toBeLessThan(40);
    });

    it("入ったときに一度だけイベントを出す", () => {
      const world = zeroGravityWorld();
      world.addMud(mudDef);
      const ball = world.spawnBall(15, 50);
      ball.vx = 60;
      run(world, 0.3);
      expect(world.drainEvents().filter((e) => e.type === "hole" && e.id === "mud")).toHaveLength(1);
    });

    it("ランプの上のボールは減速しない", () => {
      const world = zeroGravityWorld();
      world.addMud(mudDef);
      const ball = world.spawnBall(25, 50);
      ball.layer = LAYER_RAMP;
      ball.vx = 100;
      run(world, 0.03);
      expect(ball.vx).toBe(100);
    });
  });

  describe("動く的", () => {
    const moverDef = { id: "bank", ax: 15, bx: 35, y: 50, r: 2, period: 4 };

    const zeroGravityWorld = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("決まった範囲を往復する", () => {
      const world = zeroGravityWorld();
      const mover = world.addMover(moverDef);
      const xs: number[] = [];
      for (let i = 0; i < 4000; i++) {
        world.step(DT);
        xs.push(mover.x);
      }
      expect([Math.min(...xs) >= 15, Math.max(...xs) <= 35, Math.max(...xs) - Math.min(...xs) > 18]).toEqual([true, true, true]);
    });

    it("動いている的は進む先にあるボールを押し出す", () => {
      const world = zeroGravityWorld();
      const mover = world.addMover(moverDef);
      const ball = world.spawnBall(mover.x + mover.r + 1.35 + 0.3, mover.y);
      run(world, 0.3);
      expect(ball.vx).toBeGreaterThan(10);
    });

    it("止まっている的はそばのボールを動かさない", () => {
      const world = zeroGravityWorld();
      const mover = world.addMover({ ...moverDef, period: 0 });
      const ball = world.spawnBall(mover.x + mover.r + 1.35 + 0.3, mover.y);
      run(world, 0.3);
      expect(ball.vx).toBe(0);
    });

    it("消している間は当たらない", () => {
      const world = zeroGravityWorld();
      const mover = world.addMover({ ...moverDef, period: 0 });
      mover.enabled = false;
      const ball = world.spawnBall(25, 44);
      ball.vy = 60;
      run(world, 0.3);
      expect(ball.y).toBeGreaterThan(55);
    });

    it("当たると接触イベントを出す", () => {
      const world = zeroGravityWorld();
      world.addMover({ ...moverDef, period: 0 });
      const ball = world.spawnBall(25, 44);
      ball.vy = 60;
      run(world, 0.3);
      expect(world.drainEvents().some((e) => e.type === "contact" && e.id === "bank")).toBe(true);
    });

    it("スナップショットを復元すると位置が戻る", () => {
      const world = zeroGravityWorld();
      const mover = world.addMover(moverDef);
      const snapshot = world.snapshot();
      const before = mover.x;
      run(world, 0.5);
      world.restore(snapshot);
      expect(mover.x).toBe(before);
    });
  });

  describe("穴と固定", () => {
    const zeroGravityWorld = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("穴に入ると一度だけイベントを出す", () => {
      const world = zeroGravityWorld();
      world.addHole({ id: "navel", x: 25, y: 50, r: 1.5 });
      const ball = world.spawnBall(25, 45);
      ball.vy = 30;
      run(world, 0.5);
      expect(world.drainEvents().filter((e) => e.type === "hole")).toHaveLength(1);
    });

    it("固定したボールは動かない", () => {
      const world = new World(createParams());
      const ball = world.spawnBall(25, 50);
      ball.frozen = true;
      run(world, 0.5);
      expect([ball.x, ball.y]).toEqual([25, 50]);
    });

    it("固定したボールには他のボールも当たらない", () => {
      const world = zeroGravityWorld();
      const held = world.spawnBall(25, 50);
      held.frozen = true;
      const other = world.spawnBall(20, 50);
      other.vx = 50;
      run(world, 0.3);
      expect(other.x).toBeGreaterThan(30);
    });
  });

  describe("ぽよんお腹", () => {
    const bounceOff = (kind: "wall" | "belly", speed: number) => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addSegment({ id: "side", ax: 0, ay: 40, bx: 0, by: 60, kind });
      const ball = world.spawnBall(5, 50);
      ball.vx = -speed;
      run(world, 0.2);
      return ball.vx;
    };

    it("当たる前より速く跳ね返す", () => {
      expect(bounceOff("belly", 80)).toBeGreaterThan(80);
    });

    it("普通の壁より強く跳ね返す", () => {
      expect(bounceOff("belly", 80)).toBeGreaterThan(bounceOff("wall", 80) * 2);
    });

    it("そっと触れただけでは接触イベントを出さない", () => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addSegment({ id: "side", ax: 0, ay: 40, bx: 0, by: 60, kind: "belly" });
      const ball = world.spawnBall(1.4, 50);
      ball.vx = -2;
      run(world, 0.2);
      expect(world.drainEvents()).toEqual([]);
    });

    it("そっと触れただけでは弾まない", () => {
      expect(bounceOff("belly", 3)).toBeLessThan(3);
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

    const hitTwice = (gap: number) => {
      const params = createParams();
      params.gravity = 0;
      const world = new World(params);
      world.addBumper({ id: "pop", x: 25, y: 50, r: 2.5, kick: 100 });
      const ball = world.spawnBall(25, 54);
      ball.vy = -20;
      run(world, 0.02);
      run(world, gap);
      world.drainEvents();
      Object.assign(ball, { x: 25, y: 54, prevX: 25, prevY: 54, vx: 0, vy: -20 });
      run(world, 0.02);
      return { ball, events: world.drainEvents() };
    };

    it("弾いた直後にもう一度当たってもキックしない", () => {
      const { ball } = hitTwice(0);
      expect(ball.vy).toBeLessThan(50);
    });

    it("弾いた直後にもう一度当たっても接触イベントを出さない", () => {
      const { events } = hitTwice(0);
      expect(events.filter((e) => e.id === "pop")).toEqual([]);
    });

    it("少し間をおけば再びキックする", () => {
      const { ball } = hitTwice(0.2);
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
    const ballJustBeyondTip = (world: World) => {
      const reach = leftFlipper.length + leftFlipper.tipRadius + 1.35 + 0.25;
      return world.spawnBall(leftFlipper.x + reach, leftFlipper.y);
    };

    const zeroGravity = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    it("振り上げ中は先端をわずかに越えたボールにも当たる", () => {
      const world = zeroGravity();
      const flipper = world.addFlipper(leftFlipper);
      const ball = ballJustBeyondTip(world);
      flipper.pressed = true;
      run(world, 0.1);
      expect(ball.vy).toBeGreaterThan(50);
    });

    it("止まっているフリッパーの当たり判定は広がらない", () => {
      const world = zeroGravity();
      world.addFlipper({ ...leftFlipper, restAngle: 0, activeAngle: 0 });
      const ball = ballJustBeyondTip(world);
      run(world, 0.1);
      expect([ball.x, ball.y]).toEqual([ballJustBeyondTip(new World(createParams())).x, leftFlipper.y]);
    });

    it("振り上げ中でも裏側にあるボールは押し出さない", () => {
      const world = zeroGravity();
      const flipper = world.addFlipper(leftFlipper);
      const tipY = leftFlipper.y + Math.sin(leftFlipper.restAngle) * leftFlipper.length;
      const tipX = leftFlipper.x + Math.cos(leftFlipper.restAngle) * leftFlipper.length;
      const ball = world.spawnBall(tipX, tipY - leftFlipper.tipRadius - 1.35 - 0.25);
      flipper.pressed = true;
      run(world, 0.1);
      expect([ball.vx, ball.vy]).toEqual([0, 0]);
    });

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

  describe("風車", () => {
    const rotorDef = { id: "rotor", x: 25, y: 50, arms: 4, armLength: 3.5, armRadius: 0.45, inertia: 30, damping: 0.8, restitution: 0.5 };

    const zeroGravityWorld = () => {
      const params = createParams();
      params.gravity = 0;
      return new World(params);
    };

    const shootAtArmTip = (world: World) => {
      const ball = world.spawnBall(25 + 3, 44);
      ball.vy = 80;
      return ball;
    };

    it("腕の先に当たると回り出す", () => {
      const world = zeroGravityWorld();
      const rotor = world.addRotor(rotorDef);
      shootAtArmTip(world);
      run(world, 0.2);
      expect(Math.abs(rotor.omega)).toBeGreaterThan(1);
    });

    it("回転はだんだん遅くなる", () => {
      const world = zeroGravityWorld();
      const rotor = world.addRotor(rotorDef);
      rotor.omega = 10;
      run(world, 1);
      expect(rotor.omega).toBeLessThan(5);
    });

    it("角度によって跳ね返る向きが変わる", () => {
      const bounce = (angle: number) => {
        const world = zeroGravityWorld();
        world.addRotor(rotorDef).angle = angle;
        const ball = world.spawnBall(25.8, 44);
        ball.vy = 80;
        run(world, 0.2);
        return Math.sign(ball.vx);
      };
      expect([bounce(0), bounce(Math.PI / 9)]).toEqual([1, -1]);
    });

    it("向かってくる腕に当たると、止まっている腕より強く弾かれる", () => {
      const reboundSpeed = (omega: number) => {
        const world = zeroGravityWorld();
        world.addRotor(rotorDef).omega = omega;
        const ball = shootAtArmTip(world);
        run(world, 0.3);
        return Math.hypot(ball.vx, ball.vy);
      };
      expect(reboundSpeed(-8)).toBeGreaterThan(reboundSpeed(0));
    });

    it("当たると接触イベントを出す", () => {
      const world = zeroGravityWorld();
      world.addRotor(rotorDef);
      shootAtArmTip(world);
      run(world, 0.2);
      expect(world.drainEvents().some((e) => e.type === "contact" && e.id === "rotor")).toBe(true);
    });

    it("スナップショットを復元すると角度と角速度が戻る", () => {
      const world = zeroGravityWorld();
      const rotor = world.addRotor(rotorDef);
      rotor.omega = 5;
      const snapshot = world.snapshot();
      run(world, 0.3);
      world.restore(snapshot);
      expect([rotor.angle, rotor.omega]).toEqual([0, 5]);
    });
  });

  describe("スナップショット", () => {
    it("復元するとボールの位置と速度が戻る", () => {
      const world = new World(createParams());
      const ball = world.spawnBall(25, 50);
      const snapshot = world.snapshot();
      run(world, 0.1);
      world.restore(snapshot);
      expect([ball.x, ball.y, ball.vx, ball.vy]).toEqual([25, 50, 0, 0]);
    });

    it("復元するとフリッパーの角度が戻る", () => {
      const world = new World(createParams());
      const flipper = world.addFlipper(leftFlipper);
      const snapshot = world.snapshot();
      flipper.pressed = true;
      run(world, 0.1);
      world.restore(snapshot);
      expect(flipper.angle).toBe(leftFlipper.restAngle);
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

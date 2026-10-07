import { describe, expect, it } from "vitest";
import { createParams } from "../physics/params";
import { LAYER_FLOOR } from "../physics/world";
import { Game, type GameEvent, type ScoreStorage } from "./game";
import { DRAIN_Y, SHOOTER_X } from "./table";

const DT = 1 / 960;

const memoryStorage = (initial = 0): ScoreStorage & { value: number } => ({
  value: initial,
  load() {
    return this.value;
  },
  save(score) {
    this.value = score;
  },
});

const run = (game: Game, seconds: number) => {
  for (let i = 0; i < Math.round(seconds / DT); i++) game.step(DT);
};

const newGame = (storage = memoryStorage()) => new Game(createParams(), storage);

const ball = (game: Game) => game.world.balls[0];

const place = (game: Game, x: number, y: number, vx = 0, vy = 0) => {
  Object.assign(ball(game), { x, y, vx, vy, prevX: x, prevY: y });
};

const drain = (game: Game) => {
  place(game, 23, DRAIN_Y - 1, 0, -10);
  game.step(DT);
};

describe("Game", () => {
  it("3ボールで、ボールがシューターレーンに置かれた状態で始まる", () => {
    const game = newGame();
    expect([game.ballsLeft, game.state, ball(game).x]).toEqual([3, "ready", SHOOTER_X]);
  });

  describe("打ち出し", () => {
    const pullAndRelease = (game: Game, seconds: number) => {
      game.setPlunger(true);
      run(game, seconds);
      game.setPlunger(false);
      run(game, 1.5);
    };

    it("ボールがシューターレーンを出るとプレイ中になる", () => {
      const game = newGame();
      pullAndRelease(game, 1.2);
      expect(game.state).toBe("playing");
    });

    it("ボールがシューターレーンを出るとボールセーブが始まる", () => {
      const game = newGame();
      pullAndRelease(game, 1.2);
      expect(game.ballSaveActive).toBe(true);
    });

    it("弱く打ってレーンに戻ってきたら打ち直せる", () => {
      const game = newGame();
      pullAndRelease(game, 0.2);
      expect(game.state).toBe("ready");
    });

    it("弱く打ってレーンに戻ってきてもボールセーブは始まらない", () => {
      const game = newGame();
      pullAndRelease(game, 0.2);
      expect(game.ballSaveActive).toBe(false);
    });
  });

  describe("実際の台での通しプレイ", () => {
    const launch = (game: Game) => {
      game.setPlunger(true);
      run(game, 1.2);
      game.setPlunger(false);
    };

    it("フルパワーで打ち出したボールはシューターレーンを抜けてプレイフィールドに入る", () => {
      const game = newGame();
      launch(game);
      run(game, 1.5);
      expect(ball(game).x).toBeLessThan(46);
    });

    it("フリッパーを触らなければボールはどこにも引っかからずドレインする", () => {
      const game = newGame();
      launch(game);
      run(game, 30);
      expect(game.state).toBe("ready");
    });

    it("台のどこから落としても引っかからずにドレインする", () => {
      const stuck: string[] = [];
      for (let x = 5; x <= 41; x += 4) {
        for (let y = 30; y <= 85; y += 5) {
          const game = newGame();
          place(game, x, y);
          for (let t = 0; t < 20 && game.ballsLeft === 3; t += DT) game.step(DT);
          if (game.ballsLeft === 3) stuck.push(`${x},${y}`);
        }
      }
      expect(stuck).toEqual([]);
    });
  });

  describe("ドレイン", () => {
    it("ボールセーブ中ならボール数を減らさずシューターに戻す", () => {
      const game = newGame();
      game.setPlunger(true);
      run(game, 1.2);
      game.setPlunger(false);
      run(game, 1.5);
      drain(game);
      expect(game.ballsLeft).toBe(3);
    });

    it("ボールセーブが切れていればボール数を1つ減らす", () => {
      const game = newGame();
      drain(game);
      expect(game.ballsLeft).toBe(2);
    });

    it("次のボールをシューターレーンに置く", () => {
      const game = newGame();
      drain(game);
      expect([game.state, ball(game).x]).toEqual(["ready", SHOOTER_X]);
    });

    it("最後のボールを落とすとゲームオーバーになる", () => {
      const game = newGame();
      drain(game);
      drain(game);
      drain(game);
      expect(game.state).toBe("over");
    });

    it("ゲームオーバー時にハイスコアを更新して保存する", () => {
      const storage = memoryStorage(10);
      const game = newGame(storage);
      game.addScore(500);
      drain(game);
      drain(game);
      drain(game);
      expect(storage.value).toBe(500);
    });

    it("ハイスコアに届かなければ保存しない", () => {
      const storage = memoryStorage(1000);
      const game = newGame(storage);
      game.addScore(500);
      drain(game);
      drain(game);
      drain(game);
      expect(storage.value).toBe(1000);
    });
  });

  it("ゲームオーバー後にリスタートすると初期状態に戻る", () => {
    const game = newGame();
    game.addScore(500);
    drain(game);
    drain(game);
    drain(game);
    game.restart();
    expect([game.score, game.ballsLeft, game.state]).toEqual([0, 3, "ready"]);
  });

  it("バンパーに当てると100点", () => {
    const game = newGame();
    const bumper = game.layout.bumpers[0];
    place(game, bumper.x, bumper.y + bumper.r + 2, 0, -30);
    run(game, 0.1);
    expect(game.score).toBe(100);
  });

  describe("ドロップターゲット", () => {
    const hitTarget = (game: Game, index: number) => {
      const target = game.layout.targets[index];
      place(game, target.ax + 2, (target.ay + target.by) / 2, -60, 0);
      run(game, 0.05);
    };

    it("当てると倒れて500点", () => {
      const game = newGame();
      hitTarget(game, 0);
      expect([game.score, game.isTargetDown(0)]).toEqual([500, true]);
    });

    it("全部倒すとボーナスが入る", () => {
      const game = newGame();
      hitTarget(game, 0);
      hitTarget(game, 1);
      hitTarget(game, 2);
      expect(game.score).toBe(500 * 3 + 5000);
    });

    it("全部倒したあと少しすると起き上がる", () => {
      const game = newGame();
      hitTarget(game, 0);
      hitTarget(game, 1);
      hitTarget(game, 2);
      place(game, 25, 40);
      run(game, 1.5);
      expect(game.isTargetDown(0)).toBe(false);
    });
  });

  describe("ロールオーバーレーン", () => {
    const passLane = (game: Game, index: number) => {
      const lane = game.layout.rollovers[index];
      place(game, (lane.ax + lane.bx) / 2, lane.ay + 1.5, 0, -40);
      run(game, 0.05);
    };

    it("通過するとレーンが点灯する", () => {
      const game = newGame();
      passLane(game, 1);
      expect(game.litLanes).toEqual([false, true, false]);
    });

    it("全レーンを点灯させると倍率が上がり、点灯がリセットされる", () => {
      const game = newGame();
      passLane(game, 0);
      passLane(game, 1);
      passLane(game, 2);
      expect([game.multiplier, game.litLanes]).toEqual([2, [false, false, false]]);
    });

    it("倍率はスコアに掛かる", () => {
      const game = newGame();
      passLane(game, 0);
      passLane(game, 1);
      passLane(game, 2);
      const before = game.score;
      game.addScore(100);
      expect(game.score - before).toBe(200);
    });

    it("左フリッパーを押すと点灯中のレーンが左にずれる", () => {
      const game = newGame();
      passLane(game, 1);
      game.setFlipper("left", true);
      expect(game.litLanes).toEqual([true, false, false]);
    });

    it("右フリッパーを押すと点灯中のレーンが右にずれる", () => {
      const game = newGame();
      passLane(game, 1);
      game.setFlipper("right", true);
      expect(game.litLanes).toEqual([false, false, true]);
    });
  });

  describe("スキルショット", () => {
    const passLane = (game: Game, index: number) => {
      const lane = game.layout.rollovers[index];
      place(game, (lane.ax + lane.bx) / 2, lane.ay + 1.5, 0, -40);
      run(game, 0.05);
    };

    const hitBumper = (game: Game) => {
      const bumper = game.layout.bumpers[0];
      place(game, bumper.x, bumper.y + bumper.r + 2, 0, -30);
      run(game, 0.1);
    };

    it("ボールを置いた直後はスキルショットが点灯している", () => {
      const game = newGame();
      expect(game.skillShotLit).toBe(true);
    });

    it("最初に通った得点要素がロールオーバーならボーナスが入る", () => {
      const game = newGame();
      passLane(game, 1);
      expect(game.score).toBe(200 + 10000);
    });

    it("先にバンパーに当たるとスキルショットは消える", () => {
      const game = newGame();
      hitBumper(game);
      expect(game.skillShotLit).toBe(false);
    });

    it("取れるのは1ボールにつき1回だけ", () => {
      const game = newGame();
      passLane(game, 0);
      passLane(game, 1);
      expect(game.score).toBe(200 * 2 + 10000);
    });

    it("次のボールで再び点灯する", () => {
      const game = newGame();
      hitBumper(game);
      drain(game);
      expect(game.skillShotLit).toBe(true);
    });

    it("ボールセーブで戻ったボールでも再び点灯する", () => {
      const game = newGame();
      game.setPlunger(true);
      run(game, 1.2);
      game.setPlunger(false);
      run(game, 1.5);
      drain(game);
      expect(game.skillShotLit).toBe(true);
    });

    it("実際の台で引き量を加減して打つと取れる", () => {
      const game = newGame();
      game.setPlunger(true);
      run(game, 0.75);
      game.setPlunger(false);
      const kinds: string[] = [];
      for (let t = 0; t < 3; t += DT) {
        game.step(DT);
        kinds.push(...game.drainEvents().map((e) => e.kind));
      }
      expect(kinds).toContain("skill");
    });
  });

  it("スピナーを勢いよく通すと回転数に応じて点が入る", () => {
    const game = newGame();
    const spinner = game.layout.spinner;
    place(game, (spinner.ax + spinner.bx) / 2, spinner.ay - 2, 0, 200);
    run(game, 0.02);
    place(game, 25, 40);
    run(game, 2);
    expect(game.score).toBeGreaterThan(100);
  });

  describe("ランプ", () => {
    const shootRamp = (game: Game, speed: number) => {
      const [[x0, y0], [x1, y1]] = game.layout.ramp.path;
      const len = Math.hypot(x1 - x0, y1 - y0);
      const [tx, ty] = [(x1 - x0) / len, (y1 - y0) / len];
      place(game, x0 - tx * 3, y0 - ty * 3, tx * speed, ty * speed);
    };

    const runCollecting = (game: Game, seconds: number) => {
      const events: GameEvent[] = [];
      const positions: [number, number][] = [];
      for (let i = 0; i < Math.round(seconds / DT); i++) {
        game.step(DT);
        for (const event of game.drainEvents()) {
          events.push(event);
          if (event.kind === "ramp") positions.push([ball(game).x, ball(game).y]);
        }
      }
      return { events, positions };
    };

    it("登りきると得点が入る", () => {
      const game = newGame();
      shootRamp(game, 280);
      runCollecting(game, 3);
      expect(game.score).toBeGreaterThanOrEqual(2500);
    });

    it("登りきったボールは左のインレーンに落ちてくる", () => {
      const game = newGame();
      shootRamp(game, 280);
      const { positions } = runCollecting(game, 3);
      expect(positions[0][0]).toBeLessThan(9);
    });

    it("登りきったボールは床のレイヤーに戻る", () => {
      const game = newGame();
      shootRamp(game, 280);
      runCollecting(game, 3);
      expect(ball(game)?.layer ?? LAYER_FLOOR).toBe(LAYER_FLOOR);
    });

    it("勢いが足りないと転がり戻って床のレイヤーに戻る", () => {
      const game = newGame();
      shootRamp(game, 110);
      const { events } = runCollecting(game, 2);
      expect([events.some((e) => e.kind === "ramp"), ball(game)?.layer ?? LAYER_FLOOR]).toEqual([false, LAYER_FLOOR]);
    });

    it("続けて通すとコンボで得点が増える", () => {
      const game = newGame();
      shootRamp(game, 280);
      runCollecting(game, 1.6);
      const first = game.score;
      shootRamp(game, 280);
      runCollecting(game, 1.6);
      const gained = game.score - first;
      expect(gained >= 5000 && gained < 7500).toBe(true);
    });
  });

  describe("チルト", () => {
    it("短時間に揺らしすぎるとフリッパーが効かなくなる", () => {
      const game = newGame();
      for (let i = 0; i < 6; i++) game.nudge(1, 0);
      game.setFlipper("left", true);
      expect([game.tilted, game.world.flippers[0].pressed]).toEqual([true, false]);
    });

    it("間隔をあけて揺らせばチルトしない", () => {
      const game = newGame();
      for (let i = 0; i < 6; i++) {
        game.nudge(1, 0);
        run(game, 1);
      }
      expect(game.tilted).toBe(false);
    });

    it("次のボールでチルトが解除される", () => {
      const game = newGame();
      for (let i = 0; i < 6; i++) game.nudge(1, 0);
      drain(game);
      expect(game.tilted).toBe(false);
    });
  });
});

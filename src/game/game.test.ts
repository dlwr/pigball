import { describe, expect, it } from "vitest";
import { createParams } from "../physics/params";
import { type Ball, LAYER_FLOOR } from "../physics/world";
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

const shootRamp = (game: Game, speed: number) => {
    const [[x0, y0], [x1, y1]] = game.layout.ramp.path;
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [tx, ty] = [(x1 - x0) / len, (y1 - y0) / len];
    place(game, x0 - tx * 3, y0 - ty * 3, tx * speed, ty * speed);
  };

const completeRamps = (game: Game, times: number) => {
  for (let i = 0; i < times; i++) {
    shootRamp(game, 280);
    let completed = false;
    for (let t = 0; t < 3 && !completed; t += DT) {
      game.step(DT);
      completed = game.drainEvents().some((e) => e.kind === "ramp");
    }
  }
};

const completeRampsWithoutCombo = (game: Game, times: number) => {
  for (let i = 0; i < times; i++) {
    completeRamps(game, 1);
    place(game, SHOOTER_X, game.layout.plunger.restY + ball(game).r + 0.01);
    run(game, 4.1);
  }
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
    }, 30_000);
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

  describe("エクストラボール", () => {
    it("1ゲームでランプを5回通すと獲得する", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 5);
      expect(game.extraBalls).toBe(1);
    });

    it("獲得できるのは1ゲームに1回だけ", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 10);
      expect(game.extraBalls).toBe(1);
    });

    it("持っていればドレインしてもボール数が減らない", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 5);
      drain(game);
      expect([game.ballsLeft, game.extraBalls]).toEqual([3, 0]);
    });

    it("使ったあとのドレインではボール数が減る", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 5);
      drain(game);
      drain(game);
      expect(game.ballsLeft).toBe(2);
    });

    it("リスタートすると再び獲得できる", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 5);
      drain(game);
      game.restart();
      completeRampsWithoutCombo(game, 5);
      expect(game.extraBalls).toBe(1);
    });
  });

  describe("ボーナス", () => {
    const hitBumper = (game: Game) => {
      const bumper = game.layout.bumpers[0];
      place(game, bumper.x, bumper.y + bumper.r + 2, 0, -30);
      run(game, 0.1);
    };

    it("ドレインするとそのボールで貯めたボーナスが加算される", () => {
      const game = newGame();
      hitBumper(game);
      drain(game);
      expect(game.score).toBe(100 + 50);
    });

    it("ボーナスにも倍率が掛かる", () => {
      const game = newGame();
      game.multiplier = 3;
      hitBumper(game);
      const before = game.score;
      drain(game);
      expect(game.score - before).toBe(50 * 3);
    });

    it("チルトしたボールのボーナスは入らない", () => {
      const game = newGame();
      hitBumper(game);
      for (let i = 0; i < 6; i++) game.nudge(1, 0);
      drain(game);
      expect(game.score).toBe(100);
    });

    it("次のボールでは0から貯め直す", () => {
      const game = newGame();
      hitBumper(game);
      drain(game);
      const before = game.score;
      drain(game);
      expect(game.score).toBe(before);
    });
  });

  describe("マルチボール", () => {
    const startMultiball = (game: Game) => {
      completeRamps(game, 3);
    };

    const removeBall = (game: Game, target: Ball) => {
      Object.assign(target, { x: 23, y: DRAIN_Y - 1, prevX: 23, prevY: DRAIN_Y - 1, vx: 0, vy: -10 });
      game.step(DT);
    };

    const runUntilBallSaveEnds = (game: Game) => {
      for (let t = 0; t < 20 && game.ballSaveActive; t += DT) game.step(DT);
    };

    const drainUntilOneLeft = (game: Game) => {
      for (let t = 0; t < 5 && game.ballsInPlay > 1; t += DT) {
        if (game.world.balls.length > 1) removeBall(game, ball(game));
        else game.step(DT);
      }
    };

    it("コンボでなくてもランプを合計3回通すと始まる", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 3);
      expect(game.inMultiball).toBe(true);
    });

    it("ランプ2回では始まらない", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 2);
      expect(game.inMultiball).toBe(false);
    });

    it("終わったあとは改めてランプを3回通すまで始まらない", () => {
      const game = newGame();
      startMultiball(game);
      runUntilBallSaveEnds(game);
      drainUntilOneLeft(game);
      completeRampsWithoutCombo(game, 2);
      expect(game.inMultiball).toBe(false);
    });

    it("始まると追加のボールが2個打ち出される", () => {
      const game = newGame();
      startMultiball(game);
      game.drainEvents();
      let launches = 0;
      for (let t = 0; t < 1.5; t += DT) {
        game.step(DT);
        launches += game.drainEvents().filter((e) => e.kind === "launch").length;
      }
      expect(launches).toBe(2);
    });

    it("打ち出されたボールはシューターレーンを出てプレイフィールドに入る", () => {
      const game = newGame();
      startMultiball(game);
      run(game, 2);
      expect(game.world.balls.filter((b) => b.x > 46)).toEqual([]);
    });

    it("始まるとボールセーブが付く", () => {
      const game = newGame();
      startMultiball(game);
      expect(game.ballSaveActive).toBe(true);
    });

    it("ボールセーブ中に落ちたボールは打ち直される", () => {
      const game = newGame();
      startMultiball(game);
      run(game, 2);
      removeBall(game, ball(game));
      expect(game.ballsInPlay).toBe(3);
    });

    it("ボールセーブが切れたあとは、最後の1個になるまで落ちてもボール数は減らない", () => {
      const game = newGame();
      startMultiball(game);
      runUntilBallSaveEnds(game);
      drainUntilOneLeft(game);
      expect(game.ballsLeft).toBe(3);
    });

    it("最後の1個になると終わる", () => {
      const game = newGame();
      startMultiball(game);
      runUntilBallSaveEnds(game);
      drainUntilOneLeft(game);
      expect(game.inMultiball).toBe(false);
    });

    it("最中にランプを通すとジャックポットが入る", () => {
      const game = newGame();
      startMultiball(game);
      const before = game.score;
      completeRamps(game, 1);
      expect(game.score - before).toBeGreaterThanOrEqual(20000);
    });

    it("終わったあとの次のボールを弱く打ってもボールセーブは付かない", () => {
      const game = newGame();
      startMultiball(game);
      for (let t = 0; t < 40 && game.ballsLeft === 3; t += DT) game.step(DT);
      game.setPlunger(true);
      run(game, 0.2);
      game.setPlunger(false);
      run(game, 1.5);
      expect(game.ballSaveActive).toBe(false);
    });
  });

  describe("キックバックで打ち返したボールの行き先", () => {
    const firstDescent = (game: Game, x: number, vx: number, vy: number) => {
      place(game, x, 26, vx, vy);
      let kicked = false;
      for (let t = 0; t < 8; t += DT) {
        game.step(DT);
        kicked ||= game.drainEvents().some((e) => e.kind === "kickback");
        const b = ball(game);
        if (!b || game.ballsLeft < 3) return "drain";
        if (kicked && b.vy < 0 && b.y < 25) return b.x < 4.5 ? "left" : b.x > 41.5 ? "right" : "playfield";
      }
      return "stuck";
    };

    const entries = [-20, -10, 0, 10, 20].flatMap((vx) => [-20, -60, -100, -140].map((vy) => [vx, vy] as const));

    it("左から打ち返したボールは右のアウトレーンへ流れない", () => {
      const results = entries.map(([vx, vy]) => firstDescent(newGame(), 2, vx, vy));
      expect(results.filter((r) => r === "right")).toEqual([]);
    });

    it("右から打ち返したボールは左のアウトレーンへ流れない", () => {
      const results = entries.map(([vx, vy]) => {
        const game = newGame();
        game.kickbacksLit.right = true;
        return firstDescent(game, 44, vx, vy);
      });
      expect(results.filter((r) => r === "left")).toEqual([]);
    });
  });

  describe("右のキックバック", () => {
    const dropIntoRightOutlane = (game: Game) => {
      place(game, 44, 26, 0, -40);
      let kicked = false;
      let returned = false;
      for (let t = 0; t < 1.5 && !returned && game.ballsLeft === 3; t += DT) {
        game.step(DT);
        kicked ||= game.drainEvents().some((e) => e.kind === "kickback");
        const b = ball(game);
        returned = kicked && !!b && b.vy < 0 && b.x > 42 && b.x < 46 && b.y < 30;
      }
      return { kicked, returned };
    };

    const spinHard = (game: Game, passes: number) => {
      const spinner = game.layout.spinner;
      for (let i = 0; i < passes; i++) {
        place(game, (spinner.ax + spinner.bx) / 2, spinner.ay - 2, 0, 300);
        run(game, 0.02);
        place(game, SHOOTER_X, game.layout.plunger.restY + ball(game).r + 0.01);
        run(game, 3);
      }
    };

    it("ゲーム開始時は消えている", () => {
      const game = newGame();
      expect(game.kickbacksLit.right).toBe(false);
    });

    it("スピナーを合計20回転させると点灯する", () => {
      const game = newGame();
      spinHard(game, 2);
      expect(game.kickbacksLit.right).toBe(true);
    });

    it("点灯中に右アウトレーンに落ちたボールは打ち返されてアウトレーンに戻らない", () => {
      const game = newGame();
      spinHard(game, 2);
      expect(dropIntoRightOutlane(game)).toEqual({ kicked: true, returned: false });
    });

    it("一度使うと消える", () => {
      const game = newGame();
      spinHard(game, 2);
      dropIntoRightOutlane(game);
      expect(game.kickbacksLit.right).toBe(false);
    });

    it("消えているときは打ち返さない", () => {
      const game = newGame();
      expect(dropIntoRightOutlane(game).kicked).toBe(false);
    });

    it("リスタートすると消える", () => {
      const game = newGame();
      spinHard(game, 2);
      game.restart();
      expect(game.kickbacksLit.right).toBe(false);
    });
  });

  describe("キックバック", () => {
    const dropIntoLeftOutlane = (game: Game) => {
      place(game, 2, 26, 0, -40);
      let highest = 0;
      for (let t = 0; t < 2 && game.ballsLeft === 3; t += DT) {
        game.step(DT);
        highest = Math.max(highest, ball(game)?.y ?? 0);
      }
      return highest;
    };

    const knockDownBank = (game: Game) => {
      for (const target of game.layout.targets) {
        place(game, target.ax + 2, (target.ay + target.by) / 2, -60, 0);
        run(game, 0.05);
      }
    };

    it("ゲーム開始時は点灯している", () => {
      const game = newGame();
      expect(game.kickbacksLit.left).toBe(true);
    });

    it("点灯中に左アウトレーンに落ちたボールはプレイフィールドに打ち返される", () => {
      const game = newGame();
      expect(dropIntoLeftOutlane(game)).toBeGreaterThan(40);
    });

    it("打ち返されたボールはアウトレーンに戻ってこない", () => {
      const game = newGame();
      place(game, 2, 26, 0, -40);
      let kicked = false;
      let returned = false;
      for (let t = 0; t < 1.5 && !returned; t += DT) {
        game.step(DT);
        kicked ||= game.drainEvents().some((e) => e.kind === "kickback");
        const b = ball(game);
        returned = kicked && !!b && b.vy < 0 && b.x < 4 && b.y < 30;
      }
      expect([kicked, returned]).toEqual([true, false]);
    });

    it("一度使うと消える", () => {
      const game = newGame();
      dropIntoLeftOutlane(game);
      expect(game.kickbacksLit.left).toBe(false);
    });

    it("消えているときはそのままドレインする", () => {
      const game = newGame();
      dropIntoLeftOutlane(game);
      run(game, 0.5);
      dropIntoLeftOutlane(game);
      expect(game.ballsLeft).toBe(2);
    });

    it("ターゲットバンクを倒しきると再び点灯する", () => {
      const game = newGame();
      dropIntoLeftOutlane(game);
      knockDownBank(game);
      expect(game.kickbacksLit.left).toBe(true);
    });

    it("リスタートすると再び点灯する", () => {
      const game = newGame();
      dropIntoLeftOutlane(game);
      game.restart();
      expect(game.kickbacksLit.left).toBe(true);
    });
  });

  describe("入力遅延の補正", () => {
    const rollOffLeftFlipper = (game: Game) => place(game, 16, 13.5);

    const timeToFallPastFlipper = () => {
      const game = newGame();
      rollOffLeftFlipper(game);
      let t = 0;
      while (ball(game).y > 6) {
        game.step(DT);
        t += DT;
      }
      return t;
    };

    it("押す少し前に先端から転がり落ちかけたボールも打ち返せる", () => {
      const pressAt = timeToFallPastFlipper() - 0.095;
      const game = newGame();
      rollOffLeftFlipper(game);
      let hit = false;
      for (let t = 0; t < pressAt + 0.5 && !hit; t += DT) {
        if (t >= pressAt) game.setFlipper("left", true);
        game.step(DT);
        hit = ball(game).vy > 40 && ball(game).y > 8;
      }
      expect(hit).toBe(true);
    });

    it("押した瞬間からフリッパーが上がり始めている", () => {
      const game = newGame();
      run(game, 0.1);
      game.setFlipper("left", true);
      expect(game.world.flippers[0].angle).toBeGreaterThan(game.layout.flippers.left.restAngle);
    });

    it("直前に得点要素に当たっていたら巻き戻さず、二重に得点しない", () => {
      const game = newGame();
      const [ax, ay, bx, by] = [7.8, 29, 12.3, 19.5];
      const [mx, my] = [(ax + bx) / 2, (ay + by) / 2];
      place(game, mx + 3, my + 1, -60, 0);
      let slung = false;
      for (let t = 0; t < 0.5 && !slung; t += DT) {
        game.step(DT);
        slung = game.drainEvents().some((e) => e.kind === "sling");
      }
      game.setFlipper("left", true);
      expect(game.score).toBe(10);
    });
  });

  describe("リザルト", () => {
    const knockDownBank = (game: Game) => {
      for (const target of game.layout.targets) {
        place(game, target.ax + 2, (target.ay + target.by) / 2, -60, 0);
        run(game, 0.05);
      }
    };

    const endGame = (game: Game) => {
      drain(game);
      drain(game);
      drain(game);
    };

    it("ランプを通した回数を数える", () => {
      const game = newGame();
      completeRampsWithoutCombo(game, 2);
      expect(game.stats.ramps).toBe(2);
    });

    it("ターゲットバンクを倒しきった回数を数える", () => {
      const game = newGame();
      knockDownBank(game);
      expect(game.stats.banks).toBe(1);
    });

    it("ジャックポットの回数を数える", () => {
      const game = newGame();
      completeRamps(game, 4);
      expect(game.stats.jackpots).toBe(1);
    });

    it("スキルショットの回数を数える", () => {
      const game = newGame();
      const lane = game.layout.rollovers[1];
      place(game, (lane.ax + lane.bx) / 2, lane.ay + 1.5, 0, -40);
      run(game, 0.05);
      expect(game.stats.skillShots).toBe(1);
    });

    it("ハイスコアを超えて終わると新記録になる", () => {
      const game = newGame(memoryStorage(100));
      game.addScore(500);
      endGame(game);
      expect(game.newHighScore).toBe(true);
    });

    it("ハイスコアに届かずに終わると新記録にならない", () => {
      const game = newGame(memoryStorage(1000));
      game.addScore(500);
      endGame(game);
      expect(game.newHighScore).toBe(false);
    });

    it("リスタートすると回数と新記録が戻る", () => {
      const game = newGame(memoryStorage(100));
      completeRampsWithoutCombo(game, 1);
      game.addScore(500);
      endGame(game);
      game.restart();
      expect([game.stats.ramps, game.newHighScore]).toEqual([0, false]);
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

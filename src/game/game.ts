import type { PhysicsParams } from "../physics/params";
import { type Ball, type Flipper, LAYER_FLOOR, type PhysicsEvent, type Segment, World, type WorldSnapshot } from "../physics/world";
import { BALL_RADIUS, DRAIN_Y, PLAYFIELD_WIDTH, SHOOTER_X, type TableLayout, createLayout } from "./table";

export interface ScoreStorage {
  load(): number;
  save(score: number): void;
}

export type GameState = "ready" | "playing" | "over";

export type GameEventKind =
  | "bumper"
  | "sling"
  | "wall"
  | "flipper"
  | "target"
  | "bank"
  | "rollover"
  | "lanes"
  | "skill"
  | "spin"
  | "rampEnter"
  | "ramp"
  | "launch"
  | "save"
  | "kickback"
  | "multiball"
  | "jackpot"
  | "extraBall"
  | "shootAgain"
  | "drain"
  | "bonus"
  | "tilt"
  | "over";

export interface GameEvent {
  kind: GameEventKind;
  id?: string;
  x: number;
  y: number;
  speed: number;
}

const BALLS_PER_GAME = 3;
const BALL_SAVE_SECONDS = 8;
const TARGET_RESET_SECONDS = 1;
const MAX_MULTIPLIER = 5;
const NUDGE_SPEED = 25;
const TILT_LIMIT = 5;
const TILT_DECAY = 1.5;
const SPINNER_GAIN = 0.5;
const SPINNER_DECAY = 1.5;
const SPINNER_POINTS_PER_TURN = 25;
const RAMP_COMBO_SECONDS = 4;
const RAMPS_FOR_EXTRA_BALL = 5;
const KICKBACK_SPEED = 150;
export const RAMPS_FOR_MULTIBALL = 3;
const INPUT_REWIND_SECONDS = 0.024;
const MULTIBALL_EXTRA_BALLS = 2;
const MULTIBALL_SAVE_SECONDS = 10;
const AUTO_LAUNCH_INTERVAL = 0.7;
const AUTO_LAUNCH_Y = 10;
const AUTO_LAUNCH_SPEED = 180;

const SCORES = {
  bumper: 100,
  sling: 10,
  target: 500,
  bank: 5000,
  rollover: 200,
  lanes: 1000,
  ramp: 2500,
  jackpot: 20000,
  skillShot: 10000,
};

const BONUS = {
  bumper: 50,
  target: 200,
  rollover: 100,
  ramp: 1000,
};

interface HistoryEntry {
  snapshot: WorldSnapshot;
  dt: number;
  replayable: boolean;
}

const isReplayable = (event: PhysicsEvent) => event.type === "contact" && !/^(bumper|sling|target)/.test(event.id);

export interface GameStats {
  ramps: number;
  banks: number;
  jackpots: number;
  skillShots: number;
}

const emptyStats = (): GameStats => ({ ramps: 0, banks: 0, jackpots: 0, skillShots: 0 });

export class Game {
  readonly world: World;
  readonly layout: TableLayout = createLayout();
  state: GameState = "ready";
  score = 0;
  highScore: number;
  newHighScore = false;
  stats = emptyStats();
  ballsLeft = BALLS_PER_GAME;
  extraBalls = 0;
  bonus = 0;
  inMultiball = false;
  rampsTowardMultiball = 0;
  kickbackLit = true;
  multiplier = 1;
  litLanes = [false, false, false];
  tilted = false;
  skillShotLit = true;
  spinnerAngle = 0;
  private spinnerVelocity = 0;
  private ballSaveTime = 0;
  private exitedShooterLane = false;
  private rampCombo = 0;
  private rampComboTime = 0;
  private pendingLaunches = 0;
  private autoLaunchTime = 0;
  private tiltMeter = 0;
  private targetResetTime = 0;
  private readonly targets: Segment[];
  private readonly leftFlipper: Flipper;
  private readonly rightFlipper: Flipper;
  private events: GameEvent[] = [];
  private history: HistoryEntry[] = [];

  constructor(
    params: PhysicsParams,
    private readonly storage: ScoreStorage,
  ) {
    this.highScore = storage.load();
    this.world = new World(params);
    const { layout, world } = this;
    for (const def of [...layout.walls, ...layout.slings, ...layout.ramp.rails]) world.addSegment(def);
    world.addLayerGate(layout.ramp.entry);
    world.addLayerGate(layout.ramp.exit);
    this.targets = layout.targets.map((def) => world.addSegment(def));
    for (const def of layout.bumpers) world.addBumper(def);
    this.leftFlipper = world.addFlipper(layout.flippers.left);
    this.rightFlipper = world.addFlipper(layout.flippers.right);
    world.setPlunger(layout.plunger);
    for (const def of [...layout.rollovers, layout.spinner, layout.shooterExit, layout.kickback]) world.addSensor(def);
    this.serveBall();
  }

  get ballSaveActive(): boolean {
    return this.ballSaveTime > 0;
  }

  get ballsInPlay(): number {
    return this.world.balls.length + this.pendingLaunches;
  }

  get plungerPull(): number {
    return this.world.plunger?.pull ?? 0;
  }

  isTargetDown(index: number): boolean {
    return !this.targets[index].enabled;
  }

  setFlipper(side: "left" | "right", pressed: boolean): void {
    if (this.tilted || this.state === "over") pressed = false;
    const flipper = side === "left" ? this.leftFlipper : this.rightFlipper;
    if (pressed && !flipper.pressed) {
      this.rotateLanes(side === "left" ? 1 : -1);
      this.pressWithRewind(flipper);
      return;
    }
    flipper.pressed = pressed;
  }

  setPlunger(held: boolean): void {
    const plunger = this.world.plunger;
    if (!plunger || this.state === "over") return;
    if (plunger.held && !held && plunger.pull > 0 && this.state === "ready") {
      this.emit("launch", SHOOTER_X, plunger.y, plunger.pull);
    }
    plunger.held = held;
  }

  nudge(dx: number, dy: number): void {
    if (this.state === "over" || this.tilted) return;
    this.world.nudge(dx * NUDGE_SPEED, dy * NUDGE_SPEED);
    this.history = [];
    this.tiltMeter += Math.hypot(dx, dy);
    if (this.tiltMeter > TILT_LIMIT) {
      this.tilted = true;
      this.leftFlipper.pressed = false;
      this.rightFlipper.pressed = false;
      this.emit("tilt", 23, 50, 1);
    }
  }

  addScore(points: number): void {
    this.score += points * this.multiplier;
  }

  restart(): void {
    this.score = 0;
    this.ballsLeft = BALLS_PER_GAME;
    this.extraBalls = 0;
    this.stats = emptyStats();
    this.newHighScore = false;
    this.inMultiball = false;
    this.rampsTowardMultiball = 0;
    this.kickbackLit = true;
    this.pendingLaunches = 0;
    this.state = "ready";
    for (const target of this.targets) target.enabled = true;
    this.targetResetTime = 0;
    for (const ball of [...this.world.balls]) this.world.removeBall(ball);
    this.history = [];
    this.serveBall();
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  step(dt: number): void {
    const snapshot = this.world.snapshot();
    this.world.step(dt);
    const events = this.world.drainEvents();
    this.record({ snapshot, dt, replayable: events.every(isReplayable) });
    for (const event of events) this.handle(event);
    this.ballSaveTime = Math.max(0, this.ballSaveTime - dt);
    this.rampComboTime = Math.max(0, this.rampComboTime - dt);
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT_DECAY * dt);
    this.stepSpinner(dt);
    this.stepTargets(dt);
    this.checkLaunched();
    this.checkDrain();
    this.stepAutoLaunch(dt);
    if (this.inMultiball && this.ballsInPlay <= 1) this.inMultiball = false;
  }

  private record(entry: HistoryEntry): void {
    this.history.push(entry);
    let span = this.history.reduce((sum, e) => sum + e.dt, 0);
    while (span - this.history[0].dt >= INPUT_REWIND_SECONDS) span -= this.history.shift()!.dt;
  }

  private pressWithRewind(flipper: Flipper): void {
    let start = this.history.length;
    while (start > 0 && this.history[start - 1].replayable) start--;
    const replay = this.history.slice(start);
    this.history = [];
    const balls = this.world.balls;
    const sameBalls = replay[0]?.snapshot.balls.length === balls.length && replay[0].snapshot.balls.every(({ ball }) => balls.includes(ball));
    if (!sameBalls) {
      flipper.pressed = true;
      return;
    }
    const pressed = this.world.flippers.map((f) => f.pressed);
    const plunger = this.world.plunger && { held: this.world.plunger.held, pullLimit: this.world.plunger.pullLimit };
    this.world.restore(replay[0].snapshot);
    this.world.flippers.forEach((f, i) => (f.pressed = pressed[i]));
    if (this.world.plunger && plunger) Object.assign(this.world.plunger, plunger);
    flipper.pressed = true;
    for (const { dt } of replay) {
      this.world.step(dt);
      for (const event of this.world.drainEvents()) this.handle(event);
    }
  }

  private serveBall(): void {
    this.placeBallInShooterLane();
    this.bonus = 0;
    this.multiplier = 1;
    this.litLanes = [false, false, false];
    this.tilted = false;
    this.tiltMeter = 0;
  }

  private placeBallInShooterLane(): void {
    this.world.spawnBall(SHOOTER_X, this.layout.plunger.restY + BALL_RADIUS + 0.01, BALL_RADIUS);
    this.skillShotLit = true;
    this.exitedShooterLane = false;
  }

  private startMultiball(x: number, y: number): void {
    this.inMultiball = true;
    this.pendingLaunches += MULTIBALL_EXTRA_BALLS;
    this.autoLaunchTime = AUTO_LAUNCH_INTERVAL;
    this.ballSaveTime = MULTIBALL_SAVE_SECONDS;
    this.emit("multiball", x, y, 1);
  }

  private stepAutoLaunch(dt: number): void {
    if (this.pendingLaunches === 0) return;
    this.autoLaunchTime -= dt;
    if (this.autoLaunchTime > 0) return;
    this.autoLaunchTime = AUTO_LAUNCH_INTERVAL;
    this.pendingLaunches--;
    const ball = this.world.spawnBall(SHOOTER_X, AUTO_LAUNCH_Y, BALL_RADIUS);
    ball.vy = AUTO_LAUNCH_SPEED;
    this.emit("launch", SHOOTER_X, AUTO_LAUNCH_Y, 1);
  }

  private handle(event: PhysicsEvent): void {
    const { id, x, y, speed } = event;
    if (event.type === "gate") {
      if (id === "ramp-entry" && event.layer !== LAYER_FLOOR) {
        this.skillShotLit = false;
        this.emit("rampEnter", x, y, speed);
      }
      if (id === "ramp-exit") this.completeRamp(x, y);
      return;
    }
    if (event.type === "sensor") {
      if (id === "spinner") {
        this.skillShotLit = false;
        this.spinnerVelocity += speed * SPINNER_GAIN;
        return;
      }
      if (id === "kickback") {
        this.fireKickback(event.ball);
        return;
      }
      if (id === "shooter-exit") {
        this.exitedShooterLane = true;
        return;
      }
      this.passLane(Number(id.split("-")[1]), x, y, speed);
      return;
    }
    if (id.startsWith("bumper")) {
      this.addScore(SCORES.bumper);
      this.bonus += BONUS.bumper;
      this.emit("bumper", x, y, speed, id);
    } else if (id.startsWith("sling")) {
      this.addScore(SCORES.sling);
      this.emit("sling", x, y, speed, id);
    } else if (id.startsWith("target")) {
      this.dropTarget(id, x, y, speed);
    } else if (id.startsWith("flipper")) {
      this.emit("flipper", x, y, speed, id);
    } else {
      this.emit("wall", x, y, speed, id);
      return;
    }
    this.skillShotLit = false;
  }

  private fireKickback(ball: Ball): void {
    if (!this.kickbackLit || ball.vy > 0) return;
    this.kickbackLit = false;
    ball.vx = 0;
    ball.vy = KICKBACK_SPEED;
    this.emit("kickback", ball.x, ball.y, KICKBACK_SPEED);
  }

  private completeRamp(x: number, y: number): void {
    this.rampCombo = this.rampComboTime > 0 ? this.rampCombo + 1 : 1;
    this.rampComboTime = RAMP_COMBO_SECONDS;
    this.addScore(SCORES.ramp * this.rampCombo);
    this.bonus += BONUS.ramp;
    this.emit("ramp", x, y, this.rampCombo);
    if (this.inMultiball) {
      this.addScore(SCORES.jackpot);
      this.stats.jackpots++;
      this.emit("jackpot", x, y, 1);
    } else if (++this.rampsTowardMultiball >= RAMPS_FOR_MULTIBALL && this.state === "playing") {
      this.rampsTowardMultiball = 0;
      this.startMultiball(x, y);
    }
    if (++this.stats.ramps === RAMPS_FOR_EXTRA_BALL) {
      this.extraBalls++;
      this.emit("extraBall", x, y, 1);
    }
  }

  private dropTarget(id: string, x: number, y: number, speed: number): void {
    const target = this.targets.find((t) => t.id === id);
    if (!target?.enabled) return;
    target.enabled = false;
    this.addScore(SCORES.target);
    this.bonus += BONUS.target;
    this.emit("target", x, y, speed, id);
    if (this.targets.every((t) => !t.enabled)) {
      this.addScore(SCORES.bank);
      this.stats.banks++;
      this.targetResetTime = TARGET_RESET_SECONDS;
      this.kickbackLit = true;
      this.emit("bank", x, y, speed);
    }
  }

  private stepTargets(dt: number): void {
    if (this.targetResetTime <= 0) return;
    this.targetResetTime -= dt;
    if (this.targetResetTime <= 0) for (const target of this.targets) target.enabled = true;
  }

  private passLane(index: number, x: number, y: number, speed: number): void {
    if (this.skillShotLit) {
      this.skillShotLit = false;
      this.addScore(SCORES.skillShot);
      this.stats.skillShots++;
      this.emit("skill", x, y, speed);
    }
    this.lightLane(index, x, y, speed);
  }

  private lightLane(index: number, x: number, y: number, speed: number): void {
    if (this.litLanes[index]) return;
    this.litLanes[index] = true;
    this.addScore(SCORES.rollover);
    this.bonus += BONUS.rollover;
    this.emit("rollover", x, y, speed, `rollover-${index}`);
    if (this.litLanes.every(Boolean)) {
      this.addScore(SCORES.lanes);
      this.multiplier = Math.min(MAX_MULTIPLIER, this.multiplier + 1);
      this.litLanes = [false, false, false];
      this.emit("lanes", x, y, speed);
    }
  }

  private rotateLanes(shift: number): void {
    const n = this.litLanes.length;
    this.litLanes = this.litLanes.map((_, i) => this.litLanes[(i + shift + n) % n]);
  }

  private stepSpinner(dt: number): void {
    if (this.spinnerVelocity <= 0.01) {
      this.spinnerVelocity = 0;
      return;
    }
    const before = Math.floor(this.spinnerAngle / (Math.PI * 2));
    this.spinnerAngle += this.spinnerVelocity * dt;
    this.spinnerVelocity *= Math.exp(-SPINNER_DECAY * dt);
    const turns = Math.floor(this.spinnerAngle / (Math.PI * 2)) - before;
    if (turns <= 0) return;
    this.addScore(SPINNER_POINTS_PER_TURN * turns);
    const { spinner } = this.layout;
    this.emit("spin", (spinner.ax + spinner.bx) / 2, spinner.ay, this.spinnerVelocity);
  }

  private checkLaunched(): void {
    if (this.state !== "ready" || !this.world.balls.some((ball) => ball.x < PLAYFIELD_WIDTH)) return;
    this.state = "playing";
    this.ballSaveTime = this.exitedShooterLane ? BALL_SAVE_SECONDS : 0;
    this.exitedShooterLane = false;
  }

  private checkDrain(): void {
    for (const ball of [...this.world.balls]) {
      if (ball.y >= DRAIN_Y) continue;
      this.world.removeBall(ball);
      if (this.inMultiball && this.ballSaveActive && !this.tilted) {
        this.pendingLaunches++;
        this.emit("save", ball.x, 0, 1);
        continue;
      }
      if (this.ballsInPlay > 0) continue;
      if (this.ballSaveActive && !this.tilted) {
        this.emit("save", ball.x, 0, 1);
        this.ballSaveTime = 0;
        this.state = "ready";
        this.placeBallInShooterLane();
        continue;
      }
      this.awardBonus();
      if (this.extraBalls > 0) {
        this.extraBalls--;
        this.emit("shootAgain", ball.x, 0, 1);
        this.state = "ready";
        this.serveBall();
        continue;
      }
      this.ballsLeft--;
      this.emit("drain", ball.x, 0, 1);
      if (this.ballsLeft > 0) {
        this.state = "ready";
        this.serveBall();
        continue;
      }
      this.state = "over";
      this.leftFlipper.pressed = false;
      this.rightFlipper.pressed = false;
      if (this.score > this.highScore) {
        this.newHighScore = true;
        this.highScore = this.score;
        this.storage.save(this.score);
      }
      this.emit("over", 23, 50, 1);
    }
  }

  private awardBonus(): void {
    if (this.tilted || this.bonus === 0) return;
    this.addScore(this.bonus);
    this.emit("bonus", 23, 30, this.bonus * this.multiplier);
  }

  private emit(kind: GameEventKind, x: number, y: number, speed: number, id?: string): void {
    this.events.push({ kind, id, x, y, speed });
  }
}

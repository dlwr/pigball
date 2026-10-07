import type { PhysicsParams } from "../physics/params";
import { type Flipper, LAYER_FLOOR, type PhysicsEvent, type Segment, World } from "../physics/world";
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
  | "spin"
  | "rampEnter"
  | "ramp"
  | "launch"
  | "save"
  | "drain"
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

const SCORES = {
  bumper: 100,
  sling: 10,
  target: 500,
  bank: 5000,
  rollover: 200,
  lanes: 1000,
  ramp: 2500,
};

export class Game {
  readonly world: World;
  readonly layout: TableLayout = createLayout();
  state: GameState = "ready";
  score = 0;
  highScore: number;
  ballsLeft = BALLS_PER_GAME;
  multiplier = 1;
  litLanes = [false, false, false];
  tilted = false;
  spinnerAngle = 0;
  private spinnerVelocity = 0;
  private ballSaveTime = 0;
  private exitedShooterLane = false;
  private rampCombo = 0;
  private rampComboTime = 0;
  private tiltMeter = 0;
  private targetResetTime = 0;
  private readonly targets: Segment[];
  private readonly leftFlipper: Flipper;
  private readonly rightFlipper: Flipper;
  private events: GameEvent[] = [];

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
    for (const def of [...layout.rollovers, layout.spinner, layout.shooterExit]) world.addSensor(def);
    this.serveBall();
  }

  get ballSaveActive(): boolean {
    return this.ballSaveTime > 0;
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
    if (pressed && !flipper.pressed) this.rotateLanes(side === "left" ? 1 : -1);
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
    this.state = "ready";
    for (const target of this.targets) target.enabled = true;
    this.targetResetTime = 0;
    for (const ball of [...this.world.balls]) this.world.removeBall(ball);
    this.serveBall();
  }

  drainEvents(): GameEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  step(dt: number): void {
    this.world.step(dt);
    for (const event of this.world.drainEvents()) this.handle(event);
    this.ballSaveTime = Math.max(0, this.ballSaveTime - dt);
    this.rampComboTime = Math.max(0, this.rampComboTime - dt);
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT_DECAY * dt);
    this.stepSpinner(dt);
    this.stepTargets(dt);
    this.checkLaunched();
    this.checkDrain();
  }

  private serveBall(): void {
    const plunger = this.layout.plunger;
    this.world.spawnBall(SHOOTER_X, plunger.restY + BALL_RADIUS + 0.01, BALL_RADIUS);
    this.multiplier = 1;
    this.litLanes = [false, false, false];
    this.tilted = false;
    this.tiltMeter = 0;
  }

  private handle(event: PhysicsEvent): void {
    const { id, x, y, speed } = event;
    if (event.type === "gate") {
      if (id === "ramp-entry" && event.layer !== LAYER_FLOOR) this.emit("rampEnter", x, y, speed);
      if (id === "ramp-exit") this.completeRamp(x, y);
      return;
    }
    if (event.type === "sensor") {
      if (id === "spinner") {
        this.spinnerVelocity += speed * SPINNER_GAIN;
        return;
      }
      if (id === "shooter-exit") {
        this.exitedShooterLane = true;
        return;
      }
      this.lightLane(Number(id.split("-")[1]), x, y, speed);
      return;
    }
    if (id.startsWith("bumper")) {
      this.addScore(SCORES.bumper);
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
    }
  }

  private completeRamp(x: number, y: number): void {
    this.rampCombo = this.rampComboTime > 0 ? this.rampCombo + 1 : 1;
    this.rampComboTime = RAMP_COMBO_SECONDS;
    this.addScore(SCORES.ramp * this.rampCombo);
    this.emit("ramp", x, y, this.rampCombo);
  }

  private dropTarget(id: string, x: number, y: number, speed: number): void {
    const target = this.targets.find((t) => t.id === id);
    if (!target?.enabled) return;
    target.enabled = false;
    this.addScore(SCORES.target);
    this.emit("target", x, y, speed, id);
    if (this.targets.every((t) => !t.enabled)) {
      this.addScore(SCORES.bank);
      this.targetResetTime = TARGET_RESET_SECONDS;
      this.emit("bank", x, y, speed);
    }
  }

  private stepTargets(dt: number): void {
    if (this.targetResetTime <= 0) return;
    this.targetResetTime -= dt;
    if (this.targetResetTime <= 0) for (const target of this.targets) target.enabled = true;
  }

  private lightLane(index: number, x: number, y: number, speed: number): void {
    if (this.litLanes[index]) return;
    this.litLanes[index] = true;
    this.addScore(SCORES.rollover);
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
      if (this.world.balls.length > 0) continue;
      if (this.ballSaveActive && !this.tilted) {
        this.emit("save", ball.x, 0, 1);
        this.ballSaveTime = 0;
        this.state = "ready";
        this.world.spawnBall(SHOOTER_X, this.layout.plunger.restY + BALL_RADIUS + 0.01, BALL_RADIUS);
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
        this.highScore = this.score;
        this.storage.save(this.score);
      }
      this.emit("over", 23, 50, 1);
    }
  }

  private emit(kind: GameEventKind, x: number, y: number, speed: number, id?: string): void {
    this.events.push({ kind, id, x, y, speed });
  }
}

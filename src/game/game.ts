import type { PhysicsParams } from "../physics/params";
import { type Ball, type Flipper, LAYER_FLOOR, type PhysicsEvent, type Segment, World, type WorldSnapshot } from "../physics/world";
import { BALL_RADIUS, DRAIN_Y, PLAYFIELD_WIDTH, SHOOTER_X, type Side, type TableLayout, createLayout } from "./table";

export interface ScoreStorage {
  load(): number;
  save(score: number): void;
}

export type GameState = "ready" | "playing" | "over" | "cleared";

export type GameEventKind =
  | "bumper"
  | "sling"
  | "rotor"
  | "belly"
  | "navelIn"
  | "piggy"
  | "mud"
  | "piggyBreak"
  | "piggyBack"
  | "navelOut"
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
  | "kickbackLit"
  | "multiball"
  | "jackpot"
  | "extraBall"
  | "shootAgain"
  | "drain"
  | "bonus"
  | "tilt"
  | "over"
  | "stageClear"
  | "fever"
  | "charm";

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
export const MAX_MULTIPLIER = 5;
const NUDGE_SPEED = 25;
const TILT_LIMIT = 5;
const TILT_DECAY = 1.5;
const SPINNER_GAIN = 0.5;
const SPINNER_DECAY = 1.5;
const SPINNER_POINTS_PER_TURN = 25;
const RAMP_COMBO_SECONDS = 4;
export const RAMPS_FOR_EXTRA_BALL = 5;
const KICKBACK_SPEED = 135;
const SPINS_FOR_RIGHT_KICKBACK = 20;
export const RAMPS_FOR_MULTIBALL = 3;
const INPUT_REWIND_SECONDS = 0.024;
export const FEVER_SECONDS = 15;
const FEVER_MULTIPLIER = 2;
const PIGGY_HITS_TO_BREAK = 5;
const PIGGY_RESPAWN_SECONDS = 8;
const NAVEL_HOLD_SECONDS = 1;
const NAVEL_EJECT_SPEED = 70;
const NAVEL_RECAPTURE_SECONDS = 0.6;
const MULTIBALL_EXTRA_BALLS = 2;
const MULTIBALL_SAVE_SECONDS = 10;
const AUTO_LAUNCH_INTERVAL = 0.7;
const AUTO_LAUNCH_Y = 10;
const AUTO_LAUNCH_SPEED = 180;

const SCORES = {
  bumper: 100,
  sling: 10,
  rotor: 50,
  belly: 30,
  navel: 1000,
  piggy: 250,
  mud: 100,
  piggyBreak: 7500,
  target: 500,
  bank: 5000,
  rollover: 200,
  lanes: 1000,
  ramp: 2500,
  jackpot: 20000,
  skillShot: 10000,
};

export type ScoreKind = keyof typeof SCORES | "spinner" | "bonus" | "misc";

export interface Modifier {
  id: string;
  layout?(layout: TableLayout): void;
  params?(params: PhysicsParams): void;
  start?(game: Game): void;
  score?(kind: ScoreKind, points: number, game: Game): number;
  rampWorth?(game: Game): number;
  event?(kind: GameEventKind, game: Game): boolean | void;
}

export interface GameRules {
  balls: number;
  ballSaveSeconds: number;
  target: number | null;
  modifiers: Modifier[];
}

const DEFAULT_RULES: GameRules = { balls: BALLS_PER_GAME, ballSaveSeconds: BALL_SAVE_SECONDS, target: null, modifiers: [] };

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

const isReplayable = (event: PhysicsEvent) => event.type === "contact" && !/^(bumper|sling|target|rotor|belly|piggy)/.test(event.id);

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
  readonly rules: GameRules;
  state: GameState = "ready";
  score = 0;
  highScore: number;
  newHighScore = false;
  stats = emptyStats();
  ballsLeft: number;
  extraBalls = 0;
  bonus = 0;
  inMultiball = false;
  piggyHits = 0;
  piggyHitsToBreak = PIGGY_HITS_TO_BREAK;
  feverTime = 0;
  rampsTowardMultiball = 0;
  rampsTowardExtraBall = 0;
  kickbacksLit: Record<Side, boolean> = { left: true, right: false };
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
  private spinsTowardRightKickback = 0;
  private pendingLaunches = 0;
  private piggyRespawnTime = 0;
  private targetReached = false;
  private navelBall: Ball | null = null;
  private navelTime = 0;
  private navelCooldown = 0;
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
    rules: Partial<GameRules> = {},
  ) {
    this.rules = { ...DEFAULT_RULES, ...rules };
    const { modifiers } = this.rules;
    this.ballsLeft = this.rules.balls;
    this.highScore = storage.load();
    for (const modifier of modifiers) modifier.layout?.(this.layout);
    const tuned = modifiers.some((m) => m.params) ? { ...params } : params;
    for (const modifier of modifiers) modifier.params?.(tuned);
    this.world = new World(tuned);
    const { layout, world } = this;
    for (const def of [...layout.walls, ...layout.slings, ...layout.bellies, ...layout.ramp.rails]) world.addSegment(def);
    world.addLayerGate(layout.ramp.entry);
    world.addLayerGate(layout.ramp.exit);
    this.targets = layout.targets.map((def) => world.addSegment(def));
    for (const def of layout.bumpers) world.addBumper(def);
    world.addRotor(layout.rotor);
    world.addHole(layout.navel);
    world.addMover(layout.piggy);
    world.addMud(layout.mud);
    this.leftFlipper = world.addFlipper(layout.flippers.left);
    this.rightFlipper = world.addFlipper(layout.flippers.right);
    world.setPlunger(layout.plunger);
    for (const def of [...layout.rollovers, layout.spinner, layout.shooterExit, layout.kickbacks.left, layout.kickbacks.right]) world.addSensor(def);
    this.serveBall();
    for (const modifier of modifiers) modifier.start?.(this);
  }

  get inFever(): boolean {
    return this.feverTime > 0;
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
    this.award("misc", points);
  }

  private award(kind: ScoreKind, points: number): void {
    let base = points;
    for (const modifier of this.rules.modifiers) {
      if (!modifier.score) continue;
      const next = modifier.score(kind, base, this);
      if (next !== base && base !== 0) this.emit("charm", 23, 50, next / base, modifier.id);
      base = next;
    }
    this.score += base * this.multiplier * (this.inFever ? FEVER_MULTIPLIER : 1);
  }

  restart(): void {
    this.score = 0;
    this.ballsLeft = this.rules.balls;
    this.extraBalls = 0;
    this.stats = emptyStats();
    this.newHighScore = false;
    this.inMultiball = false;
    this.navelBall = null;
    this.navelCooldown = 0;
    this.piggyHits = 0;
    this.piggyRespawnTime = 0;
    this.world.movers[0].enabled = true;
    this.rampsTowardMultiball = 0;
    this.rampsTowardExtraBall = 0;
    this.kickbacksLit = { left: true, right: false };
    this.spinsTowardRightKickback = 0;
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
    if (this.state === "cleared") return;
    const snapshot = this.world.snapshot();
    this.world.step(dt);
    const events = this.world.drainEvents();
    this.record({ snapshot, dt, replayable: events.every(isReplayable) });
    for (const event of events) this.handle(event);
    if (!this.navelBall) this.ballSaveTime = Math.max(0, this.ballSaveTime - dt);
    this.stepNavel(dt);
    this.stepPiggy(dt);
    this.rampComboTime = Math.max(0, this.rampComboTime - dt);
    this.tiltMeter = Math.max(0, this.tiltMeter - TILT_DECAY * dt);
    this.stepSpinner(dt);
    this.stepTargets(dt);
    this.checkLaunched();
    this.checkDrain();
    this.stepAutoLaunch(dt);
    if (this.inMultiball && this.ballsInPlay <= 1) this.inMultiball = false;
    this.checkTarget();
    this.stepFever(dt);
  }

  private checkTarget(): void {
    const { target } = this.rules;
    if (target === null || this.targetReached || this.score < target || this.state === "over") return;
    this.targetReached = true;
    this.feverTime = FEVER_SECONDS;
    this.emit("fever", 23, 50, FEVER_SECONDS);
  }

  private stepFever(dt: number): void {
    if (!this.inFever) return;
    this.feverTime = Math.max(0, this.feverTime - dt);
    if (this.inFever) return;
    this.state = "cleared";
    this.leftFlipper.pressed = false;
    this.rightFlipper.pressed = false;
    this.emit("stageClear", 23, 50, 1);
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
    if (event.type === "hole") {
      if (id === "mud") {
        this.award("mud", SCORES.mud);
        this.emit("mud", x, y, speed);
      } else this.captureInNavel(event.ball);
      return;
    }
    if (event.type === "sensor") {
      if (id === "spinner") {
        this.skillShotLit = false;
        this.spinnerVelocity += speed * SPINNER_GAIN;
        return;
      }
      if (id === "kickback-left" || id === "kickback-right") {
        this.fireKickback(id === "kickback-left" ? "left" : "right", event.ball);
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
      this.award("bumper", SCORES.bumper);
      this.bonus += BONUS.bumper;
      this.emit("bumper", x, y, speed, id);
    } else if (id === "piggy") {
      this.hitPiggy(x, y, speed);
    } else if (id.startsWith("belly")) {
      this.award("belly", SCORES.belly);
      this.emit("belly", x, y, speed, id);
    } else if (id === "rotor") {
      this.award("rotor", SCORES.rotor);
      this.emit("rotor", x, y, speed, id);
    } else if (id.startsWith("sling")) {
      this.award("sling", SCORES.sling);
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

  private hitPiggy(x: number, y: number, speed: number): void {
    this.award("piggy", SCORES.piggy);
    this.emit("piggy", x, y, speed);
    if (++this.piggyHits < this.piggyHitsToBreak) return;
    this.award("piggyBreak", SCORES.piggyBreak);
    this.world.movers[0].enabled = false;
    this.piggyRespawnTime = PIGGY_RESPAWN_SECONDS;
    this.emit("piggyBreak", this.world.movers[0].x, this.world.movers[0].y, 1);
  }

  private stepPiggy(dt: number): void {
    if (this.piggyRespawnTime <= 0) return;
    this.piggyRespawnTime -= dt;
    if (this.piggyRespawnTime > 0) return;
    this.world.movers[0].enabled = true;
    this.piggyHits = 0;
    const piggy = this.world.movers[0];
    this.emit("piggyBack", piggy.x, piggy.y, 1);
  }

  get holdingInNavel(): boolean {
    return this.navelBall !== null;
  }

  private captureInNavel(ball: Ball): void {
    if (this.navelBall || this.navelCooldown > 0) return;
    const { navel } = this.layout;
    this.navelBall = ball;
    this.navelTime = NAVEL_HOLD_SECONDS;
    Object.assign(ball, { x: navel.x, y: navel.y, prevX: navel.x, prevY: navel.y, vx: 0, vy: 0, frozen: true });
    this.skillShotLit = false;
    this.award("navel", SCORES.navel);
    this.emit("navelIn", navel.x, navel.y, 1);
  }

  private stepNavel(dt: number): void {
    this.navelCooldown = Math.max(0, this.navelCooldown - dt);
    const ball = this.navelBall;
    if (!ball) return;
    this.navelTime -= dt;
    if (this.navelTime > 0) return;
    const { navel } = this.layout;
    Object.assign(ball, { frozen: false, vx: navel.ejectX * NAVEL_EJECT_SPEED, vy: navel.ejectY * NAVEL_EJECT_SPEED });
    this.navelBall = null;
    this.navelCooldown = NAVEL_RECAPTURE_SECONDS;
    this.emit("navelOut", navel.x, navel.y, NAVEL_EJECT_SPEED);
  }

  private fireKickback(side: Side, ball: Ball): void {
    if (!this.kickbacksLit[side] || ball.vy > 0) return;
    this.kickbacksLit[side] = false;
    ball.vx = 0;
    ball.vy = KICKBACK_SPEED;
    this.emit("kickback", ball.x, ball.y, KICKBACK_SPEED);
  }

  private completeRamp(x: number, y: number): void {
    this.rampCombo = this.rampComboTime > 0 ? this.rampCombo + 1 : 1;
    this.rampComboTime = RAMP_COMBO_SECONDS;
    this.award("ramp", SCORES.ramp * this.rampCombo);
    this.bonus += BONUS.ramp;
    this.emit("ramp", x, y, this.rampCombo);
    if (this.inMultiball) {
      this.award("jackpot", SCORES.jackpot);
      this.stats.jackpots++;
      this.emit("jackpot", x, y, 1);
    }
    const worth = this.rules.modifiers.reduce((w, m) => (m.rampWorth ? w * m.rampWorth(this) : w), 1);
    if (!this.inMultiball) {
      this.rampsTowardMultiball += worth;
      if (this.rampsTowardMultiball >= RAMPS_FOR_MULTIBALL && this.state === "playing") {
        this.rampsTowardMultiball = 0;
        this.startMultiball(x, y);
      }
    }
    this.stats.ramps++;
    const before = this.rampsTowardExtraBall;
    this.rampsTowardExtraBall += worth;
    if (before < RAMPS_FOR_EXTRA_BALL && this.rampsTowardExtraBall >= RAMPS_FOR_EXTRA_BALL) {
      this.extraBalls++;
      this.emit("extraBall", x, y, 1);
    }
  }

  private dropTarget(id: string, x: number, y: number, speed: number): void {
    const target = this.targets.find((t) => t.id === id);
    if (!target?.enabled) return;
    target.enabled = false;
    this.award("target", SCORES.target);
    this.bonus += BONUS.target;
    this.emit("target", x, y, speed, id);
    if (this.targets.every((t) => !t.enabled)) {
      this.award("bank", SCORES.bank);
      this.stats.banks++;
      this.targetResetTime = TARGET_RESET_SECONDS;
      this.kickbacksLit.left = true;
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
      this.award("skillShot", SCORES.skillShot);
      this.stats.skillShots++;
      this.emit("skill", x, y, speed);
    }
    this.lightLane(index, x, y, speed);
  }

  private lightLane(index: number, x: number, y: number, speed: number): void {
    if (this.litLanes[index]) return;
    this.litLanes[index] = true;
    this.award("rollover", SCORES.rollover);
    this.bonus += BONUS.rollover;
    this.emit("rollover", x, y, speed, `rollover-${index}`);
    if (this.litLanes.every(Boolean)) {
      this.award("lanes", SCORES.lanes);
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
    this.award("spinner", SPINNER_POINTS_PER_TURN * turns);
    if (!this.kickbacksLit.right) this.spinsTowardRightKickback += turns;
    if (this.spinsTowardRightKickback >= SPINS_FOR_RIGHT_KICKBACK) {
      this.kickbacksLit.right = true;
      this.spinsTowardRightKickback = 0;
      this.emit("kickbackLit", 0, 0, 1, "right");
    }
    const { spinner } = this.layout;
    this.emit("spin", (spinner.ax + spinner.bx) / 2, spinner.ay, this.spinnerVelocity);
  }

  private checkLaunched(): void {
    if (this.state !== "ready" || !this.world.balls.some((ball) => ball.x < PLAYFIELD_WIDTH)) return;
    this.state = "playing";
    this.ballSaveTime = this.exitedShooterLane ? this.rules.ballSaveSeconds : 0;
    this.exitedShooterLane = false;
  }

  private checkDrain(): void {
    for (const ball of [...this.world.balls]) {
      if (ball.y >= DRAIN_Y) continue;
      this.world.removeBall(ball);
      if (this.inFever && this.ballsInPlay === 0) {
        this.emit("save", ball.x, 0, 1);
        this.state = "ready";
        this.placeBallInShooterLane();
        continue;
      }
      if (this.inFever) continue;
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
    this.award("bonus", this.bonus);
    this.emit("bonus", 23, 30, this.bonus * this.multiplier);
  }

  private emit(kind: GameEventKind, x: number, y: number, speed: number, id?: string): void {
    this.events.push({ kind, id, x, y, speed });
    if (kind === "charm") return;
    for (const modifier of this.rules.modifiers) {
      if (modifier.event?.(kind, this)) this.events.push({ kind: "charm", id: modifier.id, x, y, speed: 1 });
    }
  }
}

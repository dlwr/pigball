import type { PhysicsParams } from "./params";

export const LAYER_FLOOR = 1;
export const LAYER_RAMP = 2;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  prevX: number;
  prevY: number;
  r: number;
  layer: number;
}

export type SegmentKind = "wall" | "sling" | "target" | "belly";

export interface SegmentDef {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  kind?: SegmentKind;
  oneWay?: boolean;
  layers?: number;
}

export interface Segment extends Required<SegmentDef> {
  enabled: boolean;
}

export interface BumperDef {
  id: string;
  x: number;
  y: number;
  r: number;
  kick: number;
}

export interface Bumper extends BumperDef {
  recharge: number;
}

export interface FlipperDef {
  id: string;
  x: number;
  y: number;
  length: number;
  baseRadius: number;
  tipRadius: number;
  restAngle: number;
  activeAngle: number;
}

export interface Flipper extends FlipperDef {
  angle: number;
  prevAngle: number;
  omega: number;
  pressed: boolean;
}

export interface RotorDef {
  id: string;
  x: number;
  y: number;
  arms: number;
  armLength: number;
  armRadius: number;
  inertia: number;
  damping: number;
  restitution: number;
}

export interface Rotor extends RotorDef {
  angle: number;
  prevAngle: number;
  omega: number;
}

export interface PlungerDef {
  ax: number;
  bx: number;
  restY: number;
  travel: number;
}

export interface Plunger extends PlungerDef {
  y: number;
  prevY: number;
  vy: number;
  pull: number;
  pullLimit: number;
  held: boolean;
}

export interface SensorDef {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
}

export interface LayerGateDef {
  id: string;
  ax: number;
  ay: number;
  bx: number;
  by: number;
  from: number;
  to: number;
  reversible: boolean;
}

export type PhysicsEvent =
  | { type: "contact"; id: string; speed: number; x: number; y: number }
  | { type: "sensor"; id: string; speed: number; x: number; y: number; ball: Ball }
  | { type: "gate"; id: string; layer: number; speed: number; x: number; y: number };

export interface WorldSnapshot {
  balls: { ball: Ball; state: Ball }[];
  flippers: Flipper[];
  rotors: Rotor[];
  plunger: Plunger | null;
  recharges: number[];
}

const CONTACT_EVENT_SPEED = 4;
const BUMPER_RECHARGE_SECONDS = 0.12;
const BALL_RESTITUTION = 0.9;
const ROLLING_SLOWDOWN = 2 / 7;
const BALANCED_ON_TIP = 0.9995;
const BELLY_RESTITUTION = 1.25;
const TIP_OFF_SPEED = 0.05;

export class World {
  readonly balls: Ball[] = [];
  readonly segments: Segment[] = [];
  readonly bumpers: Bumper[] = [];
  readonly flippers: Flipper[] = [];
  readonly rotors: Rotor[] = [];
  readonly sensors: SensorDef[] = [];
  readonly layerGates: LayerGateDef[] = [];
  plunger: Plunger | null = null;
  private events: PhysicsEvent[] = [];
  private stepDt = 0;

  constructor(readonly params: PhysicsParams) {}

  spawnBall(x: number, y: number, r = 1.35): Ball {
    const ball = { x, y, vx: 0, vy: 0, prevX: x, prevY: y, r, layer: LAYER_FLOOR };
    this.balls.push(ball);
    return ball;
  }

  removeBall(ball: Ball): void {
    const i = this.balls.indexOf(ball);
    if (i >= 0) this.balls.splice(i, 1);
  }

  addSegment(def: SegmentDef): Segment {
    const seg = { kind: "wall" as const, oneWay: false, layers: LAYER_FLOOR, ...def, enabled: true };
    this.segments.push(seg);
    return seg;
  }

  addBumper(def: BumperDef): Bumper {
    const bumper = { ...def, recharge: 0 };
    this.bumpers.push(bumper);
    return bumper;
  }

  addFlipper(def: FlipperDef): Flipper {
    const flipper = { ...def, angle: def.restAngle, prevAngle: def.restAngle, omega: 0, pressed: false };
    this.flippers.push(flipper);
    return flipper;
  }

  addRotor(def: RotorDef): Rotor {
    const rotor = { ...def, angle: 0, prevAngle: 0, omega: 0 };
    this.rotors.push(rotor);
    return rotor;
  }

  setPlunger(def: PlungerDef): Plunger {
    this.plunger = { ...def, y: def.restY, prevY: def.restY, vy: 0, pull: 0, pullLimit: 1, held: false };
    return this.plunger;
  }

  addSensor(def: SensorDef): SensorDef {
    this.sensors.push(def);
    return def;
  }

  addLayerGate(def: LayerGateDef): LayerGateDef {
    this.layerGates.push(def);
    return def;
  }

  nudge(dvx: number, dvy: number): void {
    for (const ball of this.balls) {
      ball.vx += dvx;
      ball.vy += dvy;
    }
  }

  snapshot(): WorldSnapshot {
    return {
      balls: this.balls.map((ball) => ({ ball, state: { ...ball } })),
      flippers: this.flippers.map((flipper) => ({ ...flipper })),
      rotors: this.rotors.map((rotor) => ({ ...rotor })),
      plunger: this.plunger && { ...this.plunger },
      recharges: this.bumpers.map((bumper) => bumper.recharge),
    };
  }

  restore(snapshot: WorldSnapshot): void {
    this.balls.length = 0;
    for (const { ball, state } of snapshot.balls) this.balls.push(Object.assign(ball, state));
    snapshot.flippers.forEach((state, i) => Object.assign(this.flippers[i], state));
    snapshot.rotors.forEach((state, i) => Object.assign(this.rotors[i], state));
    if (this.plunger && snapshot.plunger) Object.assign(this.plunger, snapshot.plunger);
    snapshot.recharges.forEach((recharge, i) => (this.bumpers[i].recharge = recharge));
  }

  drainEvents(): PhysicsEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  step(dt: number): void {
    this.stepDt = dt;
    for (const bumper of this.bumpers) bumper.recharge = Math.max(0, bumper.recharge - dt);
    for (const flipper of this.flippers) this.stepFlipper(flipper, dt);
    for (const rotor of this.rotors) {
      rotor.prevAngle = rotor.angle;
      rotor.angle += rotor.omega * dt;
      rotor.omega *= Math.exp(-rotor.damping * dt);
    }
    if (this.plunger) this.stepPlunger(this.plunger, dt);
    for (const ball of this.balls) this.stepBall(ball, dt);
    for (let i = 0; i < this.balls.length; i++) {
      for (let j = i + 1; j < this.balls.length; j++) this.collideBalls(this.balls[i], this.balls[j]);
    }
  }

  private collideBalls(a: Ball, b: Ball): void {
    if (a.layer !== b.layer) return;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    const overlap = a.r + b.r - dist;
    if (overlap <= 0 || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    a.x -= (nx * overlap) / 2;
    a.y -= (ny * overlap) / 2;
    b.x += (nx * overlap) / 2;
    b.y += (ny * overlap) / 2;
    const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
    if (approach <= 0) return;
    const impulse = (approach * (1 + BALL_RESTITUTION)) / 2;
    a.vx -= impulse * nx;
    a.vy -= impulse * ny;
    b.vx += impulse * nx;
    b.vy += impulse * ny;
    if (approach > CONTACT_EVENT_SPEED) this.events.push({ type: "contact", id: "ball", speed: approach, x: a.x + nx * a.r, y: a.y + ny * a.r });
  }

  private stepFlipper(flipper: Flipper, dt: number): void {
    flipper.prevAngle = flipper.angle;
    const target = flipper.pressed ? flipper.activeAngle : flipper.restAngle;
    const maxDelta = this.params.flipperSpeed * dt;
    const delta = Math.max(-maxDelta, Math.min(maxDelta, target - flipper.angle));
    flipper.angle += delta;
    flipper.omega = delta / dt;
  }

  private stepPlunger(plunger: Plunger, dt: number): void {
    plunger.prevY = plunger.y;
    if (plunger.held) {
      plunger.pull = Math.min(plunger.pullLimit, plunger.pull + this.params.plungerPullRate * dt);
      plunger.y = plunger.restY - plunger.pull * plunger.travel;
      plunger.vy = (plunger.y - plunger.prevY) / dt;
      return;
    }
    plunger.pull = 0;
    if (plunger.y >= plunger.restY) {
      plunger.y = plunger.restY;
      plunger.vy = 0;
      return;
    }
    plunger.vy += this.params.plungerStiffness * (plunger.restY - plunger.y) * dt;
    plunger.y += plunger.vy * dt;
    if (plunger.y >= plunger.restY) plunger.y = plunger.restY;
  }

  private stepBall(ball: Ball, dt: number): void {
    const { params } = this;
    ball.prevX = ball.x;
    ball.prevY = ball.y;
    ball.vy -= params.gravity * dt;
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > params.maxSpeed) {
      ball.vx *= params.maxSpeed / speed;
      ball.vy *= params.maxSpeed / speed;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    for (const seg of this.segments) {
      if (seg.enabled && seg.layers & ball.layer) this.collideSegment(ball, seg);
    }
    for (const gate of this.layerGates) this.checkLayerGate(ball, gate);
    if (ball.layer !== LAYER_FLOOR) return;
    for (const bumper of this.bumpers) this.collideBumper(ball, bumper);
    for (const flipper of this.flippers) this.collideFlipper(ball, flipper);
    for (const rotor of this.rotors) this.collideRotor(ball, rotor);
    if (this.plunger) this.collidePlunger(ball, this.plunger);
    for (const sensor of this.sensors) this.checkSensor(ball, sensor);
  }

  private checkLayerGate(ball: Ball, gate: LayerGateDef): void {
    if (!segmentsCross(ball.prevX, ball.prevY, ball.x, ball.y, gate.ax, gate.ay, gate.bx, gate.by)) return;
    const forward = (ball.x - ball.prevX) * -(gate.by - gate.ay) + (ball.y - ball.prevY) * (gate.bx - gate.ax) > 0;
    let layer: number;
    if (forward && ball.layer === gate.from) layer = gate.to;
    else if (!forward && gate.reversible && ball.layer === gate.to) layer = gate.from;
    else return;
    ball.layer = layer;
    this.events.push({ type: "gate", id: gate.id, layer, speed: Math.hypot(ball.vx, ball.vy), x: ball.x, y: ball.y });
  }

  private collideSegment(ball: Ball, seg: Segment): void {
    const hit = closestOnCapsule(ball.x, ball.y, seg.ax, seg.ay, seg.bx, seg.by, 0, 0);
    if (hit.dist >= ball.r || hit.dist === 0) return;
    const nx = (ball.x - hit.cx) / hit.dist;
    const ny = (ball.y - hit.cy) / hit.dist;
    if (seg.oneWay) {
      const fx = -(seg.by - seg.ay);
      const fy = seg.bx - seg.ax;
      if (nx * fx + ny * fy < 0) return;
      if (ball.vx * fx + ball.vy * fy > 0) return;
    }
    const restitution = seg.kind === "belly" ? BELLY_RESTITUTION : this.params.wallRestitution;
    const impact = this.resolve(ball, nx, ny, ball.r - hit.dist, 0, 0, restitution);
    if (ny > BALANCED_ON_TIP) this.tipOffEndpoint(ball, seg, hit.cx, hit.cy);
    if (seg.kind === "sling" && impact >= this.params.slingMinImpact) {
      kick(ball, nx, ny, this.params.slingKick);
    }
    this.emitContact(seg.id, impact, hit.cx, hit.cy, seg.kind === "sling" || seg.kind === "target");
  }

  private collideBumper(ball: Ball, bumper: Bumper): void {
    const dx = ball.x - bumper.x;
    const dy = ball.y - bumper.y;
    const dist = Math.hypot(dx, dy);
    const minDist = ball.r + bumper.r;
    if (dist >= minDist || dist === 0) return;
    const nx = dx / dist;
    const ny = dy / dist;
    const impact = this.resolve(ball, nx, ny, minDist - dist, 0, 0, this.params.wallRestitution);
    if (bumper.recharge > 0 || impact === 0) return;
    bumper.recharge = BUMPER_RECHARGE_SECONDS;
    kick(ball, nx, ny, bumper.kick);
    this.emitContact(bumper.id, impact, bumper.x + nx * bumper.r, bumper.y + ny * bumper.r, true);
  }

  private collideFlipper(ball: Ball, flipper: Flipper): void {
    const tipX = flipper.x + Math.cos(flipper.angle) * flipper.length;
    const tipY = flipper.y + Math.sin(flipper.angle) * flipper.length;
    const hit = closestOnCapsule(ball.x, ball.y, flipper.x, flipper.y, tipX, tipY, flipper.baseRadius, flipper.tipRadius);
    const surface = hit.dist - hit.radius;
    const grace = flipper.omega !== 0 ? this.params.flipperGrace : 0;
    if (surface >= ball.r + grace || hit.dist === 0) return;
    const nx = (ball.x - hit.cx) / hit.dist;
    const ny = (ball.y - hit.cy) / hit.dist;
    const px = hit.cx + nx * hit.radius - flipper.x;
    const py = hit.cy + ny * hit.radius - flipper.y;
    const svx = -flipper.omega * py;
    const svy = flipper.omega * px;
    if (surface >= ball.r && svx * nx + svy * ny <= 0) return;
    const impact = this.resolve(ball, nx, ny, Math.max(0, ball.r - surface), svx, svy, this.params.flipperRestitution);
    this.emitContact(flipper.id, impact, hit.cx + nx * hit.radius, hit.cy + ny * hit.radius, false);
  }

  private collideRotor(ball: Ball, rotor: Rotor): void {
    if (Math.hypot(ball.x - rotor.x, ball.y - rotor.y) > rotor.armLength + rotor.armRadius + ball.r) return;
    for (let k = 0; k < rotor.arms; k++) {
      const a = rotor.angle + (k * Math.PI * 2) / rotor.arms;
      const tipX = rotor.x + Math.cos(a) * rotor.armLength;
      const tipY = rotor.y + Math.sin(a) * rotor.armLength;
      const hit = closestOnCapsule(ball.x, ball.y, rotor.x, rotor.y, tipX, tipY, rotor.armRadius, rotor.armRadius);
      const surface = hit.dist - hit.radius;
      if (surface >= ball.r || hit.dist === 0) continue;
      const nx = (ball.x - hit.cx) / hit.dist;
      const ny = (ball.y - hit.cy) / hit.dist;
      const px = hit.cx + nx * hit.radius - rotor.x;
      const py = hit.cy + ny * hit.radius - rotor.y;
      ball.x += nx * (ball.r - surface);
      ball.y += ny * (ball.r - surface);
      const vn = (ball.vx + rotor.omega * py) * nx + (ball.vy - rotor.omega * px) * ny;
      if (vn >= 0) continue;
      const arm = px * ny - py * nx;
      const impulse = (-(1 + rotor.restitution) * vn) / (1 + (arm * arm) / rotor.inertia);
      ball.vx += impulse * nx;
      ball.vy += impulse * ny;
      rotor.omega -= (impulse * arm) / rotor.inertia;
      this.emitContact(rotor.id, -vn, rotor.x + px, rotor.y + py, true);
    }
  }

  private collidePlunger(ball: Ball, plunger: Plunger): void {
    if (ball.x < plunger.ax || ball.x > plunger.bx) return;
    const gap = ball.y - plunger.y;
    if (gap >= ball.r || gap < -ball.r) return;
    this.resolve(ball, 0, 1, ball.r - gap, 0, plunger.vy, 0.1);
  }

  private checkSensor(ball: Ball, sensor: SensorDef): void {
    if (!segmentsCross(ball.prevX, ball.prevY, ball.x, ball.y, sensor.ax, sensor.ay, sensor.bx, sensor.by)) return;
    this.events.push({ type: "sensor", id: sensor.id, speed: Math.hypot(ball.vx, ball.vy), x: ball.x, y: ball.y, ball });
  }

  private resolve(ball: Ball, nx: number, ny: number, penetration: number, svx: number, svy: number, restitution: number): number {
    ball.x += nx * penetration;
    ball.y += ny * penetration;
    const rvx = ball.vx - svx;
    const rvy = ball.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const resting = -vn < this.params.restingSpeed;
    const e = resting ? 0 : restitution;
    const dvn = -(1 + e) * vn;
    ball.vx += dvn * nx;
    ball.vy += dvn * ny;
    const tx = -ny;
    const ty = nx;
    if (resting) {
      const gravityAlong = -this.params.gravity * this.stepDt * ty;
      ball.vx -= tx * gravityAlong * ROLLING_SLOWDOWN;
      ball.vy -= ty * gravityAlong * ROLLING_SLOWDOWN;
      return -vn;
    }
    const vt = rvx * tx + rvy * ty;
    const dvt = Math.sign(vt) * Math.min(Math.abs(vt), this.params.friction * dvn);
    ball.vx -= dvt * tx;
    ball.vy -= dvt * ty;
    return -vn;
  }

  private tipOffEndpoint(ball: Ball, seg: Segment, cx: number, cy: number): void {
    const atA = cx === seg.ax && cy === seg.ay;
    const atB = cx === seg.bx && cy === seg.by;
    if (!atA && !atB) return;
    const away = atA ? seg.ax - seg.bx : seg.bx - seg.ax;
    ball.vx += (Math.sign(away) || 1) * TIP_OFF_SPEED;
  }

  private emitContact(id: string, speed: number, x: number, y: number, always: boolean): void {
    if (speed < CONTACT_EVENT_SPEED && !(always && speed > 0)) return;
    this.events.push({ type: "contact", id, speed, x, y });
  }
}

const kick = (ball: Ball, nx: number, ny: number, speed: number) => {
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn >= speed) return;
  ball.vx += (speed - vn) * nx;
  ball.vy += (speed - vn) * ny;
};

const closestOnCapsule = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  ra: number,
  rb: number,
) => {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return { cx, cy, dist: Math.hypot(px - cx, py - cy), radius: ra + (rb - ra) * t };
};

const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

const segmentsCross = (
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number,
) => {
  const rx = p2x - p1x;
  const ry = p2y - p1y;
  const sx = q2x - q1x;
  const sy = q2y - q1y;
  const denom = cross(rx, ry, sx, sy);
  if (denom === 0) return false;
  const t = cross(q1x - p1x, q1y - p1y, sx, sy) / denom;
  const u = cross(q1x - p1x, q1y - p1y, rx, ry) / denom;
  return t > 0 && t <= 1 && u >= 0 && u <= 1;
};

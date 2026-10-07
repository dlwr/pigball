import { LAYER_FLOOR, LAYER_RAMP, type BumperDef, type RotorDef, type FlipperDef, type LayerGateDef, type PlungerDef, type SegmentDef, type SensorDef } from "../physics/world";

export const TABLE_WIDTH = 50;
export const TABLE_HEIGHT = 100;
export const PLAYFIELD_WIDTH = 46;
export const BALL_RADIUS = 1.35;
export const DRAIN_Y = -3;
export const SHOOTER_X = 48;

export interface TableLayout {
  walls: SegmentDef[];
  slings: SegmentDef[];
  targets: SegmentDef[];
  bumpers: BumperDef[];
  flippers: { left: FlipperDef; right: FlipperDef };
  plunger: PlungerDef;
  rollovers: SensorDef[];
  spinner: SensorDef;
  shooterExit: SensorDef;
  kickbacks: Record<Side, SensorDef>;
  rotor: RotorDef;
  bellies: SegmentDef[];
  ramp: Ramp;
}

export interface Ramp {
  path: Point[];
  width: number;
  rails: SegmentDef[];
  entry: LayerGateDef;
  exit: LayerGateDef;
}

export type Point = [number, number];

export type Side = "left" | "right";

const mirrorX = (x: number) => PLAYFIELD_WIDTH - x;

const polyline = (id: string, points: Point[], kind: SegmentDef["kind"] = "wall"): SegmentDef[] =>
  points.slice(1).map(([bx, by], i) => {
    const [ax, ay] = points[i];
    return { id: `${id}-${i}`, ax, ay, bx, by, kind };
  });

const arc = (cx: number, cy: number, r: number, from: number, to: number, n: number): Point[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
  });

const mirrored = (points: Point[]): Point[] => points.map(([x, y]): Point => [mirrorX(x), y]).reverse();

const FLIPPER_SWING = 0.52;
const leftInlane: Point[] = [[4, 32], [4, 20], [15, 12.9]];
const leftSlingBack: Point[] = [[12.3, 19.5], [7.8, 22.5], [7.8, 29]];
const leftSlingFace: Point[] = [[7.8, 29], [12.3, 19.5]];

export const createLayout = (): TableLayout => ({
  walls: [
    ...polyline("outer", [[0, -5], ...arc(25, 75, 25, Math.PI, 0, 28), [50, -5]]),
    ...polyline("shooter-wall", [[46, -5], [46, 80]]),
    { id: "shooter-gate", ax: 46, ay: 80, bx: 50, by: 83.5, kind: "wall", oneWay: true },
    { id: "kickback-guide-l", ax: 4.5, ay: 42, bx: 0, by: 34, kind: "wall", oneWay: true },
    { id: "kickback-guide-r", ax: 46, ay: 50, bx: 41, by: 58, kind: "wall", oneWay: true },
    ...polyline("inlane-l", leftInlane),
    ...polyline("inlane-r", mirrored(leftInlane)),
    ...polyline("sling-back-l", leftSlingBack),
    ...polyline("sling-back-r", mirrored(leftSlingBack)),
    ...[15, 21, 27, 33].map((x, i) => ({ id: `lane-post-${i}`, ax: x, ay: 87, bx: x, by: 91 })),
  ],
  slings: [
    ...polyline("sling-l", leftSlingFace, "sling"),
    ...polyline("sling-r", mirrored(leftSlingFace), "sling"),
  ],
  targets: [46, 50.5, 55].map((y, i) => ({ id: `target-${i}`, ax: 2, ay: y, bx: 2, by: y + 3, kind: "target" as const })),
  bumpers: [
    { id: "bumper-0", x: 16, y: 66, r: 2.6, kick: 110 },
    { id: "bumper-1", x: 30, y: 66, r: 2.6, kick: 110 },
    { id: "bumper-2", x: 23, y: 58, r: 2.6, kick: 110 },
  ],
  flippers: {
    left: {
      id: "flipper-l",
      x: 14.5,
      y: 12,
      length: 7,
      baseRadius: 1.1,
      tipRadius: 0.6,
      restAngle: -FLIPPER_SWING,
      activeAngle: FLIPPER_SWING,
    },
    right: {
      id: "flipper-r",
      x: mirrorX(14.5),
      y: 12,
      length: 7,
      baseRadius: 1.1,
      tipRadius: 0.6,
      restAngle: Math.PI + FLIPPER_SWING,
      activeAngle: Math.PI - FLIPPER_SWING,
    },
  },
  plunger: { ax: 46, bx: 50, restY: 3, travel: 3 },
  rollovers: [15, 21, 27].map((x, i) => ({ id: `rollover-${i}`, ax: x, ay: 89, bx: x + 6, by: 89 })),
  spinner: { id: "spinner", ax: 29, ay: 78, bx: 35, by: 78 },
  shooterExit: { id: "shooter-exit", ax: 46, ay: 78, bx: 50, by: 78 },
  bellies: [
    { id: "belly-l", ax: 0.25, ay: 62, bx: 0.25, by: 72, kind: "belly" },
    { id: "belly-r", ax: PLAYFIELD_WIDTH - 0.25, ay: 60, bx: PLAYFIELD_WIDTH - 0.25, by: 70, kind: "belly" },
  ],
  rotor: { id: "rotor", x: 23, y: 36, arms: 4, armLength: 2.8, armRadius: 0.6, inertia: 12, damping: 0.8, restitution: 0.25 },
  kickbacks: {
    left: { id: "kickback-left", ax: 0, ay: 10, bx: 4, by: 10 },
    right: { id: "kickback-right", ax: 42, ay: 10, bx: 46, by: 10 },
  },
  ramp: createRamp(),
});

const RAMP_CONTROL: Point[] = [
  [36.5, 40], [39.5, 47], [41.8, 58], [42, 72], [40.5, 84], [35, 91], [25, 93.5], [15, 91.5], [9.5, 84], [8, 70], [7, 52], [6, 36],
];
const RAMP_WIDTH = 4.4;
const RAMP_SAMPLES_PER_SPAN = 6;
const RAMP_MOUTH_LENGTH = 9;

const catmullRom = (points: Point[], perSpan: number): Point[] => {
  const result: Point[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const [p1, p2] = [points[i], points[i + 1]];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let j = 0; j < perSpan; j++) {
      const t = j / perSpan;
      const t2 = t * t;
      const t3 = t2 * t;
      const at = (k: 0 | 1) =>
        0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t3);
      result.push([at(0), at(1)]);
    }
  }
  result.push(points[points.length - 1]);
  return result;
};

const normalAt = (path: Point[], i: number): Point => {
  const [ax, ay] = path[Math.max(0, i - 1)];
  const [bx, by] = path[Math.min(path.length - 1, i + 1)];
  const len = Math.hypot(bx - ax, by - ay);
  return [-(by - ay) / len, (bx - ax) / len];
};

const pathLengths = (path: Point[]): number[] =>
  path.reduce<number[]>((acc, [x, y], i) => {
    acc.push(i === 0 ? 0 : acc[i - 1] + Math.hypot(x - path[i - 1][0], y - path[i - 1][1]));
    return acc;
  }, []);

const gateAcross = (path: Point[], i: number, id: string, half: number): Pick<LayerGateDef, "id" | "ax" | "ay" | "bx" | "by"> => {
  const [x, y] = path[i];
  const [nx, ny] = normalAt(path, i);
  return { id, ax: x + nx * half, ay: y + ny * half, bx: x - nx * half, by: y - ny * half };
};

const createRamp = (): Ramp => {
  const path = catmullRom(RAMP_CONTROL, RAMP_SAMPLES_PER_SPAN);
  const lengths = pathLengths(path);
  const half = RAMP_WIDTH / 2;
  const rails: SegmentDef[] = [];
  for (const side of [1, -1]) {
    const offset = path.map(([x, y], i): Point => {
      const [nx, ny] = normalAt(path, i);
      return [x + nx * half * side, y + ny * half * side];
    });
    for (let i = 0; i < offset.length - 1; i++) {
      const [ax, ay] = offset[i];
      const [bx, by] = offset[i + 1];
      const layers = lengths[i] < RAMP_MOUTH_LENGTH ? LAYER_FLOOR | LAYER_RAMP : LAYER_RAMP;
      rails.push({ id: `ramp-rail-${side > 0 ? "l" : "r"}-${i}`, ax, ay, bx, by, layers });
    }
  }
  return {
    path,
    width: RAMP_WIDTH,
    rails,
    entry: { ...gateAcross(path, 0, "ramp-entry", half), from: LAYER_FLOOR, to: LAYER_RAMP, reversible: true },
    exit: { ...gateAcross(path, path.length - 1, "ramp-exit", half), from: LAYER_RAMP, to: LAYER_FLOOR, reversible: false },
  };
};

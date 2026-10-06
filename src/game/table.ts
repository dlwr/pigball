import type { BumperDef, FlipperDef, PlungerDef, SegmentDef, SensorDef } from "../physics/world";

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
}

type Point = [number, number];

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
  spinner: { id: "spinner", ax: 34, ay: 80, bx: 40, by: 80 },
  shooterExit: { id: "shooter-exit", ax: 46, ay: 78, bx: 50, by: 78 },
});

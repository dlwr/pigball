import * as THREE from "three";
import type { Ramp } from "../game/table";
import { PALETTE } from "./palette";

const TOP_HEIGHT = 5;
const EXIT_HEIGHT = 2;
const RISE_LENGTH = 12;
const FALL_LENGTH = 14;
const RAIL_HEIGHT = 1.1;
const RAIL_THICKNESS = 0.35;
const SUPPORT_EVERY = 14;
const BULGE_WIDTH = 1.4;
const BULGE_RADIUS = 2.2;

export interface RampProgress {
  towardMultiball: number;
  multiballAt: number;
  inMultiball: boolean;
  ramps: number;
  extraBallAt: number;
}

const LAMP_SPACING = 3.1;
const LAMP_RADIUS = 1.15;
const MARK_RADIUS = 0.6;

interface RailPlacement {
  center: THREE.Vector3;
  outward: THREE.Vector3;
  quaternion: THREE.Quaternion;
  length: number;
}

const smoothstep = (t: number) => {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
};

export class RampView {
  readonly group = new THREE.Group();
  private readonly lengths: number[];
  private readonly total: number;
  private readonly railMaterial: THREE.MeshStandardMaterial;
  private readonly rails: THREE.InstancedMesh;
  private readonly placements: RailPlacement[] = [];
  private readonly bulges: number[];
  private readonly matrix = new THREE.Matrix4();
  private readonly position = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly floorMaterial: THREE.MeshStandardMaterial;
  private readonly lampMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly markMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly cool = new THREE.Color(PALETTE.ramp);
  private readonly hot = new THREE.Color(PALETTE.rampHot);
  private readonly truffle = new THREE.Color(PALETTE.truffle);
  private readonly tint = new THREE.Color();
  private time = 0;
  private glow = 0;

  constructor(private readonly ramp: Ramp) {
    const { path } = ramp;
    this.lengths = path.map(() => 0);
    for (let i = 1; i < path.length; i++) {
      this.lengths[i] = this.lengths[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
    }
    this.total = this.lengths[this.lengths.length - 1];

    const floor = this.createFloor();
    this.floorMaterial = floor.material as THREE.MeshStandardMaterial;
    this.group.add(floor);
    this.railMaterial = new THREE.MeshStandardMaterial({
      color: PALETTE.ramp,
      emissive: PALETTE.ramp,
      emissiveIntensity: 0.08,
      metalness: 0.3,
      roughness: 0.4,
    });
    this.rails = this.createRails();
    this.bulges = this.placements.map(() => 0);
    this.group.add(this.rails);
    this.group.add(this.createSupports());
  }

  addProgressLamps(multiballAt: number, extraBallAt: number): void {
    const { path } = this.ramp;
    const [x0, y0] = path[0];
    const [x1, y1] = path[1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    const [dx, dy] = [(x1 - x0) / len, (y1 - y0) / len];
    for (let i = 0; i < multiballAt; i++) {
      const material = new THREE.MeshStandardMaterial({ color: 0x1a0610, emissive: PALETTE.pigSkin, emissiveIntensity: 0, roughness: 0.5 });
      const lamp = new THREE.Mesh(new THREE.CircleGeometry(LAMP_RADIUS, 24), material);
      const back = (multiballAt - i) * LAMP_SPACING;
      lamp.position.set(x0 - dx * back, y0 - dy * back, 0.03);
      const nostrils = new THREE.Mesh(new THREE.CircleGeometry(0.2, 10), new THREE.MeshBasicMaterial({ color: PALETTE.pigNostril }));
      for (const side of [-1, 1]) {
        const nostril = nostrils.clone();
        nostril.position.set(side * 0.38, 0, 0.01);
        nostril.scale.set(0.8, 1.3, 1);
        lamp.add(nostril);
      }
      this.lampMaterials.push(material);
      this.group.add(lamp);
    }
    for (let i = 0; i < extraBallAt; i++) {
      const s = this.total * (0.18 + (0.64 * i) / (extraBallAt - 1));
      const index = this.lengths.findIndex((l) => l >= s);
      const [x, y] = path[index];
      const material = new THREE.MeshStandardMaterial({ color: 0x1a0610, emissive: PALETTE.truffle, emissiveIntensity: 0, roughness: 0.4 });
      const mark = new THREE.Mesh(new THREE.CircleGeometry(MARK_RADIUS, 16), material);
      mark.position.set(x, y, this.heightAtLength(this.lengths[index]) + 0.04);
      this.markMaterials.push(material);
      this.group.add(mark);
    }
  }

  setProgress(progress: RampProgress, dt: number): void {
    this.time += dt;
    const { towardMultiball, multiballAt, inMultiball, ramps, extraBallAt } = progress;
    const ready = !inMultiball && towardMultiball === multiballAt - 1;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * (inMultiball ? 10 : 6));
    this.lampMaterials.forEach((material, i) => {
      const lit = inMultiball || i < towardMultiball;
      const blinking = ready && i === towardMultiball;
      material.emissiveIntensity = lit ? (inMultiball ? 0.6 + pulse * 0.6 : 0.9) : blinking ? pulse * 0.9 : 0.04;
    });
    this.markMaterials.forEach((material, i) => {
      material.emissiveIntensity = i < ramps ? (ramps >= extraBallAt ? 0.5 + pulse * 0.4 : 0.8) : 0.04;
    });
    if (inMultiball) this.tint.copy(this.hot).lerp(this.truffle, pulse);
    else this.tint.copy(this.cool).lerp(this.hot, towardMultiball / (multiballAt - 1) * (ready ? 0.6 + pulse * 0.4 : 1));
    this.floorMaterial.color.copy(this.tint);
    this.railMaterial.color.copy(this.tint);
    this.railMaterial.emissive.copy(this.tint);
  }

  heightAtLength(s: number): number {
    const rise = smoothstep(s / RISE_LENGTH) * TOP_HEIGHT;
    const fall = smoothstep((s - (this.total - FALL_LENGTH)) / FALL_LENGTH) * (TOP_HEIGHT - EXIT_HEIGHT);
    return rise - fall;
  }

  heightAt(x: number, y: number): number {
    const { path } = this.ramp;
    let best = Infinity;
    let bestS = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, ay] = path[i];
      const [bx, by] = path[i + 1];
      const dx = bx - ax;
      const dy = by - ay;
      const lenSq = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lenSq));
      const d = Math.hypot(x - ax - dx * t, y - ay - dy * t);
      if (d < best) {
        best = d;
        bestS = this.lengths[i] + (this.lengths[i + 1] - this.lengths[i]) * t;
      }
    }
    return this.heightAtLength(bestS);
  }

  flash(): void {
    this.glow = 1;
  }

  update(dt: number, ballsOnRamp: { x: number; y: number }[]): void {
    this.glow *= Math.exp(-dt * 4);
    this.railMaterial.emissiveIntensity = 0.08 + this.glow * 2;
    let changed = false;
    this.placements.forEach((rail, i) => {
      const nearest = ballsOnRamp.reduce((d, b) => Math.min(d, Math.hypot(b.x - rail.center.x, b.y - rail.center.y)), Infinity);
      const goal = BULGE_WIDTH * Math.exp(-((nearest / BULGE_RADIUS) ** 2));
      const bulge = this.bulges[i] + (goal - this.bulges[i]) * Math.min(1, dt * 18);
      if (Math.abs(bulge - this.bulges[i]) < 1e-4 && goal < 1e-3) return;
      this.bulges[i] = bulge;
      this.position.copy(rail.center).addScaledVector(rail.outward, bulge);
      this.position.z += bulge * 0.35;
      this.scale.set(rail.length + RAIL_THICKNESS, 1 + bulge * 0.6, 1 + bulge * 0.8);
      this.matrix.compose(this.position, rail.quaternion, this.scale);
      this.rails.setMatrixAt(i, this.matrix);
      changed = true;
    });
    if (changed) this.rails.instanceMatrix.needsUpdate = true;
  }

  private normalAt(i: number): [number, number] {
    const { path } = this.ramp;
    const [ax, ay] = path[Math.max(0, i - 1)];
    const [bx, by] = path[Math.min(path.length - 1, i + 1)];
    const len = Math.hypot(bx - ax, by - ay);
    return [-(by - ay) / len, (bx - ax) / len];
  }

  private createFloor(): THREE.Mesh {
    const { path, width } = this.ramp;
    const positions: number[] = [];
    const indices: number[] = [];
    path.forEach(([x, y], i) => {
      const [nx, ny] = this.normalAt(i);
      const z = this.heightAtLength(this.lengths[i]);
      positions.push(x + (nx * width) / 2, y + (ny * width) / 2, z, x - (nx * width) / 2, y - (ny * width) / 2, z);
      if (i > 0) {
        const a = (i - 1) * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({
      color: PALETTE.ramp,
      transparent: true,
      opacity: 0.22,
      roughness: 0.1,
      metalness: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    return new THREE.Mesh(geometry, material);
  }

  private createRails(): THREE.InstancedMesh {
    const { rails } = this.ramp;
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, RAIL_THICKNESS, RAIL_HEIGHT), this.railMaterial, rails.length);
    const matrix = new THREE.Matrix4();
    const axis = new THREE.Vector3(0, 0, 1);
    const { path } = this.ramp;
    rails.forEach((rail, i) => {
      const length = Math.hypot(rail.bx - rail.ax, rail.by - rail.ay);
      const cx = (rail.ax + rail.bx) / 2;
      const cy = (rail.ay + rail.by) / 2;
      const z = this.heightAt(cx, cy);
      const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, Math.atan2(rail.by - rail.ay, rail.bx - rail.ax));
      const [px, py] = path.reduce((best, p) => (Math.hypot(p[0] - cx, p[1] - cy) < Math.hypot(best[0] - cx, best[1] - cy) ? p : best));
      const outward = new THREE.Vector3(cx - px, cy - py, 0).normalize();
      const center = new THREE.Vector3(cx, cy, z + RAIL_HEIGHT / 2);
      this.placements.push({ center, outward, quaternion, length });
      matrix.compose(center, quaternion, new THREE.Vector3(length + RAIL_THICKNESS, 1, 1));
      mesh.setMatrixAt(i, matrix);
    });
    mesh.castShadow = true;
    return mesh;
  }

  private createSupports(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: PALETTE.wall, metalness: 0, roughness: 0.5 });
    const geometry = new THREE.CylinderGeometry(0.25, 0.25, 1, 10);
    const { path, width } = this.ramp;
    for (let s = SUPPORT_EVERY; s < this.total - 4; s += SUPPORT_EVERY) {
      const i = this.lengths.findIndex((l) => l >= s);
      const [nx, ny] = this.normalAt(i);
      const h = this.heightAtLength(this.lengths[i]);
      for (const side of [1, -1]) {
        const post = new THREE.Mesh(geometry, material);
        post.rotation.x = Math.PI / 2;
        post.scale.y = h;
        post.position.set(path[i][0] + (nx * width * side) / 2, path[i][1] + (ny * width * side) / 2, h / 2);
        post.castShadow = true;
        group.add(post);
      }
    }
    return group;
  }
}

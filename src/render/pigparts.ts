import * as THREE from "three";
import type { SegmentDef } from "../physics/world";
import { PALETTE } from "./palette";

const standard = (color: number, roughness: number, emissive = 0x000000, emissiveIntensity = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, emissive, emissiveIntensity });

const shadowed = <T extends THREE.Mesh>(mesh: T) => {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

export interface Part {
  object: THREE.Object3D;
  material: THREE.MeshStandardMaterial;
  react(value: number): void;
}

export interface Snout extends Part {
  setLevel(level: number, time: number, dt: number): void;
}

const LEVEL_GROWTH = 0.07;

export const createSnout = (x: number, y: number, r: number): Snout => {
  const group = new THREE.Group();
  const material = standard(PALETTE.pigSnout, 0.45, PALETTE.pigSnout, 0.15);
  const snout = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.04, 1.8, 40).rotateX(Math.PI / 2), material));
  snout.position.z = 0.9;
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * 0.92, 0.22, 10, 40), material));
  rim.position.z = 1.8;
  const top = shadowed(new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 40), material));
  top.position.z = 1.81;
  const nostrilMaterial = standard(PALETTE.pigNostril, 0.9);
  const nostrils = [-1, 1].map((side) => {
    const nostril = new THREE.Mesh(new THREE.CircleGeometry(1, 20), nostrilMaterial);
    nostril.position.set(side * r * 0.36, -r * 0.05, 1.83);
    nostril.rotation.z = side * 0.35;
    nostril.scale.set(r * 0.16, r * 0.28, 1);
    return nostril;
  });
  group.add(snout, rim, top, ...nostrils);
  group.position.set(x, y, 0);
  const color = new THREE.Color(PALETTE.snoutLevels[0]);
  const goal = new THREE.Color();
  let currentLevel = 1;
  let pop = 0;
  return {
    object: group,
    material,
    react(value) {
      group.scale.z = 1 - value * 0.35;
      nostrils.forEach((nostril) => nostril.scale.set(r * (0.16 + value * 0.12), r * (0.28 + value * 0.1), 1));
    },
    setLevel(level, time, dt) {
      if (level !== currentLevel) {
        pop = 1;
        currentLevel = level;
      }
      pop *= Math.exp(-dt * 6);
      goal.setHex(PALETTE.snoutLevels[Math.min(level, PALETTE.snoutLevels.length) - 1]);
      color.lerp(goal, Math.min(1, dt * 8));
      material.color.copy(color);
      material.emissive.copy(color);
      const beat = level >= PALETTE.snoutLevels.length ? Math.max(0, Math.sin(time * 9)) ** 4 * 0.08 : 0;
      const size = 1 + (level - 1) * LEVEL_GROWTH + Math.sin(pop * Math.PI * 3) * pop * 0.25 + beat;
      group.scale.x = size;
      group.scale.y = size;
    },
  };
};

export const createLips = (seg: SegmentDef): Part => {
  const group = new THREE.Group();
  const length = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
  const material = standard(PALETTE.pigLips, 0.35, PALETTE.pigLips, 0.15);
  const lip = (offset: number, thickness: number) => {
    const mesh = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(thickness, length, 6, 16).rotateZ(Math.PI / 2), material));
    mesh.position.set(0, offset, 0.9);
    mesh.scale.set(1, 1, 1.4);
    return mesh;
  };
  const upper = lip(0.32, 0.42);
  const lower = lip(-0.32, 0.5);
  group.add(upper, lower);
  group.position.set((seg.ax + seg.bx) / 2, (seg.ay + seg.by) / 2, 0);
  group.rotation.z = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax);
  return {
    object: group,
    material,
    react(value) {
      upper.position.y = 0.32 + value * 0.35;
      lower.position.y = -0.32 - value * 0.35;
      group.scale.x = 1 - value * 0.2;
    },
  };
};

export const createTooth = (seg: SegmentDef): THREE.Mesh => {
  const height = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
  const tooth = shadowed(
    new THREE.Mesh(new THREE.CapsuleGeometry(0.75, height - 1.2, 6, 12), standard(PALETTE.tooth, 0.35, PALETTE.tooth, 0.04)),
  );
  tooth.scale.z = 1.3;
  tooth.position.set((seg.ax + seg.bx) / 2 + 0.2, (seg.ay + seg.by) / 2, 0);
  tooth.rotation.z = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax) - Math.PI / 2;
  return tooth;
};

export const createGum = (x: number, bottom: number, top: number): THREE.Mesh => {
  const gum = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(0.9, top - bottom, 6, 12), standard(PALETTE.gum, 0.5)));
  gum.position.set(x, (top + bottom) / 2, 0.4);
  gum.scale.z = 0.8;
  return gum;
};

export const createCurlyTail = (ax: number, bx: number): THREE.Mesh => {
  const turns = 3;
  const radius = 0.55;
  const width = bx - ax - 0.6;
  const points = Array.from({ length: 96 }, (_, i) => {
    const t = i / 95;
    const a = t * turns * Math.PI * 2;
    return new THREE.Vector3((t - 0.5) * width, Math.cos(a) * radius, Math.sin(a) * radius);
  });
  return shadowed(
    new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 160, 0.2, 8),
      standard(PALETTE.pigSkin, 0.5, PALETTE.pigSkin, 0.15),
    ),
  );
};

const EYE_WHITE = standard(0xf2f2f2, 0.45);
const PUPIL = standard(0x0d0d10, 0.1);
const EYE_GEOMETRY = new THREE.SphereGeometry(1, 24, 16);
const PUPIL_RANGE = 0.42;
const PUPIL_STIFFNESS = 90;
const PUPIL_DAMPING = 7;

export class GooglyEye {
  readonly object = new THREE.Group();
  private readonly pupil: THREE.Mesh;
  private readonly offset = new THREE.Vector2();
  private readonly velocity = new THREE.Vector2();
  private readonly goal = new THREE.Vector2();

  constructor(
    private readonly x: number,
    private readonly y: number,
    private readonly size: number,
  ) {
    const white = shadowed(new THREE.Mesh(EYE_GEOMETRY, EYE_WHITE));
    white.scale.set(size, size, size * 0.55);
    this.pupil = new THREE.Mesh(EYE_GEOMETRY, PUPIL);
    this.pupil.scale.set(size * 0.48, size * 0.48, size * 0.12);
    this.object.add(white, this.pupil);
    this.object.position.set(x, y, size * 0.6 + 1.2);
  }

  set shown(value: number) {
    this.object.visible = value > 0.01;
    this.object.scale.setScalar(value);
  }

  jiggle(strength: number): void {
    this.velocity.x += (Math.random() * 2 - 1) * strength;
    this.velocity.y += (Math.random() * 2 - 1) * strength;
  }

  update(target: THREE.Vector2 | null, dt: number): void {
    if (target) this.goal.set(target.x - this.x, target.y - this.y).clampLength(0, 1).multiplyScalar(this.size * PUPIL_RANGE);
    else this.goal.set(0, 0);
    const step = Math.min(dt, 1 / 30);
    this.velocity.x += ((this.goal.x - this.offset.x) * PUPIL_STIFFNESS - this.velocity.x * PUPIL_DAMPING) * step;
    this.velocity.y += ((this.goal.y - this.offset.y) * PUPIL_STIFFNESS - this.velocity.y * PUPIL_DAMPING) * step;
    this.offset.addScaledVector(this.velocity, step).clampLength(0, this.size * 0.55);
    this.pupil.position.set(this.offset.x, this.offset.y, this.size * 0.5);
  }
}

export interface Mouth {
  object: THREE.Object3D;
  open(value: number): void;
}

export const createMouth = (x: number, y: number, width: number): Mouth => {
  const group = new THREE.Group();
  const cavity = new THREE.Mesh(new THREE.CircleGeometry(1, 32), standard(PALETTE.mouth, 0.9));
  cavity.position.z = 0.03;
  const tongue = new THREE.Mesh(new THREE.CircleGeometry(1, 24), standard(PALETTE.tongue, 0.5, PALETTE.tongue, 0.2));
  tongue.position.set(0, -0.35, 0.05);
  tongue.scale.set(0.45, 0.4, 1);
  const lips = shadowed(new THREE.Mesh(new THREE.TorusGeometry(1, 0.16, 10, 40), standard(PALETTE.pigLips, 0.4, PALETTE.pigLips, 0.2)));
  lips.position.z = 0.1;
  const inner = new THREE.Group();
  inner.add(cavity, tongue, lips);
  group.add(inner);
  group.position.set(x, y, 0);
  group.scale.set(width / 2, width / 2, 1);
  return {
    object: group,
    open(value) {
      inner.scale.set(1 + value * 0.1, 0.32 + value * 0.6, 1);
    },
  };
};

export const createPlayfieldSkin = (width: number, height: number): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d")!;
  const gradient = ctx.createRadialGradient(256, 560, 40, 256, 560, 720);
  gradient.addColorStop(0, "#3d1424");
  gradient.addColorStop(0.6, "#260a16");
  gradient.addColorStop(1, "#10040a");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 1024);
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 2600; i++) {
    const px = random() * 512;
    const py = random() * 1024;
    ctx.fillStyle = random() < 0.7 ? "rgba(20,4,10,0.35)" : "rgba(255,170,195,0.08)";
    ctx.beginPath();
    ctx.arc(px, py, 0.8 + random() * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.lineCap = "round";
  for (let i = 0; i < 260; i++) {
    const px = random() * 512;
    const py = random() * 1024;
    const angle = -Math.PI / 2 + (random() - 0.5) * 1.2;
    const length = 6 + random() * 10;
    ctx.strokeStyle = `rgba(255,205,220,${0.08 + random() * 0.1})`;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + Math.cos(angle) * length * 0.5 + 2, py + Math.sin(angle) * length * 0.5, px + Math.cos(angle) * length, py + Math.sin(angle) * length);
    ctx.stroke();
  }
  ctx.strokeStyle = "rgba(15,3,8,0.25)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    const py = 80 + random() * 880;
    const px = random() * 380;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.bezierCurveTo(px + 30, py - 10, px + 70, py + 12, px + 110 + random() * 40, py);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.repeat.set(width / 54, height / 110);
  return texture;
};

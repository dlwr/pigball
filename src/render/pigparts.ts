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

export interface Rotor {
  object: THREE.Group;
  poke(strength: number): void;
  update(angle: number, dt: number): void;
}

const JELLY_STIFFNESS = 260;
const JELLY_DAMPING = 9;

export const createRotor = (arms: number, armLength: number, armRadius: number): Rotor => {
  const group = new THREE.Group();
  const leg = standard(PALETTE.pigSkin, 0.6, PALETTE.pigSkin, 0.06);
  const hoof = standard(PALETTE.hoof, 0.35);
  const limbs: THREE.Group[] = [];
  for (let k = 0; k < arms; k++) {
    const arm = new THREE.Group();
    const shin = shadowed(new THREE.Mesh(new THREE.CapsuleGeometry(armRadius, armLength - armRadius * 1.6, 8, 16).rotateZ(Math.PI / 2), leg));
    shin.position.set(armLength / 2, 0, 0);
    shin.scale.set(1, 1, 1.25);
    arm.add(shin);
    for (const side of [-1, 1]) {
      const toe = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 14, 12), hoof));
      toe.scale.set(armRadius * 0.9, armRadius * 0.6, armRadius * 0.9);
      toe.position.set(armLength - armRadius * 0.1, side * armRadius * 0.45, 0);
      arm.add(toe);
    }
    arm.rotation.z = (k * Math.PI * 2) / arms;
    limbs.push(arm);
    group.add(arm);
  }
  const hub = shadowed(new THREE.Mesh(new THREE.SphereGeometry(armRadius * 1.9, 24, 16), standard(PALETTE.pigSnout, 0.55)));
  hub.scale.z = 0.6;
  group.add(hub);
  let wobble = 0;
  let wobbleVelocity = 0;
  let time = 0;
  return {
    object: group,
    poke(strength) {
      wobbleVelocity += strength;
    },
    update(angle, dt) {
      time += dt;
      const step = Math.min(dt, 1 / 30);
      wobbleVelocity += (-JELLY_STIFFNESS * wobble - JELLY_DAMPING * wobbleVelocity) * step;
      wobble += wobbleVelocity * step;
      group.rotation.z = angle;
      limbs.forEach((limb, k) => {
        const phase = (k * Math.PI) / 2;
        limb.rotation.z = (k * Math.PI * 2) / arms + wobble * 0.25 * Math.sin(phase + 1);
        const breathe = 1 + 0.03 * Math.sin(time * 3 + phase);
        limb.scale.set(1 + wobble * 0.18 * Math.cos(phase), breathe - wobble * 0.15, breathe - wobble * 0.15);
      });
      hub.scale.set(1 - wobble * 0.12, 1 + wobble * 0.12, 0.6);
    },
  };
};

export const createBelly = (seg: SegmentDef, inward: number): Part => {
  const length = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
  const material = standard(PALETTE.pigSkin, 0.55, PALETTE.pigSkin, 0.1);
  const group = new THREE.Group();
  const belly = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), material));
  belly.scale.set(0.9, length / 2, 1.2);
  const crease = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.06, 6, 16), standard(PALETTE.gum, 0.7));
  crease.position.set(inward * 0.85, 0, 0.6);
  crease.rotation.y = inward * 0.9;
  group.add(belly, crease);
  group.position.set((seg.ax + seg.bx) / 2 - inward * 0.3, (seg.ay + seg.by) / 2, 0.6);
  return {
    object: group,
    material,
    react(value) {
      belly.scale.x = 0.9 - value * 0.35 + Math.sin(value * Math.PI * 4) * value * 0.15;
      belly.scale.y = length / 2 + value * 0.6;
    },
  };
};

export interface Navel {
  object: THREE.Object3D;
  update(holding: boolean, time: number, dt: number): void;
  spit(): void;
}

export const createNavel = (x: number, y: number, r: number): Navel => {
  const group = new THREE.Group();
  const pit = new THREE.Mesh(new THREE.CircleGeometry(r * 1.05, 32), standard(PALETTE.mouth, 0.95));
  pit.position.z = 0.02;
  const swirl = new THREE.Mesh(new THREE.TorusGeometry(r * 0.45, 0.07, 6, 24, Math.PI * 1.5), standard(PALETTE.gum, 0.8));
  swirl.position.z = 0.04;
  const rim = shadowed(new THREE.Mesh(new THREE.TorusGeometry(r * 1.15, 0.38, 12, 32), standard(PALETTE.pigSkin, 0.6, PALETTE.pigSkin, 0.06)));
  rim.position.z = 0.15;
  rim.scale.z = 0.7;
  group.add(pit, swirl, rim);
  group.position.set(x, y, 0);
  let spit = 0;
  return {
    object: group,
    update(holding, time, dt) {
      spit *= Math.exp(-dt * 7);
      const chew = holding ? Math.abs(Math.sin(time * 14)) * 0.12 : 0;
      rim.scale.set(1 - chew + spit * 0.35, 1 + chew * 0.6 + spit * 0.35, 0.7);
      swirl.rotation.z = time * (holding ? 6 : 0.6);
    },
    spit() {
      spit = 1;
    },
  };
};

export interface PiggyBank {
  object: THREE.Group;
  update(x: number, y: number, cracks: number, visible: boolean, time: number, dt: number): void;
  bump(): void;
}

export const createPiggyBank = (r: number, maxCracks: number): PiggyBank => {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const skin = standard(PALETTE.pigSkin, 0.3, PALETTE.pigSkin, 0.08);
  const torso = shadowed(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin));
  torso.scale.set(r * 1.35, r, r * 0.95);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(r * 0.9, r * 0.14, 0.2), standard(PALETTE.mouth, 0.9));
  slot.position.set(0, 0.1, r * 0.93);
  const snout = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.38, r * 0.42, r * 0.35, 20), standard(PALETTE.pigSnout, 0.4)));
  snout.position.set(0, -r * 0.95, r * 0.15);
  const nostrils = [-1, 1].map((side) => {
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(r * 0.08, 8, 6), standard(PALETTE.pigNostril, 0.9));
    nostril.position.set(side * r * 0.14, -r * 1.13, r * 0.18);
    return nostril;
  });
  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Group();
    const white = new THREE.Mesh(new THREE.SphereGeometry(r * (side < 0 ? 0.24 : 0.19), 14, 10), standard(0xf2f2f2, 0.4));
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(r * 0.1, 10, 8), standard(0x0d0d10, 0.1));
    pupil.position.set(0, -r * 0.12, r * 0.12);
    eye.add(white, pupil);
    eye.position.set(side * r * 0.42, -r * 0.62, r * 0.62);
    return eye;
  });
  const ears = [-1, 1].map((side) => {
    const ear = shadowed(new THREE.Mesh(new THREE.ConeGeometry(r * 0.28, r * 0.5, 10), skin));
    ear.position.set(side * r * 0.6, -r * 0.35, r * 0.9);
    ear.rotation.set(0.6, 0, -side * 0.5);
    return ear;
  });
  const crackMaterial = new THREE.MeshBasicMaterial({ color: PALETTE.mouth });
  const cracks = Array.from({ length: maxCracks }, (_, i) => {
    const crack = new THREE.Mesh(new THREE.BoxGeometry(r * (0.5 + (i % 2) * 0.25), 0.07, 0.05), crackMaterial);
    const a = (i / maxCracks) * Math.PI * 2 + 0.4;
    crack.position.set(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.55, r * 0.72);
    crack.rotation.z = a + 1.1;
    crack.visible = false;
    return crack;
  });
  body.add(torso, slot, snout, ...nostrils, ...eyes, ...ears, ...cracks);
  group.add(body);
  let bump = 0;
  let shown = 1;
  return {
    object: group,
    update(x, y, crackCount, visible, time, dt) {
      group.position.set(x, y, r * 0.9);
      bump *= Math.exp(-dt * 8);
      shown += ((visible ? 1 : 0) - shown) * Math.min(1, dt * (visible ? 6 : 20));
      group.visible = shown > 0.02;
      const wobble = Math.sin(time * 3) * 0.05 + Math.sin(bump * Math.PI * 3) * bump * 0.25;
      body.rotation.z = wobble;
      body.scale.setScalar(shown * (1 + bump * 0.15));
      cracks.forEach((crack, i) => (crack.visible = i < crackCount));
    },
    bump() {
      bump = 1;
    },
  };
};

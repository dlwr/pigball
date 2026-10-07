import * as THREE from "three";
import { PALETTE } from "./palette";

const material = (color: number, roughness: number, emissive = 0x000000, emissiveIntensity = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness: 0, emissive, emissiveIntensity });

const MATERIALS = {
  skin: material(PALETTE.pigSkin, 0.55, PALETTE.pigSkin, 0.08),
  snout: material(PALETTE.pigSnout, 0.45),
  nostril: material(PALETTE.pigNostril, 0.8),
  eye: material(0xffffff, 0.15),
  pupil: material(0x111111, 0.1),
  blush: material(PALETTE.pigBlush, 0.6, PALETTE.pigBlush, 0.25),
};

const GEOMETRY = {
  sphere: new THREE.SphereGeometry(1, 24, 18),
  snout: new THREE.CylinderGeometry(0.42, 0.46, 0.3, 24).rotateX(Math.PI / 2),
  ear: new THREE.ConeGeometry(0.32, 0.55, 12),
  tail: new THREE.TorusGeometry(0.16, 0.05, 6, 16, Math.PI * 1.6),
  disc: new THREE.CircleGeometry(1, 16),
};

const part = (geometry: THREE.BufferGeometry, mat: THREE.Material, position: THREE.Vector3Tuple, scale: THREE.Vector3Tuple = [1, 1, 1]) => {
  const mesh = new THREE.Mesh(geometry, mat);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  return mesh;
};

const facing = (mesh: THREE.Object3D, normal: THREE.Vector3Tuple) => {
  mesh.lookAt(new THREE.Vector3(...normal).multiplyScalar(10));
  return mesh;
};

const eye = (x: number, size: number) => {
  const group = new THREE.Group();
  group.add(part(GEOMETRY.sphere, MATERIALS.eye, [0, 0, 0], [size, size, size * 0.7]));
  group.add(part(GEOMETRY.sphere, MATERIALS.pupil, [size * 0.15, -size * 0.1, size * 0.55], [size * 0.5, size * 0.5, size * 0.3]));
  group.position.set(x, 0.42, 0.8);
  return group;
};

const MEMBRANE = new THREE.MeshStandardMaterial({
  color: PALETTE.ramp,
  emissive: PALETTE.ramp,
  emissiveIntensity: 0.2,
  roughness: 0.2,
  transparent: true,
  opacity: 0.28,
  depthWrite: false,
});

const popScale = (age: number) => (age >= 0.6 ? 1 : 1 - Math.exp(-8 * age) * Math.cos(20 * age));

const AXIS = new THREE.Vector3();
const STEP = new THREE.Quaternion();

export class Piglet {
  readonly root = new THREE.Group();
  private readonly counter = new THREE.Group();
  private readonly body = new THREE.Group();
  private readonly skin = MATERIALS.skin.clone();
  private readonly clean = new THREE.Color(PALETTE.pigSkin);
  private readonly muddy = new THREE.Color(PALETTE.mud);
  private readonly membrane = new THREE.Mesh(GEOMETRY.sphere, MEMBRANE);
  private wrap = 0;
  private age = 0;

  constructor() {
    const { body } = this;
    body.add(part(GEOMETRY.sphere, this.skin, [0, 0, 0]));
    body.add(part(GEOMETRY.snout, MATERIALS.snout, [0, -0.05, 0.92]));
    for (const x of [-0.14, 0.14]) body.add(part(GEOMETRY.sphere, MATERIALS.nostril, [x, -0.05, 1.07], [0.07, 0.11, 0.04]));
    body.add(eye(-0.36, 0.26), eye(0.33, 0.19));
    for (const side of [-1, 1]) {
      const ear = part(GEOMETRY.ear, this.skin, [side * 0.55, 0.78, 0.35], [1, 1, 0.5]);
      ear.rotation.set(-0.5, 0, -side * 0.55);
      body.add(ear);
      body.add(facing(part(GEOMETRY.disc, MATERIALS.blush, [side * 0.62, -0.25, 0.75], [0.15, 0.1, 1]), [side * 0.62, -0.25, 0.75]));
    }
    const tail = part(GEOMETRY.tail, MATERIALS.snout, [0, 0.1, -1.02]);
    tail.rotation.y = Math.PI / 2;
    body.add(tail);
    this.counter.add(body);
    this.membrane.visible = false;
    this.root.add(this.counter, this.membrane);
  }

  reset(): void {
    this.body.quaternion.identity();
    this.age = 0;
    this.wrap = 0;
  }

  setDirt(amount: number): void {
    this.skin.color.copy(this.clean).lerp(this.muddy, amount * 0.85);
    this.skin.emissiveIntensity = 0.08 * (1 - amount);
  }

  setWrapped(wrapped: boolean, dt: number): void {
    this.wrap += ((wrapped ? 1 : 0) - this.wrap) * Math.min(1, dt * 12);
    this.membrane.visible = this.wrap > 0.02;
    const size = 1.15 + this.wrap * 0.55;
    this.membrane.scale.set(size, size, size * 0.8);
  }

  update(x: number, y: number, z: number, vx: number, vy: number, r: number, along: number, across: number, dt: number): void {
    this.age += dt;
    const pop = popScale(this.age);
    const heading = Math.atan2(vy, vx);
    this.root.position.set(x, y, z);
    this.root.rotation.set(0, 0, heading);
    this.root.scale.set(r * along * pop, r * across * pop, r * across * pop);
    this.counter.rotation.set(0, 0, -heading);
    const speed = Math.hypot(vx, vy);
    if (speed < 1e-3) return;
    AXIS.set(-vy / speed, vx / speed, 0);
    STEP.setFromAxisAngle(AXIS, (speed * dt) / r);
    this.body.quaternion.premultiply(STEP);
  }
}

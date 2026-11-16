import * as THREE from "three";

const TRAIL_LENGTH = 28;

export class Trail {
  readonly mesh: THREE.Mesh;
  private readonly points: THREE.Vector2[] = [];
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly geometry = new THREE.BufferGeometry();

  constructor(
    private readonly width: number,
    color: number,
  ) {
    this.positions = new Float32Array(TRAIL_LENGTH * 2 * 3);
    this.alphas = new Float32Array(TRAIL_LENGTH * 2);
    const indices: number[] = [];
    for (let i = 0; i < TRAIL_LENGTH - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setIndex(indices);
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("alpha", new THREE.BufferAttribute(this.alphas, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: `
        attribute float alpha;
        varying float vAlpha;
        void main() {
          vAlpha = alpha;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 color;
        varying float vAlpha;
        void main() {
          gl_FragColor = vec4(color, vAlpha);
        }`,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < TRAIL_LENGTH; i++) this.points.push(new THREE.Vector2());
  }

  reset(x: number, y: number): void {
    for (const p of this.points) p.set(x, y);
  }

  update(x: number, y: number, z: number, speed: number): void {
    const last = this.points.pop()!;
    last.set(x, y);
    this.points.unshift(last);
    const intensity = Math.min(1, speed / 250);
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      const p = this.points[i];
      const next = this.points[Math.min(i + 1, TRAIL_LENGTH - 1)];
      const prev = this.points[Math.max(i - 1, 0)];
      let dx = prev.x - next.x;
      let dy = prev.y - next.y;
      const len = Math.hypot(dx, dy) || 1;
      dx /= len;
      dy /= len;
      const t = 1 - i / (TRAIL_LENGTH - 1);
      const w = this.width * t;
      const o = i * 6;
      this.positions[o] = p.x - dy * w;
      this.positions[o + 1] = p.y + dx * w;
      this.positions[o + 2] = z;
      this.positions[o + 3] = p.x + dy * w;
      this.positions[o + 4] = p.y - dx * w;
      this.positions[o + 5] = z;
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = t * t * intensity * 0.5;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

const MAX_SPARKS = 400;
const SPARK_FADE_SECONDS = 0.2;
const WHITE = new THREE.Color(0xffffff);

export class Sparks {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_SPARKS * 3);
  private readonly colors = new Float32Array(MAX_SPARKS * 4);
  private readonly velocities = new Float32Array(MAX_SPARKS * 2);
  private readonly life = new Float32Array(MAX_SPARKS);
  private readonly shade = new THREE.Color();
  private cursor = 0;
  private readonly geometry = new THREE.BufferGeometry();

  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 4));
    const material = new THREE.PointsMaterial({ size: 2.2, vertexColors: true, transparent: true, depthWrite: false });
    this.points = new THREE.Points(this.geometry, material);
    this.points.frustumCulled = false;
    for (let i = 0; i < MAX_SPARKS; i++) this.positions[i * 3 + 2] = -100;
  }

  burst(x: number, y: number, count: number, speed: number, color: THREE.Color, z = 1.5): void {
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_SPARKS;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.positions[i * 3] = x;
      this.positions[i * 3 + 1] = y;
      this.positions[i * 3 + 2] = z;
      this.velocities[i * 2] = Math.cos(a) * s;
      this.velocities[i * 2 + 1] = Math.sin(a) * s;
      this.life[i] = 0.25 + Math.random() * 0.35;
      if (n % 3 === 2) this.shade.copy(color).multiplyScalar(0.18);
      else this.shade.copy(color).lerp(WHITE, 0.55);
      this.shade.toArray(this.colors, i * 4);
    }
  }

  update(dt: number): void {
    const drag = Math.exp(-6 * dt);
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      this.velocities[i * 2] *= drag;
      this.velocities[i * 2 + 1] *= drag;
      this.positions[i * 3] += this.velocities[i * 2] * dt;
      this.positions[i * 3 + 1] += this.velocities[i * 2 + 1] * dt;
      this.colors[i * 4 + 3] = Math.min(1, Math.max(0, this.life[i]) / SPARK_FADE_SECONDS);
      if (this.life[i] <= 0) this.positions[i * 3 + 2] = -100;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

const MAX_HIT_MARKS = 12;
const HIT_MARK_SECONDS = 0.2;

interface HitMark {
  root: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
  life: number;
  size: number;
}

export class HitMarks {
  readonly group = new THREE.Group();
  private readonly marks: HitMark[] = [];
  private cursor = 0;

  constructor() {
    const shapes: [THREE.RingGeometry, number][] = [
      [new THREE.RingGeometry(0.66, 1.1, 40), 0x2a0812],
      [new THREE.RingGeometry(0.76, 1, 40), 0xfff6e6],
    ];
    for (let i = 0; i < MAX_HIT_MARKS; i++) {
      const root = new THREE.Group();
      const materials = shapes.map(([geometry, color], layer) => {
        const material = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, depthTest: false });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.renderOrder = 10 + layer;
        root.add(mesh);
        return material;
      });
      root.visible = false;
      this.group.add(root);
      this.marks.push({ root, materials, life: 0, size: 1 });
    }
  }

  burst(x: number, y: number, size: number, z = 1.5): void {
    const mark = this.marks[this.cursor];
    this.cursor = (this.cursor + 1) % MAX_HIT_MARKS;
    mark.root.position.set(x, y, z);
    mark.root.visible = true;
    mark.life = HIT_MARK_SECONDS;
    mark.size = size;
  }

  update(dt: number): void {
    for (const mark of this.marks) {
      if (mark.life <= 0) continue;
      mark.life -= dt;
      if (mark.life <= 0) {
        mark.root.visible = false;
        continue;
      }
      const t = 1 - mark.life / HIT_MARK_SECONDS;
      mark.root.scale.setScalar(mark.size * (0.3 + 0.7 * (1 - (1 - t) ** 3)));
      for (const material of mark.materials) material.opacity = 1 - t * t;
    }
  }
}

const SIDEWAYS_SHAKE_TRAUMA = 0.3;

export class Shake {
  private trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  offset(dt: number, maxOffset: number): [number, number] {
    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const s = this.trauma * this.trauma * maxOffset;
    const x = this.trauma < SIDEWAYS_SHAKE_TRAUMA ? 0 : (Math.random() * 2 - 1) * s;
    return [x, (Math.random() * 2 - 1) * s];
  }
}

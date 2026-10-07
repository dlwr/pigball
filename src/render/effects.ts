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
      blending: THREE.AdditiveBlending,
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
          gl_FragColor = vec4(color * vAlpha, vAlpha);
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
      this.alphas[i * 2] = this.alphas[i * 2 + 1] = t * t * intensity * 0.6;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.alpha.needsUpdate = true;
  }
}

const MAX_SPARKS = 400;

export class Sparks {
  readonly points: THREE.Points;
  private readonly positions = new Float32Array(MAX_SPARKS * 3);
  private readonly colors = new Float32Array(MAX_SPARKS * 3);
  private readonly velocities = new Float32Array(MAX_SPARKS * 2);
  private readonly life = new Float32Array(MAX_SPARKS);
  private readonly baseColors = new Float32Array(MAX_SPARKS * 3);
  private cursor = 0;
  private readonly geometry = new THREE.BufferGeometry();

  constructor() {
    this.geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute("color", new THREE.BufferAttribute(this.colors, 3));
    const material = new THREE.PointsMaterial({
      size: 0.55,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
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
      this.baseColors[i * 3] = color.r;
      this.baseColors[i * 3 + 1] = color.g;
      this.baseColors[i * 3 + 2] = color.b;
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
      const k = Math.max(0, this.life[i]) * 1.6;
      this.colors[i * 3] = this.baseColors[i * 3] * k;
      this.colors[i * 3 + 1] = this.baseColors[i * 3 + 1] * k;
      this.colors[i * 3 + 2] = this.baseColors[i * 3 + 2] * k;
      if (this.life[i] <= 0) this.positions[i * 3 + 2] = -100;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.color.needsUpdate = true;
  }
}

export class Shake {
  private trauma = 0;

  add(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  offset(dt: number, maxOffset: number): [number, number] {
    this.trauma = Math.max(0, this.trauma - dt * 2.5);
    const s = this.trauma * this.trauma * maxOffset;
    return [(Math.random() * 2 - 1) * s, (Math.random() * 2 - 1) * s];
  }
}

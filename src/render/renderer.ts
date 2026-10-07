import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { Game, GameEvent } from "../game/game";
import { TABLE_HEIGHT, TABLE_WIDTH } from "../game/table";
import type { Flipper, SegmentDef } from "../physics/world";
import { LAYER_RAMP } from "../physics/world";
import { Sparks, Shake, Trail } from "./effects";
import { RampView } from "./ramp";
import { PALETTE } from "./palette";

const WALL_HEIGHT = 1.6;
const WALL_THICKNESS = 0.5;
const MARGIN = 1.5;
const VIEW_BOTTOM = -3.5;
const VIEW_TOP = TABLE_HEIGHT + 12;

interface Glow {
  material: THREE.MeshStandardMaterial;
  base: number;
  boost: number;
  value: number;
  mesh?: THREE.Object3D;
}

export class TableRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera();
  private readonly ballMeshes: THREE.Mesh[] = [];
  private readonly ballGeometry: THREE.SphereGeometry;
  private readonly ballMaterial: THREE.MeshStandardMaterial;
  private readonly flipperMeshes = new Map<Flipper, THREE.Object3D>();
  private readonly glows = new Map<string, Glow>();
  private readonly targetMeshes: THREE.Mesh[] = [];
  private readonly laneMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly spinner: THREE.Mesh;
  private readonly plunger: THREE.Mesh;
  private readonly saveLight: THREE.MeshStandardMaterial;
  private readonly trail = new Trail(1.1, 0x7fd8ff);
  private readonly sparks = new Sparks();
  private readonly shake = new Shake();
  private readonly ramp: RampView;
  private squash = 0;
  private squashVelocity = 0;
  private time = 0;
  private readonly center = new THREE.Vector2(TABLE_WIDTH / 2, (VIEW_BOTTOM + VIEW_TOP) / 2);

  constructor(
    private readonly container: HTMLElement,
    private readonly game: Game,
  ) {
    this.renderer = new THREE.WebGLRenderer({ powerPreference: "high-performance", antialias: false, stencil: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(PALETTE.background);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.35;

    this.camera.position.set(this.center.x, this.center.y, 50);
    this.camera.near = 0.1;
    this.camera.far = 200;

    this.addLights();
    this.addPlayfield();
    for (const seg of game.layout.walls) this.addWall(seg, PALETTE.wall);
    this.addSlings();
    this.addBumpers();
    this.addTargets();
    this.addLanes();
    this.spinner = this.addSpinner();
    this.plunger = this.addPlunger();
    this.saveLight = this.addSaveLight();
    for (const flipper of game.world.flippers) this.addFlipper(flipper);
    this.ramp = new RampView(game.layout.ramp);
    this.scene.add(this.ramp.group);

    this.ballGeometry = new THREE.SphereGeometry(1, 32, 24);
    this.ballMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.ball, metalness: 1, roughness: 0.12 });
    this.scene.add(this.trail.mesh, this.sparks.points);

    this.composer = new EffectComposer(this.renderer, { multisampling: Math.min(4, this.renderer.capabilities.maxSamples) });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({ intensity: 1.6, luminanceThreshold: 0.55, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.7 }),
        new VignetteEffect({ darkness: 0.45, offset: 0.35 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      ),
    );

    this.resize();
  }

  resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    const aspect = width / height;
    const tableW = TABLE_WIDTH + MARGIN * 2;
    const tableH = VIEW_TOP - VIEW_BOTTOM;
    const viewH = aspect > tableW / tableH ? tableH : tableW / aspect;
    const viewW = viewH * aspect;
    this.camera.left = -viewW / 2;
    this.camera.right = viewW / 2;
    this.camera.top = viewH / 2;
    this.camera.bottom = -viewH / 2;
    this.camera.updateProjectionMatrix();
  }

  onEvent(event: GameEvent): void {
    const strength = Math.min(1, event.speed / 300);
    switch (event.kind) {
      case "bumper":
        this.flash(event.id);
        this.sparks.burst(event.x, event.y, 18, 40, new THREE.Color(PALETTE.bumper));
        this.shake.add(0.25);
        this.impact(event.speed);
        break;
      case "sling":
        this.flash(event.id?.replace(/-\d+$/, ""));
        this.sparks.burst(event.x, event.y, 10, 30, new THREE.Color(PALETTE.sling));
        this.shake.add(0.15);
        this.impact(event.speed);
        break;
      case "target":
        this.sparks.burst(event.x, event.y, 14, 35, new THREE.Color(PALETTE.target));
        this.shake.add(0.2);
        this.impact(event.speed);
        break;
      case "bank":
      case "lanes":
        this.sparks.burst(event.x, event.y, 60, 60, new THREE.Color(PALETTE.laneOn));
        this.shake.add(0.35);
        break;
      case "extraBall":
        this.sparks.burst(event.x, event.y, 80, 70, new THREE.Color(PALETTE.ramp));
        this.shake.add(0.4);
        break;
      case "skill":
        this.sparks.burst(event.x, event.y, 80, 70, new THREE.Color(PALETTE.laneOn));
        this.shake.add(0.4);
        break;
      case "rollover":
        this.sparks.burst(event.x, event.y, 8, 20, new THREE.Color(PALETTE.laneOn));
        break;
      case "flipper":
      case "wall":
        if (event.speed > 60) {
          this.sparks.burst(event.x, event.y, Math.round(strength * 10), 25 * strength, new THREE.Color(PALETTE.spark));
          this.shake.add(strength * 0.12);
        }
        this.impact(event.speed);
        break;
      case "rampEnter":
        this.sparks.burst(event.x, event.y, 6, 15, new THREE.Color(PALETTE.ramp), 4);
        break;
      case "ramp":
        this.ramp.flash();
        this.sparks.burst(event.x, event.y, 30 + event.speed * 15, 45, new THREE.Color(PALETTE.ramp), 3);
        this.shake.add(0.2 + event.speed * 0.1);
        break;
      case "launch":
        this.shake.add(0.1 + event.speed * 0.2);
        break;
      case "drain":
      case "tilt":
      case "over":
        this.shake.add(0.5);
        break;
    }
  }

  render(alpha: number, dt: number): void {
    this.time += dt;
    this.syncBalls(alpha, dt);
    this.syncFlippers(alpha);
    this.syncProps(dt);
    this.sparks.update(dt);
    this.ramp.update(dt);
    const [sx, sy] = this.shake.offset(dt, 1.2);
    this.camera.position.set(this.center.x + sx, this.center.y + sy, 50);
    this.composer.render(dt);
  }

  private impact(speed: number): void {
    this.squash = Math.min(this.squash, -Math.min(0.28, speed / 700));
    this.squashVelocity = 0;
  }

  private flash(id: string | undefined): void {
    const glow = id ? this.glows.get(id) : undefined;
    if (glow) glow.value = 1;
  }

  private syncBalls(alpha: number, dt: number): void {
    const balls = this.game.world.balls;
    while (this.ballMeshes.length < balls.length) {
      const mesh = new THREE.Mesh(this.ballGeometry, this.ballMaterial);
      mesh.castShadow = true;
      this.ballMeshes.push(mesh);
      this.scene.add(mesh);
      this.trail.reset(balls[0]?.x ?? 0, balls[0]?.y ?? 0);
    }
    for (let i = 0; i < this.ballMeshes.length; i++) {
      const mesh = this.ballMeshes[i];
      const ball = balls[i];
      mesh.visible = !!ball;
      if (!ball) continue;
      const x = ball.prevX + (ball.x - ball.prevX) * alpha;
      const y = ball.prevY + (ball.y - ball.prevY) * alpha;
      if (Math.hypot(mesh.position.x - x, mesh.position.y - y) > 10) this.trail.reset(x, y);
      const targetZ = ball.layer === LAYER_RAMP ? this.ramp.heightAt(x, y) + ball.r : ball.r;
      const z = (mesh.userData.z ?? targetZ) + (targetZ - (mesh.userData.z ?? targetZ)) * Math.min(1, dt * 25);
      mesh.userData.z = z;
      mesh.position.set(x, y, z);
      const speed = Math.hypot(ball.vx, ball.vy);
      const k = 700;
      this.squashVelocity += (-k * this.squash - 2 * 0.3 * Math.sqrt(k) * this.squashVelocity) * dt;
      this.squash += this.squashVelocity * dt;
      const along = Math.max(0.68, 1 + Math.min(0.25, speed / 1200) + this.squash);
      const across = 1 / Math.sqrt(along);
      mesh.rotation.set(0, 0, Math.atan2(ball.vy, ball.vx));
      const lift = 1 + (z - ball.r) * 0.035;
      mesh.scale.set(ball.r * along * lift, ball.r * across * lift, ball.r * across * lift);
      if (i === 0) this.trail.update(x, y, z - ball.r + 0.3, speed);
    }
    this.trail.mesh.visible = balls.length > 0;
  }

  private syncFlippers(alpha: number): void {
    for (const [flipper, mesh] of this.flipperMeshes) {
      mesh.rotation.z = flipper.prevAngle + (flipper.angle - flipper.prevAngle) * alpha;
    }
  }

  private syncProps(dt: number): void {
    const { game } = this;
    for (const glow of this.glows.values()) {
      glow.value *= Math.exp(-dt * 9);
      glow.material.emissiveIntensity = glow.base + glow.value * glow.boost;
      if (glow.mesh) glow.mesh.scale.z = 1 - glow.value * 0.35;
    }
    this.targetMeshes.forEach((mesh, i) => {
      const goal = game.isTargetDown(i) ? -1.6 : 0;
      mesh.position.z += (goal - mesh.position.z) * Math.min(1, dt * 25);
    });
    const skillChase = game.skillShotLit && game.state === "ready" ? Math.floor(this.time * 8) % this.laneMaterials.length : -1;
    this.laneMaterials.forEach((material, i) => {
      const lit = game.litLanes[i] || i === skillChase;
      material.emissive.setHex(lit ? PALETTE.laneOn : PALETTE.laneOff);
      material.emissiveIntensity = lit ? 2.2 : 0.4;
    });
    this.spinner.rotation.x = game.spinnerAngle;
    const plunger = game.world.plunger;
    if (plunger) this.plunger.position.y = plunger.y - 2.5;
    const blink = Math.sin(this.time * 12) > 0 ? 2.5 : 0.2;
    this.saveLight.emissiveIntensity = game.ballSaveActive ? blink : game.extraBalls > 0 ? 1.6 : 0.05;
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0b0d12, 0.15));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.4);
    key.position.set(TABLE_WIDTH * 0.2, TABLE_HEIGHT * 0.75, 40);
    key.target.position.set(TABLE_WIDTH / 2, TABLE_HEIGHT / 2, 0);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 120 });
    key.shadow.bias = -0.0005;
    key.shadow.radius = 4;
    this.scene.add(key, key.target);
  }

  private addPlayfield(): void {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d")!;
    const gradient = ctx.createRadialGradient(128, 300, 20, 128, 300, 360);
    gradient.addColorStop(0, "#141a28");
    gradient.addColorStop(1, "#06080d");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 512);
    ctx.strokeStyle = "rgba(120,140,180,0.06)";
    for (let y = 0; y < 512; y += 16) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(256, y);
      ctx.stroke();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(TABLE_WIDTH + 4, TABLE_HEIGHT + 10),
      new THREE.MeshStandardMaterial({ map: texture, roughness: 0.55, metalness: 0.1 }),
    );
    plane.position.set(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 - 3, 0);
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  private addWall(seg: SegmentDef, color: number, emissive = 0, glowId?: string): THREE.Mesh {
    const length = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.7,
      roughness: 0.3,
      emissive: emissive ? color : 0x000000,
      emissiveIntensity: emissive,
    });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(length + WALL_THICKNESS, WALL_THICKNESS, WALL_HEIGHT), material);
    mesh.position.set((seg.ax + seg.bx) / 2, (seg.ay + seg.by) / 2, WALL_HEIGHT / 2);
    mesh.rotation.z = Math.atan2(seg.by - seg.ay, seg.bx - seg.ax);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    if (glowId) this.glows.set(glowId, { material, base: emissive, boost: 6, value: 0 });
    return mesh;
  }

  private addSlings(): void {
    for (const seg of this.game.layout.slings) {
      this.addWall(seg, PALETTE.sling, 0.6, seg.id.replace(/-\d+$/, ""));
    }
  }

  private addBumpers(): void {
    for (const bumper of this.game.layout.bumpers) {
      const group = new THREE.Group();
      const ringMaterial = new THREE.MeshStandardMaterial({
        color: PALETTE.bumper,
        emissive: PALETTE.bumper,
        emissiveIntensity: 0.5,
        metalness: 0.2,
        roughness: 0.4,
      });
      const ring = new THREE.Mesh(new THREE.CylinderGeometry(bumper.r, bumper.r, 1.8, 40), ringMaterial);
      ring.rotation.x = Math.PI / 2;
      ring.position.z = 0.9;
      ring.castShadow = true;
      const cap = new THREE.Mesh(
        new THREE.CylinderGeometry(bumper.r * 0.75, bumper.r * 0.85, 0.5, 40),
        new THREE.MeshStandardMaterial({ color: PALETTE.bumperCap, metalness: 0.9, roughness: 0.3 }),
      );
      cap.rotation.x = Math.PI / 2;
      cap.position.z = 2;
      group.add(ring, cap);
      group.position.set(bumper.x, bumper.y, 0);
      this.scene.add(group);
      this.glows.set(bumper.id, { material: ringMaterial, base: 0.5, boost: 8, value: 0, mesh: group });
    }
  }

  private addTargets(): void {
    for (const seg of this.game.layout.targets) {
      const mesh = this.addWall(seg, PALETTE.target, 0.8);
      mesh.scale.y = 1.6;
      this.targetMeshes.push(mesh);
    }
  }

  private addLanes(): void {
    for (const lane of this.game.layout.rollovers) {
      const material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.laneOff, emissiveIntensity: 0.4 });
      const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), material);
      mesh.position.set((lane.ax + lane.bx) / 2, lane.ay - 5, 0.02);
      this.scene.add(mesh);
      this.laneMaterials.push(material);
    }
  }

  private addSpinner(): THREE.Mesh {
    const { spinner } = this.game.layout;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(spinner.bx - spinner.ax, 0.12, 1.6),
      new THREE.MeshStandardMaterial({ color: PALETTE.spinner, metalness: 1, roughness: 0.2 }),
    );
    mesh.position.set((spinner.ax + spinner.bx) / 2, spinner.ay, 2.2);
    mesh.castShadow = true;
    this.scene.add(mesh);
    return mesh;
  }

  private addPlunger(): THREE.Mesh {
    const { plunger } = this.game.layout;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(plunger.bx - plunger.ax - 0.8, 5, 1.2),
      new THREE.MeshStandardMaterial({ color: PALETTE.plunger, metalness: 0.9, roughness: 0.25 }),
    );
    mesh.position.set((plunger.ax + plunger.bx) / 2, plunger.restY - 2.5, 0.6);
    this.scene.add(mesh);
    return mesh;
  }

  private addSaveLight(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.sling, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 24), material);
    mesh.position.set(23, 3, 0.02);
    this.scene.add(mesh);
    return material;
  }

  private addFlipper(flipper: Flipper): void {
    const { length, baseRadius: r1, tipRadius: r2 } = flipper;
    const shape = new THREE.Shape();
    shape.moveTo(0, r1);
    shape.lineTo(length, r2);
    shape.absarc(length, 0, r2, Math.PI / 2, -Math.PI / 2, true);
    shape.lineTo(0, -r1);
    shape.absarc(0, 0, r1, -Math.PI / 2, Math.PI / 2, true);
    const geometry = new THREE.ExtrudeGeometry(shape, {
      depth: 1.3,
      bevelEnabled: true,
      bevelSize: 0.12,
      bevelThickness: 0.12,
      bevelSegments: 3,
      curveSegments: 16,
    });
    const body = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({ color: PALETTE.flipper, roughness: 0.35, metalness: 0.1 }),
    );
    body.castShadow = true;
    const pivot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: PALETTE.flipperRubber, emissive: PALETTE.flipperRubber, emissiveIntensity: 0.6 }),
    );
    pivot.rotation.x = Math.PI / 2;
    pivot.position.z = 1.55;
    const group = new THREE.Group();
    group.add(body, pivot);
    group.position.set(flipper.x, flipper.y, 0.1);
    this.scene.add(group);
    this.flipperMeshes.set(flipper, group);
  }
}

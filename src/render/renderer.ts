import { BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect } from "postprocessing";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { type Game, type GameEvent, RAMPS_FOR_EXTRA_BALL, RAMPS_FOR_MULTIBALL } from "../game/game";
import { type Side, TABLE_HEIGHT, TABLE_WIDTH } from "../game/table";
import type { Ball, Flipper, SegmentDef } from "../physics/world";
import { LAYER_RAMP } from "../physics/world";
import { Sparks, Shake, Trail } from "./effects";
import { RampView } from "./ramp";
import { PALETTE } from "./palette";
import { fitTiltedCamera } from "./camera";
import { Piglet } from "./piglet";
import { GooglyEye, type MudPit, type Mouth, type Navel, type PiggyBank, createMudPit, createPiggyBank, type Rotor as RotorView, type Snout, createBelly, createNavel, createCurlyTail, createRotor, createGum, createLips, createMouth, createPlayfieldSkin, createSnout, createTooth } from "./pigparts";

const WALL_HEIGHT = 1.6;
const WALL_THICKNESS = 0.5;
const MARGIN = 1.5;
const VIEW_BOTTOM = -3.5;
const VIEW_TOP = TABLE_HEIGHT + 12;

interface BallView {
  piglet: Piglet;
  dirt: number;
  trail: Trail;
  z: number;
}

interface Glow {
  material: THREE.MeshStandardMaterial;
  base: number;
  boost: number;
  value: number;
  mesh?: THREE.Object3D;
  react?: (value: number) => void;
}

export class TableRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly composer: EffectComposer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 1, 2000);
  readonly view = { tilt: 25, fov: 30 };
  private fittedView = "";
  private readonly cameraBase = new THREE.Vector3();
  private readonly ballViews = new Map<Ball, BallView>();
  private readonly spareBallViews: BallView[] = [];
  private readonly flipperMeshes = new Map<Flipper, THREE.Object3D>();
  private readonly glows = new Map<string, Glow>();
  private readonly targetMeshes: THREE.Mesh[] = [];
  private readonly eyes: GooglyEye[] = [];
  private readonly snouts: Snout[] = [];
  private readonly rotor: RotorView;
  private readonly navel: Navel;
  private readonly piggy: PiggyBank;
  private readonly mud: MudPit;
  private frameDt = 0;
  private readonly thirdEyes: GooglyEye[] = [];
  private thirdEyeShown = 0;
  private readonly mouth: Mouth;
  private mouthOpen = 0;
  private skin!: THREE.MeshStandardMaterial;
  private readonly lookTarget = new THREE.Vector2();
  private readonly laneMaterials: THREE.MeshStandardMaterial[] = [];
  private readonly spinner: THREE.Mesh;
  private readonly spinnerGlow: THREE.MeshStandardMaterial;
  private spinnerSpeed = 0;
  private lastSpinnerAngle = 0;
  private readonly plunger: THREE.Mesh;
  private readonly saveLight: THREE.MeshStandardMaterial;
  private readonly kickbackLights: Record<Side, THREE.MeshStandardMaterial>;
  private readonly sparks = new Sparks();
  private readonly shake = new Shake();
  private readonly ramp: RampView;
  private squash = 0;
  private squashVelocity = 0;
  private time = 0;

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


    this.addLights();
    this.addPlayfield();
    for (const seg of game.layout.walls) this.addWall(seg, PALETTE.wall);
    this.addSlings();
    this.addBumpers();
    this.addBellies();
    const { navel } = game.layout;
    this.navel = createNavel(navel.x, navel.y, navel.r);
    this.scene.add(this.navel.object);
    const { mud } = game.layout;
    this.mud = createMudPit(mud.x, mud.y, mud.r);
    this.scene.add(this.mud.object);
    this.piggy = createPiggyBank(game.layout.piggy.r, 4);
    this.scene.add(this.piggy.object);
    this.rotor = this.addRotor();
    this.addTargets();
    this.addLanes();
    [this.spinner, this.spinnerGlow] = this.addSpinner();
    this.plunger = this.addPlunger();
    this.saveLight = this.addSaveLight();
    this.mouth = createMouth(TABLE_WIDTH / 2 - 2, 2, 6);
    this.scene.add(this.mouth.object);
    this.kickbackLights = { left: this.addKickbackLight("left"), right: this.addKickbackLight("right") };
    for (const flipper of game.world.flippers) this.addFlipper(flipper);
    this.ramp = new RampView(game.layout.ramp);
    this.ramp.addProgressLamps(RAMPS_FOR_MULTIBALL, RAMPS_FOR_EXTRA_BALL);
    this.scene.add(this.ramp.group);

    this.scene.add(this.sparks.points);

    this.composer = new EffectComposer(this.renderer, { multisampling: Math.min(4, this.renderer.capabilities.maxSamples) });
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.composer.addPass(
      new EffectPass(
        this.camera,
        new BloomEffect({ intensity: 0.6, luminanceThreshold: 0.8, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.55 }),
        new VignetteEffect({ darkness: 0.45, offset: 0.35 }),
        new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }),
      ),
    );

    this.resize();
  }

  resize(): void {
    const tableW = TABLE_WIDTH + MARGIN * 2;
    const tableH = VIEW_TOP - VIEW_BOTTOM;
    const height = this.container.clientHeight;
    const width = Math.min(this.container.clientWidth, Math.ceil(height * (tableW / tableH)));
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
    this.fitCamera(width / height);
  }

  private fitCamera(aspect: number): void {
    const left = -MARGIN;
    const right = TABLE_WIDTH + MARGIN;
    const bounds = [
      new THREE.Vector3(left, VIEW_BOTTOM, 0),
      new THREE.Vector3(right, VIEW_BOTTOM, 0),
      new THREE.Vector3(left, VIEW_TOP, 0),
      new THREE.Vector3(right, VIEW_TOP, 0),
      new THREE.Vector3(left, TABLE_HEIGHT, WALL_HEIGHT * 3),
      new THREE.Vector3(right, TABLE_HEIGHT, WALL_HEIGHT * 3),
    ];
    fitTiltedCamera(this.camera, aspect, bounds, this.view.tilt, this.view.fov);
    this.cameraBase.copy(this.camera.position);
    this.fittedView = `${this.view.tilt}|${this.view.fov}`;
  }

  onEvent(event: GameEvent): void {
    const strength = Math.min(1, event.speed / 300);
    switch (event.kind) {
      case "bumper":
        this.flash(event.id);
        this.jiggleEyes(event.x, event.y, 25);
        this.sparks.burst(event.x, event.y, 18, 40, new THREE.Color(PALETTE.pigSnout));
        this.shake.add(0.15);
        this.impact(event.speed);
        break;
      case "mud": {
        let nearest: BallView | undefined;
        let best = Infinity;
        for (const [ball, view] of this.ballViews) {
          const d = Math.hypot(ball.x - event.x, ball.y - event.y);
          if (d < best) [best, nearest] = [d, view];
        }
        if (nearest) nearest.dirt = 1;
        this.sparks.burst(event.x, event.y, 16, 22, new THREE.Color(PALETTE.mud), 0.6);
        break;
      }
      case "piggy":
        this.piggy.bump();
        this.sparks.burst(event.x, event.y, 14, 35, new THREE.Color(PALETTE.truffle), 2.5);
        this.jiggleEyes(event.x, event.y, 10);
        break;
      case "piggyBreak":
        this.sparks.burst(event.x, event.y, 90, 70, new THREE.Color(PALETTE.truffle), 2.5);
        this.sparks.burst(event.x, event.y, 40, 50, new THREE.Color(PALETTE.pigSkin), 2.5);
        this.shake.add(0.45);
        break;
      case "navelIn":
        this.sparks.burst(event.x, event.y, 16, 20, new THREE.Color(PALETTE.pigSkin));
        this.jiggleEyes(event.x, event.y, 20);
        break;
      case "navelOut":
        this.navel.spit();
        this.sparks.burst(event.x, event.y, 24, 45, new THREE.Color(PALETTE.tongue));
        this.shake.add(0.2);
        break;
      case "belly":
        this.flash(event.id);
        this.sparks.burst(event.x, event.y, 8, 25, new THREE.Color(PALETTE.pigSkin));
        this.jiggleEyes(event.x, event.y, 12);
        break;
      case "rotor":
        this.rotor.poke(Math.min(12, event.speed / 12));
        this.sparks.burst(event.x, event.y, 6, 18, new THREE.Color(PALETTE.pigSkin));
        this.jiggleEyes(event.x, event.y, 15);
        this.impact(event.speed);
        break;
      case "sling":
        this.flash(event.id?.replace(/-\d+$/, ""));
        this.jiggleEyes(event.x, event.y, 18);
        this.sparks.burst(event.x, event.y, 10, 30, new THREE.Color(PALETTE.pigLips));
        this.shake.add(0.15);
        this.impact(event.speed);
        break;
      case "target":
        this.sparks.burst(event.x, event.y, 14, 35, new THREE.Color(PALETTE.tooth));
        this.shake.add(0.2);
        this.impact(event.speed);
        break;
      case "bank":
      case "lanes":
        this.sparks.burst(event.x, event.y, 60, 60, new THREE.Color(PALETTE.laneOn));
        this.shake.add(0.35);
        break;
      case "multiball":
      case "jackpot":
        this.ramp.flash();
        this.sparks.burst(event.x, event.y, 120, 80, new THREE.Color(PALETTE.bumper), 3);
        this.shake.add(0.5);
        break;
      case "kickback":
        this.sparks.burst(event.x, event.y, 30, 50, new THREE.Color(PALETTE.target));
        this.shake.add(0.3);
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
        if (this.game.inMultiball) this.sparks.burst(event.x, event.y, 40, 30, new THREE.Color(PALETTE.pigSkin), 3);
        break;
      case "drain":
        this.mouthOpen = 1;
        this.shake.add(0.5);
        break;
      case "tilt":
      case "over":
        this.shake.add(0.5);
        break;
    }
  }

  render(alpha: number, dt: number): void {
    this.time += dt;
    this.frameDt = dt;
    this.syncBalls(alpha, dt);
    this.syncFlippers(alpha);
    this.syncProps(dt);
    this.sparks.update(dt);
    this.ramp.update(
      dt,
      this.game.world.balls.filter((b) => b.layer === LAYER_RAMP),
    );
    this.ramp.setProgress(
      {
        towardMultiball: this.game.rampsTowardMultiball,
        multiballAt: RAMPS_FOR_MULTIBALL,
        inMultiball: this.game.inMultiball,
        ramps: this.game.stats.ramps,
        extraBallAt: RAMPS_FOR_EXTRA_BALL,
      },
      dt,
    );
    const [sx, sy] = this.shake.offset(dt, 1.2);
    if (this.fittedView !== `${this.view.tilt}|${this.view.fov}`) this.fitCamera(this.camera.aspect);
    this.camera.position.set(this.cameraBase.x + sx, this.cameraBase.y + sy, this.cameraBase.z);
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
    for (const [ball, view] of this.ballViews) {
      if (balls.includes(ball)) continue;
      view.piglet.root.visible = false;
      view.trail.mesh.visible = false;
      this.ballViews.delete(ball);
      this.spareBallViews.push(view);
    }
    const k = 700;
    this.squashVelocity += (-k * this.squash - 2 * 0.3 * Math.sqrt(k) * this.squashVelocity) * dt;
    this.squash += this.squashVelocity * dt;
    for (const ball of balls) {
      const x = ball.prevX + (ball.x - ball.prevX) * alpha;
      const y = ball.prevY + (ball.y - ball.prevY) * alpha;
      const targetZ = ball.layer === LAYER_RAMP ? this.ramp.heightAt(x, y) + ball.r : ball.frozen ? ball.r * 0.45 : ball.r;
      const view = this.ballViews.get(ball) ?? this.createBallView(ball, x, y, targetZ);
      const z = view.z + (targetZ - view.z) * Math.min(1, dt * 25);
      view.z = z;
      const speed = Math.hypot(ball.vx, ball.vy);
      const along = Math.max(0.68, 1 + Math.min(0.25, speed / 1200) + this.squash);
      const across = 1 / Math.sqrt(along);
      const lift = 1 + (z - ball.r) * 0.035;
      view.piglet.update(x, y, z, ball.vx, ball.vy, ball.r * lift, along, across, dt);
      view.piglet.setWrapped(ball.layer === LAYER_RAMP, dt);
      view.dirt = Math.max(0, view.dirt - dt / 6);
      view.piglet.setDirt(Math.min(1, view.dirt * 1.5));
      view.trail.update(x, y, z - ball.r + 0.3, speed);
    }
  }

  private createBallView(ball: Ball, x: number, y: number, z: number): BallView {
    let view = this.spareBallViews.pop();
    if (!view) {
      view = { piglet: new Piglet(), dirt: 0, trail: new Trail(1.1, PALETTE.pigTrail), z };
      this.scene.add(view.piglet.root, view.trail.mesh);
    }
    view.z = z;
    view.dirt = 0;
    view.piglet.reset();
    view.piglet.root.visible = true;
    view.trail.mesh.visible = true;
    view.trail.reset(x, y);
    this.ballViews.set(ball, view);
    return view;
  }

  private syncFlippers(alpha: number): void {
    const rotor = this.game.world.rotors[0];
    if (rotor) this.rotor.update(rotor.prevAngle + (rotor.angle - rotor.prevAngle) * alpha, this.frameDt);
    for (const [flipper, mesh] of this.flipperMeshes) {
      mesh.rotation.z = flipper.prevAngle + (flipper.angle - flipper.prevAngle) * alpha;
    }
  }

  private syncProps(dt: number): void {
    const { game } = this;
    for (const glow of this.glows.values()) {
      glow.value *= Math.exp(-dt * 9);
      glow.material.emissiveIntensity = glow.base + glow.value * glow.boost * 0.6;
      if (glow.react) glow.react(glow.value);
      else if (glow.mesh) glow.mesh.scale.z = 1 - glow.value * 0.35;
    }
    for (const snout of this.snouts) snout.setLevel(game.multiplier, this.time, dt);
    this.navel.update(game.holdingInNavel, this.time, dt);
    const { mud } = game.layout;
    this.mud.update(game.world.balls.some((b) => b.layer !== LAYER_RAMP && Math.hypot(b.x - mud.x, b.y - mud.y) < mud.r), this.time, dt);
    const piggy = game.world.movers[0];
    this.piggy.update(piggy.x, piggy.y, game.piggyHits, piggy.enabled, this.time, dt);
    this.thirdEyeShown += ((game.multiplier >= 3 ? 1 : 0) - this.thirdEyeShown) * Math.min(1, dt * 10);
    for (const eye of this.thirdEyes) eye.shown = this.thirdEyeShown;
    const balls = game.world.balls;
    for (const eye of this.eyes) {
      const ex = eye.object.position.x;
      const ey = eye.object.position.y;
      const nearest = balls.reduce<(typeof balls)[number] | null>(
        (best, b) => (!best || Math.hypot(b.x - ex, b.y - ey) < Math.hypot(best.x - ex, best.y - ey) ? b : best),
        null,
      );
      eye.update(nearest ? this.lookTarget.set(nearest.x, nearest.y) : null, dt);
    }
    this.targetMeshes.forEach((mesh, i) => {
      const goal = game.isTargetDown(i) ? -1.6 : 0;
      mesh.position.z += (goal - mesh.position.z) * Math.min(1, dt * 25);
    });
    const skillChase = game.skillShotLit && game.state === "ready" ? Math.floor(this.time * 8) % this.laneMaterials.length : -1;
    this.laneMaterials.forEach((material, i) => {
      const lit = game.litLanes[i] || i === skillChase;
      material.emissive.setHex(lit ? PALETTE.laneOn : PALETTE.laneOff);
      material.emissiveIntensity = lit ? 1.3 : 0.3;
    });
    this.spinner.rotation.x = game.spinnerAngle;
    const spin = dt > 0 ? (game.spinnerAngle - this.lastSpinnerAngle) / dt : 0;
    this.lastSpinnerAngle = game.spinnerAngle;
    this.spinnerSpeed += (spin - this.spinnerSpeed) * Math.min(1, dt * 10);
    this.spinnerGlow.emissiveIntensity = 0.2 + Math.min(1.6, this.spinnerSpeed / 15);
    const plunger = game.world.plunger;
    if (plunger) this.plunger.position.y = plunger.y - 2.5;
    this.skin.emissiveIntensity = 0.025 + 0.02 * Math.sin(this.time * 0.9);
    this.mouthOpen *= Math.exp(-dt * 5);
    this.mouth.open(this.mouthOpen > 0.6 ? 1 : this.mouthOpen * 1.6 * Math.abs(Math.cos(this.time * 18)));
    const blink = Math.sin(this.time * 12) > 0 ? 1.4 : 0.15;
    for (const side of ["left", "right"] as const) this.kickbackLights[side].emissiveIntensity = game.kickbacksLit[side] ? 1.2 : 0.05;
    this.saveLight.emissiveIntensity = game.ballSaveActive ? blink : game.extraBalls > 0 ? 1 : 0.05;
  }

  private addLights(): void {
    this.scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x0b0d12, 0.15));
    const key = new THREE.DirectionalLight(0xfff1e0, 1.1);
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
    const width = TABLE_WIDTH + 30;
    const height = TABLE_HEIGHT + 50;
    this.skin = new THREE.MeshStandardMaterial({
      map: createPlayfieldSkin(width, height),
      roughness: 0.6,
      metalness: 0,
      emissive: PALETTE.pigSkin,
      emissiveIntensity: 0,
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(width, height), this.skin);
    plane.position.set(TABLE_WIDTH / 2, TABLE_HEIGHT / 2 - 10, 0);
    plane.receiveShadow = true;
    this.scene.add(plane);
  }

  private addWall(seg: SegmentDef, color: number, emissive = 0, glowId?: string): THREE.Mesh {
    const length = Math.hypot(seg.bx - seg.ax, seg.by - seg.ay);
    const material = new THREE.MeshStandardMaterial({
      color,
      metalness: 0.05,
      roughness: 0.45,
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
    const { walls, slings } = this.game.layout;
    for (const seg of slings) {
      const lips = createLips(seg);
      this.scene.add(lips.object);
      const id = seg.id.replace(/-\d+$/, "");
      this.glows.set(id, { material: lips.material, base: 0.15, boost: 2.5, value: 0, react: lips.react });
      const side = id.slice(-1);
      const back = walls.filter((w) => w.id.startsWith(`sling-back-${side}`)).flatMap((w) => [[w.ax, w.ay], [w.bx, w.by]]);
      const cx = back.reduce((sum, [px]) => sum + px, 0) / back.length;
      const cy = back.reduce((sum, [, py]) => sum + py, 0) / back.length;
      this.addEye(cx, cy, 1);
    }
  }

  private addBumpers(): void {
    for (const bumper of this.game.layout.bumpers) {
      const snout = createSnout(bumper.x, bumper.y, bumper.r);
      this.scene.add(snout.object);
      this.glows.set(bumper.id, { material: snout.material, base: 0.15, boost: 3, value: 0, react: snout.react });
      this.snouts.push(snout);
      this.addEye(bumper.x - bumper.r * 0.45, bumper.y + bumper.r + 0.8, 1.05);
      this.addEye(bumper.x + bumper.r * 0.5, bumper.y + bumper.r + 0.6, 0.8);
      this.thirdEyes.push(this.addEye(bumper.x + bumper.r * 0.05, bumper.y + bumper.r + 1.9, 0.65));
    }
  }

  private addBellies(): void {
    for (const seg of this.game.layout.bellies) {
      const belly = createBelly(seg, seg.ax < TABLE_WIDTH / 2 ? 1 : -1);
      this.scene.add(belly.object);
      this.glows.set(seg.id, { material: belly.material, base: 0.1, boost: 1.2, value: 0, react: belly.react });
    }
  }

  private addRotor(): RotorView {
    const { rotor } = this.game.layout;
    const view = createRotor(rotor.arms, rotor.armLength, rotor.armRadius);
    view.object.position.set(rotor.x, rotor.y, 1);
    this.scene.add(view.object);
    const eye = this.addEye(rotor.x, rotor.y, 0.75);
    eye.object.position.z = 2.3;
    return view;
  }

  private addEye(x: number, y: number, size: number): GooglyEye {
    const eye = new GooglyEye(x, y, size);
    this.eyes.push(eye);
    this.scene.add(eye.object);
    return eye;
  }

  private jiggleEyes(x: number, y: number, strength: number): void {
    for (const eye of this.eyes) {
      const d = Math.hypot(eye.object.position.x - x, eye.object.position.y - y);
      eye.jiggle(strength / (1 + d * 0.15));
    }
  }

  private addTargets(): void {
    const { targets } = this.game.layout;
    for (const seg of targets) {
      const tooth = createTooth(seg);
      this.scene.add(tooth);
      this.targetMeshes.push(tooth);
    }
    const ys = targets.flatMap((t) => [t.ay, t.by]);
    this.scene.add(createGum(targets[0].ax - 0.9, Math.min(...ys) - 0.5, Math.max(...ys) + 0.5));
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

  private addSpinner(): [THREE.Mesh, THREE.MeshStandardMaterial] {
    const { spinner } = this.game.layout;
    const width = spinner.bx - spinner.ax;
    const cx = (spinner.ax + spinner.bx) / 2;
    const glow = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.spark, emissiveIntensity: 0.3 });
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(width, 1.4), glow);
    strip.position.set(cx, spinner.ay, 0.02);
    const plate = createCurlyTail(spinner.ax, spinner.bx);
    plate.position.set(cx, spinner.ay, 2.2);
    const postGeometry = new THREE.CylinderGeometry(0.3, 0.3, 3.2, 12).rotateX(Math.PI / 2);
    const postMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.pigSnout, metalness: 0, roughness: 0.5 });
    for (const x of [spinner.ax, spinner.bx]) {
      const post = new THREE.Mesh(postGeometry, postMaterial);
      post.position.set(x, spinner.ay, 1.6);
      post.castShadow = true;
      this.scene.add(post);
    }
    this.scene.add(strip, plate);
    return [plate, glow];
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

  private addKickbackLight(side: Side): THREE.MeshStandardMaterial {
    const kickback = this.game.layout.kickbacks[side];
    const material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.target, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.9, 3), material);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set((kickback.ax + kickback.bx) / 2, kickback.ay + 5, 0.02);
    this.scene.add(mesh);
    return material;
  }

  private addSaveLight(): THREE.MeshStandardMaterial {
    const material = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: PALETTE.sling, emissiveIntensity: 0 });
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), material);
    mesh.position.set(23, 6, 0.02);
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
    const hoofMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.hoof, roughness: 0.3, metalness: 0 });
    const hooves = [-1, 1].map((side) => {
      const hoof = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hoofMaterial);
      hoof.scale.set(r2 * 1.5, r2 * 0.85, 0.85);
      hoof.position.set(length - r2 * 0.2, side * r2 * 0.5, 0.75);
      hoof.castShadow = true;
      return hoof;
    });
    const group = new THREE.Group();
    group.add(body, ...hooves);
    group.position.set(flipper.x, flipper.y, 0.1);
    this.scene.add(group);
    this.flipperMeshes.set(flipper, group);
  }
}

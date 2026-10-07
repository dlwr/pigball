import { Sfx } from "./audio/sfx";
import { FixedStepper } from "./core/stepper";
import { Game, type GameEvent } from "./game/game";
import { Hud } from "./hud/hud";
import { bindInput } from "./input/input";
import { createParams } from "./physics/params";
import { TableRenderer } from "./render/renderer";
import { localScoreStorage } from "./storage";
import "./style.css";

const PHYSICS_HZ = 960;
const MAX_FRAME_SECONDS = 0.1;
const HIT_STOP_SECONDS = 0.045;
const HIT_STOP_COOLDOWN_SECONDS = 0.3;

const app = document.querySelector<HTMLElement>("#app")!;
const params = createParams();
const game = new Game(params, localScoreStorage);
const renderer = new TableRenderer(app, game);
const hud = new Hud(app);
const sfx = new Sfx();
const stepper = new FixedStepper(1 / PHYSICS_HZ, PHYSICS_HZ * MAX_FRAME_SECONDS);
const stats = { fps: 0, steps: 0, frameMs: 0 };

if (new URLSearchParams(location.search).has("debug")) {
  void import("./debug/panel").then(({ mountDebugPanel }) => mountDebugPanel(params, stats));
  Object.assign(window, { game });
}

const flipperState = { left: false, right: false };

bindInput(app, {
  state: () => game.state,
  flipper(side, pressed) {
    game.setFlipper(side, pressed);
    const actual = game.world.flippers[side === "left" ? 0 : 1].pressed;
    if (actual && !flipperState[side]) sfx.solenoid();
    flipperState[side] = actual;
  },
  plunger(held, limit) {
    if (game.world.plunger) game.world.plunger.pullLimit = held ? limit : 1;
    game.setPlunger(held);
  },
  nudge: (dx, dy) => game.nudge(dx, dy),
  restart: () => game.restart(),
  interact: () => sfx.unlock(),
});

let hitStop = 0;
let hitStopCooldown = 0;

const handle = (event: GameEvent) => {
  sfx.play(event);
  renderer.onEvent(event);
  hud.onEvent(event, game);
  const heavy = (event.kind === "bumper" && event.speed > 100) || event.kind === "bank";
  if (heavy && hitStopCooldown <= 0) {
    hitStop = HIT_STOP_SECONDS;
    hitStopCooldown = HIT_STOP_COOLDOWN_SECONDS;
  }
};

let last = performance.now();
let frameId = 0;

const frame = (now: number) => {
  const dt = Math.min((now - last) / 1000, MAX_FRAME_SECONDS);
  last = now;
  const started = performance.now();
  stats.fps = Math.round(stats.fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1);
  let alpha = 1;
  let steps = 0;
  hitStopCooldown -= dt;
  if (hitStop > 0) {
    hitStop -= dt;
  } else {
    alpha = stepper.advance(dt, (step) => {
      game.step(step);
      steps++;
    });
    for (const event of game.drainEvents()) handle(event);
  }
  stats.steps = steps;
  renderer.render(alpha, dt);
  hud.update(game, dt);
  frameId = requestAnimationFrame(frame);
  stats.frameMs = Math.round((stats.frameMs * 0.9 + (performance.now() - started) * 0.1) * 100) / 100;
};

document.addEventListener("visibilitychange", () => {
  cancelAnimationFrame(frameId);
  if (document.hidden) {
    sfx.suspend();
    return;
  }
  stepper.reset();
  last = performance.now();
  frameId = requestAnimationFrame(frame);
});

window.addEventListener("resize", () => renderer.resize());
frameId = requestAnimationFrame(frame);

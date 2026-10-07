import { Music } from "./audio/music";
import { levelFor } from "./audio/pattern";
import { Sfx } from "./audio/sfx";
import { FixedStepper } from "./core/stepper";
import { Game, type GameEvent, type GameRules } from "./game/game";
import { Hud } from "./hud/hud";
import { Screens } from "./hud/screens";
import { bindInput } from "./input/input";
import { createParams } from "./physics/params";
import { TableRenderer } from "./render/renderer";
import { Run } from "./run/run";
import { discardScores, localScoreStorage, musicPreference, runStorage } from "./storage";
import "./style.css";

const PHYSICS_HZ = 960;
const MAX_FRAME_SECONDS = 0.1;
const HIT_STOP_SECONDS = 0.045;
const HIT_STOP_COOLDOWN_SECONDS = 0.3;
const SETTLE_DELAY_SECONDS = 1;

const app = document.querySelector<HTMLElement>("#app")!;
const params = createParams();
const view = { tilt: 25, fov: 30 };
const hud = new Hud(app);
const screens = new Screens(app);
const sfx = new Sfx();
const music = new Music(sfx, musicPreference.load());
const stepper = new FixedStepper(1 / PHYSICS_HZ, PHYSICS_HZ * MAX_FRAME_SECONDS);
const stats = { fps: 0, steps: 0, frameMs: 0 };
const debug = new URLSearchParams(location.search).has("debug");

let game = new Game(params, localScoreStorage);
let renderer = new TableRenderer(app, game, view);
let run: Run | null = null;
let stageSettled = false;
let settleDelay = 0;

const load = (rules?: Partial<GameRules>) => {
  renderer.dispose();
  game = new Game(params, run ? discardScores : localScoreStorage, rules);
  renderer = new TableRenderer(app, game, view);
  stageSettled = false;
  settleDelay = 0;
  stepper.reset();
  if (debug) Object.assign(window, { game, run });
};

const saveRun = () => {
  if (run && (run.phase === "stage" || run.phase === "shop")) runStorage.save(run.toJSON());
  else runStorage.clear();
};

const showMenu = () => {
  run = null;
  hud.setRun(null);
  screens.menu({
    canContinue: runStorage.load() !== null,
    onRun: () => beginRun(new Run((Math.random() * 2 ** 31) | 0)),
    onContinue: () => beginRun(Run.fromJSON(runStorage.load()!)),
    onFree: () => {
      screens.hide();
      load();
    },
  });
};

const beginRun = (next: Run) => {
  run = next;
  hud.setRun(run);
  saveRun();
  if (run.phase === "shop") showShop();
  else showStageIntro();
};

const showStageIntro = () => {
  if (!run) return;
  const current = run;
  load(current.stageRules());
  screens.stageIntro(current, () => screens.hide());
};

const showShop = () => {
  if (!run) return;
  const current = run;
  const refresh = () => {
    saveRun();
    hud.setRun(current);
    screens.shop(current, refresh, () => {
      current.nextStage();
      saveRun();
      showStageIntro();
    });
  };
  refresh();
};

const settleStage = (dt: number) => {
  if (!run || stageSettled || screens.open) return;
  if (game.state !== "cleared" && game.state !== "over") return;
  settleDelay += dt;
  if (settleDelay < SETTLE_DELAY_SECONDS) return;
  stageSettled = true;
  const current = run;
  current.finishStage({ cleared: game.state === "cleared", ballsLeft: game.ballsLeft });
  saveRun();
  hud.setRun(current);
  const score = game.score;
  if (current.phase === "lost") {
    screens.runEnd(current, score, showMenu);
    return;
  }
  screens.stageClear(current, () => (current.phase === "won" ? screens.runEnd(current, score, showMenu) : showShop()));
};

if (debug) {
  void import("./debug/panel").then(({ mountDebugPanel }) => mountDebugPanel(params, stats, view));
  Object.assign(window, { game });
}

const flipperState = { left: false, right: false };

bindInput(app, {
  state: () => game.state,
  blocked: () => screens.open,
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
  restart() {
    if (run) return;
    game.restart();
  },
  toggleMusic() {
    music.enabled = !music.enabled;
    musicPreference.save(music.enabled);
    hud.notice(music.enabled ? "MUSIC ON" : "MUSIC OFF");
  },
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
  if (screens.open) {
    stepper.reset();
  } else if (hitStop > 0) {
    hitStop -= dt;
  } else {
    alpha = stepper.advance(dt, (step) => {
      game.step(step);
      steps++;
    });
    for (const event of game.drainEvents()) handle(event);
  }
  settleStage(dt);
  stats.steps = steps;
  renderer.render(alpha, dt);
  hud.update(game, dt);
  music.update(screens.open ? levelFor("ready", false) : levelFor(game.state, game.inMultiball));
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
showMenu();
frameId = requestAnimationFrame(frame);

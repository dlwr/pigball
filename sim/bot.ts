import { Game, type GameEvent, type GameRules } from "../src/game/game";
import { createParams } from "../src/physics/params";
import { LAYER_FLOOR } from "../src/physics/world";
import { Rng } from "../src/run/rng";

export const DT = 1 / 960;
const HOLD = 0.15;
const COOLDOWN = 0.12;
const MAX_STAGE_SECONDS = 900;

export interface Skill {
  name: string;
  aim: { left: number; right: number };
  sigma: number;
  lapse: number;
  lapseDelay: number;
}

export const SKILLS: Record<string, Skill> = {
  novice: { name: "novice", aim: { left: 3.5, right: 3.5 }, sigma: 2.0, lapse: 0.18, lapseDelay: 0.14 },
  average: { name: "average", aim: { left: 4.5, right: 4.5 }, sigma: 1.2, lapse: 0.07, lapseDelay: 0.1 },
  good: { name: "good", aim: { left: 5.5, right: 5.5 }, sigma: 0.6, lapse: 0.02, lapseDelay: 0.08 },
};

const gauss = (rng: Rng) => Math.sqrt(-2 * Math.log(Math.max(1e-9, rng.next()))) * Math.cos(2 * Math.PI * rng.next());

interface SideState {
  aim: number | null;
  delay: number;
  hold: number;
  cooldown: number;
}

export interface StageOutcome {
  cleared: boolean;
  ballsLeft: number;
  score: number;
  seconds: number;
  events: Record<string, number>;
}

export const playStage = (rules: Partial<GameRules>, skill: Skill, seed: number, onEvent?: (e: GameEvent, game: Game) => void): StageOutcome => {
  const rng = new Rng(seed);
  const game = new Game(createParams(), { load: () => 0, save: () => {} }, rules);
  const sides = (["left", "right"] as const).map((side, i) => {
    const f = game.world.flippers[i];
    const dir = [Math.cos(f.restAngle), Math.sin(f.restAngle)];
    let n = [-dir[1], dir[0]];
    if (n[1] < 0) n = [-n[0], -n[1]];
    return { side, f, dir, n, state: { aim: null, delay: 0, hold: 0, cooldown: 0 } as SideState };
  });
  const events: Record<string, number> = {};
  let t = 0;
  let launchAt = 0.3;
  let pull = 0.6 + rng.next() * 0.4;
  let plungerHeld = false;
  while (game.state !== "over" && game.state !== "cleared" && t < MAX_STAGE_SECONDS) {
    if (game.state === "ready") {
      if (!plungerHeld && t >= launchAt) {
        game.setPlunger(true);
        plungerHeld = true;
      } else if (plungerHeld && game.plungerPull >= pull) {
        game.setPlunger(false);
        plungerHeld = false;
        launchAt = t + 0.8;
        pull = 0.6 + rng.next() * 0.4;
      }
    } else if (plungerHeld) {
      game.setPlunger(false);
      plungerHeld = false;
    }
    for (const { side, f, dir, n, state } of sides) {
      if (state.hold > 0) {
        state.hold -= DT;
        if (state.hold <= 0) {
          game.setFlipper(side, false);
          state.cooldown = COOLDOWN;
          state.aim = null;
        }
        continue;
      }
      if (state.cooldown > 0) {
        state.cooldown -= DT;
        continue;
      }
      let near = false;
      let fire = false;
      for (const b of game.world.balls) {
        if (b.layer !== LAYER_FLOOR || b.frozen) continue;
        const rx = b.x - f.x;
        const ry = b.y - f.y;
        const s = rx * dir[0] + ry * dir[1];
        const d = rx * n[0] + ry * n[1];
        if (s < -1 || s > f.length + 2.5 || d < -1.5 || d > b.r + 4) continue;
        near = true;
        if (state.aim === null) {
          state.aim = skill.aim[side] + gauss(rng) * skill.sigma;
          state.delay = rng.next() < skill.lapse ? skill.lapseDelay : 0;
        }
        const approaching = b.vx * n[0] + b.vy * n[1] < 8;
        if (d < b.r + 1.1 && s >= state.aim && approaching) fire = true;
      }
      if (!near) state.aim = null;
      if (fire) {
        if (state.delay > 0) {
          state.delay -= DT;
          continue;
        }
        game.setFlipper(side, true);
        state.hold = HOLD;
      }
    }
    game.step(DT);
    t += DT;
    for (const e of game.drainEvents()) {
      events[e.kind] = (events[e.kind] ?? 0) + 1;
      onEvent?.(e, game);
    }
  }
  return { cleared: game.state === "cleared", ballsLeft: game.ballsLeft, score: game.score, seconds: t, events };
};

export const quantiles = (values: number[], qs = [0.1, 0.25, 0.5, 0.75, 0.9]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return qs.map((q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]);
};

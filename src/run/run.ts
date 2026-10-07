import type { GameRules, Modifier } from "../game/game";
import { CHARMS, CHARM_IDS } from "./charms";
import { CURSES, CURSE_IDS, type CurseDef } from "./curses";
import { Rng } from "./rng";

export interface StageDef {
  target: number;
  boss: boolean;
}

export const STAGES: StageDef[] = [
  { target: 10_000, boss: false },
  { target: 18_000, boss: false },
  { target: 30_000, boss: true },
  { target: 45_000, boss: false },
  { target: 70_000, boss: false },
  { target: 110_000, boss: true },
  { target: 160_000, boss: false },
  { target: 250_000, boss: true },
];

export const BALLS_PER_STAGE = 2;
export const MAX_CHARMS = 5;
const SHOP_SIZE = 3;
const BASE_REWARD = 3;
const REWARD_PER_SPARE_BALL = 2;
const OVERKILL_STEP = 0.1;
const MAX_OVERKILL_REWARD = 15;

export type RunPhase = "stage" | "shop" | "won" | "lost";

export interface StageResult {
  cleared: boolean;
  ballsLeft: number;
  score: number;
}

export interface Shop {
  offers: string[];
  rerollCost: number;
}

export interface RunData {
  version: 1;
  rng: number;
  stage: number;
  phase: RunPhase;
  truffles: number;
  charms: string[];
  curse: string | null;
  usedBossCurses: string[];
  shop: Shop;
  lastReward: number;
}

const toModifier = (id: string, effect: Omit<Modifier, "id">): Modifier => ({ id, ...effect });

export class Run {
  stage = 0;
  phase: RunPhase = "stage";
  truffles = 0;
  charms: string[] = [];
  shop: Shop = { offers: [], rerollCost: 1 };
  lastReward = 0;
  lastOverkill = 0;
  private curseId: string | null = null;
  private usedBossCurses: string[] = [];
  private readonly rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  get stageDef(): StageDef {
    return STAGES[this.stage];
  }

  get curse(): CurseDef | null {
    return this.curseId ? CURSES[this.curseId] : null;
  }

  stageRules(): Partial<GameRules> {
    const modifiers = this.charms.map((id) => toModifier(id, CHARMS[id].effect));
    const { curse } = this;
    if (curse) modifiers.push(toModifier(curse.id, curse.effect));
    return { balls: BALLS_PER_STAGE, target: this.stageDef.target, modifiers };
  }

  finishStage(result: StageResult): void {
    if (this.phase !== "stage") return;
    if (!result.cleared) {
      this.phase = "lost";
      return;
    }
    const { target } = this.stageDef;
    this.lastOverkill = Math.min(MAX_OVERKILL_REWARD, Math.max(0, Math.floor((result.score - target) / (target * OVERKILL_STEP) + 1e-9)));
    this.lastReward = BASE_REWARD + Math.floor(this.stage / 2) + Math.max(0, result.ballsLeft - 1) * REWARD_PER_SPARE_BALL + this.lastOverkill;
    this.truffles += this.lastReward;
    if (this.stage === STAGES.length - 1) {
      this.phase = "won";
      return;
    }
    this.phase = "shop";
    this.shop = { offers: this.rollOffers(), rerollCost: 1 };
  }

  buy(index: number): void {
    const id = this.shop.offers[index];
    if (this.phase !== "shop" || !id || this.charms.length >= MAX_CHARMS) return;
    const { price } = CHARMS[id];
    if (this.truffles < price) return;
    this.truffles -= price;
    this.charms.push(id);
    this.shop.offers.splice(index, 1);
  }

  sell(id: string): void {
    const index = this.charms.indexOf(id);
    if (index < 0) return;
    this.charms.splice(index, 1);
    this.truffles += Math.floor(CHARMS[id].price / 2);
  }

  reroll(): void {
    if (this.phase !== "shop" || this.truffles < this.shop.rerollCost) return;
    this.truffles -= this.shop.rerollCost;
    this.shop = { offers: this.rollOffers(), rerollCost: this.shop.rerollCost + 1 };
  }

  nextStage(): void {
    if (this.phase !== "shop") return;
    this.stage++;
    this.phase = "stage";
    this.curseId = this.rollCurse();
  }

  toJSON(): RunData {
    return {
      version: 1,
      rng: this.rng.state,
      stage: this.stage,
      phase: this.phase,
      truffles: this.truffles,
      charms: [...this.charms],
      curse: this.curseId,
      usedBossCurses: [...this.usedBossCurses],
      shop: { offers: [...this.shop.offers], rerollCost: this.shop.rerollCost },
      lastReward: this.lastReward,
    };
  }

  static fromJSON(data: RunData): Run {
    const run = new Run(data.rng);
    run.stage = data.stage;
    run.phase = data.phase;
    run.truffles = data.truffles;
    run.charms = data.charms.filter((id) => id in CHARMS);
    run.curseId = data.curse && data.curse in CURSES ? data.curse : null;
    run.usedBossCurses = [...data.usedBossCurses];
    run.shop = { offers: data.shop.offers.filter((id) => id in CHARMS), rerollCost: data.shop.rerollCost };
    run.lastReward = data.lastReward;
    return run;
  }

  private rollOffers(): string[] {
    return this.rng.sample(
      CHARM_IDS.filter((id) => !this.charms.includes(id)),
      SHOP_SIZE,
    );
  }

  private rollCurse(): string | null {
    if (this.stage === 0) return null;
    if (!this.stageDef.boss) return this.rng.pick(CURSE_IDS.filter((id) => !CURSES[id].boss));
    const bosses = CURSE_IDS.filter((id) => CURSES[id].boss && !this.usedBossCurses.includes(id));
    const id = this.rng.pick(bosses.length > 0 ? bosses : CURSE_IDS.filter((c) => CURSES[c].boss));
    this.usedBossCurses.push(id);
    return id;
  }
}

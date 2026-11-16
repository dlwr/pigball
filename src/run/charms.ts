import { MAX_MULTIPLIER, MAX_SHOT_LEVEL, type Modifier, type ScoreKind } from "../game/game";

export interface CharmDef {
  id: string;
  name: string;
  description: string;
  price: number;
  rare?: boolean;
  grows?: boolean;
  effect: Omit<Modifier, "id">;
}

const ROTOR_FRENZY_OMEGA = 4;
const SNORTS_PER_SHOT = 8;
export const GROWTH_PER_SHOT = 0.05;
const EARLY_FEVER_RATE = 0.85;

const boost = (kinds: Partial<Record<ScoreKind, number>>): Omit<Modifier, "id"> => ({
  score: (kind, points) => points * (kinds[kind] ?? 1),
});

const defs: CharmDef[] = [
  { id: "bumper-boost", name: "鼻息マシマシ", description: "バンパーの点が10倍", price: 4, effect: boost({ bumper: 10 }) },
  { id: "sling-sharp", name: "おちょぼ口", description: "スリングの点が25倍", price: 3, effect: boost({ sling: 25 }) },
  { id: "truffle-hunter", name: "トリュフ探知鼻", description: "ジャックポットが5倍", price: 4, effect: boost({ jackpot: 5 }) },
  { id: "spinner-swirl", name: "ぐるぐるしっぽ", description: "スピナーの点が40倍", price: 3, effect: boost({ spinner: 40 }) },
  { id: "piggy-greed", name: "へそくり", description: "貯金箱の点が2倍、割ったときのボーナスが3倍", price: 5, effect: boost({ piggy: 2, piggyBreak: 3 }) },
  { id: "mud-lover", name: "泥パック", description: "泥んこ沼の点が50倍", price: 3, effect: boost({ mud: 50 }) },
  { id: "navel-gazer", name: "へそ自慢", description: "へその点が10倍", price: 4, effect: boost({ navel: 10 }) },
  { id: "bonus-glutton", name: "食いしん坊", description: "ボール終了時のボーナスが5倍", price: 4, effect: boost({ bonus: 5 }) },
  { id: "ramp-chef", name: "ホース料理人", description: "ランプの点が3倍", price: 5, effect: boost({ ramp: 3 }) },
  { id: "belly-drum", name: "腹太鼓", description: "お腹の点が2倍", price: 5, effect: boost({ belly: 2 }) },
  { id: "rotor-dance", name: "豚足ダンス", description: "風車の点が4倍", price: 3, effect: boost({ rotor: 4 }) },
  { id: "skill-snout", name: "狙い鼻", description: "スキルショットが3倍", price: 3, effect: boost({ skillShot: 3 }) },
  { id: "buck-teeth", name: "出っ歯", description: "ターゲットの点が3倍、全部倒したボーナスが2倍", price: 5, effect: boost({ target: 3, bank: 2 }) },
  {
    id: "long-legs",
    name: "長い足",
    description: "フリッパーが少し長い",
    price: 6,
    effect: {
      layout: (layout) => {
        layout.flippers.left.length = 7.4;
        layout.flippers.right.length = 7.4;
      },
    },
  },
  {
    id: "springy-snouts",
    name: "弾む鼻",
    description: "バンパーが強く弾く",
    price: 4,
    effect: { layout: (layout) => layout.bumpers.forEach((bumper) => (bumper.kick = 150)) },
  },
  { id: "floaty", name: "ふわふわ", description: "重力が軽い", price: 4, effect: { params: (params) => (params.gravity = 125) } },
  { id: "bouncy-walls", name: "ぷにぷに壁", description: "壁がよく弾む", price: 4, effect: { params: (params) => (params.wallRestitution = 0.62) } },
  {
    id: "double-kickback",
    name: "両足キック",
    description: "左右のキックバックが最初から点いている",
    price: 5,
    effect: { start: (game) => (game.kickbacksLit = { left: true, right: true }) },
  },
  { id: "long-save", name: "おまもり", description: "ボールセーブが6秒長い", price: 5, effect: { start: (game) => (game.rules.ballSaveSeconds += 6) } },
  { id: "express-ramp", name: "急行ホース", description: "ランプ1回を2回分として数える", price: 6, effect: { rampWorth: () => 2 } },
  { id: "extra-piglet", name: "子だくさん", description: "ボールが1個増える", price: 8, effect: { start: (game) => (game.ballsLeft += 1) } },
  { id: "piggy-crusher", name: "トンカチ", description: "貯金箱が2回で割れる", price: 3, effect: { start: (game) => (game.piggyHitsToBreak = 2) } },
  {
    id: "rotor-frenzy",
    name: "豚足フィーバー",
    description: "風車が勢いよく回っている間、全部の点が1.5倍",
    price: 4,
    effect: { score: (_kind, points, game) => (Math.abs(game.world.rotors[0]?.omega ?? 0) > ROTOR_FRENZY_OMEGA ? points * 1.5 : points) },
  },
  {
    id: "navel-charge",
    name: "へそ充電",
    description: "へそに入るたびに倍率が1上がる（最大5）",
    price: 7,
    effect: {
      event: (kind, game) => {
        if (kind !== "navelIn") return false;
        game.multiplier = Math.min(MAX_MULTIPLIER, game.multiplier + 1);
        return true;
      },
    },
  },
  { id: "sharpshooter", name: "一点狙い", description: "光ったショットの上乗せが2倍", price: 7, effect: { shot: (_shot, points) => points * 2 } },
  {
    id: "follow-through",
    name: "畳みかけ",
    description: "光ったショットに当てると、段階が2つ上がる",
    price: 5,
    effect: {
      event: (kind, game) => {
        if (kind !== "shot") return false;
        game.shotLevel = Math.min(MAX_SHOT_LEVEL, game.shotLevel + 1);
        return true;
      },
    },
  },
  {
    id: "navel-sight",
    name: "へそ照準",
    description: "へそに入ると、次のショットも光る",
    price: 4,
    effect: {
      event: (kind, game) => {
        if (kind !== "navelIn") return false;
        game.lightShot();
        return true;
      },
    },
  },
  {
    id: "snort-sight",
    name: "鼻息照準",
    description: `バンパーの点がなくなる代わりに、${SNORTS_PER_SHOT}回当てるごとに次のショットも光る`,
    price: 4,
    effect: {
      score: (kind, points) => (kind === "bumper" ? 0 : points),
      event(kind, game) {
        if (kind !== "bumper") return false;
        this.count = (this.count ?? 0) + 1;
        if (this.count % SNORTS_PER_SHOT !== 0) return false;
        game.lightShot();
        return true;
      },
    },
  },
  {
    id: "big-eater",
    name: "食べ盛り",
    description: `光ったショットに当てるたびに育ち、全部の点が${GROWTH_PER_SHOT * 100}%ずつ増える。育ちはランの間ずっと残る`,
    price: 7,
    grows: true,
    effect: {
      score(_kind, points) {
        return points * (1 + GROWTH_PER_SHOT * (this.count ?? 0));
      },
      event(kind) {
        if (kind !== "shot") return false;
        this.count = (this.count ?? 0) + 1;
        return true;
      },
    },
  },
  { id: "golden-snout", name: "金の鼻", description: "全部の点が1.5倍", price: 9, rare: true, effect: { score: (_kind, points) => points * 1.5 } },
  {
    id: "pig-horde",
    name: "豚の大群",
    description: "マルチボール中は全部の点が3倍",
    price: 7,
    rare: true,
    effect: { score: (_kind, points, game) => (game.inMultiball ? points * 3 : points) },
  },
  {
    id: "fever-body",
    name: "フィーバー体質",
    description: `目標の${EARLY_FEVER_RATE * 100}%でフィーバーに入る`,
    price: 8,
    rare: true,
    effect: {
      start: (game) => {
        if (game.rules.target !== null) game.rules.target *= EARLY_FEVER_RATE;
      },
    },
  },
  {
    id: "double-down",
    name: "倍々ゲーム",
    description: "倍率がもう一度掛かる",
    price: 8,
    rare: true,
    effect: { score: (_kind, points, game) => points * game.multiplier },
  },
  {
    id: "twin-piglets",
    name: "双子の子豚",
    description: "打ち出すと、もう1匹が一緒に出てくる",
    price: 10,
    rare: true,
    effect: {
      event: (kind, game) => {
        if (kind !== "launch" || game.ballsInPlay !== 1) return false;
        game.addBall();
        return true;
      },
    },
  },
  {
    id: "sight-god",
    name: "照準の神",
    description: "ボールを落としても、光ったショットの段階が戻らない",
    price: 7,
    rare: true,
    effect: { start: (game) => (game.keepsShotLevel = true) },
  },
  { id: "pig-god", name: "豚の神様", description: "呪いが効かない", price: 9, rare: true, effect: {} },
];

export const CHARMS: Record<string, CharmDef> = Object.fromEntries(defs.map((def) => [def.id, def]));
export const CHARM_IDS = defs.map((def) => def.id);
export const COMMON_CHARM_IDS = defs.filter((def) => !def.rare).map((def) => def.id);
export const RARE_CHARM_IDS = defs.filter((def) => def.rare).map((def) => def.id);

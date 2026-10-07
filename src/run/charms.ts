import { MAX_MULTIPLIER, type Modifier, type ScoreKind } from "../game/game";

export interface CharmDef {
  id: string;
  name: string;
  description: string;
  price: number;
  rare?: boolean;
  effect: Omit<Modifier, "id">;
}

const ROTOR_FRENZY_OMEGA = 4;

const boost = (kinds: Partial<Record<ScoreKind, number>>): Omit<Modifier, "id"> => ({
  score: (kind, points) => points * (kinds[kind] ?? 1),
});

const defs: CharmDef[] = [
  { id: "bumper-boost", name: "鼻息マシマシ", description: "バンパーの点が3倍", price: 5, effect: boost({ bumper: 3 }) },
  { id: "sling-sharp", name: "おちょぼ口", description: "スリングの点が10倍", price: 3, effect: boost({ sling: 10 }) },
  { id: "truffle-hunter", name: "トリュフ探知鼻", description: "ジャックポットが3倍", price: 6, effect: boost({ jackpot: 3 }) },
  { id: "spinner-swirl", name: "ぐるぐるしっぽ", description: "スピナーの点が4倍", price: 4, effect: boost({ spinner: 4 }) },
  { id: "piggy-greed", name: "へそくり", description: "貯金箱の点が3倍、割ったときのボーナスが2倍", price: 5, effect: boost({ piggy: 3, piggyBreak: 2 }) },
  { id: "mud-lover", name: "泥パック", description: "泥んこ沼の点が10倍", price: 3, effect: boost({ mud: 10 }) },
  { id: "navel-gazer", name: "へそ自慢", description: "へその点が3倍", price: 5, effect: boost({ navel: 3 }) },
  { id: "bonus-glutton", name: "食いしん坊", description: "ボール終了時のボーナスが2倍", price: 5, effect: boost({ bonus: 2 }) },
  { id: "ramp-chef", name: "ホース料理人", description: "ランプの点が2倍", price: 5, effect: boost({ ramp: 2 }) },
  { id: "belly-drum", name: "腹太鼓", description: "お腹の点が5倍", price: 3, effect: boost({ belly: 5 }) },
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
        layout.flippers.left.length = 7.8;
        layout.flippers.right.length = 7.8;
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
  { id: "floaty", name: "ふわふわ", description: "重力が軽い", price: 6, effect: { params: (params) => (params.gravity = 125) } },
  { id: "bouncy-walls", name: "ぷにぷに壁", description: "壁がよく弾む", price: 4, effect: { params: (params) => (params.wallRestitution = 0.62) } },
  {
    id: "double-kickback",
    name: "両足キック",
    description: "左右のキックバックが最初から点いている",
    price: 5,
    effect: { start: (game) => (game.kickbacksLit = { left: true, right: true }) },
  },
  { id: "long-save", name: "おまもり", description: "ボールセーブが6秒長い", price: 4, effect: { start: (game) => (game.rules.ballSaveSeconds += 6) } },
  { id: "express-ramp", name: "急行ホース", description: "ランプ1回を2回分として数える", price: 7, effect: { rampWorth: () => 2 } },
  { id: "extra-piglet", name: "子だくさん", description: "ボールが1個増える", price: 8, effect: { start: (game) => (game.ballsLeft += 1) } },
  { id: "piggy-crusher", name: "トンカチ", description: "貯金箱が3回で割れる", price: 5, effect: { start: (game) => (game.piggyHitsToBreak = 3) } },
  {
    id: "rotor-frenzy",
    name: "豚足フィーバー",
    description: "風車が勢いよく回っている間、全部の点が1.5倍",
    price: 6,
    effect: { score: (_kind, points, game) => (Math.abs(game.world.rotors[0]?.omega ?? 0) > ROTOR_FRENZY_OMEGA ? points * 1.5 : points) },
  },
  {
    id: "navel-charge",
    name: "へそ充電",
    description: "へそに入るたびに倍率が1上がる（最大5）",
    price: 6,
    effect: {
      event: (kind, game) => {
        if (kind !== "navelIn") return false;
        game.multiplier = Math.min(MAX_MULTIPLIER, game.multiplier + 1);
        return true;
      },
    },
  },
  { id: "golden-snout", name: "金の鼻", description: "全部の点が1.5倍", price: 9, rare: true, effect: { score: (_kind, points) => points * 1.5 } },
  {
    id: "pig-horde",
    name: "豚の大群",
    description: "マルチボール中は全部の点が2倍",
    price: 8,
    rare: true,
    effect: { score: (_kind, points, game) => (game.inMultiball ? points * 2 : points) },
  },
  {
    id: "fever-body",
    name: "フィーバー体質",
    description: "フィーバー中は全部の点がさらに2倍",
    price: 8,
    rare: true,
    effect: { score: (_kind, points, game) => (game.inFever ? points * 2 : points) },
  },
  {
    id: "double-down",
    name: "倍々ゲーム",
    description: "倍率がもう一度掛かる",
    price: 10,
    rare: true,
    effect: { score: (_kind, points, game) => points * game.multiplier },
  },
];

export const CHARMS: Record<string, CharmDef> = Object.fromEntries(defs.map((def) => [def.id, def]));
export const CHARM_IDS = defs.map((def) => def.id);
export const COMMON_CHARM_IDS = defs.filter((def) => !def.rare).map((def) => def.id);
export const RARE_CHARM_IDS = defs.filter((def) => def.rare).map((def) => def.id);

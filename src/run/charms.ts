import type { Modifier, ScoreKind } from "../game/game";

export interface CharmDef {
  id: string;
  name: string;
  description: string;
  price: number;
  effect: Omit<Modifier, "id">;
}

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
];

export const CHARMS: Record<string, CharmDef> = Object.fromEntries(defs.map((def) => [def.id, def]));
export const CHARM_IDS = defs.map((def) => def.id);

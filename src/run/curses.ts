import type { Modifier } from "../game/game";

export interface CurseDef {
  id: string;
  name: string;
  description: string;
  boss: boolean;
  effect: Omit<Modifier, "id">;
}

const defs: CurseDef[] = [
  {
    id: "sleepy-snouts",
    name: "居眠り鼻",
    description: "バンパーの点が半分で、弾きも弱い",
    boss: false,
    effect: {
      layout: (layout) => layout.bumpers.forEach((bumper) => (bumper.kick = 85)),
      score: (kind, points) => (kind === "bumper" ? points / 2 : points),
    },
  },
  {
    id: "short-legs",
    name: "短い足",
    description: "フリッパーが少し短い",
    boss: false,
    effect: {
      layout: (layout) => {
        layout.flippers.left.length = 6.6;
        layout.flippers.right.length = 6.6;
      },
    },
  },
  { id: "heavy-piglet", name: "重い子豚", description: "重力が重い", boss: false, effect: { params: (params) => (params.gravity = 185) } },
  {
    id: "stingy-bank",
    name: "ケチな貯金箱",
    description: "貯金箱からは点が出ない",
    boss: false,
    effect: { score: (kind, points) => (kind === "piggy" || kind === "piggyBreak" ? 0 : points) },
  },
  { id: "no-save", name: "おまもり忘れ", description: "ボールセーブが3秒しかない", boss: false, effect: { start: (game) => (game.rules.ballSaveSeconds = 3) } },
  {
    id: "mud-flood",
    name: "泥の洪水",
    description: "泥んこ沼が広がってバンパーの弾きが弱まり、入ると光ったショットの段階が1に戻る",
    boss: true,
    effect: {
      layout: (layout) => {
        layout.mud.r = 8;
        layout.mud.drag = 5;
        layout.bumpers.forEach((bumper) => (bumper.kick = 80));
      },
      event: (kind, game) => {
        if (kind !== "mud" || game.shotLevel === 1) return false;
        game.shotLevel = 1;
        return true;
      },
    },
  },
  {
    id: "clogged-hose",
    name: "ホースびいき",
    description: "ランプ以外は、光ったショットの上乗せが4分の1",
    boss: true,
    effect: { shot: (shot, points) => (shot === "ramp" ? points : points / 4) },
  },
  {
    id: "earth-weight",
    name: "大地の重み",
    description: "重力が重く、フリッパーも短い",
    boss: true,
    effect: {
      params: (params) => (params.gravity = 200),
      layout: (layout) => {
        layout.flippers.left.length = 6.2;
        layout.flippers.right.length = 6.2;
      },
    },
  },
];

export const CURSES: Record<string, CurseDef> = Object.fromEntries(defs.map((def) => [def.id, def]));
export const CURSE_IDS = defs.map((def) => def.id);

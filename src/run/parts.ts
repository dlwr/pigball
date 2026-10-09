import type { PartId } from "../game/table";

export interface PartDef {
  id: PartId;
  name: string;
  description: string;
  price: number;
}

const defs: PartDef[] = [
  { id: "rotor", name: "豚足風車", description: "当たると回る風車。風車のおまじないが効く", price: 3 },
  { id: "snout", name: "鼻", description: "強く弾くバンパー。バンパーのおまじないが効く", price: 4 },
  { id: "eye", name: "目玉", description: "当てると750点。狙いやすいショットとして光る", price: 5 },
  { id: "stomach", name: "胃袋", description: "入るとボールを止めて吐き出す。1500点。狙いやすいショットとして光る", price: 6 },
];

export const PARTS = Object.fromEntries(defs.map((def) => [def.id, def])) as Record<PartId, PartDef>;
export const PART_IDS = defs.map((def) => def.id);

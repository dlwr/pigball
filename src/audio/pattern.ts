import type { GameState } from "../game/game";

export type MusicLevel = 0 | 1 | 2;
export type Voice = "kick" | "snare" | "hat" | "bass" | "arp" | "lead";

export interface Note {
  voice: Voice;
  freq: number;
}

export const STEPS_PER_BAR = 16;
export const STEPS_PER_LOOP = STEPS_PER_BAR * 4;

const CHORDS: [number, number, number][] = [
  [45, 48, 52],
  [41, 45, 48],
  [48, 52, 55],
  [43, 47, 50],
];
const ARP_ORDER = [0, 1, 2, 1];
const LEAD_ORDER = [2, 1, 0, 1];

const midiToFreq = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

export const tempoFor = (level: MusicLevel): number => (level === 2 ? 140 : 124);

export const levelFor = (state: GameState, inMultiball: boolean): MusicLevel | null => {
  if (state === "over") return null;
  if (inMultiball) return 2;
  return state === "playing" ? 1 : 0;
};

export const notesAt = (step: number, level: MusicLevel): Note[] => {
  const inBar = step % STEPS_PER_BAR;
  const chord = CHORDS[Math.floor(step / STEPS_PER_BAR) % CHORDS.length];
  const notes: Note[] = [];
  const bassEvery = level === 0 ? 4 : 2;
  if (inBar % bassEvery === 0) notes.push({ voice: "bass", freq: midiToFreq(chord[0]) });
  if (inBar % 4 === 2) notes.push({ voice: "hat", freq: 0 });
  if (level === 0) return notes;
  if (inBar % 4 === 0) notes.push({ voice: "kick", freq: 0 });
  if (inBar % 8 === 4) notes.push({ voice: "snare", freq: 0 });
  notes.push({ voice: "arp", freq: midiToFreq(chord[ARP_ORDER[inBar % ARP_ORDER.length]] + 24) });
  if (level === 2 && inBar % 4 === 0) notes.push({ voice: "lead", freq: midiToFreq(chord[LEAD_ORDER[inBar / 4]] + 36) });
  return notes;
};

import { type MusicLevel, notesAt, type Note, STEPS_PER_LOOP, tempoFor } from "./pattern";
import type { Sfx } from "./sfx";

const LOOKAHEAD_SECONDS = 0.15;
const VOLUME = 0.32;

export class Music {
  private bus: GainNode | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(
    private readonly sfx: Sfx,
    public enabled: boolean,
  ) {}

  update(level: MusicLevel | null): void {
    const output = this.sfx.output;
    if (!output || output.ctx.state !== "running") return;
    const { ctx } = output;
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = 0;
      this.bus.connect(output.destination);
    }
    const audible = this.enabled && level !== null;
    this.bus.gain.setTargetAtTime(audible ? VOLUME : 0, ctx.currentTime, audible ? 0.05 : 0.3);
    if (!audible) {
      this.nextTime = 0;
      this.step = 0;
      return;
    }
    if (this.nextTime < ctx.currentTime) this.nextTime = ctx.currentTime + 0.05;
    while (this.nextTime < ctx.currentTime + LOOKAHEAD_SECONDS) {
      for (const note of notesAt(this.step, level)) this.play(note, this.nextTime, output.noise);
      this.nextTime += 60 / tempoFor(level) / 4;
      this.step = (this.step + 1) % STEPS_PER_LOOP;
    }
  }

  private play(note: Note, t: number, noise: AudioBuffer): void {
    switch (note.voice) {
      case "kick":
        this.tone("sine", 150, 45, t, 0.18, 0.9);
        break;
      case "snare":
        this.noise(noise, "bandpass", 1800, t, 0.12, 0.5);
        this.tone("triangle", 220, 160, t, 0.06, 0.25);
        break;
      case "hat":
        this.noise(noise, "highpass", 7000, t, 0.03, 0.25);
        break;
      case "bass":
        this.tone("sawtooth", note.freq, note.freq, t, 0.16, 0.3, 700);
        break;
      case "arp":
        this.tone("square", note.freq, note.freq, t, 0.06, 0.08, 2500);
        break;
      case "lead":
        this.tone("triangle", note.freq, note.freq, t, 0.22, 0.22);
        break;
    }
  }

  private tone(type: OscillatorType, from: number, to: number, t: number, duration: number, volume: number, cutoff?: number): void {
    const ctx = this.bus!.context;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    let node: AudioNode = osc;
    if (cutoff) {
      const filter = ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = cutoff;
      node = osc.connect(filter);
    }
    node.connect(gain).connect(this.bus!);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private noise(buffer: AudioBuffer, type: BiquadFilterType, frequency: number, t: number, duration: number, volume: number): void {
    const ctx = this.bus!.context;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(this.bus!);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }
}

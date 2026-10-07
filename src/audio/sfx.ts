import type { GameEvent } from "../game/game";

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private lastPlayed = new Map<string, number>();

  unlock(): void {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.ratio.value = 6;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(compressor).connect(this.ctx.destination);
      this.noise = this.createNoise(this.ctx);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  suspend(): void {
    if (this.ctx?.state === "running") void this.ctx.suspend();
  }

  solenoid(): void {
    this.burst(2400, 0.035, 0.35, 3);
    this.tone("square", 90, 60, 0.04, 0.15);
  }

  play(event: GameEvent): void {
    const s = Math.min(1, event.speed / 300);
    switch (event.kind) {
      case "bumper":
        this.tone("sine", 220, 70, 0.16, 0.7);
        this.tone("sawtooth", 660, 330, 0.06, 0.15);
        this.burst(1800, 0.03, 0.4, 2);
        break;
      case "sling":
        this.tone("square", 340, 170, 0.07, 0.3);
        this.burst(2600, 0.025, 0.35, 2);
        break;
      case "target":
        this.tone("triangle", 520, 260, 0.1, 0.5);
        this.burst(1200, 0.04, 0.4, 2);
        break;
      case "bank":
        this.arpeggio([523, 659, 784, 1047], 0.06, "square", 0.25);
        break;
      case "rollover":
        this.tone("sine", 1320, 1320, 0.08, 0.3);
        break;
      case "lanes":
        this.arpeggio([659, 784, 988, 1319], 0.05, "triangle", 0.35);
        break;
      case "skill":
        this.arpeggio([784, 988, 1175, 1568, 1976], 0.045, "square", 0.25);
        this.burst(5000, 0.3, 0.25, 0.7);
        break;
      case "rampEnter":
        this.tone("sawtooth", 180, 520, 0.35, 0.12);
        break;
      case "ramp":
        this.arpeggio([523, 784, 1047, 1568].map((f) => f * (1 + (event.speed - 1) * 0.125)), 0.05, "square", 0.22);
        this.burst(4000, 0.25, 0.2, 0.7);
        break;
      case "spin":
        if (!this.throttle("spin", 0.025)) return;
        this.tone("square", 1600, 1500, 0.015, 0.08);
        break;
      case "flipper":
        if (!this.throttle("flipper", 0.03)) return;
        this.tone("sine", 140, 70, 0.07, 0.25 + s * 0.6);
        break;
      case "wall":
        if (s < 0.05 || !this.throttle(`wall${event.id}`, 0.03)) return;
        this.tone("triangle", 380 + s * 600, 200 + s * 200, 0.035, s * 0.6);
        this.burst(3000 + s * 3000, 0.02, s * 0.3, 1.5);
        break;
      case "launch":
        this.burst(500, 0.2, 0.3 + event.speed * 0.4, 0.8);
        this.tone("sine", 80, 40, 0.18, 0.4);
        break;
      case "extraBall":
        this.arpeggio([523, 659, 784, 1047, 1319, 1568], 0.07, "square", 0.25);
        break;
      case "shootAgain":
      case "save":
        this.arpeggio([392, 523, 659], 0.07, "triangle", 0.3);
        break;
      case "drain":
        this.tone("sawtooth", 300, 50, 0.6, 0.3);
        break;
      case "tilt":
        this.tone("sawtooth", 62, 58, 0.7, 0.4);
        break;
      case "over":
        this.arpeggio([523, 415, 330, 262], 0.14, "triangle", 0.35);
        break;
    }
  }

  private throttle(key: string, interval: number): boolean {
    const now = this.ctx?.currentTime ?? 0;
    if (now - (this.lastPlayed.get(key) ?? -1) < interval) return false;
    this.lastPlayed.set(key, now);
    return true;
  }

  private tone(type: Wave, from: number, to: number, duration: number, volume: number, delay = 0): void {
    const { ctx, master } = this;
    if (!ctx || !master || ctx.state !== "running") return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  private burst(frequency: number, duration: number, volume: number, q: number): void {
    const { ctx, master, noise } = this;
    if (!ctx || !master || !noise || ctx.state !== "running" || volume <= 0) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(filter).connect(gain).connect(master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + duration + 0.02);
  }

  private arpeggio(notes: number[], step: number, type: Wave, volume: number): void {
    notes.forEach((f, i) => this.tone(type, f, f, step * 1.6, volume, i * step));
  }

  private createNoise(ctx: AudioContext): AudioBuffer {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }
}

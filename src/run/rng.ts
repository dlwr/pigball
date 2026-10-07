export class Rng {
  constructor(public state: number) {}

  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }

  sample<T>(items: readonly T[], count: number): T[] {
    const pool = [...items];
    const picked: T[] = [];
    while (picked.length < count && pool.length > 0) picked.push(pool.splice(Math.floor(this.next() * pool.length), 1)[0]);
    return picked;
  }
}

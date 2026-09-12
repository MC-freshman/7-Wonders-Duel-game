/* ------------------------------------------------------------------
 * 可复现随机数（mulberry32）
 * 整个随机流仅由一个 32 位状态驱动，因此可直接存进 GameState，
 * 保证同一 seed 的对局可完整重放、AI 可安全试算而不污染真实随机流。
 * ------------------------------------------------------------------ */

export function nextState(state: number): number {
  return (state + 0x6d2b79f5) >>> 0;
}

export function nextFloat(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export class Rng {
  constructor(public state: number) {}

  float(): number {
    this.state = nextState(this.state);
    return nextFloat(this.state);
  }

  int(maxExclusive: number): number {
    return Math.floor(this.float() * maxExclusive);
  }

  pick<T>(arr: T[]): T {
    return arr[this.int(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  sample<T>(arr: T[], n: number): T[] {
    return this.shuffle(arr).slice(0, n);
  }

  /** AI 试算用的影子流，不影响主状态 */
  fork(): Rng {
    return new Rng(this.state);
  }
}

export const makeRng = (seed: number) => new Rng(seed >>> 0);

/* ------------------------------------------------------------------
 * 音效：Web Audio 程序化合成
 *
 * 为什么不打包音频文件：原作音效受版权保护，且徒增体积。
 * 本作需要的都是短促提示音，用振荡器 + 包络完全够用，体积为零。
 *
 * 如需替换成真实录音，把 mp3/ogg 放进 public/sounds/<name>.mp3 即可，
 * 加载成功则优先播放，失败自动回落到合成音。
 * ------------------------------------------------------------------ */

export type SfxName =
  | 'click'
  | 'select'
  | 'build'
  | 'discard'
  | 'wonder'
  | 'shield'
  | 'fine'
  | 'token'
  | 'reveal'
  | 'age'
  | 'win'
  | 'lose';

const STORAGE_KEY = '7wd-muted';

interface Envelope {
  type: OscillatorType;
  freq: number;
  /** 频率滑落到的目标值，用于「下行」音效 */
  freqTo?: number;
  dur: number;
  gain: number;
  delay?: number;
  /** 是否叠加一层滤波白噪声（翻牌、落定的质感） */
  noise?: number;
}

const RECIPES: Record<SfxName, Envelope[]> = {
  // 短促「嘀」
  click: [{ type: 'square', freq: 880, dur: 0.06, gain: 0.05 }],
  select: [{ type: 'square', freq: 880, dur: 0.07, gain: 0.06 }],
  // 低频落定 + 轻噪声
  build: [
    { type: 'sine', freq: 220, freqTo: 150, dur: 0.18, gain: 0.12 },
    { type: 'sine', freq: 330, freqTo: 260, dur: 0.14, gain: 0.06, delay: 0.02 },
    { type: 'sine', freq: 110, dur: 0.12, gain: 0.05, noise: 0.25 },
  ],
  // 两声上行，清脆
  discard: [
    { type: 'sine', freq: 880, dur: 0.09, gain: 0.09 },
    { type: 'sine', freq: 1320, dur: 0.12, gain: 0.08, delay: 0.07 },
  ],
  // 三音上行琶音
  wonder: [
    { type: 'triangle', freq: 523, dur: 0.16, gain: 0.1 },
    { type: 'triangle', freq: 659, dur: 0.16, gain: 0.1, delay: 0.09 },
    { type: 'triangle', freq: 784, dur: 0.34, gain: 0.11, delay: 0.18 },
  ],
  // 低沉鼓点
  shield: [{ type: 'sine', freq: 150, freqTo: 90, dur: 0.14, gain: 0.12, noise: 0.3 }],
  // 下行方波，带点粗糙
  fine: [
    { type: 'square', freq: 300, freqTo: 120, dur: 0.24, gain: 0.08 },
    { type: 'sawtooth', freq: 150, freqTo: 80, dur: 0.2, gain: 0.05, delay: 0.04 },
  ],
  // 明亮上行
  token: [
    { type: 'triangle', freq: 784, dur: 0.12, gain: 0.09 },
    { type: 'triangle', freq: 1047, dur: 0.22, gain: 0.09, delay: 0.08 },
  ],
  // 白噪声「唰」
  reveal: [{ type: 'sine', freq: 1200, dur: 0.12, gain: 0.03, noise: 1 }],
  // 五声音阶上行
  age: [
    { type: 'triangle', freq: 392, dur: 0.12, gain: 0.08 },
    { type: 'triangle', freq: 440, dur: 0.12, gain: 0.08, delay: 0.1 },
    { type: 'triangle', freq: 523, dur: 0.12, gain: 0.08, delay: 0.2 },
    { type: 'triangle', freq: 659, dur: 0.3, gain: 0.09, delay: 0.3 },
  ],
  // 大三和弦琶音
  win: [
    { type: 'triangle', freq: 523, dur: 0.2, gain: 0.1 },
    { type: 'triangle', freq: 659, dur: 0.2, gain: 0.1, delay: 0.12 },
    { type: 'triangle', freq: 784, dur: 0.2, gain: 0.1, delay: 0.24 },
    { type: 'triangle', freq: 1047, dur: 0.6, gain: 0.11, delay: 0.36 },
  ],
  // 小三和弦下行
  lose: [
    { type: 'triangle', freq: 523, dur: 0.22, gain: 0.09 },
    { type: 'triangle', freq: 415, dur: 0.22, gain: 0.09, delay: 0.16 },
    { type: 'triangle', freq: 311, dur: 0.5, gain: 0.09, delay: 0.32 },
  ],
};

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private lastPlayed = new Map<SfxName, number>();
  /** 默认静音，避免突然出声吓到人 */
  muted: boolean = true;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      this.muted = true;
    }
  }

  /** 必须在用户手势中调用（浏览器自动播放策略） */
  unlock(): void {
    this.ensure();
    void this.ctx?.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const Ctor: typeof AudioContext =
        window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    } catch {
      /* 忽略隐私模式下的写入失败 */
    }
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  /** 尝试加载 public/sounds/<name>.mp3，成功则覆盖合成音 */
  async preloadFiles(): Promise<void> {
    const ctx = this.ensure();
    if (!ctx) return;
    const names = Object.keys(RECIPES) as SfxName[];
    await Promise.all(
      names.map(async (name) => {
        for (const ext of ['mp3', 'ogg']) {
          try {
            const res = await fetch(`sounds/${name}.${ext}`);
            if (!res.ok) continue;
            const buf = await res.arrayBuffer();
            this.buffers.set(name, await ctx.decodeAudioData(buf));
            return;
          } catch {
            /* 继续尝试下一个扩展名 */
          }
        }
      }),
    );
  }

  play(name: SfxName): void {
    if (this.muted) return;
    // 同一音效 60ms 内不重复触发，避免快速连点时叠加破音
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? 0) < 60) return;
    this.lastPlayed.set(name, now);

    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    void ctx.resume();

    const file = this.buffers.get(name);
    if (file) {
      const src = ctx.createBufferSource();
      src.buffer = file;
      src.connect(this.master);
      src.start();
      return;
    }

    const t0 = ctx.currentTime;
    for (const env of RECIPES[name]) {
      this.renderEnvelope(ctx, env, t0);
    }
  }

  private renderEnvelope(ctx: AudioContext, env: Envelope, t0: number): void {
    const start = t0 + (env.delay ?? 0);
    const end = start + env.dur;

    const osc = ctx.createOscillator();
    osc.type = env.type;
    osc.frequency.setValueAtTime(env.freq, start);
    if (env.freqTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, env.freqTo), end);
    }

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(env.gain, start + Math.min(0.02, env.dur * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(start);
    osc.stop(end + 0.02);

    if (env.noise) {
      const len = Math.max(1, Math.floor(ctx.sampleRate * env.dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) {
        // 末尾衰减，避免爆音
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const ng = ctx.createGain();
      ng.gain.value = env.gain * env.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = 800;
      src.connect(filter);
      filter.connect(ng);
      ng.connect(this.master!);
      src.start(start);
    }
  }
}

export const sfx = new SoundEngine();

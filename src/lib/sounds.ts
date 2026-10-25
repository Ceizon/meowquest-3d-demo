// WebAudio 合成音效 —— 零依赖、零音频文件（断网/版权双保险）
// 移植自 web-prototype/lib/sounds.ts；静音状态持久化到 localStorage（键 mq-muted）

const MUTE_KEY = "mq-muted";

interface ConvoyLoop {
  sources: AudioScheduledSourceNode[];
  gain: GainNode;
}

class SoundManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private convoySources = new Set<AudioScheduledSourceNode>();
  private wheelLoop: (ConvoyLoop & { tone: OscillatorNode; toneGain: GainNode; load: number }) | null = null;
  private windLoop: ConvoyLoop | null = null;
  private wheelLoad: number | null = null;
  private windRequested = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      /* localStorage 不可用（隐私模式等）时保持默认不静音 */
    }
  }

  private getContext() {
    if (!this.ctx) {
      const AudioContextCtor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextCtor) throw new Error("Web Audio is not supported");
      this.ctx = new AudioContextCtor();
    }
    if (this.ctx.state === "suspended") {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /** 在用户点击后预热音频上下文，避免浏览器自动播放策略拦截后续音效。 */
  unlock() {
    if (this.muted) return false;
    try {
      const ctx = this.getContext();
      if (ctx.state === "suspended") void ctx.resume();
      return true;
    } catch {
      return false;
    }
  }

  get isMuted() {
    return this.muted;
  }

  toggleMute() {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      /* 忽略持久化失败 */
    }
    if (this.muted) {
      this.stopConvoyNodes();
    } else {
      if (this.wheelLoad !== null) this.startConvoyWheel(this.wheelLoad);
      if (this.windRequested) this.startConvoyWind();
    }
    return this.muted;
  }

  private trackConvoySource<T extends AudioScheduledSourceNode>(source: T): T {
    this.convoySources.add(source);
    source.addEventListener("ended", () => this.convoySources.delete(source), { once: true });
    return source;
  }

  private convoyTone(
    frequency: number,
    start: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine",
    endFrequency?: number,
  ): void {
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, frequency), start);
    if (endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), start + duration);
    }
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    this.trackConvoySource(osc);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  private convoyNoiseBuffer(seconds: number): AudioBuffer {
    const ctx = this.getContext();
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    return buffer;
  }

  private stopConvoyLoop(loop: ConvoyLoop | null): void {
    if (!loop) return;
    const now = this.ctx?.currentTime ?? 0;
    try {
      loop.gain.gain.cancelScheduledValues(now);
      loop.gain.gain.setTargetAtTime(0.0001, now, 0.015);
    } catch {
      /* 音频设备失效时仍继续停止节点 */
    }
    loop.sources.forEach((source) => {
      try { source.stop(now + 0.06); } catch { /* 已停止 */ }
    });
  }

  private stopConvoyNodes(): void {
    this.stopConvoyLoop(this.wheelLoop);
    this.stopConvoyLoop(this.windLoop);
    this.wheelLoop = null;
    this.windLoop = null;
    this.convoySources.forEach((source) => {
      try { source.stop(); } catch { /* 已停止 */ }
    });
    this.convoySources.clear();
  }

  click() {
    if (this.muted) return;
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 800;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.08);
  }

  success() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = "sine";
    osc1.frequency.value = 523;
    gain1.gain.setValueAtTime(0.2, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.1);

    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = "sine";
    osc2.frequency.value = 659;
    gain2.gain.setValueAtTime(0.001, now);
    gain2.gain.linearRampToValueAtTime(0.2, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.1);
    osc2.stop(now + 0.2);
  }

  miss() {
    if (this.muted) return;
    const ctx = this.getContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  }

  // 抑制训练的温和提示音：比 miss() 更轻更短（去污名化反馈，不惩罚）
  softMiss() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.linearRampToValueAtTime(240, now + 0.12);
    gain.gain.setValueAtTime(0.03, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  reward() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const freqs = [880, 1047, 1319];

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.12;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.12);
    });
  }

  // 灵猫互动短音：点击灵猫时的合成"喵"声（基频 + 谐波 + 轻微起音）
  meow() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const duration = 0.28;
    const voice = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(2600, now);
    filter.frequency.linearRampToValueAtTime(1800, now + duration);
    voice.gain.setValueAtTime(0.0001, now);
    voice.gain.exponentialRampToValueAtTime(0.16, now + 0.035);
    voice.gain.setValueAtTime(0.11, now + 0.13);
    voice.gain.exponentialRampToValueAtTime(0.001, now + duration);
    filter.connect(voice);
    voice.connect(ctx.destination);

    const addVoice = (frequency: number, type: OscillatorType, volume: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(frequency * 0.82, now);
      osc.frequency.linearRampToValueAtTime(frequency * 1.18, now + 0.09);
      osc.frequency.linearRampToValueAtTime(frequency * 0.72, now + duration);
      gain.gain.value = volume;
      osc.connect(gain);
      gain.connect(filter);
      osc.start(now);
      osc.stop(now + duration);
    };

    addVoice(690, "triangle", 0.9);
    addVoice(1380, "sine", 0.22);
  }

  dialogue() {
    this.meow();
  }

  // 呼吸引导·吸气：1s 白噪声低通扫频（200→800Hz），模拟气流涌入
  breatheIn() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const bufferSize = ctx.sampleRate * 1;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(200, now);
    filter.frequency.linearRampToValueAtTime(800, now + 1);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.8);
    gain.gain.linearRampToValueAtTime(0.001, now + 1);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    source.start(now);
    source.stop(now + 1);
  }

  // 呼吸引导·呼气：1.5s 正弦下滑音（400→200Hz），模拟气息放缓
  breatheOut() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.linearRampToValueAtTime(200, now + 1.5);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.5);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 1.5);
  }

  complete() {
    if (this.muted) return;
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const freqs = [523.25, 659.25, 783.99, 1046.5];

    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + i * 0.1;
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.linearRampToValueAtTime(0.2, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.1);
    });
  }

  convoyStoneLoad(index = 0) {
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const stoneIndex = Number.isFinite(index) ? index : 0;
      this.convoyTone(96 + (stoneIndex % 4) * 7, now, 0.16, 0.17, "sine", 58);
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      source.buffer = this.convoyNoiseBuffer(0.12);
      filter.type = "lowpass";
      filter.frequency.value = 380;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      this.trackConvoySource(source);
      source.start(now);
      source.stop(now + 0.13);
    } catch {
      /* 音效不可用时静默继续玩法 */
    }
  }

  convoyStoneUnload(index = 0) {
    if (this.muted) return;
    try {
      const now = this.getContext().currentTime;
      const stoneIndex = Number.isFinite(index) ? index : 0;
      const frequency = 610 + (stoneIndex % 4) * 45;
      this.convoyTone(frequency, now, 0.2, 0.09, "triangle", frequency * 0.72);
      this.convoyTone(frequency * 1.52, now + 0.025, 0.17, 0.045);
    } catch {
      /* 音效不可用时静默继续玩法 */
    }
  }

  startConvoyWheel(load: number) {
    const normalized = Math.max(0, Math.min(4, Number.isFinite(load) ? load : 0));
    this.wheelLoad = normalized;
    if (this.muted) return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const volume = 0.014 + normalized * 0.004;
      if (this.wheelLoop) {
        this.wheelLoop.tone.frequency.setTargetAtTime(112 + normalized * 31, now, 0.035);
        this.wheelLoop.toneGain.gain.setTargetAtTime(volume, now, 0.035);
        this.wheelLoop.load = normalized;
        return;
      }

      const tone = ctx.createOscillator();
      const toneGain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      const output = ctx.createGain();
      tone.type = "triangle";
      tone.frequency.value = 112 + normalized * 31;
      toneGain.gain.value = volume;
      lfo.type = "sine";
      lfo.frequency.value = 2.1 + normalized * 0.4;
      lfoDepth.gain.value = volume * 0.45;
      output.gain.value = 0.85;
      tone.connect(toneGain);
      toneGain.connect(output);
      lfo.connect(lfoDepth);
      lfoDepth.connect(toneGain.gain);
      output.connect(ctx.destination);
      this.wheelLoop = { sources: [tone, lfo], gain: output, tone, toneGain, load: normalized };
      this.trackConvoySource(tone);
      this.trackConvoySource(lfo);
      tone.start(now);
      lfo.start(now);
    } catch {
      this.stopConvoyLoop(this.wheelLoop);
      this.wheelLoop = null;
    }
  }

  stopConvoyWheel() {
    this.wheelLoad = null;
    this.stopConvoyLoop(this.wheelLoop);
    this.wheelLoop = null;
  }

  startConvoyWind() {
    this.windRequested = true;
    if (this.muted || this.windLoop) return;
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const lfo = ctx.createOscillator();
      const lfoDepth = ctx.createGain();
      source.buffer = this.convoyNoiseBuffer(2);
      source.loop = true;
      filter.type = "bandpass";
      filter.frequency.value = 620;
      filter.Q.value = 0.45;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.045, now + 0.35);
      lfo.frequency.value = 0.3;
      lfoDepth.gain.value = 0.018;
      source.connect(filter);
      filter.connect(gain);
      lfo.connect(lfoDepth);
      lfoDepth.connect(gain.gain);
      gain.connect(ctx.destination);
      this.windLoop = { sources: [source, lfo], gain };
      this.trackConvoySource(source);
      this.trackConvoySource(lfo);
      source.start(now);
      lfo.start(now);
    } catch {
      this.stopConvoyLoop(this.windLoop);
      this.windLoop = null;
    }
  }

  stopConvoyWind() {
    this.windRequested = false;
    this.stopConvoyLoop(this.windLoop);
    this.windLoop = null;
  }

  convoyTeaCup() {
    if (this.muted) return;
    try {
      const now = this.getContext().currentTime;
      this.convoyTone(1180, now, 0.12, 0.055, "sine", 940);
      this.convoyTone(1770, now + 0.045, 0.16, 0.035);
    } catch {
      /* 音效不可用时静默继续玩法 */
    }
  }

  convoyWindChime() {
    if (this.muted) return;
    try {
      const now = this.getContext().currentTime;
      [1320, 1760, 2140].forEach((frequency, index) => {
        this.convoyTone(frequency, now + index * 0.075, 0.72, 0.035, "sine", frequency * 0.985);
      });
    } catch {
      /* 音效不可用时静默继续玩法 */
    }
  }

  convoyBridgeBell() {
    if (this.muted) return;
    try {
      const now = this.getContext().currentTime;
      const base = 329.63;
      [1, 2.02, 2.76, 4.2].forEach((ratio, index) => {
        this.convoyTone(base * ratio, now + index * 0.018, 2.7 - index * 0.3, 0.12 / (index + 1));
      });
    } catch {
      /* 音效不可用时静默继续玩法 */
    }
  }

  stopConvoySounds() {
    this.wheelLoad = null;
    this.windRequested = false;
    this.stopConvoyNodes();
  }
}

export const soundManager = new SoundManager();

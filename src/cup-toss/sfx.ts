// Procedural WebAudio for the Loop Machine — zero audio assets.
// Soft ambient background pad (always on after the first gesture, no toggle)
// plus throw / impact / score / miss effects.

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private noiseBuf: AudioBuffer | null = null;
  private ambientOn = false;

  /** Create / resume the context. Must be called from a user gesture once. */
  unlock() {
    const ctx = this.ensure();
    if (ctx && ctx.state === "suspended") void ctx.resume();
    if (ctx) this.startAmbient();
  }

  private ensure(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      try {
        this.ctx = new AC();
      } catch {
        return null;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
      // pre-render a 1 s noise buffer
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    return this.ctx;
  }

  private noiseSource(ctx: AudioContext): AudioBufferSourceNode | null {
    if (!this.noiseBuf) return null;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    return src;
  }

  /** Soft background pad: a slowly breathing A-minor-ish chord, very quiet. */
  private startAmbient() {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.ambientOn) return;
    this.ambientOn = true;

    const bus = ctx.createGain();
    bus.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 640;
    lp.Q.value = 0.4;
    bus.connect(lp).connect(this.master);

    const voices: Array<[number, OscillatorType, number]> = [
      [110.0, "sine", 0.5], // A2
      [164.81, "sine", 0.36], // E3
      [220.0, "triangle", 0.2], // A3
      [261.63, "sine", 0.14], // C4
    ];
    for (const [freq, type, level] of voices) {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.004);
      const g = ctx.createGain();
      g.gain.value = level;
      osc.connect(g).connect(bus);
      osc.start();
    }

    // slow breathing LFO on the pad bus
    const lfo = ctx.createOscillator();
    lfo.type = "sine";
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(bus.gain);
    lfo.start();

    // faint room tone
    const room = this.noiseSource(ctx);
    if (room) {
      const rlp = ctx.createBiquadFilter();
      rlp.type = "lowpass";
      rlp.frequency.value = 380;
      const rg = ctx.createGain();
      rg.gain.value = 0.012;
      room.connect(rlp).connect(rg).connect(this.master);
      room.start();
    }
  }

  /** Whoosh on throw. power 0..1 scales brightness and level. */
  throwWhoosh(power = 1) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const src = this.noiseSource(ctx);
    if (!src) return;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.1;
    bp.frequency.setValueAtTime(320 + 240 * power, t);
    bp.frequency.exponentialRampToValueAtTime(1400 + 800 * power, t + 0.22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16 + 0.14 * power, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
    src.connect(bp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.38);
  }

  /** Thud / clack on impacts. strength 0..1. */
  impact(strength = 0.5) {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(150 + 60 * strength, t);
    osc.frequency.exponentialRampToValueAtTime(62, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.1 + 0.18 * strength, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.13);
    // paper click layer
    const src = this.noiseSource(ctx);
    if (!src) return;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 900 + 1400 * strength;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.08 + 0.12 * strength, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(lp).connect(ng).connect(this.master);
    src.start(t);
    src.stop(t + 0.08);
  }

  /** Score chime + paper drop. */
  score() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const master = this.master;
    const t = ctx.currentTime;
    const notes = [523.25, 783.99]; // C5, G5
    notes.forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f;
      const g = ctx.createGain();
      const st = t + i * 0.09;
      g.gain.setValueAtTime(0.0001, st);
      g.gain.exponentialRampToValueAtTime(0.2, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.5);
      osc.connect(g).connect(master);
      osc.start(st);
      osc.stop(st + 0.55);
    });
    // paper rattle drop
    const src = this.noiseSource(ctx);
    if (!src) return;
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1600;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.14, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.26);
    src.connect(hp).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + 0.28);
  }

  /** Soft descending blip on a miss. */
  miss() {
    const ctx = this.ensure();
    if (!ctx || !this.master) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(110, t + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.32);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  dispose() {
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }
}

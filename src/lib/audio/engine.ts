/**
 * The terminal's voice.
 *
 * Two layers, for two different jobs.
 *
 * **The bed** is a real music track (see `music.ts`), streamed from /public.
 * An earlier version synthesised the ambience too — mains hum and CRT hiss —
 * and it was simply bad: a synthesised room reads as a test signal, not as a
 * place. Music is the one part of this that a person has to have written.
 *
 * **The cues** stay synthesised, and should. They are interaction feedback —
 * a contact closing, a stamp landing, a lock engaging — not ambience. Building
 * them from oscillators means nothing extra to ship or license, and it means a
 * cue can take an intensity parameter, so the clock's beat genuinely tightens
 * as the deadline closes instead of cycling through three recorded variants.
 *
 * Audio is OFF until the player asks for it. Browsers require a gesture before
 * an AudioContext will produce sound anyway, so the context is not even built
 * until `enable()` is called from a real click — and a game that starts making
 * noise at someone who opened it in a shared office deserves to be closed.
 *
 * Nothing here throws. Web Audio is a progressive enhancement: if the context
 * cannot be created, every method quietly becomes a no-op and the game plays on
 * in silence.
 */

const STORAGE_KEY = "vice-evidence:sound";

/** Master ceiling. Deliberately conservative — this sits under a browser tab. */
const MASTER_GAIN = 0.42;

/**
 * The bed sits under the cues, not beside them: a click that confirms a
 * control has to cut through, so the music is mixed deliberately low and
 * slightly muffled until the deadline starts to bite.
 */
const MUSIC_GAIN_CALM = 0.34;
const MUSIC_GAIN_PEAK = 0.6;
const MUSIC_CUTOFF_CALM = 2200;
const MUSIC_CUTOFF_PEAK = 17000;

export type Cue =
  /** The rack coming alive, and going quiet again. */
  | "power-on"
  | "power-off"
  /** UI contact. */
  | "click"
  /** An alteration landed on the exhibit and the log noticed. */
  | "commit"
  /** One second gone. */
  | "tick"
  /** The deadline, felt rather than read. */
  | "heart"
  /** The turn: criminal terminal torn down, police software coming up. */
  | "submit"
  /** An analysis stage completed. */
  | "stage"
  /** Pixel recovery acquiring a region. */
  | "scan"
  /** A region resolved. This is bad news. */
  | "lock"
  /** A region yielded nothing. This is good news. */
  | "clear"
  /** The verdict lands. */
  | "stamp"
  /** Identification confirmed. */
  | "siren";

interface ToneOpts {
  type?: OscillatorType;
  freq: number;
  /** Glide to this frequency across the note. */
  to?: number;
  dur: number;
  peak: number;
  delay?: number;
  attack?: number;
  detune?: number;
  filter?: { type?: BiquadFilterType; freq: number; to?: number; q?: number };
}

interface NoiseOpts {
  dur: number;
  peak: number;
  delay?: number;
  filter?: { type?: BiquadFilterType; freq: number; to?: number; q?: number };
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private music: {
    el: HTMLAudioElement;
    gain: GainNode;
    filter: BiquadFilterNode;
  } | null = null;
  private on = false;
  private listeners = new Set<() => void>();

  /* ---------------------------------------------------------------- *
   * State — exposed through useSyncExternalStore
   * ---------------------------------------------------------------- */

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = () => this.on;

  /** The server has no opinion about sound; it is always off there. */
  getServerSnapshot = () => false;

  private emit() {
    for (const fn of this.listeners) fn();
  }

  /**
   * Whether the player asked for sound last time. Read once on mount so the
   * toggle can show the right state before anything is clicked — the context
   * itself still waits for a gesture.
   */
  static wasEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  async toggle(): Promise<void> {
    if (this.on) this.disable();
    else await this.enable();
  }

  /** Must be called from a user gesture, or the context stays suspended. */
  async enable(): Promise<void> {
    try {
      if (!this.ctx) {
        this.ctx = new AudioContext();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0;
        this.master.connect(this.ctx.destination);
        this.noiseBuffer = this.makeNoise(this.ctx);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      this.on = true;
      this.ramp(this.master!.gain, MASTER_GAIN, 0.25);
      // Answer the click. Without this the player turns sound on, hears
      // nothing until whatever they do next, and reasonably concludes it is
      // broken.
      this.cue("power-on");
      this.persist(true);
      this.emit();
    } catch {
      // No Web Audio, or the gesture was not trusted. Stay silent.
      this.on = false;
      this.emit();
    }
  }

  disable(): void {
    // Sounded before the flag drops, and short enough to finish inside the
    // fade — so muting is confirmed rather than just silent.
    this.cue("power-off");
    this.on = false;
    if (this.master) this.ramp(this.master.gain, 0, 0.18);
    this.pauseMusic();
    this.persist(false);
    this.emit();
  }

  private persist(value: boolean) {
    try {
      window.localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    } catch {
      /* Private mode. The preference simply does not survive the session. */
    }
  }

  /* ---------------------------------------------------------------- *
   * The bed
   * ---------------------------------------------------------------- */

  /**
   * Start (or resume) the music bed.
   *
   * Routed through an <audio> element rather than a decoded buffer: the track
   * is several megabytes, and an element streams it progressively instead of
   * stalling on a full decode. It is also only ever fetched once the player
   * has asked for sound, so a silent playthrough costs nothing at all.
   */
  startMusic(src: string): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;

    if (this.music) {
      void this.music.el.play().catch(() => {});
      return;
    }

    const el = new Audio(src);
    el.loop = true;
    el.preload = "auto";

    // Same-origin, so createMediaElementSource gets real samples rather than
    // the silence a tainted cross-origin stream would produce.
    const source = ctx.createMediaElementSource(el);
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = MUSIC_CUTOFF_CALM;
    const gain = ctx.createGain();
    gain.gain.value = MUSIC_GAIN_CALM;
    source.connect(filter).connect(gain).connect(this.master);

    // Autoplay is only permitted because enable() ran inside a gesture. If the
    // browser refuses anyway, the cues still work and the game is still playable.
    void el.play().catch(() => {});
    this.music = { el, gain, filter };
  }

  /** Stop the stream. Muting alone would keep it downloading and decoding. */
  pauseMusic(): void {
    this.music?.el.pause();
  }

  /**
   * 0 = the room as it opens, 1 = the walls closing in.
   *
   * Drives the bed rather than a second track: the filter opens and the level
   * lifts, so the music comes into focus as the deadline closes. One track,
   * four stages, and no crossfade to get wrong.
   */
  setTension(t: number): void {
    if (!this.ctx || !this.music) return;
    const v = Math.max(0, Math.min(1, t));
    this.ramp(
      this.music.filter.frequency,
      MUSIC_CUTOFF_CALM + v * (MUSIC_CUTOFF_PEAK - MUSIC_CUTOFF_CALM),
      0.8
    );
    this.ramp(
      this.music.gain.gain,
      MUSIC_GAIN_CALM + v * (MUSIC_GAIN_PEAK - MUSIC_GAIN_CALM),
      0.8
    );
  }

  /* ---------------------------------------------------------------- *
   * Cues
   * ---------------------------------------------------------------- */

  cue(name: Cue, intensity = 0): void {
    if (!this.on || !this.ctx) return;
    const i = Math.max(0, Math.min(1, intensity));
    switch (name) {
      case "power-on":
        this.tone({ type: "sine", freq: 330, dur: 0.1, peak: 0.14 });
        this.tone({ type: "sine", freq: 495, dur: 0.1, peak: 0.11, delay: 0.06 });
        this.tone({ type: "sine", freq: 660, dur: 0.22, peak: 0.13, delay: 0.12 });
        this.noise({ dur: 0.3, peak: 0.1, filter: { type: "bandpass", freq: 700, to: 4200, q: 0.9 } });
        break;

      case "power-off":
        this.tone({ type: "sine", freq: 520, to: 200, dur: 0.13, peak: 0.16 });
        break;

      case "click":
        this.noise({ dur: 0.035, peak: 0.3, filter: { type: "bandpass", freq: 2400, q: 1.2 } });
        this.tone({ type: "square", freq: 880, dur: 0.03, peak: 0.05 });
        break;

      case "commit":
        // Two falling notes: something was changed, and the system logged it.
        this.tone({ type: "sine", freq: 720, to: 520, dur: 0.09, peak: 0.16 });
        this.tone({ type: "sine", freq: 480, to: 360, dur: 0.11, peak: 0.1, delay: 0.06 });
        break;

      case "tick":
        // Tightens and rises with the stage — one cue, four characters.
        this.tone({
          type: "square",
          freq: 900 + i * 700,
          dur: 0.022 + i * 0.01,
          peak: 0.045 + i * 0.09,
          filter: { type: "bandpass", freq: 1800 + i * 1400, q: 3 },
        });
        break;

      case "heart":
        // Systole then diastole. The gap is what makes it read as a heart
        // rather than as two beeps.
        this.tone({ type: "sine", freq: 66, to: 40, dur: 0.16, peak: 0.34 + i * 0.2 });
        this.tone({
          type: "sine",
          freq: 58,
          to: 36,
          dur: 0.2,
          peak: 0.24 + i * 0.16,
          delay: 0.17 - i * 0.04,
        });
        break;

      case "submit":
        // The turn. Everything the player built falls away, then the police
        // machine lands on top of it.
        this.noise({ dur: 0.5, peak: 0.3, filter: { type: "lowpass", freq: 6000, to: 300 } });
        this.tone({
          type: "sawtooth",
          freq: 420,
          to: 42,
          dur: 0.72,
          peak: 0.2,
          filter: { type: "lowpass", freq: 2400, to: 220, q: 4 },
        });
        this.tone({ type: "sine", freq: 90, to: 44, dur: 0.5, peak: 0.4, delay: 0.6 });
        this.noise({ dur: 0.3, peak: 0.34, delay: 0.6, filter: { type: "lowpass", freq: 1400 } });
        break;

      case "stage":
        this.tone({ type: "triangle", freq: 1120, dur: 0.05, peak: 0.12 });
        this.tone({ type: "triangle", freq: 1680, dur: 0.04, peak: 0.05, delay: 0.03 });
        break;

      case "scan":
        // The lens finding focus.
        this.tone({
          type: "sine",
          freq: 220,
          to: 940,
          dur: 0.42,
          peak: 0.1,
          filter: { type: "bandpass", freq: 900, to: 2600, q: 2 },
        });
        break;

      case "lock":
        // A region resolved. Mechanical, final, and a semitone of dread under it.
        this.noise({ dur: 0.06, peak: 0.38, filter: { type: "highpass", freq: 1800 } });
        this.tone({ type: "square", freq: 210, to: 130, dur: 0.16, peak: 0.2, filter: { type: "lowpass", freq: 1500 } });
        this.tone({ type: "sine", freq: 70, dur: 0.3, peak: 0.3, delay: 0.02 });
        break;

      case "clear":
        // Nothing recoverable. Two notes up, and the relief is the point.
        this.tone({ type: "sine", freq: 540, dur: 0.1, peak: 0.14 });
        this.tone({ type: "sine", freq: 810, dur: 0.18, peak: 0.12, delay: 0.08 });
        break;

      case "stamp":
        this.noise({ dur: 0.09, peak: 0.5, filter: { type: "bandpass", freq: 900, q: 0.8 } });
        this.tone({ type: "sine", freq: 120, to: 38, dur: 0.4, peak: 0.55 });
        break;

      case "siren":
        // Two-tone wail. Four alternations is enough to land as a siren and
        // short enough not to become a joke.
        for (let n = 0; n < 4; n++) {
          this.tone({
            type: "sawtooth",
            freq: n % 2 === 0 ? 620 : 840,
            dur: 0.34,
            peak: 0.13,
            delay: n * 0.32,
            filter: { type: "lowpass", freq: 1500, q: 6 },
          });
        }
        break;
    }
  }

  /* ---------------------------------------------------------------- *
   * Synthesis primitives
   * ---------------------------------------------------------------- */

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  private ramp(param: AudioParam, to: number, seconds: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    param.cancelScheduledValues(ctx.currentTime);
    param.setValueAtTime(param.value, ctx.currentTime);
    param.linearRampToValueAtTime(to, ctx.currentTime + seconds);
  }

  /**
   * One note.
   *
   * The envelope is a fast attack into an exponential decay, which is what
   * makes every cue read as a physical event — a contact closing, a stamp
   * landing — rather than as a tone being switched on.
   */
  private tone(o: ToneOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const osc = ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.to), t0 + o.dur);
    }
    if (o.detune) osc.detune.value = o.detune;

    const gain = ctx.createGain();
    const attack = o.attack ?? 0.004;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    this.chain(osc, gain, o.filter, t0, o.dur);
    osc.start(t0);
    osc.stop(t0 + o.dur + 0.05);
  }

  /** One burst of filtered noise — transients, hits, air. */
  private noise(o: NoiseOpts) {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t0 = ctx.currentTime + (o.delay ?? 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(o.peak, t0 + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);

    this.chain(src, gain, o.filter, t0, o.dur);
    src.start(t0);
    src.stop(t0 + o.dur + 0.05);
  }

  /** source → [filter] → gain → master, with an optional filter sweep. */
  private chain(
    source: AudioNode,
    gain: GainNode,
    filter: ToneOpts["filter"],
    t0: number,
    dur: number
  ) {
    if (filter) {
      const biquad = this.ctx!.createBiquadFilter();
      biquad.type = filter.type ?? "lowpass";
      biquad.frequency.setValueAtTime(filter.freq, t0);
      if (filter.to !== undefined) {
        biquad.frequency.exponentialRampToValueAtTime(
          Math.max(1, filter.to),
          t0 + dur
        );
      }
      if (filter.q !== undefined) biquad.Q.value = filter.q;
      source.connect(biquad).connect(gain);
    } else {
      source.connect(gain);
    }
    gain.connect(this.master!);
  }
}

/** One engine for the app. The browser only gives us so many AudioContexts. */
export const audio = new AudioEngine();
export { AudioEngine };

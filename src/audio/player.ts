import { getAudioSettings } from "../settings/preferences";
import { soundDefinitions, synthesizeSound, type SoundId } from "./sounds";
import { BattleMusic, type MusicTrack } from "./music";

interface PlayingVoice {
  id: SoundId;
  source: AudioBufferSourceNode;
  gain: GainNode;
  pan?: StereoPannerNode;
}

export const MAX_AUDIO_VOICES = 8;

export class SoundPlayer {
  private context?: AudioContext;
  private master?: GainNode;
  private channels?: Record<"ui" | "battle", GainNode>;
  private compressor?: DynamicsCompressorNode;
  private resumePending?: Promise<void>;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  private readonly voices = new Set<PlayingVoice>();
  private readonly lastPlayed = new Map<SoundId, number>();
  private destroyed = false;
  private readonly music = new BattleMusic();

  async unlock() {
    if (this.destroyed || document.hidden) return;
    try {
      if (!this.context) {
        if (typeof AudioContext === "undefined") return;
        const context = this.context = new AudioContext({ latencyHint: "interactive" });
        this.master = context.createGain();
        this.channels = { ui: context.createGain(), battle: context.createGain() };
        for (const channel of Object.values(this.channels)) channel.connect(this.master);
        this.compressor = context.createDynamicsCompressor();
        this.compressor.threshold.value = -18;
        this.compressor.knee.value = 12;
        this.compressor.ratio.value = 4;
        this.compressor.attack.value = .006;
        this.compressor.release.value = .12;
        this.master.connect(this.compressor).connect(context.destination);
        this.applySettings(true);
      }
      if (this.context.state === "suspended" && !this.resumePending) {
        this.resumePending = this.context.resume().catch(() => {}).finally(() => { this.resumePending = undefined; });
      }
      await this.resumePending;
      this.refreshMusic();
    } catch {
      // Audio failure must never interrupt menus or the deterministic simulation.
    }
  }

  play(id: SoundId, position?: number) {
    const context = this.context;
    const settings = getAudioSettings(), definition = soundDefinitions[id];
    if (this.destroyed || !context || !this.channels || context.state !== "running" || document.hidden ||
        settings.muted || settings.master === 0 || settings[definition.channel] === 0) return false;
    const now = performance.now();
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < definition.cooldown) return false;
    if ([...this.voices].filter(voice => voice.id === id).length >= 2) return false;
    if (this.voices.size >= MAX_AUDIO_VOICES) {
      let victim: PlayingVoice | undefined;
      for (const voice of this.voices) {
        if (!victim || soundDefinitions[voice.id].priority < soundDefinitions[victim.id].priority) victim = voice;
      }
      if (!victim || soundDefinitions[victim.id].priority >= definition.priority) return false;
      this.release(victim, true);
    }
    let voice: PlayingVoice | undefined;
    try {
      this.applySettings();
      let buffer = this.buffers.get(id);
      if (!buffer) {
        const samples = synthesizeSound(id);
        buffer = context.createBuffer(1, samples.length, 22050);
        buffer.copyToChannel(samples, 0);
        this.buffers.set(id, buffer);
      }
      const source = context.createBufferSource(), gain = context.createGain();
      voice = { id, source, gain };
      source.buffer = buffer;
      source.connect(gain);
      if (position !== undefined && typeof context.createStereoPanner === "function") {
        voice.pan = context.createStereoPanner();
        voice.pan.pan.value = Math.max(-.65, Math.min(.65, position));
        gain.connect(voice.pan).connect(this.channels[definition.channel]);
      } else gain.connect(this.channels[definition.channel]);
      this.voices.add(voice);
      const activeVoice = voice;
      source.onended = () => this.release(activeVoice);
      source.start();
      this.lastPlayed.set(id, now);
      return true;
    } catch {
      if (voice) this.release(voice, true);
      return false;
    }
  }

  applySettings(immediate = false) {
    if (!this.context || !this.master || !this.channels) return;
    const settings = getAudioSettings(), time = this.context.currentTime;
    for (const [node, value] of [[this.master, settings.muted ? 0 : settings.master],
      [this.channels.ui, settings.ui], [this.channels.battle, settings.battle]] as const) {
      node.gain.cancelScheduledValues(time);
      if (immediate) node.gain.setValueAtTime(value, time);
      else node.gain.setTargetAtTime(value, time, .015);
    }
    this.music.setVolume(settings.music);
  }

  setMusic(track?: MusicTrack) {
    if (this.destroyed) return;
    this.music.setTrack(track);
    this.refreshMusic();
  }

  pauseMusic(paused: boolean) {
    this.music.setPaused(paused);
    this.refreshMusic();
  }

  private refreshMusic() {
    if (!this.context || !this.master || this.destroyed) return;
    try {
      this.music.connect(this.context, this.master);
      this.music.setVolume(getAudioSettings().music);
      this.music.sync();
    } catch { /* Music decoding or device failure must not interrupt play. */ }
  }

  stop(channel?: "ui" | "battle") {
    for (const voice of this.voices) {
      if (!channel || soundDefinitions[voice.id].channel === channel) this.release(voice, true);
    }
  }

  async suspend() {
    this.stop();
    this.music.stopPlayback();
    try { await this.context?.suspend(); } catch { /* A closed or unavailable audio device is harmless. */ }
  }

  destroy() {
    this.destroyed = true;
    this.music.destroy();
    this.stop();
    this.buffers.clear();
    this.lastPlayed.clear();
    for (const node of Object.values(this.channels ?? {})) node.disconnect();
    this.master?.disconnect();
    this.compressor?.disconnect();
    void this.context?.close().catch(() => {});
  }

  private release(voice: PlayingVoice, stop = false) {
    voice.source.onended = null;
    if (stop) { try { voice.source.stop(); } catch { /* Already ended. */ } }
    voice.source.disconnect(); voice.gain.disconnect(); voice.pan?.disconnect();
    this.voices.delete(voice);
  }
}

export const soundPlayer = new SoundPlayer();
export function playSound(id: SoundId, position?: number) { return soundPlayer.play(id, position); }

/** Shared by canvas and DOM menus. No audio context is created before a user gesture. */
export function installAudio() {
  let activated = false;
  const unlock = () => { activated = true; void soundPlayer.unlock(); };
  const resume = () => { if (activated) void soundPlayer.unlock(); };
  const key = (event: KeyboardEvent) => { if (!event.repeat) unlock(); };
  const domClick = (event: MouseEvent) => {
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    if (button && !button.disabled) playSound("ui");
  };
  const visibility = () => { if (document.hidden) void soundPlayer.suspend(); else resume(); };
  const blur = () => { void soundPlayer.suspend(); };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", key, true);
  document.addEventListener("click", domClick, true);
  document.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", resume);
  return () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", key, true);
    document.removeEventListener("click", domClick, true);
    document.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", resume);
    soundPlayer.destroy();
  };
}

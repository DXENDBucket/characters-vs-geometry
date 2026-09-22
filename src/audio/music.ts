export const musicTracks = {
  battle: "audio/circular-battle.mp3",
  boss: "audio/cubic-warning.mp3"
} as const;
export type MusicTrack = keyof typeof musicTracks;

/** Stream long tracks instead of decoding the entire soundtrack into PCM memory. */
export class BattleMusic {
  private track?: MusicTrack;
  private element?: HTMLAudioElement;
  private source?: MediaElementAudioSourceNode;
  private gain?: GainNode;
  private context?: AudioContext;
  private paused = false;

  setTrack(track?: MusicTrack) {
    if (track === this.track) return;
    this.track = track;
    this.stopPlayback();
    if (this.element) {
      if (track) this.element.src = new URL(musicTracks[track], document.baseURI).href;
      else this.element.removeAttribute("src");
      this.element.load();
    }
  }

  connect(context: AudioContext, output: AudioNode) {
    if (this.gain || !this.track) return;
    this.context = context;
    this.element = new Audio(new URL(musicTracks[this.track], document.baseURI).href);
    this.element.loop = true;
    this.element.preload = "auto";
    this.source = context.createMediaElementSource(this.element);
    this.gain = context.createGain();
    this.gain.gain.value = 0;
    this.source.connect(this.gain).connect(output);
  }

  setVolume(value: number) {
    if (!this.gain || !this.context) return;
    const time = this.context.currentTime;
    this.gain.gain.cancelScheduledValues(time);
    this.gain.gain.setTargetAtTime(value, time, .08);
  }

  setPaused(paused: boolean) { this.paused = paused; }

  sync() {
    if (!this.element) return;
    if (!this.track || this.paused || document.hidden || this.context?.state !== "running") {
      this.stopPlayback();
    } else if (this.element.paused) {
      void this.element.play().catch(() => { /* Retry on the next user gesture if autoplay was blocked. */ });
    }
  }

  stopPlayback() { this.element?.pause(); }

  destroy() {
    this.stopPlayback();
    if (this.element) { this.element.removeAttribute("src"); this.element.load(); }
    this.source?.disconnect(); this.gain?.disconnect();
    this.element = undefined; this.source = undefined; this.gain = undefined;
  }
}

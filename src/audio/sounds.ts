interface Voice {
  hz: number;
  endHz?: number;
  duration: number;
  delay?: number;
  gain: number;
  tone?: "soft" | "noise";
}
interface SoundDefinition {
  channel: "ui" | "battle";
  cooldown: number;
  priority: number;
  voices: readonly Voice[];
}

export const soundDefinitions = {
  ui: { channel: "ui", cooldown: 65, priority: 1, voices: [{ hz: 880, endHz: 620, duration: .055, gain: .18 }] },
  deploy: { channel: "battle", cooldown: 90, priority: 2, voices: [
    { hz: 250, endHz: 420, duration: .13, gain: .24, tone: "soft" }, { hz: 840, duration: .08, delay: .025, gain: .1 }] },
  upgrade: { channel: "battle", cooldown: 180, priority: 1, voices: [
    { hz: 523.25, duration: .11, gain: .16 }, { hz: 783.99, duration: .15, delay: .07, gain: .18 }] },
  erase: { channel: "battle", cooldown: 100, priority: 1, voices: [
    { hz: 0, duration: .16, gain: .18, tone: "noise" }, { hz: 300, endHz: 120, duration: .12, gain: .12 }] },
  move: { channel: "battle", cooldown: 160, priority: 2, voices: [
    { hz: 220, endHz: 660, duration: .14, gain: .18 }, { hz: 440, duration: .08, delay: .12, gain: .16 }] },
  wave: { channel: "battle", cooldown: 700, priority: 2, voices: [
    { hz: 392, duration: .14, gain: .14 }, { hz: 523.25, duration: .18, delay: .11, gain: .14 }] },
  flag: { channel: "battle", cooldown: 900, priority: 3, voices: [
    { hz: 196, duration: .25, gain: .22, tone: "soft" }, { hz: 293.66, duration: .24, delay: .12, gain: .2 },
    { hz: 392, duration: .3, delay: .24, gain: .18 }] },
  breach: { channel: "battle", cooldown: 400, priority: 4, voices: [
    { hz: 330, endHz: 160, duration: .19, gain: .26, tone: "soft" },
    { hz: 330, endHz: 160, duration: .22, delay: .2, gain: .22, tone: "soft" }] },
  victory: { channel: "battle", cooldown: 1200, priority: 5, voices: [
    { hz: 523.25, duration: .26, gain: .2 }, { hz: 659.25, duration: .26, delay: .12, gain: .2 },
    { hz: 783.99, duration: .42, delay: .24, gain: .18 }, { hz: 523.25, duration: .4, delay: .26, gain: .12 }] },
  defeat: { channel: "battle", cooldown: 1200, priority: 5, voices: [
    { hz: 293.66, duration: .26, gain: .22, tone: "soft" }, { hz: 220, duration: .28, delay: .18, gain: .2 },
    { hz: 146.83, duration: .38, delay: .36, gain: .24, tone: "soft" }] }
} as const satisfies Record<string, SoundDefinition>;

export type SoundId = keyof typeof soundDefinitions;

/** Cached mono PCM, with an independent noise seed and click-free attack/release envelopes. */
export function synthesizeSound(id: SoundId, sampleRate = 22050): Float32Array<ArrayBuffer> {
  const voices: readonly Voice[] = soundDefinitions[id].voices;
  const duration = Math.max(...voices.map(v => (v.delay ?? 0) + v.duration));
  const samples = new Float32Array(Math.ceil(duration * sampleRate) + 1);
  let noiseSeed = 0x43535254;
  for (const voice of voices) {
    const start = Math.round((voice.delay ?? 0) * sampleRate), count = Math.floor(voice.duration * sampleRate);
    let phase = 0, noise = 0;
    for (let i = 0; i < count; i++) {
      const ratio = i / count, elapsed = i / sampleRate;
      phase += 2 * Math.PI * (voice.hz + ((voice.endHz ?? voice.hz) - voice.hz) * ratio) / sampleRate;
      const envelope = Math.min(1, elapsed / .006) * Math.pow(1 - ratio, 1.7) * Math.min(1, (count - i - 1) / (sampleRate * .012));
      let value = Math.sin(phase);
      if (voice.tone === "soft") value = (value + .16 * Math.sin(3 * phase)) / 1.16;
      if (voice.tone === "noise") {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        noise += .3 * ((noiseSeed / 0x100000000 * 2 - 1) - noise);
        value = noise;
      }
      samples[start + i] += value * envelope * voice.gain;
    }
  }
  return samples;
}

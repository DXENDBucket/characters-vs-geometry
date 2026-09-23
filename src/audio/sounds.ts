interface Voice {
  hz: number;
  endHz?: number;
  duration: number;
  delay?: number;
  gain: number;
  tone?: "soft" | "noise" | "clack";
  attack?: number;
  release?: number;
}
interface SoundDefinition {
  channel: "ui" | "battle";
  cooldown: number;
  priority: number;
  voices: readonly Voice[];
}

export const soundDefinitions = {
  ui: { channel: "ui", cooldown: 65, priority: 1, voices: [
    { hz: 0, duration: .009, gain: .5, tone: "clack", attack: .0003, release: .0015 },
    { hz: 330, duration: .03, gain: .085, tone: "soft", attack: .0005, release: .004 },
    { hz: 0, duration: .007, delay: .013, gain: .16, tone: "clack", attack: .0003, release: .0015 }] },
  deploy: { channel: "battle", cooldown: 90, priority: 2, voices: [
    { hz: 0, duration: .012, gain: .5, tone: "clack", attack: .0003, release: .002 },
    { hz: 165, duration: .045, gain: .17, tone: "soft", attack: .0005, release: .005 },
    { hz: 0, duration: .008, delay: .018, gain: .2, tone: "clack", attack: .0003, release: .002 }] },
  upgrade: { channel: "battle", cooldown: 250, priority: 1, voices: [
    { hz: 523.25, duration: .11, gain: .04 }, { hz: 783.99, duration: .15, delay: .07, gain: .045 }] },
  erase: { channel: "battle", cooldown: 100, priority: 1, voices: [
    { hz: 0, duration: .16, gain: .18, tone: "noise" }, { hz: 300, endHz: 120, duration: .12, gain: .12 }] },
  move: { channel: "battle", cooldown: 160, priority: 2, voices: [
    { hz: 220, endHz: 660, duration: .14, gain: .18 }, { hz: 440, duration: .08, delay: .12, gain: .16 }] },
  ionImpact: { channel: "battle", cooldown: 140, priority: 3, voices: [
    { hz: 130, endHz: 45, duration: .3, gain: .38, tone: "soft", attack: .002 },
    { hz: 1450, endHz: 240, duration: .14, gain: .16, attack: .001 },
    { hz: 0, duration: .12, gain: .28, tone: "noise", attack: .001 },
    { hz: 380, endHz: 90, duration: .22, delay: .045, gain: .09 }] },
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
      const envelope = Math.min(1, elapsed / (voice.attack ?? .006)) * Math.pow(1 - ratio, 1.7) *
        Math.min(1, (count - i - 1) / (sampleRate * (voice.release ?? .012)));
      let value = Math.sin(phase);
      if (voice.tone === "soft") value = (value + .16 * Math.sin(3 * phase)) / 1.16;
      if (voice.tone === "noise" || voice.tone === "clack") {
        noiseSeed = (Math.imul(noiseSeed, 1664525) + 1013904223) >>> 0;
        const white = noiseSeed / 0x100000000 * 2 - 1;
        noise += .3 * (white - noise);
        value = voice.tone === "clack" ? white - noise : noise;
      }
      samples[start + i] += value * envelope * voice.gain;
    }
  }
  return samples;
}

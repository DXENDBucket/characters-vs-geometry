# Audio

- `sounds.ts`: short synthesized cues; mono PCM is generated once per cue and cached.
- `player.ts`: one lazily unlocked Web Audio context, channel gains, rate limits, an eight-voice cap, and device/background lifecycle handling.
- `music.ts`: one looping media element streamed through the same master output. Tracks are not decoded into large in-memory buffers.
- `battleAudio.ts`: scene lifecycle binding, separate from deterministic battle state and replay/save data. Game speed does not affect music pitch or tempo.
- Preferences persist in the existing settings store and are included in save export/import.

## Music

The user supplied both source files. They are copied into `public/audio` and included by the normal Vite build, including desktop builds:

| Use | Track | Asset |
| --- | --- | --- |
| Regular battles and tutorials | Circular Battle | `audio/circular-battle.mp3` |
| Boss battles, including Boss Endless | Cubic Warning | `audio/cubic-warning.mp3` |

Default music gain is 16%, further multiplied by the 50% master gain. Pausing a battle or opening a battle menu pauses playback; resuming continues at the same position. Ending or leaving a battle clears its track. Backgrounding suspends both music and effects.

## Checks

Run `npm run test:audio` for PCM, settings, and archive checks. With Vite running, run `node scripts/test-audio-browser.mjs` for actual Web Audio output, throttling/cleanup, music loading and pause/resume, settings interactions, and screenshots. The browser script accepts `--playwright`, `--browser`, and `--url` like the other browser tests.

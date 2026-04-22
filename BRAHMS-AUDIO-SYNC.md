# Brahms Audio Sync — Project Notes

## Overview

We're building a practice tool that syncs a YouTube video with a local high-quality audio file, so cellists can slow down playback without the distortion that YouTube's native speed control introduces.

**john.learndoteach.org is the testground.** Once the approach is proven here, we'll deploy it to wso.learndoteach.org for the full orchestra.

## Live Pages

- **Test page**: [john.learndoteach.org/brahms2.html](https://john.learndoteach.org/brahms2.html)
- **Main site**: [john.learndoteach.org](https://john.learndoteach.org)

## The Problem

YouTube's built-in speed control distorts audio at slow playback rates — unusable for serious musical practice. The browser's native `preservesPitch` on HTML5 `<audio>` is better but still produces noticeable artifacts on sustained tones (cello, strings).

## The Solution: Tone.js GrainPlayer

`brahms2.html` is a test page that pairs a YouTube video (Brahms — Variations on a Theme of Haydn, Op. 56, video ID `QmQLb5SZb4E`) with a locally hosted MP3 of the same recording.

## Sync Architecture (v2 — PLL)

The sync engine was rebuilt after extensive debugging and two external code reviews (Gemini). The v1 architecture had fundamental flaws: wall-clock position tracking that ignored rate nudges, creating feedback oscillation; hard drift correction (stop/restart) that caused audible stutter; and `setInterval(100)` polling that was too coarse.

### How it works now

1. **YouTube video** plays as the visual/timing master (mutable audio)
2. **Tone.js GrainPlayer** plays the local audio file using granular synthesis — 0.5s grains, 0.3s overlap, pitch preserved at any speed
3. **PLL (Phase-Locked Loop) sync engine** keeps the two in lockstep:
   - YouTube is the sole clock source — we never derive position independently
   - `requestAnimationFrame` polls YouTube's `getCurrentTime()` every frame (~16ms)
   - **PLL micro-nudges**: when drift exceeds the 15ms deadzone, the grain player's rate is adjusted by ±0.001 (imperceptible) to gently close the gap
   - **Hard re-sync**: when drift exceeds 150ms (emergency), the grain player is stopped and restarted at YouTube's current position
   - **Debounce**: after a PLAYING state transition, sync checks are skipped for 200ms to let YouTube's `getCurrentTime()` settle
   - **BUFFERING handling**: grain player stops immediately when YouTube enters BUFFERING state, preventing it from running ahead
   - At loop boundaries, grain is stopped before seeking to prevent blips

### PLL Tuning Constants (v2.7)

| Constant | Value | Purpose |
|----------|-------|---------|
| `PLL_GAIN` | 0.05 | Proportional gain: nudge = drift × gain |
| `PLL_MAX_NUDGE` | 0.01 | Max rate adjustment cap (imperceptible) |
| `PLL_DEADZONE` | 15ms | Below this drift, no correction needed |
| `PLL_HARD_RESYNC` | 150ms | Above this drift, stop/restart grain |
| `DEBOUNCE_MS` | 200ms | Wait after PLAYING before trusting sync |
| `LATENCY_OFFSET` | 0 | Compensate for YouTube IPC lag (tune by ear) |

The proportional nudge replaced the fixed ±0.001 from v2.0. At 100ms drift the nudge is 0.005 (corrects at 5ms/sec, converges in ~20s). At 50ms drift, 0.0025 (converges in ~20s). The fixed nudge took 100s to converge from 100ms — too slow.

### What triggers a hard re-sync (stop + restart grain)

- `onStateChange` → PLAYING (initial sync after any play/seek/buffer)
- `onPlaybackRateChange` (YouTube clamped to a supported rate)
- Speed slider change
- Loop boundary seek
- Drift exceeding 150ms (emergency)
- YouTube native loop wrap-around (detected when `ytTime` jumps backward by >1s)

## Key Files

| File | Purpose |
|------|---------|
| `brahms2.html` | Test page — YouTube + local audio sync with Tone.js PLL |
| `brahms.mp3` | Full Brahms recording from YouTube (320kbps, 44.1kHz, no processing) |
| `songs.json` | Data-driven song/loop config for the main site |
| `song.html` | Unified template (handles both MP3-only and YouTube-video songs) |
| `song.css` | Shared styles for all song/practice pages |

## Audio Source

The local MP3 is extracted from the same YouTube video using [yout.com](https://yout.com) (paid subscription) with **all processing disabled**:

- Remove silence — OFF
- Normalize — OFF
- Discover MetaData — OFF
- Format: MP3, 320 kbit/s (Highest)

This ensures the audio timeline matches the YouTube video exactly (offset = 0).

## Resolved Issues (v1 → v2)

### Wall-clock position tracking feedback bug
**v1**: Tracked grain position via `elapsed = (Tone.now() - startWall) * playbackRate`. When soft drift correction nudged the actual `grainPlayer.playbackRate`, the tracker still used the un-nudged rate, creating feedback oscillation — the correction made tracking less accurate, which triggered more correction.
**v2**: `estimateGrainPosition()` now uses `currentAppliedRate` (the actual rate including nudges). But this is only used for drift measurement — YouTube is the source of truth, not the estimate.

### Hard drift correction stutter
**v1**: Stopped and restarted the grain player whenever drift exceeded 0.3s. This caused an audible click/stutter at regular intervals.
**v2**: PLL micro-nudges (±0.001) are imperceptible. Hard re-sync only happens at 150ms drift (emergency) or on state changes where a restart is already expected.

### Speed change desync
**v1**: `grainSetRate()` captured position after updating the rate variable, returning wrong position.
**v2**: Speed changes trigger a full hard re-sync from YouTube's current time — no position math needed.

### Browser slider restoration
**v1**: Browser restored old slider value on refresh but JS initialized rate to 1.
**v2**: Slider reset on load now resets both `targetRate` and `currentAppliedRate`.

### Missing BUFFERING state handling
**v1**: Grain player kept running while YouTube was buffering, causing desync.
**v2**: `onStateChange` BUFFERING stops the grain player immediately.

### Coarse polling interval
**v1**: `setInterval(checkSync, 100)` — 100ms between checks.
**v2**: `requestAnimationFrame` — ~16ms between checks, smoother correction.

### Silent start on late seek (v2.1 fix)
Seeking near the end of the recording could pass an offset past the buffer duration to `grainPlayer.start()`, causing silence. Fixed by clamping to `buffer.duration - 0.1`.

### Grain splice artifacts on hard re-sync (v2.1 fix)
Calling `stop()` and `start()` in the same execution block could leave stale grains in the AudioContext. Fixed by using a 50ms look-ahead (`Tone.now() + 0.05`) on the start time, giving the context a moment to clear.

### Cold-start silence bug (v2.7 fix)
**Root cause**: Calling `grainPlayer.stop()` on a GrainPlayer that has never been started corrupts its internal scheduling state (likely the `_tick` or `_active` flags in Tone.js's Source class). The subsequent `.start()` silently fails — no audio output, no error.
**How it manifested**: First click of "loop section" or "play piece" after page load always produced silence. Stopping and clicking again worked because by then the GrainPlayer had been through a full start/stop cycle and its internals were initialized.
**Diagnosis**: Added visible diagnostic logging, which confirmed the code was executing correctly (right position, right rate, buffer loaded, AudioContext running) — the bug was below our code, in the Tone.js lifecycle.
**Fix**: Gate all `grainPlayer.stop()` calls behind `if (grainIsPlaying)`. The first `grainHardSync` call now goes straight to `.start()` without a preceding `.stop()`, preserving the GrainPlayer's initial state.
**Confirmed by**: Gemini review 7 validated the diagnosis and the fix approach.

## External Code Reviews (Gemini)

Three reviews were conducted. Key findings and their disposition:

### Review 1 — Master-slave polling
Recommended polling YouTube's `getCurrentTime()` as the master clock instead of wall-clock tracking. **Adopted** — this became the v2 architecture.

### Review 2 — PLL pressure test
Confirmed that "no continuous correction" would fail over 150s loops (~150ms drift from AudioContext clock variance). Recommended PLL micro-nudges of ±0.001. **Adopted** — this is the core of v2's drift correction.

### Review 3 — v2 code review
Validated the architecture. Raised three actionable issues:
1. **Buffer boundary check**: offset past buffer duration causes silence. **Fixed** in v2.1 — clamped to `buffer.duration - 0.1`.
2. **Grain splice artifacts**: `stop()`/`start()` in same block leaves stale grains. **Fixed** in v2.1 — 50ms look-ahead on start time.
3. **Background tab sync**: rAF throttles when tab is backgrounded. **Accepted risk** — PLL self-corrects on first frame when tab returns (hard resync if drift > 150ms). No Worker needed for a practice tool.

Also noted: rAF polling at 60Hz is redundant given YouTube API's ~200ms internal update frequency. True, but the overhead is negligible and it simplifies the code vs. a separate timer.

### Review 4 — v2.1 pressure test
Confirmed fixes were valid. Raised four new issues:
1. **Fixed nudge too slow**: ±0.001 corrects at 1ms/sec — 100ms drift takes 100s to converge. **Fixed** in v2.2 — proportional nudge: `clamp(drift × 0.05, ±0.01)`. Now converges in ~20s from 100ms.
2. **Frame-rate dependency**: Concern that nudge applied per-frame would correct faster on 144Hz than 60Hz. **Not a real issue** — the nudge sets a rate, not an additive per-frame correction. The grain player runs at `targetRate ± nudge` continuously regardless of check frequency.
3. **Buffer loaded guard**: `buffer.duration` could be 0 if accessed before load completes. **Fixed** in v2.2 — added `!grainPlayer.buffer.loaded` check to `grainHardSync`.
4. **YouTube IPC latency**: `getCurrentTime()` lags actual playback by ~50-150ms due to iframe IPC. **Fixed** in v2.2 — added `LATENCY_OFFSET` constant (default 0, tune by ear).
5. **YouTube native loop wrap-around**: No `onStateChange` event when YouTube loops via context menu. **Fixed** in v2.2 — rAF loop detects backward time jump >1s and forces hard re-sync.

### Review 5 — v2.2 validation
Confirmed proportional nudge is correct. Raised two actionable issues:
1. **Epsilon-gate playbackRate writes**: YouTube's ~5-10Hz clock polled at 60Hz rAF causes stair-stepping — frequent near-identical rate writes to the GrainPlayer. **Fixed** in v2.3 — skip write if change < 0.0005.
2. **Suspended AudioContext**: Clicking inside the cross-origin YouTube iframe can suspend the parent context. **Fixed** in v2.3 — check `Tone.context.state` and call `resume()` in the PLAYING handler.

### Review 6 — v2.4/v2.5 logic review
Identified two critical logic bugs:
1. **Ghost target**: When YouTube is already PLAYING, `seekTo()` may not trigger `onStateChange`. The grain player would be left running from the old position (the "random spot" bug). **Fixed** in v2.5 — `seekBoth` calls `grainHardSync` immediately if YouTube is already playing.
2. **Loop wrap-around**: Same issue — rAF loop called `ytPlayer.seekTo(start)` at loop boundary but relied on `onStateChange` to restart grain. **Fixed** in v2.5 — hard-sync grain immediately in the rAF loop.
3. **Zombified loop / warp protection**: If user manually seeks past the loop end by >5s, the rAF loop was snapping them back. **Fixed** in v2.6 — detect overshoot >5s as manual seek and silently disable the loop.

### Review 7 — Cold-start diagnosis
Validated the diagnostic logging findings. Confirmed that calling `grainPlayer.stop()` on an uninitialized GrainPlayer corrupts its internal scheduling state. Recommended state-gating all `.stop()` calls behind a playback flag. **Fixed** in v2.7 — gate behind `grainIsPlaying`.

## Remaining Questions

1. Is Tone.js GrainPlayer the right tool for musical time-stretching, or would SoundTouch.js (WSOLA algorithm) be more appropriate for sustained string tones?
2. Are the PLL tuning constants (15ms deadzone, 150ms hard resync, 0.05 gain, 0.01 max nudge) optimal, or do they need adjustment based on real-world testing?
3. Does the 200ms debounce after PLAYING adequately prevent false drift readings from YouTube's seek settling?
4. Does the 50ms look-ahead on `grainPlayer.start()` introduce a perceptible delay on hard re-syncs, or is it absorbed by the debounce?
5. What should `LATENCY_OFFSET` be set to? Needs ear-testing to determine if grain sounds ahead/behind the video.

## Architecture Details

### Audio Toggle
Users can switch between "youtube" (native YouTube audio) and "local file" (Tone.js grain synthesis). Local mode mutes YouTube and plays the grain audio instead. Switching to local while the video is already playing immediately starts the grain player and sync loop.

### Speed Control
The speed slider (0.25x–2x) adjusts both YouTube's playback rate and the grain player's rate simultaneously. Grain synthesis handles the pitch preservation.

Note: YouTube only supports specific playback rates (0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2). The `onPlaybackRateChange` event now catches when YouTube clamps an intermediate value and updates our target rate to match, preventing rate mismatch.

### Loop System
Loops are defined in the `LOOPS` config array with start/end timestamps and labels. The rAF sync loop handles loop boundary detection alongside drift correction.

### Tone.js Specifics
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js`
- **Grain size**: 0.5s (larger = smoother for sustained tones, but too large causes position desync — 1.0s was tried and broke things)
- **Overlap**: 0.3s (generous crossfade between grains)
- **`Tone.start()`** must be called on a user gesture (browser autoplay policy) — handled automatically when user clicks "local file" or any play button

### Key Functions (v2)
- `grainHardSync(audioTime)` — stops grain (only if playing), restarts at specified position with target rate; clamps to buffer bounds; uses 50ms look-ahead
- `grainStop()` — saves estimated position, stops playback (only if playing)
- `estimateGrainPosition()` — drift measurement only, uses `currentAppliedRate`
- `startSyncLoop()` / `stopSyncLoop()` — manages rAF-based PLL loop
- `seekBoth(videoTimeSec)` — stops grain, seeks YouTube (grain restarts via onStateChange)
- `playBoth()` / `pauseBoth()` — coordinated play/pause
- `setSpeed(rate)` — sets both YouTube and grain rate, hard re-syncs if playing

## Repos

- **Test**: [john.learndoteach.org](https://github.com/sol-kismulet/john.learndoteach.org)
- **Production**: [wso.learndoteach.org](https://github.com/sol-kismulet/wso.git)

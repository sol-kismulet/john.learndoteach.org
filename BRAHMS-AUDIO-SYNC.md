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

### PLL Tuning Constants

| Constant | Value | Purpose |
|----------|-------|---------|
| `PLL_NUDGE` | 0.001 | Rate micro-adjustment per tick (imperceptible) |
| `PLL_DEADZONE` | 15ms | Below this drift, no correction needed |
| `PLL_HARD_RESYNC` | 150ms | Above this drift, stop/restart grain |
| `DEBOUNCE_MS` | 200ms | Wait after PLAYING before trusting sync |

### What triggers a hard re-sync (stop + restart grain)

- `onStateChange` → PLAYING (initial sync after any play/seek/buffer)
- `onPlaybackRateChange` (YouTube clamped to a supported rate)
- Speed slider change
- Loop boundary seek
- Drift exceeding 150ms (emergency)

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

## Remaining Questions

1. Is Tone.js GrainPlayer the right tool for musical time-stretching, or would SoundTouch.js (WSOLA algorithm) be more appropriate for sustained string tones?
2. Are the PLL tuning constants (15ms deadzone, 150ms hard resync, 0.001 nudge) optimal, or do they need adjustment based on real-world testing?
3. Does the 200ms debounce after PLAYING adequately prevent false drift readings from YouTube's seek settling?

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
- `grainHardSync(audioTime)` — stops grain, restarts at specified position with target rate
- `grainStop()` — saves estimated position, stops playback
- `estimateGrainPosition()` — drift measurement only, uses `currentAppliedRate`
- `startSyncLoop()` / `stopSyncLoop()` — manages rAF-based PLL loop
- `seekBoth(videoTimeSec)` — stops grain, seeks YouTube (grain restarts via onStateChange)
- `playBoth()` / `pauseBoth()` — coordinated play/pause
- `setSpeed(rate)` — sets both YouTube and grain rate, hard re-syncs if playing

## Repos

- **Test**: [john.learndoteach.org](https://github.com/sol-kismulet/john.learndoteach.org)
- **Production**: [wso.learndoteach.org](https://github.com/sol-kismulet/wso.git)

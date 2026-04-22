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

`brahms2.html` is a test page that pairs a YouTube video (Brahms — Variations on a Theme of Haydn, Op. 56, video ID `QmQLb5SZb4E`) with a locally hosted MP3 of the same recording. The architecture:

1. **YouTube video** plays as the visual/timing master (mutable audio)
2. **Tone.js GrainPlayer** plays the local audio file using granular synthesis — it chops the audio into small overlapping grains (0.5s grains, 0.3s overlap), which preserves pitch cleanly at any speed
3. **Sync engine** keeps the two in lockstep:
   - YouTube is the master clock
   - Grain audio starts/stops via YouTube's `onStateChange` events
   - Soft drift correction: instead of stopping/restarting the grain player (which caused audible stutter), we nudge the playback rate by a tiny amount (up to 8%) to gradually close sync gaps
   - At loop boundaries, grain audio is stopped immediately before seeking to prevent blips

## Key Files

| File | Purpose |
|------|---------|
| `brahms2.html` | Test page — YouTube + local audio sync with Tone.js |
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

## Known Bugs & Current Issues

### 1. Audio out of sync / silence on page load
**Status: UNRESOLVED**
When loading the page or refreshing, the grain audio sometimes starts from the wrong position or doesn't play at all. Letting it sit for a while, audio eventually starts. The root cause appears to be a mismatch between the grain player's internal position tracking and the actual YouTube video position.

### 2. Speed change causes desync
**Status: PARTIALLY FIXED**
`grainSetRate()` was capturing the current position AFTER updating `currentPlaybackRate`, causing `getGrainCurrentTime()` to return the wrong value. Fixed by capturing position at the old rate first. However, stopping the loop, changing speed, and restarting still sometimes causes sync issues.

### 3. Browser restoring slider state on refresh
**Status: PARTIALLY FIXED**
Added a reset of the slider to 1.0 on page load. But YouTube doesn't restore its playback rate on refresh, so there may still be mismatches in edge cases.

### 4. Position tracking via wall-clock math is fragile
**Status: CORE ARCHITECTURAL ISSUE**
We track the grain player's position manually:
```javascript
elapsed = (Tone.now() - grainStartWallTime) * currentPlaybackRate
position = currentGrainOffset + elapsed
```
This assumes the GrainPlayer advances through the buffer at exactly `currentPlaybackRate * realTime`, which may not be precisely true due to Tone.js's internal scheduling, grain overlap mechanics, and Web Audio API timing. Any small error accumulates over time.

The previous hard drift correction (stop/restart when drift > 0.3s) fixed the drift but caused an audible stutter at regular intervals. The current soft correction (nudging playback rate by up to 8%) is theoretically better but may not be converging properly.

### 5. System sample rate mismatch
**Status: UNDER INVESTIGATION**
The MP3 source is 44.1kHz. The developer's system runs at 48kHz. The Web Audio API resamples the buffer automatically on decode, so this _should_ be transparent, but switching from a 48kHz source file to the 44.1kHz file reintroduced the grain stutter (which was previously fixed by increasing grain size). The stutter was ultimately traced to the hard drift correction, not sample rate — but sample rate effects on grain quality haven't been fully ruled out.

## Architecture Details

### Audio Toggle
Users can switch between "youtube" (native YouTube audio) and "local file" (Tone.js grain synthesis). Local mode mutes YouTube and plays the grain audio instead.

### Speed Control
The speed slider (0.25x–2x) adjusts both YouTube's playback rate and the grain player's rate simultaneously. Grain synthesis handles the pitch preservation — no browser API needed.

Note: YouTube only supports specific playback rates (0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2). The slider uses `step="0.05"`, so intermediate values get clamped by YouTube but NOT by the grain player, potentially causing drift.

### Loop System
Loops are defined in the `LOOPS` config array with start/end timestamps and labels. The sync timer (`checkSync`) runs at 100ms intervals whenever the video is playing, handling both loop boundary detection and drift correction.

### Tone.js Specifics
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js`
- **Grain size**: 0.5s (larger = smoother for sustained tones, but too large causes position desync — 1.0s was tried and broke things)
- **Overlap**: 0.3s (generous crossfade between grains)
- **`Tone.start()`** must be called on a user gesture (browser autoplay policy) — handled automatically when user clicks "local file" or any play button

### Key Functions
- `grainPlay(fromTime)` — stops current playback, seeks to position, starts playing
- `grainStop()` — captures current position via wall-clock math, stops playback
- `grainSeek(toTime)` — sets position without starting
- `grainSetRate(rate)` — changes speed; if playing, captures position at old rate, restarts at new rate
- `getGrainCurrentTime()` — calculates current position from wall-clock elapsed time
- `checkSync()` — runs every 100ms, handles loop boundaries and soft drift correction
- `seekBoth(videoTimeSec)` — seeks both YouTube and grain player
- `playBoth()` / `pauseBoth()` — coordinated play/pause

## Questions for Code Review

1. Is manual wall-clock position tracking the right approach, or does Tone.js GrainPlayer expose an actual current position we should use instead?
2. Is there a better way to keep the grain player synced to YouTube than the current soft-nudge approach?
3. Could the `onStateChange` → `grainPlay` flow have race conditions (e.g., YouTube fires PLAYING before the seek completes)?
4. Is Tone.js GrainPlayer the right tool for musical time-stretching, or would something like SoundTouch.js (WSOLA algorithm) be more appropriate?
5. Are there issues with how we handle the speed slider that could cause the persistent desync?

## Repos

- **Test**: [john.learndoteach.org](https://github.com/sol-kismulet/john.learndoteach.org)
- **Production**: [wso.learndoteach.org](https://github.com/sol-kismulet/wso.git)

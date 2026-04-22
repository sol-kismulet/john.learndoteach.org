# Brahms Audio Sync — Project Notes

## Overview

We're building a practice tool that syncs a YouTube video with a local high-quality audio file, so cellists can slow down playback without the distortion that YouTube's native speed control introduces.

**john.learndoteach.org is the testground.** Once the approach is proven here, we'll deploy it to wso.learndoteach.org for the full orchestra.

## The Problem

YouTube's built-in speed control distorts audio at slow playback rates — unusable for serious musical practice. The browser's native `preservesPitch` on HTML5 `<audio>` is better but still produces noticeable artifacts on sustained tones (cello, strings).

## The Solution: Tone.js GrainPlayer

`brahms2.html` is a test page that pairs a YouTube video (Brahms — Variations on a Theme of Haydn, Op. 56) with a locally hosted MP3 of the same recording. The architecture:

1. **YouTube video** plays as the visual/timing master (mutable audio)
2. **Tone.js GrainPlayer** plays the local audio file using granular synthesis — it chops the audio into small overlapping grains (0.5s grains, 0.3s overlap), which preserves pitch cleanly at any speed
3. **Sync engine** keeps the two in lockstep:
   - YouTube is the master clock
   - Grain audio starts/stops via YouTube's `onStateChange` events
   - Drift correction runs every 100ms — if grain position drifts >0.3s from video, it re-syncs
   - At loop boundaries, grain audio is stopped immediately before seeking to prevent blips

## Key Files

| File | Purpose |
|------|---------|
| `brahms2.html` | Test page — YouTube + local audio sync with Tone.js |
| `brahms.mp3` | Full Brahms recording from YouTube (320kbps, no processing) |
| `songs.json` | Data-driven song/loop config for the main site |
| `song.html` | Unified template (handles both MP3-only and YouTube-video songs) |
| `song.css` | Shared styles for all song/practice pages |

## Audio Source

The local MP3 is extracted from the same YouTube video using [yout.com](https://yout.com) (paid subscription) with **all processing disabled**:

- ❌ Remove silence — OFF
- ❌ Normalize — OFF  
- ❌ Discover MetaData — OFF
- Format: MP3, 320 kbit/s (Highest)

This ensures the audio timeline matches the YouTube video exactly (offset = 0).

## Architecture Details

### Audio Toggle
Users can switch between "youtube" (native YouTube audio) and "local file" (Tone.js grain synthesis). Local mode mutes YouTube and plays the grain audio instead.

### Speed Control
The speed slider (0.25x–2x) adjusts both YouTube's playback rate and the grain player's rate simultaneously. Grain synthesis handles the pitch preservation — no browser API needed.

### Loop System
Loops are defined in the `LOOPS` config array with start/end timestamps and labels. The sync timer (`checkSync`) runs at 100ms intervals whenever the video is playing, handling both loop boundary detection and drift correction.

### Tone.js Specifics
- **CDN**: `https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.49/Tone.min.js`
- **Grain size**: 0.5s (larger = smoother for sustained tones)
- **Overlap**: 0.3s (generous crossfade between grains)
- **`Tone.start()`** must be called on a user gesture (browser autoplay policy) — handled automatically when user clicks "local file" or any play button

## Current State

- ✅ YouTube + local audio sync working
- ✅ Looping with clean transitions (no blips)
- ✅ Drift correction in both loop and play-piece modes
- ✅ Speed control via grain synthesis (distortion-free)
- ✅ 320kbps MP3 from yout.com (no processing, perfect sync)
- 🔲 Deploy to wso.learndoteach.org once validated

## Deployment to WSO

When ready, the approach is:
1. Add Tone.js CDN to `song.html` on WSO
2. Add a "local file" audio toggle for video-mode songs
3. Host MP3s for each YouTube-backed piece
4. The existing data-driven architecture (`songs.json` + `song.html`) already supports video mode — we just need to layer in the grain player option

## Repos

- **Test**: [john.learndoteach.org](https://github.com/sol-kismulet/john.learndoteach.org)
- **Production**: [wso.learndoteach.org](https://github.com/sol-kismulet/wso.git)

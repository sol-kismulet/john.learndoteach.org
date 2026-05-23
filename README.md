# john.learndoteach.org

A small static site (GitHub Pages) of music practice pages: a looping
video/audio player with labelled sections, optional score images, scale
helpers, and a drone.

## Architecture

The site is data-driven. There is **one shared song template**, `song.html`,
and **one data file**, `songs.json`. A song page is just the template loaded
with a slug:

```
song.html?s=earth-song
```

`song.html` fetches `songs.json`, looks up `data.songs[slug]`, and renders
itself from that object. `index.html` builds the song list by iterating
`data.songs`. Nothing reads the top level of `songs.json` other than the
`songs` (and reserved `concerts`) keys, so extra keys like `_format` are
ignored by the app.

Because of this, **features are turned on per-song by adding a field to the
song's entry** — there is no per-song HTML. Each optional feature is gated by
an `if (song.<field>)` check in `song.html`.

## Adding or editing a song

Add an entry under `"songs"` in `songs.json`:

```json
"my-song": {
  "title": "my song",
  "videoId": "YouTubeIdHere",
  "loops": [
    { "start": "0:00", "end": "0:12", "label": "intro" }
  ]
}
```

It appears automatically on the home page and at `song.html?s=my-song`.

### Song fields

| Field | Meaning |
|-------|---------|
| `title` | Display name (required). |
| `videoId` | YouTube id. Use this **or** `audio`. |
| `audio` | Audio file URL. Use this **or** `videoId`. |
| `loops` | Array of `{ start, end, label?, score? }`. Times are `M:SS` or `M:SS.s`. `label` shows above the loop; `score` is an image shown while that loop plays. |
| `fineTune` | `true` adds ±0.1s nudge buttons to loop times. |
| `scales` | `true` shows the A♭ scale-comparison buttons (Aeolian vs Dorian). |
| `drone` | A **note name** to enable a sustained drone, e.g. `"A♭"`, `"Eb3"`, `"G2"`. Octave is optional and defaults to 3. Omit the field (or set `null`) to leave the drone off. |
| `speedMin` | Minimum value for the speed slider. |
| `footer` | HTML note shown below the controls. |
| `lyrics` | Preformatted lyrics text shown at the bottom. |

### The drone

The drone (borrowed from the [mojotrio](https://github.com/johnmbillings/mojotrio)
drone tool) plays a sustained root with an optional perfect fifth and a volume
control, shown as a footnote at the bottom of the page. Its pitch comes
entirely from the song's `drone` field: `song.html` parses the note name to a
MIDI number (`pitchToMidi`), so the same field both enables the drone and sets
its note and label. The fifth is derived as root × 1.5.

## Deployment

GitHub Pages serves the `main` branch root. A `.nojekyll` file disables Jekyll
so files are served as-is (this is a plain static site, not a Jekyll site).
Pushing/merging to `main` redeploys.

# john.learndoteach.org

A small static site (GitHub Pages) of music practice pages: a looping
video/audio player with labelled sections, optional score images, scale
helpers, and a drone.

## Architecture

The site is data-driven. There is **one shared template** (`song.html` for
markup, `song.js` for the player/audio engine, `song.css` for styling) and
**one data file**, `songs.json`. A song page is just the template loaded with
a slug:

```
song.html?s=earth-song
```

`song.js` fetches `songs.json`, looks up `data.songs[slug]`, and renders the
page from that object. `index.html` builds the song list by iterating
`data.songs`. Nothing reads the top level of `songs.json` other than the
`songs` (and reserved `concerts`) keys, so extra keys like `_format` are
ignored by the app.

Because of this, **features are turned on per-song by adding a field to the
song's entry** — there is no per-song HTML or JS. Each optional feature is
gated by an `if (song.<field>)` check in `song.js`. Keeping the template fully
song-agnostic is what makes single-song export (below) a clean copy.

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
| `scales` | Object `{ root, items }` that shows scale-playback buttons. `root` is a note name; each item is `{ mode, label? }` where `mode` is `ionian`/`major`/`dorian`/`phrygian`/`lydian`/`mixolydian`/`aeolian`/`minor`/`natural minor`/`locrian`. `label` overrides the button text. Example: `{ "root": "A♭", "items": [{ "mode": "aeolian", "label": "A♭ Aeolian (7♭)" }, { "mode": "dorian" }] }`. |
| `drone` | A **note name** to enable a sustained drone, e.g. `"A♭"`, `"Eb3"`, `"G2"`. Octave is optional and defaults to 3. Omit the field (or set `null`) to leave the drone off. |
| `speedMin` | Minimum value for the speed slider. |
| `footer` | HTML note shown below the controls. |
| `lyrics` | Preformatted lyrics text shown at the bottom. |

### The drone

The drone (borrowed from the [mojotrio](https://github.com/johnmbillings/mojotrio)
drone tool) plays a sustained root with an optional perfect fifth and a volume
control, shown as a footnote at the bottom of the page. Its pitch comes
entirely from the song's `drone` field: `song.js` parses the note name to a
MIDI number (`pitchToMidi`), so the same field both enables the drone and sets
its note and label. The fifth is derived as root × 1.5.

## Assets

Per-song score images live under `scores/<slug>/` (e.g.
`scores/allemande/mm-1-4.svg`) so a song's assets are self-contained. Scores
are generated from LilyPond source by `tools/scores/build_scores.py`, which
writes to whatever path the song's `loop.score` points at.

## Exporting a single song to its own site

To split one song into a standalone, deployable site:

```
node tools/export.mjs <slug> <dest-dir>
# e.g. node tools/export.mjs allemande ../bach-site
```

This copies the shared template/engine/styles plus only the assets that song
references, and writes a `songs.json` containing just that song. Add a `CNAME`
in the destination if you want a custom domain.

## Validation (CI)

`.github/workflows/validate.yml` runs on every push/PR and:

1. validates `songs.json` against `songs.schema.json` (via `ajv-cli`), and
2. runs `node tools/check-assets.mjs` to confirm every referenced score/audio
   file actually exists.

Run the same checks locally:

```
npx ajv-cli@5 validate --spec=draft7 --strict=false -s songs.schema.json -d songs.json
node tools/check-assets.mjs
```

## Deployment

GitHub Pages serves the `main` branch root. A `.nojekyll` file disables Jekyll
so files are served as-is (this is a plain static site, not a Jekyll site).
Pushing/merging to `main` redeploys.

**Gotcha:** if a change isn't showing up live after a few minutes, the Pages
build may be stuck or cached, not your code. Check the repo's **Actions** tab
for the "pages build and deployment" run, and note that the custom domain can
cache HTML harder than a browser hard-refresh clears — a fresh deploy purges
it.

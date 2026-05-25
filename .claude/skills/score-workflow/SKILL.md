---
name: score-workflow
description: >-
  How to add or edit the engraved sheet-music scores shown on the song page.
  Use when transcribing a new piece's notes from IMSLP, or adding fingerings,
  slurs, articulations, dynamics, bowings, or ornaments to an existing piece
  from screen captures of a printed edition, then rebuilding the per-loop SVGs.
  Triggers: "add fingerings/notations to the score", "transcribe the
  allemande", "rebuild the scores", working in tools/scores/*.ly or scores/.
---

# Score workflow

## How scores work here
- **Source of truth** is LilyPond: `tools/scores/<piece>.ly`. Everything that
  appears in the printed music lives there.
- The files in `scores/<piece>/*.svg` are **build artifacts** — never hand-edit
  them; they are regenerated.
- `songs.json` drives the slicing: each loop's `label` (e.g. `"mm 4-6"`) and
  `score` path tell `tools/scores/build_scores.py` which measures to render into
  which SVG.
- Provenance and build notes live in `tools/scores/README.md`.

## Prerequisite: LilyPond
`build_scores.py` needs LilyPond. `tools/scores/setup.sh` installs it if missing;
on Claude Code on the web the `SessionStart` hook (`.claude/`) runs it
automatically. To check: `lilypond --version`.

## Getting the notes (IMSLP)
Transcribe pitches and rhythms from the public-domain IMSLP edition into an
**absolute-octave** LilyPond source (`\absolute`, not `\relative`). Absolute
octaves keep each measure self-contained, so polyphony or a voice split never
shifts the octave of later notes — the bug class that plagued the relative
source. Record the edition/source in `tools/scores/README.md`. Keep **one
measure per line** (see the hard constraint below).

## Adding notations (fingerings, slurs, dynamics, …)
Done a few measures at a time from screen captures of the edition being marked:

1. The user sends a tight capture of one or two measures. (A single measure
   crop is legible enough — that's the proven floor.)
2. Read off the markings: fingerings, slurs/ties, staccato/accent/tenuto,
   dynamics, ornaments (trill/mordent/turn), bowings (down/up).
3. **Anchor to the known notes.** The `.ly` is ground truth — don't re-read
   pitches; map each marking onto the note that's already there. If a mark seems
   to land on a pitch that doesn't match the source, flag it rather than guess.
4. Add with LilyPond syntax on the existing note, e.g.:
   - fingering `-4` (on a chord note: `<b d, g,-4>`)
   - dynamics `\f \p \mf \cresc \!`
   - articulations `-.` (staccato) `->` (accent) `-_` (tenuto)
   - bowings `\downbow` `\upbow`; trill `\trill`
   - force a fingering below: `\once \set fingeringOrientations = #'(down)`
     (must stay on the measure's line — see below)
5. Treat each batch as a first pass the user verifies; small marks are
   error-prone. Confirm ambiguous spots (e.g. which note of a chord) before moving on.

## HARD CONSTRAINT: one measure per line
`build_scores.py` splits the music **by line = by measure**. Any
`\set` / `\once` / `\override` must sit on the **same line** as the measure it
applies to. A statement on its own line is counted as an extra measure and
shifts every later index, corrupting all the SVGs.

## Rebuild and verify
```
python3 tools/scores/build_scores.py
```
Then verify:
- `git status` should show **only the SVG(s) you intended to change**. If other
  `mm-*.svg` files changed, a measure boundary shifted — fix the source (usually
  a stray line break) and rebuild.
- Eyeball the changed SVG against the edition. To view it: serve the repo
  (`python3 -m http.server 8137`) and open `scores/<piece>/<file>.svg`, or render
  it to a PNG (embed in an `<img>` at a fixed width and screenshot — a raw SVG
  `fullPage` screenshot can hang).

Work and verify a couple measures at a time; don't batch the whole piece blind.

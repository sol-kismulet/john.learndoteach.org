# Score builder

Renders the per-loop SVG scores in `scores/` from LilyPond sources in this directory.

## Sources
- `allemande.ly` — Bach Cello Suite No. 1, Allemande (BWV 1007). Forked from
  the community LilyPond typeset at
  [babysnakes/Bach---Cello-Suites](https://github.com/babysnakes/Bach---Cello-Suites)
  (Bärenreiter-based), with editorial slurs, bow markings and trills added
  by hand to follow the Peters/Becker edition.

## Build
Requires LilyPond on `$PATH` (`apt-get install lilypond`).

From the repo root:

```
python3 tools/scores/build_scores.py
```

The script reads each loop in `songs.json`, parses the measure range out of
its `label` (e.g. `"mm 4-6"`), extracts those measures from the matching
LilyPond source, and writes the cropped SVG to the path in the loop's
`score` field.

For ranges that don't start at m. 1, the earlier measures are emitted inside
`\set Score.skipTypesetting = ##t` so LilyPond parses them silently —
necessary because the source uses `\relative` notation and slicing measures
out of context shifts later pitches by an octave or more.

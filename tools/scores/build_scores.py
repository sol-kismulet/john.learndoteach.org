#!/usr/bin/env python3
"""Render per-loop SVG scores for songs.json.

For each loop with a `label` like "mm 4-6" and a `score` path in songs.json,
extracts the corresponding measures from the LilyPond source in this directory
and renders a cropped SVG into the path the JSON points at.

Requires: lilypond on PATH.

Run from the repo root:
    python3 tools/scores/build_scores.py
"""
import json, re, subprocess, shutil, tempfile, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
SRC_LY = HERE / 'allemande.ly'

src = SRC_LY.read_text()
m = re.search(r'\\repeat\s+volta\s+2\s*\{(.+?)\n\s*\}', src, re.DOTALL)
if not m:
    sys.exit(f'first \\repeat volta block not found in {SRC_LY}')
lines = [l.strip() for l in m.group(1).splitlines() if l.strip()]
pickup = lines[0]
measures = [ln for ln in lines[1:] if not ln.startswith('\\barNumberCheck')]

def parse_range(label):
    nums = re.findall(r'\d+', label)
    return int(nums[0]), int(nums[1])

def make_ly(start, end):
    # The source is in absolute octaves, so each measure stands alone — no
    # \relative context and no skipTypesetting of earlier measures needed.
    visible = '\n'.join('    ' + m for m in measures[start-1:end])
    if start == 1:
        body = f'    {pickup}\n{visible}'
    else:
        body = f'    \\set Score.currentBarNumber = #{start}\n{visible}'
    return f'''\\version "2.24.0"
\\paper {{
  indent = 0
  line-width = 180\\mm
  ragged-right = ##f
  ragged-last = ##t
  print-page-number = ##f
}}
\\header {{ tagline = "" }}
\\score {{
  \\new Staff \\with {{ \\remove "Time_signature_engraver" }} {{
    \\clef "bass"
    \\key g \\major
    \\time 2/2
    \\set Timing.baseMoment = #(ly:make-moment 1/16)
    \\set Timing.beatStructure = #'(4 4 4 4)
{body}
  }}
  \\layout {{ }}
}}
'''

songs = json.loads((REPO / 'songs.json').read_text())
allemande = songs['songs']['allemande']

with tempfile.TemporaryDirectory() as tmp:
    tmp = Path(tmp)
    for loop in allemande['loops']:
        if not loop.get('score'):
            continue
        start, end = parse_range(loop['label'])
        out_base = tmp / Path(loop['score']).stem
        ly_path = out_base.with_suffix('.ly')
        ly_path.write_text(make_ly(start, end))
        r = subprocess.run(
            ['lilypond', '-dbackend=svg', '-dcrop=#t', '-dno-point-and-click',
             '-o', str(out_base), str(ly_path)],
            capture_output=True, text=True)
        if r.returncode != 0:
            print(f'fail {ly_path.name}:', r.stderr[-400:])
            continue
        dest = REPO / loop['score']
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(str(out_base) + '.cropped.svg', dest)
        print(f'  -> {dest.relative_to(REPO)} ({dest.stat().st_size} bytes)')

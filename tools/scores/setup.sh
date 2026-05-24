#!/bin/bash
# Ensure LilyPond is installed. It's required to rebuild the per-loop SVG scores
# in scores/ from the LilyPond sources in tools/scores/ (see README.md here and
# the score-workflow skill). Safe to run repeatedly; no-op once installed.
set -euo pipefail

if command -v lilypond >/dev/null 2>&1; then
  exit 0
fi

if ! command -v apt-get >/dev/null 2>&1; then
  echo "lilypond not found and apt-get unavailable; install LilyPond manually." >&2
  exit 0
fi

SUDO=""
[ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1 && SUDO="sudo"

echo "Installing LilyPond (needed to rebuild score SVGs)…"
if ! DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y lilypond >/dev/null 2>&1; then
  $SUDO apt-get update >/dev/null 2>&1 || true
  DEBIAN_FRONTEND=noninteractive $SUDO apt-get install -y lilypond
fi
echo "LilyPond installed: $(lilypond --version 2>/dev/null | head -1)"

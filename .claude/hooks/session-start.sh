#!/bin/bash
# SessionStart hook: make sure the score toolchain (LilyPond) is present so
# `python3 tools/scores/build_scores.py` can rebuild the SVGs in scores/.
# Runs only in the remote (web) environment; no-op once LilyPond is installed.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

bash "${CLAUDE_PROJECT_DIR:-.}/tools/scores/setup.sh"

#!/usr/bin/env bash
# Copyright (c) 2026 Chu Ling
# SPDX-License-Identifier: Apache-2.0
#
# integrations/gstack/testnux/install.sh
#
# Install the testnux gstack skill into the user's gstack skills directory.
#
# Usage:
#   bash integrations/gstack/testnux/install.sh
#
# What it does:
#   1. Detects the gstack skills directory (~/.claude/skills/gstack/ by default)
#   2. Symlinks (or copies if symlinks unavailable) this folder into that directory
#   3. Verifies the install by listing skills if gstack-list-skills is available

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────

SKILL_NAME="testnux"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL_SOURCE_DIR="$SCRIPT_DIR"

# ── Detect gstack skills directory ───────────────────────────────────────────

detect_gstack_dir() {
  # Standard location
  local standard="$HOME/.claude/skills/gstack"
  if [ -d "$standard" ]; then
    echo "$standard"
    return
  fi

  # Project-vendored location (deprecated but still supported)
  local vendored
  vendored="$(git rev-parse --show-toplevel 2>/dev/null)/.claude/skills/gstack" || true
  if [ -d "$vendored" ]; then
    echo "$vendored"
    return
  fi

  # GSTACK_HOME override
  if [ -n "${GSTACK_HOME:-}" ] && [ -d "$GSTACK_HOME" ]; then
    echo "$GSTACK_HOME"
    return
  fi

  echo ""
}

GSTACK_DIR="$(detect_gstack_dir)"

if [ -z "$GSTACK_DIR" ]; then
  echo ""
  echo "ERROR: gstack skills directory not found."
  echo ""
  echo "  Looked in:"
  echo "    ~/.claude/skills/gstack/"
  echo "    <git-root>/.claude/skills/gstack/"
  echo "    \$GSTACK_HOME"
  echo ""
  echo "  Install gstack first: https://github.com/stackblitz-labs/gstack"
  echo "  Then re-run this script."
  echo ""
  exit 1
fi

INSTALL_TARGET="$GSTACK_DIR/$SKILL_NAME"

echo ""
echo "testnux gstack skill installer"
echo "-----------------------------------"
echo "  Source : $SKILL_SOURCE_DIR"
echo "  Target : $INSTALL_TARGET"
echo ""

# ── Guard against self-install ────────────────────────────────────────────────

if [ "$(realpath "$SKILL_SOURCE_DIR" 2>/dev/null || echo "$SKILL_SOURCE_DIR")" = \
     "$(realpath "$INSTALL_TARGET" 2>/dev/null || echo "$INSTALL_TARGET")" ]; then
  echo "INFO: Source and target are the same path. Nothing to do."
  exit 0
fi

# ── Remove stale install ──────────────────────────────────────────────────────

if [ -e "$INSTALL_TARGET" ] || [ -L "$INSTALL_TARGET" ]; then
  echo "Removing existing install at $INSTALL_TARGET ..."
  rm -rf "$INSTALL_TARGET"
fi

# ── Install: prefer symlink, fall back to copy ────────────────────────────────

if ln -s "$SKILL_SOURCE_DIR" "$INSTALL_TARGET" 2>/dev/null; then
  echo "Symlinked: $INSTALL_TARGET -> $SKILL_SOURCE_DIR"
  INSTALL_METHOD="symlink"
else
  echo "Symlink failed (Windows or restricted fs?). Falling back to copy..."
  cp -r "$SKILL_SOURCE_DIR" "$INSTALL_TARGET"
  INSTALL_METHOD="copy"
  echo "Copied: $SKILL_SOURCE_DIR -> $INSTALL_TARGET"
fi

# ── Verify SKILL.md is present ────────────────────────────────────────────────

if [ ! -f "$INSTALL_TARGET/SKILL.md" ]; then
  echo ""
  echo "ERROR: SKILL.md not found at $INSTALL_TARGET/SKILL.md"
  echo "  The $INSTALL_METHOD may be incomplete. Check permissions and try again."
  exit 1
fi

echo ""
echo "Verifying install ..."

# ── Optional: list skills if gstack-list-skills is available ─────────────────

LIST_BIN=""
if command -v gstack-list-skills &>/dev/null; then
  LIST_BIN="gstack-list-skills"
elif [ -x "$GSTACK_DIR/bin/gstack-list-skills" ]; then
  LIST_BIN="$GSTACK_DIR/bin/gstack-list-skills"
fi

if [ -n "$LIST_BIN" ]; then
  echo ""
  echo "Installed skills (gstack-list-skills):"
  "$LIST_BIN" 2>/dev/null | grep -E "(testnux|$)" || echo "  (could not list skills)"
fi

# ── Success ───────────────────────────────────────────────────────────────────

echo ""
echo "Install complete."
echo ""
echo "  Method : $INSTALL_METHOD"
echo "  Skill  : /$SKILL_NAME"
echo ""
echo "Usage in Claude Code:"
echo "  /testnux init login --industry general"
echo "  /testnux report testing-log/2026-04-26_login"
echo "  /testnux doctor"
echo ""
echo "If the skill does not appear, restart Claude Code to pick up new skills."
echo ""

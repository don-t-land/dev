#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

printf '%s\n' '==> git diff --check (unstaged + staged)'
git diff --check
git diff --cached --check

printf '%s\n' '==> release metadata consistency'
node scripts/check-release.cjs

printf '%s\n' '==> full test suite'
npm test

printf '%s\n' 'dontland-ai-verify-ok'

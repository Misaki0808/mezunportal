#!/bin/sh
set -eu

cd "$(git rev-parse --show-toplevel)"
git fetch --all --prune
branch=$(git symbolic-ref --quiet --short HEAD || printf 'detached')
head=$(git rev-parse HEAD)
printf 'Dal: %s\nHEAD: %s\n' "$branch" "$head"
counts=$(git rev-list --left-right --count HEAD...origin/main)
printf 'origin/main karşısında ileri/geri: %s\n' "$counts"
behind=$(printf '%s\n' "$counts" | awk '{print $2}')
warning=0
if [ "$behind" -gt 0 ]; then
  printf 'BAYAT: çalışma dalı origin/main gerisinde.\n'
  warning=1
fi
upstream=$(git rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null || :)
if [ -n "$upstream" ]; then
  upstream_behind=$(git rev-list --count "HEAD..$upstream")
  if [ "$upstream_behind" -gt 0 ]; then
    printf 'PULL DÜŞTÜ: %s uzakta %s commit ileride; elle inceleyin.\n' "$upstream" "$upstream_behind"
    warning=1
  fi
fi
git worktree list
gh pr list
exit "$warning"

#!/bin/sh
# Tuning aid: careful, adult and masher (3 seeds, one Krigare with the Hirdmannen, Medel, the safe lane) through the dungeons given (default all nine).
cd "$(dirname "$0")/.." || exit 1
for d in ${@:-draug frost surt hel dvarg orm alv fenrir loke}; do
  for st in careful adult masher; do
    echo "$d $st: $(node --experimental-transform-types src/runtune.ts --level 2 --lane safe --seeds 3 --only 2 --style $st --dungeon "$d" 2>&1 | grep ensam | cut -c22-60,118-220)"
  done
done

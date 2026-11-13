#!/bin/sh
# Tuning aid: the skill rows on one level (default Medel), same safe lane. Extra arguments go to runtune (e.g. --mark 0.5).
cd "$(dirname "$0")/.." || exit 1
LV=${LV:-2}
run() { node --experimental-transform-types src/runtune.ts --level "$LV" --lane safe --seeds "${SEEDS:-6}" "$@" 2>&1 | grep "ensam\|+" | cut -c1-215; }
for o in 2 3; do
  echo "careful $o"; run --style careful --only $o "$@"
  echo "adult $o"; run --style adult --only $o "$@"
  echo "masher $o"; run --style masher --only $o "$@"
  echo "nododge $o"; run --style careful --only $o --nododge "$@"
  echo "slot1 $o"; run --style careful --only $o --slots 0 "$@"
  echo "clumsy $o"; run --style clumsy --only $o "$@"
done

#!/usr/bin/env bash
# Fetches the free CC0 art packs the native client is built from (PLAN.md section 5; LICENSES.md has the rows) into
# packages/godot/downloads/ (gitignored). Only the files the project uses are committed, by hand, under
# packages/godot/assets/<pack>/; this script is for getting the whole packs when more of them are needed.
#
# The build sandbox of 2026-11-01 could reach GitHub's raw files and git, but not kenney.nl, itch.io downloads or
# poly.pizza (HTTP 403 through its proxy), so the Kenney kits are fetched here with a fallback to a manual step.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DL="$HERE/../downloads"
mkdir -p "$DL"
cd "$DL"

echo "== KayKit Dungeon Remastered (CC0): git, the same files as the itch.io download"
if [ ! -d kaykit-dungeon-remastered ]; then
  git clone --depth 1 https://github.com/KayKit-Game-Assets/KayKit-Dungeon-Remastered kaykit-dungeon-remastered
else
  echo "   already here"
fi
echo "   models: kaykit-dungeon-remastered/addons/kaykit_dungeon_remastered/Assets/gltf"

# Kenney's zips sit behind hashed media URLs, so the page is fetched first and the zip link read from it.
fetch_kenney() {
  local slug="$1"
  if ls "kenney_${slug}".zip >/dev/null 2>&1; then echo "   kenney_${slug}.zip already here"; return; fi
  echo "== Kenney ${slug} (CC0)"
  local page url
  if ! page="$(curl -fsSL --max-time 60 "https://kenney.nl/assets/${slug}")"; then
    echo "   could not reach https://kenney.nl/assets/${slug}: download the zip there by hand into $DL" >&2
    return
  fi
  url="$(printf '%s' "$page" | grep -oE 'https://kenney\.nl/media/pages/assets/[^"]+\.zip' | head -1 || true)"
  if [ -z "$url" ]; then
    echo "   no zip link found on the page: download it by hand from https://kenney.nl/assets/${slug} into $DL" >&2
    return
  fi
  curl -fsSL --max-time 300 -o "kenney_${slug}.zip" "$url"
  mkdir -p "kenney_${slug}" && unzip -q -o "kenney_${slug}.zip" -d "kenney_${slug}"
  echo "   unpacked into kenney_${slug}/"
}
fetch_kenney graveyard-kit
fetch_kenney mini-dungeon
fetch_kenney nature-kit

echo "== Quaternius Stylized Nature MegaKit (CC0)"
echo "   the download button on https://quaternius.com/packs/stylizednaturemegakit.html has no stable address:"
echo "   download it by hand into $DL and unzip it there."

echo
echo "Done. Copy only the files you use into packages/godot/assets/<pack>/ and add them to LICENSES.md."

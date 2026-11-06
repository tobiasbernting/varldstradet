#!/usr/bin/env bash
# Fetches the webrtc-native GDExtension (https://github.com/godotengine/webrtc-native, the Godot Foundation's, MIT) into
# packages/godot/addons/webrtc/. Röstprat (scripts/voice.gd) needs it: Godot itself only has the WebRTC classes, the
# implementation is this extension. The binaries are not committed (they are large and per platform): the Godot workflow
# runs this script before the import, and a developer runs it once after cloning:
#
#   packages/godot/tools/fetch-webrtc.sh            (needs curl, unzip, sha256sum and node; set GITHUB_TOKEN to avoid API limits)
#
# The release is PINNED below (tag, asset name, sha256 of the asset). While PIN_TAG is empty the script is in "discover"
# mode: it resolves releases/latest through the GitHub API, prints the tag, every asset's name, size and the API's sha256
# digest, and downloads the asset anyway, so that one CI log shows what to pin. Once pinned, a different file is an error.
# Everything the zip holds that is not for a target we ship is harmless; the zip's layout is printed.
set -euo pipefail

PIN_TAG="${WEBRTC_TAG:-}"
PIN_ASSET="${WEBRTC_ASSET:-}"
PIN_SHA256="${WEBRTC_SHA256:-}"

here="$(cd "$(dirname "$0")" && pwd)"
dest="$here/../addons/webrtc"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

auth=()
if [ -n "${GITHUB_TOKEN:-}" ]; then auth=(-H "Authorization: Bearer $GITHUB_TOKEN"); fi
api="https://api.github.com/repos/godotengine/webrtc-native/releases"
if [ -n "$PIN_TAG" ]; then url="$api/tags/$PIN_TAG"; else url="$api/latest"; fi
curl -fsSL "${auth[@]}" -H "Accept: application/vnd.github+json" -o "$work/release.json" "$url"

# prints "tag", then "asset <name> <size> <digest>" per asset, then the url of the chosen asset
node -e '
  const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
  const want = process.argv[2];
  console.log("tag " + r.tag_name);
  for (const a of r.assets) console.log(`asset ${a.name} ${a.size} ${a.digest ?? "(no digest)"}`);
  const pick = want ? r.assets.find((a) => a.name === want) : r.assets.find((a) => /webrtc/i.test(a.name) && /\.zip$/i.test(a.name) && !/debug|source/i.test(a.name));
  if (!pick) { console.error("no asset to use among the above (set WEBRTC_ASSET)"); process.exit(1); }
  console.log("use " + pick.name + " " + pick.browser_download_url);
' "$work/release.json" "$PIN_ASSET" | tee "$work/info.txt"

asset_url="$(sed -n 's/^use [^ ]* //p' "$work/info.txt")"
curl -fsSL "${auth[@]}" -o "$work/webrtc.zip" "$asset_url"
sum="$(sha256sum "$work/webrtc.zip" | cut -d' ' -f1)"
echo "sha256 of the download: $sum"
if [ -n "$PIN_SHA256" ] && [ "$sum" != "$PIN_SHA256" ]; then
  echo "::error::webrtc-native: the download's sha256 is not the pinned one ($PIN_SHA256)"; exit 1
fi
if [ -z "$PIN_SHA256" ]; then echo "::warning::webrtc-native is not pinned yet: pin tag, asset and sha256 above in the workflow's env"; fi

mkdir "$work/x" && unzip -q "$work/webrtc.zip" -d "$work/x"
(cd "$work/x" && find . -type f | sort)
ext="$(find "$work/x" -name '*.gdextension' | head -n1)"
if [ -z "$ext" ]; then echo "::error::webrtc-native: no .gdextension in the zip"; exit 1; fi
rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
cp -r "$(dirname "$ext")" "$dest"
echo "webrtc-native is in $dest"

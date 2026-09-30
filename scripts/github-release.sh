#!/usr/bin/env bash
# Creates the GitHub Release for a version tag (run by .github/workflows/publish.yml after
# npm publish): notes with the CDN snippet, npm links and the commits since the previous
# tag; assets = the two kit builds (identical to the npm package) + the ROTO-SETUP files.
#
#   scripts/github-release.sh v0.1.2            # needs GH_TOKEN (the workflow's token)
#   DRY_RUN=1 scripts/github-release.sh v0.1.1  # print notes and assets, change nothing
set -euo pipefail
tag="${1:?usage: github-release.sh <tag>}"
version="${tag#v}"
minor="${version%.*}"
pkg="$(node -p 'require("./package.json").name')"
prev="$(git describe --tags --abbrev=0 --match 'v[0-9]*' "${tag}^" 2>/dev/null || true)"
range="${prev:+${prev}..}${tag}"

[ -f dist-embed/particles-designer.js ] || npm run build:embed >/dev/null
out="$(mktemp -d)"
cp dist-embed/particles-designer.js dist-embed/particles-designer.iife.js "$out/"
for f in roto/*.json; do cp "$f" "$out/roto-$(basename "$f" .json | tr ' ' '-').json"; done

{
  echo '```html'
  echo "<script type=\"module\" src=\"https://cdn.jsdelivr.net/npm/${pkg}@${minor}/dist-embed/particles-designer.js\"></script>"
  echo '<particle-field look="galaxy-drift" style="width:100%;height:480px"></particle-field>'
  echo '```'
  echo
  echo "npm: [\`${pkg}@${version}\`](https://www.npmjs.com/package/${pkg}/v/${version}) (published with provenance) ·" \
    "[live Designer](https://rezakalfane.github.io/ParticlesDesigner/) ·" \
    "[embed docs](https://github.com/rezakalfane/ParticlesDesigner/blob/${tag}/docs/EMBED.md)"
  echo
  echo "## Changes${prev:+ since ${prev}}"
  echo
  git log --no-merges --reverse --pretty='- %s' "$range" | grep -v '^- Release ' || echo "- Maintenance release"
  echo
  echo "## Downloads"
  echo
  echo "The kit builds below are identical to the npm package; the ROTO-SETUP files go into ROTO-SETUP (MIDI channels 9–11)."
} >"$out/notes.md"

if [ -n "${DRY_RUN:-}" ]; then
  cat "$out/notes.md"
  echo "--- assets:"
  ls "$out" | grep -v notes.md
  exit 0
fi
if gh release view "$tag" >/dev/null 2>&1; then
  gh release upload "$tag" "$out"/*.js "$out"/*.json --clobber
else
  gh release create "$tag" --title "$tag" --notes-file "$out/notes.md" --verify-tag \
    "$out"/*.js "$out"/*.json
fi

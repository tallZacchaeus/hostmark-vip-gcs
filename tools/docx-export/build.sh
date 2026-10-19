#!/usr/bin/env bash
# Regenerates docs/<name>.docx from docs/<name>.md, rendering mermaid diagrams to images first.
#
#   ./build.sh                 # every docs/NN-*.md
#   ./build.sh 01-PRD 03       # only these (name, number prefix, or path)
#
# Needs: Node 20+, `npm install` run once in this folder, and Google Chrome for the diagrams
# (override the browser with CHROME_PATH=/path/to/chrome). See README.md.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCS="$(cd "$HERE/../.." && pwd)/docs"
PROJECT="VIP Guest Coordination System"

if [[ ! -d "$HERE/node_modules/docx" ]]; then
  echo "Dependencies missing. Run once:  (cd \"$HERE\" && npm install)" >&2
  exit 1
fi

# --- which docs ---
files=()
if [[ $# -eq 0 ]]; then
  for f in "$DOCS"/[0-9][0-9]-*.md; do files+=("$f"); done
else
  for arg in "$@"; do
    name="$(basename "${arg%.md}")"
    match=("$DOCS/$name"*.md)
    if [[ ! -e "${match[0]}" ]]; then echo "No doc matches '$arg' in $DOCS" >&2; exit 1; fi
    files+=("${match[@]}")
  done
fi

# --- browser for diagrams ---
CHROME="${CHROME_PATH:-}"
if [[ -n "$CHROME" && ! -x "$CHROME" ]]; then
  echo "warning: CHROME_PATH '$CHROME' is not an executable; ignoring it." >&2
  CHROME=""
elif [[ -z "$CHROME" ]]; then
  for c in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
           "$(command -v google-chrome || true)" "$(command -v chromium || true)"; do
    if [[ -n "$c" && -x "$c" ]]; then CHROME="$c"; break; fi
  done
fi
if [[ -z "$CHROME" ]]; then
  echo "warning: Chrome not found (set CHROME_PATH); diagrams will appear as code blocks." >&2
fi

WORK="$(mktemp -d "${TMPDIR:-/tmp}/docx-export.XXXXXX")"
cleanup() { [[ -n "${WORK:-}" && -d "$WORK" ]] && rm -rf "$WORK"; }
trap cleanup EXIT
cat > "$WORK/puppeteer.json" <<EOF
{ "executablePath": "$CHROME", "headless": "new", "userDataDir": "$WORK/chrome-profile",
  "args": ["--no-first-run", "--no-default-browser-check"] }
EOF

# --- build ---
for md in "${files[@]}"; do
  name="$(basename "$md" .md)"
  prefix="$WORK/${name%%-*}"
  count="$(node "$HERE/extract-mermaid.js" "$md" "$prefix")"
  if [[ -n "$CHROME" && "$count" -gt 0 ]]; then
    for ((n = 1; n <= count; n++)); do
      "$HERE/node_modules/.bin/mmdc" -i "$prefix-$n.mmd" -o "$prefix-$n.png" -s 2 -b white \
        -c "$HERE/mermaid-config.json" -p "$WORK/puppeteer.json" -q > /dev/null 2> "$prefix-$n.log" \
        || echo "warning: $name diagram $n failed to render (kept as code): $(grep -m1 -i error "$prefix-$n.log")" >&2
    done
  fi
  node "$HERE/md2docx.js" "$md" "$DOCS/$name.docx" --project "$PROJECT" --diagrams "$prefix"
done

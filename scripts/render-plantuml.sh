#!/bin/bash
# Render every PlantUML source under docs/security/diagrams/ to an SVG next to it,
# in the sibling img/ folder, so the Markdown and the published docs page can
# embed it. Needs plantuml and graphviz (brew install plantuml).
#
#   scripts/render-plantuml.sh            # render all
#   scripts/render-plantuml.sh docs/security/diagrams/ehds-operating-model.puml
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v plantuml >/dev/null || { echo "plantuml not found: brew install plantuml" >&2; exit 2; }

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(find "$ROOT/docs/security/diagrams" -name '*.puml' | sort)
fi

for src in "${files[@]}"; do
  out="$(dirname "$(dirname "$src")")/img"
  mkdir -p "$out"
  plantuml -tsvg -o "$out" "$src"
  svg="$out/$(basename "${src%.puml}").svg"
  # plantuml writes no final newline; the end-of-file hook would add one and
  # the published copy would then differ from the source.
  [ -z "$(tail -c1 "$svg")" ] || printf '\n' >> "$svg"
  printf '%s -> %s/%s.svg\n' "${src#"$ROOT"/}" "${out#"$ROOT"/}" "$(basename "${src%.puml}")"
done

#!/bin/bash
# Render every PlantUML source under docs/*/diagrams/ to an SVG next to it,
# in the sibling img/ folder, so the Markdown and the published docs page can
# embed it. Needs plantuml and graphviz (brew install plantuml).
#
#   scripts/render-plantuml.sh            # render all
#   scripts/render-plantuml.sh docs/security/diagrams/ehds-operating-model.puml
#   scripts/render-plantuml.sh docs/klarbefund/diagrams/*.puml
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
command -v plantuml >/dev/null || { echo "plantuml not found: brew install plantuml" >&2; exit 2; }

if [ "$#" -gt 0 ]; then
  files=("$@")
else
  files=()
  while IFS= read -r f; do files+=("$f"); done < <(find "$ROOT/docs" -path '*/diagrams/*.puml' -not -path '*/docs/diagrams/*' | sort)
fi

for src in "${files[@]}"; do
  # Absolute, so plantuml's -o is not taken relative to the source's folder.
  src="$(cd "$(dirname "$src")" && pwd)/$(basename "$src")"
  out="$(dirname "$(dirname "$src")")/img"
  mkdir -p "$out"
  plantuml -tsvg -o "$out" "$src"
  svg="$out/$(basename "${src%.puml}").svg"
  # plantuml writes no final newline; the end-of-file hook would add one and
  # the published copy would then differ from the source.
  [ -z "$(tail -c1 "$svg")" ] || printf '\n' >> "$svg"
  printf '%s -> %s/%s.svg\n' "${src#"$ROOT"/}" "${out#"$ROOT"/}" "$(basename "${src%.puml}")"
done

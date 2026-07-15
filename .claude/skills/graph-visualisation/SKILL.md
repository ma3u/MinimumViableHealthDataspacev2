---
name: graph-visualisation
description: Use when the user works on the force-directed graph explorer, layer colours, persona views, or node filtering.
---

# Graph explorer

Sources: `ui/src/lib/graph-constants.ts`, `ui/src/app/api/graph/route.ts`.

## Procedure

1. Read `graph-constants.ts` for `LABEL_LAYER`, `LAYER_COLORS`, `NODE_ROLE_COLORS`,
   `PERSONA_VIEWS`.
2. Layer colours are fixed: L1 `#2471A3` · L2 `#148F77` · L3 `#1E8449` ·
   L4 `#CA6F1E` · L5 `#7D3C98` (`.claude/rules/code-style.md`).
3. New node labels must be added to the `LABEL_LAYER` mapping or they render
   unstyled; new persona views go in `PERSONA_VIEWS`.
4. The Cypher feeding the explorer lives in `ui/src/app/api/graph/route.ts`.
5. Verify: `curl http://localhost:3000/api/graph?persona=<id>` and check
   node/edge counts; static mode uses `ui/public/mock/graph_<persona>.json`.

## Output contract

Every new label styled + persona views updated + matching mock graph fixture.

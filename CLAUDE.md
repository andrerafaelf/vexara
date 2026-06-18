## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Client CSS breakpoints

Standard `max-width` tiers for new responsive CSS (`client/src/styles/*.css`), chosen from the values already dominant across the codebase:
- `480px` — small phone
- `768px` — phone/tablet
- `900px` — tablet/narrow desktop
- `1100px` — desktop layout collapse (e.g. sidebars to single column)

Don't retrofit existing one-off breakpoints (e.g. 380/420/540/760/820/880px) to these values — many were tuned to specific content widths and changing them risks visual regressions. Only consolidate when two breakpoints in the *same file* target the *same effective tier* (e.g. 899px and 900px both hiding the same header section) — that's a near-duplicate bug, not an intentional tuning.

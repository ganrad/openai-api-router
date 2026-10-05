# RAPID Tool Retriever

**09-03-2026**

Shortlists candidate tools before the planner runs, so the planner prompt carries
~10 tool definitions instead of the full catalog.

**Zero runtime dependencies.** BM25, YAML subset parsing, RRF, and the LRU are all
hand-rolled.

```
user turn ──▶ [tool retriever] ──▶ shortlist of tool IDs ──▶ [resolve vs cached tools/list] ──▶ [planner] ──▶ [execution engine]
                    │                                                    │
              SKILL.md prose                              server, name, description,
              (retrieval ONLY --                          inputSchema, outputSchema
               never sent to the planner)                 (the ONLY thing the planner sees)
```

## Layout

```
agents/
  supply-chain-fullfillment-agent/
    inventory-mgmt-mcp-server/
      SKILL.md
lib/
  miniYaml.js            zero-dep YAML subset parser
  skillLoader.js         SKILL.md -> frontmatter + tools block
  bm25.js                hand-rolled BM25
  traceLogger.js         structured trace records -> logger
  toolIndexBuilder.js    index build
  toolRetriever.js       hybrid retrieval, RRF, policy, caching, trace span
  toolIndexRegistry.js   lazy load, single-flight, LRU
  gatewayEmbedder.js     embeddings routed through the RAPID gateway
  integration.example.js wiring sketch
tools/
  validateSkills.js      CI validator
  evalRetrieval.js       recall@K / MRR sweep, picks topK per app
test/
  smoke.js               51 assertions, offline
```

## SKILL.md format

Agent Skills frontmatter (`name` must equal the directory name; `description` ≤1024
chars) plus one fenced ```yaml block in the body declaring `tools:`.

| Field | Req | Purpose |
|---|---|---|
| `name` | yes | **Must match the MCP `tools/list` name exactly** — this is the join key |
| `description` | yes | What it does **and when to use it** |
| `tags` | | Facets; also lexical signal |
| `aliases` | | Words users type that aren't in the description. High ROI |
| `examples` | | Exemplar user queries — **the strongest signal**, embedded separately |
| `alwaysInclude` | | Bypasses retrieval; capped at 10/app (build-time error) |
| `destructive` | | Reported to the runtime, never suppressed from the shortlist |

`examples` matter most: descriptions are written in API voice, queries in user
voice. Embedding exemplars turns retrieval into a query↔query comparison and
scores via `max(cosine)` across them.

## Config (AI App configuration)

```yaml
toolRetrieval:
  enabled: true
  strategy: hybrid          # hybrid | lexical | semantic | none
  topK: 15
  minK: 5
  scoreFloor: 0.012
  serverCoInclusion: 2      # sibling tools per matched server
  coInclusionBudget: 4      # ADDITIVE to topK
  candidatePool: 50
  bypassBelowToolCount: 25  # small catalogs skip retrieval entirely
  expandFactor: 3
  embeddingDimensions: 512
  maxAlwaysInclude: 10
  semanticCache: { enabled: true, threshold: 0.95, max: 200 }
  fallback: { onEmptyPlan: expand }
```

`strategy: none` returns the full catalog — the A/B control.

## SKILL.md is the sole source of truth

There is no background reconciliation and no MCP round trip during index build.
The consequences are worth being explicit about:

- **A tool renamed on the MCP server** stays in the index under its old name. It
  can be shortlisted, but it is dropped when the shortlist is resolved against the
  `tools/list` cache, and that drop is logged:
  `'shortlisted tool is not in the tools/list cache -- SKILL.md may be stale; dropped'`.
  That log line, keyed by `requestId`, is your drift signal.
- **A tool added to the MCP server** but not to SKILL.md is invisible to retrieval.
- **The remedy for both** is the same: correct the SKILL.md file, then
  `POST /admin/apps/:name/reload`. Embeddings are content-hash cached, so a reload
  after editing one tool re-embeds one tool.

## Tracing

Every span goes to the logger via `TraceLogger` as a flat, serializable record with
a stable field set — `requestId`, `phase`, `app`, `startedAt`, `durationMs`,
`attributes`, `candidates` — under the message `rapid.trace`. That shape *is* the
future table schema, so persisting traces to a DB is a change inside
`traceLogger.js` only; no call site moves.

Two phases are emitted:

| Phase | When | Carries |
|---|---|---|
| `tool_index_build` | Lazy build / reload | server + tool counts, embedded vs. cached texts, index version, bytes |
| `tool_retrieval` | Every request | mode, strategy, scorers, catalog size, shortlist size, and per-tool `score` / `reason` / `lexicalRank` / `semanticRank` |

`candidates` is capped by `maxCandidates` (default 50) with `candidatesTruncated`
recording the true length.

## requestId

`requestId` threads through `registry.get()`, `buildToolIndex()`, `loadAppSkills()`,
`retriever.retrieve()`, `recordRecall()`, `invalidate()`, and every gateway
embedding call. Filtering logs by one `requestId` yields the whole story for a
single gateway request: the index build if it was cold, the retrieval span with
per-tool scores, any degradation, and the recall check.

Log lines worth knowing:

| Message | Level | Meaning |
|---|---|---|
| `tool retrieval complete` | info | mode, catalog size, shortlist size, duration |
| `planner selected a tool that was not in the shortlist` | warn | carries `shortlistMiss:true` and `missing[]` — **the correctness signal** |
| `query embedding failed -- degrading to lexical retrieval` | warn | gateway embedding problem; retrieval still served |
| `shortlisted tool is not in the tools/list cache` | warn | stale SKILL.md |
| `tool index build failed` | error | build error; not cached, next request retries |

Grep for `shortlistMiss:true`. If it never appears, `topK` can come down.

## Behavior notes

- **Embeddings are content-hash cached** per process. Vectors are unit-normalized at
  build time, so cosine is a dot product.
- **512 dimensions by default.** At 75 apps × 75 tools × ~4 vectors, 1536-dim is
  ~100 MB resident per replica; 512-dim is ~35 MB and 3× faster to score. The LRU
  (`maxResidentApps`, default 32) caps it further.
- **Semantic cache is keyed on app + index version + effective config.** Keying on
  app alone leaks a shortlist built at one `topK` into a request using another.
- **Degrades, never fails.** If the embedding call errors, retrieval falls back to
  lexical. `strategy: lexical` is a fully supported mode for deployments with no
  embedding endpoint.
- **Retrieval is stateless across turns** — current user turn only, per the current
  runtime contract.
- **Failed builds are never cached**; the next request retries.

## Commands

```bash
node test/smoke.js                                              # offline test suite
node tools/validateSkills.js ./agents                           # CI gate
node tools/evalRetrieval.js ./agents <app-name> [labels.json]   # tune topK
```

`evalRetrieval` bootstraps its query set from the `examples:` fields when no labels
file exists. That's circular — treat the absolute numbers as a ceiling; its real
value is catching regressions when descriptions change. Swap in mined query logs
(`[{ "query": "...", "expected": ["server.tool"] }]`) when you have them.

## Rollout

1. Ship with `strategy: lexical`. No embedding dependency, no gateway hop.
2. Turn on `hybrid` once the logs show where lexical misses.
3. Tune `topK` per app from `evalRetrieval` plus `shortlistMiss` frequency.

## On-Disk index shape
./agents/supply-chain-fullfillment-agent/
├── inventory-mgmt-mcp-server/
│   └── SKILL.md
├── logistics-mcp-server/
│   └── SKILL.md
└── .index/
    ├── tool-index.json # entries minus embeddings
    └── embeddings.bin # Float32 blob + offset table
'use strict';
/**
 * Hybrid tool retrieval: BM25 + embedding cosine, fused with Reciprocal Rank
 * Fusion, then a small policy layer.
 *
 * Output is a shortlist of tool IDs. The RAPID runtime resolves those IDs
 * against its cached tools/list and injects only (server, name, description,
 * inputSchema, outputSchema) into the planner prompt.
 */

const { NULL_TRACER } = require('./traceLogger');

const RRF_K = 60;

const RETRIEVAL_DEFAULTS = {
  enabled: true,
  strategy: 'hybrid',       // hybrid | lexical | semantic | none
  topK: 15,
  minK: 5,
  scoreFloor: 0.012,        // on the fused RRF score
  serverCoInclusion: 2,     // sibling tools pulled in per matched server
  coInclusionBudget: 4,     // global cap on co-included tools, ADDITIVE to topK
                            // (without this, a full fused list consumes every slot
                            //  and co-inclusion would never fire on a large catalog)
  candidatePool: 50,        // per-scorer depth before fusion
  bypassBelowToolCount: 25, // fewer tools than this -> send the whole catalog
  expandFactor: 3,          // planner-empty fallback multiplier
  semanticCache: { enabled: true, threshold: 0.95, max: 200 },
};

function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;   // vectors are pre-normalized at build time, so this is cosine
}

function normalizeQuery(q) {
  return String(q || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function rrf(rankedLists) {
  const fused = new Map();   // idx -> { score, sources }
  for (const { name, ranked } of rankedLists) {
    ranked.forEach((r, rank) => {
      const cur = fused.get(r.idx) || { score: 0, sources: {} };
      cur.score += 1 / (RRF_K + rank + 1);
      cur.sources[name] = { rank: rank + 1, raw: Number(r.score.toFixed(4)) };
      fused.set(r.idx, cur);
    });
  }
  return [...fused.entries()]
    .map(([idx, v]) => ({ idx, score: v.score, sources: v.sources }))
    .sort((a, b) => b.score - a.score);
}

class ToolRetriever {
  /**
   * @param {object}  deps
   * @param {object}  deps.embedder   { embed(text, {dimensions, requestId}) -> number[] }  routed via the RAPID gateway
   * @param {object} [deps.tracer]    TraceLogger
   * @param {object} [deps.logger]
   */
  constructor({ embedder, tracer = NULL_TRACER, logger = console } = {}) {
    this.embedder = embedder;
    this.tracer = tracer || NULL_TRACER;
    this.logger = logger;
    this._semCache = new Map();   // bucketKey -> [{ vec, shortlist, at }]
  }

  /**
   * @param {object} index    from buildToolIndex()
   * @param {string} query    current user turn only (retrieval is stateless across turns)
   * @param {object} [opts]
   * @param {string} [opts.requestId]  gateway request id, threaded into every log line and the trace span
   * @param {object} [opts.config]     toolRetrieval section of the AI App config
   * @param {boolean}[opts.expand]     widen the shortlist (planner-empty fallback)
   * @returns {Promise<{tools: object[], meta: object}>}
   */
  async retrieve(index, query, opts = {}) {
    const cfg = { ...RETRIEVAL_DEFAULTS, ...(opts.config || {}) };
    const requestId = opts.requestId || null;
    const t0 = Date.now();
    const total = index.entries.length;
    const all = () => index.entries.map(e => ({ ...e, score: null, reason: 'full_catalog' }));

    // --- bypass paths -------------------------------------------------------
    if (!cfg.enabled || cfg.strategy === 'none') {
      return this._finish(index, all(), { mode: 'disabled', total }, t0, cfg, requestId);
    }
    if (total <= cfg.bypassBelowToolCount) {
      return this._finish(index, all(), { mode: 'bypass_small_catalog', total }, t0, cfg, requestId);
    }

    const q = normalizeQuery(query);
    let K = cfg.topK;
    if (opts.expand) K = Math.min(total, K * cfg.expandFactor);

    // --- query embedding ----------------------------------------------------
    let qVec = null;
    let semanticUsable = cfg.strategy !== 'lexical' && index.semanticReady && !!this.embedder;

    if (semanticUsable) {
      try {
        qVec = await this._embedQuery(q, index, requestId);
      } catch (err) {
        this.logger.warn?.(
          { requestId, app: index.appName, err: err.message },
          'query embedding failed -- degrading to lexical retrieval'
        );
        semanticUsable = false;
      }
    }

    // Cache bucket must be keyed on the effective config AND the index version --
    // otherwise a shortlist cached at one topK is served back at another, and
    // stale entries survive a rebuild that removed tools.
    const bucketKey = `${index.appName}::${index.version}::${cfg.strategy}:${K}:${cfg.minK}:${cfg.scoreFloor}:${cfg.serverCoInclusion}:${cfg.coInclusionBudget}`;

    if (qVec && cfg.semanticCache.enabled && !opts.expand) {
      const hit = this._cacheLookup(bucketKey, qVec, cfg.semanticCache.threshold);
      if (hit) {
        return this._finish(index, hit, { mode: 'semantic_cache_hit', total }, t0, cfg, requestId);
      }
    }

    // --- scorers ------------------------------------------------------------
    const lists = [];
    if (cfg.strategy !== 'semantic') {
      lists.push({ name: 'lexical', ranked: index.bm25.search(q, cfg.candidatePool) });
    }
    if (semanticUsable && qVec) {
      const sem = index.entries
        .map((e, idx) => ({ idx, score: Math.max(...e.embeddings.map(v => dot(qVec, v))) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, cfg.candidatePool);
      lists.push({ name: 'semantic', ranked: sem });
    }

    if (!lists.length) {
      this.logger.warn?.({ requestId, app: index.appName }, 'no scorer available -- falling back to full catalog');
      return this._finish(index, all(), { mode: 'no_scorer_available', total }, t0, cfg, requestId);
    }

    const fused = rrf(lists);
    const selected = this._applyPolicy(index, fused, K, cfg);

    if (qVec && cfg.semanticCache.enabled && !opts.expand) {
      this._cacheStore(bucketKey, qVec, selected, cfg.semanticCache.max);
    }

    return this._finish(index, selected, {
      mode: opts.expand ? 'expanded' : cfg.strategy,
      total,
      scorers: lists.map(l => l.name),
    }, t0, cfg, requestId);
  }

  /** Policy: alwaysInclude -> score floor w/ minK -> server co-inclusion -> cap at K. */
  _applyPolicy(index, fused, K, cfg) {
    const picked = new Map();   // idx -> { score, reason, sources }

    index.entries.forEach((e, idx) => {
      if (e.alwaysInclude) picked.set(idx, { score: null, reason: 'always_include', sources: {} });
    });

    // Score floor, but never starve the planner: keep at least minK regardless.
    let ranked = fused.filter(f => f.score >= cfg.scoreFloor);
    if (ranked.length < cfg.minK) ranked = fused.slice(0, cfg.minK);

    for (const f of ranked) {
      if (picked.size >= K) break;
      if (!picked.has(f.idx)) picked.set(f.idx, { score: f.score, reason: 'retrieved', sources: f.sources });
    }

    // Server co-inclusion: sibling tools are usually used together
    // (lookup -> read -> write). The budget is ADDITIVE to K, because the fused
    // list will normally fill K on a large catalog and co-inclusion would
    // otherwise never fire.
    if (cfg.serverCoInclusion > 0 && cfg.coInclusionBudget > 0) {
      const fusedByIdx = new Map(fused.map(f => [f.idx, f.score]));
      const hitServers = new Set(
        [...picked.entries()]
          .filter(([, m]) => m.reason === 'retrieved')   // only servers that actually matched
          .map(([i]) => index.entries[i].server)
      );
      let budget = cfg.coInclusionBudget;
      for (const server of hitServers) {
        if (budget <= 0) break;
        let added = 0;
        const siblings = index.entries
          .map((e, idx) => ({ e, idx }))
          .filter(({ e, idx }) => e.server === server && !picked.has(idx))
          .sort((a, b) => (fusedByIdx.get(b.idx) ?? -1) - (fusedByIdx.get(a.idx) ?? -1));
        for (const { idx } of siblings) {
          if (added >= cfg.serverCoInclusion || budget <= 0) break;
          picked.set(idx, { score: fusedByIdx.get(idx) ?? null, reason: 'server_co_inclusion', sources: {} });
          added++; budget--;
        }
      }
    }

    return [...picked.entries()]
      .map(([idx, meta]) => ({ ...index.entries[idx], ...meta }))
      .sort((a, b) => (b.score ?? Infinity) - (a.score ?? Infinity));
  }

  async _embedQuery(q, index, requestId) {
    const dims = index.entries[0]?.embeddings[0]?.length || 512;
    const raw = await this.embedder.embed(q, { dimensions: dims, requestId });
    const v = Float32Array.from(raw);
    let n = 0;
    for (let i = 0; i < v.length; i++) n += v[i] * v[i];
    n = Math.sqrt(n) || 1;
    for (let i = 0; i < v.length; i++) v[i] /= n;
    return v;
  }

  _cacheLookup(bucketKey, qVec, threshold) {
    const bucket = this._semCache.get(bucketKey);
    if (!bucket) return null;
    for (const item of bucket) if (dot(qVec, item.vec) >= threshold) return item.shortlist;
    return null;
  }

  _cacheStore(bucketKey, qVec, shortlist, max) {
    if (!this._semCache.has(bucketKey)) this._semCache.set(bucketKey, []);
    const bucket = this._semCache.get(bucketKey);
    bucket.unshift({ vec: qVec, shortlist, at: Date.now() });
    if (bucket.length > max) bucket.length = max;
  }

  /** Drops every cached shortlist bucket belonging to an app (all config/index variants). */
  invalidate(appName, requestId = null) {
    let dropped = 0;
    for (const k of [...this._semCache.keys()]) {
      if (k.startsWith(`${appName}::`)) { this._semCache.delete(k); dropped++; }
    }
    if (dropped) this.logger.debug?.({ requestId, app: appName, buckets: dropped }, 'shortlist cache cleared');
  }

  /** Shapes the result, logs, and emits the trace span. */
  _finish(index, selected, meta, t0, cfg, requestId) {
    const durationMs = Date.now() - t0;
    const result = {
      // The runtime resolves these ids against its cached tools/list and injects
      // only (server, name, description, inputSchema, outputSchema) into the planner.
      tools: selected.map(t => ({
        id: t.id, server: t.server, name: t.name,
        tags: t.tags, destructive: t.destructive,   // destructive is reported, never suppressed
        score: t.score, reason: t.reason, sources: t.sources,
      })),
      meta: {
        ...meta,
        app: index.appName,
        requestId,
        indexVersion: index.version,
        shortlistSize: selected.length,
        durationMs,
      },
    };

    this.logger.info?.({
      requestId, app: index.appName, mode: meta.mode,
      catalogSize: meta.total, shortlistSize: selected.length, ms: durationMs,
    }, 'tool retrieval complete');

    // Trace span -- the primary debugging surface. When the planner picks wrong,
    // the first question is always "was the right tool even in the shortlist?"
    this.tracer.span({
      requestId,
      phase: 'tool_retrieval',
      app: index.appName,
      startedAt: t0,
      durationMs,
      attributes: {
        mode: meta.mode,
        strategy: cfg.strategy,
        scorers: meta.scorers || [],
        catalogSize: meta.total,
        shortlistSize: selected.length,
        topK: cfg.topK,
        indexVersion: index.version,
      },
      // per-tool scores with scorer attribution
      candidates: selected.map(t => ({
        id: t.id,
        score: t.score,
        reason: t.reason,
        lexicalRank: t.sources?.lexical?.rank ?? null,
        semanticRank: t.sources?.semantic?.rank ?? null,
      })),
    });

    return result;
  }

  /**
   * Correctness signal: was every tool the planner actually selected present in
   * the shortlist? Call this from the runtime after the planner returns.
   * Logged (not metered) -- grep `shortlistMiss:true` to find retrieval failures.
   */
  recordRecall({ requestId = null, appName, shortlistIds, plannedToolIds }) {
    if (!plannedToolIds?.length) return true;
    const set = new Set(shortlistIds);
    const missing = plannedToolIds.filter(id => !set.has(id));
    const covered = missing.length === 0;

    if (covered) {
      this.logger.debug?.(
        { requestId, app: appName, shortlistMiss: false, planned: plannedToolIds.length },
        'planner stayed within the shortlist'
      );
    } else {
      this.logger.warn?.(
        { requestId, app: appName, shortlistMiss: true, missing },
        'planner selected a tool that was not in the shortlist'
      );
    }
    return covered;
  }
}

module.exports = { ToolRetriever, RETRIEVAL_DEFAULTS, rrf, normalizeQuery };
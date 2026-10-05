'use strict';
/**
 * Builds the per-AI-App tool retrieval index from SKILL.md files.
 *
 * SKILL.md is the sole source of truth for retrieval. There is no MCP round trip
 * here and no drift reconciliation: if a tool is renamed on the MCP server, fix
 * the SKILL.md file and reload the app. Shortlisted tools that no longer exist in
 * the runtime's tools/list cache are simply dropped when the shortlist is
 * resolved (see integration.example.js).
 */

const { loadAppSkills, sha256 } = require('./skillLoader');
const bm25 = require('./bm25');

const DEFAULTS = {
  embeddingDimensions: 512,
  maxAlwaysInclude: 10,
};

/** github.create_issue -> "github create issue"; getStockLevel -> "get Stock Level" */
const splitIdent = s => String(s)
  .replace(/[_\-.]/g, ' ')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2');

function buildRetrievalText(serverName, tool) {
  return [
    splitIdent(tool.name),
    tool.description,
    tool.aliases.join(' '),
    tool.tags.join(' '),
    tool.examples.join(' '),
    splitIdent(serverName),
  ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function toFloat32(arr) {
  const v = arr instanceof Float32Array ? arr : Float32Array.from(arr);
  let norm = 0;
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;   // pre-normalize: cosine becomes a dot product
  return v;
}

/**
 * @param {object}   opts
 * @param {string}   opts.agentsRoot        e.g. './agents'
 * @param {string}   opts.appName
 * @param {object}   opts.embedder          { embedBatch(texts, {dimensions}) -> number[][] }  routed via RAPID gateway
 * @param {object}   opts.embeddingCache    { get(key), set(key, val) }  process-local
 * @param {object}   [opts.config]          AI App config: toolRetrieval section
 * @param {string}   [opts.requestId]       gateway request that triggered the lazy build
 * @param {object}   [opts.tracer]          TraceLogger
 * @param {object}   [opts.logger]
 */
async function buildToolIndex({
  agentsRoot, appName, embedder, embeddingCache,
  config = {}, requestId = null, tracer = null, logger = console,
}) {
  const cfg = { ...DEFAULTS, ...config };
  const t0 = Date.now();

  logger.info?.({ requestId, app: appName }, 'building tool index');

  const skills = await loadAppSkills(agentsRoot, appName, { requestId, logger });

  const entries = [];
  const pending = [];   // { entryIdx, texts, cacheKeys }

  for (const skill of skills) {
    for (const tool of skill.tools) {
      const id = `${skill.server}.${tool.name}`;
      const text = buildRetrievalText(skill.server, tool);

      // Exemplar queries are the strongest retrieval signal: they are written in
      // user voice, so query<->exemplar similarity beats query<->description.
      // Always include `text` as a floor so a tool with no examples still scores.
      const vectorSources = tool.examples.length ? [text, ...tool.examples] : [text];

      const idx = entries.length;
      entries.push({
        id,
        server: skill.server,
        name: tool.name,
        description: tool.description,
        tags: tool.tags,
        alwaysInclude: tool.alwaysInclude,
        destructive: tool.destructive,
        text,
        embeddings: [],
      });

      pending.push({
        entryIdx: idx,
        texts: vectorSources,
        cacheKeys: vectorSources.map(v => sha256(`${cfg.embeddingDimensions}:${id}:${v}`)),
      });
    }
  }

  // --- alwaysInclude budget: build-time error ---
  const always = entries.filter(e => e.alwaysInclude);
  if (always.length > cfg.maxAlwaysInclude) {
    throw new Error(
      `[${appName}] ${always.length} tools are marked alwaysInclude, exceeding the limit of ${cfg.maxAlwaysInclude}: `
      + always.map(e => e.id).join(', ')
    );
  }

  // --- embeddings: cache-first, one batched gateway call for the misses ---
  const missTexts = [];
  const missSlots = [];
  for (const p of pending) {
    p.texts.forEach((text, i) => {
      const hit = embeddingCache.get(p.cacheKeys[i]);
      if (hit) entries[p.entryIdx].embeddings.push(hit);
      else { missTexts.push(text); missSlots.push({ entryIdx: p.entryIdx, cacheKey: p.cacheKeys[i] }); }
    });
  }

  if (missTexts.length && embedder) {
    logger.debug?.({ requestId, app: appName, count: missTexts.length }, 'embedding tool texts');
    const vectors = await embedder.embedBatch(missTexts, { dimensions: cfg.embeddingDimensions, requestId });
    if (vectors.length !== missTexts.length) {
      throw new Error(`[${appName}] embedder returned ${vectors.length} vectors for ${missTexts.length} inputs`);
    }
    vectors.forEach((raw, i) => {
      const v = toFloat32(raw);
      embeddingCache.set(missSlots[i].cacheKey, v);
      entries[missSlots[i].entryIdx].embeddings.push(v);
    });
  }

  const semanticReady = entries.length > 0 && entries.every(e => e.embeddings.length > 0);

  const index = {
    appName,
    entries,
    bm25: bm25.build(entries.map(e => ({ id: e.id, text: e.text }))),
    semanticReady,
    servers: skills.map(s => s.server),
    version: sha256(skills.map(s => s.sourceHash).sort().join('|')),
    builtAt: Date.now(),
    buildMs: Date.now() - t0,
    // approximate resident footprint
    bytes: entries.reduce((n, e) => n + e.embeddings.reduce((m, v) => m + v.byteLength, 0) + e.text.length * 2, 0),
  };

  logger.info?.({
    requestId, app: appName, tools: entries.length, servers: index.servers.length,
    embedded: missTexts.length, cached: pending.length - missTexts.length,
    semanticReady, indexVersion: index.version, ms: index.buildMs, kb: Math.round(index.bytes / 1024),
  }, 'tool index built');

  tracer?.span?.({
    requestId,
    phase: 'tool_index_build',
    app: appName,
    startedAt: t0,
    durationMs: index.buildMs,
    attributes: {
      servers: index.servers.length,
      tools: entries.length,
      embeddedTexts: missTexts.length,
      cachedTexts: pending.length - missTexts.length,
      semanticReady,
      indexVersion: index.version,
      bytes: index.bytes,
    },
  });

  return index;
}

module.exports = { buildToolIndex, buildRetrievalText, splitIdent, DEFAULTS };
'use strict';
/**
 * Lazy per-app index construction with single-flight and an LRU over whole app
 * indexes.
 *
 * Sizing: ~75 apps x ~75 tools x ~4 vectors x 512 dims x 4 bytes ~= 46 MB if
 * every app is resident. The LRU caps that; each RAPID replica has its own copy
 * (process-local by design, per the N-replica topology).
 */

const { buildToolIndex } = require('./toolIndexBuilder');
const { NULL_TRACER } = require('./traceLogger');

class LruMap extends Map {
  constructor(max = 32) { super(); this.max = max; }
  get(k) {
    if (!super.has(k)) return undefined;
    const v = super.get(k);
    super.delete(k); super.set(k, v);
    return v;
  }
  set(k, v) {
    if (super.has(k)) super.delete(k);
    super.set(k, v);
    while (super.size > this.max) super.delete(super.keys().next().value);
    return this;
  }
}

class ToolIndexRegistry {
  /**
   * @param {object}   deps
   * @param {string}   deps.agentsRoot
   * @param {object}   deps.embedder       routed via the RAPID gateway
   * @param {function} deps.getAppConfig   (appName) -> AI App config
   * @param {object}  [deps.retriever]     ToolRetriever, so invalidation clears its shortlist cache too
   * @param {object}  [deps.tracer]        TraceLogger
   */
  constructor({ agentsRoot, embedder, getAppConfig, retriever, tracer = NULL_TRACER, logger = console, options = {} }) {
    this.agentsRoot = agentsRoot;
    this.embedder = embedder;
    this.getAppConfig = getAppConfig;
    this.retriever = retriever;
    this.tracer = tracer || NULL_TRACER;
    this.logger = logger;

    this.maxApps = options.maxResidentApps ?? 32;

    this._indexes = new LruMap(this.maxApps);   // appName -> Promise<index>
    this._embeddingCache = new Map();           // contentHash -> Float32Array, process-local
  }

  /**
   * Lazy build. Memoizes the PROMISE so N concurrent first requests build once.
   * @param {string} appName
   * @param {string} [requestId]  the gateway request that triggered the build
   */
  get(appName, requestId = null) {
    let p = this._indexes.get(appName);
    if (!p) {
      this.logger.debug?.({ requestId, app: appName }, 'tool index cold -- building');
      p = this._build(appName, requestId).catch(err => {
        this._indexes.delete(appName);   // never cache a failure
        this.logger.error?.({ requestId, app: appName, err: err.message }, 'tool index build failed');
        throw err;
      });
      this._indexes.set(appName, p);
    }
    return p;
  }

  async _build(appName, requestId) {
    const appCfg = (await this.getAppConfig(appName)) || {};
    return buildToolIndex({
      agentsRoot: this.agentsRoot,
      appName,
      embedder: this.embedder,
      embeddingCache: this._embeddingCache,
      config: appCfg.toolRetrieval || {},
      requestId,
      tracer: this.tracer,
      logger: this.logger,
    });
  }

  /**
   * Admin reload / fs.watch hook. Also the remedy when a SKILL.md tool name drifts
   * from the MCP server: correct the file, then reload the app.
   * Embeddings survive -- only changed text re-embeds.
   */
  invalidate(appName, requestId = null) {
    this._indexes.delete(appName);
    this.retriever?.invalidate(appName, requestId);
    this.logger.info?.({ requestId, app: appName }, 'tool index invalidated');
  }

  /** Optional: prebuild indexes so the first user of the day isn't the guinea pig. */
  async warm(appNames = [], requestId = null) {
    const results = await Promise.allSettled(appNames.map(a => this.get(a, requestId)));
    const failed = results.filter(r => r.status === 'rejected').length;
    this.logger.info?.({ requestId, apps: appNames.length, failed }, 'tool index warm complete');
    return results;
  }

  stats() {
    return {
      residentApps: this._indexes.size,
      maxApps: this.maxApps,
      embeddingCacheEntries: this._embeddingCache.size,
      embeddingCacheBytes: [...this._embeddingCache.values()].reduce((n, v) => n + v.byteLength, 0),
    };
  }
}

module.exports = { ToolIndexRegistry, LruMap };
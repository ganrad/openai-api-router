'use strict';
/**
 * Embedder that routes through the RAPID gateway (dogfooding).
 *
 * Plug your existing gateway call into `invoke`. Everything else -- batching,
 * dimension handling, retry, requestId propagation -- is here so callers stay simple.
 */

const MAX_BATCH = 96;

class GatewayEmbedder {
  /**
   * @param {object}   opts
   * @param {function} opts.invoke  async ({ model, input, dimensions, requestId }) -> number[][]
   * @param {string}  [opts.model]
   * @param {number}  [opts.dimensions]
   */
  constructor({ invoke, model = 'text-embedding-3-small', dimensions = 512, logger = console }) {
    if (typeof invoke !== 'function') throw new Error('GatewayEmbedder requires an invoke(...) function');
    this.invoke = invoke;
    this.model = model;
    this.dimensions = dimensions;
    this.logger = logger;
  }

  /** @param {object} [opts] { dimensions, requestId } */
  async embed(text, { dimensions, requestId = null } = {}) {
    const [v] = await this.embedBatch([text], { dimensions, requestId });
    return v;
  }

  /** @param {object} [opts] { dimensions, requestId } */
  async embedBatch(texts, { dimensions, requestId = null } = {}) {
    const dims = dimensions || this.dimensions;
    const out = [];
    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const chunk = texts.slice(i, i + MAX_BATCH);
      const vectors = await this._withRetry(
        () => this.invoke({ model: this.model, input: chunk, dimensions: dims, requestId }),
        requestId
      );
      if (!Array.isArray(vectors) || vectors.length !== chunk.length) {
        throw new Error(`embedder returned ${vectors?.length} vectors for ${chunk.length} inputs`);
      }
      out.push(...vectors);
    }
    return out;
  }

  async _withRetry(fn, requestId, attempts = 3) {
    let lastErr;
    for (let i = 0; i < attempts; i++) {
      try { return await fn(); }
      catch (err) {
        lastErr = err;
        if (i === attempts - 1) break;
        const backoff = 200 * Math.pow(2, i);
        this.logger.warn?.({ requestId, attempt: i + 1, err: err.message }, 'embedding call failed, retrying');
        await new Promise(r => setTimeout(r, backoff));
      }
    }
    this.logger.error?.({ requestId, err: lastErr?.message }, 'embedding call failed after retries');
    throw lastErr;
  }
}

module.exports = { GatewayEmbedder };
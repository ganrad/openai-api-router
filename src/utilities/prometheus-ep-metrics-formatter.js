'use strict';

/**
 * Prometheus text formatter for RAPID AI Application Gateway metrics.
 *
 * IMPORTANT:
 * - Metrics are POINT-IN-TIME snapshots (reset on every scrape / endpoint invocation)
 * - Therefore all emitted metrics are GAUGES
 * - Metrics are emitted per AI application + configured endpoint
 *
 * Supported input shapes:
 *
 * Shape A (preferred):
 * {
 *   "sales-assistant": {
 *     endpoints: {
 *       "aoai-eastus-gpt4o": {
 *         successfulApiCalls: 100,
 *         failedApiCalls: 4,
 *         throttledApiCalls: 2,
 *         filteredApiCalls: 1,
 *         totalApiCalls: 107,
 *         totalInputTokensK: 12.4,
 *         totalOutputTokensK: 30.8,
 *         totalCachedTokensK: 7.1,
 *         totalTokensK: 50.3,
 *         inputTokenCost: 0.19,
 *         outputTokenCost: 0.73,
 *         cachedTokenCost: 0.02,
 *         totalTokenCost: 0.94
 *       },
 *       "aoai-westus-gpt4o-mini": {
 *         ...
 *       }
 *     }
 *   }
 * }
 *
 * Shape B:
 * [
 *   {
 *     appName: "sales-assistant",
 *     endpoints: [
 *       {
 *         endpointId: "aoai-eastus-gpt4o",
 *         successfulApiCalls: 100,
 *         ...
 *       }
 *     ]
 *   }
 * ]
 *
 * Shape C (map of app -> map of endpoint -> metrics):
 * {
 *   "sales-assistant": {
 *     "aoai-eastus-gpt4o": { ... },
 *     "aoai-westus-gpt4o-mini": { ... }
 *   }
 * }
 */
class PrometheusEpMetricsFormatter {
  static CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

  constructor(options = {}) {
    this.namespace = this.#sanitizeMetricName(options.namespace || 'rapid');
    this.subsystem = this.#sanitizeMetricName(options.subsystem || 'ai_application_gateway');
    this.staticLabels = options.staticLabels || {};
    this.emitApplicationRollups = options.emitApplicationRollups !== false; // default true
  }

  /**
   * Convert metrics snapshot to Prometheus text format.
   * @param {Array|Object} snapshot
   * @returns {string}
   */
  format(snapshot) {
    const normalizedApps = this.#normalizeSnapshot(snapshot);
    const lines = [];

    this.#writeMetricDefinitions(lines);

    for (const app of normalizedApps) {
      for (const endpoint of app.endpoints) {
        if (endpoint.totalApiCalls > 0 || endpoint.totalTokensK > 0)  // Only emit metrics for endpoints that have served requests
          this.#writeEndpointMetrics(lines, app.appName, endpoint);
      };

      if (this.emitApplicationRollups && app.endpoints.length > 0) {
        const rollup = this.#aggregateEndpoints(app.endpoints);
        this.#writeApplicationRollupMetrics(lines, app.appName, rollup);
      };

      if (app.cacheMetrics)
        this.#writeApplicationCacheMetrics(lines, app.appName, app.cacheMetrics);
    };

    return `${lines.join('\n')}\n`;
  }

  #writeMetricDefinitions(lines) {
    // Endpoint-level metrics
    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_api_calls'),
      'Point-in-time API calls by AI application, endpoint, outcome, and status code.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_api_calls_overall'),
      'Point-in-time total API calls by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_success_rate'),
      'Point-in-time API call success rate (successful / total) by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_error_rate'),
      'Point-in-time API call error rate (non-success / total) by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_input_tokens_thousands'),
      'Point-in-time input tokens in thousands by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_output_tokens_thousands'),
      'Point-in-time output tokens in thousands by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_cached_tokens_thousands'),
      'Point-in-time cached tokens in thousands by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_tokens_thousands'),
      'Point-in-time total tokens in thousands by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_input_token_cost_usd'),
      'Point-in-time input token cost in USD by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_output_token_cost_usd'),
      'Point-in-time output token cost in USD by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_cached_token_cost_usd'),
      'Point-in-time cached token cost in USD by AI application and endpoint.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('endpoint_token_cost_usd'),
      'Point-in-time total token cost in USD by AI application and endpoint.',
      'gauge'
    );

    // Optional app-level rollup metrics
    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_api_calls'),
      'Point-in-time API calls aggregated across all endpoints in an AI application by outcome and status code.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_api_calls_overall'),
      'Point-in-time total API calls aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_input_tokens_thousands'),
      'Point-in-time input tokens in thousands aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_output_tokens_thousands'),
      'Point-in-time output tokens in thousands aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cached_tokens_thousands'),
      'Point-in-time cached tokens in thousands aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_tokens_thousands'),
      'Point-in-time total tokens in thousands aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_input_token_cost_usd'),
      'Point-in-time input token cost in USD aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_output_token_cost_usd'),
      'Point-in-time output token cost in USD aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cached_token_cost_usd'),
      'Point-in-time cached token cost in USD aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_token_cost_usd'),
      'Point-in-time total token cost in USD aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_success_rate'),
      'Point-in-time API call success rate aggregated across all endpoints in an AI application.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_error_rate'),
      'Point-in-time API call error rate aggregated across all endpoints in an AI application.',
      'gauge'
    );

    // AI Application level cache metrics
    /**
     * NOTE:
     * - hit_rate / avg_score / avg_latency → gauge (point-in-time derived values)
     * - hits / misses → counter (monotonically increasing cumulative values)
     */
    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cache_hit_rate'),
      'Point-in-time semantic cache hit rate by AI application, cache tier, and backend.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cache_avg_score'),
      'Point-in-time semantic cache average score by AI application, cache tier, and backend.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cache_avg_latency_ms'),
      'Point-in-time semantic cache average latency in milliseconds by AI application, cache tier, and backend.',
      'gauge'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cache_hits'),
      'Cumulative semantic cache hit count by AI application, cache tier, and backend.',
      'counter'
    );

    this.#writeMetricPreamble(
      lines,
      this.#metricName('application_cache_misses'),
      'Cumulative semantic cache miss count by AI application, cache tier, and backend.',
      'counter'
    );
  }

  #writeEndpointMetrics(lines, appName, endpoint) {
    const labels = {
      ai_application: appName,
      endpoint_id: endpoint.endpointId,
    };

    this.#writeSample(
      lines,
      this.#metricName('endpoint_api_calls'),
      { ...labels, outcome: 'success', status_code: '200' },
      endpoint.successfulApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_api_calls'),
      { ...labels, outcome: 'failed', status_code: '4xx' },
      endpoint.failedApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_api_calls'),
      { ...labels, outcome: 'throttled', status_code: '429' },
      endpoint.throttledApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_api_calls'),
      { ...labels, outcome: 'filtered', status_code: '404' },
      endpoint.filteredApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_api_calls_overall'),
      labels,
      endpoint.totalApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_input_tokens_thousands'),
      labels,
      endpoint.totalInputTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_output_tokens_thousands'),
      labels,
      endpoint.totalOutputTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_cached_tokens_thousands'),
      labels,
      endpoint.totalCachedTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_tokens_thousands'),
      labels,
      endpoint.totalTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_input_token_cost_usd'),
      labels,
      endpoint.inputTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_output_token_cost_usd'),
      labels,
      endpoint.outputTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_cached_token_cost_usd'),
      labels,
      endpoint.cachedTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_token_cost_usd'),
      labels,
      endpoint.totalTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_success_rate'),
      labels,
      endpoint.successRate
    );

    this.#writeSample(
      lines,
      this.#metricName('endpoint_error_rate'),
      labels,
      endpoint.errorRate
    );
  }

  #writeApplicationRollupMetrics(lines, appName, rollup) {
    const labels = {
      ai_application: appName,
    };

    this.#writeSample(
      lines,
      this.#metricName('application_api_calls'),
      { ...labels, outcome: 'success', status_code: '200' },
      rollup.successfulApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('application_api_calls'),
      { ...labels, outcome: 'failed', status_code: '4xx' },
      rollup.failedApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('application_api_calls'),
      { ...labels, outcome: 'throttled', status_code: '429' },
      rollup.throttledApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('application_api_calls'),
      { ...labels, outcome: 'filtered', status_code: '404' },
      rollup.filteredApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('application_api_calls_overall'),
      labels,
      rollup.totalApiCalls
    );

    this.#writeSample(
      lines,
      this.#metricName('application_input_tokens_thousands'),
      labels,
      rollup.totalInputTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('application_output_tokens_thousands'),
      labels,
      rollup.totalOutputTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('application_cached_tokens_thousands'),
      labels,
      rollup.totalCachedTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('application_tokens_thousands'),
      labels,
      rollup.totalTokensK
    );

    this.#writeSample(
      lines,
      this.#metricName('application_input_token_cost_usd'),
      labels,
      rollup.inputTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('application_output_token_cost_usd'),
      labels,
      rollup.outputTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('application_cached_token_cost_usd'),
      labels,
      rollup.cachedTokenCost
    );

    this.#writeSample(
      lines,
      this.#metricName('application_token_cost_usd'),
      labels,
      rollup.totalTokenCost
    );

    const total =
      this.#asNumber(rollup.totalApiCalls) ||
      (
        rollup.successfulApiCalls +
        rollup.failedApiCalls +
        rollup.throttledApiCalls +
        rollup.filteredApiCalls
      );

    const nonSuccess =
      rollup.failedApiCalls +
      rollup.throttledApiCalls +
      rollup.filteredApiCalls

    const successRate = total === 0 ? 0 : rollup.successfulApiCalls / total;
    this.#writeSample(
      lines,
      this.#metricName('application_success_rate'),
      labels,
      successRate
    );

    const errorRate = total === 0 ? 0 : nonSuccess / total;
    this.#writeSample(
      lines,
      this.#metricName('application_error_rate'),
      labels,
      errorRate
    );
  }

  #writeApplicationCacheMetrics(lines, appName, cacheMetrics) {
    const cache = cacheMetrics || {};
    const tiers = this.#getCacheTierMetadata();

    for (const tier of tiers) {
      const tierMetrics = cache[tier.key] || {};

      const labels = {
        ai_application: appName,
        cache_tier: tier.key,
        cache_backend: tier.backend,
      };

      this.#writeSample(
        lines,
        this.#metricName('application_cache_hit_rate'),
        labels,
        tierMetrics.hitRate
      );

      this.#writeSample(
        lines,
        this.#metricName('application_cache_avg_score'),
        labels,
        tierMetrics.avgScore
      );

      this.#writeSample(
        lines,
        this.#metricName('application_cache_avg_latency_ms'),
        labels,
        tierMetrics.avgLatencyMs
      );

      this.#writeSample(
        lines,
        this.#metricName('application_cache_hits'),
        labels,
        tierMetrics.hits
      );

      this.#writeSample(
        lines,
        this.#metricName('application_cache_misses'),
        labels,
        tierMetrics.misses
      );
    }
  }

  #aggregateEndpoints(endpoints) {
    const agg = {
      successfulApiCalls: 0,
      failedApiCalls: 0,
      throttledApiCalls: 0,
      filteredApiCalls: 0,
      totalApiCalls: 0,
      totalInputTokensK: 0,
      totalOutputTokensK: 0,
      totalCachedTokensK: 0,
      totalTokensK: 0,
      inputTokenCost: 0,
      outputTokenCost: 0,
      cachedTokenCost: 0,
      totalTokenCost: 0,
    };

    for (const ep of endpoints) {
      agg.successfulApiCalls += this.#asNumber(ep.successfulApiCalls);
      agg.failedApiCalls += this.#asNumber(ep.failedApiCalls);
      agg.throttledApiCalls += this.#asNumber(ep.throttledApiCalls);
      agg.filteredApiCalls += this.#asNumber(ep.filteredApiCalls);
      agg.totalApiCalls += this.#asNumber(ep.totalApiCalls);
      agg.totalInputTokensK += this.#asNumber(ep.totalInputTokensK);
      agg.totalOutputTokensK += this.#asNumber(ep.totalOutputTokensK);
      agg.totalCachedTokensK += this.#asNumber(ep.totalCachedTokensK);
      agg.totalTokensK += this.#asNumber(ep.totalTokensK);
      agg.inputTokenCost += this.#asNumber(ep.inputTokenCost);
      agg.outputTokenCost += this.#asNumber(ep.outputTokenCost);
      agg.cachedTokenCost += this.#asNumber(ep.cachedTokenCost);
      agg.totalTokenCost += this.#asNumber(ep.totalTokenCost);
    }

    return agg;
  }

  #getCacheTierMetadata() {
    return [
      { key: 'level1', backend: 'memory' },
      { key: 'level2', backend: 'qdrant' },
      { key: 'level3', backend: 'postgresql_vector' },
    ];
  }

  #normalizeSnapshot(snapshot) {
    if (Array.isArray(snapshot)) {
      return snapshot.map((app, appIndex) => this.#normalizeAppArrayEntry(app, appIndex));
    }

    if (snapshot && typeof snapshot === 'object') {
      return Object.entries(snapshot).map(([appName, appValue], appIndex) =>
        this.#normalizeAppObjectEntry(appName, appValue, appIndex)
      );
    }

    throw new TypeError('Invalid metrics snapshot. Expected array or object.');
  }

  #normalizeAppArrayEntry(app, appIndex) {
    if (!app || typeof app !== 'object') {
      throw new TypeError(`Invalid application snapshot at index ${appIndex}`);
    }

    const appName = String(app.appName || app.name || `app_${appIndex}`);
    const endpoints = this.#normalizeEndpointsFromAnyShape(app.endpoints, appName);

    return { appName, endpoints };
  }

  #normalizeAppObjectEntry(appName, appValue, appIndex) {
    const safeAppName = String(appName || `app_${appIndex}`);

    if (!appValue || typeof appValue !== 'object') {
      throw new TypeError(`Invalid application metrics for "${safeAppName}"`);
    };

    // Preferred shape:
    // {
    //   endpoints: {...} or [...],
    //   cacheMetrics: {...}
    // }
    if (Object.prototype.hasOwnProperty.call(appValue, 'endpoints')) {
      return {
        appName: safeAppName,
        endpoints: this.#normalizeEndpointsFromAnyShape(appValue.endpoints, safeAppName),
        cacheMetrics: this.#normalizeCacheMetrics(
          this.#pick(appValue, ['cacheMetrics', 'aiAppCacheMetricsInfo', 'cacheInfo'])
        ),
      };
    }

    // Alternate shape:
    // appValue itself is just endpoint map
    return {
      appName: safeAppName,
      endpoints: this.#normalizeEndpointsFromAnyShape(appValue, safeAppName),
      cacheMetrics: this.#normalizeCacheMetrics(null),
    };
  }

  #normalizeCacheMetrics(raw) {
    const cache = raw && typeof raw === 'object' ? raw : {};

    const hitRates = cache.hitRates || {};
    const avgScores = cache.avgScores || {};
    const avgLatency = cache.avgLatency || {};
    const counts = cache.counts || {};

    return {
      level1: {
        hitRate: this.#asNumber(
          this.#pick(hitRates, ['l1', 'Level1', 'level1'])
        ),
        avgScore: this.#asNumber(
          this.#pick(avgScores, ['l1', 'Level1', 'level1'])
        ),
        avgLatencyMs: this.#asNumber(
          this.#pick(avgLatency, ['l1', 'Level1', 'level1'])
        ),
        hits: this.#asNumber(
          this.#pick(counts, ['l1Hits', 'level1Hits'])
        ),
        misses: this.#asNumber(
          this.#pick(counts, ['l1Misses', 'level1Misses'])
        ),
      },

      level2: {
        hitRate: this.#asNumber(
          this.#pick(hitRates, ['l2', 'Level2', 'level2'])
        ),
        avgScore: this.#asNumber(
          this.#pick(avgScores, ['l2', 'Level2', 'level2'])
        ),
        avgLatencyMs: this.#asNumber(
          this.#pick(avgLatency, ['l2', 'Level2', 'level2'])
        ),
        hits: this.#asNumber(
          this.#pick(counts, ['l2Hits', 'level2Hits'])
        ),
        misses: this.#asNumber(
          this.#pick(counts, ['l2Misses', 'level2Misses'])
        ),
      },

      level3: {
        // Note: RAPID uses pgHits / pgMisses for Level3
        hitRate: this.#asNumber(
          this.#pick(hitRates, ['l3', 'Level3', 'level3', 'pg'])
        ),
        avgScore: this.#asNumber(
          this.#pick(avgScores, ['l3', 'Level3', 'level3', 'pg'])
        ),
        avgLatencyMs: this.#asNumber(
          this.#pick(avgLatency, ['l3', 'Level3', 'level3', 'pg'])
        ),
        hits: this.#asNumber(
          this.#pick(counts, ['pgHits', 'l3Hits', 'level3Hits'])
        ),
        misses: this.#asNumber(
          this.#pick(counts, ['pgMisses', 'l3Misses', 'level3Misses'])
        ),
      },
    };
  }

  #normalizeEndpointsFromAnyShape(endpoints, appName) {
    if (!endpoints) {
      return [];
    }

    if (Array.isArray(endpoints)) {
      return endpoints.map((endpoint, idx) =>
        this.#normalizeEndpointEntry(endpoint, endpoint.endpointId || endpoint.name || `endpoint_${idx}`, appName)
      );
    }

    if (typeof endpoints === 'object') {
      return Object.entries(endpoints).map(([endpointId, endpointMetrics]) =>
        this.#normalizeEndpointEntry(endpointMetrics, endpointId, appName)
      );
    }

    throw new TypeError(`Invalid endpoints definition for AI application "${appName}"`);
  }

  #normalizeEndpointEntry(entry, endpointId, appName) {
    if (!entry || typeof entry !== 'object') {
      throw new TypeError(`Invalid endpoint metrics for AI application "${appName}", endpoint "${endpointId}"`);
    }

    return {
      endpointId: String(endpointId),

      successfulApiCalls: this.#pick(entry, ['successfulApiCalls', 'successApiCalls', 'apiCalls200']),
      failedApiCalls: this.#pick(entry, ['failedApiCalls', 'clientErrorApiCalls', 'apiCalls4xx']),
      throttledApiCalls: this.#pick(entry, ['throttledApiCalls', 'apiCalls429']),
      filteredApiCalls: this.#pick(entry, ['filteredApiCalls', 'apiCalls404']),
      totalApiCalls: this.#pick(entry, ['totalApiCalls', 'apiCallsTotal']),

      successRate: this.#pick(entry, ['successRate']),
      errorRate: this.#pick(entry, ['errorRate']),

      totalInputTokensK: this.#pick(entry, ['totalInputTokensK', 'inputTokensK']),
      totalOutputTokensK: this.#pick(entry, ['totalOutputTokensK', 'outputTokensK']),
      totalCachedTokensK: this.#pick(entry, ['totalCachedTokensK', 'cachedTokensK']),
      totalTokensK: this.#pick(entry, ['totalTokensK', 'tokensK']),

      inputTokenCost: this.#pick(entry, ['inputTokenCost', 'inputCost']),
      outputTokenCost: this.#pick(entry, ['outputTokenCost', 'outputCost']),
      cachedTokenCost: this.#pick(entry, ['cachedTokenCost', 'cachedCost']),
      totalTokenCost: this.#pick(entry, ['totalTokenCost', 'tokenCostTotal', 'totalCost']),
    };
  }

  #pick(obj, keys) {
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        return obj[key];
      }
    }
    return 0;
  }

  #metricName(name) {
    return `${this.namespace}_${this.subsystem}_${this.#sanitizeMetricName(name)}`;
  }

  #writeMetricPreamble(lines, metricName, help, type) {
    lines.push(`# HELP ${metricName} ${this.#escapeHelp(help)}`);
    lines.push(`# TYPE ${metricName} ${type}`);
  }

  #writeSample(lines, metricName, labels, value) {
    const mergedLabels = { ...this.staticLabels, ...labels };
    const labelString = this.#formatLabels(mergedLabels);
    lines.push(`${metricName}${labelString} ${this.#formatNumber(value)}`);
  }

  #formatLabels(labels) {
    const keys = Object.keys(labels).filter(
      (k) => labels[k] !== undefined && labels[k] !== null && labels[k] !== ''
    );

    if (keys.length === 0) {
      return '';
    }

    const parts = [];
    for (const key of keys.sort()) {
      const safeKey = this.#sanitizeLabelName(key);
      const safeValue = this.#escapeLabelValue(String(labels[key]));
      parts.push(`${safeKey}="${safeValue}"`);
    }

    return `{${parts.join(',')}}`;
  }

  #sanitizeMetricName(name) {
    return String(name)
      .trim()
      .replace(/[^a-zA-Z0-9_:]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^([^a-zA-Z_:])/, '_$1');
  }

  #sanitizeLabelName(name) {
    return String(name)
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^([^a-zA-Z_])/, '_$1');
  }

  #escapeLabelValue(value) {
    return value
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n')
      .replace(/"/g, '\\"');
  }

  #escapeHelp(value) {
    return String(value)
      .replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\n');
  }

  #asNumber(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  #formatNumber(value) {
    const n = this.#asNumber(value);
    if (Number.isInteger(n)) {
      return String(n);
    }
    return n.toFixed(12).replace(/\.?0+$/, '');
  }
}

module.exports = {
  PrometheusEpMetricsFormatter,
};
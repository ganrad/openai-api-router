/**
 * Name: AppCacheMetrics
 * Description: This class is used to store AI application cache metrics.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-27-2024
 *
 * Notes:
 * ID09232025: ganrad: v2.6.0: (Bug Fixes) Minor bug fixes - missing semicolon, unnecessary initialization ...
 * ID11212025: ganrad: v2.9.5: (Enhancement) Introduced multiple levels in semantic cache - l1 (Memory), l2 (Qdrant) 
 * and l3 (PostGres). Introduced new class to store Ai App cache metrics.
*/

const { CacheLevels } = require('./app-gtwy-constants'); // ID11212025.n

class AiApplication { // ID11212025.o Important: This class is deprecated!
  #totalScore; // ID09232025.n

  constructor() {
    this.hitCount = 0; // cache hit count
    this.#totalScore = 0.0; // total score
    this.avgScore = 0.0; // average score ID09232025.n
  }

  updateCacheHitCount(score) {
    this.hitCount++;
    this.#totalScore += score;
    this.avgScore = this.#totalScore / this.hitCount;
  }
}

class CacheMetricsInfo { // ID11212025.n
  constructor() {
    // Initialize the metrics info. object
    
    this.metricsInfo = {
      l1Hits: 0,
      l1Misses: 0,
      l1Scores: 0.0,
      l2Hits: 0,
      l2Misses: 0,
      l2Scores: 0.0,
      pgHits: 0,
      pgMisses: 0,
      pgScores: 0.0,
      latencies: { 
        l1_sum: 0,
        l1_count: 0,
        l2_sum: 0,
        l2_count: 0,
        pg_sum: 0,
        Pg_count: 0  
      }
    }
  }

  updateCacheHits(level, score) {
    switch (level) {
      case CacheLevels.Level1:
        this.metricsInfo.l1Hits++;
        this.metricsInfo.l1Scores+= score;
        break;
      case CacheLevels.Level2:
        this.metricsInfo.l2Hits++;
        this.metricsInfo.l2Scores+= score;
        break;
      case CacheLevels.Level3:
        this.metricsInfo.pgHits++
        this.metricsInfo.pgScores+= score;
        break;
    };
  }

  updateCacheMisses(level) {
    switch (level) {
      case CacheLevels.Level1:
        this.metricsInfo.l1Misses++;
        break;
      case CacheLevels.Level2:
        this.metricsInfo.l2Misses++;
        break;
      case CacheLevels.Level3:
        this.metricsInfo.pgMisses++;
        break;
    };
  }

  recordLatency(layer, start) {
    const duration = Date.now() - start;
    this.metricsInfo.latencies[`${layer}_sum`] += duration;
    this.metricsInfo.latencies[`${layer}_count`] += 1;
  }

  getAvgLatency(layer) {
    const sum = this.metricsInfo.latencies[`${layer}_sum`];
    const count = this.metricsInfo.latencies[`${layer}_count`] || 1;

    return(sum/count);
  }

  getAiAppCacheMetricsInfo() {
    return {
      hitRates: {
        [CacheLevels.Level1]: this.metricsInfo.l1Hits / (this.metricsInfo.l1Hits + this.metricsInfo.l1Misses || 1),
        [CacheLevels.Level2]: this.metricsInfo.l2Hits / (this.metricsInfo.l2Hits + this.metricsInfo.l2Misses || 1),
        [CacheLevels.Level3]: this.metricsInfo.pgHits / (this.metricsInfo.pgHits + this.metricsInfo.pgMisses || 1)
      },
      avgScores: {
        [CacheLevels.Level1]: this.metricsInfo.l1Hits ? this.metricsInfo.l1Scores / this.metricsInfo.l1Hits : 0,
        [CacheLevels.Level2]: this.metricsInfo.l2Hits ? this.metricsInfo.l2Scores / this.metricsInfo.l2Hits : 0,
        [CacheLevels.Level3]: this.metricsInfo.pgHits ? this.metricsInfo.pgScores / this.metricsInfo.pgHits : 0
      },
      avgLatency: {
        [CacheLevels.Level1]: this.getAvgLatency(CacheLevels.Level1),
        [CacheLevels.Level2]: this.getAvgLatency(CacheLevels.Level2),
        [CacheLevels.Level3]: this.getAvgLatency(CacheLevels.Level3)
      },
      counts: {
        l1Hits: this.metricsInfo.l1Hits,
        l1Misses: this.metricsInfo.l1Misses,
        l2Hits: this.metricsInfo.l2Hits,
        l2Misses: this.metricsInfo.l2Misses,
        pgHits: this.metricsInfo.pgHits,
        pgMisses: this.metricsInfo.pgMisses
      }
    };
  }
}

class AppCacheMetrics {

  constructor() {
    this.cacheMetrics = new Map();
  }

  addAiApplication(aiapp) {  // Adds or updates the internal cache with ai app cache-metrics
    // let aiApplication = new AiApplication(); ID11212025.o
    // this.cacheMetrics.set(aiapp, aiApplication); ID11212025.o

    // ID11212025.sn
    let cacheMetricsInfo = new CacheMetricsInfo();
    this.cacheMetrics.set(aiapp,cacheMetricsInfo);
    // ID11212025.en
    // console.log(`**** ADD: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
  }

  updateCacheMetrics(aiapp, score) { // ID11212025.o This method is deprecated. Use the getCacheMetrics() method and update the metrics info.
    this.cacheMetrics.get(aiapp).updateCacheHitCount(score);
    // console.log(`**** UPDATE: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
  }

  getCacheMetrics(aiapp) {
    // console.log(`**** GET: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
    return this.cacheMetrics.get(aiapp);
  }
}

module.exports = AppCacheMetrics;
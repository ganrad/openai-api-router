/**
 * Name: AppCacheMetrics
 * Description: This class is used to store AI application cache metrics.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-27-2024
 *
 * Notes:
 * ID09232025: ganrad: v2.6.0: (Bug Fixes) Minor bug fixes - missing semicolon, unnecessary initialization ...
*/

class AiApplication {
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

class AppCacheMetrics {

  constructor() {
    this.cacheMetrics = new Map();
  }

  addAiApplication(aiapp) {  // Adds or updates the internal cache with ai app cache-metrics
    let aiApplication = new AiApplication();

    this.cacheMetrics.set(aiapp,aiApplication);
    // console.log(`**** ADD: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
  }

  updateCacheMetrics(aiapp, score) {
    this.cacheMetrics.get(aiapp).updateCacheHitCount(score);
    // console.log(`**** UPDATE: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
  }

  /**
  getCacheMetrics() {
    return Object.fromEntries(this.cacheMetrics);
  }
  */

  getCacheMetrics(aiapp) {
    // console.log(`**** GET: AI App: ${aiapp}, Metrics Map:\n${[...this.cacheMetrics.keys()]}`);
    return this.cacheMetrics.get(aiapp);
  }
}

module.exports = AppCacheMetrics;

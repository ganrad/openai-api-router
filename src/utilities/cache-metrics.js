/**
 * Name: AppCacheMetrics
 * Description: This class is used to store AI application cache metrics.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-27-2024
 *
 * Notes:
 *
*/

class AiApplication {
  #totalScore = 0;

  constructor() {
    this.hitCount = 0; // cache hit count
    this.#totalScore = 0.0; // total score
    this.avgScore = 0.0 // average score
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

  addAiApplication(aiapp) {
    let aiApplication = new AiApplication();

    this.cacheMetrics.set(aiapp,aiApplication);
  }

  updateCacheMetrics(aiapp, score) {
    this.cacheMetrics.get(aiapp).updateCacheHitCount(score);
  }

  getCacheMetrics() {
    return Object.fromEntries(this.cacheMetrics);
  }
}

module.exports = AppCacheMetrics;

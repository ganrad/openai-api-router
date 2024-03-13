/**
 * Name: CacheConfig
 * Description: This class stores the gateway global cache configuration.
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 02-20-2024
 *
 * Notes:
 *
*/
class CacheConfiguration {
  constructor(cacheResults, vectorApp, srchEngine) {
    this._cacheResults = cacheResults;
    this._embeddApp = vectorApp;
    this._srchEngine = srchEngine;
  }

  get cacheResults() {
    return this._cacheResults;
  }

  get embeddApp() {
    return this._embeddApp;
  }

  get srchEngine() {
    return this._srchEngine;
  }
}
module.exports = CacheConfiguration;

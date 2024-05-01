/**
 * Name: AzOaiEpMetrics
 * Description: This class collects AI Search API endpoint metrics and stores them in a 
 * light-weight data structure (~ Queue).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 04-25-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 *
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const Queue = require('./queue');
const { EndpointMetricsConstants } = require('./app-gtwy-constants');

class AzAiSearchEpMetrics {

  constructor(endpoint,interval,count) {
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ >= 400 < 500
    this.totalCalls = 0; // Total calls handled by this target endpoint

    // Query types
    this.textApiCalls = 0; // No. of keyword search api calls
    this.vectorApiCalls = 0; // No. of vector search api calls
    this.hyApiCalls = 0; // No. of hybrid (keyword + vector) api calls
    this.textSemApiCalls = 0; // No. of keyword + semantic api calls
    this.hySemApiCalls = 0; // No. of hybrid (keyword + vector) semantic api calls
    this.ivApiCalls = 0; // No. of iv api calls
    this.ivTextApiCalls = 0; // No. of iv + keyword api calls
    this.ivTextSemApiCalls = 0; // No. of iv + keyword + semantic api calls

    this.timeMarker = Date.now(); // Time marker used to check if endpoint is unhealthy

    if ( interval )
      this.cInterval = Number(interval); // Metrics collection interval
    else
      this.cInterval = EndpointMetricsConstants.DEF_METRICS_C_INTERVAL;

    if ( count )
      this.hStack = Number(count); // Metrics history cache count
    else
      this.hStack = EndpointMetricsConstants.DEF_METRICS_H_COUNT;
    // console.log(`\n  Endpoint:  ${this.endpoint}\n  Cache Interval (minutes): ${this.cInterval}\n  History Count: ${this.hStack}`);
    logger.log({level: "info", message: "[%s] %s.constructor():\n  Endpoint: %s\n  Cache Interval (minutes): %d\n  History Count: %d", splat: [scriptName,this.constructor.name,this.endpoint,this.cInterval,this.hStack]});

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.respTime = 0; // Average api call response time for a cInterval
    this.historyQueue = new Queue(count); // Metrics history cache (fifo queue)
  }

  isEndpointHealthy() {
    let currentTime = Date.now();

    let isAvailable = currentTime >= this.timeMarker;
    let retrySecs = isAvailable ? 0 : (this.timeMarker - currentTime) / 1000;
    return [isAvailable, retrySecs];
  }

  #updateQueryType(payload) {
     // console.log(`***** Payload= ${JSON.stringify(payload)}`);

     // 1. hybrid + semantic search
     if ( (payload.queryType === "semantic") && (payload.search) && (payload.vectorQueries) && (payload.vectorQueries[0].kind === "vector") ) {
       this.hySemApiCalls++;
       return;
     };

     // 7. search text only
     if ( payload.search && ( (payload.queryType === "simple") || (payload.queryType === "full") ) ) {
       this.textApiCalls++;
       return;
     };

     // 2. text + vector search
     if ( payload.search && payload.vectorQueries && (payload.vectorQueries[0].kind === "vector") ) {
       this.hyApiCalls++;
       return;
     };

     // 3. vector search only
     if ( payload.vectorQueries && (payload.vectorQueries[0].kind === "vector") ) {
       this.vectorApiCalls++;
       return;
     };

     // 4. integrated vector, text and semantic search
     if ( (payload.queryType === "semantic") && payload.search && payload.vectorQueries && (payload.vectorQueries[0].kind === "text") ) {
       this.ivTextSemApiCalls++;
       return;
     };

     // 8. integrated vector and text search
     if ( payload.search && payload.vectorQueries && (payload.vectorQueries[0].kind === "text") ) {
       this.ivTextApiCalls++;
       return;
     };

     // 5. integrated vector search only
     if ( payload.vectorQueries && (payload.vectorQueries[0].kind === "text") ) {
       this.ivApiCalls++;
       return;
     };

     // 6. text + semantic search
     if ( payload.search && (payload.queryType === "semantic") ) {
       this.textSemApiCalls++;
       return;
     };
  }

  updateApiCalls(body,latency) {
    this.updateMetrics();

    this.respTime += latency;
    this.apiCalls++;
    this.totalCalls++;
    this.#updateQueryType(body);
  }

  updateFailedCalls(retrySeconds) {
    this.updateMetrics();

    this.timeMarker = Date.now() + (retrySeconds * 1000);
    this.failedCalls++;
    this.totalCalls++;
  }

  updateMetrics() {
    let ctime = Date.now();

    if ( ctime > this.endTime ) {
      let sdate = new Date(this.startTime).toLocaleString();
      let latency = (this.respTime > 0) ? (this.respTime / this.apiCalls) : 0;
      
      let his_obj = {
        collectionTime: sdate,
        collectedMetrics : {
          apiCalls: this.apiCalls,
          keywordApiCalls: this.textApiCalls,
          vectorApiCalls: this.vectorApiCalls,
          hybridApiCalls: this.hyApiCalls,
          keywordSemanticApiCalls: this.textSemApiCalls,
          hybridSemanticApiCalls: this.hySemApiCalls,
          intVectorApiCalls: this.ivApiCalls,
          intKeywordVectorApiCalls: this.ivTextApiCalls,
          intKeywordVectorSemanticApiCalls: this.ivTextSemApiCalls,
          failedApiCalls: this.failedCalls,
          totalApiCalls: this.totalCalls,
	  latency: {
            avgResponseTimeMsec: latency
	  }
        }
      };
      this.historyQueue.enqueue(his_obj);

      this.apiCalls = 0;
      this.failedCalls = 0;
      this.totalCalls = 0;
      this.respTime = 0;

      this.textApiCalls = 0;
      this.vectorApiCalls = 0;
      this.hyApiCalls = 0;
      this.textSemApiCalls = 0;
      this.hySemApiCalls = 0;
      this.ivApiCalls = 0;
      this.ivTextApiCalls = 0;
      this.ivTextSemApiCalls = 0;

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  toJSON() {
    return {
      apiCalls: this.apiCalls,
      keywordApiCalls: this.textApiCalls,
      vectorApiCalls: this.vectorApiCalls,
      hybridApiCalls: this.hyApiCalls,
      keywordSemanticApiCalls: this.textSemApiCalls,
      hybridSemanticApiCalls: this.hySemApiCalls,
      intVectorApiCalls: this.ivApiCalls,
      intKeywordVectorApiCalls: this.ivTextApiCalls,
      intKeywordVectorSemanticApiCalls: this.ivTextSemApiCalls,
      failedApiCalls: this.failedCalls,
      totalApiCalls: this.totalCalls,
      history: this.historyQueue.queueItems
    };
  }
}
module.exports = AzAiSearchEpMetrics;

/**
 * Name: AzOaiEpMetrics
 * Description: This class collects OAI API endpoint metrics and stores them in a 
 * light-weight data structure (~ Queue).
 *
 * Author: Ganesh Radhakrishnan (ganrad01@gmail.com)
 * Date: 01-28-2024
 *
 * Notes:
 * ID04272024: ganrad: Centralized logging with winstonjs
 * ID05042024: ganrad: Added additional endpoint metrics - throttledApiCalls, filteredApiCalls, tokensPerMinute and requestsPerMinute
 * ID05282024: ganrad: Implemented aggregated rate limiting for model deployment endpoint
 * ID06052024: ganrad: (Enhancement) Added streaming support for Azure OpenAI Chat Completion API call
 * ID04302025: ganrad: v2.3.2: (Enhancement) Each endpoint can (optional) have a unique id ~ assistant id
 * ID04302025: ganrad: v2.3.2: (Enhancement) Track no. of user sessions/threads in each metrics collection interval
 * ID05082025: ganrad: v2.3.5: (Enhancement) Log the request id when an backend endpoint is marked as unhealthy
 * ID05122025: ganrad: v2.3.6: (Enhancement) Introduced endpoint health policy feature for AOAI and AI Model Inf. API calls
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const Queue = require('./queue');
const { EndpointMetricsConstants } = require('./app-gtwy-constants');

class AzOaiEpMetrics {
  // constructor(endpoint,interval,count) { ID05282024.o
  // constructor(endpoint, interval, count, rpm) { // ID05282024.n, ID04302025.o
  // constructor(endpoint, interval, count, rpm, id) { // ID04302025.n
  constructor(endpoint, interval, count, rpm, id, healthPolicy) { // ID04302025.n, ID05122025.n
    if ( id ) // ID04302025.n
      this.id = id; // Unique ID assistant to this endpoint

    if ( healthPolicy ) // ID05122025.n
      this.healthPolicy = healthPolicy;

    this.threads = 0; // No. of threads spawned ID04302025.n
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 429's
    this.totalCalls = 0; // Total calls handled by this target endpoint
    this.totalTokens = 0; // Total tokens processed by this target endpoint

    this.throttledCalls = 0; // Throttled (429) API calls - ID05042024.n
    this.filteredCalls = 0; // Api calls to which content filters (400) were applied - ID05042024.n

    this.timeMarker = Date.now(); // Time marker used to check if endpoint is unhealthy

    if (interval)
      this.cInterval = Number(interval); // Metrics collection interval
    else
      this.cInterval = EndpointMetricsConstants.DEF_METRICS_C_INTERVAL;

    if (count)
      this.hStack = Number(count); // Metrics history cache count
    else
      this.hStack = EndpointMetricsConstants.DEF_METRICS_H_COUNT;

    // ID05282024.sn
    this.rpmLimit = (rpm) ? Number(rpm) : 0;
    this.rpm = 0;
    this.rpmTimeMarker = Date.now();
    // ID05282024.en
    // console.log(`\n  Endpoint:  ${this.endpoint}\n  Cache Interval (minutes): ${this.cInterval}\n  History Count: ${this.hStack}`);
    logger.log({ level: "info", message: "[%s] %s.constructor():\n  ID: %s\n  Endpoint:  %s\n  Cache Interval (minutes): %d\n  History Count: %d\n  RPM Limit: %d", splat: [scriptName, this.constructor.name, (this.id ? this.id : "NA"), this.endpoint, this.cInterval, this.hStack, this.rpmLimit] }); // ID04302025.n

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.respTime = 0; // Average api call response time for a cInterval
    this.historyQueue = new Queue(count); // Metrics history cache (fifo queue)
  }

  isEndpointHealthy(reqid) { // ID05082025.n
    let currentTime = Date.now();

    let isAvailable = currentTime >= this.timeMarker;
    let retrySecs = isAvailable ? 0 : (this.timeMarker - currentTime) / 1000;

    // ID05282024.sn
    if (isAvailable && this.rpmLimit) { // Is backend endpoint throttled/busy ?
      let elapsedTime = currentTime - this.rpmTimeMarker;

      if (elapsedTime > 60000) { // elapsedTime > 1 minute == 60,000 ms
        this.rpmTimeMarker = currentTime;
        this.rpm = 0;
      }
      else if (this.rpm >= this.rpmLimit) { // proxy rate limit hit ID05082025.n (=== to >=)
        isAvailable = false;
        retrySecs = (60000 - elapsedTime) / 1000;

        logger.log({ level: "warn", message: "[%s] %s.isEndpointHealthy():\n  Request ID: %s\n  Endpoint: %s\n  RPM: %d\n  Retry After: %d\n  Message: %s", splat: [scriptName, this.constructor.name, reqid, this.endpoint, this.rpmLimit, retrySecs, "Hit max. configured RPM for this endpoint."] }); // ID05082025.n
      };
    };
    // ID05282024.en

    return [isAvailable, retrySecs];
  }

  updateUserThreads() { // ID04302025.n
    this.threads++;
  }

  // updateApiCallsAndTokens(tokens, latency) { ID04302025.o
  updateApiCallsAndTokens(tokens, latency, threadStarted) { // ID04302025.n
    this.updateMetrics();

    if ( threadStarted ) // ID04302025.n
      this.threads++;

    if (tokens) // ID06052024.n
      this.totalTokens += tokens;
      
    this.respTime += latency;
    this.apiCalls++;
    this.totalCalls++;

    this.rpm++; // ID05282024.n

    // ID05122025.sn
    if ( this.healthPolicy ) { // Has health policy been configured for this endpoint?
      if ( latency > (this.healthPolicy.latencyThresholdSeconds * 1000) )
        // The current call should succeed, but mark this endpoint as unhealthy
        this.timeMarker = Date.now() + (this.healthPolicy.retryAfterMinutes * 60 * 1000)
    };
    // ID05122025.en
  }

  // updateFailedCalls(retrySeconds) { // ID05042024.o
  updateFailedCalls(status, retrySeconds) { // ID05042024.n
    this.updateMetrics();

    this.timeMarker = Date.now() + (retrySeconds * 1000);
    this.failedCalls++;

    if (status === 429) // ID05042024.n
      this.throttledCalls++;
    else if (status === 400)
      this.filteredCalls++;

    this.totalCalls++;
  }

  updateMetrics() {
    let ctime = Date.now();

    if (ctime > this.endTime) {
      let sdate = new Date(this.startTime).toLocaleString();
      let tokens_per_call = (this.apiCalls > 0) ? (this.totalTokens / this.apiCalls) : 0;
      let latency = (this.respTime > 0) ? (this.respTime / this.apiCalls) : 0;
      let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens;

      let his_obj = {
        collectionTime: sdate,
        collectedMetrics: {
          threadCount: this.threads, // ID04302025.n
          apiCalls: this.apiCalls,
          failedApiCalls: this.failedCalls,
          throttledApiCalls: this.throttledCalls, // ID05042024.n
          filteredApiCalls: this.filteredCalls, // ID05042024.n
          totalApiCalls: this.totalCalls,
          throughput: {
            kTokensPerWindow: kTokens,
            requestsPerWindow: (kTokens * 6),
            avgTokensPerCall: tokens_per_call,
            avgRequestsPerCall: (tokens_per_call * 6) / 1000,
            tokensPerMinute: (this.totalTokens / this.cInterval), // ID05042024.n
            requestsPerMinute: (this.apiCalls / this.cInterval) // ID05042024.n
          },
          latency: {
            avgResponseTimeMsec: latency
          }
        }
      };
      this.historyQueue.enqueue(his_obj);

      this.threads = 0; // ID04302025.n
      this.apiCalls = 0;
      this.failedCalls = 0;
      this.throttledCalls = 0; // ID05042024.n
      this.filteredCalls = 0; // ID05042024.n
      this.totalCalls = 0;
      this.totalTokens = 0;
      this.respTime = 0;

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  getUniqueId() { // ID04302025.n
    return(this.id);
  }

  toJSON() {
    let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens;

    return {
      threadCount: this.threads, // ID04302025.n
      apiCalls: this.apiCalls,
      failedApiCalls: this.failedCalls,
      throttledApiCalls: this.throttledCalls, // ID05042024.n
      filteredApiCalls: this.filteredCalls, // ID05042024.n
      totalApiCalls: this.totalCalls,
      kInferenceTokens: kTokens,
      history: this.historyQueue.queueItems
    };
  }
}

module.exports = AzOaiEpMetrics;
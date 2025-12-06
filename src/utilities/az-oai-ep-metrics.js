/**
 * Name: AzOaiEpMetrics
 * Description: This class collects Az AI Foundry model/agent API endpoint metrics and stores them in an in-memory rolling 
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
 * ID07302025: ganrad: v2.4.0: (Enhancement) Updated health policy feature to mark endpoint as unhealthy when multiple (configured)
 * consecutive api calls return > 500 http status.
 * ID08252025: ganrad: v2.5.0: (Enhancement) Introduced cost tracking (/ budgeting) for models/agents deployed on Azure AI Foundry.
 * ID09152025: ganrad: v2.6.0: (Enhancement) Introduced user feedback capture for models/agents deployed on Azure AI Foundry.
 * ID11182025: ganrad: v2.9.5: (Bugfix) When no API calls are received during a time bucket, an empty metrics row was being added to the 
 * history queue. This issue has been fixed. 
 * 
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
  constructor(endpoint, interval, count, rpm, id, healthPolicy, modelInfo) { // ID04302025.n, ID05122025.n, ID08252025.n
    if ( id ) // ID04302025.n
      this.id = id; // Unique ID assigned to this endpoint

    this.modelInfo = modelInfo; // ID08252025.n

    if ( healthPolicy ) { // ID05122025.n
      this.healthPolicy = healthPolicy;
      if ( healthPolicy.maxCallsBeforeUnhealthy )
        this.maxCallAttempts = healthPolicy.maxCallsBeforeUnhealthy
      else
        this.maxCallAttempts = 1;  // Default max. call attempts
      this.callAttempts = 0;
    };

    this.threads = 0; // No. of threads spawned ID04302025.n
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 429's
    this.totalCalls = 0; // Total calls handled by this target endpoint
    this.totalTokens = 0; // Total tokens processed by this target endpoint
    this.totalCost = 0.0; // Total cost of tokens ID08252025.n
    this.feedback = 0; // No of thumbs up/down collected for this endpoint ~ model ID09152025.n

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
    logger.log({ level: "info", message: "[%s] %s.constructor():\n  Endpoint ID: %s\n  Endpoint URI:  %s\n  Model Name: %s\n  Cache Interval (minutes): %d\n  History Count: %d\n  RPM Limit: %d", splat: [scriptName, this.constructor.name, (this.id ? this.id : "NA"), this.endpoint, this.modelInfo?.modelName, this.cInterval, this.hStack, this.rpmLimit] }); // ID04302025.n, ID08252025.n

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.respTime = 0; // Average api call response time for a cInterval
    this.historyQueue = new Queue(this.hStack); // Metrics history cache (fifo queue)
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

        logger.log({ level: "warn", message: "[%s] %s.isEndpointHealthy():\n  Request ID: %s\n  Endpoint ID: %s\n  Endpoint: %s\n  RPM: %d\n  Retry After: %d\n  Message: %s", splat: [scriptName, this.constructor.name, reqid, this.id, this.endpoint, this.rpmLimit, retrySecs, "Hit max. configured RPM for this endpoint."] }); // ID05082025.n
      };
    };
    // ID05282024.en

    return [isAvailable, retrySecs];
  }

  updateUserThreads() { // ID04302025.n
    this.threads++;
  }

  #calculateTokenCost(usage) { // ID08252025.n
    let callTotalCost = 0;

    if ( ! usage ) return(callTotalCost); // Just to be safe ...

    if ( this.modelInfo ) {
      const promptTokens = usage.prompt_tokens;
      const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0;
      const completionTokens = usage.completion_tokens ?? 0;

      const promptTokensCost = ((promptTokens - cachedTokens) * this.modelInfo.tokenPriceInfo.inputTokensCostPer1k) / 1000;
      // console.log(`***** prompt token cost = [${promptTokensCost}] *****`);
      const cachedInputTokensCost = cachedTokens ? (cachedTokens * this.modelInfo.tokenPriceInfo.cachedInputTokensCostPer1k) / 1000 : 0;
      // console.log(`***** cached input token cost = [${cachedInputTokensCost}] *****`);
      const completionTokensCost = completionTokens ? (completionTokens * this.modelInfo.tokenPriceInfo.outputTokensCostPer1k) / 1000 : 0;
      // console.log(`***** completed token cost = [${completionTokensCost}] *****`);

      callTotalCost = promptTokensCost + cachedInputTokensCost + completionTokensCost;
    };

    return(callTotalCost);
  }

  // updateApiCallsAndTokens(tokens, latency) { ID04302025.o
  // updateApiCallsAndTokens(tokens, latency, threadStarted) { // ID04302025.n
  updateApiCallsAndTokens(reqid, usage, latency, threadStarted) { // ID08252025.n
    this.#updateMetrics();

    const callCost = this.#calculateTokenCost(usage);
    logger.log({ level: "debug", message: "[%s] %s.updateApiCallsAndTokens():\n  Request ID: %s\n  Endpoint ID: %s\n  Usage:\n%s\n  Token Cost: %d", splat: [scriptName, this.constructor.name, reqid, this.id, JSON.stringify(usage, null, 2), callCost] });
    const tokens = usage?.total_tokens;

    if ( threadStarted ) // ID04302025.n
      this.threads++;

    if (tokens)  { // ID06052024.n, ID08252025.n
      this.totalTokens += tokens;
      this.totalCost += callCost; 
    };
      
    this.respTime += latency;
    this.apiCalls++;
    this.totalCalls++;

    this.rpm++; // ID05282024.n

    // ID05122025.sn
    if ( this.healthPolicy ) { // Has health policy been configured for this endpoint?
      if ( latency > (this.healthPolicy.latencyThresholdSeconds * 1000) ) {
        this.callAttempts++;
        if ( this.callAttempts >= this.maxCallAttempts )
          // The current call should succeed, but mark this endpoint as unhealthy
          this.timeMarker = Date.now() + (this.healthPolicy.retryAfterMinutes * 60 * 1000);
      }
      else
        this.callAttempts = 0;
    };
    // ID05122025.en
  }

  // updateFailedCalls(retrySeconds) { // ID05042024.o
  updateFailedCalls(status, retrySeconds) { // ID05042024.n
    this.#updateMetrics();

    this.timeMarker = Date.now() + (retrySeconds * 1000);
    this.failedCalls++;

    if (status === 429) // ID05042024.n
      this.throttledCalls++;
    else if (status === 400)
      this.filteredCalls++;

    this.totalCalls++;

    // ID07302025.sn
    if ( this.healthPolicy ) { // Has health policy been configured for this endpoint?
      if ( status >= 200 && status < 500)
        this.callAttempts = 0;
      else {
        this.callAttempts++;
        if ( this.callAttempts >= this.maxCallAttempts )
          // Mark this endpoint as unhealthy for configured 'retryAfterMinutes' when 'maxCallAttempts' api calls fail!
          this.timeMarker = Date.now() + (this.healthPolicy.retryAfterMinutes * 60 * 1000);
      };
    };
    // ID07302025.en
  }

  updateFeedbackCount(counter) { // ID09152025.n
    this.#updateMetrics();

    // Update the feedback counter.  Can be +1 or -1.
    this.feedback += counter;
  }

  #updateMetrics() {
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
          totalCost: this.totalCost.toFixed(6), // ID08252025.n
          feedbackCount: this.feedback, // ID09152025.n
          throughput: {
            kTokensPerWindow: kTokens,
            // requestsPerWindow: (kTokens * 6), ID08252025.o, Not tracked
            avgTokensPerCall: tokens_per_call,
            // avgRequestsPerCall: (tokens_per_call * 6) / 1000, ID08252025.o, Not tracked
            tokensPerMinute: (this.totalTokens / this.cInterval), // ID05042024.n
            requestsPerMinute: (this.apiCalls / this.cInterval) // ID05042024.n
          },
          latency: {
            avgResponseTimeSec: (latency / 1000).toFixed(4) // ID08252025.n
          }
        }
      };
      if ( this.totalCalls > 0 ) // ID11182025.n
        this.historyQueue.enqueue(his_obj);

      this.threads = 0; // ID04302025.n
      this.apiCalls = 0;
      this.failedCalls = 0;
      this.throttledCalls = 0; // ID05042024.n
      this.filteredCalls = 0; // ID05042024.n
      this.totalCalls = 0;
      this.totalTokens = 0;
      this.respTime = 0;
      this.totalCost = 0.0; // ID08252025.n
      this.feedback = 0; // ID09152025.n

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
      totalCost: this.totalCost.toFixed(6), // ID08252025.n
      feedbackCount: this.feedback, // ID09152025.n
      history: this.historyQueue.queueItems
    };
  }
}

module.exports = AzOaiEpMetrics;
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
 * ID12182025: ganrad: v2.9.5: (Bugfix) Return k tokens in current and history queue.
 * ID04152025: ganrad: v3.0.1: (Enhancement) Added input, cached and output tokens & cost info. to the endpoint metrics data.
 * ID05132026: ganrad: v3.0.1: (Refactoring, Enhancement) Added support for returning EP metrics in Prometheus text exposition format.
 * ID05272026: ganrad: v3.0.1: (Enhancement) Introduced rate limit delay (seconds) for endpoints
 * ID06042026: ganrad: v3.0.1: (Enhancement) Introduced support for Anthropic's Messages API
 * 
*/
const path = require('path');
const scriptName = path.basename(__filename);
const logger = require('./logger');

const Queue = require('./queue');
const { EndpointMetricsConstants } = require('./app-gtwy-constants');

class EpMetricsSnapshot { // ID05132026.n
  constructor(epInstance) {
    this.epInstance = epInstance;

    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 4xx's
    this.throttledCalls = 0; // Throttled (429) API calls
    this.filteredCalls = 0; // Api calls to where content filters (400) were applied
    this.totalCalls = 0; // Total calls handled by this target endpoint

    this.totalInputTokens = 0; // Total input tokens processed by this target endpoint
    this.totalCachedTokens = 0; // Total cache read input tokens processed by this endpoint
    this.totalCacheWriteTokens = 0; // Total cache creation/write input tokens (Returned by A\ Messages API)
    this.totalOutputTokens = 0; // Total output tokens processed by this endpoint
    this.totalTokens = 0; // Total tokens processed by this target endpoint

    this.costOfInputTokens = 0.0; // Cost for input tokens for current time window
    this.costOfCachedTokens = 0.0; // Cost for cached tokens for current time window
    this.costOfOutputTokens = 0.0; // Cost for output tokens for current time window
    this.totalCost = 0.0; // Total cost of tokens
  }

  getMetricsSnapshot() {
    // API calls
    const successfulApiCalls = this.epInstance.apiCalls - this.apiCalls;
    this.apiCalls = this.epInstance.apiCalls;

    const failedApiCalls = this.epInstance.failedCalls - this.failedCalls;
    this.failedCalls = this.epInstance.failedCalls;

    const throttledApiCalls = this.epInstance.throttledCalls - this.throttledCalls;
    this.throttledCalls = this.epInstance.throttledCalls;

    const filteredApiCalls = this.epInstance.filteredCalls - this.filteredCalls;
    this.filteredCalls = this.epInstance.filteredCalls;

    const totalApiCalls = this.epInstance.totalCalls - this.totalCalls;
    this.totalCalls = this.epInstance.totalCalls;

    const successRate = (totalApiCalls === 0) ? 0 : (successfulApiCalls / totalApiCalls);
    const errorRate = (totalApiCalls === 0) ? 0 : (1 - successRate);

    // Tokens
    let totalInputTokensK = this.epInstance.totalInputTokens - this.totalInputTokens;
    totalInputTokensK = (totalInputTokensK > 0) ? (totalInputTokensK / 1000) : 0; // Convert to K
    this.totalInputTokens = this.epInstance.totalInputTokens;

    let totalOutputTokensK = this.epInstance.totalOutputTokens - this.totalOutputTokens;
    totalOutputTokensK = (totalOutputTokensK > 0) ? (totalOutputTokensK / 1000) : 0;
    this.totalOutputTokens = this.epInstance.totalOutputTokens;

    let totalCachedTokensK = this.epInstance.totalCachedTokens - this.totalCachedTokens;
    totalCachedTokensK = (totalCachedTokensK > 0) ? (totalCachedTokensK / 1000) : 0;
    this.totalCachedTokens = this.epInstance.totalCachedTokens;

    let totalTokensK = this.epInstance.totalTokens - this.totalTokens;
    totalTokensK = (totalTokensK > 0) ? (totalTokensK / 1000) : 0;
    this.totalTokens = this.epInstance.totalTokens;

    // Token costs
    const inputTokenCost = this.epInstance.costOfInputTokens - this.costOfInputTokens;
    this.costOfInputTokens = this.epInstance.costOfInputTokens;

    const outputTokenCost = this.epInstance.costOfOutputTokens - this.costOfOutputTokens;
    this.costOfOutputTokens = this.epInstance.costOfOutputTokens;

    const cachedTokenCost = this.epInstance.costOfCachedTokens - this.costOfCachedTokens;
    this.costOfCachedTokens = this.epInstance.costOfCachedTokens;

    const totalTokenCost = this.epInstance.totalCost - this.totalCost;
    this.totalCost = this.epInstance.totalCost;

    const retObject = {
      successfulApiCalls,
      failedApiCalls,
      throttledApiCalls,
      filteredApiCalls,
      totalApiCalls,
      successRate,
      errorRate,
      totalInputTokensK,
      totalOutputTokensK,
      totalCachedTokensK,
      totalTokensK,
      inputTokenCost,
      outputTokenCost,
      cachedTokenCost,
      totalTokenCost
    };
    // console.log(`*** Endpoint: ${this.epInstance.id}; Metrics: ${JSON.stringify(retObject, null, 2)}`);

    return(retObject);
  }

  resetMetricsSnapshot() {

    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 4xx's
    this.throttledCalls = 0; // Throttled (429) API calls
    this.filteredCalls = 0; // Api calls to where content filters (400) were applied
    this.totalCalls = 0; // Total calls handled by this target endpoint

    this.totalTokens = 0; // Total tokens processed by this target endpoint
    this.totalInputTokens = 0; // Total input tokens processed by this target endpoint
    this.totalCachedTokens = 0; // Total cached tokens processed by this endpoint
    this.totalCacheWriteTokens = 0; // Total cache creation input tokens processed by this endpoint
    this.totalOutputTokens = 0; // Total output tokens processed by this endpoint

    this.costOfInputTokens = 0.0; // Cost for input tokens for current time window
    this.costOfCachedTokens = 0.0; // Cost for cached tokens for current time window
    this.costOfOutputTokens = 0.0; // Cost for output tokens for current time window
    this.totalCost = 0.0; // Total cost of tokens
  }
}

class AzOaiEpMetrics {
  // constructor(endpoint,interval,count) { ID05282024.o
  // constructor(endpoint, interval, count, rpm) { // ID05282024.n, ID04302025.o
  // constructor(endpoint, interval, count, rpm, id) { // ID04302025.n
  constructor(endpoint, interval, count, id, rpm, rateLimitDelay, healthPolicy, modelInfo) { // ID04302025.n, ID05122025.n, ID08252025.n, ID05272026.n
    if (id) // ID04302025.n
      this.id = id; // Unique ID assigned to this endpoint

    this.modelInfo = modelInfo; // ID08252025.n
    this.snapshotMetrics = new EpMetricsSnapshot(this); // ID05132026.n

    if (healthPolicy) { // ID05122025.n
      this.healthPolicy = healthPolicy;
      if (healthPolicy.maxCallsBeforeUnhealthy)
        this.maxCallAttempts = healthPolicy.maxCallsBeforeUnhealthy
      else
        this.maxCallAttempts = 1;  // Default max. call attempts
      this.callAttempts = 0;
    };

    this.threads = 0; // No. of threads spawned ID04302025.n
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 4xx's
    this.totalCalls = 0; // Total calls handled by this target endpoint
    this.totalTokens = 0; // Total tokens processed by this target endpoint
    // ID04152026.sn
    this.totalInputTokens = 0; // Total input tokens processed by this target endpoint
    this.totalCachedTokens = 0; // Total cached tokens processed by this endpoint
    this.totalCacheWriteTokens = 0; // Total cache creation input tokens processed by this endpoint
    this.totalOutputTokens = 0; // Total output tokens processed by this endpoint
    this.costOfInputTokens = 0.0; // Cost for input tokens for current time window
    this.costOfCachedTokens = 0.0; // Cost for cached tokens for current time window
    this.costOfOutputTokens = 0.0; // Cost for output tokens for current time window
    // ID04152026.en
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
    this.rateLimitDelaySecs = rateLimitDelay || 60; // ID05272026.n Default rate limit delay is 1 minute ~ 60 seconds
    // console.log(`\n  Endpoint:  ${this.endpoint}\n  Cache Interval (minutes): ${this.cInterval}\n  History Count: ${this.hStack}`);
    logger.log({ level: "info", message: "[%s] %s.constructor():\n  Endpoint ID: %s\n  Endpoint URI:  %s\n  Model Name: %s\n  Cache Interval (minutes): %d\n  History Count: %d\n  RPM Limit: %d\n  Rate Limit Delay (seconds): %d", splat: [scriptName, this.constructor.name, (this.id ? this.id : "NA"), this.endpoint, this.modelInfo?.modelName, this.cInterval, this.hStack, this.rpmLimit, this.rateLimitDelaySecs] }); // ID04302025.n, ID08252025.n, ID05272026.n

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

      const delayTime = this.rateLimitDelaySecs * 1000; // convert to milli-seconds
      // if (elapsedTime > 60000) { // elapsedTime > 1 minute == 60,000 ms (Default rate limit time is 1 minute) ID05272026.o
      if (elapsedTime > delayTime) { // ID05272026.n
        this.rpmTimeMarker = currentTime;
        this.rpm = 0;
      }
      else if (this.rpm >= this.rpmLimit) { // proxy rate limit hit ID05082025.n (=== to >=)
        isAvailable = false;
        // retrySecs = (60000 - elapsedTime) / 1000; ID05272026.o
        retrySecs = (delayTime - elapsedTime) / 1000; // ID05272026.n

        // ID05272026.n Update the total, failed and throttled calls
        this.totalCalls++;
        this.failedCall++;
        this.throttledCalls++;

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

    if (!usage) return (callTotalCost); // Just to be safe ...

    const promptTokens = usage.prompt_tokens || usage.input_tokens; // ID06042026.n
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens || usage?.cache_read_input_tokens || 0; // ID06042026.n
    const cacheCreationInputTokens = usage?.cache_creation_input_tokens || 0; // ID06042026.n
    const completionTokens = usage.completion_tokens || usage.output_tokens || 0; // ID06042026.n

    // ID04152026.sn
    this.totalInputTokens += promptTokens;
    this.totalCachedTokens += cachedTokens;
    this.totalCacheWriteTokens += cacheCreationInputTokens;
    this.totalOutputTokens += completionTokens;
    // ID04152026.en

    if (this.modelInfo) {
      const promptTokensCost = ((promptTokens - cachedTokens) * this.modelInfo.tokenPriceInfo.inputTokensCostPer1k) / 1000;
      // console.log(`***** prompt token cost = [${promptTokensCost}] *****`);
      const cachedInputTokensCost = cachedTokens ? (cachedTokens * this.modelInfo.tokenPriceInfo.cachedInputTokensCostPer1k) / 1000 : 0;
      // console.log(`***** cached input token cost = [${cachedInputTokensCost}] *****`);
      const completionTokensCost = completionTokens ? (completionTokens * this.modelInfo.tokenPriceInfo.outputTokensCostPer1k) / 1000 : 0;
      // console.log(`***** completed token cost = [${completionTokensCost}] *****`);

      // ID04152026.sn
      this.costOfInputTokens += promptTokensCost;
      this.costOfCachedTokens += cachedInputTokensCost;
      this.costOfOutputTokens += completionTokensCost;
      // ID04152026.en

      callTotalCost = promptTokensCost + cachedInputTokensCost + completionTokensCost;
    };

    return (callTotalCost);
  }

  // updateApiCallsAndTokens(tokens, latency) { ID04302025.o
  // updateApiCallsAndTokens(tokens, latency, threadStarted) { // ID04302025.n
  updateApiCallsAndTokens(reqid, usage, latency, threadStarted) { // ID08252025.n
    this.#updateMetrics();

    const callCost = this.#calculateTokenCost(usage);
    logger.log({ level: "debug", message: "[%s] %s.updateApiCallsAndTokens():\n  Request ID: %s\n  Endpoint ID: %s\n  Usage:\n%s\n  Token Cost: %d", splat: [scriptName, this.constructor.name, reqid, this.id, JSON.stringify(usage, null, 2), callCost] });
    const tokens = usage?.total_tokens || (usage?.input_tokens + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0) + usage?.output_tokens) || 0; // ID06042026.n

    if (threadStarted) // ID04302025.n
      this.threads++;

    if (tokens) { // ID06052024.n, ID08252025.n
      this.totalTokens += tokens;
      this.totalCost += callCost;
    };

    this.respTime += latency;
    this.apiCalls++;
    this.totalCalls++;

    this.rpm++; // ID05282024.n

    // ID05122025.sn
    if (this.healthPolicy) { // Has health policy been configured for this endpoint?  Imp: Health policy doesn't apply to calls rate limited by AI Gateway!
      if (latency > (this.healthPolicy.latencyThresholdSeconds * 1000)) {
        this.callAttempts++;
        if (this.callAttempts >= this.maxCallAttempts)
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
    if (this.healthPolicy) { // Has health policy been configured for this endpoint?
      if (status >= 200 && status < 500)
        this.callAttempts = 0;
      else {
        this.callAttempts++;
        if (this.callAttempts >= this.maxCallAttempts)
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
      // let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens; ID120182025.o
      let kTokens = (this.totalTokens > 0) ? (this.totalTokens / 1000) : 0; // ID12182025.n

      // ID04152026.sn
      let kInpTokens = (this.totalInputTokens > 0) ? (this.totalInputTokens / 1000) : 0;
      let kCachedTokens = (this.totalCachedTokens > 0) ? (this.totalCachedTokens / 1000) : 0;
      let kOutputTokens = (this.totalOutputTokens > 0) ? (this.totalOutputTokens / 1000) : 0;
      // ID04152026.en

      let his_obj = {
        collectionTime: sdate,
        collectedMetrics: {
          threadCount: this.threads, // ID04302025.n
          apiCalls: this.apiCalls,
          failedApiCalls: this.failedCalls,
          throttledApiCalls: this.throttledCalls, // ID05042024.n
          filteredApiCalls: this.filteredCalls, // ID05042024.n
          totalApiCalls: this.totalCalls,
          // ID04152026.sn
          totalCostInputTokens: this.costOfInputTokens.toFixed(6),
          totalCostCachedTokens: this.costOfCachedTokens.toFixed(6),
          totalCostOutputTokens: this.costOfOutputTokens.toFixed(6),
          // ID04152026.en
          totalCost: this.totalCost.toFixed(6), // ID08252025.n
          feedbackCount: this.feedback, // ID09152025.n
          throughput: {
            kTokensPerWindow: kTokens,
            // ID04152026.sn
            kInpTokensWindow: kInpTokens,
            kCachedTokensWindow: kCachedTokens,
            kOutputTokensWindow: kOutputTokens,
            // ID04152026.en
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
      if (this.totalCalls > 0) // ID11182025.n
        this.historyQueue.enqueue(his_obj);

      this.threads = 0; // ID04302025.n
      this.apiCalls = 0;
      this.failedCalls = 0;
      this.throttledCalls = 0; // ID05042024.n
      this.filteredCalls = 0; // ID05042024.n
      this.totalCalls = 0;
      // ID04152026.sn
      this.totalInputTokens = 0;
      this.totalCachedTokens = 0;
      this.totalCacheWriteTokens = 0;
      this.totalOutputTokens = 0;
      // ID04152026.en
      this.totalTokens = 0;
      this.respTime = 0;
      // ID04152026.sn
      this.costOfInputTokens = 0.0;
      this.costOfCachedTokens = 0.0;
      this.costOfOutputTokens = 0.0;
      // ID04152026.en
      this.totalCost = 0.0; // ID08252025.n
      this.feedback = 0; // ID09152025.n

      this.snapshotMetrics.resetMetricsSnapshot(); // ID05132026.n

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  getUniqueId() { // ID04302025.n
    return (this.id);
  }

  toJSON() {
    // let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens; ID120182025.o
    let kTokens = (this.totalTokens > 0) ? (this.totalTokens / 1000) : 0; // ID12182025.n
    // ID04152026.sn
    let kInputTokens = (this.totalInputTokens > 0) ? (this.totalInputTokens / 1000) : 0;
    let kCachedTokens = (this.totalCachedTokens > 0) ? (this.totalCachedTokens / 1000) : 0;
    let kOutputTokens = (this.totalOutputTokens > 0) ? (this.totalOutputTokens / 1000) : 0;
    // ID04152026.en

    return {
      threadCount: this.threads, // ID04302025.n
      apiCalls: this.apiCalls,
      failedApiCalls: this.failedCalls,
      throttledApiCalls: this.throttledCalls, // ID05042024.n
      filteredApiCalls: this.filteredCalls, // ID05042024.n
      totalApiCalls: this.totalCalls,
      // ID04152026.sn
      kInputTokens,
      kCachedTokens,
      kOutputTokens,
      totalCostInputTokens: this.costOfInputTokens.toFixed(6),
      totalCostCachedTokens: this.costOfCachedTokens.toFixed(6),
      totalCostOutputTokens: this.costOfOutputTokens.toFixed(6),
      // ID04152026.en
      kInferenceTokens: kTokens,
      totalCost: this.totalCost.toFixed(6), // ID08252025.n
      feedbackCount: this.feedback, // ID09152025.n
      history: this.historyQueue.queueItems
    };
  }

  getMetricsSnapshot() { // ID05132026.n
    return(this.snapshotMetrics.getMetricsSnapshot());
  }
}

module.exports = AzOaiEpMetrics;
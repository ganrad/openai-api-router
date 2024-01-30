class Queue {
  static CINDEX_RESET_COUNT = 1000; // Cache index reset count

  constructor(itemCount) {
    this.itemCount = itemCount;

    this.items = {};
    this.fidx = 0;
    this.bidx = 0;
  }
 
  enqueue(item) {
    this.items[this.bidx] = item;
    this.bidx++;

    if ( Object.keys(this.items).length > this.itemCount )
      this.dequeue();

    if ( this.bidx >= Queue.CINDEX_RESET_COUNT )
      this.bidx = 0;

    return item;
  }

  dequeue() {
    const item = this.items[this.fidx];
    delete this.items[this.fidx];
    this.fidx++

    if ( this.fidx >= Queue.CINDEX_RESET_COUNT )
      this.fidx = 0;

    return item;
  }

  peek() {
    return this.items[this.fidx]
  }

  get queueItems() {
    return this.items;
  }
}

class EndpointMetrics {
  static DEF_METRICS_C_INTERVAL = 60; // Default metrics collection interval
  static DEF_METRICS_H_COUNT = 5; // Default metrics history count

  constructor(endpoint,interval,count) {
    this.endpoint = endpoint; // The target endpoint
    this.apiCalls = 0; // No. of successful calls
    this.failedCalls = 0; // No. of failed calls ~ 429's
    this.totalCalls = 0; // Total calls handled by this target endpoint
    this.totalTokens = 0; // Total tokens processed by this target endpoint

    if ( interval )
      this.cInterval = Number(interval); // Metrics collection interval
    else
      this.cInterval = EndpointMetrics.DEF_METRICS_C_INTERVAL;

    if ( count )
      this.hStack = Number(count); // Metrics history cache count
    else
      this.hStack = EndpointMetrics.DEF_METRICS_H_COUNT;
    console.log(`******* Interval=${this.cInterval}; HistoryCount=${this.hStack}`);

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.respTime = 0; // Average api call response time for a cInterval
    this.historyQueue = new Queue(count); // Metrics history cache (fifo queue)
  }

  updateApiCallsAndTokens(tokens, latency) {
    this.updateMetrics();

    this.totalTokens += tokens;
    this.respTime += latency;
    this.apiCalls++;
    this.totalCalls++;
  }

  updateFailedCalls() {
    this.updateMetrics();

    this.failedCalls++;
    this.totalCalls++;
  }

  updateMetrics() {
    let ctime = Date.now();

    if ( ctime > this.endTime ) {
      let sdate = new Date(this.startTime).toLocaleString();
      let tokens_per_call = (this.apiCalls > 0) ? (this.totalTokens / this.apiCalls) : 0;
      let latency = (this.respTime > 0) ? (this.respTime / this.apiCalls) : 0;
      let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens;
      
      let his_obj = {
        collectionTime: sdate,
        collectedMetrics : {
          noOfApiCalls: this.apiCalls,
          noOfFailedCalls: this.failedCalls,
	  throughput: {
            kTokensPerWindow: kTokens,
            avgTokensPerCall: tokens_per_call,
            avgRequestsPerCall: (tokens_per_call * 6) / 1000,
	  },
	  latency: {
            avgResponseTimeMsec: latency
	  }
        }
      };
      this.historyQueue.enqueue(his_obj);

      this.apiCalls = 0;
      this.failedCalls = 0;
      this.totalCalls = 0;
      this.totalTokens = 0;
      this.respTime = 0;

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  toJSON() {
    let kTokens = (this.totalTokens > 1000) ? (this.totalTokens / 1000) : this.totalTokens;

    return {
      apiCalls: this.apiCalls,
      failedCalls: this.failedCalls,
      totalCalls: this.totalCalls,
      kInferenceTokens: kTokens,
      history: this.historyQueue.queueItems
    };
  }
}
module.exports = EndpointMetrics;

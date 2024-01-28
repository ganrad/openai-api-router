class Queue {
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

    return item;
  }

  dequeue() {
    const item = this.items[this.fidx];
    delete this.items[this.fidx];
    this.fidx++

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
      this.cInterval = Number(interval);
    else
      this.cInterval = EndpointMetrics.DEF_METRICS_C_INTERVAL;

    if ( count )
      this.hStack = Number(count);
    else
      this.hStack = EndpointMetrics.DEF_METRICS_H_COUNT;

    this.startTime = Date.now();
    this.endTime = this.startTime + (this.cInterval * 60 * 1000);

    this.historyQueue = new Queue(count);
  }

  updateApiCallsAndTokens(tokens) {
    this.updateMetrics();

    this.totalTokens += tokens;
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
    console.log(`******STEP-0: ${ctime}; ${this.endTime} ****`);

    if ( ctime > this.endTime ) {
      console.log("STEP-1");

      let sdate = new Date(this.startTime).toLocaleString();
      let tokens_per_call = (this.apiCalls > 0) ? (this.totalTokens / this.apiCalls) : 0;
      console.log(`STEP-2: ${this.totalTokens}; ${this.apiCalls}; ${tokens_per_call}`);
      
      let his_obj = {
        collectionTime: sdate,
        collectedMetrics : {
          noOfApiCalls: this.apiCalls,
          noOfFailedCalls: this.failedCalls,
          tokensPerWindow: this.totalTokens,
          avgTokensPerCall: tokens_per_call
        }
      };
      this.historyQueue.enqueue(his_obj);
      console.log(`STEP-3: ${JSON.stringify(this.historyQueue.peek())}`);

      this.apiCalls = 0;
      this.failedCalls = 0;
      this.totalCalls = 0;
      this.totalTokens = 0;

      this.startTime = Date.now();
      this.endTime = this.startTime + (this.cInterval * 60 * 1000);
    };
  }

  toJSON() {
    return {
      apiCalls: this.apiCalls,
      failedCalls: this.failedCalls,
      totalCalls: this.totalCalls,
      inferenceTokens: this.totalTokens,
      history: this.historyQueue.queueItems
    };
  }
}
module.exports = EndpointMetrics;

class EndpointMetrics {
  #endpoint // The target endpoint
  #apiCalls = 0 // No. of successful calls
  #failedCalls = 0 // No. of failed calls ~ 429's
  #totalCalls = 0 // Total calls handled by this target endpoint
  #totalTokens = 0 // Total tokens processed by this target endpoint

  constructor(endpoint) {
    this.#endpoint = endpoint;
  }

  incrementApiCalls() {
    this.#apiCalls++;
  }

  incrementFailedCalls() {
    this.#failedCalls++;
  }

  incrementTotalCalls() {
    this.#totalCalls++;
  }

  get apiCalls() {
    return this.#apiCalls;
  }

  get failedCalls() {
    return this.#failedCalls;
  }

  get totalCalls() {
    return this.#totalCalls;
  }

  get apiTokens() {
    return this.#totalTokens;
  }

  set apiTokens(tokens) {
    this.#totalTokens += tokens;
  }

  toJSON() {
    return {
      endpoint: this.#endpoint,
      apiCalls: this.#apiCalls,
      failedCalls: this.#failedCalls,
      totalCalls: this.#totalCalls,
      totalTokens: this.#totalTokens
    };
  }
}
module.exports = EndpointMetrics;

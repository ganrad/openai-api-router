class EndpointMetrics {
  #endpoint // The target endpoint
  #apiCalls = 0 // No. of successful calls
  #failedCalls = 0 // No. of failed calls ~ 429's
  #totalCalls = 0 // Total calls handled by this endpoint

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

  toJSON() {
    return {
      endpoint: this.#endpoint,
      apiCalls: this.#apiCalls,
      failedCalls: this.#failedCalls,
      totalCalls: this.#totalCalls
    };
  }
}
module.exports = EndpointMetrics;
